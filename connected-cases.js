/* =========================================================
   LSH CaseWorX — 🔗 CONNECTED CASES
   ---------------------------------------------------------
   One accident, more than one client of the firm: the driver and the passenger of the same car, the vehicle
   owner and the driver he lent it to, a parent and her minor children. Each file is its own case (its own
   injuries, liens, offers and confidentiality), but staff must see at a glance that the others exist.
   The Training Library files say which accident they belong to (mock-cases.js `connected: { group, role }`).
   When one of them is open (the file itself, or a trainee's own saved copy of it), a 🔗 Connected cases card
   shows under the ⚠ Critical note beside the Client's ID: each other client on that accident with their part in
   it (Passenger, Vehicle owner, Minor child…), and a click opens that file. It works both ways: every file in
   the group lists all the others. Nothing here is saved with the case (no field, no contenteditable).
   ========================================================= */
(function () {
    'use strict';
    if (window.LSHConnected) return;
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const cases = () => (typeof MOCK_CASES !== 'undefined' && Array.isArray(MOCK_CASES) ? MOCK_CASES : []);
    const byId = (id) => cases().find(c => c.id === id);
    // the other files on the same accident as `id`, in the library's order
    function linked(id) {
        const me = byId(id), g = me && me.connected && me.connected.group;
        return g ? cases().filter(c => c.id !== id && c.connected && c.connected.group === g) : [];
    }
    const CSS = `
    #cx-card{display:flex;flex-direction:column;gap:7px;border-radius:14px;padding:10px 12px 12px;border:2px solid transparent;
        background:linear-gradient(160deg,#f5f8ff 0%,#fff 60%) padding-box,linear-gradient(135deg,#1e3a8a 0%,#2b4fa8 45%,#c9973f 100%) border-box;box-shadow:0 8px 18px -12px rgba(30,58,138,.6)}
    #cx-card[hidden]{display:none}
    #cx-card .cx-h{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#1E2340}
    #cx-card .cx-h b{margin-left:auto;min-width:20px;text-align:center;border-radius:999px;padding:1px 7px;background:linear-gradient(135deg,#1E2340,#1d3f86);color:#fde68a;font-size:11px}
    #cx-card .cx-g{font-size:11.5px;font-weight:700;color:#475569;line-height:1.3}
    #cx-card .cx-me{font-size:11.5px;font-weight:800;color:#1d3f86}
    #cx-card button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;cursor:pointer;border:1.5px solid #dbe3f0;border-radius:10px;background:#fff;padding:7px 10px;font-family:inherit;transition:border-color .12s,box-shadow .12s}
    #cx-card button:hover{border-color:#c9973f;box-shadow:0 0 0 3px rgba(201,151,63,.18)}
    #cx-card .cx-role{font-size:10.5px;font-weight:900;letter-spacing:.05em;text-transform:uppercase;color:#fff;background:#1d3f86;border-radius:999px;padding:1px 8px}
    #cx-card .cx-name{font-size:14px;font-weight:900;color:#0b1430}
    #cx-card .cx-no{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:11px;font-weight:700;color:#475569}
    .cx-col{display:flex;flex-direction:column;gap:10px;flex:0 1 300px;min-width:200px;max-width:340px}
    .cx-col:not(:has(> :not([hidden]))){display:none}
    #capture-area .header-card .cx-col .crit-pill{margin-top:0;max-width:none;width:auto;flex:none}
    #capture-area .header-card .hdr-idrow > .cx-col{margin-top:22px}
    @media (max-width:1500px){#capture-area .header-card .hdr-idrow > .cx-col{margin-top:0;width:220px;flex:none;min-width:0}}
    @media (max-width:760px){#capture-area .header-card .hdr-idrow > .cx-col{width:auto;flex:1 1 100%;max-width:none}}
    @media print{#cx-card{display:none}}`;
    // the card's place: under the ⚠ Critical note beside the Client's ID (a column of its own in the header's ID row);
    // on a header without that row, under the Client's ID
    function mount() {
        if ($id('cx-card')) return $id('cx-card');
        const row = document.querySelector('.header-card .hdr-idrow'), crit = $id('kx-critical'), idBox = $id('kx-client-id');
        if (!row && !idBox) return null;
        if (!$id('cx-css')) { const st = document.createElement('style'); st.id = 'cx-css'; st.textContent = CSS; document.head.appendChild(st); }
        const card = document.createElement('div');
        card.id = 'cx-card'; card.className = 'no-print'; card.hidden = true; card.setAttribute('aria-label', 'Connected cases');
        if (row) {
            const col = document.createElement('div'); col.className = 'cx-col';
            if (crit && crit.parentElement === row) row.insertBefore(col, crit); else row.appendChild(col);
            if (crit && crit.parentElement === row) col.appendChild(crit);   // (moved, not copied: it is saved by its id)
            col.appendChild(card);
        } else idBox.insertAdjacentElement('afterend', card);
        return card;
    }
    let shownFor = null;
    function paint() {
        const card = mount(); if (!card) return;
        const id = typeof window.mockCurrentId === 'function' ? window.mockCurrentId() : null;
        if (id === shownFor) return;
        shownFor = id;
        const others = id ? linked(id) : [];
        // none: the card stays as an empty placeholder (it shows where the header has room for it; CSS keeps it hidden elsewhere)
        if (!others.length) { card.hidden = true; card.innerHTML = '<div class="cx-h">🔗 Connected cases <b>0</b></div><div class="cx-g">No other client of the firm on this accident.</div>'; return; }
        const me = byId(id).connected;
        card.innerHTML = `<div class="cx-h">🔗 Connected cases <b>${others.length}</b></div>
            <div class="cx-g">${esc(me.group)}</div>
            <div class="cx-me">This file: ${esc(me.role)}</div>
            ${others.map(c => `<button type="button" data-cx="${esc(c.id)}" title="Open ${esc(c.client.name)}'s file">
                <span class="cx-role">${esc(c.connected.role)}</span><span class="cx-name">${esc(c.client.name)}</span><span class="cx-no">${esc(c.caseNumber || '')}</span></button>`).join('')}`;
        card.hidden = false;
    }
    function open(id) {
        if (typeof window.caseLibraryOpen === 'function') return window.caseLibraryOpen('mock', id);
        if (typeof window.openMockCase === 'function') window.openMockCase(id);
    }
    document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('#cx-card [data-cx]'); if (b) open(b.dataset.cx); });
    window.LSHConnected = { linked: (id) => linked(id).map(c => c.id), refresh() { shownFor = undefined; paint(); }, open };
    function start() { paint(); setInterval(paint, 800); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
