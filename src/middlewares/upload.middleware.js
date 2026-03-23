const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(__dirname, "../uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const crypto = require("crypto");

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = crypto.randomBytes(16).toString("hex");
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({ storage });

module.exports = upload;