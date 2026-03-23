const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const userController = require("../controllers/user.controller");
const upload = require("../middlewares/upload.middleware");

router.post("/upload-license", auth, upload.single("license"), userController.uploadLicense);

   

router.post("/register", userController.register);
router.post("/login", userController.login);
router.post("/logout", auth, userController.logout);


router.post("/add-client", auth, role(["admin"]), userController.addClient);
router.get("/", auth, role(["admin"]), userController.getUsers);
router.put("/:id/license-status", auth, role(["admin"]), userController.updateLicenseStatus);

   
 
router.get("/my-rentals", auth, userController.getUserRentals);
router.put("/me", auth, userController.updateMyProfile);
router.get("/me", auth, userController.getMyProfile);

module.exports = router;
