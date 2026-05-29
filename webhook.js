import { exec } from 'child_process';
import http from 'http';

const PORT = 9000; // Porta interna que o n8n vai chamar

const server = http.createServer((req, res) => {
    // Rota secreta de segurança (para não rodar build com qualquer requisição)
    if (req.method === 'POST' && req.url === '/trigger-build-bbn-secret') {
        console.log('Recebido gatilho do n8n. Iniciando build SSG...');

        // Executa o comando de build e copia para a pasta do Nginx
        exec('npm run build && rsync -avz dist/ /var/www/bbn/', (error, stdout, stderr) => {
            if (error) {
                console.error(`Erro no build: ${error.message}`);
                res.writeHead(500);
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
