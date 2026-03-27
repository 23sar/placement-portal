const db = require('../config/db');
const bcrypt = require('bcrypt');

exports.register = async (req, res) => {
  const { name, email, password, role } = req.body;

  const hashed = await bcrypt.hash(password, 10);

  const sql = "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)";

  db.query(sql, [name, email, hashed, role], (err, result) => {
  if (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.send('Email already exists');
    }
    return res.send(err);
  }
  res.send('User registered');
});
};

const jwt = require('jsonwebtoken');

exports.login = (req, res) => {
  const { email, password } = req.body;

  const sql = "SELECT * FROM users WHERE email = ?";

  db.query(sql, [email], async (err, result) => {
    if (err) return res.send(err);

    if (result.length === 0) {
      return res.send('User not found');
    }

    const user = result[0];

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.send('Invalid password');
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      message: 'Login successful',
      token
    });
  });
};