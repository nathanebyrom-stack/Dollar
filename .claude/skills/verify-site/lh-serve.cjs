// Serves dist/ for Lighthouse the way Netlify would: the real CSP from netlify.toml, Brotli for text, long cache for assets.
//   node .claude/skills/verify-site/lh-serve.cjs [port]      (default 4173; build first: node scripts/build.mjs)
// Dev-only. Lighthouse against this is a close stand-in for the deployed preview, minus the CDN's network.
const http = require('http');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const dist = path.join(root, 'dist');
const csp = /Content-Security-Policy\s*=\s*"([^"]+)"/.exec(fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8'))[1]
  .replace('; upgrade-insecure-requests', '');
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.avif': 'image/avif', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml',
};
const compressible = new Set(['.html', '.css', '.js', '.svg', '.json', '.txt', '.xml']);

http.createServer((req, res) => {
  let p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(dist)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  const found = fs.existsSync(p);
  if (!found) p = path.join(dist, '404.html');
  const ext = path.extname(p);
  const headers = {
    'Content-Type': types[ext] || 'application/octet-stream',
    'Content-Security-Policy': csp,
    'Accept-Ranges': 'bytes',
    'Cache-Control': ext === '.html' ? 'public, max-age=0, must-revalidate' : 'public, max-age=31536000, immutable',
  };
  let body = fs.readFileSync(p);
  if (compressible.has(ext) && /\bbr\b/.test(req.headers['accept-encoding'] || '')) {
    body = zlib.brotliCompressSync(body);
    headers['Content-Encoding'] = 'br';
    headers['Vary'] = 'Accept-Encoding';
  }
  res.writeHead(found ? 200 : 404, headers);
  res.end(body);
}).listen(Number(process.argv[2]) || 4173, '127.0.0.1', function () {
  console.log('Serving dist/ on http://127.0.0.1:' + this.address().port);
});
