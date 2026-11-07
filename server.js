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
const WA_ADMIN_PHONE = (process.env.WA_ADMIN_PHONE || '6588881234').replace(/\D/g, '');
// Option A: Local WhatsApp Bot HTTP Endpoint (e.g. http://localhost:3001/send or WAHA / Baileys / whatsapp-web.js)
const WA_LOCAL_SEND_URL = (process.env.WA_LOCAL_SEND_URL || '').trim();
const WA_LOCAL_API_KEY = (process.env.WA_LOCAL_API_KEY || '').trim();
// Option B: Official Meta WhatsApp Cloud API
const WA_CLOUD_TOKEN = (process.env.WA_CLOUD_TOKEN || '').trim();
const WA_CLOUD_PHONE_ID = (process.env.WA_CLOUD_PHONE_ID || '').trim();

const PUBLIC_DIR = __dirname;

/* ---------- Shared Business Knowledge for Both Website & WhatsApp Bot ---------- */
const SYSTEM_PROMPT = `
You are "Mei", the friendly online moving assistant for Singapore Cheap Movers, a professional and affordable house & office moving company in Singapore.
You answer customers on BOTH our website chat and our WhatsApp Business number.

GOALS
1. Answer questions about moving in Singapore clearly and briefly.
2. Help the customer estimate a price using ONLY the rates below.
3. Collect move details (home size, from area, to area, date, special items) so our coordinator can lock in a fixed quote.

STYLE
- Warm, professional, concise. Use short paragraphs or short bullet lists. Max ~110 words per reply unless the user asks for detail.
- Use simple English that suits Singapore customers. Prices are in SGD, written like $280.
- Ask at most 1–2 questions at a time.
- Use *bold* or **bold** sparingly for prices or key points.

BASE RATES (include lorry, driver, movers, fuel, stretch-film wrapping, lift-landing moves)
- 10ft covered lorry, driver + 2 movers: $180 per trip (room / studio / small move, ~15 boxes + bed + desk)
- 14ft tailgate lorry, driver + 3 movers: $280 per trip (2–3 room HDB or 1–2 bedroom condo, ~25 boxes)
- 24ft jumbo lorry, driver + 4 movers: $480 per trip (4–5 room HDB or 3-bed condo in one trip, ~50 boxes)
- Landed property, 2–3 lorries, 6 movers + supervisor: from $780
- Office / shop relocation: from $380

ADD-ONS (charged only if needed)
- Standard bed dismantle & reassemble: $30–$50 each
- Storage / hydraulic / bunk bed: $60–$80 each
- Dining table dismantle & reassemble: $30–$50 each
- Wardrobe dismantle & reassemble: $80–$150 each
- 20 heavy-duty boxes + tape: $45 per bundle
- Stairs with no lift: $30 per floor per load
- Upright piano / safe: from $150
- Bulky item disposal: from $80 per item
Dismantling and assembly are NOT free. Boxes are NOT free.

OTHER FACTS
- Islandwide, no distance surcharge within Singapore. Operating daily 7am–11pm.
- Goods-in-transit insurance included. Condo MCST documents (vehicle numbers, crew details, insurance cert) sent after booking.
- Book 1–2 weeks ahead for weekends/month-end; same-day/next-day possible if lorries are free.
- No deposit needed to check availability. Final price is confirmed on WhatsApp before booking.
- Phone / WhatsApp: +65 8888 1234.

RULES
- Never invent prices, discounts, promotions or services not listed. If unsure, say the team will confirm.
- Always present estimates as "from $X" / "estimated", never as guaranteed.
- When you give an estimate, show a short breakdown (base + add-ons = total).
- Do not discuss or compare other moving companies.
- When you have at least the home size and the from/to areas (or the customer wants to book or talk to a person), end your reply with the exact token [[WHATSAPP]] on its own line. Do not mention the token.
`.trim();

