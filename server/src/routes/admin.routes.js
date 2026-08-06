const express = require("express");
const { requireAdmin } = require("../middleware/auth");
const adminService = require("../services/admin.service");

const router = express.Router();
router.use(requireAdmin);

router.get("/users", async (req, res, next) => {
  try { res.json({ users: await adminService.listUsers() }); }
  catch (error) { next(error); }
});

router.get("/users/:id/activity", async (req, res, next) => {
  try { res.json(await adminService.listUserActivity(req.params.id)); }
  catch (error) { next(error); }
});

router.patch("/users/:id/password", async (req, res, next) => {
  try {
    await adminService.resetPassword(req.params.id, req.body?.password);
    res.status(204).end();
  } catch (error) { next(error); }
});

module.exports = router;
