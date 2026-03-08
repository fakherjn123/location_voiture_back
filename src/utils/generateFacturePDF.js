const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

exports.generateFacture = (payment, rental, user, car) => {

  const invoicesDir = path.join(__dirname, "../invoices");

  if (!fs.existsSync(invoicesDir)) {
    fs.mkdirSync(invoicesDir, { recursive: true });
  }

  const filePath = path.join(invoicesDir, `facture-${payment.id}.pdf`);

  return new Promise((resolve, reject) => {

    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // HEADER
    doc.fontSize(22).text("FACTURE DE LOCATION", { align: "center" });
    doc.moveDown();

    // Infos
    doc.fontSize(12);
    doc.text(`Facture N° : ${payment.id}`);
    doc.text(`Date : ${new Date().toLocaleDateString("fr-FR")}`);
    doc.moveDown();

    doc.text(`Client : ${user.email}`);
    doc.moveDown();

    doc.text(`Voiture : ${car.brand} ${car.model}`);
    doc.text(`Début : ${new Date(rental.start_date).toLocaleDateString("fr-FR")}`);
    doc.text(`Fin : ${new Date(rental.end_date).toLocaleDateString("fr-FR")}`);
    doc.moveDown();

    doc.text(`Méthode de paiement : ${payment.method}`);
    doc.moveDown();

    doc.fontSize(14)
       .text(`TOTAL : ${payment.amount} TND`, { align: "right" });

    doc.moveDown(2);
    doc.fontSize(12).text("Merci pour votre confiance !", { align: "center" });

    doc.end();

    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
};