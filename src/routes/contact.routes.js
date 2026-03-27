const express = require("express");
const router = express.Router();
const contactController = require("../controllers/contact.controller");
const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");

// PUBLIC ROUTES (MESSAGES)
router.post("/", contactController.submitContact);

// PUBLIC ROUTES (CMS DETAILS)
router.get("/info", contactController.getContactDetails);

// ADMIN ROUTES (MESSAGES)
router.get("/", auth, role(["admin"]), contactController.getContacts);
router.patch("/:id/status", auth, role(["admin"]), contactController.updateContactStatus);
router.delete("/:id", auth, role(["admin"]), contactController.deleteContact);

// ADMIN ROUTES (CMS DETAILS)
router.post("/info", auth, role(["admin"]), contactController.addContactDetail);
router.put("/info/:id", auth, role(["admin"]), contactController.updateContactDetail);
router.delete("/info/:id", auth, role(["admin"]), contactController.deleteContactDetail);

module.exports = router;
