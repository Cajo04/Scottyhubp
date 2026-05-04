require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDB } = require('./db');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const postRoutes = require('./routes/posts');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, slow down!'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many auth attempts, try again later.'
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(limiter);

// Serve frontend static files
const frontendBuild = path.join(__dirname, '../scottyhub/dist');
app.use(express.static(frontendBuild));

// Health check
app.get('/api', (req, res) => {
  res.json({ status: 'ScottyHub API is running 🚀', version: '2.0.0', db: 'Turso' });
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);

// Catch-all: serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendBuild, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong' });
});

// Init DB then start server
initDB()
  .then(() => {
    app.listen(PORT, () => console.log(`🚀 ScottyHub running on port ${PORT}`));
  })
  .catch(err => {
    console.error('❌ DB init failed:', err.message);
    process.exit(1);
  });
