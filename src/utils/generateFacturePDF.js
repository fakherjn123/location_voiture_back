const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

module.exports = (facture_, user, rental, car) => {
  const filePath = path.join(
    __dirname,
    `../invoices/facture_${facture_.id}.pdf`
  );

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(fs.createWriteStream(filePath));

  doc.fontSize(20).text("FACTURE DE LOCATION", { align: "center" });
  doc.moveDown();

  doc.fontSize(12);
  doc.text(`Facture ID : ${facture_.id}`);
  doc.text(`Date : ${new Date(facture_.created_at).toLocaleDateString()}`);
  doc.moveDown();

  doc.text(`Client : ${user.email}`);
  doc.moveDown();

  doc.text(`Voiture : ${car.brand} ${car.model}`);
  doc.text(`Début : ${rental.start_date}`);
  doc.text(`Fin : ${rental.end_date}`);
  doc.moveDown();

  doc.fontSize(14).text(`TOTAL : ${facture_.total} €`, { align: "right" });

  doc.end();

  return filePath;
};
