const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const apiRouter = require('./routes');
const { init, seed } = require('./db');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// API
app.use(apiRouter);

// Fallback 404 for unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    error: { message: 'Not found', code: 'not_found' }
  });
});

async function start() {
  await init();
  await seed();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});

module.exports = app;
