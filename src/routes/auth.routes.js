const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const passport = require("passport");
const jwt = require("jsonwebtoken");
const {
  getFrontendUrl,
  getFrontendUrlFromRequest,
  isAllowedFrontendUrl,
} = require("../utils/frontend-url");

const encodeOAuthState = (payload) =>
  Buffer.from(JSON.stringify(payload)).toString("base64url");

const decodeOAuthState = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
};


router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/logout", authController.logout);


router.get(
  "/google",
  (req, res, next) => {
    const frontendUrl = getFrontendUrlFromRequest(req);
    const state = encodeOAuthState({ frontendUrl });

    passport.authenticate("google", {
      scope: ["profile", "email"],
      state,
    })(req, res, next);
  }
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

    const oauthState = decodeOAuthState(req.query.state);
    const frontendUrl = isAllowedFrontendUrl(oauthState?.frontendUrl)
      ? oauthState.frontendUrl
      : getFrontendUrl();

    const redirectUrl = new URL("/oauth-success", `${frontendUrl}/`);
    redirectUrl.searchParams.set("token", token);
    res.redirect(redirectUrl.toString());
  }
);


module.exports = router;
