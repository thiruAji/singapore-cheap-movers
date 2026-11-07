/**
 * =========================================================================
 * CONNECT YOUR LOCAL WHATSAPP BOT TO THE WEBSITE AI & PRICING BRAIN
 * =========================================================================
 *
 * Your website server (server.js on http://localhost:3000) now has a unified
 * WhatsApp API endpoint:
 *
 *   POST http://localhost:3000/api/whatsapp/webhook
 *
 * Below are copy-paste snippets showing how to connect ANY local WhatsApp bot
 * (whatsapp-web.js, Baileys, or WAHA) so both your website and WhatsApp use
 * the exact same AI, moving prices, and admin notifications.
 */

const http = require('http');

/* -------------------------------------------------------------------------
   EXAMPLE A: If your local bot uses `whatsapp-web.js`
   ------------------------------------------------------------------------- */
/*
const { Client, LocalAuth } = require('whatsapp-web.js');
const client = new Client({ authStrategy: new LocalAuth() });

// 1) Forward incoming WhatsApp messages to the Website AI Brain:
client.on('message', async (msg) => {
    if (msg.fromMe || msg.from.endsWith('@g.us')) return; // ignore groups & own messages

    const res = await fetch('http://localhost:3000/api/whatsapp/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from: msg.from,   // e.g. "6591234567@c.us"
            text: msg.body
        })
    });
    const data = await res.json();

    // If WA_LOCAL_SEND_URL is not handling the send, reply directly here:
    if (data.reply && !data.autoSent) {
        await msg.reply(data.reply);
    }
});

// 2) Expose port 3001 so the Website Quote Form can auto-message customers & admin on WhatsApp:
http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/send') {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', async () => {
            const { phone, text } = JSON.parse(body);
            await client.sendMessage(`${phone}@c.us`, text);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        });
    }
}).listen(3001, () => console.log('WhatsApp local sender listening on http://localhost:3001/send'));

client.initialize();
*/

/* -------------------------------------------------------------------------
   EXAMPLE B: If your local bot uses `@whiskeysockets/baileys`
   ------------------------------------------------------------------------- */
/*
sock.ev.on('messages.upsert', async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.fromMe) return;
    const sender = m.key.remoteJid;
    if (sender.endsWith('@g.us')) return;
    const text = m.message.conversation || m.message.extendedTextMessage?.text || '';

    const res = await fetch('http://localhost:3000/api/whatsapp/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: sender, text })
    });
    const data = await res.json();
    if (data.reply && !data.autoSent) {
        await sock.sendMessage(sender, { text: data.reply });
    }
});
*/
