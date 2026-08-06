-- Ejecuta este archivo UNA sola vez después de 001_add_users_auth.sql.
USE asistencia_meet;

CREATE TABLE IF NOT EXISTS default_roster (
  student_code VARCHAR(32) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) NOT NULL,
  program VARCHAR(255) NOT NULL,
  institutional_email VARCHAR(254) NOT NULL,
  PRIMARY KEY (student_code),
  UNIQUE KEY uq_default_roster_normalized_name (normalized_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS students (
  id CHAR(36) NOT NULL,
  teacher_id CHAR(36) NOT NULL,
  student_code VARCHAR(32) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) NOT NULL,
  program VARCHAR(255) NOT NULL,
  institutional_email VARCHAR(254) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_students_teacher_code (teacher_id, student_code),
  UNIQUE KEY uq_students_teacher_normalized_name (teacher_id, normalized_name),
  CONSTRAINT fk_students_teacher
    FOREIGN KEY (teacher_id) REFERENCES users(id)
) ENGINE=InnoDB;

ALTER TABLE attendance_intervals
  ADD COLUMN student_id CHAR(36) NULL AFTER participant_key,
  ADD COLUMN match_status ENUM('matched', 'unmatched') NOT NULL DEFAULT 'unmatched' AFTER student_id,
  ADD KEY idx_intervals_student (student_id),
  ADD CONSTRAINT fk_intervals_student
    FOREIGN KEY (student_id) REFERENCES students(id);
