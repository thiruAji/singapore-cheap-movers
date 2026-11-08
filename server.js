/**
 * Singapore Cheap Movers — Unified Website + WhatsApp API Server
 *
 * One shared AI & pricing brain for:
 *  1) Website AI Chat        -> POST /api/chat
 *  2) Website Lead Capture   -> POST /api/lead   (auto-messages customer + notifies admin on WhatsApp)
 *  3) WhatsApp API Webhook   -> GET & POST /api/whatsapp/webhook
 *                               Supports:
 *                               • Official Meta WhatsApp Cloud API
 *                               • Local WhatsApp bots (WAHA, whatsapp-web.js, Baileys, Evolution API)
 *
 * Run:  node server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

/* ---------- Load .env (no dependency required) ---------- */
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
        if (m && !line.trim().startsWith('#') && !(m[1] in process.env)) {
            process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
    }
}

const PORT = Number(process.env.PORT) || 3000;
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || 'gemini-flash-latest').trim();

// WhatsApp Integration Config
const WA_VERIFY_TOKEN = (process.env.WA_VERIFY_TOKEN || 'scm_verify_token').trim();
const WA_ADMIN_PHONE = (process.env.WA_ADMIN_PHONE || '6584076882').replace(/\D/g, '');
// Option A: Local WhatsApp Bot HTTP Endpoint (e.g. http://localhost:3001/send or WAHA / Baileys / whatsapp-web.js)
const WA_LOCAL_SEND_URL = (process.env.WA_LOCAL_SEND_URL || '').trim();
const WA_LOCAL_API_KEY = (process.env.WA_LOCAL_API_KEY || '').trim();
// Option B: Official Meta WhatsApp Cloud API
const WA_CLOUD_TOKEN = (process.env.WA_CLOUD_TOKEN || '').trim();
const WA_CLOUD_PHONE_ID = (process.env.WA_CLOUD_PHONE_ID || '').trim();

const PUBLIC_DIR = __dirname;

/* ---------- Shared Business Knowledge for Both Website & WhatsApp Bot ---------- */
const SYSTEM_PROMPT = `
You are the friendly online moving assistant for Dheeran Movers & Storage, a professional and affordable house & office moving and storage company in Singapore.
You answer customers on BOTH our website chat and our WhatsApp Business number (+65 8407 6882).

GOALS
1. Answer questions about moving and storage in Singapore clearly and briefly.
2. Help the customer estimate a price using ONLY the rates below.
3. Collect move details (truck/home size, from area, to area, date, special items) so our coordinator can lock in a fixed quote.

STYLE
- Warm, professional, concise. Use short paragraphs or short bullet lists. Max ~110 words per reply unless the user asks for detail.
- Use simple English that suits Singapore customers. Prices are in SGD, written like $350.
- Ask at most 1–2 questions at a time.
- Use *bold* or **bold** sparingly for prices or key points.

BASE PACKAGES (ALL packages include protective furniture wrapping, 30 FREE carton boxes on a return-collection basis, and FREE basic dismantling & assembly of basic TV wall mounts, sofa legs, basic dining tables & standard beds)
- 1x 10ft covered truck with 1 driver + 1 helper: $200 per trip (ideal for room, studio or small move)
- 1x 14ft covered truck with 2 helpers: $350 per trip (ideal for 2–3 room HDB, Condo or light 4-room move)
- 2x 14ft covered trucks with 2 helpers: $700 (ideal for full 4–5 room HDB or landed move)
- Office / commercial relocation: from $350

INCLUDED FREE IN EVERY MOVE
- Protective stretch-film furniture wrapping
- 30 free carton boxes (return collection: we collect the empty boxes back for free after you unpack)
- Basic dismantling & assembly: basic TV wall-mount brackets, sofa legs, basic dining tables & standard beds

SPECIAL ITEM ADD-ONS ($25–$40 per item)
- Storage / hydraulic bed dismantle & assemble: $25–$40
- Fridge door dismantle & reinstall: $25–$40
- IKEA / sliding wardrobe dismantle & assemble: $25–$40
- Stairs with no lift: $30 per floor

OTHER FACTS
- Islandwide Singapore, operating daily 7am–11pm.
- Safe short-term and long-term furniture storage available.
- Phone / WhatsApp: +65 8407 6882.

RULES
- Never invent prices or promotions not listed.
- When you have at least the truck/home size and the from/to areas (or the customer wants to book or talk to a person), end your reply with the exact token [[WHATSAPP]] on its own line. Do not mention the token.
`.trim();

