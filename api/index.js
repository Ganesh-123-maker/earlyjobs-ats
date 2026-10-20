// Vercel serverless entry: run the Express app per invocation.
// ensureReady() runs the idempotent boot (schema + seed-on-empty) on cold start.
const fs = require('fs');
const path = require('path');
const { app, ensureReady } = require('../server');

const INDEX_HTML = path.join(__dirname, '..', 'public', 'index.html');

module.exports = async (req, res) => {
  const url = req.url || '/';
  // Serve the SPA entry directly: express.static's directory index for "/"
  // crashes in the serverless runtime. The page is static; APIs self-boot.
  if (url === '/' || url.startsWith('/?')) {
    const html = fs.readFileSync(INDEX_HTML, 'utf8');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
    return;
  }
  await ensureReady();
  app(req, res);
};
