const db      = require('../config/db');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');

const ALLOWED_ROLES = ['student', 'company'];

exports.register = async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields (name, email, password, role) are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Allowed: ${ALLOWED_ROLES.join(', ')}.` });
  }

  try {
    const hashed = await bcrypt.hash(password, 10);
    db.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashed, role],
      (err) => {
        if (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Email is already registered.' });
          }
          console.error('[register] DB error:', err.message);
          return res.status(500).json({ error: 'Registration failed. Please try again.' });
        }
        return res.status(201).json({ message: 'User registered successfully.' });
      },
    );
  } catch (err) {
    console.error('[register] Unexpected error:', err.message);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
};

exports.login = (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, rows) => {
    if (err) {
      console.error('[login] DB error:', err.message);
      return res.status(500).json({ error: 'Login failed. Please try again.' });
    }
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = rows[0];
    try {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(401).json({ error: 'Invalid email or password.' });

      const token = jwt.sign(
        { id: user.id, role: user.role, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: '1d' },
      );

      return res.status(200).json({
        message: 'Login successful.',
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    } catch (bcryptErr) {
      console.error('[login] bcrypt error:', bcryptErr.message);
      return res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  });
};
