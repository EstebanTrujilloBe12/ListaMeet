const attendanceService = require("./services/attendance.service");

async function publishClassUpdate(app, sessionId, teacherId) {
  const io = app.locals.io;
  if (!io) return;
  const session = await attendanceService.getClass(sessionId, teacherId);
  io.to(`class:${sessionId}`).emit("attendance:changed", session);
  io.to(`teacher:${teacherId}`).emit("classes:changed");
}

module.exports = { publishClassUpdate };
