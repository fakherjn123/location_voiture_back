const pool = require("../config/db");
const { sendEmail } = require("../services/email.service");

/**
 * USER - Create Payment
 */
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
      subject = "Paiement Confirmé - Jnayeh Location";

      htmlTemplate = `
      <!DOCTYPE html>
      <html>
      <body style="margin:0;background:#f4f6f9;font-family:Arial;">
      <table width="100%" style="padding:30px 0;">
      <tr><td align="center">

      <table width="600" style="background:#fff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#000;padding:30px;text-align:center;">
            <h1 style="color:#fff;margin:0;">🚗 Jnayeh Location</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:40px;text-align:center;">
            <h2 style="color:#28a745;">Paiement Confirmé</h2>
            <p>Votre réservation est maintenant confirmée.</p>

            <table width="100%" style="margin-top:20px;">
              <tr>
                <td align="left">Facture N°</td>
                <td align="right"><strong>${payment.id}</strong></td>
              </tr>
              <tr>
                <td align="left">Montant</td>
                <td align="right"><strong>${payment.amount} TND</strong></td>
              </tr>
              <tr>
                <td align="left">Méthode</td>
                <td align="right"><strong>${payment.method}</strong></td>
              </tr>
            </table>

          </td>
        </tr>

        <tr>
          <td style="background:#fafafa;padding:20px;text-align:center;font-size:12px;color:#888;">
            Merci pour votre confiance 🚗
          </td>
        </tr>

      </table>

      </td></tr>
      </table>
      </body>
      </html>
      `;

    } else {
      subject = "Réservation Enregistrée - Jnayeh Location";

      htmlTemplate = `
      <!DOCTYPE html>
      <html>
      <body style="margin:0;background:#f4f6f9;font-family:Arial;">
      <table width="100%" style="padding:30px 0;">
      <tr><td align="center">

      <table width="600" style="background:#fff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#111;padding:30px;text-align:center;">
            <h1 style="color:#fff;margin:0;">🚗 Jnayeh Location</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:40px;text-align:center;">
            <h2 style="color:#ff9800;">Réservation enregistrée</h2>
            <p>Veuillez effectuer le paiement sur place.</p>
            <p>Facture N° : <strong>${payment.id}</strong></p>
          </td>
        </tr>

        <tr>
          <td style="background:#fafafa;padding:20px;text-align:center;font-size:12px;color:#888;">
            Merci pour votre confiance 🚗
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


/**
 * ADMIN - Confirm Cash Payment
 */
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

    // Create facture immediately when cash payment is confirmed
    await pool.query(
      `INSERT INTO facture (user_id, rental_id, total)
       VALUES ($1, $2, $3)
       ON CONFLICT (rental_id) DO NOTHING`,
      [payment.user_id, payment.rental_id, payment.amount]
    );

    const htmlTemplate = `
      <html>
      <body style="font-family:Arial;background:#f4f6f9;padding:40px;text-align:center;">
        <div style="background:#fff;padding:40px;border-radius:12px;">
          <h2 style="color:#28a745;">Paiement confirmé</h2>
          <p>Votre paiement en espèces a été validé.</p>
          <p>Facture N° : <strong>${payment.id}</strong></p>
          <p>Montant : <strong>${payment.amount} TND</strong></p>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: payment.email,
      subject: "Paiement Confirmé - Jnayeh Location",
      html: htmlTemplate,
    });

    res.json({ message: "Cash payment confirmed successfully" });

  } catch (error) {
    console.error("CONFIRM CASH ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ADMIN - Get All Payments
 */
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