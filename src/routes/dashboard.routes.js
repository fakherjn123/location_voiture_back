const express = require("express");
const router = express.Router();

const {
  getStats,
  getFinancialStats,
  getTopCars
} = require("../controllers/dashboard.controller");

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");

// 📊 Stats générales
router.get(
  "/stats",
  authMiddleware,
  roleMiddleware(["admin"]),
  getStats
);

// 💰 Stats financières
router.get(
  "/financial",
  authMiddleware,
  roleMiddleware(["admin"]),
  getFinancialStats
);

// 🚗 Top voitures
router.get(
  "/top-cars",
  authMiddleware,
  roleMiddleware(["admin"]),
  getTopCars
);

module.exports = router;