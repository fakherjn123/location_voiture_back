const express = require("express");
const router = express.Router();
const promoController = require("../controllers/promo.controller");
const authMiddleware = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

// Routes accessibles aux clients connectés
router.post("/validate", authMiddleware, promoController.validatePromoCode);

// Routes Admin uniquement
router.post("/", authMiddleware, role(["admin"]), promoController.createPromoCode);
router.get("/", authMiddleware, role(["admin"]), promoController.getAllPromoCodes);
router.put("/:id/toggle", authMiddleware, role(["admin"]), promoController.togglePromoCode);
router.put("/:id", authMiddleware, role(["admin"]), promoController.updatePromoCode);
router.delete("/:id", authMiddleware, role(["admin"]), promoController.deletePromoCode);

module.exports = router;
