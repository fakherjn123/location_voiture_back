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
router.put("/cancel/:id", auth, rentalController.cancelRental);

module.exports = router;
