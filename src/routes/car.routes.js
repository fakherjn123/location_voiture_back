const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const carController = require("../controllers/car.controller");

/**
 * PUBLIC
 */
router.get("/", carController.getCars);

/**
 * ADMIN
 */
router.post("/", auth, role(["admin"]), carController.addCar);
router.put("/:id", auth, role(["admin"]), carController.updateCar);
router.delete("/:id", auth, role(["admin"]), carController.deleteCar);

module.exports = router;
