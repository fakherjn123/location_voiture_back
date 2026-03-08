const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const carController = require("../controllers/car.controller");
const upload = require("../middlewares/upload.middleware");

const optionalAuth = require("../middlewares/optionalAuth.middleware");

   

router.get("/", optionalAuth, carController.getCars);
router.get("/:id", optionalAuth, carController.getCarById);

   

router.post(
  "/generate-description",
  auth,
  role(["admin"]),
  carController.generateDescription
);

router.post(
  "/",
  auth,
  role(["admin"]),
  upload.single("image"),
  carController.addCar
);

router.put(
  "/:id",
  auth,
  role(["admin"]),
  upload.single("image"),
  carController.updateCar
);

router.delete("/:id", auth, role(["admin"]), carController.deleteCar);


router.get(
  "/rented",
  auth,
  role(["admin"]),
  carController.getRentedCars
);

module.exports = router;
