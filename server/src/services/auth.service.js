const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");
const { config } = require("../config");
const { httpError, requiredText } = require("../utils");

function normalizeEmail(value) {
  const email = requiredText(value, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, "email no es válido");
  return email;
}

function password(value) {
  if (typeof value !== "string" || value.length < 8) {
    throw httpError(400, "La contraseña debe tener al menos 8 caracteres");
  }
  if (value.length > 72) throw httpError(400, "La contraseña supera 72 caracteres");
  return value;
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email };
}

function issueToken(user) {
  return jwt.sign(
    { name: user.name, email: user.email },
    config.jwtSecret,
    { subject: user.id, expiresIn: "12h", issuer: "asistencia-google-meet" }
  );
}

async function register({ name, email, password: rawPassword }) {
  const user = { id: crypto.randomUUID(), name: requiredText(name, "name", 120), email: normalizeEmail(email) };
  const passwordHash = await bcrypt.hash(password(rawPassword), 12);
  try {
    await pool.execute(
      "INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)",
      [user.id, user.name, user.email, passwordHash]
    );
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw httpError(409, "Ya existe una cuenta con ese correo");
    throw error;
  }
  return { user, token: issueToken(user) };
}

async function login({ email, password: rawPassword }) {
  const normalizedEmail = normalizeEmail(email);
  const suppliedPassword = password(rawPassword);
  const [rows] = await pool.execute(
    "SELECT id, name, email, password_hash AS passwordHash FROM users WHERE email = ?",
    [normalizedEmail]
  );
  const row = rows[0];
  if (!row || !await bcrypt.compare(suppliedPassword, row.passwordHash)) {
    throw httpError(401, "Correo o contraseña incorrectos");
  }
  const user = publicUser(row);
  return { user, token: issueToken(user) };
}

async function getUser(id) {
  const [rows] = await pool.execute("SELECT id, name, email FROM users WHERE id = ?", [id]);
  if (!rows[0]) throw httpError(401, "La cuenta ya no existe");
  return publicUser(rows[0]);
}

module.exports = { register, login, getUser };
