const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

module.exports.generateFacture = (payment, rental, user, car) => {
  const facturesDir = path.join(__dirname, "../invoices");

  // Vérifier si le dossier existe
  if (!fs.existsSync(facturesDir)) {
    fs.mkdirSync(facturesDir, { recursive: true });
  }

  const facturePath = path.join(
    facturesDir,
    `facture-${payment.id}.pdf`
  );

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(fs.createWriteStream(facturePath));

  // Titre
  doc.fontSize(22).text("FACTURE DE LOCATION", { align: "center" });
  doc.moveDown();

  // Infos facture
  doc.fontSize(12);
  doc.text(`Facture N° : ${payment.id}`);
  doc.text(`Date : ${new Date().toLocaleDateString()}`);
  doc.moveDown();

  // Client
  doc.text(`Client : ${user.email}`);
  doc.moveDown();

  // Détails location
  doc.text(`Voiture : ${car.brand} ${car.model}`);
  doc.text(`Début : ${rental.start_date}`);
  doc.text(`Fin : ${rental.end_date}`);
  doc.moveDown();

  // Paiement
  doc.text(`Méthode de paiement : ${payment.method}`);
  doc.moveDown();

  // Total
  doc.fontSize(14).text(`TOTAL : ${payment.amount} TND`, { align: "right" });

  doc.moveDown(2);
  doc.fontSize(12).text("Merci pour votre confiance !", { align: "center" });

  doc.end();

  return facturePath;
};