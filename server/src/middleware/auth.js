const jwt = require("jsonwebtoken");
const { config } = require("../config");

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

module.exports = { requireAuth, verifyToken };
