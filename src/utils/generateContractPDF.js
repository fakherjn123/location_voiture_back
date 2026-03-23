const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

exports.generateContract = (rental, user, car) => {

  const contractsDir = path.join(__dirname, "../contracts");

  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir, { recursive: true });
  }

  const filePath = path.join(contractsDir, `contrat-${rental.id}.pdf`);

  return new Promise((resolve, reject) => {

    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);

    // HEADER
    doc.fontSize(22).text("CONTRAT DE LOCATION DE VÉHICULE", { align: "center", underline: true });
    doc.moveDown(2);

    // Infos
    doc.fontSize(12);
    doc.text(`Référence du Contrat : CRT-${rental.id}`);
    doc.text(`Date d'édition : ${new Date().toLocaleDateString("fr-FR")}`);
    doc.moveDown(2);

    // ENTRE LES SOUSSIGNÉS
    doc.fontSize(14).text("ENTRE LES SOUSSIGNÉS :", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).text("L'Agence : BMZ Location", { continued: true }).text(" (ci-après dénommée le Loueur)", { align: 'right' });
    doc.text(`Le Client : ${user.name} (${user.email})`, { continued: true }).text(" (ci-après dénommé le Locataire)", { align: 'right' });
    doc.moveDown(2);

    // OBJET
    doc.fontSize(14).text("1. OBJET DU CONTRAT", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Le Loueur met à disposition du Locataire le véhicule de tourisme suivant :`);
    doc.text(`Marque et Modèle : ${car.brand} ${car.model}`);
    doc.moveDown(2);

    // DUREE
    doc.fontSize(14).text("2. DURÉE DE LA LOCATION", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Date de prise en charge : ${new Date(rental.start_date).toLocaleDateString("fr-FR")}`);
    doc.text(`Date de restitution prévue : ${new Date(rental.end_date).toLocaleDateString("fr-FR")}`);
    doc.moveDown(2);

    // TARIF
    doc.fontSize(14).text("3. CONDITIONS FINANCIÈRES", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Le coût total estimé pour cette location est de ${rental.total_price} TND.`);
    doc.text(`Ce montant inclut la location ainsi que les frais de livraison éventuels.`);
    doc.moveDown(3);

    // SIGNATURES
    doc.text("Fait pour valoir ce que de droit.", { align: "center" });
    doc.moveDown(2);
    
    doc.text("Signature de l'Agence", { continued: true }).text("Signature du Client", { align: "right" });
    
    doc.end();

    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
};
