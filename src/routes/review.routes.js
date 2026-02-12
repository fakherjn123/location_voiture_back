const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const review = require("../controllers/review.controller");

// VISITEUR
router.get("/car/:car_id", review.getCarReviews);

// CLIENT
router.post("/", auth, review.addReview);
router.put("/:id", auth, review.updateReview);
router.delete("/:id", auth, review.deleteReview);

module.exports = router;
