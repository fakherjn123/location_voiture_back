const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const rental = require("../controllers/rental.controller");

router.post("/", auth, rental.rentCar);

module.exports = router;
