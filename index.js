import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import 'dotenv/config';
import express from 'express';
import { finalizeEvent } from 'nostr-tools/pure';
import { useWebSocketImplementation, SimplePool } from 'nostr-tools/pool';
import WebSocket from 'ws';

// Ensina o nostr-tools a usar WebSocket no ambiente Node
useWebSocketImplementation(WebSocket);

const app = express();
app.use(express.json());

// Transforma a sua chave Hex do arquivo .env num formato que a criptografia entende
const PRIVATE_KEY = Uint8Array.from(Buffer.from(process.env.NOSTR_PRIV_KEY_HEX, 'hex'));

// Os "alto-falantes" onde o BBN vai gritar as notícias
const relays = [
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://relay.snort.social'
]; // <-- CORRIGIDO AQUI PARA PONTO-E-VÍRGULA

app.post('/publish', async (req, res) => {
  try {
    const { id_noticia, title, hook, content } = req.body;

    // Monta o pacote da notícia
    const eventTemplate = {
      kind: 30023, // 30023 é o código oficial para Artigos/Notícias
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['d', id_noticia], // ID único para não duplicar
        ['title', title],  // Manchete
        ['summary', hook], // O gancho da matéria
        ['t', 'bitcoin'],  // Hashtags
        ['t', 'news']
      ],
      content: content, // O texto completo
    };

    // Assina com a chave privada do BBN (A mágica acontece aqui)
    const signedEvent = finalizeEvent(eventTemplate, PRIVATE_KEY);

    // Conecta e envia para os Relays
    const pool = new SimplePool();

    // Dispara a notícia!
    await Promise.any(pool.publish(relays, signedEvent));

    // Fecha a conexão após enviar
    setTimeout(() => pool.close(relays), 2000);

    console.log(`[SUCESSO] Notícia "${title}" publicada! ID: ${signedEvent.id}`);
    res.status(200).json({ success: true, event_id: signedEvent.id });

  } catch (error) {
    console.error('[ERRO]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- TRUQUE PARA MANTER O RENDER 24/7 ---
app.get('/', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('BBN Bridge esta online e rodando 24/7!\n');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Ponte Nostr do BBN rodando na porta ${PORT}`));
