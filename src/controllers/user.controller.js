const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");



exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Champs requis manquants" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,'client') RETURNING id, name, email, role",
      [name, email, hashedPassword]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};



exports.addClient = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,'client') RETURNING id, name, email, role",
      [name, email, hashedPassword]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("ADD CLIENT ERROR:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};


exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Email incorrect" });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login success",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};



exports.getUsers = async (req, res) => {
  try {
    const users = await pool.query(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.points,
        u.driving_license_url,
        u.driving_license_status,
        u.driving_license_msg,
        -- Total locations (excl. cancelled)
        (
          SELECT COUNT(*)
          FROM rentals r
          WHERE r.user_id = u.id
            AND r.status != 'cancelled'
        ) as total_rentals,
        -- Total dépensé = somme des total_price des locations non annulées
        (
          SELECT COALESCE(SUM(r.total_price), 0)
          FROM rentals r
          WHERE r.user_id = u.id
            AND r.status != 'cancelled'
        ) as total_spent,
        -- Total réellement payé (paiements paid, non remboursés)
        (
          SELECT COALESCE(SUM(p.amount), 0)
          FROM rentals r
          JOIN payments p ON r.id = p.rental_id
          WHERE r.user_id = u.id
            AND p.status = 'paid'
            AND (p.refund_status IS NULL OR p.refund_status != 'refunded')
        ) as total_paid
      FROM users u
      ORDER BY u.role, u.name
    `);
    res.json(users.rows);
  } catch (error) {
    console.error("GET USERS ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};



exports.getUserRentals = async (req, res) => {
  const rentals = await pool.query(
    "SELECT * FROM rentals WHERE user_id = $1",
    [req.user.id]
  );
  res.json(rentals.rows);
};
exports.getMyProfile = async (req, res) => {
  try {
    const user = await pool.query(
      "SELECT id, name, email, role, points, driving_license_url, driving_license_status, driving_license_msg FROM users WHERE id = $1",
      [req.user.id]
    );

    res.json(user.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
exports.updateMyProfile = async (req, res) => {
  try {
    const { name, email } = req.body;

    const user = await pool.query(
      `
      UPDATE users
      SET name = $1, email = $2
      WHERE id = $3
      RETURNING id, name, email
      `,
      [name, email, req.user.id]
    );

    res.json({
      message: "Profile updated successfully",
      user: user.rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};


exports.uploadLicense = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Veuillez fournir un fichier." });
    }

    const filePath = req.file.path;
    const fileData = fs.readFileSync(filePath);
    const base64Image = fileData.toString('base64');

    // Appel à Gemini pour vérifier l'image
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = "Vérifie si cette image est un permis de conduire ou une pièce d'identité valide (de n'importe quel pays). Réponds UNIQUEMENT par OUI (si c'est bien une pièce d'identité ou un permis) ou NON (si le document est flou, faux, ou si c'est une toute autre image).";
    
    const imagePart = {
        inlineData: {
            data: base64Image,
            mimeType: req.file.mimetype
        }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const aiResponse = result.response.text().trim().toUpperCase();

    // Si NOT "OUI"
    if (!aiResponse.includes("OUI")) {
      fs.unlinkSync(filePath); // Nettoyage de l'image refusée
      return res.status(400).json({ 
        message: "L'IA a rejeté le document. Il ne semble pas être un permis de conduire lisible. Veuillez réessayer avec une image claire." 
      });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    
    await pool.query(
      `UPDATE users SET driving_license_url = $1, driving_license_status = 'pending', driving_license_msg = NULL WHERE id = $2`,
      [fileUrl, req.user.id]
    );

    const io = req.app.get("io");
    if (io) {
      io.to("admin-room").emit("new_notification", {
        type: "license_upload",
        title: "Nouveau Permis à vérifier",
        message: "Un client vient de télécharger un permis pour validation.",
        timestamp: new Date()
      });
    }

    res.json({ 
      message: "Permis téléchargé avec succès et validé par l'IA. Il est en attente d'approbation manuelle.",
      driving_license_url: fileUrl,
      driving_license_status: 'pending'
    });
  } catch (err) {
    console.error("UPLOAD LICENSE ERROR:", err);
    res.status(500).json({ message: "Erreur serveur lors de l'upload ou de l'analyse." });
  }
};

exports.updateLicenseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, msg } = req.body;

    if (!['approved', 'rejected', 'pending'].includes(status)) {
       return res.status(400).json({ message: "Statut invalide" });
    }

    const updated = await pool.query(
      `UPDATE users SET driving_license_status = $1, driving_license_msg = $2 WHERE id = $3 RETURNING id, name, email, driving_license_status`,
      [status, msg || null, id]
    );

    if (updated.rows.length === 0) {
       return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    if (status === 'approved' || status === 'rejected') {
      const { email, name } = updated.rows[0];
      const { sendEmail } = require("../services/email.service");

      const emailHtml = status === 'approved' 
        ? `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 10px;">Permis Validé</h2>
            <p>Bonjour ${name},</p>
            <p>Bonne nouvelle ! Votre permis de conduire a été vérifié et approuvé par notre agence.</p>
            <p>Vous pouvez maintenant procéder à la réservation de vos véhicules librement sur la plateforme.</p>
            <p>Cordialement,<br>L'équipe BMZ Location</p>
          </div>
        `
        : `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #e11d48; border-bottom: 2px solid #e11d48; padding-bottom: 10px;">Permis Refusé</h2>
            <p>Bonjour ${name},</p>
            <p>Nous avons examiné votre document, mais malheureusement il a été refusé pour la raison suivante :</p>
            <div style="background: #fdf2f8; padding: 15px; border-left: 4px solid #be185d; margin: 20px 0;">
              <strong>${msg || 'Document non valide ou illisible'}</strong>
            </div>
            <p>Veuillez vous reconnecter pour télécharger une nouvelle copie de votre permis de conduire.</p>
            <p>Cordialement,<br>L'équipe BMZ Location</p>
          </div>
        `;

      await sendEmail({
        to: email,
        subject: status === 'approved' ? "Votre permis a été validé ! - BMZ Location" : "Document refusé - BMZ Location",
        html: emailHtml
      });
    }

    res.json({ message: "Statut du permis mis à jour", user: updated.rows[0] });
  } catch (error) {
    console.error("UPDATE LICENSE STATUS ERROR:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

exports.logout = (req, res) => {
  return res.status(200).json({
    message: "Déconnexion réussie"
  });
};
