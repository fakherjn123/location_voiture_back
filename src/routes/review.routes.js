const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const review = require("../controllers/review.controller");

// VISITEUR & ADMIN
router.get("/all", auth, review.getAllReviews);
router.get("/eligibility/:car_id", auth, review.checkEligibility);
router.get("/:car_id", review.getCarReviews);
// CLIENT
router.post("/", auth, review.addReview);
router.put("/:id", auth, review.updateReview);
router.delete("/:id", auth, review.deleteReview);
router.post("/manual-reply", auth, review.sendManualReply);
router.post("/generate-reply", auth, review.generateAiReply);

module.exports = router;
