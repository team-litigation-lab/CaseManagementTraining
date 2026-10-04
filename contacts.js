/* =========================================================
   📇 CONTACTS — a card for everyone in the case files
   ---------------------------------------------------------
   Built in the browser from the library case files (mock-cases.js, MOCK_CASES), so it's the same for
   everyone and always matches the files:
     🩺 Medical providers   the files' treating facilities (facilities)
     🛡 Adjusters           the BI and PIP / UM / MedPay adjusters (bi, pipum); a carrier with no adjuster
                            assigned yet gets a card of its own
     ⚖ Opposing counsel    the defense counsel on the files in litigation (counsel)
     👤 Clients             the firm's clients (the same person on two files: one card, both files)
     👥 Others              emergency contacts, the parties at fault, lien holders, health plans, police
                            agencies and employers
   Each card has the contact details on file and the cases the contact is on (client, case number and what
   they are on that case); a case opens the file. Search by name, company, phone (any format), email,
   claim, report or file number, or a client's name or case number.
   Open it from the sidebar (📇 Contacts, everyone) or the Case Library's 📇 Contacts tab (Admins).
   Trainees never see the Training Library: a case is shown by its client and case number only.
   ========================================================= */
(function () {
    'use strict';
    if (window.LSHContacts) return;
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const KINDS = [
        ['provider', '🩺', 'Medical providers'], ['adjuster', '🛡', 'Adjusters'], ['counsel', '⚖', 'Opposing counsel'],
        ['client', '👤', 'Clients'], ['other', '👥', 'Others']
    ];
    const ICON = Object.fromEntries(KINDS.map(([k, i]) => [k, i]));
    const SPECIALTY = { EMC: 'Urgent care', Chiro: 'Chiropractor', Ortho: 'Orthopedics', 'Emergency Hospital': 'Emergency hospital', Surgery: 'Surgery',
        'Pain Management': 'Pain management', 'Physical Therapy (PT)': 'Physical therapy', 'MRI / Imaging': 'MRI / imaging' };
    const state = { kind: 'all', q: '' };
    let BOOK = null;

    const PHONE = /\(\d{3}\) \d{3}-\d{4}/;
    const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
    const digits = (s) => String(s || '').replace(/\D/g, '');
    const keyOf = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const real = (s) => { const t = String(s || '').trim(); return t && !/^(none|n\/a|unknown|not yet assigned)\b/i.test(t) ? t : ''; };

    /* ---------- the directory, from the case files ---------- */
    function build() {
        const cases = typeof MOCK_CASES !== 'undefined' && Array.isArray(MOCK_CASES) ? MOCK_CASES : [];
        const map = new Map();
        // one card per contact (kind + key); the details fill in from whichever file has them; each file once
        function add(kind, key, base, c, note) {
            const k = kind + '|' + keyOf(key);
            let e = map.get(k);
            if (!e) { e = { kind, name: base.name, title: base.title || '', phone: '', email: '', address: '', refs: [], links: [] }; map.set(k, e); }
            ['phone', 'email', 'address'].forEach(f => { if (!e[f] && real(base[f])) e[f] = real(base[f]); });
            if (c && !e.links.some(l => l.id === c.id && l.note === note)) e.links.push({ id: c.id, client: c.client.name, number: c.caseNumber || '', note: note || '' });
            return e;
        }
        cases.forEach(c => {
            const cl = c.client || {}, who = cl.name || 'the client';
            // 🩺 medical providers
            (c.facilities || []).forEach(f => {
                if (!real(f.name)) return;
                const spec = f.specialty === 'Other' ? (f.specialtyOther || 'Medical provider') : (SPECIALTY[f.specialty] || f.specialty || 'Medical provider');
                add('provider', f.name, { name: f.name, title: spec, phone: f.phone, email: f.email }, c, [f.dates, f.status].filter(Boolean).join(' · '));
            });
            // 🛡 adjusters (or the carrier, until one is assigned)
            const claims = (c.bi || []).map(b => Object.assign({ cover: 'BI' }, b)).concat((c.pipum || []).map(b => Object.assign({ cover: b.type || 'PIP / UM' }, b)));
            claims.forEach(b => {
                const contact = String(b.contact || ''), phone = (contact.match(PHONE) || [''])[0], email = (contact.match(EMAIL) || [''])[0];
                const note = [`${b.cover} claim ${b.claim || '(no number yet)'}`, b.holder ? `insured: ${b.holder}` : ''].filter(Boolean).join(' · ');
                if (real(b.adjuster)) add('adjuster', b.adjuster + '|' + b.carrier, { name: b.adjuster, title: `Adjuster · ${b.carrier || 'insurance carrier'}`, phone, email }, c, note);
                else if (real(b.carrier)) add('adjuster', 'carrier|' + b.carrier, { name: b.carrier, title: 'Insurance carrier · no adjuster assigned yet', phone, email }, c, note);
            });
            // ⚖ opposing counsel
            (c.counsel || []).forEach(o => {
                if (!real(o.name)) return;
                add('counsel', o.name + '|' + o.firm, { name: o.name, title: `Defense counsel · ${o.firm || ''}`.replace(/ · $/, ''), phone: o.phone, email: o.email }, c,
                    `for ${o.represents || 'the defense'}${o.assistant ? ` · assistant: ${o.assistant}` : ''}`);
            });
            // 👤 clients (the same person, by name and date of birth, on more than one file: one card)
            if (real(cl.name)) add('client', cl.name + '|' + (cl.dob || ''), { name: cl.name, title: 'Client', phone: cl.phone, email: cl.email, address: cl.address }, c,
                [c.caseType === 'Other' ? c.caseTypeOther : c.caseType, c.dateOfLoss ? 'DOL ' + c.dateOfLoss : '', c.phase].filter(Boolean).join(' · '));
            // 👥 others
            const em = cl.emergency || {};
            if (real(em.name)) add('other', 'em|' + em.name + '|' + digits(em.phone), { name: em.name, title: `Emergency contact${em.relationship ? ' · ' + em.relationship : ''}`, phone: em.phone }, c, `for ${who}`);
            const tp = c.pd && c.pd.tp;
            (c.bi || []).forEach(b => {
                if (!real(b.holder)) return;
                const phone = tp && keyOf(tp.driver) === keyOf(b.holder) ? tp.driverPhone : '';
                add('other', 'party|' + b.holder, { name: b.holder, title: 'Party at fault (the other side)', phone }, c, real(b.carrier) ? `insured by ${b.carrier}` : 'uninsured');
            });
            (c.liens || []).forEach(l => {
                if (!real(l.entity)) return;
                add('other', 'lien|' + l.entity, { name: l.entity, title: 'Lien holder' }, c, [`${l.type || 'Lien'}`, l.file ? 'file ' + l.file : '', l.amount].filter(Boolean).join(' · '));
            });
            const h = c.health || {};
            if (real(h.carrier)) add('other', 'health|' + h.carrier, { name: h.carrier, title: 'Health insurance' }, c, `${who}'s health plan`);
            const p = c.police || {};
            if (real(p.agency)) add('other', 'police|' + p.agency, { name: p.agency, title: 'Police / reporting agency' }, c, [p.number ? 'report ' + p.number : '', real(p.officer)].filter(Boolean).join(' · '));
            const job = cl.employment || {};
            if (real(job.employer)) add('other', 'employer|' + job.employer, { name: job.employer, title: 'Employer' }, c, `employs ${who}${job.title ? ' (' + job.title + ')' : ''}`);
        });
        const order = Object.fromEntries(KINDS.map(([k], i) => [k, i]));
        const all = [...map.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
        all.forEach(e => {
            e.text = [e.name, e.title, e.phone, e.email, e.address, ...e.links.map(l => `${l.client} ${l.number} ${l.note}`)].join(' ').toLowerCase();
            e.digits = [e.phone, ...e.links.map(l => l.number + ' ' + l.note)].map(digits).join(' ');
        });
        return all;
    }
    const book = () => (BOOK = BOOK || build());

    function matches(e, q) {
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length) return true;
        return words.every(w => e.text.includes(w) || (digits(w).length >= 3 && digits(w).length === w.replace(/[\s().-]/g, '').length && e.digits.includes(digits(w))));
    }

    /* ---------- the cards ---------- */
    const SHOW = 4;   // cases shown on a card before "Show all"
    function cardHTML(e, q) {
        const lines = [
            e.phone ? `<a href="tel:${esc(digits(e.phone))}">📞 ${esc(e.phone)}</a>` : '',
            e.email ? `<a href="mailto:${esc(e.email)}">✉ ${esc(e.email)}</a>` : '',
            e.address ? `<span>📍 ${esc(e.address)}</span>` : ''
        ].filter(Boolean).join('');
        // the cases that match the search first
        const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
        const hit = (l) => words.length && words.every(w => `${l.client} ${l.number} ${l.note}`.toLowerCase().includes(w));
        const links = words.length ? e.links.filter(hit).concat(e.links.filter(l => !hit(l))) : e.links;
        return `<div class="ct-card ct-${e.kind}">
            <div class="ct-top"><span class="ct-ico" aria-hidden="true">${ICON[e.kind]}</span><div class="ct-who"><b>${esc(e.name)}</b><span>${esc(e.title)}</span></div></div>
            ${lines ? `<div class="ct-lines">${lines}</div>` : `<div class="ct-lines ct-none">No phone or email on file</div>`}
            <div class="ct-cases"><div class="ct-lbl">${e.links.length === 1 ? 'On 1 case' : `On ${e.links.length} cases`}</div>
                ${links.slice(0, SHOW).map(caseBtn).join('')}
                ${links.length > SHOW ? `<div class="ct-more" hidden>${links.slice(SHOW).map(caseBtn).join('')}</div>
                    <button type="button" class="ct-all" onclick="this.previousElementSibling.hidden = false; this.remove()">Show all ${links.length} cases</button>` : ''}
            </div>
        </div>`;
    }
    const caseBtn = (l) => `<button type="button" data-case="${esc(l.id)}" onclick="LSHContacts.openCase('${esc(l.id)}')" title="Open this case file"><b>${esc(l.client)}</b>${l.number ? ` <code>${esc(l.number)}</code>` : ''}${l.note ? `<span>${esc(l.note)}</span>` : ''}</button>`;
    function listHTML() {
        const all = book(), q = state.q.trim();
        const hits = all.filter(e => (state.kind === 'all' || e.kind === state.kind) && matches(e, q));
        if (!all.length) return `<p class="ct-empty">No case files are loaded.</p>`;
        if (!hits.length) return `<p class="ct-empty">No contact matches “${esc(q)}”. Try part of a name, a company, a phone number or a claim number.</p>`;
        return KINDS.filter(([k]) => state.kind === 'all' || state.kind === k).map(([k, icon, label]) => {
            const group = hits.filter(e => e.kind === k);
            return group.length ? `<section class="ct-group"><h4>${icon} ${esc(label)} <span>${group.length}</span></h4><div class="ct-grid">${group.map(e => cardHTML(e, q)).join('')}</div></section>` : '';
        }).join('');
    }
    function chipsHTML() {
        const all = book(), q = state.q.trim();
        const n = (k) => all.filter(e => (k === 'all' || e.kind === k) && matches(e, q)).length;
        return [['all', '', 'All']].concat(KINDS).map(([k, icon, label]) =>
            `<button type="button" class="${state.kind === k ? 'on' : ''}" data-kind="${k}" onclick="LSHContacts.kind('${k}')">${icon ? icon + ' ' : ''}${esc(label)} (${n(k)})</button>`).join('');
    }
    // into any two boxes: the search and chips, and the cards (the Contacts window, or the Case Library's tab)
    let target = null;
    function paint(filters, body) {
        target = { filters, body };
        filters.innerHTML = `<input type="search" id="ct-search" class="cl-search" placeholder="Search a name, company, phone, email, claim # or client…" value="${esc(state.q)}"
                oninput="LSHContacts.search(this.value)" autocomplete="off" spellcheck="false" aria-label="Search the contacts">
            <div class="cl-chips ct-chips" id="ct-chips">${chipsHTML()}</div>`;
        body.innerHTML = `<div id="ct-list">${listHTML()}</div>`;
    }
    function repaint() {
        if (!target || !target.body.isConnected) return;
        const chips = target.filters.querySelector('#ct-chips'); if (chips) chips.innerHTML = chipsHTML();
        const list = target.body.querySelector('#ct-list'); if (list) { list.innerHTML = listHTML(); target.body.scrollTop = 0; }
    }

    /* ---------- the window ---------- */
    const CSS = `
    #contacts-modal .modal-box{width:min(1100px,96vw);height:min(860px,92vh);display:flex;flex-direction:column}
    #contacts-modal .ct-sub{margin:2px 0 12px}
    .ct-chips button{white-space:nowrap}
    .ct-group{margin:4px 0 18px}
    .ct-group h4{margin:0 0 10px;font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#0f2148}
    .ct-group h4 span{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:10px;background:#e2e8f0;color:#475569;font-size:11px}
    .ct-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
    .ct-card{border:1px solid #e2e8f0;border-left:5px solid #94a3b8;border-radius:10px;background:#fff;padding:12px 14px;display:flex;flex-direction:column;gap:8px;min-width:0}
    .ct-card.ct-provider{border-left-color:#16a34a}.ct-card.ct-adjuster{border-left-color:#2563eb}.ct-card.ct-counsel{border-left-color:#b91c1c}
    .ct-card.ct-client{border-left-color:#f97316}.ct-card.ct-other{border-left-color:#64748b}
    .ct-top{display:flex;gap:10px;align-items:flex-start}
    .ct-ico{flex:0 0 auto;width:34px;height:34px;border-radius:9px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:18px}
    .ct-who{min-width:0}.ct-who b{display:block;font-size:14px;color:#0f172a;line-height:1.25}
    .ct-who span{display:block;font-size:11.5px;color:#64748b;margin-top:2px}
    .ct-lines{display:flex;flex-direction:column;gap:3px;font-size:12.5px;color:#1e293b}
    .ct-lines a{color:#1d4ed8;text-decoration:none;overflow-wrap:anywhere}.ct-lines a:hover{text-decoration:underline}
    .ct-lines span{overflow-wrap:anywhere}.ct-none{color:#94a3b8;font-style:italic}
    .ct-cases{border-top:1px dashed #e2e8f0;padding-top:7px;display:flex;flex-direction:column;gap:4px}
    .ct-lbl{font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8}
    .ct-cases button{text-align:left;background:#f8fafc;border:1px solid #e2e8f0;border-radius:7px;padding:6px 9px;cursor:pointer;font-size:12px;color:#0f172a;line-height:1.35}
    .ct-cases button:hover{border-color:#f97316;background:#fff7ed}
    .ct-cases code{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10.5px;color:#475569;background:#e2e8f0;border-radius:4px;padding:0 4px}
    .ct-cases button span{display:block;font-size:11px;color:#64748b}
    .ct-more{display:flex;flex-direction:column;gap:4px}.ct-more[hidden]{display:none}
    .ct-cases .ct-all{background:none;border:1px dashed #cbd5e1;color:#1d4ed8;font-weight:700;text-align:center}
    .ct-empty{color:#64748b;font-size:13px;padding:18px 4px}
    @media (max-width:640px){.ct-grid{grid-template-columns:1fr}}`;
    function buildUI() {
        if ($id('contacts-modal')) return;
        const st = document.createElement('style'); st.id = 'ct-css'; st.textContent = CSS; document.head.appendChild(st);
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay no-print" id="contacts-modal" style="z-index:2995;" role="dialog" aria-modal="true" aria-labelledby="ct-title">
            <div class="modal-box wide">
                <h2 class="serif" id="ct-title">📇 Contacts</h2>
                <div class="sub mono ct-sub">Everyone in the case files: medical providers, adjusters, opposing counsel, clients and others, with the cases they're on.</div>
                <div id="ct-filters"></div>
                <div id="ct-body" style="overflow-y:auto;flex:1;"></div>
                <div class="modal-btn-row"><button class="btn-ghost" onclick="closeContacts()">Close</button></div>
            </div>
        </div>`);
        $id('contacts-modal').addEventListener('click', (e) => { if (e.target.id === 'contacts-modal') window.closeContacts(); });
    }
    const signedIn = () => typeof getSession === 'function' && !!getSession();
    window.openContacts = function (query) {
        if (!signedIn()) return false;
        buildUI();
        if (typeof query === 'string') { state.q = query; state.kind = 'all'; }
        paint($id('ct-filters'), $id('ct-body'));
        $id('contacts-modal').classList.add('open');
        const i = $id('ct-search'); if (i) { i.focus(); i.select(); }
        return true;
    };
    window.closeContacts = function () { const m = $id('contacts-modal'); if (m) m.classList.remove('open'); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $id('contacts-modal') && $id('contacts-modal').classList.contains('open')) window.closeContacts(); });

    // the sidebar button, for everyone signed in
    function mount() {
        const after = $id('cl-updates-btn') || $id('cl-open-btn');
        if (after && !$id('ct-open-btn')) after.insertAdjacentHTML('afterend', `<button id="ct-open-btn" type="button" onclick="openContacts()" class="${esc(after.className)}">📇 Contacts</button>`);
        const b = $id('ct-open-btn'); if (b) b.style.display = signedIn() ? '' : 'none';
    }

    window.LSHContacts = {
        all: () => book(),
        paint,
        search(v) { state.q = String(v || ''); repaint(); },
        kind(k) { state.kind = k === 'all' || ICON[k] ? k : 'all'; repaint(); },
        // a case on a card: the file opens (the Case Library closes too, if it's open)
        openCase(id) {
            window.closeContacts();
            if (typeof window.closeCaseLibrary === 'function') window.closeCaseLibrary();
            if (typeof window.openMockCase === 'function') window.openMockCase(id);
        }
    };
    function start() { mount(); setInterval(mount, 2000); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
