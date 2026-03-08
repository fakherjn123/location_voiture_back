const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return next(); // Pas de token ? On continue normalement en tant que visiteur anonyme
        }

        const token = authHeader.split(" ")[1];

        // Si le token est présent mais vide ou invalide syntaxiquement
        if (!token) return next();

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // On accroche l'utilisateur à la requête !
        next();
    } catch (err) {
        // Si le token est expiré ou corrompu, on l'ignore et on continue (le gars sera traité comme un visiteur)
        next();
    }
};
