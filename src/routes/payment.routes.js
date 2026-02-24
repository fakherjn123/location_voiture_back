const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const paymentController = require("../controllers/payment.controller");

// USER
router.post("/", auth, paymentController.createPayment);

// ADMIN
router.put(
  "/confirm-cash/:payment_id",
  auth,
  role(["admin"]),
  paymentController.confirmCashPayment
);

module.exports = router;