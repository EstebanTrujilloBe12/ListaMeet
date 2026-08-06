const path = require("path");
const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const { config } = require("./config");
const { pool, initializeDatabase } = require("./db");
const { requireAuth, verifyToken } = require("./middleware/auth");
const attendanceService = require("./services/attendance.service");
const authService = require("./services/auth.service");
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const studentsRoutes = require("./routes/students.routes");
const coursesRoutes = require("./routes/courses.routes");
const classesRoutes = require("./routes/classes.routes");
const attendanceRoutes = require("./routes/attendance.routes");

function acceptsOrigin(origin, callback) {
  const validChromeExtension = /^chrome-extension:\/\/[a-p]{32}$/i.test(origin || "");
  const validMeetOrigin = origin === "https://meet.google.com";
  // La API siempre exige JWT para las rutas privadas. Se permiten Meet y la
  // extensión para que el usuario no tenga que conocer su ID al desplegar.
  if (!origin || config.corsOrigins.includes("*") || config.corsOrigins.includes(origin) || validChromeExtension || validMeetOrigin) {
    return callback(null, true);
  }
  return callback(new Error("Origen no permitido por CORS"));
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: acceptsOrigin } });
app.locals.io = io;

app.use(cors({ origin: acceptsOrigin }));
app.use(express.json({ limit: "1mb" }));
app.get("/health", async (req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.use("/api/auth", authRoutes);
app.use("/api", requireAuth);
app.use("/api/admin", adminRoutes);
app.use("/api/classes", classesRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api/courses", coursesRoutes);

app.use(express.static(path.join(__dirname, "../../web"), {
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/i.test(filePath)) res.setHeader("cache-control", "no-store");
  }
}));

io.use((socket, next) => {
  try {
    const payload = verifyToken(socket.handshake.auth?.token || "");
    socket.data.user = { id: payload.sub, name: payload.name, email: payload.email };
    next();
  } catch {
    next(new Error("No autorizado"));
  }
});
io.on("connection", (socket) => {
  socket.join(`teacher:${socket.data.user.id}`);
  socket.on("class:subscribe", async (sessionId) => {
    if (typeof sessionId !== "string" || !/^[\w-]{1,36}$/.test(sessionId)) return;
    try {
      await attendanceService.getClass(sessionId, socket.data.user.id);
      socket.join(`class:${sessionId}`);
    } catch {
      // No se une a salas de clases que no pertenecen al profesor autenticado.
    }
  });
  socket.on("class:unsubscribe", (sessionId) => socket.leave(`class:${sessionId}`));
});

app.use((req, res) => res.status(404).json({ error: "Ruta no encontrada" }));
app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.status ? error.message : "Error interno del servidor" });
});

async function start() {
  try {
    await initializeDatabase();
    const admin = await authService.ensureInitialAdmin(config.initialAdmin);
    if (admin) console.log(`Administrador inicial listo: ${admin.email}`);
    server.listen(config.port, "0.0.0.0", () => {
      console.log(`Panel disponible en ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${config.port}`}`);
    });
  } catch (error) {
    console.error("No fue posible iniciar la base de datos.", error);
    process.exit(1);
  }
}

function shutdown(signal) {
  console.log(`${signal} recibido; cerrando el servidor.`);
  io.close();
  server.close(async (error) => {
    await pool.end().catch((poolError) => console.error("No fue posible cerrar el pool MySQL.", poolError));
    process.exit(error ? 1 : 0);
  });
  setTimeout(() => process.exit(1), 25_000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
start();
