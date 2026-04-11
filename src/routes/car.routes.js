const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const carController = require("../controllers/car.controller");
const upload = require("../middlewares/upload.middleware");

const optionalAuth = require("../middlewares/optionalAuth.middleware");



router.get("/", optionalAuth, carController.getCars);
router.get("/archived", auth, role(["admin"]), carController.getArchivedCars);
router.get("/ai/yield-analysis", auth, role(["admin"]), carController.getAIYieldAnalysis);
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

router.put("/:id/archive", auth, role(["admin"]), carController.archiveCar);
router.put("/:id/force-archive", auth, role(["admin"]), carController.forceArchiveCar);
router.put("/:id/unarchive", auth, role(["admin"]), carController.unarchiveCar);
router.put("/:id/apply-ai-price", auth, role(["admin"]), carController.applyAIPrice);

router.delete("/:id", auth, role(["admin"]), carController.deleteCar);


router.get(
  "/rented",
  auth,
  role(["admin"]),
  carController.getRentedCars
);

module.exports = router;
