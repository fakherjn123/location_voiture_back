const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

exports.generateContract = async (rental, user, car) => {

  const contractsDir = path.join(__dirname, "../contracts");

  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir, { recursive: true });
  }

  const filePath = path.join(contractsDir, `contrat-${rental.id}.pdf`);

  // Generate QR Code as a clickable URL
  // The QR encodes a URL so that when scanned, the phone opens a browser
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  const qrUrl = `${frontendUrl}/mes-factures?ref=CRT-${rental.id}&client=${encodeURIComponent(user.name || user.email)}&montant=${rental.total_price}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 150, margin: 1, color: { dark: '#0a0a0a', light: '#ffffff' } });
  const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');


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

    // SIGNATURES — Two columns layout
    doc.fontSize(12).fillColor('#000000');
    doc.text("Fait pour valoir ce que de droit.", { align: "center" });
    doc.moveDown(2);

    const sigY = doc.y;
    const leftX = 60;
    const rightX = 340;
    const boxW = 180;
    const boxH = 90;

    // Agency signature box (left)
    doc.rect(leftX, sigY, boxW, boxH).lineWidth(1).strokeColor('#cccccc').stroke();
    doc.fontSize(9).fillColor('#888888').text("Signature & Cachet de l'Agence", leftX, sigY + 6, { width: boxW, align: 'center' });

    // Simulate agency stamp in the box
    const stampCX = leftX + boxW / 2;
    const stampCY = sigY + 52;
    doc.circle(stampCX, stampCY, 28).lineWidth(2).strokeColor('#1e3a5f').stroke();
    doc.circle(stampCX, stampCY, 22).lineWidth(0.5).strokeColor('#1e3a5f').stroke();
    doc
      .fontSize(7)
      .fillColor('#1e3a5f')
      .text('BMZ LOCATION', stampCX - 22, stampCY - 9, { width: 44, align: 'center' });
    doc
      .fontSize(5.5)
      .fillColor('#1e3a5f')
      .text('Agence Officielle', stampCX - 22, stampCY - 1, { width: 44, align: 'center' });
    doc
      .fontSize(5)
      .fillColor('#1e3a5f')
      .text(new Date().getFullYear().toString(), stampCX - 22, stampCY + 6, { width: 44, align: 'center' });

    // Client signature box (right)
    doc.rect(rightX, sigY, boxW, boxH).lineWidth(1).strokeColor('#cccccc').stroke();
    doc.fontSize(9).fillColor('#888888').text("Signature du Client", rightX, sigY + 6, { width: boxW, align: 'center' });
    doc.fontSize(8).fillColor('#aaaaaa').text("(Lu et approuvé)", rightX, sigY + boxH - 16, { width: boxW, align: 'center' });

    doc.moveDown(4);


    // QR CODE — Add a new page if not enough space (< 180px remaining)
    const pageHeight = doc.page.height;
    const bottomMargin = doc.page.margins.bottom;
    const spaceNeeded = 180; // px needed for separator + text + QR + footer
    if (doc.y + spaceNeeded > pageHeight - bottomMargin) {
      doc.addPage();
    }

    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).strokeColor('#cccccc').stroke();
    doc.moveDown(1);
    doc.fontSize(9).fillColor('#999999').text("Vérifiez l'authenticité de ce contrat en scannant le QR code ci-dessous :", { align: 'center' });
    doc.moveDown(0.5);
    // Center the QR image manually using the page width
    const qrSize = 110;
    const qrX = (doc.page.width - qrSize) / 2;
    doc.image(qrBuffer, qrX, doc.y, { width: qrSize, height: qrSize });
    doc.moveDown(0.5);
    doc.y += qrSize + 10; // Advance cursor past the QR image
    doc.fontSize(8).fillColor('#aaaaaa').text(`Réf: CRT-${rental.id} — BMZ Location © ${new Date().getFullYear()}`, { align: 'center' });

    
    doc.end();

    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
};
