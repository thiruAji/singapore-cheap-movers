/* Dheeran Movers & Storage — AI chat assistant (frontend) */
(() => {
    const WA_NUMBER = '6584076882'; // Dheeran Movers & Storage WhatsApp
    const STORE_KEY = 'dheeran-chat-v1';
    const GREETING = "Hi! Welcome to **Dheeran Movers & Storage** 👋\n\n• **10ft Truck (1 Driver + 1 Helper):** $200\n• **14ft Truck (with 2 Helpers):** $350\n• **Included FREE:** Wrapping, 30 carton boxes (return collection), basic TV wall mount, sofa legs & basic dining table dismantle/assemble.\n• **Add-ons ($25–$40):** Storage bed, fridge door, IKEA wardrobe.\n\nHow can I help with your move today?";

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
        const msg = ['Hi Dheeran Movers & Storage, I was chatting on your website.', '', 'My details:', ...userLines, '', 'Please confirm the price and availability. Thank you!'].join('\n');
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
            a.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z"/></svg> WhatsApp 8407 6882';
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
            typingEl.setAttribute('aria-label', 'Assistant is typing');
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
        sessionStorage.setItem('dheeran-chat-seen', '1');
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

    if (!sessionStorage.getItem('dheeran-chat-seen')) {
        setTimeout(() => { if (panel.hidden) teaser.hidden = false; }, 6000);
    } else {
        badge.hidden = true;
    }
    teaser.addEventListener('click', e => {
        if (e.target.id === 'chat-teaser-close') { teaser.hidden = true; sessionStorage.setItem('dheeran-chat-seen', '1'); return; }
        openChat();
    });

    /* ---------- Client-side fallback (for GitHub Pages / static hosting without backend) ---------- */
    function localOfflineReply(text) {
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
        return "You can book our **10ft Truck ($200)** or **14ft Truck with 2 Helpers ($350)** — both include wrapping, 30 free boxes (return collection) & basic dismantling/assembly. Tap below to WhatsApp us at **8407 6882**!\n[[WHATSAPP]]";
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
                replyText = localOfflineReply(text);
            }

            await new Promise(r => setTimeout(r, isAi ? 0 : 450));
            setTyping(false);
            history.push({ role: 'assistant', text: replyText });
            save();
            addBubble('assistant', replyText);
        } catch (err) {
            setTyping(false);
            addError("Please message us on WhatsApp at +65 8407 6882.");
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
