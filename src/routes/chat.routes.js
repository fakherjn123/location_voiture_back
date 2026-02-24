const router = require("express").Router();
const chatController = require("../controllers/chat.controller");

router.post("/", chatController.chatBot);

module.exports = router;
