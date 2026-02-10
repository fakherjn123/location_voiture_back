const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const paymentController = require("../controllers/payment.controller");

// USER
router.post("/", auth, paymentController.createPayment);
router.get("/my", auth, paymentController.getMyPayments);

// ADMIN
router.get("/", auth, role(["admin"]), paymentController.getAllPayments);

module.exports = router;
