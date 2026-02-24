const pool = require("../config/db");
const { sendEmail } = require("../services/email.service");

/**
 * USER - Create Payment
 */
exports.createPayment = async (req, res) => {
  try {
    const { rental_id, method } = req.body;
    const user_id = req.user.id;

    const rentalResult = await pool.query(
      `SELECT rentals.*, users.email
       FROM rentals
       JOIN users ON users.id = rentals.user_id
       WHERE rentals.id = $1 AND rentals.user_id = $2`,
      [rental_id, user_id]
    );

    if (rentalResult.rows.length === 0) {
      return res.status(404).json({ message: "Rental not found" });
    }

    const rental = rentalResult.rows[0];

    let paymentStatus = "pending";
    let rentalStatus = "awaiting_payment";

    if (method === "card") {
      paymentStatus = "paid";
      rentalStatus = "confirmed";
    }

    const paymentResult = await pool.query(
      `INSERT INTO payments (rental_id, amount, method, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [rental_id, rental.total_price, method, paymentStatus]
    );

    const payment = paymentResult.rows[0];

    await pool.query(
      `UPDATE rentals SET status = $1 WHERE id = $2`,
      [rentalStatus, rental_id]
    );

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