const express = require("express");
const router = express.Router();
const deliveryController = require("../controllers/delivery.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const roleMiddleware = require("../middlewares/role.middleware");

// Calcul des frais (Accessible par un client authentifié)
router.post("/calculate", authMiddleware, deliveryController.calculateDelivery);

// Planning des livraisons (Accessible uniquement par l'admin)
router.get("/schedule", authMiddleware, roleMiddleware("admin"), deliveryController.getSchedule);

// Mise à jour des statuts par l'admin
router.put("/:rental_id/delivery-status", authMiddleware, roleMiddleware("admin"), deliveryController.updateDeliveryStatus);
router.put("/:rental_id/return-status", authMiddleware, roleMiddleware("admin"), deliveryController.updateReturnStatus);

module.exports = router;
