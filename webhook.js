import { exec } from 'child_process';
import http from 'http';
import 'dotenv/config';

const PORT = 9000; // Porta interna que o n8n vai chamar

const BUILD_WEBHOOK_TOKEN = process.env.BUILD_WEBHOOK_TOKEN;
if (!BUILD_WEBHOOK_TOKEN) {
  console.error('[FATAL] BUILD_WEBHOOK_TOKEN não definida no .env');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  // Rota de build protegida por token de header
  if (req.method === 'POST' && req.url === '/trigger-build-bbn-secret') {

    // Verificação do token no header (segurança real, não só obscuridade de URL)
    const token = req.headers['x-webhook-token'];
    if (!token || token !== BUILD_WEBHOOK_TOKEN) {
      console.warn(`[AUTH] Webhook não autorizado — IP: ${req.socket.remoteAddress}`);
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));
    }

    console.log('Recebido gatilho autenticado do n8n. Iniciando build SSG...');

    // Executa o comando de build e copia para a pasta do Nginx
    exec('npm run build && rsync -avz dist/ /var/www/bbn/', (error, stdout, stderr) => {
      if (error) {
        console.error(`Erro no build: ${error.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: error.message }));
      }
      console.log(`Build concluído:\n${stdout}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Build gerado e copiado com sucesso!' }));
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Webhook listener do BBN rodando na porta ${PORT}`);
});
