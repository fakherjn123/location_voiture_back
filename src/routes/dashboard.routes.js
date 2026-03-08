const express = require("express");
const router = express.Router();

const {
  getStats,
  getFinancialStats,
  getTopCars,
  getAIInsights,
  getMonthlyHistory
} = require("../controllers/dashboard.controller");

const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");

router.get(
  "/stats",
  authMiddleware,
  roleMiddleware(["admin"]),
  getStats
);

router.get(
  "/financial",
  authMiddleware,
  roleMiddleware(["admin"]),
  getFinancialStats
);

router.get(
  "/top-cars",
  authMiddleware,
  roleMiddleware(["admin"]),
  getTopCars
);

router.get(
  "/insights",
  authMiddleware,
  roleMiddleware(["admin"]),
  getAIInsights
);

router.get(
  "/history",
  authMiddleware,
  roleMiddleware(["admin"]),
  getMonthlyHistory
);

module.exports = router;