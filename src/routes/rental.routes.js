const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const rentalController = require("../controllers/rental.controller");

router.post("/", auth, rentalController.rentCar);
router.get("/my", auth, rentalController.getMyRentals);

// SÉCURISÉ: seuls les admins peuvent voir toutes les locations
router.get("/all", auth, role(["admin"]), rentalController.getAllRentals);

// SÉCURISÉ: seuls les admins peuvent voir les locations d'une voiture spécifique
router.get("/car/:car_id", auth, role(["admin"]), rentalController.getRentalsByCar);

router.get("/dates/:car_id", rentalController.getCarBookedDates);

// Prévisualiser le remboursement avant annulation
router.get("/cancel-preview/:id", auth, rentalController.cancelPreview);

router.put("/cancel/:id", auth, rentalController.cancelRental);

// Route admin uniquement pour annuler une location
router.put("/admin/cancel/:id", auth, role(["admin"]), rentalController.adminCancelRental);

router.put("/:id/deposit", auth, role(["admin"]), rentalController.updateDeposit);
router.put("/:id/penalty", auth, role(["admin"]), rentalController.updatePenalty);

module.exports = router;

