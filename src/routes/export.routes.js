const express = require("express");
const router = express.Router();
const exportController = require("../controllers/export.controller");
const authMiddleware = require("../middlewares/auth.middleware");

// Seul l'admin peut exporter les données
router.get("/rentals", authMiddleware, exportController.exportRentals);

module.exports = router;
