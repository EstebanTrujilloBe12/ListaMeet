const crypto = require("crypto");
const { pool, inTransaction } = require("../db");
const { httpError, normalizeName, requiredText } = require("../utils");
const { parseRoster } = require("./xlsx-roster.service");

function courseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw httpError(400, "courseId no es válido");
  return id;
}

// La comparación alternativa conserva todas las palabras y sus repeticiones;
// solo ignora su orden. No admite apodos, iniciales ni palabras adicionales.
function canonicalName(value) {
  const words = normalizeName(value).split(" ");
  // Algunas versiones del DOM de Meet duplican el texto completo del nombre.
  // Se elimina únicamente si las dos mitades son exactamente iguales palabra por palabra.
  const half = words.length / 2;
  const hasRepeatedFullName = Number.isInteger(half)
    && half > 0
    && words.slice(0, half).every((word, index) => word === words[index + half]);
  return (hasRepeatedFullName ? words.slice(0, half) : words).sort().join(" ");
}

async function assertCourse(teacherId, requestedCourseId, connection = pool) {
  const id = courseId(requestedCourseId);
  const [rows] = await connection.execute(
    "SELECT id, name, course_code AS courseCode FROM courses WHERE id = ? AND teacher_id = ?",
    [id, teacherId]
  );
  if (!rows[0]) throw httpError(404, "La clase seleccionada no existe o no te pertenece");
  return rows[0];
}

