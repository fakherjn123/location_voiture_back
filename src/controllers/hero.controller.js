const pool = require("../config/db");

const getHeroImages = async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT * FROM hero_images WHERE is_active = true ORDER BY created_at DESC"
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const addHeroImage = async (req, res) => {
    try {
        const { is_active } = req.body;
        const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

        if (!imageUrl) {
            return res.status(400).json({ error: "Image is required" });
        }

        const result = await pool.query(
            "INSERT INTO hero_images (image_url, is_active) VALUES ($1, $2) RETURNING *",
            [imageUrl, is_active !== undefined ? is_active : true]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const updateHeroImage = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        const result = await pool.query(
            "UPDATE hero_images SET is_active = $1 WHERE id = $2 RETURNING *",
            [is_active, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Image not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const deleteHeroImage = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query("DELETE FROM hero_images WHERE id = $1 RETURNING *", [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Image not found" });
        }

        res.json({ message: "Image deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = {
    getHeroImages,
    addHeroImage,
    updateHeroImage,
    deleteHeroImage,
};
