/* Singapore Cheap Movers — AI chat assistant (frontend) */
(() => {
    const WA_NUMBER = '6588881234'; // keep in sync with script.js
    const STORE_KEY = 'scm-chat-v1';
    const GREETING = "Hi, I'm **Mei** 👋 I can estimate your moving price, explain our lorry sizes and add-ons, or check a date for you.\n\nWhat are you moving, and where from/to?";

    const $ = s => document.querySelector(s);
    const launcher = $('#chat-launcher');
    const panel = $('#chat-panel');
    const body = $('#chat-body');
    const form = $('#chat-form');
    const input = $('#chat-text');
    const sendBtn = $('#chat-send');
    const chips = $('#chat-chips');
    const badge = $('#chat-badge');
    const teaser = $('#chat-teaser');
    const statusEl = $('#chat-status');
    if (!launcher || !panel) return;

    let history = [];
    try { history = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]'); } catch { history = []; }
    let busy = false;

    const save = () => sessionStorage.setItem(STORE_KEY, JSON.stringify(history.slice(-30)));

    /* ---------- Safe mini-markdown: **bold**, bullet lists, paragraphs ---------- */
    const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function md(text) {
        const blocks = esc(text).trim().split(/\n{2,}/);
        return blocks.map(block => {
            const lines = block.split('\n');
            const isList = lines.every(l => /^\s*([-*•]|\d+\.)\s+/.test(l));
            const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            if (isList) return '<ul>' + lines.map(l => `<li>${inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ''))}</li>`).join('') + '</ul>';
            // mixed block: paragraph lines + list lines
            let html = '', inList = false;
            for (const l of lines) {
                if (/^\s*[-*•]\s+/.test(l)) {
                    if (!inList) { html += '<ul>'; inList = true; }
                    html += `<li>${inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>`;
                } else {
                    if (inList) { html += '</ul>'; inList = false; }
                    html += `<p>${inline(l)}</p>`;
                }
            }
            return html + (inList ? '</ul>' : '');
        }).join('');
    }

    /* ---------- WhatsApp hand-off with conversation summary ---------- */
    function waLink() {
        const userLines = history.filter(m => m.role === 'user').slice(-6).map(m => `• ${m.text}`);
        const msg = ['Hi Singapore Cheap Movers, I was chatting with Mei on your website.', '', 'My details:', ...userLines, '', 'Please confirm the price and availability. Thank you!'].join('\n');
        return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
    }

    /* ---------- Rendering ---------- */
    function addBubble(role, text, animate = true) {
        const wantsWA = role === 'assistant' && text.includes('[[WHATSAPP]]');
        const clean = text.replace(/\s*\[\[WHATSAPP\]\]\s*/g, '\n').trim();

        const el = document.createElement('div');
        el.className = `msg ${role === 'user' ? 'msg-user' : 'msg-bot'}`;
        if (!animate) el.style.animation = 'none';
        if (role === 'user') el.textContent = clean; else el.innerHTML = md(clean);
        body.appendChild(el);

        if (wantsWA) {
            const a = document.createElement('a');
            a.className = 'msg-cta';
            a.target = '_blank'; a.rel = 'noopener';
            a.href = waLink();
            a.addEventListener('click', () => { a.href = waLink(); });
            a.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z"/></svg> Confirm on WhatsApp';
            body.appendChild(a);
        }
        scrollDown();
    }

    function addError(text) {
        const el = document.createElement('div');
        el.className = 'msg msg-error';
        el.textContent = text;
        body.appendChild(el);
        scrollDown();
    }

    let typingEl = null;
    function setTyping(on) {
        if (on && !typingEl) {
            typingEl = document.createElement('div');
            typingEl.className = 'typing';
            typingEl.setAttribute('aria-label', 'Mei is typing');
            typingEl.innerHTML = '<i></i><i></i><i></i>';
            body.appendChild(typingEl);
            scrollDown();
        } else if (!on && typingEl) {
            typingEl.remove(); typingEl = null;
        }
        statusEl.textContent = on ? 'Typing…' : 'Online · replies instantly';
    }

    const scrollDown = () => requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });

    function renderAll() {
        body.innerHTML = '';
        addBubble('assistant', GREETING, false);
        history.forEach(m => addBubble(m.role, m.text, false));
        chips.hidden = history.length > 0;
    }

    /* ---------- Open / close ---------- */
    function openChat() {
        panel.hidden = false;
        launcher.setAttribute('aria-expanded', 'true');
        document.body.classList.add('chat-open');
        badge.hidden = true;
        teaser.hidden = true;
        sessionStorage.setItem('scm-chat-seen', '1');
        if (!body.childElementCount) renderAll();
        scrollDown();
        if (window.matchMedia('(min-width: 641px)').matches) setTimeout(() => input.focus(), 50);
    }
    function closeChat() {
        panel.hidden = true;
        launcher.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('chat-open');
        launcher.focus({ preventScroll: true });
    }
    launcher.addEventListener('click', () => (panel.hidden ? openChat() : closeChat()));
    $('#chat-close').addEventListener('click', closeChat);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) closeChat(); });

    $('#chat-reset').addEventListener('click', () => {
        history = []; save(); renderAll(); input.focus();
    });

    // Teaser bubble after a few seconds (once per session)
    if (!sessionStorage.getItem('scm-chat-seen')) {
        setTimeout(() => { if (panel.hidden) teaser.hidden = false; }, 6000);
    } else {
        badge.hidden = true;
    }
    teaser.addEventListener('click', e => {
        if (e.target.id === 'chat-teaser-close') { teaser.hidden = true; sessionStorage.setItem('scm-chat-seen', '1'); return; }
        openChat();
    });

    /* ---------- Client-side fallback (for GitHub Pages / static hosting without backend) ---------- */
    function localOfflineReply(text) {
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
            return "Sure! Tap the button below to chat with our coordinator on WhatsApp, or call **+65 8888 1234**.\n[[WHATSAPP]]";
        return "I can help with prices, lorry sizes, dismantling, boxes and booking. Tell me your **home size** and **from/to areas** for a quick estimate, or tap below to chat with our team.\n[[WHATSAPP]]";
    }

    /* ---------- Sending ---------- */
    async function send(text) {
        text = text.trim();
        if (!text || busy) return;
        busy = true; sendBtn.disabled = true;
        chips.hidden = true;

        history.push({ role: 'user', text });
        save();
        addBubble('user', text);
        input.value = ''; autoGrow();
        setTyping(true);

        try {
            let replyText = '';
            let isAi = false;
            try {
                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messages: history })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.reply) {
                    replyText = data.reply;
                    isAi = data.mode === 'ai';
                } else {
                    replyText = localOfflineReply(text);
                }
            } catch {
                // Static host (e.g. GitHub Pages) where /api/chat does not exist
                replyText = localOfflineReply(text);
            }

            await new Promise(r => setTimeout(r, isAi ? 0 : 450));
            setTyping(false);
            history.push({ role: 'assistant', text: replyText });
            save();
            addBubble('assistant', replyText);
        } catch (err) {
            setTyping(false);
            addError("Please message us on WhatsApp at +65 8888 1234.");
        } finally {
            busy = false; sendBtn.disabled = false;
            if (window.matchMedia('(min-width: 641px)').matches) input.focus();
        }
    }

    form.addEventListener('submit', e => { e.preventDefault(); send(input.value); });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
    });
    chips.addEventListener('click', e => { if (e.target.matches('button')) send(e.target.textContent); });

    function autoGrow() {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    }
    input.addEventListener('input', autoGrow);
})();
