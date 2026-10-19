// Vercel serverless entry: run the Express app per invocation.
// ensureReady() runs the idempotent boot (schema + seed-on-empty) on cold start.
const { app, ensureReady } = require('../server');

module.exports = async (req, res) => {
  await ensureReady();
  app(req, res);
};
