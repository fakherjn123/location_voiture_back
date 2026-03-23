const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const rentalController = require("../controllers/rental.controller");

router.post("/", auth, rentalController.rentCar);
router.get("/my", auth, rentalController.getMyRentals);
router.get("/all", auth, rentalController.getAllRentals); // Admin only
router.get("/dates/:car_id", rentalController.getCarBookedDates); // Public
router.put("/cancel/:id", auth, rentalController.cancelRental);
router.put("/admin/cancel/:id", auth, role(["admin"]), rentalController.adminCancelRental); // Admin cancel any

module.exports = router;
