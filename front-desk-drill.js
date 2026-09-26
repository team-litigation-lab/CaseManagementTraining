/* =========================================================
   LSH CMS — FRONT DESK DRILL
   ---------------------------------------------------------
   Measures a receptionist's (or any VA's) front-desk ability on the
   Training Library cases. Each drill is a run of randomly picked
   incoming calls (DRILL_CALLS in mock-cases.js). For every call the
   trainee must:
     1. ask the caller for identifiers (name, DOB, address, SSN last 4,
        callback number, relationship) — the caller answers from a
        script, and some answers are wrong on purpose;
     2. FIND the caller's case with the CMS search (by name, phone,
        claim #, plate…), open it and read the file — or decide the
        caller isn't in the system;
     3. AUTHENTICATE: client, authorized person on file, not verified,
        not authorized, business caller, or a new caller;
     4. HANDLE the call (one of four actions).
   Scoring per call (100): find 30 · authenticate 40 (decision 30 +
   asked the right identifiers 10) · handle 30. Time per call is
   recorded. Results are saved to /api/drill-results; trainees see
   their history and Admins see the whole team.
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const session = () => (typeof getSession === 'function' ? getSession() : null);
    const isAdmin = () => { const s = session(); return !!(s && s.userType === 'Admin'); };

    const AUTH = [
        ['client', 'Verified: the client (or a minor client\'s guardian on file)'],
        ['authorized', 'Verified: an authorized person on file (authorization, POA, estate administrator)'],
        ['failed', 'Not verified: the identifiers don\'t match the file (or not enough of them)'],
        ['unauthorized', 'Not authorized: this person isn\'t on the file (relative, friend, media…)'],
        ['business', 'Business caller (insurer, provider, counsel, vendor): no identity check, route only'],
        ['newcaller', 'Not in the system: a potential new client']
    ];
    const ASKS = [
        ['name', 'Full name'], ['dob', 'Date of birth'], ['address', 'Address'], ['ssn4', 'Last 4 of SSN'],
        ['callback', 'Callback number'], ['relationship', 'Relationship to the client']
    ];
    const PERSONAL = ['client', 'authorized', 'failed'];

    let D = null;         // the running drill
    let timer = null;
    let screen = 'home';  // home | call | summary
    let history = null;   // results from the server

    /* ---------- styles ---------- */
    const css = document.createElement('style');
    css.textContent = `
    .fdd-btn{width:100%;border:1px solid #10b981;color:#6ee7b7;background:rgba(16,185,129,.08);padding:9px 0;border-radius:8px;font-size:10.5px;font-weight:800;text-transform:uppercase;cursor:pointer;margin-bottom:8px}
    .fdd-btn:hover{background:#10b981;color:#fff}
    #fdd-panel{position:fixed;top:0;right:0;bottom:0;width:min(500px,100vw);background:#f8fafc;z-index:2975;box-shadow:-10px 0 30px rgba(0,0,0,.25);transform:translateX(105%);transition:transform .2s ease;display:flex;flex-direction:column;font-size:13px;color:#0f172a}
    #fdd-panel.open{transform:none}
    .fdd-h{background:#0f2148;color:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px}
    .fdd-h b{font-size:14px;flex:1}.fdd-h .t{font-family:'IBM Plex Mono',monospace;color:#fdba74;font-weight:800}
    .fdd-h button{background:none;border:1px solid #334155;color:#fff;border-radius:6px;padding:4px 9px;cursor:pointer;font-size:12px}
    .fdd-b{padding:14px 16px;overflow-y:auto;flex:1}
    .fdd-sec{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:11px 13px;margin-bottom:10px}
    .fdd-sec h4{margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
    .fdd-caller{background:#0f2148;color:#fff;border-radius:12px 12px 12px 2px;padding:10px 13px;font-size:13.5px;line-height:1.45;margin-bottom:10px}
    .fdd-asks{display:flex;flex-wrap:wrap;gap:6px}
    .fdd-asks button,.fdd-chip{font-size:11px;font-weight:700;border:1px solid #cbd5e1;background:#fff;color:#0f2148;border-radius:999px;padding:5px 10px;cursor:pointer}
    .fdd-asks button.on{background:#e2e8f0;color:#64748b;cursor:default}
    .fdd-tr{margin-top:8px;font-size:12.3px}
    .fdd-tr div{padding:4px 0;border-top:1px dashed #e2e8f0}.fdd-tr .q{color:#64748b}.fdd-tr .a{color:#0f172a;font-weight:600}
    .fdd-search{width:100%;padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:12.5px}
    .fdd-res{margin-top:6px;max-height:190px;overflow-y:auto}
    .fdd-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid #e2e8f0;border-radius:7px;margin-top:5px;cursor:pointer;background:#fff}
    .fdd-row:hover{border-color:#f97316}.fdd-row.sel{border-color:#10b981;background:#ecfdf5}
    .fdd-row .id{font-family:'IBM Plex Mono',monospace;font-weight:800;color:#f97316;font-size:11px;width:48px;flex-shrink:0}
    .fdd-row .nm{font-weight:700;font-size:12.3px;flex:1;min-width:0}.fdd-row .mt{font-size:10.5px;color:#64748b}
    .fdd-opt{display:flex;gap:8px;align-items:flex-start;padding:7px 9px;border:1px solid #e2e8f0;border-radius:8px;margin-top:5px;cursor:pointer;background:#fff;font-size:12.3px;line-height:1.4}
    .fdd-opt input{margin-top:2px}
    #fdd-panel label.fdd-opt,#fdd-panel label.fdd-opt span{text-transform:none !important;letter-spacing:normal !important;color:#0f172a !important;font-size:12.3px !important;font-weight:500 !important;margin:0}
    #fdd-panel label.fdd-opt{margin-top:5px !important}
    .fdd-opt.ok{border-color:#10b981;background:#ecfdf5}.fdd-opt.bad{border-color:#ef4444;background:#fef2f2}
    .fdd-go{width:100%;background:#0f2148;color:#fff;border:none;border-radius:8px;padding:11px;font-weight:800;font-size:12px;text-transform:uppercase;cursor:pointer;margin-top:4px}
    .fdd-go.alt{background:#10b981}.fdd-go:disabled{opacity:.45;cursor:not-allowed}
    .fdd-fb{border-radius:10px;padding:10px 12px;margin-bottom:10px;font-size:12.5px;line-height:1.5}
    .fdd-fb.ok{background:#ecfdf5;border:1px solid #10b981}.fdd-fb.mid{background:#fffbeb;border:1px solid #f59e0b}.fdd-fb.bad{background:#fef2f2;border:1px solid #ef4444}
    .fdd-score{font-size:30px;font-weight:900;color:#0f2148;font-family:'IBM Plex Mono',monospace}
    .fdd-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:8px 0}
    .fdd-grid div{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:7px 8px;text-align:center}
    .fdd-grid span{display:block;font-size:9.5px;font-weight:800;text-transform:uppercase;color:#64748b}.fdd-grid b{font-size:16px;color:#0f2148}
    .fdd-tbl{width:100%;border-collapse:collapse;font-size:11.5px}
    .fdd-tbl th,.fdd-tbl td{border-bottom:1px solid #e2e8f0;padding:5px 4px;text-align:left;vertical-align:top}
    .fdd-tbl th{color:#64748b;font-size:10px;text-transform:uppercase}
    #fdd-mini{position:fixed;right:16px;bottom:16px;z-index:2976;background:#10b981;color:#fff;border:none;border-radius:999px;padding:11px 16px;font-weight:800;font-size:12px;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer;display:none}
    body.fdd-on #mock-banner button[onclick="openCallsPanel()"]{display:none}
    `;
    document.head.appendChild(css);

    function buildUI() {
        const lib = $id('lib-open-btn');
        if (lib && !$id('fdd-open-btn')) {
            lib.insertAdjacentHTML('afterend', `<button id="fdd-open-btn" class="fdd-btn" onclick="openFrontDeskDrill()">📞 Front Desk Drill · scored</button>`);
        }
        if (!$id('fdd-panel')) {
            document.body.insertAdjacentHTML('beforeend', `<div id="fdd-panel" class="no-print" aria-hidden="true"></div>
                <button id="fdd-mini" class="no-print" onclick="fddRestore()">📞 Back to the call</button>`);
        }
    }

    const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
    const fmtSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const caseOf = (id) => (window.MOCK_CASES || []).find(c => c.id === id);

    /* ---------- open / close ---------- */
    window.openFrontDeskDrill = function () {
        if (typeof hasAuthorizedAccess === 'function' && !hasAuthorizedAccess()) return;
        buildUI();
        if (typeof closeCallsPanel === 'function') closeCallsPanel();
        if (typeof closeTrainingLibrary === 'function') closeTrainingLibrary();
        $id('fdd-panel').classList.add('open'); $id('fdd-panel').setAttribute('aria-hidden', 'false');
        $id('fdd-mini').style.display = 'none';
        if (!D) { screen = 'home'; loadHistory(); }
        paint();
    };
    window.fddClose = function () {
        if (D && screen === 'call' && !confirm('Leave the drill? This run won\'t be scored.')) return;
        stopTimer(); D = null; screen = 'home';
        document.body.classList.remove('fdd-on');
        $id('fdd-panel').classList.remove('open'); $id('fdd-panel').setAttribute('aria-hidden', 'true');
        $id('fdd-mini').style.display = 'none';
    };
    // Hide the panel to read the case behind it; the floating button brings it back.
    window.fddMinimize = function () { $id('fdd-panel').classList.remove('open'); $id('fdd-mini').style.display = 'block'; };
    window.fddRestore = function () { $id('fdd-panel').classList.add('open'); $id('fdd-mini').style.display = 'none'; };

    /* ---------- drill flow ---------- */
    window.fddStart = function () {
        const unsaved = typeof hasCaseContent === 'function' && hasCaseContent() && typeof currentCaseId !== 'undefined' && currentCaseId === null;
        if (unsaved && !confirm('The drill opens case files in the editor, which clears the unsaved case that\'s there now. Start anyway?')) return;
        const n = parseInt(($id('fdd-len') || {}).value, 10) || 6;
        const pool = shuffle(window.DRILL_CALLS || []).slice(0, n);
        D = {
            program: (window.lshProgram && window.lshProgram()) || '',
            calls: pool.map(c => ({ call: c, order: shuffle(c.actions.map((_, i) => i)) })),
            i: 0, results: []
        };
        document.body.classList.add('fdd-on');
        if (typeof closeCallsPanel === 'function') closeCallsPanel();
        startCall();
    };
    function startCall() {
        D.cur = { asked: [], selected: null, auth: null, action: null, q: '', submitted: false, t0: Date.now() };
        screen = 'call'; startTimer(); paint();
    }
    function startTimer() {
        stopTimer();
        timer = setInterval(() => { const el = $id('fdd-timer'); if (el && D && D.cur && !D.cur.submitted) el.textContent = fmtSec(Math.round((Date.now() - D.cur.t0) / 1000)); }, 1000);
    }
    function stopTimer() { if (timer) clearInterval(timer); timer = null; }

    window.fddAsk = function (k) {
        const cur = D.cur; if (cur.submitted || cur.asked.includes(k)) return;
        cur.asked.push(k); paint();
    };
    window.fddSearch = function (v) { D.cur.q = v; paintResults(); };
    window.fddPick = function (id) {
        const cur = D.cur; if (cur.submitted) return;
        cur.selected = id;
        if (id !== 'none' && typeof openMockCase === 'function') openMockCase(id, { silent: true });
        paint();
    };
    window.fddSetAuth = function (v) { if (!D.cur.submitted) { D.cur.auth = v; paintButtons(); } };
    window.fddSetAction = function (v) { if (!D.cur.submitted) { D.cur.action = Number(v); paintButtons(); } };

    function scoreCall(entry, cur) {
        const c = entry.call;
        const find = cur.selected === (c.mock || 'none');
        const authOk = cur.auth === c.auth;
        let idsOk;
        if (PERSONAL.includes(c.auth)) idsOk = cur.asked.includes('name') && cur.asked.includes('dob') && (cur.asked.includes('address') || cur.asked.includes('ssn4'));
        else if (c.auth === 'unauthorized') idsOk = cur.asked.includes('name') && cur.asked.includes('relationship');
        else idsOk = cur.asked.includes('name') && cur.asked.includes('callback');
        const actOk = cur.action === c.answer;
        const secs = Math.round((Date.now() - cur.t0) / 1000);
        return { id: c.id, mock: c.mock, find, authOk, idsOk, actOk, secs,
            score: (find ? 30 : 0) + (authOk ? 30 : 0) + (idsOk ? 10 : 0) + (actOk ? 30 : 0),
            picked: { selected: cur.selected, auth: cur.auth, action: c.actions[cur.action], asked: cur.asked.slice() } };
    }
    window.fddSubmit = function () {
        const cur = D.cur;
        if (!cur.selected || !cur.auth || cur.action == null) return;
        cur.submitted = true; stopTimer();
        D.results.push(scoreCall(D.calls[D.i], cur));
        paint();
        const b = $id('fdd-panel').querySelector('.fdd-b'); if (b) b.scrollTop = 0;
    };
    window.fddNext = function () {
        D.i++;
        if (D.i < D.calls.length) { startCall(); const b = $id('fdd-panel').querySelector('.fdd-b'); if (b) b.scrollTop = 0; return; }
        finish();
    };
    function summary(results) {
        const n = results.length || 1;
        const avg = (f) => Math.round(results.reduce((a, r) => a + f(r), 0) / n);
        return {
            score: avg(r => r.score),
            findPct: avg(r => r.find ? 100 : 0),
            authPct: avg(r => ((r.authOk ? 30 : 0) + (r.idsOk ? 10 : 0)) / 40 * 100),
            actionPct: avg(r => r.actOk ? 100 : 0),
            avgSeconds: avg(r => r.secs)
        };
    }
    async function finish() {
        screen = 'summary';
        D.summary = summary(D.results);
        D.saved = 'saving';
        paint();
        try {
            const res = await fetch('/api/drill-results', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify(Object.assign({ program: D.program, calls: D.results.length, details: D.results }, D.summary))
            });
            const data = await res.json().catch(() => ({}));
            D.saved = data && data.success ? 'saved' : 'failed';
        } catch (e) { D.saved = 'failed'; }
        paint(); loadHistory();
    }
    async function loadHistory() {
        try {
            const res = await fetch('/api/drill-results', { credentials: 'include' });
            const data = await res.json();
            history = data && data.success ? data : { results: [], isAdmin: false };
        } catch (e) { history = { results: [], isAdmin: false, error: true }; }
        if (screen === 'home' || screen === 'summary') paint();
    }
    window.fddHome = function () { stopTimer(); D = null; screen = 'home'; document.body.classList.remove('fdd-on'); loadHistory(); paint(); };

    /* ---------- rendering ---------- */
    function paint() {
        const p = $id('fdd-panel'); if (!p) return;
        const title = screen === 'call' ? `Call ${D.i + 1} of ${D.calls.length}` : screen === 'summary' ? 'Drill complete' : 'Front Desk Drill';
        p.innerHTML = `<div class="fdd-h"><b>📞 ${title}</b>${screen === 'call' ? `<span class="t" id="fdd-timer">${fmtSec(Math.round((Date.now() - D.cur.t0) / 1000))}</span><button onclick="fddMinimize()" title="Hide to read the case">▭ Case</button>` : ''}<button onclick="fddClose()">✕</button></div>
            <div class="fdd-b">${screen === 'call' ? callHTML() : screen === 'summary' ? summaryHTML() : homeHTML()}</div>`;
        if (screen === 'call') paintResults();
    }
    function paintButtons() {
        const cur = D && D.cur; const b = $id('fdd-submit');
        if (b) b.disabled = !(cur && cur.selected && cur.auth && cur.action != null);
    }

    function homeHTML() {
        const total = (window.DRILL_CALLS || []).length;
        return `<div class="fdd-sec"><h4>How it works</h4>
            <p style="margin:0 0 6px;line-height:1.5">A caller is on the line. For each call:</p>
            <ol style="margin:0 0 6px 18px;padding:0;line-height:1.55">
              <li><b>Ask</b> the caller for what you need (name, date of birth, address, SSN last 4, callback, relationship).</li>
              <li><b>Find</b> their case with the search (name, phone, claim #, plate…), open it and read the file. Some callers aren't in the system.</li>
              <li><b>Authenticate</b>: compare what they told you with the file. Some callers get it wrong on purpose.</li>
              <li><b>Handle</b> the call.</li></ol>
            <p style="margin:0;color:#64748b;font-size:12px">Scored per call: find 30 · authenticate 40 (decision 30 + asking the right identifiers 10) · handle 30. Time per call is recorded. ${total} calls in the pool, across ${(window.MOCK_CASES || []).length} case files. The rules are in 📚 Training Library → ☎ Firm directory.</p></div>
            <div class="fdd-sec"><h4>Start a drill</h4>
            <div style="display:flex;gap:8px;align-items:center"><select id="fdd-len" style="padding:8px;border:1px solid #cbd5e1;border-radius:7px;font-size:12.5px">
                <option value="5">5 calls (~10 min)</option><option value="8" selected>8 calls (~15 min)</option><option value="12">12 calls (~25 min)</option><option value="${total}">All ${total} calls</option></select>
            <button class="fdd-go alt" style="margin:0;flex:1" onclick="fddStart()">▶ Take the first call</button></div></div>
            ${historyHTML()}`;
    }

    function historyHTML() {
        if (!history) return `<p style="color:#64748b;font-size:12px">Loading results…</p>`;
        const rows = history.results || [];
        if (history.isAdmin) {
            const by = {};
            rows.forEach(r => { (by[r.username] = by[r.username] || []).push(r); });
            const team = Object.entries(by).map(([u, rs]) => {
                const n = rs.length, avg = (k) => Math.round(rs.reduce((a, r) => a + (r[k] || 0), 0) / n);
                return { u, name: rs[0].full_name || u, batch: rs[0].batch_id || '', n, score: avg('score'), best: Math.max(...rs.map(r => r.score)), find: avg('find_pct'), auth: avg('auth_pct'), act: avg('action_pct'), secs: avg('avg_seconds'), last: rs[0].created_at };
            }).sort((a, b) => b.score - a.score);
            return `<div class="fdd-sec"><h4>Team results (${rows.length} drills)</h4>${team.length ? `<table class="fdd-tbl"><thead><tr><th>Trainee</th><th>Drills</th><th>Avg</th><th>Find</th><th>Auth</th><th>Handle</th><th>Sec/call</th></tr></thead><tbody>
                ${team.map(t => `<tr><td><b>${esc(t.name)}</b><br><span style="color:#64748b">${esc(t.batch)}</span></td><td>${t.n}</td><td><b>${t.score}%</b><br><span style="color:#64748b">best ${t.best}%</span></td><td>${t.find}%</td><td>${t.auth}%</td><td>${t.act}%</td><td>${t.secs}</td></tr>`).join('')}</tbody></table>` : '<p style="color:#64748b;font-size:12px;margin:0">No drills completed yet.</p>'}</div>`;
        }
        return `<div class="fdd-sec"><h4>My results</h4>${rows.length ? `<table class="fdd-tbl"><thead><tr><th>Date</th><th>Calls</th><th>Score</th><th>Find</th><th>Auth</th><th>Handle</th><th>Sec/call</th></tr></thead><tbody>
            ${rows.slice(0, 15).map(r => `<tr><td>${esc(String(r.created_at || '').slice(0, 16))}</td><td>${r.calls}</td><td><b>${r.score}%</b></td><td>${r.find_pct}%</td><td>${r.auth_pct}%</td><td>${r.action_pct}%</td><td>${r.avg_seconds}</td></tr>`).join('')}</tbody></table>` : `<p style="color:#64748b;font-size:12px;margin:0">${history.error ? 'Couldn\'t load results.' : 'No drills yet. Your scores will appear here and on your trainer\'s team view.'}</p>`}</div>`;
    }

    function answerFor(c, k) {
        const v = c.gives[k];
        if (v == null) return c.auth === 'business' ? 'Caller: "I\'m calling for the company; I don\'t have that."' : 'Caller: "I don\'t know / I\'d rather not say."';
        return `Caller: "${v}"`;
    }

    function callHTML() {
        const entry = D.calls[D.i], c = entry.call, cur = D.cur, done = cur.submitted;
        const r = done ? D.results[D.results.length - 1] : null;
        const fb = done ? feedbackHTML(entry, r) : '';
        return `${fb}
        <div class="fdd-caller">📞 ${esc(c.opening)}</div>
        <div class="fdd-sec"><h4>1 · Ask the caller</h4><div class="fdd-asks">${ASKS.map(([k, l]) => `<button class="${cur.asked.includes(k) ? 'on' : ''}" onclick="fddAsk('${k}')">${l}</button>`).join('')}</div>
            <div class="fdd-tr">${cur.asked.map(k => `<div><span class="q">You: ${esc((ASKS.find(a => a[0] === k) || [])[1])}?</span><br><span class="a">${esc(answerFor(c, k))}</span></div>`).join('')}</div></div>
        <div class="fdd-sec"><h4>2 · Find the case</h4>
            <input class="fdd-search" placeholder="Search name, phone, DOB, claim #, plate, case ID…" value="${esc(cur.q)}" oninput="fddSearch(this.value)" ${done ? 'disabled' : ''}>
            <div class="fdd-res" id="fdd-res"></div>
            <button class="fdd-chip" style="margin-top:6px;${cur.selected === 'none' ? 'background:#ecfdf5;border-color:#10b981' : ''}" onclick="fddPick('none')" ${done ? 'disabled' : ''}>No matching case on file</button>
            ${cur.selected && cur.selected !== 'none' ? `<p style="margin:6px 0 0;font-size:11.5px;color:#475569">Opened <b>${esc(cur.selected)}</b> in the editor (view only). Use <b>▭ Case</b> above to hide this panel and read the file.</p>` : ''}</div>
        <div class="fdd-sec"><h4>3 · Authenticate the caller</h4>${AUTH.map(([k, l]) => `<label class="fdd-opt ${done ? (k === c.auth ? 'ok' : (k === cur.auth ? 'bad' : '')) : ''}"><input type="radio" name="fdd-auth" value="${k}" ${cur.auth === k ? 'checked' : ''} ${done ? 'disabled' : ''} onchange="fddSetAuth(this.value)"><span>${esc(l)}</span></label>`).join('')}</div>
        <div class="fdd-sec"><h4>4 · Handle the call</h4>${entry.order.map(i => `<label class="fdd-opt ${done ? (i === c.answer ? 'ok' : (i === cur.action ? 'bad' : '')) : ''}"><input type="radio" name="fdd-act" value="${i}" ${cur.action === i ? 'checked' : ''} ${done ? 'disabled' : ''} onchange="fddSetAction(this.value)"><span>${esc(c.actions[i])}</span></label>`).join('')}</div>
        ${done ? `<button class="fdd-go alt" onclick="fddNext()">${D.i + 1 < D.calls.length ? 'Next call →' : 'See my results →'}</button>`
               : `<button class="fdd-go" id="fdd-submit" onclick="fddSubmit()" ${cur.selected && cur.auth && cur.action != null ? '' : 'disabled'}>End the call and score it</button>`}`;
    }

    function paintResults() {
        const box = $id('fdd-res'); if (!box || !D) return;
        const cur = D.cur, q = (cur.q || '').trim();
        if (q.length < 2) { box.innerHTML = '<p style="margin:4px 0 0;font-size:11.5px;color:#94a3b8">Type at least 2 characters.</p>'; return; }
        const hits = (window.mockSearch ? window.mockSearch(q) : []).slice(0, 12);
        box.innerHTML = hits.length ? hits.map(c => `<div class="fdd-row ${cur.selected === c.id ? 'sel' : ''}" onclick="fddPick('${c.id}')"><span class="id">${c.id}</span><span class="nm">${esc(c.client.name)}<br><span class="mt">${esc(c.caseType === 'Others' ? c.caseTypeOther : c.caseType)} · ${esc(c.phase)} · DOL ${esc(c.dateOfLoss)}</span></span></div>`).join('')
            : '<p style="margin:4px 0 0;font-size:11.5px;color:#94a3b8">No cases match.</p>';
    }

    function feedbackHTML(entry, r) {
        const c = entry.call, k = c.mock && caseOf(c.mock);
        const cls = r.score >= 85 ? 'ok' : r.score >= 60 ? 'mid' : 'bad';
        const need = PERSONAL.includes(c.auth) ? 'name, date of birth, and address or SSN last 4'
            : c.auth === 'unauthorized' ? 'their name and their relationship to the client' : 'their name and a callback number';
        return `<div class="fdd-fb ${cls}"><div style="display:flex;justify-content:space-between;align-items:center"><b>${r.score}/100</b><span>⏱ ${fmtSec(r.secs)}</span></div>
            <div>${r.find ? '✓' : '✗'} <b>Find:</b> ${c.mock ? `${esc(c.mock)} · ${esc(k ? k.client.name : '')}` : 'not in the system'}${r.find ? '' : ` (you picked ${esc(r.picked.selected)})`}</div>
            <div>${r.authOk ? '✓' : '✗'} <b>Authenticate:</b> ${esc((AUTH.find(a => a[0] === c.auth) || [])[1])}</div>
            <div>${r.idsOk ? '✓' : '✗'} <b>Asked for:</b> ${need}</div>
            <div>${r.actOk ? '✓' : '✗'} <b>Handle:</b> ${esc(c.actions[c.answer])}</div>
            <div style="margin-top:5px;color:#334155">${esc(c.why)}</div>
            ${k && k.reception ? `<div style="margin-top:5px;color:#64748b;font-size:11.5px"><b>On file:</b> ${esc(k.reception.verify)}</div>` : ''}</div>`;
    }

    function summaryHTML() {
        const s = D.summary;
        const skill = (v) => v >= 85 ? 'Strong' : v >= 65 ? 'Developing' : 'Needs practice';
        return `<div class="fdd-sec" style="text-align:center"><div class="fdd-score">${s.score}%</div><div style="color:#64748b">${D.results.length} calls · ⏱ ${fmtSec(s.avgSeconds)} average per call</div>
            <div class="fdd-grid"><div><span>Find</span><b>${s.findPct}%</b></div><div><span>Authenticate</span><b>${s.authPct}%</b></div><div><span>Handle</span><b>${s.actionPct}%</b></div><div><span>Sec / call</span><b>${s.avgSeconds}</b></div></div>
            <div style="font-size:12px;color:#334155">Finding cases: <b>${skill(s.findPct)}</b> · Authentication: <b>${skill(s.authPct)}</b> · Call handling: <b>${skill(s.actionPct)}</b></div>
            <div style="font-size:11.5px;margin-top:6px;color:${D.saved === 'failed' ? '#b91c1c' : '#047857'}">${D.saved === 'saving' ? 'Saving…' : D.saved === 'saved' ? '✓ Saved to your results (your trainer sees them too)' : 'Couldn\'t save this result. Check your connection.'}</div></div>
            <div class="fdd-sec"><h4>Call by call</h4><table class="fdd-tbl"><thead><tr><th>Call</th><th>Find</th><th>Auth</th><th>IDs</th><th>Handle</th><th>Time</th><th>Score</th></tr></thead><tbody>
            ${D.results.map(r => `<tr><td>${esc(r.id)} · ${esc(r.mock || 'new')}</td><td>${r.find ? '✓' : '✗'}</td><td>${r.authOk ? '✓' : '✗'}</td><td>${r.idsOk ? '✓' : '✗'}</td><td>${r.actOk ? '✓' : '✗'}</td><td>${fmtSec(r.secs)}</td><td><b>${r.score}</b></td></tr>`).join('')}</tbody></table></div>
            <button class="fdd-go alt" onclick="fddStart()">▶ Another drill</button>
            <button class="fdd-go" onclick="fddHome()">My results</button>`;
    }

    // The sidebar button goes in after the Training Library button exists.
    const origApply = window.applySessionUI;
    if (typeof origApply === 'function') {
        window.applySessionUI = function () {
            const r = origApply.apply(this, arguments);
            buildUI();
            const signedIn = typeof hasAuthorizedAccess === 'function' && hasAuthorizedAccess();
            if (!signedIn && $id('fdd-panel')) { stopTimer(); D = null; screen = 'home'; document.body.classList.remove('fdd-on'); $id('fdd-panel').classList.remove('open'); }
            else if (signedIn && new URLSearchParams(location.search).get('drill') && !window.__fddOpened) { window.__fddOpened = true; setTimeout(openFrontDeskDrill, 80); }
            return r;
        };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI); else buildUI();
})();