/* ---------- Offline Fallback Brain (works without API key on both Web & WhatsApp) ---------- */
function offlineReply(text) {
    const t = (text || '').toLowerCase();
    const has = (...w) => w.some(x => t.includes(x));

    if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t.trim()) && t.length < 25)
        return "Hi! Welcome to **Dheeran Movers & Storage**. Tell me your **home size** and where you're moving **from and to**, and I'll calculate your price!";
    if (has('box', 'carton', '30'))
        return "Every move includes **30 FREE carton boxes** (on a return-collection basis). Once you unpack at your new place, just message us at **8407 6882** and we'll collect the empty boxes back!\n[[WHATSAPP]]";
    if (has('storage bed', 'fridge', 'ikea', 'wardrobe', 'add on', 'addon', '25', '40'))
        return "Special item add-on rates are just **$25 – $40 per item**:\n- Storage / hydraulic bed dismantle & assemble: **$25–$40**\n- Fridge door remove & reinstall: **$25–$40**\n- IKEA / sliding wardrobe dismantle & assemble: **$25–$40**\n\n(Basic TV wall mount, sofa legs, basic dining table & standard bed are **FREE**!)";
    if (has('dismantl', 'assembl', 'free', 'tv', 'sofa', 'table', 'dining'))
        return "**Included FREE in your package:**\n- Basic TV wall-mount dismantle\n- Sofa legs dismantle & assemble\n- Basic dining table dismantle & assemble\n- Standard bedframe dismantle & assemble\n\n**Add-ons ($25–$40 each):**\n- Storage bed, Fridge door, or IKEA wardrobe.\n[[WHATSAPP]]";
    if (has('10ft', '10 footer', '200', 'room', 'studio', 'small'))
        return "Our **1× 10ft Truck with 1 Driver + 1 Helper is $200**.\n\nIncludes:\n- Protective furniture wrapping\n- 30 free carton boxes (return collection)\n- Basic dismantle & assembly (TV mount, sofa legs, basic dining table)\n[[WHATSAPP]]";
    if (has('14ft', '14 footer', '350', '2 room', '3 room', '4 room', '5 room', 'hdb', 'condo'))
        return "Our **1× 14ft Truck with 2 Helpers is $350** per load (or $700 for 2 loads for large 4–5 room homes).\n\nIncludes:\n- Full protective wrapping\n- 30 free boxes (return collection)\n- Basic dismantle & assembly (TV wall mount, sofa legs, basic dining table)\n- Special items (storage bed, fridge door, IKEA wardrobe) are just $25–$40.\n[[WHATSAPP]]";
    if (has('storage', 'store', 'warehouse'))
        return "Yes! **Dheeran Movers & Storage** provides clean, secure short-term and long-term furniture storage. Send us your item list on WhatsApp at **8407 6882** for an instant storage quote.\n[[WHATSAPP]]";
    if (has('mcst', 'permit'))
        return "Yes, we provide vehicle numbers and mover details right after booking for your condo MCST permit application.";
    if (has('price', 'cost', 'how much', 'rate', 'quote', 'truck', 'lorry'))
        return "Here are **Dheeran Movers & Storage** package rates:\n- **1× 10ft Truck (1 Driver + 1 Helper):** $200\n- **1× 14ft Truck (with 2 Helpers):** $350\n\nBoth include **wrapping, 30 free boxes (return collection)**, and **basic dismantle/assembly** (TV wall mount, sofa legs, basic dining table). Storage bed, fridge door & IKEA wardrobe are **$25–$40**.\n[[WHATSAPP]]";
    return "You can book our **10ft Truck ($200)** or **14ft Truck with 2 Helpers ($350)** — both include wrapping, 30 free boxes (return collection) & basic dismantling/assembly. WhatsApp us at **8407 6882**!\n[[WHATSAPP]]";
}

/* ---------- Gemini Call ---------- */
async function geminiReply(messages) {
    const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }]
    }));

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents,
                generationConfig: { temperature: 0.4, maxOutputTokens: 600 }
            }),
            signal: AbortSignal.timeout(25000)
        }
    );

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
    if (!text) throw new Error('Empty response from Gemini');
    return text;
}

/* ---------- Unified Reply Generator (Used by Web Chat & WhatsApp Bot) ---------- */
async function generateBotReply(messages) {
    const lastUser = messages[messages.length - 1]?.text || '';
    if (!GEMINI_API_KEY) {
        return { reply: offlineReply(lastUser), mode: 'offline' };
    }
    try {
        const reply = await geminiReply(messages);
        return { reply, mode: 'ai' };
    } catch (err) {
        console.error('[ai-error]', err.message);
        return { reply: offlineReply(lastUser), mode: 'offline-fallback' };
    }
}

