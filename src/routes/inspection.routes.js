const express = require("express");
const router = express.Router();
const inspectionController = require("../controllers/inspection.controller");
const authMiddleware = require("../middlewares/auth.middleware");

router.post("/", authMiddleware, inspectionController.createInspection);
router.put("/:id", authMiddleware, inspectionController.updateInspection);
router.put("/:id/sign", authMiddleware, inspectionController.signInspection);
router.get("/rental/:rentalId", authMiddleware, inspectionController.getRentalInspections);

module.exports = router;
