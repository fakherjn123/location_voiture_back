const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const paymentController = require("../controllers/payment.controller");

// USER
router.post("/", auth, paymentController.createPayment);

// ADMIN
router.get("/", auth, role(["admin"]), paymentController.getAllPayments);

router.put(
  "/confirm-cash/:payment_id",
  auth,
  role(["admin"]),
  paymentController.confirmCashPayment
);
router.get("/test", (req, res) => {
  res.send("PAYMENT ROUTE WORKING");
});
module.exports = router;