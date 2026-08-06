const express = require("express");
const attendanceService = require("../services/attendance.service");
const { eventDate, toCsv } = require("../utils");
const { publishClassUpdate } = require("../realtime");
const { formatDuration, streamAttendancePdf } = require("../services/report.service");

const router = express.Router();

router.post("/events", async (req, res, next) => {
  try {
    const payload = { ...req.body, teacherId: req.user.id, occurredAt: eventDate(req.body?.occurredAt) };
    await attendanceService.recordEvent(payload);
    await publishClassUpdate(req.app, payload.sessionId, req.user.id);
    res.status(204).end();
  } catch (error) { next(error); }
});

router.post("/sync", async (req, res, next) => {
  try {
    const payload = { ...req.body, teacherId: req.user.id, occurredAt: eventDate(req.body?.occurredAt) };
    await attendanceService.syncParticipants(payload);
    await publishClassUpdate(req.app, payload.sessionId, req.user.id);
    res.status(204).end();
  } catch (error) { next(error); }
});

router.get("/classes/:id/export", async (req, res, next) => {
  try {
    const session = await attendanceService.getClass(req.params.id, req.user.id);
    const rows = session.attendance.map((row) => ({
      ...row,
      matchStatus: "Encontrado",
      connectedTime: formatDuration(row.connectedSeconds)
    })).concat(session.unmatched.map((row) => ({
      ...row,
      studentCode: "",
      matchStatus: "No encontrado",
      connectedTime: formatDuration(row.connectedSeconds)
    })));
    const filename = `asistencia-${session.courseName.replace(/[^a-z0-9_-]/gi, "_")}-${session.id}.csv`;
    res.set({
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`
    }).send(toCsv(rows));
  } catch (error) { next(error); }
});

router.get("/classes/:id/export.pdf", async (req, res, next) => {
  try {
    streamAttendancePdf(res, await attendanceService.getClass(req.params.id, req.user.id));
  } catch (error) { next(error); }
});

module.exports = router;
