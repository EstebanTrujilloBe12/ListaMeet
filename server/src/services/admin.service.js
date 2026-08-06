const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { httpError, requiredText } = require("../utils");

function password(value) {
  if (typeof value !== "string" || value.length < 8) {
    throw httpError(400, "La contraseña debe tener al menos 8 caracteres");
  }
  if (value.length > 72) throw httpError(400, "La contraseña supera 72 caracteres");
  return value;
}

function userId(value) {
  return requiredText(value, "id de usuario", 36);
}

async function listUsers() {
  const [rows] = await pool.execute(
    `SELECT u.id, u.name, u.email, u.role, u.created_at AS createdAt,
        COUNT(DISTINCT c.id) AS courseCount,
        COUNT(DISTINCT s.id) AS sessionCount,
        MAX(s.started_at) AS lastActivityAt
      FROM users u
      LEFT JOIN courses c ON c.teacher_id = u.id
      LEFT JOIN class_sessions s ON s.teacher_id = u.id
      GROUP BY u.id, u.name, u.email, u.role, u.created_at
      ORDER BY u.role = 'admin' DESC, u.created_at DESC`
  );
  return rows.map((row) => ({ ...row, courseCount: Number(row.courseCount), sessionCount: Number(row.sessionCount) }));
}

async function listUserActivity(id) {
  const targetId = userId(id);
  const [users] = await pool.execute("SELECT id, name, email, role FROM users WHERE id = ?", [targetId]);
  const user = users[0];
  if (!user) throw httpError(404, "La cuenta no existe");
  const [sessions] = await pool.execute(
    `SELECT s.id, c.name AS courseName, c.course_code AS courseCode, s.meet_code AS meetCode,
        s.status, s.started_at AS startedAt, s.ended_at AS endedAt,
        (SELECT COUNT(*) FROM students st WHERE st.course_id = s.course_id) AS registered,
        (SELECT COUNT(DISTINCT ai.student_id) FROM attendance_intervals ai
          WHERE ai.class_session_id = s.id AND ai.student_id IS NOT NULL) AS attended,
        (SELECT COUNT(DISTINCT ai.participant_key) FROM attendance_intervals ai
          WHERE ai.class_session_id = s.id AND ai.student_id IS NULL) AS unmatched
      FROM class_sessions s
      JOIN courses c ON c.id = s.course_id
      WHERE s.teacher_id = ?
      ORDER BY s.started_at DESC
      LIMIT 200`,
    [targetId]
  );
  return {
    user,
    sessions: sessions.map((session) => ({
      ...session,
      registered: Number(session.registered),
      attended: Number(session.attended),
      unmatched: Number(session.unmatched)
    }))
  };
}

async function resetPassword(id, rawPassword) {
  const passwordHash = await bcrypt.hash(password(rawPassword), 12);
  const [result] = await pool.execute("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, userId(id)]);
  if (!result.affectedRows) throw httpError(404, "La cuenta no existe");
}

module.exports = { listUsers, listUserActivity, resetPassword };
