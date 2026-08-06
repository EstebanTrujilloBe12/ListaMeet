CREATE DATABASE IF NOT EXISTS asistencia_meet
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE asistencia_meet;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS courses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  teacher_id CHAR(36) NOT NULL,
  name VARCHAR(150) NOT NULL,
  course_code VARCHAR(100) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_courses_teacher_code (teacher_id, course_code),
  KEY idx_courses_teacher (teacher_id),
  CONSTRAINT fk_courses_teacher
    FOREIGN KEY (teacher_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS students (
  id CHAR(36) NOT NULL,
  teacher_id CHAR(36) NOT NULL,
  course_id BIGINT UNSIGNED NOT NULL,
  student_code VARCHAR(32) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) NOT NULL,
  program VARCHAR(255) NOT NULL,
  institutional_email VARCHAR(254) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_students_course_code (course_id, student_code),
  UNIQUE KEY uq_students_course_normalized_name (course_id, normalized_name),
  KEY idx_students_teacher (teacher_id),
  KEY idx_students_course (course_id),
  CONSTRAINT fk_students_teacher
    FOREIGN KEY (teacher_id) REFERENCES users(id),
  CONSTRAINT fk_students_course
    FOREIGN KEY (course_id) REFERENCES courses(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS class_sessions (
  id CHAR(36) NOT NULL,
  course_id BIGINT UNSIGNED NOT NULL,
  teacher_id CHAR(36) NOT NULL,
  meet_code VARCHAR(100) NOT NULL,
  status ENUM('active', 'finished') NOT NULL DEFAULT 'active',
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ended_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_class_sessions_status (status, started_at),
  KEY idx_class_sessions_teacher (teacher_id, started_at),
  CONSTRAINT fk_class_sessions_course
    FOREIGN KEY (course_id) REFERENCES courses(id),
  CONSTRAINT fk_class_sessions_teacher
    FOREIGN KEY (teacher_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance_intervals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  class_session_id CHAR(36) NOT NULL,
  participant_key VARCHAR(512) NOT NULL,
  student_id CHAR(36) NULL,
  match_status ENUM('matched', 'unmatched') NOT NULL DEFAULT 'unmatched',
  student_name VARCHAR(255) NOT NULL,
  joined_at DATETIME(3) NOT NULL,
  left_at DATETIME(3) NULL,
  total_seconds INT UNSIGNED NULL,
  open_participant_key VARCHAR(512)
    AS (IF(left_at IS NULL, participant_key, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_open_interval (class_session_id, open_participant_key),
  KEY idx_intervals_session_student (class_session_id, participant_key),
  KEY idx_intervals_student (student_id),
  CONSTRAINT fk_intervals_class_session
    FOREIGN KEY (class_session_id) REFERENCES class_sessions(id),
  CONSTRAINT fk_intervals_student
    FOREIGN KEY (student_id) REFERENCES students(id)
) ENGINE=InnoDB;
