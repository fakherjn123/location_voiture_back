const pool = require("../config/db");
const { sendEmail } = require("../services/email.service");

exports.createPayment = async (req, res) => {
  try {
    const { rental_id, method } = req.body;

    if (!rental_id || !method) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const rentalResult = await pool.query(
      `
      SELECT rentals.*, users.email
      FROM rentals
      JOIN users ON users.id = rentals.user_id
      WHERE rentals.id = $1
      `,
      [rental_id]
    );

    if (rentalResult.rows.length === 0) {
      return res.status(404).json({ message: "Rental not found" });
    }

    const rental = rentalResult.rows[0];

    // 🔒 Vérifier propriétaire
    if (rental.user_id !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized rental" });
    }

    // FIX #4: Empêcher le double paiement
    const existingPayment = await pool.query(
      `SELECT 1 FROM payments WHERE rental_id = $1`,
      [rental_id]
    );

    if (existingPayment.rows.length > 0) {
      return res.status(400).json({ message: "Payment already exists for this rental" });
    }

    // FIX #4: Vérifier que la location est dans un état payable
    if (!["confirmed", "awaiting_payment"].includes(rental.status)) {
      return res.status(400).json({ message: "This rental cannot be paid" });
    }

    let paymentStatus = method === "card" ? "paid" : "pending";
    let rentalStatus = method === "card" ? "confirmed" : "awaiting_payment";

    const paymentResult = await pool.query(
      `
      INSERT INTO payments (rental_id, amount, method, status)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [rental_id, rental.total_price, method, paymentStatus]
    );

    const payment = paymentResult.rows[0];

    await pool.query(
      `UPDATE rentals SET status = $1 WHERE id = $2`,
      [rentalStatus, rental_id]
    );

    // Create facture immediately if paid via card
    if (method === "card") {
      await pool.query(
        `INSERT INTO facture (user_id, rental_id, total)
         VALUES ($1, $2, $3)
         ON CONFLICT (rental_id) DO NOTHING`,
        [rental.user_id, rental_id, rental.total_price]
      );
    }

    let subject;
    let htmlTemplate;

    if (method === "card") {
      subject = "✅ Paiement Confirmé — BMZ Location";

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
                  <p style="color:#666;font-size:14px;margin:0;">Votre réservation est maintenant <strong>confirmée</strong>. Voici votre récapitulatif :</p>
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
                    <span style="color:#d97706;font-weight:700;font-size:15px;">⏳ Paiement en attente</span>
                  </div>
                  <h2 style="color:#0a0a0a;font-size:22px;font-weight:700;margin:20px 0 6px;">Votre réservation est enregistrée !</h2>
                  <p style="color:#666;font-size:14px;margin:0;">Le paiement sera effectué <strong>sur place</strong> lors de la prise en charge du véhicule.</p>
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

    await sendEmail({
      to: rental.email,
      subject,
      html: htmlTemplate,
    });

    res.json({
      message: "Payment processed successfully",
      payment,
    });

  } catch (error) {
    console.error("PAYMENT ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};


   
exports.confirmCashPayment = async (req, res) => {
  try {
    const { payment_id } = req.params;

    const paymentResult = await pool.query(
      `SELECT payments.*, rentals.user_id, users.email
       FROM payments
       JOIN rentals ON rentals.id = payments.rental_id
       JOIN users ON users.id = rentals.user_id
       WHERE payments.id = $1`,
      [payment_id]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const payment = paymentResult.rows[0];

    await pool.query(
      `UPDATE payments SET status = 'paid' WHERE id = $1`,
      [payment_id]
    );

    await pool.query(
      `UPDATE rentals SET status = 'confirmed' WHERE id = $1`,
      [payment.rental_id]
    );

    await pool.query(
      `INSERT INTO facture (user_id, rental_id, total)
       VALUES ($1, $2, $3)
       ON CONFLICT (rental_id) DO NOTHING`,
      [payment.user_id, payment.rental_id, payment.amount]
    );

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

    await sendEmail({
      to: payment.email,
      subject: "✅ Paiement Confirmé — BMZ Location",
      html: htmlTemplate,
    });

    res.json({ message: "Cash payment confirmed successfully" });

  } catch (error) {
    console.error("CONFIRM CASH ERROR:", error);
    res.status(500).json({ message: "Server error" });
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