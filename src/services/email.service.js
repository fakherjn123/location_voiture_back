const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((error) => {
  if (error) {
    console.log("SMTP ERROR:", error);
  } else {
    console.log("SMTP Ready");
  }
});

exports.sendEmail = async ({
  to,
  subject,
  html,
  facturePath = null,
}) => {
  try {
    const mailOptions = {
      from: `"BMZ Location" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      attachments: [],
    };

    if (facturePath) {
      mailOptions.attachments.push({
        filename: "facture.pdf",
        path: facturePath,
      });
    }

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.response);

  } catch (error) {
    console.error("EMAIL ERROR:", error);
  }
};