/* ---------- Per-Phone Conversation Memory for WhatsApp Users ---------- */
const waSessions = new Map(); // phone -> [{ role, text, ts }]
function getWaHistory(phone) {
    const now = Date.now();
    // Keep messages from the last 2 hours (up to 14 turns)
    const list = (waSessions.get(phone) || []).filter(m => now - m.ts < 2 * 3600_000).slice(-14);
    waSessions.set(phone, list);
    return list;
}

/* ---------- Outgoing WhatsApp Sender (Local Bot API OR Meta Cloud API) ---------- */
function normalizeSgPhone(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (digits.length === 8 && /^[689]/.test(digits)) digits = '65' + digits;
    return digits;
}

function formatForWhatsAppText(text) {
    // Convert markdown **bold** to WhatsApp *bold* and strip [[WHATSAPP]] token
    return String(text || '')
        .replace(/\s*\[\[WHATSAPP\]\]\s*/g, '')
        .replace(/\*\*(.+?)\*\*/g, '*$1*')
        .trim();
}

async function sendWhatsAppMessage(toPhone, text) {
    const phone = normalizeSgPhone(toPhone);
    const cleanText = formatForWhatsAppText(text);
    if (!phone || !cleanText) return { sent: false, reason: 'missing-phone-or-text' };

    // 1. If a Local WhatsApp Bot endpoint is configured (e.g. whatsapp-web.js / Baileys / WAHA)
    if (WA_LOCAL_SEND_URL) {
        try {
            const headers = { 'Content-Type': 'application/json' };
            if (WA_LOCAL_API_KEY) headers['Authorization'] = `Bearer ${WA_LOCAL_API_KEY}`;
            const res = await fetch(WA_LOCAL_SEND_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    phone,
                    to: phone,
                    chatId: `${phone}@c.us`,
                    text: cleanText,
                    message: cleanText
                }),
                signal: AbortSignal.timeout(10000)
            });
            return { sent: res.ok, via: 'local-bot', status: res.status };
        } catch (err) {
            console.error('[wa-local-send]', err.message);
            return { sent: false, via: 'local-bot', error: err.message };
        }
    }

    // 2. If Official Meta WhatsApp Cloud API is configured
    if (WA_CLOUD_TOKEN && WA_CLOUD_PHONE_ID) {
        try {
            const res = await fetch(`https://graph.facebook.com/v21.0/${WA_CLOUD_PHONE_ID}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${WA_CLOUD_TOKEN}`
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: phone,
                    type: 'text',
                    text: { body: cleanText }
                }),
                signal: AbortSignal.timeout(10000)
            });
            return { sent: res.ok, via: 'meta-cloud', status: res.status };
        } catch (err) {
            console.error('[wa-cloud-send]', err.message);
            return { sent: false, via: 'meta-cloud', error: err.message };
        }
    }

    return { sent: false, reason: 'no-wa-sender-configured' };
}

/* ---------- Simple per-IP rate limit ---------- */
const hits = new Map();
function rateLimited(ip) {
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter(t => now - t < 60_000);
    arr.push(now);
    hits.set(ip, arr);
    return arr.length > 30;
}

/* ---------- Helpers ---------- */
const MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.xml': 'application/xml', '.txt': 'text/plain'
};
const BLOCKED = new Set(['.env', 'server.js', 'whatsapp-bridge-example.js', 'package.json', 'package-lock.json']);

function sendJSON(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
}

