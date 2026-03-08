const express = require("express");
const router = express.Router();

const recommendationController = require("../controllers/recommendation.controller");

router.post("/", recommendationController.getRecommendation);

module.exports = router;
