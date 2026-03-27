const jwt = require('jsonwebtoken');

exports.verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];

  if (!token) return res.send('Access denied');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.send('Invalid token');
  }
};

exports.checkRole = (role) => {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.send('Access forbidden');
    }
    next();
  };
};