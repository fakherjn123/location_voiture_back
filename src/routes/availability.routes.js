const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const availabilityController = require("../controllers/availability.controller");

   
 
router.put(
  "/:car_id",
  auth,
  role(["admin"]),
  availabilityController.toggleAvailability
);

   

router.get(
  "/:car_id/check",
  availabilityController.checkAvailability
);

router.get(
  "/active",
  availabilityController.getActiveCars
);

module.exports = router;