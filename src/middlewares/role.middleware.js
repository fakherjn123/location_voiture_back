module.exports = (roles) => {
  return (req, res, next) => {
    console.log("ROLE CHECK:", req.user.role, "REQUIRED:", roles);

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  };
};
