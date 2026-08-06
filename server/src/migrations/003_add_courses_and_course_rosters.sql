-- Ejecuta este archivo UNA sola vez después de las migraciones 001 y 002.
USE asistencia_meet;

ALTER TABLE courses
  ADD COLUMN teacher_id CHAR(36) NULL AFTER id,
  ADD COLUMN course_code VARCHAR(100) NULL AFTER name,
  DROP INDEX uq_courses_name,
  ADD UNIQUE KEY uq_courses_teacher_code (teacher_id, course_code),
  ADD KEY idx_courses_teacher (teacher_id),
  ADD CONSTRAINT fk_courses_teacher
    FOREIGN KEY (teacher_id) REFERENCES users(id);

-- Asocia cursos existentes al primer docente que los haya utilizado.
UPDATE courses c
JOIN (
  SELECT course_id, MIN(teacher_id) AS teacher_id
  FROM class_sessions
  WHERE teacher_id IS NOT NULL
  GROUP BY course_id
) owner ON owner.course_id = c.id
SET c.teacher_id = owner.teacher_id,
    c.course_code = COALESCE(c.course_code, CONCAT('LEGACY-', c.id));

ALTER TABLE students
  ADD COLUMN course_id BIGINT UNSIGNED NULL AFTER teacher_id,
  ADD KEY idx_students_course (course_id),
  ADD CONSTRAINT fk_students_course
    FOREIGN KEY (course_id) REFERENCES courses(id);
