const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { sendOTP, sendVerification } = require('../utils/email');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ message: 'All fields are required' });

    // Check existing
    const exists = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ? OR username = ?',
      args: [email.toLowerCase(), username]
    });
    if (exists.rows.length > 0)
      return res.status(400).json({ message: 'Email or username already taken' });

    const id = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.execute({
      sql: `INSERT INTO users (id, username, email, password, otp_code, otp_expires)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, username, email.toLowerCase(), hashedPassword, otp, otpExpires]
    });

    await sendVerification(email, username, otp);
    res.status(201).json({ message: 'Registered! Check your email for the verification code.', userId: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/verify
router.post('/verify', async (req, res) => {
  try {
    const { userId, otp } = req.body;
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [userId]
    });

    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const user = result.rows[0];

    if (user.is_verified) return res.status(400).json({ message: 'Already verified' });
    if (!user.otp_code || user.otp_code !== otp || new Date() > new Date(user.otp_expires))
      return res.status(400).json({ message: 'Invalid or expired OTP' });

    await db.execute({
      sql: 'UPDATE users SET is_verified = 1, otp_code = NULL, otp_expires = NULL WHERE id = ?',
      args: [userId]
    });

    const token = generateToken(userId);
    res.json({
      message: 'Account verified!',
      token,
      user: { id: userId, username: user.username, email: user.email, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email.toLowerCase()]
    });

    if (result.rows.length === 0)
      return res.status(401).json({ message: 'Invalid email or password' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid email or password' });

    if (!user.is_verified)
      return res.status(403).json({ message: 'Please verify your email first' });

    const token = generateToken(user.id);
    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role, avatar: user.avatar }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/send-otp  (forgot password / resend)
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email.toLowerCase()]
    });

    if (result.rows.length === 0)
      return res.status(404).json({ message: 'No account with that email' });

    const user = result.rows[0];
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.execute({
      sql: 'UPDATE users SET otp_code = ?, otp_expires = ? WHERE id = ?',
      args: [otp, otpExpires, user.id]
    });

    await sendOTP(email, user.username, otp);
    res.json({ message: 'OTP sent!', userId: user.id });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { userId, otp, newPassword } = req.body;
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE id = ?',
      args: [userId]
    });

    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const user = result.rows[0];

    if (!user.otp_code || user.otp_code !== otp || new Date() > new Date(user.otp_expires))
      return res.status(400).json({ message: 'Invalid or expired OTP' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.execute({
      sql: 'UPDATE users SET password = ?, otp_code = NULL, otp_expires = NULL WHERE id = ?',
      args: [hashedPassword, userId]
    });

    res.json({ message: 'Password reset successful!' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

    const otp = generateOTP();
    user.otp = { code: otp, expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
    await user.save();

    await sendOTP(email, user.username, otp);
    res.json({ message: 'OTP sent!', userId: user._id });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { userId, otp, newPassword } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.otp?.code || user.otp.code !== otp || new Date() > user.otp.expiresAt)
      return res.status(400).json({ message: 'Invalid or expired OTP' });

    user.password = newPassword;
    user.otp = undefined;
    await user.save();

    res.json({ message: 'Password reset successful!' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
