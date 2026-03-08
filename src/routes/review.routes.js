const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const review = require("../controllers/review.controller");

router.get("/all", auth, review.getAllReviews);
router.get("/eligibility/:car_id", auth, review.checkEligibility);
router.get("/:car_id", review.getCarReviews);
router.post("/", auth, review.addReview);
router.put("/:id", auth, review.updateReview);
router.delete("/:id", auth, review.deleteReview);
router.delete("/all", auth, review.deleteAllReviews);
router.post("/manual-reply", auth, review.sendManualReply);
router.post("/generate-reply", auth, review.generateAiReply);

module.exports = router;