function readBody(req, limit = 64_000) {
    return new Promise((resolve, reject) => {
        let size = 0, data = '';
        req.on('data', c => {
            size += c.length;
            if (size > limit) { reject(new Error('too large')); req.destroy(); }
            else data += c;
        });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

/* ---------- HTTP Server ---------- */
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;

    // =========================================================================
    // 1. WEBSITE AI CHAT ENDPOINT (POST /api/chat)
    // =========================================================================
    if (url.pathname === '/api/chat') {
        if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Method not allowed' });
        if (rateLimited(ip)) return sendJSON(res, 429, { error: 'Too many messages. Please wait a moment.' });

        let messages;
        try {
            const body = JSON.parse(await readBody(req));
            messages = (Array.isArray(body.messages) ? body.messages : [])
                .filter(m => m && typeof m.text === 'string' && (m.role === 'user' || m.role === 'assistant'))
                .slice(-16)
                .map(m => ({ role: m.role, text: m.text.slice(0, 1500) }));
            while (messages.length && messages[0].role !== 'user') messages.shift();
            if (!messages.length || messages[messages.length - 1].role !== 'user') throw new Error('bad');
        } catch {
            return sendJSON(res, 400, { error: 'Invalid request' });
        }

        const result = await generateBotReply(messages);
        return sendJSON(res, 200, result);
    }

    // =========================================================================
    // 2. WEBSITE LEAD CAPTURE -> AUTO WHATSAPP CUSTOMER + ADMIN (POST /api/lead)
    // =========================================================================
    if (url.pathname === '/api/lead') {
        if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Method not allowed' });
        if (rateLimited(ip)) return sendJSON(res, 429, { error: 'Too many requests.' });

        let data;
        try {
            data = JSON.parse(await readBody(req));
        } catch {
            return sendJSON(res, 400, { error: 'Invalid JSON' });
        }

        const name = String(data.name || 'Customer').trim().slice(0, 80);
        const customerPhone = normalizeSgPhone(data.phone);
        const from = String(data.from || '-').trim().slice(0, 120);
        const to = String(data.to || '-').trim().slice(0, 120);
        const date = String(data.date || '-').trim().slice(0, 60);
        const total = String(data.total || '').trim().slice(0, 40);
        const items = Array.isArray(data.items) ? data.items.slice(0, 12).map(s => String(s).slice(0, 120)) : [];
        const notes = String(data.notes || '').trim().slice(0, 300);

        const customerMsg = [
            `Hi *${name}*! 👋 Thank you for contacting *Dheeran Movers & Storage*.`,
            `We received your moving quote request from our website:`,
            ``,
            `📍 *Route:* ${from} → ${to}`,
            `📅 *Date:* ${date}`,
            ...items.map(i => `• ${i}`),
            total ? `💰 *Estimated Total:* from ${total}` : '',
            notes ? `📝 *Notes:* ${notes}` : '',
            ``,
            `Reply to this WhatsApp message anytime — you can ask me questions here or send a quick video of your items so our coordinator can lock in your exact fixed price!`
        ].filter(Boolean).join('\n');

        const adminMsg = [
            `🔔 *NEW WEBSITE MOVING LEAD*`,
            `👤 *Name:* ${name}`,
            `📱 *Phone:* +${customerPhone || data.phone}`,
            `📍 *Route:* ${from} → ${to}`,
            `📅 *Date:* ${date}`,
            ...items.map(i => `• ${i}`),
            total ? `💰 *Estimate:* from ${total}` : '',
            notes ? `📝 *Notes:* ${notes}` : ''
        ].filter(Boolean).join('\n');

        // Pre-seed the customer's WhatsApp session memory so if they reply on WhatsApp, Mei already knows their quote!
        if (customerPhone) {
            const history = getWaHistory(customerPhone);
            history.push({
                role: 'user',
                text: `My name is ${name}. I requested a quote on the website from ${from} to ${to} on ${date}. Items: ${items.join(', ')}. Estimate: ${total}.`,
                ts: Date.now()
            });
            history.push({ role: 'assistant', text: customerMsg, ts: Date.now() });
            waSessions.set(customerPhone, history);
        }

        const [customerResult, adminResult] = await Promise.all([
            customerPhone ? sendWhatsAppMessage(customerPhone, customerMsg) : Promise.resolve({ sent: false }),
            WA_ADMIN_PHONE ? sendWhatsAppMessage(WA_ADMIN_PHONE, adminMsg) : Promise.resolve({ sent: false })
        ]);

        return sendJSON(res, 200, {
            ok: true,
            customerNotified: customerResult.sent,
            adminNotified: adminResult.sent
        });
    }

    // =========================================================================
    // 3. WHATSAPP WEBHOOK (GET & POST /api/whatsapp/webhook)
    //    Works with BOTH local bots (whatsapp-web.js / Baileys / WAHA) AND Meta Cloud API
    // =========================================================================
    if (url.pathname === '/api/whatsapp/webhook') {
        // Meta Cloud API Verification Challenge (GET)
        if (req.method === 'GET') {
            const mode = url.searchParams.get('hub.mode');
            const token = url.searchParams.get('hub.verify_token');
            const challenge = url.searchParams.get('hub.challenge');
            if (mode === 'subscribe' && token === WA_VERIFY_TOKEN) {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                return res.end(challenge || 'OK');
            }
            return sendJSON(res, 200, {
                status: 'ready',
                info: 'POST incoming WhatsApp messages here as { "from": "6591234567", "text": "How much for 4 room?" } or use Meta Cloud API webhook format.'
            });
        }

        if (req.method !== 'POST') return sendJSON(res, 405, { error: 'Method not allowed' });

        let payload;
        try {
            payload = JSON.parse(await readBody(req));
        } catch {
            return sendJSON(res, 400, { error: 'Invalid JSON' });
        }

        // Extract sender phone & message text from either:
        // Format A: Simple Local Bot JSON { from / phone / chatId, text / body / message }
        // Format B: WAHA (WhatsApp HTTP API) { payload: { from, body, fromMe } }
        // Format C: Official Meta Cloud API { entry: [{ changes: [{ value: { messages: [...] } }] }] }
        let fromPhone = '';
        let incomingText = '';
        let fromMe = false;

        if (payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
            const msgObj = payload.entry[0].changes[0].value.messages[0];
            fromPhone = msgObj.from || '';
            incomingText = msgObj.text?.body || '';
        } else if (payload?.payload && typeof payload.payload === 'object') {
            fromMe = Boolean(payload.payload.fromMe);
            fromPhone = String(payload.payload.from || '').replace(/@.*$/, '');
            incomingText = String(payload.payload.body || payload.payload.text || '');
        } else {
            fromMe = Boolean(payload.fromMe);
            fromPhone = String(payload.from || payload.phone || payload.chatId || payload.sender || '').replace(/@.*$/, '');
            incomingText = String(payload.text || payload.body || payload.message || '');
        }

        fromPhone = normalizeSgPhone(fromPhone);
        incomingText = incomingText.trim();

        // Ignore status updates, empty messages, or messages sent by the bot itself
        if (fromMe || !incomingText) {
            return sendJSON(res, 200, { ignored: true });
        }

        // Maintain multi-turn conversation history per WhatsApp phone number
        const key = fromPhone || 'anonymous';
        const history = getWaHistory(key);
        history.push({ role: 'user', text: incomingText, ts: Date.now() });

        const { reply, mode } = await generateBotReply(
            history.map(m => ({ role: m.role, text: m.text }))
        );

        const wantsHandoff = reply.includes('[[WHATSAPP]]');
        const waReplyText = formatForWhatsAppText(reply);
        history.push({ role: 'assistant', text: waReplyText, ts: Date.now() });
        waSessions.set(key, history);

        // Auto-send reply back to customer via configured sender (if WA_LOCAL_SEND_URL or Meta Cloud is set)
        const sendOutcome = fromPhone
            ? await sendWhatsAppMessage(fromPhone, waReplyText)
            : { sent: false };

        // If the customer is ready to book / asks for a human, notify the admin WhatsApp number
        if (wantsHandoff && WA_ADMIN_PHONE && fromPhone && fromPhone !== WA_ADMIN_PHONE) {
            const summary = history.slice(-6).map(m => `${m.role === 'user' ? '👤' : '🤖'} ${m.text}`).join('\n');
            await sendWhatsAppMessage(
                WA_ADMIN_PHONE,
                `🔔 *WHATSAPP BOT LEAD READY*\nFrom: +${fromPhone}\n\n${summary}`
            );
        }

        // Always return the formatted reply in the HTTP response too, so a local bot script
        // (like whatsapp-web.js or Baileys) can simply read `res.reply` and call `msg.reply(res.reply)`!
        return sendJSON(res, 200, {
            ok: true,
            from: fromPhone,
            reply: waReplyText,
            mode,
            handoff: wantsHandoff,
            autoSent: sendOutcome.sent
        });
    }

    // =========================================================================
    // 4. STATIC WEBSITE FILES
    // =========================================================================
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
    const base = path.basename(filePath);

    if (!filePath.startsWith(PUBLIC_DIR) || BLOCKED.has(base) || base.startsWith('.') || filePath.includes(`${path.sep}node_modules${path.sep}`)) {
        res.writeHead(404); return res.end('Not found');
    }
    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
        });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`\n  Dheeran Movers & Storage running at  http://localhost:${PORT}`);
    console.log(GEMINI_API_KEY
        ? `  Brain:          Google Gemini AI (${GEMINI_MODEL})`
        : `  Brain:          Built-in Smart Rules (add GEMINI_API_KEY in .env for live Gemini AI)`);
    console.log(`  Web Chat API:   POST http://localhost:${PORT}/api/chat`);
    console.log(`  WhatsApp Hook:  POST http://localhost:${PORT}/api/whatsapp/webhook`);
    console.log(`  Lead Capture:   POST http://localhost:${PORT}/api/lead\n`);
});
