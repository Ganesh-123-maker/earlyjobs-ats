// Vercel serverless entry: run the Express app per invocation.
// ensureReady() runs the idempotent boot (schema + seed-on-empty) on cold start.
const { app, ensureReady } = require('../server');

module.exports = async (req, res) => {
  await ensureReady();
  // express.static's directory index for "/" crashes in the serverless
  // runtime; serve the file directly instead (identical response).
  const url = req.url || '/';
  if (url === '/' || url.startsWith('/?')) req.url = '/index.html' + url.slice(1);
  app(req, res);
};
