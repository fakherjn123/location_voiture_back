const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const heroController = require("../controllers/hero.controller");
const upload = require("../middlewares/upload.middleware");

// PUBLIC
router.get("/", heroController.getHeroImages);

// ADMIN
router.post("/", auth, role(["admin"]), upload.single("image"), heroController.addHeroImage);
router.put("/:id", auth, role(["admin"]), heroController.updateHeroImage);
router.delete("/:id", auth, role(["admin"]), heroController.deleteHeroImage);

module.exports = router;
