require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const leaderboardsRoutes = require('./routes/leaderboards');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true }));
app.use(express.json());

// REST API
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/leaderboards', leaderboardsRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'poker-trainer-api' });
});

// Optional: serve frontend in production (static files from ../../frontend)
const frontendPath = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(frontendPath));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Poker Trainer API running at http://localhost:${PORT}`);
});
