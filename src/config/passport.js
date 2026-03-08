const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const pool = require("../config/db");

/* =========================
   GOOGLE STRATEGY
========================= */

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/api/auth/google/callback"
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;
        const name = profile.displayName;

        let user = await pool.query(
          "SELECT * FROM users WHERE email = $1",
          [email]
        );

        if (user.rows.length === 0) {
          user = await pool.query(
            "INSERT INTO users (name, email, role) VALUES ($1,$2,'client') RETURNING *",
            [name, email]
          );
        }

        return done(null, user.rows[0]);

      } catch (error) {
        return done(error, null);
      }
    }
  )
);


module.exports = passport;