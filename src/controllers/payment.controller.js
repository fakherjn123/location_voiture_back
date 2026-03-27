const pool = require("../config/db");
const { sendEmail } = require("../services/email.service");

exports.createPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rental_id, method } = req.body;

    if (!rental_id || !method) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "Missing fields" });
    }

    const rentalResult = await client.query(
      `
      SELECT rentals.*, users.name, users.email, users.points as user_points, cars.brand, cars.model, cars.price_per_day
      FROM rentals
      JOIN users ON users.id = rentals.user_id
      JOIN cars ON cars.id = rentals.car_id
      WHERE rentals.id = $1
      `,
      [rental_id]
    );

    if (rentalResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Rental not found" });
    }

    const rental = rentalResult.rows[0];

    // 🔒 Vérifier propriétaire
    if (rental.user_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: "Unauthorized rental" });
    }

    // FIX #4: Empêcher le double paiement
    const existingPayment = await client.query(
      `SELECT 1 FROM payments WHERE rental_id = $1`,
      [rental_id]
    );

    if (existingPayment.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "Payment already exists for this rental" });
    }

    // FIX #4: Vérifier que la location est dans un état payable ("pending" ou anciennement "awaiting_payment")
    if (!["pending", "awaiting_payment"].includes(rental.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "This rental cannot be paid" });
    }

    let paymentStatus = method === "card" ? "paid" : "pending";
    let rentalStatus = method === "card" ? "confirmed" : "awaiting_payment";

    const paymentResult = await client.query(
      `
      INSERT INTO payments (rental_id, amount, method, status)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [rental_id, rental.total_price, method, paymentStatus]
    );

    const payment = paymentResult.rows[0];

    await client.query(
      `UPDATE rentals SET status = $1 WHERE id = $2`,
      [rentalStatus, rental_id]
    );

    // Points deduction & earning logic
    const start = new Date(rental.start_date);
    const end = new Date(rental.end_date);
    const diffDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    const baseTotal = diffDays * Number(rental.price_per_day);
    
    let newPoints = rental.user_points || 0;
    // Si prix réduit, on déduit les 100 points
    if (Number(rental.total_price) < baseTotal - 0.01) {
      newPoints -= 100;
    }
    
    // On n'ajoute les points gagnés QUE si le paiement est de suite confirmé (Carte)
    if (method === "card") {
      const pointsEarned = Math.floor(diffDays * 10);
      newPoints += pointsEarned;
    }

    await client.query(
      "UPDATE users SET points = $1 WHERE id = $2",
      [Math.max(0, newPoints), rental.user_id]
    );

    // Create facture immediately if paid via card
    if (method === "card") {
      await client.query(
        `INSERT INTO facture (user_id, rental_id, total)
         VALUES ($1, $2, $3)
         ON CONFLICT (rental_id) DO NOTHING`,
        [rental.user_id, rental_id, rental.total_price]
      );
    }

    let subject;
    let htmlTemplate;
    let contractPath = null;
    const fs = require("fs");

    if (method === "card") {
      subject = "✅ Paiement Confirmé — BMZ Location";

      // --- GENERATE PDF CONTRACT ---
      try {
        const { generateContract } = require("../utils/generateContractPDF");
        contractPath = await generateContract(
          { id: rental.id, start_date: rental.start_date, end_date: rental.end_date, total_price: rental.total_price },
          { name: rental.name, email: rental.email },
          { brand: rental.brand, model: rental.model }
        );
      } catch (err) {
        console.error("PDF GENERATION ERROR:", err);
      }

      htmlTemplate = `
      <!DOCTYPE html>
      <html lang="fr">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
          <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

              <!-- HEADER -->
              <tr>
                <td style="background:linear-gradient(135deg,#0a0a0a 0%,#2d2d2d 100%);padding:36px 40px;text-align:center;">
                  <div style="font-size:32px;margin-bottom:10px;">🚗</div>
                  <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:700;letter-spacing:-0.5px;">BMZ Location</h1>
                  <p style="color:#888;margin:6px 0 0;font-size:13px;">Votre partenaire de confiance</p>
                </td>
              </tr>

              <!-- SUCCESS BADGE -->
              <tr>
                <td style="padding:36px 40px 0;text-align:center;">
                  <div style="display:inline-block;background:#dcfce7;border-radius:50px;padding:10px 24px;">
                    <span style="color:#16a34a;font-weight:700;font-size:15px;">✓ Paiement confirmé</span>
                  </div>
                  <h2 style="color:#0a0a0a;font-size:22px;font-weight:700;margin:20px 0 6px;">Merci pour votre paiement !</h2>
                  <p style="color:#666;font-size:14px;margin:0;">Votre réservation est maintenant <strong>confirmée</strong>. Vous trouverez <strong>votre contrat de location en pièce jointe (PDF)</strong>. Voici votre récapitulatif :</p>
                </td>
              </tr>

              <!-- DETAILS CARD -->
              <tr>
                <td style="padding:24px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;overflow:hidden;border:1px solid #e8edf2;">
                    <tr style="border-bottom:1px solid #e8edf2;">
                      <td style="padding:14px 20px;color:#888;font-size:13px;">📋 Facture N°</td>
                      <td style="padding:14px 20px;color:#0a0a0a;font-weight:700;font-size:13px;text-align:right;">#${payment.id}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #e8edf2;">
                      <td style="padding:14px 20px;color:#888;font-size:13px;">💰 Montant payé</td>
                      <td style="padding:14px 20px;color:#16a34a;font-weight:800;font-size:15px;text-align:right;">${payment.amount} TND</td>
                    </tr>
                    <tr style="border-bottom:1px solid #e8edf2;">
                      <td style="padding:14px 20px;color:#888;font-size:13px;">💳 Méthode</td>
                      <td style="padding:14px 20px;color:#0a0a0a;font-weight:600;font-size:13px;text-align:right;">Carte bancaire</td>
                    </tr>
                    <tr>
                      <td style="padding:14px 20px;color:#888;font-size:13px;">📅 Date</td>
                      <td style="padding:14px 20px;color:#0a0a0a;font-weight:600;font-size:13px;text-align:right;">${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</td>
                    </tr>
                    ${rental.delivery_requested ? `
                    <tr style="border-top:1px solid #e8edf2;">
                      <td colspan="2" style="padding:14px 20px;background:#f1f5f9;">
                        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0f172a;">📦 Informations de Livraison</p>
                        <p style="margin:4px 0;font-size:12px;color:#475569;">📍 ${rental.delivery_address}</p>
                        <p style="margin:4px 0;font-size:12px;color:#475569;">🚗 Frais livraison: ${rental.delivery_fee} DT | 🔄 Frais récupération: ${rental.return_fee} DT</p>
                      </td>
                    </tr>
                    ` : ""}
                  </table>
                </td>
              </tr>

              <!-- INFO BOX -->
              <tr>
                <td style="padding:0 40px 32px;">
                  <div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:8px;padding:14px 18px;">
                    <p style="margin:0;color:#1e40af;font-size:13px;">📌 Présentez-vous le jour de la prise en charge avec votre <strong>permis de conduire</strong> et votre <strong>pièce d'identité</strong>.</p>
                  </div>
                </td>
              </tr>

              <!-- FOOTER -->
              <tr>
                <td style="background:#f8fafc;border-top:1px solid #e8edf2;padding:24px 40px;text-align:center;">
                  <p style="margin:0 0 6px;color:#888;font-size:12px;">Des questions ? Contactez-nous</p>
                  <p style="margin:0;color:#0a0a0a;font-size:12px;font-weight:600;">📞 +216 29 015 948 &nbsp;|&nbsp; 📧  ${process.env.EMAIL_USER}</p>
                  <p style="margin:12px 0 0;color:#bbb;font-size:11px;">© ${new Date().getFullYear()} BMZ Location — Tous droits réservés</p>
                </td>
              </tr>

            </table>
          </td></tr>
        </table>
      </body>
      </html>
      `;

    } else {
      subject = "📋 Réservation Enregistrée — BMZ Location";

      htmlTemplate = `
      <!DOCTYPE html>
      <html lang="fr">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
          <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

              <!-- HEADER -->
              <tr>
                <td style="background:linear-gradient(135deg,#0a0a0a 0%,#2d2d2d 100%);padding:36px 40px;text-align:center;">
                  <div style="font-size:32px;margin-bottom:10px;">🚗</div>
                  <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:700;letter-spacing:-0.5px;">BMZ Location</h1>
                  <p style="color:#888;margin:6px 0 0;font-size:13px;">Votre partenaire de confiance</p>
                </td>
              </tr>

              <!-- PENDING BADGE -->
              <tr>
                <td style="padding:36px 40px 0;text-align:center;">
                  <div style="display:inline-block;background:#fff7ed;border-radius:50px;padding:10px 24px;">
                    <span style="color:#d97706;font-weight:700;font-size:15px;">⏳ Demande transmise</span>
                  </div>
                  <h2 style="color:#0a0a0a;font-size:22px;font-weight:700;margin:20px 0 6px;">Votre demande est en cours de validation !</h2>
                  <p style="color:#666;font-size:14px;margin:0;">Votre demande de location a été envoyée à l'agence. <strong>Elle est en attente de validation</strong> selon les disponibilités. Vous recevrez très bientôt un email de confirmation définitive.</p>
                </td>
              </tr>

              <!-- DETAILS CARD -->
              <tr>
                <td style="padding:24px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;overflow:hidden;border:1px solid #e8edf2;">
                    <tr style="border-bottom:1px solid #e8edf2;">
                      <td style="padding:14px 20px;color:#888;font-size:13px;">📋 Réservation N°</td>
                      <td style="padding:14px 20px;color:#0a0a0a;font-weight:700;font-size:13px;text-align:right;">#${payment.id}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #e8edf2;">
                      <td style="padding:14px 20px;color:#888;font-size:13px;">💰 Montant dû</td>
                      <td style="padding:14px 20px;color:#d97706;font-weight:800;font-size:15px;text-align:right;">${payment.amount} TND</td>
                    </tr>
                    <tr>
                      <td style="padding:14px 20px;color:#888;font-size:13px;">💵 Mode de paiement</td>
                      <td style="padding:14px 20px;color:#0a0a0a;font-weight:600;font-size:13px;text-align:right;">Espèces (sur place)</td>
                    </tr>
                    ${rental.delivery_requested ? `
                    <tr style="border-top:1px solid #e8edf2;">
                      <td colspan="2" style="padding:14px 20px;background:#f1f5f9;">
                        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0f172a;">📦 Informations de Livraison</p>
                        <p style="margin:4px 0;font-size:12px;color:#475569;">📍 ${rental.delivery_address}</p>
                        <p style="margin:4px 0;font-size:12px;color:#475569;">🚗 Frais livraison: ${rental.delivery_fee} DT | 🔄 Frais récupération: ${rental.return_fee} DT</p>
                      </td>
                    </tr>
                    ` : ""}
                  </table>
                </td>
              </tr>

              <!-- WARNING BOX -->
              <tr>
                <td style="padding:0 40px 32px;">
                  <div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:8px;padding:14px 18px;">
                    <p style="margin:0;color:#92400e;font-size:13px;">⚠️ Veuillez vous présenter à l'agence avec le <strong>montant exact</strong>, votre <strong>permis de conduire</strong> et votre <strong>pièce d'identité</strong>.</p>
                  </div>
                </td>
              </tr>

              <!-- FOOTER -->
              <tr>
                <td style="background:#f8fafc;border-top:1px solid #e8edf2;padding:24px 40px;text-align:center;">
                  <p style="margin:0 0 6px;color:#888;font-size:12px;">Des questions ? Contactez-nous</p>
                  <p style="margin:0;color:#0a0a0a;font-size:12px;font-weight:600;">📞 +216 29 015 948 &nbsp;|&nbsp; 📧  ${process.env.EMAIL_USER}</p>
                  <p style="margin:12px 0 0;color:#bbb;font-size:11px;">© ${new Date().getFullYear()} BMZ Location — Tous droits réservés</p>
                </td>
              </tr>

            </table>
          </td></tr>
        </table>
      </body>
      </html>
      `;
    }

    await client.query('COMMIT');

    // 🔔 Notify admin in real-time
    const io = req.app ? req.app.get('io') : null;
    if (io) {
      const methodLabel = method === 'card' ? '💳 Carte bancaire' : '💵 Espèces';
      io.to('admin-room').emit('new_notification', {
        type: 'new_payment',
        title: '💰 Nouveau Paiement',
        message: `${rental.name} a payé ${rental.total_price} TND pour ${rental.brand} ${rental.model} (${methodLabel}).`,
        timestamp: new Date()
      });
    }

    // Emails are sent after commit
    await sendEmail({
      to: rental.email,
      subject,
      html: htmlTemplate,
      facturePath: contractPath
    });

    if (contractPath && fs.existsSync(contractPath)) {
      fs.unlinkSync(contractPath);
    }

    res.json({
      message: "Payment processed successfully",
      payment,
    });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error("PAYMENT ERROR:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    if (client) client.release();
  }
};



exports.confirmCashPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { payment_id } = req.params;

    const paymentResult = await client.query(
      `SELECT payments.*, rentals.start_date, rentals.end_date, rentals.user_id, rentals.delivery_requested, rentals.delivery_address, rentals.delivery_fee, rentals.return_fee, users.name, users.email, cars.brand, cars.model
       FROM payments
       JOIN rentals ON rentals.id = payments.rental_id
       JOIN users ON users.id = rentals.user_id
       JOIN cars ON cars.id = rentals.car_id
       WHERE payments.id = $1`,
       [payment_id]
    );

    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Payment not found" });
    }

    const payment = paymentResult.rows[0];

    // Vérifier si la voiture est disponible (n'a pas été louée entre-temps)
    const conflict = await client.query(
      `SELECT 1 FROM rentals
       WHERE car_id = $1 AND status IN ('confirmed', 'ongoing')
         AND $2 < (end_date + INTERVAL '3 hours')
         AND $3 > start_date`,
      [payment.car_id, payment.start_date, payment.end_date]
    );

    if (conflict.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: "Action refusée : Ce véhicule a déjà été loué et confirmé pour ces dates par un autre client."
      });
    }

    await client.query(
      `UPDATE payments SET status = 'paid' WHERE id = $1`,
      [payment_id]
    );

    await client.query(
      `UPDATE rentals SET status = 'confirmed' WHERE id = $1`,
      [payment.rental_id]
    );

    await client.query(
      `INSERT INTO facture (user_id, rental_id, total)
       VALUES ($1, $2, $3)
       ON CONFLICT (rental_id) DO NOTHING`,
      [payment.user_id, payment.rental_id, payment.amount]
    );

    // Ajouter les points gagnés au client car le paiement est validé !
    const start = new Date(payment.start_date);
    const end = new Date(payment.end_date);
    const diffDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    const pointsEarned = Math.floor(diffDays * 10);
    
    await client.query("UPDATE users SET points = points + $1 WHERE id = $2", [pointsEarned, payment.user_id]);

    await client.query('COMMIT');

    // 🔔 Notify admin in real-time
    const io = req.app ? req.app.get('io') : null;
    if (io) {
      io.to('admin-room').emit('new_notification', {
        type: 'cash_confirmed',
        title: '✅ Paiement Cash Confirmé',
        message: `Paiement espèces validé pour ${payment.name} (${payment.amount} TND - ${payment.brand} ${payment.model}).`,
        timestamp: new Date()
      });
    }

    const htmlTemplate = `
      <!DOCTYPE html>
      <html lang="fr">
      <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0;padding:0;background:#f0f2f5;font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
          <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

              <tr>
                <td style="background:linear-gradient(135deg,#0a0a0a 0%,#2d2d2d 100%);padding:36px 40px;text-align:center;">
                  <div style="font-size:32px;margin-bottom:10px;">🚗</div>
                  <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:700;letter-spacing:-0.5px;">BMZ Location</h1>
                  <p style="color:#888;margin:6px 0 0;font-size:13px;">Votre partenaire de confiance</p>
                </td>
              </tr>

              <tr>
                <td style="padding:36px 40px 0;text-align:center;">
                  <div style="display:inline-block;background:#dcfce7;border-radius:50px;padding:10px 24px;">
                    <span style="color:#16a34a;font-weight:700;font-size:15px;">✓ Paiement espèces validé</span>
                  </div>
                  <h2 style="color:#0a0a0a;font-size:22px;font-weight:700;margin:20px 0 6px;">Paiement confirmé par l'agence</h2>
                  <p style="color:#666;font-size:14px;margin:0;">Votre paiement en espèces a été <strong>validé</strong> par notre équipe. Voici le récapitulatif :</p>
                </td>
              </tr>

              <tr>
                <td style="padding:24px 40px;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;overflow:hidden;border:1px solid #e8edf2;">
                    <tr style="border-bottom:1px solid #e8edf2;">
                      <td style="padding:14px 20px;color:#888;font-size:13px;">📋 Facture N°</td>
                      <td style="padding:14px 20px;color:#0a0a0a;font-weight:700;font-size:13px;text-align:right;">#${payment.id}</td>
                    </tr>
                    <tr style="border-bottom:1px solid #e8edf2;">
                      <td style="padding:14px 20px;color:#888;font-size:13px;">💰 Montant réglé</td>
                      <td style="padding:14px 20px;color:#16a34a;font-weight:800;font-size:15px;text-align:right;">${payment.amount} TND</td>
                    </tr>
                    <tr>
                      <td style="padding:14px 20px;color:#888;font-size:13px;">💵 Mode de paiement</td>
                      <td style="padding:14px 20px;color:#0a0a0a;font-weight:600;font-size:13px;text-align:right;">Espèces</td>
                    </tr>
                    ${payment.delivery_requested ? `
                    <tr style="border-top:1px solid #e8edf2;">
                      <td colspan="2" style="padding:14px 20px;background:#f1f5f9;">
                        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#0f172a;">📦 Informations de Livraison</p>
                        <p style="margin:4px 0;font-size:12px;color:#475569;">📍 ${payment.delivery_address}</p>
                        <p style="margin:4px 0;font-size:12px;color:#475569;">🚗 Frais livraison: ${payment.delivery_fee} DT | 🔄 Frais récupération: ${payment.return_fee} DT</p>
                      </td>
                    </tr>
                    ` : ""}
                  </table>
                </td>
              </tr>

              <tr>
                <td style="padding:0 40px 32px;">
                  <div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:8px;padding:14px 18px;">
                    <p style="margin:0;color:#1e40af;font-size:13px;">📌 Conservez cet email comme <strong>preuve de paiement</strong>. Bonne route avec BMZ Location !</p>
                  </div>
                </td>
              </tr>

              <tr>
                <td style="background:#f8fafc;border-top:1px solid #e8edf2;padding:24px 40px;text-align:center;">
                  <p style="margin:0 0 6px;color:#888;font-size:12px;">Des questions ? Contactez-nous</p>
                  <p style="margin:0;color:#0a0a0a;font-size:12px;font-weight:600;">📞 +216 29 015 948 &nbsp;|&nbsp; 📧  ${process.env.EMAIL_USER}</p>
                  <p style="margin:12px 0 0;color:#bbb;font-size:11px;">© ${new Date().getFullYear()} BMZ Location — Tous droits réservés</p>
                </td>
              </tr>

            </table>
          </td></tr>
        </table>
      </body>
      </html>
    `;

    let contractPath = null;
    const fs = require("fs");
    try {
      const { generateContract } = require("../utils/generateContractPDF");
      contractPath = await generateContract(
        { id: payment.rental_id, start_date: payment.start_date, end_date: payment.end_date, total_price: payment.amount },
        { name: payment.name, email: payment.email },
        { brand: payment.brand, model: payment.model }
      );
    } catch (err) {
      console.error("PDF GENERATION ERROR:", err);
    }

    await sendEmail({
      to: payment.email,
      subject: "✅ Paiement Confirmé — BMZ Location",
      html: htmlTemplate,
      facturePath: contractPath
    });

    if (contractPath && fs.existsSync(contractPath)) {
      fs.unlinkSync(contractPath);
    }

    res.json({ message: "Cash payment confirmed successfully" });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error("CONFIRM CASH ERROR:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    if (client) client.release();
  }
};

exports.rejectCashPayment = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { payment_id } = req.params;

    const paymentResult = await client.query(
      `SELECT payments.*, rentals.start_date, rentals.end_date, users.name, users.email, cars.brand, cars.model, cars.price_per_day
       FROM payments
       JOIN rentals ON rentals.id = payments.rental_id
       JOIN users ON users.id = rentals.user_id
       JOIN cars ON cars.id = rentals.car_id
       WHERE payments.id = $1`,
       [payment_id]
    );

    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Payment not found" });
    }

    const payment = paymentResult.rows[0];

    if (payment.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "Only pending cash payments can be rejected" });
    }

    // Refuser le paiement et la réservation
    await client.query(`UPDATE payments SET status = 'cancelled' WHERE id = $1`, [payment_id]);
    await client.query(`UPDATE rentals SET status = 'cancelled' WHERE id = $1`, [payment.rental_id]);

    // Vérifier si le client a utilisé 100 points pour réduire le prix, si oui on les lui recrédite
    const start = new Date(payment.start_date);
    const end = new Date(payment.end_date);
    const diffDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    const baseTotal = diffDays * Number(payment.price_per_day);
    if (Number(payment.amount) < baseTotal - 0.01) {
      await client.query("UPDATE users SET points = points + 100 WHERE id = $1", [payment.user_id]);
    }

    await client.query('COMMIT');

    const htmlTemplate = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2 style="color: #e11d48; border-bottom: 2px solid #e11d48; padding-bottom: 10px;">Réservation Refusée</h2>
        <p>Bonjour ${payment.name || 'Client'},</p>
        <p>Nous sommes au regret de vous informer que votre réservation avec paiement en espèces pour le véhicule <strong>${payment.brand} ${payment.model}</strong> a été refusée par l'agence.</p>
        <p>Ce véhicule n'est malheureusement plus disponible pour ces dates.</p>
        <p>N'hésitez pas à consulter notre site pour trouver un autre véhicule correspondant à vos besoins.</p>
        <p>L'équipe BMZ Location</p>
      </div>
    `;

    await sendEmail({
      to: payment.email,
      subject: "❌ Réservation Refusée — BMZ Location",
      html: htmlTemplate
    });

    res.json({ message: "Cash payment rejected successfully" });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error("REJECT CASH ERROR:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    if (client) client.release();
  }
};



exports.getAllPayments = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT payments.*, users.email, cars.brand, cars.model
       FROM payments
       JOIN rentals ON rentals.id = payments.rental_id
       JOIN users ON users.id = rentals.user_id
       JOIN cars ON cars.id = rentals.car_id
       ORDER BY payments.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("GET ALL PAYMENTS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getPendingRefunds = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT payments.*, users.email, users.name, cars.brand, cars.model,
              rentals.start_date, rentals.end_date
       FROM payments
       JOIN rentals ON rentals.id = payments.rental_id
       JOIN users ON users.id = rentals.user_id
       JOIN cars ON cars.id = rentals.car_id
       WHERE payments.refund_status = 'pending'
       ORDER BY payments.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error("GET PENDING REFUNDS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.processRefund = async (req, res) => {
  const { payment_id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const paymentResult = await client.query(
      `SELECT payments.*, users.email, users.name, cars.brand, cars.model,
              rentals.start_date, rentals.end_date
       FROM payments
       JOIN rentals ON rentals.id = payments.rental_id
       JOIN users ON users.id = rentals.user_id
       JOIN cars ON cars.id = rentals.car_id
       WHERE payments.id = $1`,
      [payment_id]
    );

    if (!paymentResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Payment not found" });
    }

    const p = paymentResult.rows[0];

    if (p.refund_status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "This payment does not have a pending refund" });
    }

    await client.query(
      `UPDATE payments SET refund_status = 'refunded' WHERE id = $1`,
      [payment_id]
    );

    await client.query('COMMIT');

    const startDateFr = new Date(p.start_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const endDateFr = new Date(p.end_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body { margin:0; background:#f8fafc; font-family:'Helvetica Neue',Arial,sans-serif; }
  .wrap { max-width:560px; margin:0 auto; padding:40px 20px; }
  .card { background:#fff; border-radius:16px; overflow:hidden; border:1px solid #d1fae5; }
  .header { background:linear-gradient(135deg,#064e3b,#065f46); padding:40px 32px; text-align:center; }
  .icon { width:64px; height:64px; background:rgba(52,211,153,0.2); border-radius:50%; margin:0 auto 16px; font-size:28px; display:flex; align-items:center; justify-content:center; }
  .title { color:#fff; font-size:22px; font-weight:800; margin:0 0 6px; }
  .subtitle { color:#6ee7b7; font-size:14px; margin:0; }
  .body { padding:32px; }
  .success-box { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:16px 20px; margin-bottom:24px; text-align:center; }
  .amount { font-size:32px; font-weight:900; color:#16a34a; margin:0; }
  .amount-label { color:#6b7280; font-size:13px; margin:4px 0 0; }
  .details { background:#f8fafc; border-radius:10px; padding:16px 20px; margin-bottom:24px; border:1px solid #e2e8f0; }
  .row { display:flex; justify-content:space-between; margin-bottom:8px; font-size:13px; }
  .label { color:#64748b; }
  .value { color:#0f172a; font-weight:700; }
  .info { color:#475569; font-size:13px; line-height:1.7; margin-bottom:24px; }
  .cta { display:block; background:#065f46; color:#fff; text-decoration:none; text-align:center; padding:14px; border-radius:10px; font-weight:700; font-size:14px; }
  .footer { padding:20px 32px; text-align:center; border-top:1px solid #f1f5f9; color:#94a3b8; font-size:11px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="header">
      <div class="icon">✅</div>
      <div class="title">Remboursement effectué</div>
      <div class="subtitle">BMZ Location confirme votre remboursement</div>
    </div>
    <div class="body">
      <div class="success-box">
        <div class="amount">${p.amount} TND</div>
        <div class="amount-label">Montant remboursé</div>
      </div>
      <div class="details">
        <div class="row"><span class="label">Véhicule</span><span class="value">${p.brand} ${p.model}</span></div>
        <div class="row"><span class="label">Période</span><span class="value">${startDateFr} → ${endDateFr}</span></div>
        <div class="row"><span class="label">Référence paiement</span><span class="value">#${String(p.id).padStart(5, '0')}</span></div>
        <div class="row"><span class="label">Méthode</span><span class="value">${p.method === 'card' ? 'Carte bancaire' : 'Espèces'}</span></div>
      </div>
      <p class="info">
        Le remboursement de <strong>${p.amount} TND</strong> a été traité par notre équipe.
        ${p.method === 'card' ? 'Le montant sera crédité sur votre carte dans un délai de <strong>2 à 5 jours ouvrables</strong>.' : 'Vous pouvez récupérer votre remboursement en espèces directement à notre agence.'}
      </p>
      <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/" class="cta">Réserver un autre véhicule →</a>
    </div>
    <div class="footer">BMZ Location — Merci de votre confiance.</div>
  </div>
</div>
</body>
</html>`;

    await sendEmail({
      to: p.email,
      subject: `✅ Remboursement de ${p.amount} TND confirmé — BMZ Location`,
      html,
    });

    res.json({ message: "Refund processed successfully" });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error("PROCESS REFUND ERROR:", error);
    res.status(500).json({ message: "Server error" });
  } finally {
    if (client) client.release();
  }
};

// --- BACKGROUND JOB ---
// Annuler automatiquement les paiements "cash" en attente depuis plus de 24 heures.
setInterval(async () => {
  try {
    // Sélectionner les paiements 'pending' créés il y a plus de 24 heures
    const result = await pool.query(
      `SELECT payments.id, payments.rental_id, users.email, users.name, cars.brand, cars.model, cars.price_per_day, rentals.start_date, rentals.end_date, payments.amount, payments.user_id
       FROM payments
       JOIN rentals ON rentals.id = payments.rental_id
       JOIN users ON users.id = rentals.user_id
       JOIN cars ON cars.id = rentals.car_id
       WHERE payments.status = 'pending'
       AND payments.created_at < NOW() - INTERVAL '24 hours'`
    );

    if (result.rows.length === 0) return;

    console.log("[CRON] Expiring " + result.rows.length + " pending cash payments...");

    const { sendEmail } = require("../services/email.service");

    for (const payment of result.rows) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Annuler
        await client.query("UPDATE payments SET status = 'cancelled' WHERE id = $1", [payment.id]);
        await client.query("UPDATE rentals SET status = 'cancelled' WHERE id = $1", [payment.rental_id]);

        // Rembourser les points si utilisés
        const start = new Date(payment.start_date);
        const end = new Date(payment.end_date);
        const diffDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
        const baseTotal = diffDays * Number(payment.price_per_day);
        if (Number(payment.amount) < baseTotal - 0.01) {
          await client.query("UPDATE users SET points = points + 100 WHERE id = $1", [payment.user_id]);
        }

        await client.query('COMMIT');

        // Envoyer email au client
        const htmlTemplate = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #e11d48; border-bottom: 2px solid #e11d48; padding-bottom: 10px;">Demande de Réservation Expirée</h2>
            <p>Bonjour ${payment.name || 'Client'},</p>
            <p>Votre demande de location pour le véhicule <strong>${payment.brand} ${payment.model}</strong> a expiré car elle est restée en attente de validation depuis plus de 24 heures sans suite de notre agence, ou parce que vous n'êtes pas venu la récupérer.</p>
            <p>La réservation a donc été automatiquement annulée.</p>
            <p>L'équipe BMZ Location</p>
          </div>
        `;
        
        await sendEmail({
          to: payment.email,
          subject: "❌ Demande de Réservation Expirée — BMZ Location",
          html: htmlTemplate
        }).catch(err => console.error("Email cron error:", err));

      } catch (e) {
        await client.query('ROLLBACK');
        console.error("[CRON] Erreur lors de l'expiration du paiement " + payment.id, e);
      } finally {
        client.release();
      }
    }
  } catch (error) {
    console.error("[CRON] Fatal error:", error);
  }
}, 1000 * 60 * 60); // Check every 60 minutes
