/* =========================================================
   LSH CMS — CASE ALERTS (in the case header, seen on every tab)
   ---------------------------------------------------------
     ⚠ Critical note  One short note (500 characters at most) that everyone
                       must see before talking about the case: "Spanish only",
                       "a minor: speak only to her mother", "time-limited
                       demand expires 11/01". A red strip under the case
                       header; ⚠ Add critical note when there is none. Saved
                       with the case by id (#kx-critical, data-keyed).
     ⚖ Conflict check  The client here, and the parties on the other side
                       (Parties Involved: at-fault party / driver, vehicle or
                       property owner; the other vehicle's driver and owner;
                       the BI policy holder), are matched by name against the
                       other case files: a client here who is on the other
                       side of another file, or someone on the other side here
                       who is a client on another file, is a possible conflict
                       of interest. "Not the same person", "Escalate to
                       attorney" and then "Cleared by the attorney" are logged
                       as Case Notes; an escalated match stays up (marked
                       waiting) until it's cleared. Decisions show where the
                       Case Notes can be added to. Worked out in the
                       browser from the Training Library files and your own
                       saved cases; never saved itself.
     SSN               The SSN beside Contact shows only its last 4 digits
                       (•••-••-1234). 👁 shows the whole number for 30 seconds,
                       and each look is logged (/api/case-activity → Master
                       Control › Monitoring › Server Logs: "SSN Viewed").
                       An empty SSN box stays open for typing.
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t, d) => { if (typeof showToast === 'function') showToast(m, t || 'info', d); };
    const session = () => (typeof getSession === 'function' ? getSession() : null) || {};
    const viewOnly = () => !!(window.mockIsViewOnly && window.mockIsViewOnly());
    // a part of the case the person may change (a locked Training Library file opens only the program's areas)
    function canEdit(el) {
        if (viewOnly()) return false;
        const area = $id('capture-area'); if (!area || !area.classList.contains('mock-ro')) return true;
        return !!(el && el.closest('.mock-open') && area.classList.contains('mock-areas-ready'));
    }

    /* ---------- ⚠ Critical note ---------- */
    const CRIT_MAX = 500;
    const critBox = () => $id('kx-critical');
    const critText = () => document.querySelector('#kx-critical [data-k="note"]');
    function paintCritical() {
        const box = critBox(), t = critText(), add = $id('crit-add'); if (!box || !t) return;
        const text = t.innerText.trim(), editing = box.classList.contains('editing') || document.activeElement === t;
        box.classList.toggle('has', !!text);
        box.hidden = !text && !editing;
        if (add) add.hidden = !!text || editing || !canEdit(box);
        const count = box.querySelector('.crit-count');
        if (count) count.textContent = editing ? `${text.length}/${CRIT_MAX}` : '';
    }
    function addCritical() {
        const box = critBox(), t = critText(); if (!box || !t || !canEdit(box)) return;
        box.classList.add('editing'); paintCritical();
        t.focus();
    }
    function initCritical() {
        const box = critBox(), t = critText(); if (!box || !t) return;
        t.addEventListener('focus', () => { box.classList.add('editing'); paintCritical(); });
        t.addEventListener('blur', () => { box.classList.remove('editing'); paintCritical(); });
        // Over the limit, what's being typed or pasted is cut (not the end of the note).
        t.addEventListener('beforeinput', (e) => {
            if (e.defaultPrevented || !/^insert/.test(e.inputType)) return;
            const data = e.data != null ? e.data : (e.dataTransfer ? e.dataTransfer.getData('text/plain') : '');
            if (!data) return;
            const sel = window.getSelection(), selected = sel && sel.rangeCount && t.contains(sel.anchorNode) ? sel.toString().length : 0;
            const room = CRIT_MAX - (t.innerText.length - selected);
            if (data.length <= room) return;
            e.preventDefault();
            if (room > 0) document.execCommand('insertText', false, data.slice(0, room));
            toast(`A critical note holds ${CRIT_MAX} characters at most. Put the details in a Case Note.`, 'info', 4500);
        });
        t.addEventListener('input', () => {
            if (t.innerText.length > CRIT_MAX) {   // (anything that got past the check above)
                t.innerText = t.innerText.slice(0, CRIT_MAX);
                const r = document.createRange(); r.selectNodeContents(t); r.collapse(false);
                const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
                toast(`A critical note holds ${CRIT_MAX} characters at most. Put the details in a Case Note.`, 'info', 4500);
            }
            paintCritical();
        });
        // Enter finishes the note; it's one strip, not a page (details go in the Case Notes)
        t.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); t.blur(); } });
        new MutationObserver(paintCritical).observe(t, { childList: true, characterData: true, subtree: true });
        paintCritical();
    }

    /* ---------- ⚖ Conflict check ---------- */
    const OTHER_SIDE_ROLES = { 'At-Fault Party': 'the at-fault party', 'At-Fault Driver': 'the at-fault driver', 'Vehicle Owner': 'the other vehicle\'s owner', 'Property Owner / Business': 'the property owner' };
    const NOT_A_PERSON = /^(llc|inc|corp|co|company|group|ltd|lp|llp|city|county|state|of|the|and|dba|trust|bank|insurance|hotel|market|stores?)$/;
    // A person's names as "first last": "Morales, Sofia" and "Sofia Morales (minor), by her father …" both give "sofia morales";
    // middle names, initials, nicknames in quotes, curly apostrophes and suffixes don't matter; a double surname with a
    // hyphen ("Ana García-López") matches each part too. A business isn't a person: none.
    const SUFFIX = /^(jr|sr|ii|iii|iv|mr|mrs|ms|dr|hon)$/;
    function personKeys(name) {
        let s = String(name || '').replace(/[‘’`´]/g, "'").replace(/\([^)]*\)/g, ' ').replace(/["“”][^"“”]*["“”]/g, ' ').replace(/^\s*estate of\s+/i, '');
        s = s.split(/,\s*(?:by|for|c\/o)\s+/i)[0].split(/\s+(?:by|for)\s+(?:his|her|their)\s+/i)[0];
        s = s.replace(/,?\s*\b(?:jr|sr|ii|iii|iv)\.?\s*$/i, '');   // "Morales, Sofia, Jr."
        const lastFirst = /^\s*([^,]+),\s*([^,]+)$/.exec(s);
        if (lastFirst) s = lastFirst[2] + ' ' + lastFirst[1];
        const words = s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z' -]/g, ' ').split(/\s+/)
            .map(w => w.replace(/'/g, '').replace(/^-+|-+$/g, '')).filter(w => w && !SUFFIX.test(w));
        if (words.length < 2 || words.some(w => w.split('-').some(p => NOT_A_PERSON.test(p)))) return [];
        const first = words[0].split('-')[0], parts = words[words.length - 1].split('-').filter(Boolean);
        return [...new Set([first + ' ' + parts.join(''), ...(parts.length > 1 ? parts.map(p => first + ' ' + p) : [])])];
    }
    const personKey = (name) => personKeys(name)[0] || '';
    const sameName = (a, b) => { const kb = personKeys(b); return personKeys(a).some(k => kb.includes(k)); };
    const typeWord = (c) => (c.caseType === 'Others' ? c.caseTypeOther : c.caseType) || 'case';
    // everyone on the other files: the clients, and who is on the other side
    function otherFiles(thisLib) {
        const out = [];
        (typeof MOCK_CASES !== 'undefined' && Array.isArray(MOCK_CASES) ? MOCK_CASES : []).forEach(c => {
            if (!c || c.id === thisLib) return;
            const file = { client: (c.client || {}).name || '', number: c.caseNumber || '', dol: c.dateOfLoss || '', type: typeWord(c), libId: c.id };
            out.push(Object.assign({ name: file.client, side: 'client', what: 'the client' }, file));
            (c.bi || []).forEach(b => { if (b.holder) out.push(Object.assign({ name: b.holder, side: 'other', what: 'the party at fault (the BI policy holder)' }, file)); });
            const tp = c.pd && c.pd.tp;
            if (tp && tp.driver) out.push(Object.assign({ name: tp.driver, side: 'other', what: 'the other vehicle\'s driver' }, file));
            if (tp && tp.owner && !sameName(tp.owner, tp.driver)) out.push(Object.assign({ name: tp.owner, side: 'other', what: 'the other vehicle\'s owner' }, file));
        });
        // your own saved cases (the list from /api/case-repository): their clients
        const me = session().username, open = typeof currentCaseId !== 'undefined' ? currentCaseId : null;
        (typeof _repoCache !== 'undefined' && Array.isArray(_repoCache) ? _repoCache : []).forEach(r => {
            if (!r || r.id === open || r.ownerUsername !== me || !r.clientName) return;
            out.push({ name: r.clientName, side: 'client', what: 'the client', client: r.clientName, number: r.caseId || '', dol: r.dateOfLoss || '', type: 'case', repoId: r.id });
        });
        return out;
    }
    const textOf = (el) => (el ? (el.innerText || el.textContent || '').trim() : '');
    // a name as it was typed (the client's name box shows in capitals)
    const nameOf = (el) => (el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '');
    function fieldBy(scope, label) {
        const l = scope && Array.from(scope.querySelectorAll('label')).find(x => x.textContent.trim().toLowerCase().startsWith(label.toLowerCase()));
        if (!l) return null;
        return (l.nextElementSibling && l.nextElementSibling.matches('[contenteditable]')) ? l.nextElementSibling : l.parentElement.querySelector('[contenteditable]');
    }
    // the people on this case: its client, and who is on the other side
    function thisCase() {
        const people = [];
        const client = nameOf($id('client-name-field'));
        if (client) people.push({ name: client, side: 'client', what: 'the client here' });
        document.querySelectorAll('#kx-parties .kx-row').forEach(row => {
            const role = row.querySelector('select[data-role]'), what = role && OTHER_SIDE_ROLES[role.value];
            const name = nameOf(fieldBy(row, 'Full Name'));
            if (what && name) people.push({ name, side: 'other', what: what + ' here' });
        });
        const d = nameOf($id('tp-driver')), o = nameOf($id('tp-owner'));
        if (d) people.push({ name: d, side: 'other', what: 'the other vehicle\'s driver here' });
        if (o && !sameName(o, d)) people.push({ name: o, side: 'other', what: 'the other vehicle\'s owner here' });
        document.querySelectorAll('#bi-container > *').forEach(card => { const h = nameOf(fieldBy(card, 'Policy Holder')); if (h) people.push({ name: h, side: 'other', what: 'the BI policy holder here' }); });
        return people;
    }
    let loadedLib = null;   // a saved case that is someone's work on a library file (its trainingLibraryId): not a conflict with itself
    const thisLibId = () => (window.mockCurrentId && window.mockCurrentId()) || loadedLib;
    // each Case Note's text (its date and staff dropdown left out)
    const noteTexts = () => Array.from(document.querySelectorAll('#note-body > tr')).map(tr => { const c = tr.querySelectorAll('[contenteditable]'); return (c[c.length - 1] ? c[c.length - 1].textContent : '').toLowerCase(); });
    let shown = [];
    function findConflicts() {
        const here = thisCase(); if (!here.length) return [];
        const there = otherFiles(thisLibId()), notes = noteTexts(), seen = new Set(), out = [];
        here.forEach(h => {
            const k = personKey(h.name); if (!k) return;
            there.forEach(t => {
                if (t.side === h.side) return;   // a client on two files is the same client; two at-fault parties aren't a conflict
                if (!sameName(t.name, h.name)) return;
                const id = `${k}|${t.number || t.repoId || t.libId}`;
                if (seen.has(id)) return;
                seen.add(id);
                // what the Case Notes say about it: a note naming this person and the other file (its number, or its client)
                const ref = String(t.number || t.client).toLowerCase(), name = h.name.toLowerCase();
                const about = notes.filter(n => n.includes('conflict check') && n.includes(name) && n.includes(ref));
                if (about.some(n => /not the same person|cleared by the attorney/.test(n))) return;
                out.push({ here: h, there: t, escalated: about.some(n => n.includes('escalated')) });
            });
        });
        return out;
    }
    const sentence = (m) => `<b>${esc(m.here.name)}</b> (${esc(m.here.what)}) has the same name as ${esc(m.there.what)} on <b>${esc(m.there.client)}</b>'s ${esc(m.there.type)} file${m.there.number ? ` <code>${esc(m.there.number)}</code>` : ''}${m.there.dol ? ` (DOL ${esc(m.there.dol)})` : ''}.`;
    // where a decision can be logged: the Case Notes can be added to (on a locked library file, when its Notes are open)
    function canLogNote() {
        const area = $id('capture-area'); if (!area || !area.classList.contains('mock-ro')) return true;
        const notes = $id('pane-notes');
        return area.classList.contains('mock-upd-ready') || !!(area.classList.contains('mock-areas-ready') && notes && notes.classList.contains('mock-open'));
    }
    function paintConflicts() {
        const panel = $id('conflict-panel'); if (!panel) return;
        shown = findConflicts();
        const log = canLogNote();
        const html = shown.length ? `<div class="cf-head">⚖ Possible conflict of interest <span>Check it before you share anything or sign the client up.</span></div>
            <ul>${shown.map((m, i) => `<li><div>${sentence(m)}${m.escalated ? ' <b class="cf-wait">Escalated to the attorney: waiting for their decision.</b>' : ''}</div><div class="cf-acts">
                ${m.there.libId || m.there.repoId ? `<button type="button" data-cf="open" data-i="${i}">Open that file</button>` : ''}
                ${!log ? '' : m.escalated
                    ? `<button type="button" data-cf="cleared" data-i="${i}" title="The attorney checked it: the firm can go ahead">Cleared by the attorney</button>`
                    : `<button type="button" data-cf="clear" data-i="${i}" title="You checked the date of birth, address or phone: a different person">Not the same person</button>
                <button type="button" data-cf="escalate" data-i="${i}" class="cf-esc" title="The attorney decides whether the firm can take or keep the case">Escalate to attorney</button>`}</div></li>`).join('')}</ul>` : '';
        if (panel.innerHTML !== html) panel.innerHTML = html;
        panel.hidden = !shown.length;
    }
    function logDecision(m, decision) {
        if (typeof addRow !== 'function' || !$id('note-body')) return;
        const me = session(), who = me.fullName || me.username || 'staff';
        const what = decision === 'clear' ? 'Decision: not the same person (date of birth, address or phone checked).'
            : decision === 'cleared' ? 'Decision: cleared by the attorney; the firm can go ahead.'
            : 'Decision: escalated to the attorney for a conflict review; nothing shared until it is cleared.';
        addRow('note-body');
        const tr = $id('note-body').lastElementChild; if (!tr) return;
        const sel = tr.querySelector('select'); if (sel && Array.from(sel.options).some(o => o.value === 'Intake Specialist')) sel.value = 'Intake Specialist';
        const cells = tr.querySelectorAll('[contenteditable="true"]');
        const text = `Conflict check: ${m.here.name} (${m.here.what}) has the same name as ${m.there.what} on ${m.there.client}'s file ${m.there.number || ''}. ${what} — ${who}`.replace(/\s+/g, ' ');
        if (cells[1]) { cells[1].innerText = text; cells[1].dispatchEvent(new Event('input', { bubbles: true })); }
        toast(viewOnly() ? 'Logged in this case\'s Case Notes.' : 'Logged in Case Notes. Save the case to keep it.', 'success', 4500);
        paintConflicts();
    }
    function initConflicts() {
        const panel = $id('conflict-panel'); if (!panel) return;
        panel.addEventListener('click', (e) => {
            const b = e.target.closest('button[data-cf]'); if (!b) return;
            const m = shown[+b.dataset.i]; if (!m) return;
            if (b.dataset.cf === 'open') {
                if (m.there.libId && window.LSHContacts) window.LSHContacts.openCase(m.there.libId);
                else if (m.there.repoId && typeof loadCase === 'function') loadCase(m.there.repoId);
                return;
            }
            logDecision(m, b.dataset.cf);
        });
    }

    /* ---------- SSN: the last 4 only ---------- */
    const SHOW_MS = 30000;
    let shownUntil = 0, hideTimer = null;
    const ssnField = () => $id('head-ssn-field');
    function maskButton() {
        let b = $id('ssn-mask');
        const f = ssnField(); if (!f) return null;
        if (!b) {
            f.insertAdjacentHTML('afterend', '<button type="button" id="ssn-mask" class="ssn-mask" hidden></button>');
            b = $id('ssn-mask');
            b.addEventListener('click', () => { if (Date.now() < shownUntil) hideSsn(); else showSsn(); });
        }
        return b;
    }
    function paintSsn() {
        const f = ssnField(), b = maskButton(); if (!f || !b) return;
        const text = textOf(f), digits = text.replace(/\D/g, '');
        const focused = document.activeElement === f, open = Date.now() < shownUntil;
        if (!text || focused) { f.classList.remove('ssn-hidden'); b.hidden = true; return; }
        f.classList.toggle('ssn-hidden', !open);
        b.hidden = false;
        if (open) {
            b.innerHTML = '<span aria-hidden="true">🙈</span> Hide';
            b.title = 'Hide the SSN again';
            b.setAttribute('aria-label', 'Hide the SSN');
        } else {
            const last4 = digits.length >= 4 ? digits.slice(-4) : '••••';
            b.innerHTML = `<span class="ssn-dots">•••-••-${esc(last4)}</span> <span aria-hidden="true">👁</span>`;
            b.title = 'Only the last 4 show. 👁 shows the full SSN for 30 seconds; each look is logged.';
            b.setAttribute('aria-label', `SSN ending ${last4}. Show the full SSN (logged)`);
        }
    }
    function showSsn() {
        const f = ssnField(); if (!f || !textOf(f)) return;
        shownUntil = Date.now() + SHOW_MS;
        clearTimeout(hideTimer); hideTimer = setTimeout(hideSsn, SHOW_MS + 50);
        paintSsn();
        // the case's number once it has one ("Assigned on Save Case" isn't one), and the client's name as typed (not in capitals)
        const id = ($id('case-id-field') || {}).textContent || '', caseId = /\d/.test(id) && /^[A-Za-z0-9-]+$/.test(id.trim()) ? id.trim() : '';
        const client = (($id('client-name-field') || {}).textContent || '').trim();
        fetch('/api/case-activity', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ssn-view', caseId, clientName: client }) }).catch(() => { /* the look still shows */ });
    }
    function hideSsn() {
        shownUntil = 0; clearTimeout(hideTimer);
        const f = ssnField(); if (f && document.activeElement === f) f.blur();
        paintSsn();
    }
    function initSsn() {
        const f = ssnField(); if (!f) return;
        maskButton();
        f.addEventListener('focus', paintSsn);
        f.addEventListener('blur', () => setTimeout(paintSsn, 0));
        new MutationObserver(paintSsn).observe(f, { childList: true, characterData: true, subtree: true });
        paintSsn();
    }

    /* ---------- staying up to date ---------- */
    let timer = null;
    function schedule() { clearTimeout(timer); timer = setTimeout(() => { paintCritical(); paintConflicts(); }, 400); }
    const after = (name, fn) => {
        const f = window[name]; if (typeof f !== 'function' || f.__alerts) return;
        const w = function () { const r = f.apply(this, arguments); try { fn.apply(this, arguments); } catch (e) { /* the case still opens */ } return r; };
        w.__alerts = true; window[name] = w;
    };
    function start() {
        initCritical(); initConflicts(); initSsn();
        // a case opened or the editor cleared: a new case starts with its SSN hidden
        after('applyCaseContentToDOM', (content, root) => { if (!root || root === document) { loadedLib = (content && content.trainingLibraryId) || null; shownUntil = 0; schedule(); } });
        after('blankCaseEditorContent', () => {
            loadedLib = null; shownUntil = 0;
            const t = critText(); if (t && document.activeElement === t) t.blur();   // the note being typed in goes with the case
            const box = critBox(); if (box) box.classList.remove('editing');
            schedule();
        });
        ['openMockCase', 'closeCase', 'loadCase'].forEach(n => after(n, () => { shownUntil = 0; schedule(); }));
        const prevAfter = window.afterKeyedApplied;
        window.afterKeyedApplied = function () { const r = typeof prevAfter === 'function' ? prevAfter.apply(this, arguments) : undefined; schedule(); paintSsn(); return r; };
        // who is on the case changes as people type (the client, the parties, the other vehicle, the BI policy holder, the notes)
        const area = $id('capture-area');
        if (area) {
            const mine = (n) => { const el = n && (n.nodeType === 1 ? n : n.parentElement); return !!(el && el.closest && el.closest('#case-alerts, #ssn-mask, [data-free-edit]')); };
            new MutationObserver((recs) => { if (recs.some(r => !mine(r.target))) schedule(); }).observe(area, { childList: true, subtree: true, characterData: true });
            area.addEventListener('change', schedule);
            // a Training Library file locking or opening its areas: whether ⚠ Add critical note shows
            new MutationObserver(() => { paintCritical(); schedule(); }).observe(area, { attributes: true, attributeFilter: ['class'] });
        }
        schedule();
    }
    window.lshCaseAlerts = { addCritical, personKey, personKeys, sameName, conflicts: findConflicts, refresh: () => { paintCritical(); paintConflicts(); paintSsn(); }, showSsn, hideSsn };
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
