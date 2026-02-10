const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "No token" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔥 TRÈS IMPORTANT
    req.user = {
      id: decoded.id,
      role: decoded.role
    };

    console.log("AUTH USER:", req.user); // DEBUG

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
