const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const dashboard = require("../controllers/dashboard.controller");

router.get("/", auth, role(["admin"]), dashboard.getStats);
router.get("/financial", auth, role(["admin"]), dashboard.getFinancialStats);

module.exports = router;
