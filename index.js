import http from 'http';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
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

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' https: data:",
    "connect-src 'self' https://*.supabase.co https://api.binance.com https://www.google-analytics.com https://region1.google-analytics.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; '),
};

function isInsideDist(candidatePath) {
  const resolved = path.resolve(candidatePath);
  return resolved === DIST_DIR || resolved.startsWith(DIST_DIR + path.sep);
}

async function safeStat(filePath) {
  if (!isInsideDist(filePath)) return null;
  try {
    return await fsp.stat(filePath);
  } catch {
    return null;
  }
}

async function resolveFilePath(urlPath) {
  if (typeof urlPath !== 'string' || urlPath.includes('\0')) return null;

  let cleanPath = urlPath.split('?')[0].split('#')[0];
  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch {
    return null;
  }

  if (cleanPath.includes('\0')) return null;

  // Normalize and strictly enforce DIST_DIR boundary
  const normalized = path.posix.normalize(cleanPath.replace(/\\/g, '/'));
  const relative = normalized.replace(/^\/+/, '');
  const targetPath = path.resolve(DIST_DIR, relative);

  if (!isInsideDist(targetPath)) {
    return null;
  }

  // Check exact file match
  const exactStat = await safeStat(targetPath);
  if (exactStat) {
    if (exactStat.isDirectory()) {
      const indexHtml = path.join(targetPath, 'index.html');
      const idxStat = await safeStat(indexHtml);
      if (idxStat?.isFile()) return indexHtml;
    } else if (exactStat.isFile()) {
      return targetPath;
    }
  }

  // Check if targetPath + '.html' exists (e.g. /en/archive -> /en/archive.html)
  const htmlPath = targetPath + '.html';
  const htmlStat = await safeStat(htmlPath);
  if (htmlStat?.isFile()) return htmlPath;

  // Check sub-index
  const subIndex = path.join(targetPath, 'index.html');
  const subStat = await safeStat(subIndex);
  if (subStat?.isFile()) return subIndex;

  // Language & Section Fallbacks (matching rewrite rules)
  if (normalized.startsWith('/en/news/') || normalized.startsWith('/en/tag/') || normalized.startsWith('/en/region/')) {
    const enIndex = path.join(DIST_DIR, 'en', 'index.html');
    if ((await safeStat(enIndex))?.isFile()) return enIndex;
  }

  if (normalized.startsWith('/pt/news/') || normalized.startsWith('/pt/tag/') || normalized.startsWith('/pt/regiao/')) {
    const ptIndex = path.join(DIST_DIR, 'pt', 'index.html');
    if ((await safeStat(ptIndex))?.isFile()) return ptIndex;
  }

  // Root fallback
  const rootIndex = path.join(DIST_DIR, 'index.html');
  if ((await safeStat(rootIndex))?.isFile()) return rootIndex;

  return null;
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, {
      ...SECURITY_HEADERS,
      'Allow': 'GET, HEAD',
      'Content-Type': 'text/plain; charset=utf-8',
    });
    return res.end('Method Not Allowed');
  }

  // Health check endpoint for Render / monitoring
  if (req.url === '/healthz' || req.url === '/ping') {
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'application/json' });
    return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok', uptime: process.uptime() }));
  }

  const filePath = await resolveFilePath(req.url || '/');

  if (!filePath) {
    res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(
      req.method === 'HEAD'
        ? undefined
        : '<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 - Not Found</h1></body></html>'
    );
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const headers = {
    ...SECURITY_HEADERS,
    'Content-Type': contentType,
  };

  if (filePath.includes(path.sep + 'assets' + path.sep)) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  } else if (ext === '.css' || ext === '.js') {
    headers['Cache-Control'] = 'public, max-age=86400, stale-while-revalidate=604800';
  } else if (ext === '.html') {
    headers['Cache-Control'] = 'public, max-age=0, must-revalidate';
  }

  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    return res.end();
  }

  const stream = fs.createReadStream(filePath);
  stream.on('open', () => {
    res.writeHead(200, headers);
    stream.pipe(res);
  });
  stream.on('error', (err) => {
    console.error(`[BBN Server] Read error for ${filePath}:`, err.code || err.message);
    if (!res.headersSent) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500, {
        ...SECURITY_HEADERS,
        'Content-Type': 'text/plain; charset=utf-8',
      });
    }
    res.end(err.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
  });
});

server.headersTimeout = 10000;
server.requestTimeout = 30000;
server.keepAliveTimeout = 5000;

// Auto-build if dist directory does not exist
if (!fs.existsSync(DIST_DIR) || !fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.log('⚠️ [BBN Server] dist directory not found. Executing build.mjs...');
  const { execFileSync } = await import('child_process');
  try {
    execFileSync(process.execPath, ['build.mjs'], { stdio: 'inherit' });
  } catch (err) {
    console.error('❌ Build failed during startup:', err);
  }
}

server.listen(PORT, HOST, () => {
  console.log(`🚀 BBN Production Web Service listening on http://${HOST}:${PORT}`);
  console.log(`📁 Serving static files from: ${DIST_DIR}`);
});
