const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const review = require("../controllers/review.controller");

router.get("/all", auth, review.getAllReviews);
router.post("/manual-reply", auth, review.sendManualReply);
router.post("/generate-reply", auth, review.generateAiReply);
router.get("/eligibility/:car_id", auth, review.checkEligibility);
router.post("/", auth, review.addReview);
// ⚠️ DELETE /all must be BEFORE DELETE /:id to avoid route conflict
router.delete("/all", auth, review.deleteAllReviews);
router.delete("/:id", auth, review.deleteReview);
router.put("/:id", auth, review.updateReview);
router.get("/:car_id", review.getCarReviews);

module.exports = router;