async function createCourse({ teacherId, name, courseCode, workbook }) {
  const courseName = requiredText(name, "name", 150);
  const code = requiredText(courseCode, "courseCode", 100);
  const students = parseRoster(workbook);
  const seenCodes = new Set();
  const seenNames = new Set();
  for (const student of students) {
    const normalized = normalizeName(student.fullName);
    if (seenCodes.has(student.studentCode) || seenNames.has(normalized)) {
      throw httpError(400, "El Excel tiene códigos o nombres duplicados");
    }
    seenCodes.add(student.studentCode); seenNames.add(normalized);
  }
  try {
    return await inTransaction(async (connection) => {
      const [result] = await connection.execute(
        "INSERT INTO courses (teacher_id, name, course_code) VALUES (?, ?, ?)",
        [teacherId, courseName, code]
      );
      const id = result.insertId;
      for (const student of students) {
        await connection.execute(
          `INSERT INTO students (id, teacher_id, course_id, student_code, full_name, normalized_name, program, institutional_email)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), teacherId, id, student.studentCode, student.fullName, normalizeName(student.fullName), student.program, student.institutionalEmail]
        );
      }
      return { id, name: courseName, courseCode: code, students: students.length };
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw httpError(409, "Ya existe una clase con ese ID o un estudiante duplicado");
    throw error;
  }
}

async function updateCourse({ teacherId, requestedCourseId, name, courseCode }) {
  const course = await assertCourse(teacherId, requestedCourseId);
  const courseName = requiredText(name, "name", 150);
  const code = requiredText(courseCode, "courseCode", 100);
  try {
    await pool.execute("UPDATE courses SET name = ?, course_code = ? WHERE id = ? AND teacher_id = ?", [courseName, code, course.id, teacherId]);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw httpError(409, "Ya existe una clase con ese ID");
    throw error;
  }
  return { ...course, name: courseName, courseCode: code };
}

async function deleteCourse(teacherId, requestedCourseId) {
  const course = await assertCourse(teacherId, requestedCourseId);
  await inTransaction(async (connection) => {
    const [sessions] = await connection.execute("SELECT id FROM class_sessions WHERE course_id = ? AND teacher_id = ?", [course.id, teacherId]);
    const sessionIds = sessions.map((session) => session.id);
    if (sessionIds.length) {
      const placeholders = sessionIds.map(() => "?").join(",");
      await connection.execute(`DELETE FROM attendance_intervals WHERE class_session_id IN (${placeholders})`, sessionIds);
      await connection.execute(`DELETE FROM class_sessions WHERE id IN (${placeholders})`, sessionIds);
    }
    await connection.execute("DELETE FROM students WHERE course_id = ? AND teacher_id = ?", [course.id, teacherId]);
    await connection.execute("DELETE FROM courses WHERE id = ? AND teacher_id = ?", [course.id, teacherId]);
  });
  return course;
}

async function listCourses(teacherId) {
  const [rows] = await pool.execute(
    `SELECT c.id, c.name, c.course_code AS courseCode, c.created_at AS createdAt,
        (SELECT COUNT(*) FROM students st WHERE st.course_id = c.id) AS studentCount,
        (SELECT COUNT(*) FROM class_sessions ss WHERE ss.course_id = c.id AND ss.teacher_id = ?) AS sessionCount,
        (SELECT MAX(ss.started_at) FROM class_sessions ss WHERE ss.course_id = c.id AND ss.teacher_id = ?) AS lastSessionAt
     FROM courses c WHERE c.teacher_id = ? ORDER BY c.created_at DESC`,
    [teacherId, teacherId, teacherId]
  );
  return rows.map((row) => ({ ...row, studentCount: Number(row.studentCount), sessionCount: Number(row.sessionCount) }));
}

async function listStudents(teacherId, requestedCourseId) {
  const course = await assertCourse(teacherId, requestedCourseId);
  const [rows] = await pool.execute(
    `SELECT id, student_code AS studentCode, full_name AS fullName, program,
      institutional_email AS institutionalEmail
     FROM students WHERE teacher_id = ? AND course_id = ? ORDER BY full_name`,
    [teacherId, course.id]
  );
  return { course, students: rows };
}

async function createStudent({ teacherId, courseId: requestedCourseId, studentCode, fullName, program, institutionalEmail }) {
  const course = await assertCourse(teacherId, requestedCourseId);
  const name = requiredText(fullName, "fullName", 255);
  const code = typeof studentCode === "string" && studentCode.trim() ? requiredText(studentCode, "studentCode", 32) : `MANUAL-${crypto.randomUUID().slice(0, 8)}`;
  try {
    const id = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO students (id, teacher_id, course_id, student_code, full_name, normalized_name, program, institutional_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, teacherId, course.id, code, name, normalizeName(name), requiredText(program || "No especificado", "program", 255), requiredText(institutionalEmail || "No especificado", "institutionalEmail", 254)]
    );
    return { id, studentCode: code, fullName: name, program: program || "No especificado", institutionalEmail: institutionalEmail || "No especificado" };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw httpError(409, "Ese código o nombre ya existe dentro de esta clase");
    throw error;
  }
}

async function updateStudent({ teacherId, studentId, courseId: requestedCourseId, studentCode, fullName, program, institutionalEmail }) {
  const course = await assertCourse(teacherId, requestedCourseId);
  const [existingRows] = await pool.execute(
    "SELECT course_id AS courseId FROM students WHERE id = ? AND teacher_id = ?",
    [studentId, teacherId]
  );
  if (!existingRows[0]) throw httpError(404, "Estudiante no encontrado");
  if (Number(existingRows[0].courseId) !== Number(course.id)) {
    throw httpError(409, "El estudiante pertenece a otra clase; selecciona su clase antes de editarlo");
  }
  const name = requiredText(fullName, "fullName", 255);
  const code = requiredText(studentCode, "studentCode", 32);
  try {
    const [result] = await pool.execute(
      `UPDATE students SET course_id = ?, student_code = ?, full_name = ?, normalized_name = ?, program = ?, institutional_email = ?
       WHERE id = ? AND teacher_id = ?`,
      [course.id, code, name, normalizeName(name), requiredText(program || "No especificado", "program", 255), requiredText(institutionalEmail || "No especificado", "institutionalEmail", 254), studentId, teacherId]
    );
    if (!result.affectedRows) throw httpError(404, "Estudiante no encontrado");
    return { id: studentId, studentCode: code, fullName: name, program: program || "No especificado", institutionalEmail: institutionalEmail || "No especificado" };
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw httpError(409, "Ese código o nombre ya existe dentro de esta clase");
    throw error;
  }
}

async function deleteStudent({ teacherId, studentId }) {
  const [attendanceRows] = await pool.execute(
    "SELECT COUNT(*) AS count FROM attendance_intervals WHERE student_id = ?",
    [studentId]
  );
  if (Number(attendanceRows[0].count)) {
    throw httpError(409, "No puedes eliminar este estudiante porque ya tiene asistencia registrada. Puedes editarlo o eliminar la clase completa.");
  }
  const [result] = await pool.execute("DELETE FROM students WHERE id = ? AND teacher_id = ?", [studentId, teacherId]);
  if (!result.affectedRows) throw httpError(404, "Estudiante no encontrado");
}

async function findExactStudent(connection, requestedCourseId, visibleName) {
  const normalizedName = normalizeName(visibleName);
  const [rows] = await connection.execute(
    "SELECT id, full_name AS fullName FROM students WHERE course_id = ? AND normalized_name = ? LIMIT 1",
    [courseId(requestedCourseId), normalizedName]
  );
  if (rows[0]) return rows[0];

  const [candidates] = await connection.execute(
    "SELECT id, full_name AS fullName FROM students WHERE course_id = ?",
    [courseId(requestedCourseId)]
  );
  const nameByWords = canonicalName(visibleName);
  const matches = candidates.filter((student) => canonicalName(student.fullName) === nameByWords);
  return matches.length === 1 ? matches[0] : null;
}

module.exports = { assertCourse, createCourse, updateCourse, deleteCourse, listCourses, listStudents, createStudent, updateStudent, deleteStudent, findExactStudent };
