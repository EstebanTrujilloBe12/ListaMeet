const crypto = require("crypto");
const { pool, inTransaction } = require("../db");
const rosterService = require("./roster.service");
const { httpError, requiredText, mysqlDate } = require("../utils");

function normalizeParticipant(input) {
  if (!input || typeof input !== "object") throw httpError(400, "participant es obligatorio");
  return {
    id: requiredText(input.id, "participant.id", 512),
    name: requiredText(input.name, "participant.name", 255)
  };
}

function isMeetControlText(name) {
  return /(?:frame_person|visual_effects|more_vert|reencuadrar|fondos y efectos|m[aá]s opciones para|more options for)/i.test(name);
}

function number(value) { return Number(value || 0); }

async function ensureActiveSession(connection, sessionId, teacherId) {
  const [rows] = await connection.execute(
    "SELECT id FROM class_sessions WHERE id = ? AND teacher_id = ? AND status = 'active' FOR UPDATE",
    [sessionId, teacherId]
  );
  if (!rows[0]) throw httpError(409, "La clase no existe, no te pertenece o ya fue finalizada");
}

async function openInterval(connection, sessionId, courseId, person, when) {
  const student = await rosterService.findExactStudent(connection, courseId, person.name);
  await connection.execute(
    `INSERT IGNORE INTO attendance_intervals
      (class_session_id, participant_key, student_id, match_status, student_name, joined_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      sessionId,
      person.id,
      student?.id || null,
      student ? "matched" : "unmatched",
      student?.fullName || person.name,
      when
    ]
  );
}

// Revisa registros que llegaron antes de que se pudiera resolver el nombre.
// Solo cambia a "matched" si el resultado es único y exacto por palabras.
async function reconcileUnmatchedIntervals(connection, sessionId, courseId) {
  const [intervals] = await connection.execute(
    "SELECT id, student_name AS studentName FROM attendance_intervals WHERE class_session_id = ? AND student_id IS NULL",
    [sessionId]
  );
  for (const interval of intervals) {
    const student = await rosterService.findExactStudent(connection, courseId, interval.studentName);
    if (!student) continue;
    await connection.execute(
      "UPDATE attendance_intervals SET student_id = ?, match_status = 'matched' WHERE id = ? AND student_id IS NULL",
      [student.id, interval.id]
    );
  }
}

async function createClass({ courseId, meetCode, teacherId }) {
  const normalizedMeetCode = requiredText(meetCode, "meetCode", 100);
  const normalizedTeacherId = requiredText(teacherId, "teacherId", 36);
  const id = crypto.randomUUID();
  const course = await rosterService.assertCourse(normalizedTeacherId, courseId);

  await inTransaction(async (connection) => {
    await connection.execute(
      "INSERT INTO class_sessions (id, course_id, teacher_id, meet_code) VALUES (?, ?, ?, ?)",
      [id, course.id, normalizedTeacherId, normalizedMeetCode]
    );
  });
  return getClass(id, normalizedTeacherId);
}

async function listClasses(teacherId, status) {
  const normalizedTeacherId = requiredText(teacherId, "teacherId", 36);
  const validStatus = status === "active" || status === "finished" ? status : null;
  const [rows] = await pool.execute(
    `SELECT s.id, s.course_id AS courseId, c.name AS courseName, s.meet_code AS meetCode, s.status,
      s.started_at AS startedAt, s.ended_at AS endedAt
     FROM class_sessions s JOIN courses c ON c.id = s.course_id
     WHERE s.teacher_id = ? ${validStatus ? "AND s.status = ?" : ""}
     ORDER BY s.started_at DESC LIMIT 200`,
    validStatus ? [normalizedTeacherId, validStatus] : [normalizedTeacherId]
  );
  return rows;
}

async function getClass(sessionId, teacherId) {
  const normalizedTeacherId = requiredText(teacherId, "teacherId", 36);
  const [sessions] = await pool.execute(
    `SELECT s.id, s.course_id AS courseId, c.name AS courseName, s.meet_code AS meetCode, s.status,
      s.started_at AS startedAt, s.ended_at AS endedAt
     FROM class_sessions s JOIN courses c ON c.id = s.course_id
     WHERE s.id = ? AND s.teacher_id = ?`,
    [sessionId, normalizedTeacherId]
  );
  const session = sessions[0];
  if (!session) throw httpError(404, "Clase no encontrada");

  await inTransaction((connection) => reconcileUnmatchedIntervals(connection, session.id, session.courseId));

  const [attendance] = await pool.execute(
    `SELECT st.id AS studentId, st.student_code AS studentCode, st.full_name AS studentName,
        st.program AS program, st.institutional_email AS institutionalEmail,
        MIN(ai.joined_at) AS firstJoinedAt, MAX(ai.left_at) AS lastLeftAt,
        COALESCE(SUM(CASE WHEN ai.id IS NULL THEN 0 WHEN ai.left_at IS NULL
          THEN GREATEST(0, TIMESTAMPDIFF(SECOND, ai.joined_at, UTC_TIMESTAMP(3)))
          ELSE ai.total_seconds END), 0) AS connectedSeconds,
        MAX(CASE WHEN ai.id IS NOT NULL AND ai.left_at IS NULL THEN 1 ELSE 0 END) AS isConnected,
        COUNT(ai.id) AS intervals
     FROM students st
     LEFT JOIN attendance_intervals ai ON ai.student_id = st.id AND ai.class_session_id = ?
     WHERE st.teacher_id = ? AND st.course_id = ?
     GROUP BY st.id, st.student_code, st.full_name, st.program, st.institutional_email
     ORDER BY st.full_name`,
    [sessionId, normalizedTeacherId, session.courseId]
  );
  const [unmatched] = await pool.execute(
    `SELECT participant_key AS participantKey, student_name AS studentName,
        MIN(joined_at) AS firstJoinedAt, MAX(left_at) AS lastLeftAt,
        COALESCE(SUM(CASE WHEN left_at IS NULL
          THEN GREATEST(0, TIMESTAMPDIFF(SECOND, joined_at, UTC_TIMESTAMP(3)))
          ELSE total_seconds END), 0) AS connectedSeconds,
        MAX(CASE WHEN left_at IS NULL THEN 1 ELSE 0 END) AS isConnected,
        COUNT(*) AS intervals
     FROM attendance_intervals
     WHERE class_session_id = ? AND student_id IS NULL
     GROUP BY participant_key, student_name
     ORDER BY student_name`,
    [sessionId]
  );
  const [connectionRows] = await pool.execute(
    `SELECT student_id AS studentId, joined_at AS joinedAt, left_at AS leftAt,
        CASE WHEN left_at IS NULL THEN GREATEST(0, TIMESTAMPDIFF(SECOND, joined_at, UTC_TIMESTAMP(3)))
          ELSE total_seconds END AS totalSeconds
     FROM attendance_intervals
     WHERE class_session_id = ? AND student_id IS NOT NULL
     ORDER BY student_id, joined_at`,
    [sessionId]
  );
  const connectionHistory = new Map();
  for (const connection of connectionRows) {
    const history = connectionHistory.get(connection.studentId) || [];
    history.push({ ...connection, totalSeconds: number(connection.totalSeconds) });
    connectionHistory.set(connection.studentId, history);
  }

  const officialRows = attendance.map((row) => ({
    ...row,
    attended: number(row.intervals) > 0,
    isConnected: Boolean(row.isConnected),
    connectedSeconds: number(row.connectedSeconds),
    intervals: number(row.intervals),
    reconnections: Math.max(0, number(row.intervals) - 1),
    connectionHistory: connectionHistory.get(row.studentId) || []
  }));
  const unmatchedRows = unmatched.map((row) => ({
    ...row,
    attended: true,
    isConnected: Boolean(row.isConnected),
    connectedSeconds: number(row.connectedSeconds),
    intervals: number(row.intervals),
    reconnections: Math.max(0, number(row.intervals) - 1)
  }));
  return {
    ...session,
    attendance: officialRows,
    unmatched: unmatchedRows,
    statistics: {
      registered: officialRows.length,
      attended: officialRows.filter((row) => row.attended).length,
      absent: officialRows.filter((row) => !row.attended).length,
      connected: officialRows.filter((row) => row.isConnected).length + unmatchedRows.filter((row) => row.isConnected).length,
      unmatched: unmatchedRows.length
    }
  };
}

async function recordEvent({ sessionId, type, participant, occurredAt, teacherId }) {
  const normalizedSessionId = requiredText(sessionId, "sessionId", 36);
  const normalizedTeacherId = requiredText(teacherId, "teacherId", 36);
  if (type !== "join" && type !== "leave") throw httpError(400, "type debe ser join o leave");
  const person = normalizeParticipant(participant);
  if (isMeetControlText(person.name)) return;
  const when = mysqlDate(occurredAt || new Date());
  await inTransaction(async (connection) => {
    await ensureActiveSession(connection, normalizedSessionId, normalizedTeacherId);
    const [sessionRows] = await connection.execute("SELECT course_id AS courseId FROM class_sessions WHERE id = ?", [normalizedSessionId]);
    await reconcileUnmatchedIntervals(connection, normalizedSessionId, sessionRows[0].courseId);
    if (type === "join") {
      await openInterval(connection, normalizedSessionId, sessionRows[0].courseId, person, when);
      return;
    }
    await connection.execute(
      `UPDATE attendance_intervals
       SET left_at = ?, total_seconds = GREATEST(0, TIMESTAMPDIFF(SECOND, joined_at, ?))
       WHERE class_session_id = ? AND participant_key = ? AND left_at IS NULL`,
      [when, when, normalizedSessionId, person.id]
    );
  });
}

async function syncParticipants({ sessionId, participants, occurredAt, teacherId }) {
  const normalizedSessionId = requiredText(sessionId, "sessionId", 36);
  const normalizedTeacherId = requiredText(teacherId, "teacherId", 36);
  if (!Array.isArray(participants)) throw httpError(400, "participants debe ser un arreglo");
  if (participants.length > 1_000) throw httpError(400, "participants supera el límite permitido");
  const people = new Map(participants.map(normalizeParticipant).filter((person) => !isMeetControlText(person.name)).map((person) => [person.id, person]));
  const when = mysqlDate(occurredAt || new Date());
  await inTransaction(async (connection) => {
    await ensureActiveSession(connection, normalizedSessionId, normalizedTeacherId);
    const [sessionRows] = await connection.execute("SELECT course_id AS courseId FROM class_sessions WHERE id = ?", [normalizedSessionId]);
    await reconcileUnmatchedIntervals(connection, normalizedSessionId, sessionRows[0].courseId);
    const [openIntervals] = await connection.execute(
      "SELECT participant_key AS id FROM attendance_intervals WHERE class_session_id = ? AND left_at IS NULL",
      [normalizedSessionId]
    );
    const openIds = new Set(openIntervals.map((row) => row.id));
    for (const [id, person] of people) {
      if (!openIds.has(id)) await openInterval(connection, normalizedSessionId, sessionRows[0].courseId, person, when);
    }
    const departedIds = [...openIds].filter((id) => !people.has(id));
    if (departedIds.length) {
      const placeholders = departedIds.map(() => "?").join(",");
      await connection.execute(
        `UPDATE attendance_intervals
         SET left_at = ?, total_seconds = GREATEST(0, TIMESTAMPDIFF(SECOND, joined_at, ?))
         WHERE class_session_id = ? AND left_at IS NULL AND participant_key IN (${placeholders})`,
        [when, when, normalizedSessionId, ...departedIds]
      );
    }
  });
}

async function finishClass(sessionId, teacherId) {
  const normalizedSessionId = requiredText(sessionId, "sessionId", 36);
  const normalizedTeacherId = requiredText(teacherId, "teacherId", 36);
  const when = mysqlDate(new Date());
  await inTransaction(async (connection) => {
    await ensureActiveSession(connection, normalizedSessionId, normalizedTeacherId);
    await connection.execute(
      `UPDATE attendance_intervals
       SET left_at = ?, total_seconds = GREATEST(0, TIMESTAMPDIFF(SECOND, joined_at, ?))
       WHERE class_session_id = ? AND left_at IS NULL`,
      [when, when, normalizedSessionId]
    );
    await connection.execute(
      "UPDATE class_sessions SET status = 'finished', ended_at = ? WHERE id = ?",
      [when, normalizedSessionId]
    );
  });
  return getClass(normalizedSessionId, normalizedTeacherId);
}

module.exports = { createClass, listClasses, getClass, recordEvent, syncParticipants, finishClass };
