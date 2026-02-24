const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

exports.chatBot = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Message required" });
    }

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: message,
    });

    res.json({
      reply: response.text,
    });

  } catch (error) {
    console.error("CHAT ERROR:", error);
    res.status(500).json({
      message: error.message,
    });
  }
};
