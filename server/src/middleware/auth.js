const jwt = require("jsonwebtoken");
const { config } = require("../config");
const { pool } = require("../db");

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, { issuer: "asistencia-google-meet" });
}

function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const [, token] = header.match(/^Bearer\s+(.+)$/i) || [];
  if (!token) return res.status(401).json({ error: "Inicia sesión para continuar" });
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, name: payload.name, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: "La sesión expiró o no es válida" });
  }
}

async function requireAdmin(req, res, next) {
  try {
    const [rows] = await pool.execute("SELECT role FROM users WHERE id = ?", [req.user.id]);
    if (rows[0]?.role !== "admin") return res.status(403).json({ error: "Esta acción requiere una cuenta administradora" });
    req.user.role = "admin";
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { requireAuth, requireAdmin, verifyToken };
