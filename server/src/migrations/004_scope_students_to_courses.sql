-- Ejecuta una sola vez después de 003_add_courses_and_course_rosters.sql.
USE asistencia_meet;

ALTER TABLE students
  ADD KEY idx_students_teacher (teacher_id),
  DROP INDEX uq_students_teacher_code,
  DROP INDEX uq_students_teacher_normalized_name,
  ADD UNIQUE KEY uq_students_course_code (course_id, student_code),
  ADD UNIQUE KEY uq_students_course_normalized_name (course_id, normalized_name);
