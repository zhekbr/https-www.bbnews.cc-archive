import { execFile } from 'child_process';
import crypto from 'crypto';
import http from 'http';
import 'dotenv/config';

const PORT = parseInt(process.env.PORT || '9000', 10);
const HOST = process.env.WEBHOOK_HOST || '127.0.0.1'; // Bind local por padrão; use proxy reverso TLS se precisar expor
const MAX_BODY_BYTES = 16 * 1024; // 16 KB

const BUILD_WEBHOOK_TOKEN = process.env.BUILD_WEBHOOK_TOKEN;
if (!BUILD_WEBHOOK_TOKEN) {
  console.error('[FATAL] BUILD_WEBHOOK_TOKEN não definida no .env');
  process.exit(1);
}

let isBuilding = false;

function verifyToken(provided, expected) {
  if (typeof provided !== 'string' || !provided) return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function runCommand(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(Object.assign(error, { stdout, stderr }));
      resolve({ stdout, stderr });
    });
  });
}

const server = http.createServer((req, res) => {
  const securityHeaders = {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  };

  // Rota de build protegida por token de header
  if (req.method === 'POST' && req.url === '/trigger-build-bbn-secret') {
    let bodyBytes = 0;
    let aborted = false;

    req.on('data', (chunk) => {
      bodyBytes += chunk.length;
      if (bodyBytes > MAX_BODY_BYTES && !aborted) {
        aborted = true;
        res.writeHead(413, securityHeaders);
        res.end(JSON.stringify({ success: false, error: 'Payload too large' }));
        req.destroy();
      }
    });

    req.on('end', async () => {
      if (aborted) return;

      // Verificação em tempo constante do token no header
      const token = Array.isArray(req.headers['x-webhook-token'])
        ? req.headers['x-webhook-token'][0]
        : req.headers['x-webhook-token'];

      if (!verifyToken(token, BUILD_WEBHOOK_TOKEN)) {
        console.warn(`[AUTH] Webhook não autorizado — IP: ${req.socket.remoteAddress}`);
        res.writeHead(401, securityHeaders);
        return res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
      }

      if (isBuilding) {
        res.writeHead(429, securityHeaders);
        return res.end(JSON.stringify({ success: false, error: 'Build already in progress' }));
      }

      isBuilding = true;
      console.log('Recebido gatilho autenticado do n8n. Iniciando build SSG...');

      try {
        const { stdout } = await runCommand('npm', ['run', 'build'], 120000);
        await runCommand('rsync', ['-avz', 'dist/', '/var/www/bbn/'], 60000);
        console.log(`Build concluído:\n${stdout}`);
        res.writeHead(200, securityHeaders);
        res.end(JSON.stringify({ success: true, message: 'Build gerado e copiado com sucesso!' }));
      } catch (error) {
        console.error(`Erro no build: ${error.message}`);
        res.writeHead(500, securityHeaders);
        res.end(JSON.stringify({ success: false, error: 'Internal build error' }));
      } finally {
        isBuilding = false;
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    res.end('Not found');
  }
});

server.headersTimeout = 10000;
server.requestTimeout = 30000;
server.keepAliveTimeout = 5000;

server.listen(PORT, HOST, () => {
  console.log(`Webhook listener do BBN rodando em http://${HOST}:${PORT}`);
});
