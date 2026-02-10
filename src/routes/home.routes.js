const router = require("express").Router();
const home = require("../controllers/home.controller");

router.get("/", home.getHomeCars);

module.exports = router;
