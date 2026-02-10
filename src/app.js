const express = require("express");
const cookieParser = require("cookie-parser");

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", require("./routes/auth.routes"));
app.use("/api/users", require("./routes/user.routes"));
app.use("/api/cars", require("./routes/car.routes"));
app.use("/api/rentals", require("./routes/rental.routes"));
app.use("/api/recommendation", require("./routes/recommendation.routes"));
app.use("/api/dashboard", require("./routes/dashboard.routes")); // ✅ AJOUTÉ
app.use("/api/payments", require("./routes/payment.routes"));
app.use("/api/dashboard", require("./routes/dashboard.routes"));
app.use("/api/facture", require("./routes/facture.routes"));
app.use("/api/home", require("./routes/home.routes"));

module.exports = app;
