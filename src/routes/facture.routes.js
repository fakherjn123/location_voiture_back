const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const facture = require("../controllers/facture.controller");

// =======================
// USER
// =======================

// créer une facture après location
router.post("/", auth, facture.createFacture);

// mes factures
router.get("/my", auth, facture.getMyFacture);

// =======================
// ADMIN
// =======================

// toutes les factures
router.get("/", auth, role(["admin"]), facture.getAllFacture);

module.exports = router;
