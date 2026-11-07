/* Singapore Cheap Movers — interactions */
document.documentElement.classList.add('js');

// Change this to your real WhatsApp Business number (country code, no + or spaces)
const WHATSAPP_NUMBER = '6588881234';

document.addEventListener('DOMContentLoaded', () => {
    const $ = (s, el = document) => el.querySelector(s);
    const $$ = (s, el = document) => [...el.querySelectorAll(s)];

    /* ---------- Header: solid on scroll + mobile menu ---------- */
    const header = $('#header');
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const burger = $('#burger');
    const nav = $('#nav');
    const setMenu = (open) => {
        nav.classList.toggle('open', open);
        header.classList.toggle('menu-open', open);
        burger.setAttribute('aria-expanded', String(open));
    };
    burger.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
    $$('a', nav).forEach(a => a.addEventListener('click', () => setMenu(false)));

    /* ---------- Reveal on scroll ---------- */
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        $$('.reveal').forEach((el, i) => {
            el.style.transitionDelay = `${(i % 4) * 70}ms`;
            io.observe(el);
        });
    } else {
        $$('.reveal').forEach(el => el.classList.add('in'));
    }

    /* ---------- Pricing toggle ---------- */
    const toggle = $('.toggle');
    $$('.toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            toggle.dataset.active = view;
            $$('.toggle-btn').forEach(b => {
                const on = b === btn;
                b.classList.toggle('active', on);
                b.setAttribute('aria-selected', String(on));
            });
            $$('.price-grid').forEach(p => { p.hidden = p.dataset.panel !== view; });
        });
    });

    /* ---------- Calculator ---------- */
    const calc = $('#calc');
    const totalEl = $('#sum-total');
    const linesEl = $('#sum-lines');
    const fmt = n => `$${n.toLocaleString('en-SG')}`;

    const selectType = (value) => {
        const input = $(`input[name="type"][value="${value}"]`, calc);
        if (input) { input.checked = true; update(); }
    };

    function update() {
        const type = $('input[name="type"]:checked', calc);
        let total = Number(type.dataset.price);
        const lines = [[type.dataset.label, total]];

        $$('.extra', calc).forEach(ex => {
            const qty = Number($('output', ex).value || $('output', ex).textContent);
            ex.classList.toggle('active', qty > 0);
            $('.minus', ex).disabled = qty === 0;
            if (qty > 0) {
                const cost = qty * Number(ex.dataset.price);
                total += cost;
                lines.push([`${ex.dataset.label} × ${qty}`, cost]);
            }
        });

        linesEl.innerHTML = lines
            .map(([l, v]) => `<li><span>${l}</span><span>${fmt(v)}</span></li>`)
            .join('');

        if (totalEl.textContent !== fmt(total)) {
            totalEl.textContent = fmt(total);
            totalEl.classList.add('bump');
            setTimeout(() => totalEl.classList.remove('bump'), 180);
        }
    }

    $$('input[name="type"]', calc).forEach(r => r.addEventListener('change', update));
    $$('.extra', calc).forEach(ex => {
        const out = $('output', ex);
        out.value = 0;
        $('.plus', ex).addEventListener('click', () => { out.value = Math.min(Number(out.value) + 1, 20); update(); });
        $('.minus', ex).addEventListener('click', () => { out.value = Math.max(Number(out.value) - 1, 0); update(); });
    });

    // Date: default to tomorrow, no past dates
    const dateInput = $('#f-date');
    const today = new Date();
    const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    dateInput.min = iso(today);
    const tmr = new Date(today); tmr.setDate(tmr.getDate() + 1);
    dateInput.value = iso(tmr);

    update();

    /* ---------- Hero quick bar -> calculator ---------- */
    $('#quick-bar').addEventListener('submit', (e) => {
        e.preventDefault();
        selectType($('#qb-type').value);
        const from = $('#qb-from').value.trim();
        const to = $('#qb-to').value.trim();
        if (from) $('#f-from').value = from;
        if (to) $('#f-to').value = to;
        $('#quote').scrollIntoView({ behavior: 'smooth' });
    });

    /* ---------- Pricing cards -> calculator ---------- */
    $$('.pick').forEach(btn => btn.addEventListener('click', () => {
        selectType(btn.dataset.pick);
        $('#quote').scrollIntoView({ behavior: 'smooth' });
    }));

    /* ---------- Submit to WhatsApp ---------- */
    const errorEl = $('#form-error');
    calc.addEventListener('submit', (e) => {
        e.preventDefault();

        const required = ['#f-from', '#f-to', '#f-date', '#f-name', '#f-phone'];
        let firstBad = null;
        required.forEach(sel => {
            const input = $(sel);
            const ok = input.value.trim() !== '' && input.checkValidity();
            input.closest('.field').classList.toggle('invalid', !ok);
            if (!ok && !firstBad) firstBad = input;
        });
        if (firstBad) {
            errorEl.hidden = false;
            firstBad.focus({ preventScroll: true });
            firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
        errorEl.hidden = true;

        const lines = $$('li', linesEl).map(li => {
            const [a, b] = $$('span', li).map(s => s.textContent);
            return `${a}: ${b}`;
        });
        const notes = $('#f-notes').value.trim();
        const leadPayload = {
            name: $('#f-name').value.trim(),
            phone: $('#f-phone').value.trim(),
            from: $('#f-from').value.trim(),
            to: $('#f-to').value.trim(),
            date: `${$('#f-date').value} (${$('#f-time').value})`,
            items: lines,
            total: totalEl.textContent,
            notes
        };

        // Trigger background WhatsApp API lead capture (auto-messages customer + notifies admin on WhatsApp)
        fetch('/api/lead', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(leadPayload),
            keepalive: true
        }).catch(() => {});

        const msg = [
            'Hi Singapore Cheap Movers, I would like a moving quote.',
            '',
            `*Name:* ${leadPayload.name}`,
            `*Mobile:* ${leadPayload.phone}`,
            `*From:* ${leadPayload.from}`,
            `*To:* ${leadPayload.to}`,
            `*Date:* ${leadPayload.date}`,
            '',
            '*Items:*',
            ...lines.map(l => `• ${l}`),
            '',
            `*Estimated total:* from ${leadPayload.total}`,
            notes ? `\n*Notes:* ${notes}` : '',
            '',
            'Please confirm availability and the final price. Thank you!'
        ].join('\n');

        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    });

    // Clear invalid state as user types
    $$('.field input', calc).forEach(i => i.addEventListener('input', () => i.closest('.field').classList.remove('invalid')));

    $('#year').textContent = new Date().getFullYear();
});
