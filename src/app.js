const express = require("express");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const cors = require("cors");
const passport = require("./config/passport");

const app = express();

app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize()); // 🔥 DOIT ÊTRE AVANT LES ROUTES

app.use("/uploads", express.static(require("path").join(__dirname, "uploads")));

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/users", require("./routes/user.routes"));
app.use("/api/cars", require("./routes/car.routes"));
app.use("/api/rentals", require("./routes/rental.routes"));
app.use("/api/recommendation", require("./routes/recommendation.routes"));
app.use("/api/dashboard", require("./routes/dashboard.routes"));
app.use("/api/payments", require("./routes/payment.routes"));
app.use("/api/facture", require("./routes/facture.routes"));
app.use("/api/reviews", require("./routes/review.routes"));
app.use("/api/availability", require("./routes/availability.routes"));
app.use("/api/services", require("./routes/service.routes"));
app.use("/api/hero", require("./routes/hero.routes"));
app.use("/api/delivery", require("./routes/delivery.routes"));
app.use("/api/contacts", require("./routes/contact.routes"));
app.use("/api/promos", require("./routes/promo.routes"));
app.use("/api/export", require("./routes/export.routes"));
app.use("/api/notifications", require("./routes/notification.routes"));
app.use("/api/inspections", require("./routes/inspection.routes"));


module.exports = app;