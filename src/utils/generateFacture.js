const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

exports.generateFacture = (payment, rental, user) => {
  const facturesDir = path.join(__dirname, "../../factures");

  if (!fs.existsSync(facturesDir)) {
    fs.mkdirSync(facturesDir);
  }

  const facturePath = path.join(
    facturesDir,
    `facture-${payment.id}.pdf`
  );

  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(facturePath));

  doc.fontSize(22).text("FACTURE LOCATION VOITURE", { align: "center" });
  doc.moveDown();

  doc.fontSize(14).text(`Facture N°: ${payment.id}`);
  doc.text(`Client: ${user.email}`);
  doc.text(`Location ID: ${rental.id}`);
  doc.text(`Montant payé: ${payment.amount} TND`);
  doc.text(`Méthode de paiement: ${payment.method}`);
  doc.text(`Date: ${new Date().toLocaleDateString()}`);

  doc.moveDown();
  doc.text("Merci pour votre confiance !", { align: "center" });

  doc.end();

  return facturePath;
};