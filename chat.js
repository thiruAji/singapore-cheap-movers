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
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: history })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Something went wrong.');

            // small natural delay so instant offline replies don't feel robotic
            await new Promise(r => setTimeout(r, data.mode === 'ai' ? 0 : 500));
            setTyping(false);
            history.push({ role: 'assistant', text: data.reply });
            save();
            addBubble('assistant', data.reply);
        } catch (err) {
            setTyping(false);
            history.pop(); save(); // let the user retry the same message
            const offline = err instanceof TypeError; // network / no server
            addError(offline
                ? "I can't connect right now. Please message us on WhatsApp at +65 8888 1234."
                : err.message);
            input.value = text; autoGrow();
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
