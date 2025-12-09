// Vercel/Serverless entrypoint: export the Express app without auto-starting a listener.
const { app } = require('../server');

module.exports = app;
