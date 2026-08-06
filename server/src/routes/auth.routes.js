const express = require("express");
const authService = require("../services/auth.service");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/register", async (req, res, next) => {
  try { res.status(201).json(await authService.register(req.body || {})); }
  catch (error) { next(error); }
});

router.post("/login", async (req, res, next) => {
  try { res.json(await authService.login(req.body || {})); }
  catch (error) { next(error); }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try { res.json({ user: await authService.getUser(req.user.id) }); }
  catch (error) { next(error); }
});

module.exports = router;
