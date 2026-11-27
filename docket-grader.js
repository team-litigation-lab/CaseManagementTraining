/* =========================================================
   LSH CaseWorX — 📋 DOCKETING CHECK (the Firm Calendar's grader)
   ---------------------------------------------------------
   On the case's 📅 Calendar tab: are the open case's deadlines on the
   calendar, on the right day? The deadlines come from the case itself:
   - the Statute of Limitations: the SOL on the file, checked against the
     date of loss and the state rule (Georgia: 2 years, O.C.G.A. § 9-3-33;
     a minor's claim tolled to 18, so their 20th birthday; § 9-3-90). A
     file SOL a whole number of years after the DOL (another state's rule)
     is trusted; any other date is flagged and the rule's date is expected;
   - SOL reminders 30 and 7 days before it;
   - the Discovery cut-off and the Trial date (Litigation tab);
   - on a Training Library file, the discovery and deposition dates still
     pending on it.
   A deadline already passed isn't graded. Each one is scored 0-5: on the
   right day (3), as a Deadline (or a Trial / Deposition / hearing for
   those) (1), on the case's attorney's calendar (1); docketed on the wrong
   day scores 1, and an event not linked to the case loses a point.
   🎯 Submit grade sends it like a graded Calendar Sim call (the FT
   Calendar Management line, /api/drill-results mode 'graded'), so it is
   kept with the trainee's Call Simulator results, scored by the trainer on
   the same scorecard, and counted on the Portal. Saving a deadline on the
   calendar checks it at once (a toast).
   Also: the Firm Calendar in the Simulators' look (navy and gold).
   No <select> or contenteditable here: the case is saved by position.
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t, d) => { if (typeof showToast === 'function') showToast(m, t || 'info', d); };

    /* ---------- dates: day numbers (days since 1970, UTC) ---------- */
    function dayParts(mo, d, y) {
        if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
        const t = Date.UTC(y, mo - 1, d), x = new Date(t);
        return x.getUTCMonth() === mo - 1 && x.getUTCDate() === d ? Math.round(t / 864e5) : null;
    }
    const usDay = (s) => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || '')); return m ? dayParts(+m[1], +m[2], +m[3]) : null; };
    const isoDay = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? dayParts(+m[2], +m[3], +m[1]) : null; };
    const iso = (day) => new Date(day * 864e5).toISOString().slice(0, 10);
    const us = (day) => { const x = new Date(day * 864e5); return `${String(x.getUTCMonth() + 1).padStart(2, '0')}/${String(x.getUTCDate()).padStart(2, '0')}/${x.getUTCFullYear()}`; };
    function plusYears(day, years) {
        const x = new Date(day * 864e5), y = x.getUTCFullYear() + years, mo = x.getUTCMonth() + 1;
        return dayParts(mo, x.getUTCDate(), y) ?? dayParts(mo, x.getUTCDate() - 1, y);
    }
    const firmToday = () => isoDay(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));

    /* ---------- the Statute of Limitations from the case ---------- */
    // { day, note, ruleDay }: the SOL the calendar should have
    function expectedSol(c) {
        const dol = c.dol, file = c.sol;
        if (dol == null) return file == null ? null : { day: file, note: 'From the SOL on the file (no date of loss to check it against).' };
        const minor = c.dob != null && plusYears(c.dob, 18) > dol;
        const rule = minor ? plusYears(c.dob, 20) : plusYears(dol, 2);
        const why = minor ? `the client was a minor on the DOL: tolled to 18, then 2 years (${us(rule)})` : `DOL ${us(dol)} + 2 years (O.C.G.A. § 9-3-33)`;
        if (file == null) return { day: rule, ruleDay: rule, note: `No SOL on the file: ${why}.` };
        if (file === rule) return { day: rule, ruleDay: rule, note: `The file's SOL matches the rule: ${why}.` };
        for (let y = 1; y <= 6; y++) if (plusYears(dol, y) === file && !minor) return { day: file, ruleDay: rule, note: `The file's SOL is ${y} years from the DOL (that state's rule).` };
        return { day: rule, ruleDay: rule, fileDay: file, note: `⚠ The file's SOL box says ${us(file)}, but ${why}. Fix the file too.` };
    }

    /* ---------- what should be on the calendar ---------- */
    const KIND = {
        sol: { re: /\bSOL\b|statute/i, types: ['Deadline'] },
        cutoff: { re: /discovery|cut-?off/i, types: ['Deadline'] },
        trial: { re: /trial/i, types: ['Trial', 'Deadline', 'Court Hearing'] },
        depo: { re: /depo/i, types: ['Deposition', 'Deadline'] },
        rogs: { re: /interrog|\brogs?\b/i, types: ['Deadline'] },
        rfp: { re: /\bRFPs?\b|production/i, types: ['Deadline'] },
        rfa: { re: /\bRFAs?\b|admission/i, types: ['Deadline'] },
        hearing: { re: /hearing|motion/i, types: ['Court Hearing', 'Deadline'] }
    };
    function discoveryKind(type) {
        const t = String(type || '');
        if (/depo/i.test(t)) return 'depo';
        if (/interrog/i.test(t)) return 'rogs';
        if (/RFP|production/i.test(t)) return 'rfp';
        if (/RFA|admission/i.test(t)) return 'rfa';
        if (/hearing|motion/i.test(t)) return 'hearing';
        return null;
    }
    // c: { dol, sol, dob, cutoff, trial, discovery: [{ type, due, status }] } (day numbers)
    function expectedDeadlines(c, today) {
        const out = [], sol = expectedSol(c);
        if (sol) {
            out.push({ key: 'sol', kind: 'sol', name: 'Statute of Limitations (SOL)', day: sol.day, weight: 3, why: sol.note, solFix: sol.fileDay != null });
            out.push({ key: 'sol-rem', kind: 'sol', name: 'SOL reminders (30 and 7 days before)', reminders: [sol.day - 30, sol.day - 7], day: sol.day - 30, weight: 1,
                why: 'A reminder on the calendar 30 days and 7 days before the SOL, so it can\'t slip by.' });
        }
        if (c.cutoff != null) out.push({ key: 'cutoff', kind: 'cutoff', name: 'Discovery cut-off', day: c.cutoff, weight: 1, why: 'From the Litigation tab.' });
        if (c.trial != null) out.push({ key: 'trial', kind: 'trial', name: 'Trial date', day: c.trial, weight: 1, why: 'From the Litigation tab.' });
        (c.discovery || []).forEach((d, i) => {
            const kind = discoveryKind(d.type);
            if (!kind || d.due == null || /done|served|complete|received/i.test(d.status || '')) return;
            out.push({ key: 'disc-' + i, kind, name: `${d.type}${d.party ? ': ' + d.party : ''}`.slice(0, 120), day: d.due, weight: 1, why: 'Pending on the file\'s discovery list.' });
        });
        return out.map(x => Object.assign(x, { past: (x.reminders ? Math.max(...x.reminders) : x.day) < today }));
    }

    /* ---------- grading ---------- */
    // events: the trainee's own events (GET /api/calendar?list=mine); oc: { ref, label, attyCal }
    function linked(e, oc) {
        return !!((oc.ref && e.caseRef === oc.ref) || (oc.label && e.caseLabel && e.caseLabel.toLowerCase() === oc.label.toLowerCase()));
    }
    function lastName(label) { const p = String(label || '').trim().split(/\s+/); return p.length ? p[p.length - 1].toLowerCase() : ''; }
    function aboutCase(e, oc) {
        if (linked(e, oc)) return true;
        const ln = lastName(oc.label);
        return ln.length > 2 && (String(e.title || '') + ' ' + String(e.caseLabel || '')).toLowerCase().includes(ln);
    }
    const onAtty = (e, oc) => !oc.attyCal || e.calendar === oc.attyCal || (e.invite || []).includes(oc.attyCal);
    function gradeOne(item, events, oc) {
        const k = KIND[item.kind];
        const mine = events.filter(e => aboutCase(e, oc));
        if (item.reminders) {
            const hits = item.reminders.map(d => mine.find(e => k.re.test(e.title || '') && Math.abs(isoDay(e.date) - d) <= 3 && isoDay(e.date) < item.day + 30));
            const score = hits.reduce((a, h) => a + (h ? 2.5 : 0), 0);
            const fb = item.reminders.map((d, i) => hits[i] ? `✓ ${i ? '7' : '30'}-day reminder on ${us(isoDay(hits[i].date))}` : `✗ No ${i ? '7' : '30'}-day reminder (around ${us(d)})`).join(' · ');
            return { score: Math.round(score), feedback: fb, event: hits.find(Boolean) || null, fix: hits.every(Boolean) ? null : { date: iso(item.reminders[hits[0] ? 1 : 0]) } };
        }
        // the events this deadline could be: about this case, and named for it or on its day
        const cands = mine.filter(e => k.re.test(e.title || '') || (isoDay(e.date) === item.day && k.types.includes(e.type)));
        const exact = cands.filter(e => isoDay(e.date) === item.day);
        const pick = (list) => list.slice().sort((a, b) => rank(b) - rank(a))[0];
        const rank = (e) => (k.types.includes(e.type) ? 2 : 0) + (onAtty(e, oc) ? 1 : 0) + (linked(e, oc) ? 1 : 0);
        if (exact.length) {
            const e = pick(exact), notes = [`✓ On the calendar for ${us(item.day)}`];
            let s = 3;
            if (k.types.includes(e.type)) { s++; notes.push(`✓ as a ${e.type}`); } else notes.push(`✗ saved as "${e.type || 'Other'}": make it a ${k.types[0]}`);
            if (onAtty(e, oc)) { s++; if (oc.attyCal) notes.push('✓ on the attorney\'s calendar'); } else notes.push(`✗ not on the case attorney's calendar${oc.attyName ? ` (${oc.attyName})` : ''}`);
            if (!linked(e, oc)) { s--; notes.push('✗ not linked to the case'); }
            return { score: Math.max(0, s), feedback: notes.join(' · '), event: e, fix: s < 5 ? { id: e.id } : null };
        }
        if (cands.length) {
            const e = cands.slice().sort((a, b) => Math.abs(isoDay(a.date) - item.day) - Math.abs(isoDay(b.date) - item.day))[0];
            return { score: 1, feedback: `✗ Docketed on ${us(isoDay(e.date))}: the deadline is ${us(item.day)}`, event: e, fix: { id: e.id } };
        }
        return { score: 0, feedback: `✗ Not on the calendar: docket it for ${us(item.day)}`, event: null, fix: { date: iso(item.day) } };
    }
    function grade(caseDates, events, oc, today) {
        const items = expectedDeadlines(caseDates, today);
        const rows = items.filter(x => !x.past).map(x => Object.assign({}, x, gradeOne(x, events || [], oc)));
        const w = rows.reduce((a, r) => a + r.weight, 0);
        const avg = w ? rows.reduce((a, r) => a + r.weight * r.score, 0) / w : 0;
        const pct = w ? Math.round(avg / 5 * 100) : null;
        const verdict = pct == null ? '' : pct >= 90 ? 'Docketed correctly' : pct >= 70 ? 'Almost: fix the flagged dates' : pct >= 40 ? 'Part of it is docketed' : 'Not docketed yet';
        return { rows, past: items.filter(x => x.past), average: Math.round(avg * 10) / 10, pct, verdict };
    }

    /* ---------- the open case ---------- */
    const text = (id) => { const el = $id(id); return el ? (el.innerText || el.textContent || '').trim() : ''; };
    function openCase() {
        const mockId = typeof window.mockCurrentId === 'function' ? window.mockCurrentId() : null;
        const mock = mockId ? (window.MOCK_CASES || []).find(c => c.id === mockId) : null;
        const label = mock ? mock.client.name : (text('client-name-field').split('\n')[0] || '').trim();
        if (!label) return null;
        const idText = text('case-id-field');
        const ref = mock ? mock.id : /^LSH-\d{4}-/.test(idText) && !/-----/.test(idText) ? idText : '';
        const atty = $id('attorney-field') ? ($id('attorney-field').value || $id('attorney-field').innerText || '') : '';
        const dates = {
            dol: usDay(text('date-of-loss-field')), sol: usDay(text('sol-bar-field')) ?? usDay(text('sol-litigation-field')),
            dob: usDay(text('client-dob-field')) ?? usDay(text('head-dob-field')),
            cutoff: usDay(text('discovery-cutoff-field')), trial: usDay(text('trial-date-field')),
            discovery: mock && mock.lit && Array.isArray(mock.lit.discovery) ? mock.lit.discovery.map(d => ({ type: d.type, party: d.party, due: usDay(d.due), status: d.status })) : []
        };
        return { ref, label, attorney: (mock && mock.attorney) || atty, dates, repoId: typeof currentCaseId !== 'undefined' ? currentCaseId : null };
    }
    // The case attorney's calendar (the same rule as the Firm Calendar's: the calendar whose id is in the attorney's name)
    function attyCalendar(calendars, name) {
        const n = String(name || '').toLowerCase();
        return (calendars || []).find(c => c.id !== 'firm' && c.id !== 'attorney' && n.includes(c.id)) || null;
    }
    async function fetchAll() {
        const t = iso(firmToday());
        const [meta, mine] = await Promise.all([
            fetch(`/api/calendar?from=${t}&to=${t}`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
            fetch('/api/calendar?list=mine', { credentials: 'include' }).then(r => r.json()).catch(() => null)
        ]);
        if (!mine || !mine.success) throw new Error((mine && mine.error) || 'Could not read your calendar.');
        return { calendars: (meta && meta.calendars) || [], today: isoDay(meta && meta.today) ?? firmToday(), events: mine.events || [] };
    }
    async function check() {
        const oc = openCase();
        if (!oc) return { none: true };
        const data = await fetchAll();
        const ac = attyCalendar(data.calendars, oc.attorney);
        const who = { ref: oc.ref, label: oc.label, attyCal: ac ? ac.id : null, attyName: ac ? ac.name : '' };
        return Object.assign(grade(oc.dates, data.events, who, data.today), { oc, who, events: data.events });
    }

    /* ---------- the panel ---------- */
    let R = null, busy = false, sent = null;
    const scoreClass = (s) => s >= 5 ? 'ok' : s >= 3 ? 'mid' : 'bad';
    function panelHtml() {
        if (busy && !R) return '<div class="dk-empty">Checking the calendar against the case…</div>';
        if (!R) return '';
        if (R.error) return `<div class="dk-empty">⚠ ${esc(R.error)}</div>`;
        if (R.none) return '<div class="dk-empty">Open a case first: the check reads its date of loss, SOL and litigation dates.</div>';
        const head = `<div class="dk-score"><div class="dk-pct">${R.pct == null ? '—' : R.pct + '%'}</div><div><b>${esc(R.verdict || 'Nothing to docket')}</b>
            <span>${esc(R.oc.label)}${R.oc.ref ? ' · ' + esc(window.lshShownRef ? window.lshShownRef(R.oc.ref) : R.oc.ref) : ''}${R.who.attyName ? ' · ' + esc(R.who.attyName) : ''}</span></div></div>`;
        const rows = R.rows.map((r, i) => `<div class="dk-row ${scoreClass(r.score)}"><div class="dk-n">${r.score}<small>/5</small></div><div class="dk-b">
            <b>${esc(r.name)}</b><span class="dk-d">${r.reminders ? r.reminders.map(us).join(' · ') : us(r.day)}${r.weight > 1 ? ` · counts ×${r.weight}` : ''}</span>
            <div class="dk-f">${esc(r.feedback)}</div><div class="dk-w">${esc(r.why)}</div>
            ${r.fix ? `<button class="dk-fix" data-dk-fix="${i}">${r.fix.id ? '✎ Fix it' : '📅 Docket it'}</button>` : ''}</div></div>`).join('');
        const past = R.past.length ? `<div class="dk-w" style="margin-top:8px">Already passed, not graded: ${R.past.map(p => esc(p.name) + ' (' + us(p.day) + ')').join(', ')}</div>` : '';
        const send = R.rows.length ? `<button class="dk-go" data-dk="submit" ${sent === 'saving' ? 'disabled' : ''}>${sent === 'saving' ? 'Sending…' : '🎯 Submit grade'}</button>` : '';
        const status = sent && sent !== 'saving' ? `<div class="dk-sent ${sent.ok ? 'ok' : 'bad'}">${esc(sent.text)}</div>` : '';
        return head + (R.rows.length ? rows : '<div class="dk-empty">No upcoming deadlines on this case to docket.</div>') + past
            + `<div class="dk-actions"><button class="dk-btn" data-dk="recheck">↻ Check again</button>${send}</div>${status}`;
    }
    function paint() { const b = $id('dk-body'); if (b) b.innerHTML = panelHtml(); }
    async function run() {
        busy = true; sent = null; paint();
        try { R = await check(); } catch (e) { R = { error: e.message || 'Could not check the calendar.' }; }
        busy = false; paint();
        return R;
    }
    function openPanel() {
        let p = $id('dk-panel');
        if (!p) {
            p = document.createElement('div'); p.id = 'dk-panel'; p.className = 'no-print'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Docketing check');
            p.innerHTML = `<div class="dk-card"><div class="dk-head"><div><h3>📋 Docketing check</h3><span>The case's deadlines, checked against your calendar</span></div>
                <button class="dk-x" data-dk="close" aria-label="Close">✕</button></div><div id="dk-body"></div></div>`;
            p.addEventListener('click', onClick);
            document.body.appendChild(p);
        }
        p.hidden = false; R = null; run();
    }
    function onClick(ev) {
        const t = ev.target.closest('[data-dk],[data-dk-fix]'); if (!t) { if (ev.target.id === 'dk-panel') close(); return; }
        if (t.dataset.dk === 'close') return close();
        if (t.dataset.dk === 'recheck') return run();
        if (t.dataset.dk === 'submit') return submit();
        if (t.dataset.dkFix != null) {
            const r = R && R.rows[+t.dataset.dkFix]; if (!r || !r.fix) return;
            close();
            if (r.fix.id && typeof window.fcEdit === 'function') return window.fcEdit(r.fix.id);
            if (typeof window.fcNew === 'function') {
                const title = r.key === 'sol-rem' ? `SOL reminder: ${R.oc.label} (SOL ${us(r.reminders[1] + 7)})` : `${r.name}: ${R.oc.label}`;
                window.fcNew({ fromCase: true, prefill: { title, type: 'Deadline', date: r.fix.date, allDay: true } });
            }
        }
    }
    function close() { const p = $id('dk-panel'); if (p) p.hidden = true; }
    document.addEventListener('keydown', (e) => { const p = $id('dk-panel'); if (e.key === 'Escape' && p && !p.hidden) close(); });

    /* ---------- 🎯 Submit grade: like a graded Calendar Sim call ---------- */
    async function submit() {
        if (!R || !R.rows || !R.rows.length) return;
        sent = 'saving'; paint();
        const rows = R.rows.map(r => ({ metric: r.name.slice(0, 120), weight: r.weight, score: r.score, feedback: r.feedback.slice(0, 400) }));
        const ref = R.oc.ref || R.oc.label;
        const detail = { pack: true, id: 'docket_' + String(ref).replace(/[^A-Za-z0-9-]/g, '').slice(0, 40), program: 'FT', line: 'Calendar Management Mock Calls',
            title: `Docketing check · ${R.oc.label}`.slice(0, 160), caller: 'Firm Calendar', role: 'Docketing check', mode: 'graded', voice: 'none', secs: 0,
            score: R.pct, verdict: R.verdict, course: { program: 'FT', lesson: 5 }, docket: true,
            scorecard: { title: 'DOCKETING CHECK', outOf: 5, rows, average: R.average, pct: R.pct },
            calendar: R.rows.filter(r => r.event).slice(0, 8).map(r => ({ title: String(r.event.title || '').slice(0, 160), type: r.event.type, calendar: r.event.calendar, date: r.event.date,
                start: r.event.start, end: r.event.end, allDay: !!r.event.allDay, caseLabel: r.event.caseLabel || '', location: '', notes: '', invite: [] })),
            improve: R.rows.filter(r => r.score < 5).map(r => `${r.name}: ${r.feedback}`).slice(0, 8), strengths: R.rows.filter(r => r.score >= 5).map(r => `${r.name} docketed correctly`).slice(0, 8),
            transcript: R.rows.map(r => `${r.name} (${r.reminders ? r.reminders.map(us).join(', ') : us(r.day)}): ${r.score}/5. ${r.feedback}`).join('\n') };
        try {
            const res = await fetch('/api/drill-results', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: 'graded', program: 'FT', calls: 1, details: [detail], score: R.pct, findPct: 0, authPct: 0, actionPct: 0, avgSeconds: 0 }) });
            const data = await res.json().catch(() => ({}));
            if (!data || !data.success) throw new Error((data && data.error) || 'Could not save the grade.');
            const c = data.course;
            sent = { ok: true, text: c && c.counted ? `✓ Saved, and counted in your Standard Training (lesson 5, Calendar Management): ${R.pct}%.`
                : c && c.reason === 'no-name' ? '✓ Saved here. It didn\'t count on the Portal: your account has no first and last name.'
                : `✓ Saved with your Call Simulator results (${R.pct}%).${c && c.counted === false ? ' The Portal didn\'t take it yet.' : ''}` };
        } catch (e) { sent = { ok: false, text: '⚠ ' + (e.message || 'Could not reach the server.') }; }
        paint();
    }

    /* ---------- the button on the Firm Calendar, and a check as a deadline is saved ---------- */
    function addButton() {
        const head = $id('fc-head'); if (!head || head.querySelector('[data-dk="open"]')) return;
        if (head.querySelector('[data-fc="mode"]') && /Firm Calendar/.test(head.querySelector('[data-fc="mode"]').textContent)) return;   // (the Attorney's Calendar)
        const b = document.createElement('button');
        b.className = 'fc-btn dk-open'; b.dataset.dk = 'open'; b.type = 'button'; b.textContent = '📋 Docketing check';
        b.title = 'Check the open case\'s deadlines (SOL, reminders, discovery, trial) against your calendar, and submit the grade';
        b.addEventListener('click', openPanel);
        const right = head.querySelector(':scope > div[style*="margin-left:auto"]');
        if (right) right.insertBefore(b, right.firstChild); else head.appendChild(b);
    }
    new MutationObserver(addButton).observe(document.documentElement, { childList: true, subtree: true });
    const baseSave = window.fcSave;
    if (typeof baseSave === 'function') {
        window.fcSave = async function () {
            const title = $id('fcf-title') ? $id('fcf-title').value : '';
            const r = await baseSave.apply(this, arguments);
            if (/\bSOL\b|statute|deadline|cut-?off|trial|discovery/i.test(title)) {
                try {
                    const g = await check();
                    if (g && g.rows) {
                        const sol = g.rows.find(x => x.key === 'sol' && KIND.sol.re.test(title)) || g.rows.find(x => x.event && x.event.title === title);
                        if (sol) toast(`📋 ${sol.name}: ${sol.score}/5. ${sol.feedback}`, sol.score >= 5 ? 'success' : 'error', 7000);
                    }
                } catch (e) { /* the check is extra: never get in the way of a save */ }
            }
            return r;
        };
    }

    /* ---------- the look: the Simulators' navy and gold ---------- */
    const css = document.createElement('style');
    css.textContent = `
    #fc-root .fc-box{border-left:0!important;border:2px solid #c9973f!important;border-radius:14px!important;box-shadow:0 14px 30px -18px rgba(15,33,72,.6)!important}
    #fc-root .fc-head{background:#1E2340;border-bottom:3px solid #c9973f!important}
    #fc-root .fc-head h2{color:#fff!important;font-weight:900}
    #fc-root .fc-head .fc-sub{color:#f5c451!important;font-weight:700}
    #fc-root .fc-head .fc-title{color:#fff!important}
    #fc-root .fc-head .fc-live{color:#86efac}
    #fc-root .fc-head .fc-btn{background:rgba(255,255,255,.08);color:#fff;border-color:rgba(245,196,81,.55)}
    #fc-root .fc-head .fc-btn:hover{border-color:#f5c451;color:#f5c451}
    #fc-root .fc-head .fc-btn.on{background:#f5c451;color:#1E2340;border-color:#f5c451}
    #fc-root .fc-head .fc-btn.primary,#fc-root .fc-btn.primary{background:linear-gradient(180deg,#fde7b0 0%,#f5c451 50%,#e0a43a 100%);color:#1E2340;border-color:#e0a43a}
    #fc-root .fc-head .fc-btn.dk-open{background:#fff;color:#1E2340;border-color:#f5c451;font-weight:900}
    #fc-root .fc-rail{background:#f6f8fc}
    #fc-root .fc-rail h4{display:inline-block;background:#1E2340;color:#fff;border-radius:999px;padding:3px 10px;font-weight:900}
    #fc-root .wk-h{color:#1E2340;font-weight:900}
    #fc-root .wk-h.today,#fc-root .ag-d{color:#b7791f}
    #dk-panel{position:fixed;inset:0;z-index:9000;background:rgba(15,23,42,.45);display:flex;justify-content:flex-end}
    #dk-panel[hidden]{display:none}
    #dk-panel .dk-card{width:min(560px,100%);height:100%;background:#f6f8fc;overflow-y:auto;box-shadow:-12px 0 30px rgba(0,0,0,.25);border-left:3px solid #c9973f}
    #dk-panel .dk-head{position:sticky;top:0;z-index:1;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;background:#1E2340;color:#fff;padding:16px 18px;border-bottom:3px solid #c9973f}
    #dk-panel .dk-head h3{margin:0;font-size:19px;font-weight:900}
    #dk-panel .dk-head span{font-size:12px;color:#f5c451;font-weight:700}
    #dk-panel .dk-x{background:none;border:2px solid #f5c451;color:#fff;border-radius:999px;width:32px;height:32px;font-weight:900;cursor:pointer}
    #dk-body{padding:14px 16px 24px}
    #dk-panel .dk-score{display:flex;gap:14px;align-items:center;background:#fff;border:2px solid #c9973f;border-radius:12px;padding:12px 14px;margin-bottom:12px}
    #dk-panel .dk-pct{font-size:30px;font-weight:900;color:#1E2340;min-width:84px;text-align:center}
    #dk-panel .dk-score b{display:block;font-size:15px;color:#1E2340}
    #dk-panel .dk-score span{font-size:12px;color:#475569;font-weight:700}
    #dk-panel .dk-row{display:flex;gap:12px;background:#fff;border-radius:12px;padding:10px 12px;margin-bottom:8px;border-left:6px solid #cbd5e1;box-shadow:0 2px 8px -6px rgba(15,33,72,.5)}
    #dk-panel .dk-row.ok{border-left-color:#16a34a}#dk-panel .dk-row.mid{border-left-color:#f59e0b}#dk-panel .dk-row.bad{border-left-color:#dc2626}
    #dk-panel .dk-n{font-size:22px;font-weight:900;color:#1E2340;min-width:44px}
    #dk-panel .dk-n small{font-size:12px;color:#64748b}
    #dk-panel .dk-b{flex:1;min-width:0}
    #dk-panel .dk-b b{font-size:14px;color:#0f172a}
    #dk-panel .dk-d{display:inline-block;margin-left:8px;font-size:12px;font-weight:900;color:#c81e1e}
    #dk-panel .dk-f{font-size:12.5px;color:#1e293b;font-weight:700;margin-top:4px}
    #dk-panel .dk-w{font-size:11.5px;color:#64748b;font-weight:600;margin-top:3px}
    #dk-panel .dk-fix{margin-top:6px;border:1px solid #c9973f;background:#fff7e0;color:#1E2340;border-radius:999px;padding:3px 11px;font-size:11.5px;font-weight:900;cursor:pointer}
    #dk-panel .dk-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}
    #dk-panel .dk-btn,#dk-panel .dk-go{border-radius:999px;padding:8px 16px;font-weight:900;font-size:13px;cursor:pointer;border:2px solid #1E2340;background:#fff;color:#1E2340}
    #dk-panel .dk-go{background:linear-gradient(180deg,#fde7b0 0%,#f5c451 50%,#e0a43a 100%);border-color:#e0a43a}
    #dk-panel .dk-go[disabled]{opacity:.6;cursor:default}
    #dk-panel .dk-sent{margin-top:10px;border-radius:10px;padding:9px 12px;font-size:12.5px;font-weight:800}
    #dk-panel .dk-sent.ok{background:#ecfdf5;color:#065f46}#dk-panel .dk-sent.bad{background:#fef2f2;color:#991b1b}
    #dk-panel .dk-empty{background:#fff;border-radius:12px;padding:18px;text-align:center;color:#475569;font-weight:700}`;
    document.head.appendChild(css);

    window.lshDocket = { expectedSol, expectedDeadlines, grade, open: openPanel, check, plusYears, usDay };
})();
