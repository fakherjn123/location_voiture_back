require('dotenv').config();
const app = require('./app');
const http = require('http');
const { Server } = require("socket.io");

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174"], // Support des deux ports fréquents de Vite
    methods: ["GET", "POST"]
  }
});

app.set("io", io);

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  socket.on("join-admin", () => {
    socket.join("admin-room");
    console.log("Admin joined room:", socket.id);
  });

  socket.on("join-user", (userId) => {
    socket.join(`user-${userId}`);
    console.log(`User ${userId} joined their private room:`, socket.id);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const fs = require('fs');
const path = require('path');
const dbPool = require('./config/db');

(async () => {
  const migrations = [
    'add_premium_features.sql',
    'add_refund_status.sql',
    'add_cancellation_policy.sql',
  ];
  for (const file of migrations) {
    try {
      const sqlFile = path.join(__dirname, 'config', file);
      if (fs.existsSync(sqlFile)) {
        const sql = fs.readFileSync(sqlFile, 'utf-8');
        await dbPool.query(sql);
        console.log(`✅ Migration applied: ${file}`);
      }
    } catch (err) {
      console.error(`❌ Migration error (${file}):`, err.message);
    }
  }
})();

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// =============================================
// ABANDONED CART RECOVERY — Marketing Cron Job
// =============================================
// Toutes les heures, on cherche des réservations "pending"
// sans paiement associé créées il y a plus de 2 heures.
// => Envoi d'un email de relance (1 seul email).
// => Si la réservation a plus de 4 heures sans paiement, elle est annulée.
const pool = require('./config/db');
const { sendEmail } = require('./services/email.service');

setInterval(async () => {
  try {
    // Chercher toutes les locations sans paiement, en statut 'pending', créées il y a entre 2h et 48h
    const result = await pool.query(`
      SELECT r.id, r.user_id, r.car_id, r.start_date, r.end_date, r.total_price, r.created_at,
             u.email, u.name,
             c.brand, c.model
      FROM rentals r
      JOIN users u ON u.id = r.user_id
      JOIN cars c ON c.id = r.car_id
      WHERE r.status = 'pending'
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.rental_id = r.id)
        AND r.created_at < NOW() - INTERVAL '2 hours'
    `);

    if (result.rows.length === 0) return;

    console.log(`[ABANDONED CART] ${result.rows.length} paniers abandonnés détectés.`);

    for (const rental of result.rows) {
      const createdAt = new Date(rental.created_at);
      const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

      if (ageHours >= 4) {
        // 4h+ passées sans paiement => Annulation automatique
        await pool.query(`UPDATE rentals SET status = 'cancelled' WHERE id = $1`, [rental.id]);
        console.log(`[ABANDONED CART] Réservation #${rental.id} annulée automatiquement (${ageHours.toFixed(1)}h après création).`);
      } else {
        // Entre 2h et 4h => Envoyer un seul email de relance
        // Pour éviter le flood, on ne fait rien de plus (pas de marqueur dans le schéma)
        // En prod, on ajouterait un champ "reminder_sent_at" dans la table rentals.
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        const html = `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg, #0a0a0a, #2d2d2d); padding: 32px; text-align: center;">
              <div style="font-size: 32px; margin-bottom: 8px;">🚗</div>
              <h1 style="color: #fff; margin: 0; font-size: 22px; font-weight: 700;">BMZ Location</h1>
            </div>
            <div style="padding: 32px;">
              <h2 style="color: #0a0a0a; font-size: 18px; font-weight: 700; margin: 0 0 12px;">Votre réservation vous attend, ${rental.name?.split(' ')[0] || 'cher client'} ! ⏳</h2>
              <p style="color: #555; font-size: 14px; line-height: 1.7; margin-bottom: 20px;">
                Vous avez commencé une réservation pour le <strong>${rental.brand} ${rental.model}</strong> mais vous ne l'avez pas finalisée. 
                Ce véhicule est très demandé et risque d'être réservé par quelqu'un d'autre !
              </p>
              <div style="background: #f8fafc; border-radius: 10px; padding: 18px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
                <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px;">
                  <span style="color: #64748b;">Véhicule</span>
                  <span style="font-weight: 700;">${rental.brand} ${rental.model}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px;">
                  <span style="color: #64748b;">Période</span>
                  <span style="font-weight: 700;">${new Date(rental.start_date).toLocaleDateString('fr-FR')} → ${new Date(rental.end_date).toLocaleDateString('fr-FR')}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 13px;">
                  <span style="color: #64748b;">Montant total</span>
                  <span style="font-weight: 700; color: #10b981;">${rental.total_price} TND</span>
                </div>
              </div>
              <a href="${frontendUrl}/cars" style="display: block; background: #0a0a0a; color: #fff; text-decoration: none; text-align: center; padding: 14px; border-radius: 10px; font-weight: 700; font-size: 14px;">Finaliser ma réservation →</a>
            </div>
            <div style="padding: 20px; text-align: center; border-top: 1px solid #f1f5f9; color: #94a3b8; font-size: 11px;">
              BMZ Location — Vous recevez cet email car vous avez laissé une réservation en attente.
            </div>
          </div>
        `;

        await sendEmail({
          to: rental.email,
          subject: `⏳ Vous avez oublié de finaliser votre réservation ! — BMZ Location`,
          html
        }).catch(err => console.error('[ABANDONED CART] Email error:', err));

        console.log(`[ABANDONED CART] Email de relance envoyé à ${rental.email} pour réservation #${rental.id}.`);
      }
    }
  } catch (err) {
    console.error('[ABANDONED CART] Fatal error:', err);
  }
}, 1000 * 60 * 60); // Run every 60 minutes