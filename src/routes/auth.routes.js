const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const passport = require("passport");
const jwt = require("jsonwebtoken");


router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/logout", authController.logout);


router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  (req, res) => {
    const token = jwt.sign(
      {
        id: req.user.id,
        role: req.user.role,
        email: req.user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5174";
    res.redirect(`${frontendUrl}/oauth-success?token=${token}`);
  }
);


module.exports = router;