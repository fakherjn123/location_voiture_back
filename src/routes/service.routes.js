const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const {
    getServices,
    createService,
    updateServiceStatus,
    getAlerts,
} = require("../controllers/service.controller");

// Liste des entretiens planifiés
router.get("/", auth, role(["admin"]), getServices);

// Alertes urgentes
router.get("/alerts", auth, role(["admin"]), getAlerts);

// Planifier un entretien
router.post("/", auth, role(["admin"]), createService);

// Changer le statut d'un entretien
router.put("/:id/status", auth, role(["admin"]), updateServiceStatus);

module.exports = router;
