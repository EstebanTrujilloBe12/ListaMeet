-- Ejecuta este archivo UNA sola vez porque tu base ya fue creada.
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

ALTER TABLE class_sessions
  ADD COLUMN teacher_id CHAR(36) NULL AFTER course_id,
  ADD KEY idx_class_sessions_teacher (teacher_id, started_at),
  ADD CONSTRAINT fk_class_sessions_teacher
    FOREIGN KEY (teacher_id) REFERENCES users(id);

-- Las sesiones creadas antes de esta migración no pertenecen a una cuenta y
-- no se mostrarán en el nuevo panel. Las clases nuevas quedarán asociadas al
-- profesor que haya iniciado sesión.
