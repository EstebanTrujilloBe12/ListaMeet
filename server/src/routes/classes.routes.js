const express = require("express");
const attendanceService = require("../services/attendance.service");
const { publishClassUpdate } = require("../realtime");

const router = express.Router();

router.post("/start", async (req, res, next) => {
  try {
    const session = await attendanceService.createClass({ ...req.body, teacherId: req.user.id });
    req.app.locals.io?.to(`teacher:${req.user.id}`).emit("class:started", session);
    await publishClassUpdate(req.app, session.id, req.user.id);
    res.status(201).json({ session });
  } catch (error) { next(error); }
});

router.get("/", async (req, res, next) => {
  try {
    const sessions = await attendanceService.listClasses(req.user.id, req.query.status);
    res.json({ sessions });
  } catch (error) { next(error); }
});

router.get("/:id", async (req, res, next) => {
  try {
    res.json({ session: await attendanceService.getClass(req.params.id, req.user.id) });
  } catch (error) { next(error); }
});

router.post("/:id/finish", async (req, res, next) => {
  try {
    const session = await attendanceService.finishClass(req.params.id, req.user.id);
    await publishClassUpdate(req.app, session.id, req.user.id);
    res.json({ session });
  } catch (error) { next(error); }
});

module.exports = router;
