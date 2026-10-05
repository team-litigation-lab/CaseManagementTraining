/* =========================================================
   LSH CMS — CASE DATES THAT MOVE TOGETHER
   ---------------------------------------------------------
   A case's dates hang off the date of loss (DOL) and the dates of
   service (DOS) in the Medical Chronology. When either is edited, the
   rest of the case is brought into line, so the file never contradicts
   itself:
   - DOL: every later date on the case moves by the same number of days
     as the DOL did: the SOL (both places), the treatment chronology (dates
     of service and next visits), the providers' treatment periods,
     insurance and lien letters, demand and litigation dates, ADR,
     settlement, the case notes and tasks, and dates written inside the
     narrative and notes. Dates of birth, and dates before the old DOL
     (prior injuries, a policy that started before), stay as they are.
   - DOS: the row's later dates of service and its next visit move with
     it, and that provider's treatment period in the Providers table is
     set from its first to its last date of service ("– present" stays).
   It happens when the trainee leaves the field (only a real edit, never
   when a case is loaded), and a bar says what moved, with ↶ Undo.
   Dates are MM/DD/YYYY (M/D/YYYY is read too), as the CMS writes them.
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
    // MM/DD/YYYY as a day number; null when it isn't a real date
    function dayOf(s) {
        const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(String(s || ''));
        return m ? dayParts(+m[1], +m[2], +m[3]) : null;
    }
    function dayParts(mo, d, y) {
        if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
        const t = Date.UTC(y, mo - 1, d), x = new Date(t);
        return x.getUTCMonth() === mo - 1 && x.getUTCDate() === d ? Math.round(t / 864e5) : null;
    }
    // the first date in a text ("09/29/2026 10:30 AM"), as a day number
    const firstDay = (s) => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || '')); return m ? dayParts(+m[1], +m[2], +m[3]) : null; };
    function fmt(day) {
        const x = new Date(day * 864e5);
        return `${String(x.getUTCMonth() + 1).padStart(2, '0')}/${String(x.getUTCDate()).padStart(2, '0')}/${x.getUTCFullYear()}`;
    }
    // Moves every date in a text that is on or after `from` (and isn't one of `keep`) by `delta` days.
    function shiftText(text, from, delta, keep) {
        let n = 0;
        const out = String(text).replace(DATE, (all, mo, d, y) => {
            const day = dayParts(+mo, +d, +y);
            if (day === null || day < from || (keep && keep.has(day))) return all;
            n++; return fmt(day + delta);
        });
        return { text: out, n };
    }

    const area = () => $id('capture-area');
    const isDol = (el) => el && el.id === 'date-of-loss-field';
    const dosList = (el) => el && el.closest && el.closest('#chrono-container .chrono-dos-list');
    const labelOf = (el) => { const box = el.parentElement; const l = box && box.querySelector(':scope > label'); return l ? l.textContent : ''; };
    // Dates of birth never move (the client's, a passenger's, a contact's)
    const isDob = (el) => /dob/i.test(el.id || '') || /\bDOB\b|date of birth|birth ?date/i.test(labelOf(el));
    // The case's fields the user may edit (on a library file, only their program's parts: training-library.js mockLocked)
    const mayEdit = (el) => !(typeof window.mockLocked === 'function' && window.mockLocked(el));
    const editable = (root) => [...root.querySelectorAll('[contenteditable="true"]')].filter(el => !el.closest('[data-free-edit]') && !el.querySelector('[contenteditable="true"]') && mayEdit(el));

    // The text nodes of a field, shifted in place (formatting and line breaks stay); the field's old HTML for Undo.
    function shiftField(el, from, delta, keep) {
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node, n = 0; const before = el.innerHTML;
        while ((node = walk.nextNode())) { const r = shiftText(node.nodeValue, from, delta, keep); if (r.n) { node.nodeValue = r.text; n += r.n; } }
        return n ? { el, before, n } : null;
    }
    // Tell the case it changed (autosave, a library file's edits and Notes / Tasks updates). From the field's box, not the field:
    // the field's own input formatting would drop what follows a date (a next visit's "10:30 AM").
    const touched = (els) => els.forEach(el => (el.parentElement || el).dispatchEvent(new Event('input', { bubbles: true })));

    /* ---------- the DOL moved ---------- */
    function alignToDol(dolEl, was, now) {
        const root = area(); if (!root) return;
        const delta = now - was, keep = new Set();
        const fields = editable(root).filter(el => el !== dolEl);
        fields.filter(isDob).forEach(el => { const d = dayOf(el.innerText); if (d !== null) keep.add(d); });
        const changed = fields.filter(el => !isDob(el)).map(el => shiftField(el, was, delta, keep)).filter(Boolean);
        if (!changed.length) return;
        touched(changed.map(c => c.el));
        bar(`📅 The DOL moved ${days(delta)}: ${count(changed)} on the case moved with it (SOL, treatment, notes and tasks, letters and deadlines).`, changed);
    }

    /* ---------- a date of service moved ---------- */
    function alignToDos(dosEl, was, now) {
        const list = dosList(dosEl), row = list && list.closest('tr'); if (!row) return;
        const delta = now - was, changed = [];
        // the row's later dates of service and its next visit move with it
        list.querySelectorAll('[contenteditable="true"]').forEach(el => {
            if (el === dosEl || !mayEdit(el)) return;
            const d = dayOf(el.innerText); if (d === null || d <= was) return;
            const c = shiftField(el, was + 1, delta); if (c) changed.push(c);
        });
        const cells = row.children, next = cells[2] && cells[2].querySelector('[contenteditable="true"]');
        if (next && mayEdit(next)) { const d = firstDay(next.innerText); if (d !== null && d >= was) { const c = shiftField(next, was, delta); if (c) changed.push(c); } }
        // the provider's treatment period: from its first to its last date of service
        const name = norm(cells[1] && cells[1].innerText);
        const period = name && providerPeriod(name);
        if (period && !mayEdit(period)) return finish(changed, delta);
        if (period) {
            const all = [...document.querySelectorAll('#chrono-container tr')].filter(tr => norm(tr.children[1] && tr.children[1].innerText) === name)
                .flatMap(tr => [...tr.querySelectorAll('.chrono-dos-list [contenteditable="true"]')].map(el => dayOf(el.innerText))).filter(d => d !== null);
            if (all.length) {
                const before = period.innerHTML, old = period.innerText.trim();
                const end = /present|ongoing/i.test(old) ? (old.match(/present|ongoing/i)[0]) : fmt(Math.max(...all));
                const text = `${fmt(Math.min(...all))} – ${end}`;
                if (text !== old) { period.textContent = text; changed.push({ el: period, before, n: 1 }); }
            }
        }
        finish(changed, delta);
    }
    function finish(changed, delta) {
        if (!changed.length) return;
        touched(changed.map(c => c.el));
        bar(`📅 The date of service moved ${days(delta)}: ${count(changed)} moved with it (the later visits, the next visit, the provider's treatment period).`, changed);
    }
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    // The Providers table's "treatment period" field (MM/DD/YYYY – MM/DD/YYYY) for a provider named in the chronology
    function providerPeriod(name) {
        for (const tr of document.querySelectorAll('#facility-container tr')) {
            const nm = tr.children[0] && tr.children[0].querySelector('[contenteditable="true"]');
            if (!nm || norm(nm.innerText) !== name) continue;
            return [...tr.querySelectorAll('[contenteditable="true"]')].find(el => /MM\/DD\/YYYY\s*[–-]/.test(el.getAttribute('data-ph') || '')) || null;
        }
        return null;
    }
    const days = (d) => `${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ${d > 0 ? 'later' : 'earlier'}`;
    const count = (changed) => { const n = changed.reduce((a, c) => a + c.n, 0); return `${n} other date${n === 1 ? '' : 's'}`; };

    /* ---------- the bar, with Undo ---------- */
    let undo = null, hideAt = null;
    function bar(msg, changed) {
        let b = $id('cd-bar');
        if (!b) {
            document.body.insertAdjacentHTML('beforeend', `<div id="cd-bar" class="no-print" role="status" style="position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:3100;max-width:min(640px,calc(100vw - 32px));background:#0f2148;color:#fff;border-radius:10px;padding:10px 12px 10px 14px;font-size:12.5px;line-height:1.45;box-shadow:0 10px 30px rgba(0,0,0,.3);display:flex;gap:12px;align-items:center"><span></span><button type="button" style="background:#f97316;color:#fff;border:none;border-radius:7px;padding:6px 11px;font-weight:800;font-size:12px;cursor:pointer;white-space:nowrap">↶ Undo</button></div>`);
            b = $id('cd-bar');
            b.querySelector('button').addEventListener('click', () => { if (undo) undo(); });
        }
        b.querySelector('span').textContent = msg;
        b.style.display = 'flex';
        undo = () => { changed.forEach(c => { c.el.innerHTML = c.before; }); touched(changed.map(c => c.el)); hideBar(); };
        clearTimeout(hideAt); hideAt = setTimeout(hideBar, 15000);
    }
    function hideBar() { undo = null; const b = $id('cd-bar'); if (b) b.style.display = 'none'; }

    /* ---------- when a DOL or a date of service is edited ---------- */
    const watched = (el) => el && el.matches && el.matches('[contenteditable="true"]') && (isDol(el) || dosList(el)) && area() && area().contains(el);
    document.addEventListener('focusin', (e) => { if (watched(e.target)) e.target.dataset.dateWas = e.target.innerText.trim(); });
    document.addEventListener('focusout', (e) => {
        const el = e.target; if (!watched(el) || el.dataset.dateWas == null) return;
        const was = dayOf(el.dataset.dateWas); delete el.dataset.dateWas;
        // after the field's own formatting (app.js) has run
        setTimeout(() => {
            const now = dayOf(el.innerText);
            if (was === null || now === null || was === now) return;
            if (isDol(el)) alignToDol(el, was, now); else alignToDos(el, was, now);
        }, 0);
    });
    window.lshCaseDates = { dayOf, fmt, shiftText };
})();