/* ---------- Offline Fallback Brain (works without API key on both Web & WhatsApp) ---------- */
function offlineReply(text) {
    const t = (text || '').toLowerCase();
    const has = (...w) => w.some(x => t.includes(x));

    if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t.trim()) && t.length < 25)
        return "Hi! I'm Mei, your moving assistant. Tell me your **home size** and where you're moving **from and to**, and I'll estimate your price.";
    if (has('mcst', 'permit'))
        return "Yes. After you book, we send our vehicle numbers, crew details and insurance certificate for your condo's MCST move-in/out form.";
    if (has('insur', 'damage', 'scratch'))
        return "Every move includes goods-in-transit insurance. Check items when we unload and tell the crew leader about any issue before they leave.";
    if (has('dismantl', 'assembl', 'wardrobe', 'carpent'))
        return "Dismantling is charged per item so you only pay for what you need:\n- Standard bed: $30–$50\n- Storage / bunk bed: $60–$80\n- Dining table: $30–$50\n- Wardrobe: $80–$150";
    if (has('4 room', '4-room', '5 room', '5-room', '4rm', '5rm', 'executive', '3 bed', '3-bed'))
        return "For a **4–5 room HDB or 3-bed condo**, most families use our **24ft jumbo lorry with 4 movers: from $480**.\n\nCommon add-ons:\n- Bed dismantle: $30–$50 each\n- Wardrobe dismantle: $80–$150 each\n- 20 boxes: $45\n\nWhere are you moving from and to?\n[[WHATSAPP]]";
    if (has('2 room', '2-room', '3 room', '3-room', '1 bed', '2 bed', 'condo'))
        return "For a **2–3 room HDB or 1–2 bed condo**, our **14ft tailgate lorry with 3 movers is from $280**. That includes wrapping and lift-landing moving.\n\nDo you need any beds or wardrobes dismantled?\n[[WHATSAPP]]";
    if (has('room', 'studio', 'small', 'few items', 'single'))
        return "For a room or studio, our **10ft lorry with 2 movers is from $180** per trip. Roughly 15 boxes plus a bed and desk fit in.\n\nWhen are you planning to move?";
    if (has('landed', 'terrace', 'semi-d', 'bungalow'))
        return "Landed moves start **from $780** with 2–3 lorries, 6 movers and a site supervisor, including floor and staircase protection.\n\nShall I connect you to our coordinator to confirm?\n[[WHATSAPP]]";
    if (has('office', 'shop', 'commercial'))
        return "Office and shop relocations start **from $380**. We can move after hours or on weekends to avoid downtime.\n\nHow many workstations do you have?\n[[WHATSAPP]]";
    if (has('bed', 'table'))
        return "Dismantling is charged per item so you only pay for what you need:\n- Standard bed: $30–$50\n- Storage / bunk bed: $60–$80\n- Dining table: $30–$50\n- Wardrobe: $80–$150";
    if (has('box', 'carton'))
        return "A bundle of **20 heavy-duty boxes + tape is $45**. We can deliver them before moving day.";
    if (has('stair', 'no lift', 'walk up'))
        return "If there's no lift landing, stairs are **$30 per floor per load**.";
    if (has('piano', 'safe'))
        return "Upright pianos and safes start **from $150**, depending on access.";
    if (has('dispos', 'throw', 'old sofa', 'mattress'))
        return "We can remove bulky items **from $80 per item** on the same day as your move.";
    if (has('book', 'available', 'tomorrow', 'today', 'urgent', 'date', 'when'))
        return "We recommend booking 1–2 weeks ahead for weekends, but same-day and next-day slots are often available. Let's check your date on WhatsApp.\n[[WHATSAPP]]";
    if (has('price', 'cost', 'how much', 'rate', 'quote', 'cheap'))
        return "Our base rates:\n- **10ft lorry**: $180 (room / studio)\n- **14ft lorry**: $280 (2–3 room)\n- **24ft lorry**: $480 (4–5 room)\n- **Landed**: from $780\n\nWhat's your home size?";
    if (has('human', 'person', 'agent', 'call', 'whatsapp', 'talk'))
        return "Sure! Our coordinator can assist you directly at **+65 8888 1234**.\n[[WHATSAPP]]";
    return "I can help with prices, lorry sizes, dismantling, boxes and booking. Tell me your **home size** and **from/to areas** for a quick estimate.\n[[WHATSAPP]]";
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
            `Hi *${name}*! 👋 This is *Mei* from *Singapore Cheap Movers*.`,
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
    console.log(`\n  Singapore Cheap Movers running at  http://localhost:${PORT}`);
    console.log(GEMINI_API_KEY
        ? `  Brain:          Google Gemini AI (${GEMINI_MODEL})`
        : `  Brain:          Built-in Smart Rules (add GEMINI_API_KEY in .env for live Gemini AI)`);
    console.log(`  Web Chat API:   POST http://localhost:${PORT}/api/chat`);
    console.log(`  WhatsApp Hook:  POST http://localhost:${PORT}/api/whatsapp/webhook`);
    console.log(`  Lead Capture:   POST http://localhost:${PORT}/api/lead\n`);
});
