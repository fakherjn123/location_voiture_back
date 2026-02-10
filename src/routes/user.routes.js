const express = require("express");
const router = express.Router();

const auth = require("../middlewares/auth.middleware");
const role = require("../middlewares/role.middleware");
const userController = require("../controllers/user.controller");

/**
 * =========================
 * PUBLIC
 * =========================
 */
router.post("/register", userController.register);
router.post("/login", userController.login);
router.post("/logout", auth, userController.logout);

/**
 * =========================
 * ADMIN
 * =========================
 */
router.post("/add-client", auth, role(["admin"]), userController.addClient);
router.get("/", auth, role(["admin"]), userController.getUsers);

/**
 * =========================
 * USER
 * =========================
 */
router.get("/my-rentals", auth, userController.getUserRentals);

module.exports = router;
