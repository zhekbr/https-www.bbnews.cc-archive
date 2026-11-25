// ============================================================
// One-time local helper to obtain POSTPULSE_REFRESH_TOKEN
// Usage (PowerShell):
//   $env:POSTPULSE_CLIENT_ID="seu_client_id"
//   $env:POSTPULSE_CLIENT_SECRET="seu_client_secret"
//   node scripts/postpulse-auth.mjs
// ============================================================

import http from 'http';
import { execFile } from 'child_process';

const CLIENT_ID = (process.env.POSTPULSE_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.POSTPULSE_CLIENT_SECRET || '').trim();
const REDIRECT_URI = process.env.POSTPULSE_REDIRECT_URI || 'http://localhost:8787/callback';
const PORT = 8787;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Defina POSTPULSE_CLIENT_ID e POSTPULSE_CLIENT_SECRET antes de rodar.');
  process.exit(1);
}

const scopes = [
  'offline_access',
  'postpulse-api',
  'postpulse-api/posts.read',
  'postpulse-api/posts.write',
  'postpulse-api/media.write',
  'postpulse-api/accounts.read',
].join(' ');

const authUrl = new URL('https://auth.post-pulse.com/authorize');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('scope', scopes);
authUrl.searchParams.set('audience', 'https://api.post-pulse.com');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  if (url.pathname !== '/callback') {
    res.writeHead(404);
    return res.end('Not found');
  }

  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');

  if (error || !code) {
    const desc = url.searchParams.get('error_description') || error || 'Missing code';
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Abra a URL https://auth.post-pulse.com/authorize... (nao abra localhost diretamente). Detalhe: ${desc}`);
    return;
  }

  try {
    const tokenRes = await fetch('https://auth.post-pulse.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    const data = await tokenRes.json();
    if (!tokenRes.ok || !data.refresh_token) {
      throw new Error(`HTTP ${tokenRes.status}: ${JSON.stringify(data)}`);
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h2>✅ Autorizado com sucesso! Pode fechar esta aba e voltar ao terminal.</h2>');

    console.log('\n============================================================');
    console.log('✅ SUCESSO! Copie o valor abaixo para o Secret POSTPULSE_REFRESH_TOKEN no GitHub:');
    console.log('============================================================\n');
    console.log(data.refresh_token);
    console.log('\n============================================================\n');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Falha ao trocar codigo por token: ${err.message}`);
    console.error('❌ Falha ao obter token:', err.message);
  } finally {
    server.close();
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const fullUrl = authUrl.toString();
  console.log('\n🔐 Abrindo automaticamente no navegador a URL do PostPulse:\n');
  console.log(fullUrl);
  console.log('\n⏳ Clique em "Autorizar" no navegador. Aguardando retorno...\n');
  if (process.platform === 'win32') {
    execFile('cmd.exe', ['/c', 'start', '', fullUrl], () => {});
  }
});
