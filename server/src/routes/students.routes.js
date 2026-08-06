const express = require("express");
const rosterService = require("../services/roster.service");

const router = express.Router();

function publishCoursesChanged(req) {
  req.app.locals.io?.to(`teacher:${req.user.id}`).emit("courses:changed");
}

router.get("/", async (req, res, next) => {
  try {
    res.json(await rosterService.listStudents(req.user.id, req.query.courseId));
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    const student = await rosterService.createStudent({ teacherId: req.user.id, ...req.body });
    publishCoursesChanged(req);
    res.status(201).json({ student });
  }
  catch (error) { next(error); }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const student = await rosterService.updateStudent({ teacherId: req.user.id, studentId: req.params.id, ...req.body });
    publishCoursesChanged(req);
    res.json({ student });
  }
  catch (error) { next(error); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await rosterService.deleteStudent({ teacherId: req.user.id, studentId: req.params.id });
    publishCoursesChanged(req);
    res.status(204).end();
  }
  catch (error) { next(error); }
});

module.exports = router;
