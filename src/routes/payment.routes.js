const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const paymentController = require("../controllers/payment.controller");

router.post("/", auth, paymentController.createPayment);

router.get("/", auth, role(["admin"]), paymentController.getAllPayments);
router.get("/pending-refunds", auth, role(["admin"]), paymentController.getPendingRefunds);

router.put(
  "/confirm-cash/:payment_id",
  auth,
  role(["admin"]),
  paymentController.confirmCashPayment
);

router.put(
  "/refund/:payment_id",
  auth,
  role(["admin"]),
  paymentController.processRefund
);

module.exports = router;