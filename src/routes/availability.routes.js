const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const availabilityController = require("../controllers/availability.controller");

/**
 * ADMIN
 */
router.put(
  "/:car_id",
  auth,
  role(["admin"]),
  availabilityController.toggleAvailability
);

/**
 * PUBLIC
 */
router.get(
  "/:car_id/check",
  availabilityController.checkAvailability
);

router.get(
  "/active",
  availabilityController.getActiveCars
);

module.exports = router;