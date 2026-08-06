const express = require("express");
const rosterService = require("../services/roster.service");
const { httpError } = require("../utils");

const router = express.Router();

function publishCoursesChanged(req) {
  req.app.locals.io?.to(`teacher:${req.user.id}`).emit("courses:changed");
  req.app.locals.io?.to(`teacher:${req.user.id}`).emit("classes:changed");
}

function decodedHeader(req, name) {
  const value = req.get(name);
  if (!value) throw httpError(400, `${name} es obligatorio`);
  try { return decodeURIComponent(value); }
  catch { throw httpError(400, `${name} no es válido`); }
}

router.get("/", async (req, res, next) => {
  try { res.json({ courses: await rosterService.listCourses(req.user.id) }); }
  catch (error) { next(error); }
});

router.post("/", express.raw({ type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", limit: "5mb" }), async (req, res, next) => {
  try {
    if (!req.body?.length) throw httpError(400, "Debes subir un archivo Excel (.xlsx)");
    const course = await rosterService.createCourse({
      teacherId: req.user.id,
      name: decodedHeader(req, "x-course-name"),
      courseCode: decodedHeader(req, "x-course-code"),
      workbook: req.body
    });
    publishCoursesChanged(req);
    res.status(201).json({ course });
  } catch (error) { next(error); }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const course = await rosterService.updateCourse({
      teacherId: req.user.id,
      requestedCourseId: req.params.id,
      name: req.body?.name,
      courseCode: req.body?.courseCode
    });
    publishCoursesChanged(req);
    res.json({ course });
  } catch (error) { next(error); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const course = await rosterService.deleteCourse(req.user.id, req.params.id);
    publishCoursesChanged(req);
    res.json({ deleted: course });
  } catch (error) { next(error); }
});

module.exports = router;
