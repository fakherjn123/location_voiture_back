const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const facture = require("../controllers/facture.controller");

router.get("/my", auth, facture.getMyFacture);

router.get("/", auth, role(["admin"]), facture.getAllFacture);
router.get("/pdf/:id", auth, facture.downloadFacturePDF);

module.exports = router;
