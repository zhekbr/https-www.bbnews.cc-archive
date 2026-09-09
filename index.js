import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';
const DIST_DIR = path.resolve(__dirname, 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function resolveFilePath(urlPath) {
  let cleanPath = urlPath.split('?')[0].split('#')[0];
  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch {
    return null;
  }

  // Prevent directory traversal
  const safePath = path.normalize(cleanPath).replace(/^(\.\.[\/\\])+/, '');
  const targetPath = path.join(DIST_DIR, safePath);

  // Check exact file match
  if (fs.existsSync(targetPath)) {
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      const indexHtml = path.join(targetPath, 'index.html');
      if (fs.existsSync(indexHtml)) return indexHtml;
    } else if (stat.isFile()) {
      return targetPath;
    }
  }

  // Check if targetPath + '.html' exists (e.g. /en/archive -> /en/archive.html)
  if (fs.existsSync(targetPath + '.html')) {
    const stat = fs.statSync(targetPath + '.html');
    if (stat.isFile()) return targetPath + '.html';
  }

  // Check sub-index
  const subIndex = path.join(targetPath, 'index.html');
  if (fs.existsSync(subIndex)) {
    return subIndex;
  }

  // Language & Section Fallbacks (matching rewrite rules)
  if (safePath.startsWith('/en/news/') || safePath.startsWith('/en/tag/') || safePath.startsWith('/en/region/')) {
    const enIndex = path.join(DIST_DIR, 'en', 'index.html');
    if (fs.existsSync(enIndex)) return enIndex;
  }

  if (safePath.startsWith('/pt/news/') || safePath.startsWith('/pt/tag/') || safePath.startsWith('/pt/regiao/')) {
    const ptIndex = path.join(DIST_DIR, 'pt', 'index.html');
    if (fs.existsSync(ptIndex)) return ptIndex;
  }

  // Root fallback
  const rootIndex = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(rootIndex)) return rootIndex;

  return null;
}

const server = http.createServer((req, res) => {
  // Health check endpoint for Render / monitoring
  if (req.url === '/healthz' || req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
  }

  const filePath = resolveFilePath(req.url);

  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 - Not Found</h1></body></html>');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const headers = {
    'Content-Type': contentType,
  };

  if (filePath.includes(path.sep + 'assets' + path.sep)) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  } else if (ext === '.css' || ext === '.js') {
    headers['Cache-Control'] = 'public, max-age=86400, stale-while-revalidate=604800';
  } else if (ext === '.html') {
    headers['Cache-Control'] = 'public, max-age=0, must-revalidate';
  }

  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
});

// Auto-build if dist directory does not exist
if (!fs.existsSync(DIST_DIR) || !fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.log('⚠️ [BBN Server] dist directory not found. Executing build.mjs...');
  const { execSync } = await import('child_process');
  try {
    execSync('node build.mjs', { stdio: 'inherit' });
  } catch (err) {
    console.error('❌ Build failed during startup:', err);
  }
}

server.listen(PORT, HOST, () => {
  console.log(`🚀 BBN Production Web Service listening on http://${HOST}:${PORT}`);
  console.log(`📁 Serving static files from: ${DIST_DIR}`);
});
