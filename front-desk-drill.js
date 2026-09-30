/* =========================================================
   LSH CMS — FRONT DESK DRILL
   ---------------------------------------------------------
   Measures a receptionist's (or any VA's) front-desk ability on the
   Training Library cases. Each drill is a run of randomly picked
   incoming calls (DRILL_CALLS in mock-cases.js). For every call the
   trainee must:
     1. ask the caller for identifiers (name, DOB, address, SSN last 4,
        callback number, relationship, date of the accident) — the
        caller answers from a script, and some answers are wrong on
        purpose;
     2. FIND the caller's case with the CMS search (by name, phone,
        claim #, plate…), open it and read the file — or decide the
        caller isn't in the system;
     3. AUTHENTICATE: client, authorized person on file, not verified,
        not authorized, business caller, or a new caller;
     4. HANDLE the call (one of four actions).
   Scoring per call (100): find 30 · authenticate 40 (decision 30 +
   asked the right identifiers 10; when two or more files share the
   client's name, that includes the date of the accident) · handle 30.
   Time per call is
   recorded. Results are saved to /api/drill-results; trainees see
   their history and Admins see the whole team.

   Live voice (live-call.js): with 🎙 Live voice on, each call is a
   real phone call. It rings, the trainee answers and talks, and the
   caller answers out loud from the same script (gives). The
   identifiers the trainee asks for are ticked from what they say.
   Without a microphone, or when live voice isn't set up, the call
   runs as text, as before.
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
        ['callback', 'Callback number'], ['relationship', 'Relationship to the client'],
        ['dol', 'Date of the accident (DOL)']
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
    .fdd-row .nm{font-weight:700;font-size:12.3px;flex:1;min-width:0}.fdd-row .mt{font-size:10.5px;color:#64748b}.fdd-row .mt b{color:#0f2148}
    .fdd-dup{margin:6px 0 2px;font-size:11.5px;line-height:1.45;color:#7c2d12;background:#fff7ed;border-left:3px solid #f97316;border-radius:5px;padding:6px 8px}
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
    .fdd-phone{background:linear-gradient(160deg,#0b1633,#13295a);color:#fff;border-radius:14px;padding:14px;margin-bottom:10px}
    .fdd-phone .row{display:flex;align-items:center;gap:10px}
    .fdd-av{width:42px;height:42px;border-radius:50%;background:#f97316;color:#0f172a;font-size:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0;position:relative}
    .fdd-av.ringing{animation:fddshake 1.1s ease-in-out infinite}
    .fdd-av.talking::after,.fdd-av.ringing::after{content:"";position:absolute;inset:-6px;border-radius:50%;border:3px solid rgba(251,146,60,.6);animation:fddpulse 1.1s ease-out infinite}
    .fdd-av.ringing::after{border-color:rgba(34,197,94,.7)}
    @keyframes fddpulse{from{transform:scale(.95);opacity:1}to{transform:scale(1.3);opacity:0}}
    @keyframes fddshake{0%,50%,100%{transform:rotate(0)}10%,30%{transform:rotate(-8deg)}20%,40%{transform:rotate(8deg)}}
    .fdd-phone .st{flex:1;min-width:0}.fdd-phone .st b{display:block;font-size:13.5px}.fdd-phone .st span{font-size:11.5px;color:#fdba74}
    .fdd-phone .ctl{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
    .fdd-phone .ctl button{border:none;border-radius:999px;padding:7px 12px;font-size:11.5px;font-weight:800;cursor:pointer;background:rgba(255,255,255,.14);color:#fff}
    .fdd-phone .ctl button.answer{background:#22c55e}.fdd-phone .ctl button.hang{background:#dc2626}.fdd-phone .ctl button.on{background:#fff;color:#0f172a}
    .fdd-phone .note{margin-top:8px;font-size:11.5px;line-height:1.45;color:#fde68a;background:rgba(245,158,11,.14);border-radius:8px;padding:7px 9px}
    .fdd-ltx{max-height:210px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-top:10px}
    .fdd-ltx div{max-width:88%;padding:7px 10px;border-radius:12px;font-size:12.5px;line-height:1.45}
    .fdd-ltx .caller{background:rgba(255,255,255,.12);align-self:flex-start;border-bottom-left-radius:3px}
    .fdd-ltx .you{background:#f97316;color:#0f172a;align-self:flex-end;border-bottom-right-radius:3px}
    .fdd-ltx em{font-size:11.5px;color:#c7d2fe}
    .fdd-asks button.heard{background:#ecfdf5;border-color:#10b981;color:#047857;cursor:default}
    .fdd-live-opt{display:flex;gap:8px;align-items:flex-start;margin:8px 0 0;font-size:12px;line-height:1.45;color:#334155}
    #fdd-panel label.fdd-live-opt,#fdd-panel label.fdd-live-opt span{text-transform:none !important;letter-spacing:normal !important;color:#334155 !important;font-size:12px !important;font-weight:500 !important;margin:8px 0 0}
    #fdd-panel label.fdd-live-opt span{margin:0}#fdd-panel label.fdd-live-opt b{font-weight:800;color:#0f2148}
    #fdd-panel label.fdd-live-opt input{margin-top:2px}
    `;
    document.head.appendChild(css);

    function buildUI() {
        const lib = $id('lib-open-btn');
        if (lib && !$id('fdd-open-btn')) {
            lib.insertAdjacentHTML('afterend', `<button id="fdd-open-btn" class="fdd-btn" onclick="openFrontDeskDrill()">📞 Front Desk Drill · scored</button>`);
        }
        // Like the Training Library button, the sidebar button is for Admins. Trainees open the
        // drill from their course's link (?drill=1), and their scores are saved the same way.
        const btn = $id('fdd-open-btn');
        if (btn) { const s = typeof getSession === 'function' ? getSession() : null; btn.style.display = s && s.userType === 'Admin' ? '' : 'none'; }
        if (!$id('fdd-panel')) {
            document.body.insertAdjacentHTML('beforeend', `<div id="fdd-panel" class="no-print" aria-hidden="true"></div>
                <button id="fdd-mini" class="no-print" onclick="fddRestore()">📞 Back to the call</button>`);
        }
    }

    const shuffle = (a) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
    const fmtSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const caseOf = (id) => (window.MOCK_CASES || []).find(c => c.id === id);
    const nameKey = (c) => String(c.client.name || '').replace(/\s+/g, ' ').trim().toLowerCase();
    // How many library files carry this case's client name (MC-01, MC-21 and MC-22 are all
    // "Maria Santos"). With more than one, only the date of the accident tells them apart.
    const sameNameCount = (id) => { const k = caseOf(id); return k ? (window.MOCK_CASES || []).filter(c => nameKey(c) === nameKey(k)).length : 0; };

    /* ---------- live voice ---------- */
    const LIVE_KEY = 'LSH_FDD_LIVE_V1';
    const liveOK = () => !!(window.LiveCall && window.LiveCall.supported());
    const livePref = () => { try { return localStorage.getItem(LIVE_KEY) !== 'off'; } catch (e) { return true; } };
    window.fddSetLive = function (on) { try { localStorage.setItem(LIVE_KEY, on ? 'on' : 'off'); } catch (e) {} };
    // Which identifiers the trainee asked for, heard in what they said on the call.
    const HEARD = {
        name: /\b(your|full|first|last) name\b|who (am i|i'm) (speaking|talking) (to|with)|who('s| is) (calling|this|on the line)|may i (have|get) (your )?name|spell (your|that|it)/i,
        dob: /date of birth|\bd\.? ?o\.? ?b\b|birth ?day|birth ?date|when were you born|year (you were|were you) born/i,
        address: /address|where do you live|street|zip ?code|mailing/i,
        ssn4: /social|\bssn\b|last (four|4)|security number/i,
        callback: /call ?back|phone number|best number|number (to|where|we can|i can)|reach you|contact number|your number|number you're calling from/i,
        relationship: /relationship|related to|how do you know|who are you to|are you (the|a|his|her) (client|family|relative|son|daughter|mother|father|husband|wife)|are you (his|her|the client)|on behalf of|(your|what's your|what is your) (connection|relation)/i,
        dol: /date of (the |your )?(accident|loss|incident|injury|crash|fall)|\bd\.? ?o\.? ?l\b|when did (it|this|that|the accident|the crash|the incident|the fall|you get hurt|you get injured) (happen|occur)|when (was|did) (the|your) (accident|crash|incident|fall|injury)|what (date|day) (was|did) (the|your) (accident|crash|incident|fall)/i
    };
    const heardAsks = (text) => Object.keys(HEARD).filter(k => HEARD[k].test(text));

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
        hangUp(); stopTimer(); D = null; screen = 'home';
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
        const liveBox = $id('fdd-live');
        if (liveBox) window.fddSetLive(liveBox.checked);
        D = {
            live: liveOK() && (liveBox ? liveBox.checked : livePref()),
            program: (window.lshProgram && window.lshProgram()) || '',
            calls: pool.map(c => ({ call: c, order: shuffle(c.actions.map((_, i) => i)) })),
            i: 0, results: []
        };
        document.body.classList.add('fdd-on');
        if (typeof closeCallsPanel === 'function') closeCallsPanel();
        startCall();
    };
    function startCall() {
        hangUp();
        D.cur = { asked: [], heard: [], selected: null, auth: null, action: null, q: '', submitted: false, t0: Date.now(),
            live: D.live ? { status: 'ringing', lines: [], muted: false, note: '' } : null };
        screen = 'call'; startTimer(); paint();
        if (D.cur.live) window.LiveCall.ring(3);
    }
    // Answer: the call connects and the caller hears you.
    window.fddAnswer = function () {
        const cur = D && D.cur, lv = cur && cur.live; if (!lv || lv.status !== 'ringing') return;
        lv.status = 'connecting'; cur.t0 = Date.now(); paintPhone();
        window.LiveCall.start({
            callId: D.calls[D.i].call.id,
            onState: (st) => { if (!D || D.cur !== cur || !cur.live) return; if (st === 'live') lv.status = 'live'; else if (st === 'ended') lv.status = 'ended'; paintPhone(); },
            onLine: (role, text, id) => {
                if (!D || D.cur !== cur || !cur.live) return;
                const l = lv.lines.find(x => x.id === id); if (l) l.text = text; else lv.lines.push({ id, role, text });
                if (role === 'you' && !cur.submitted) {
                    heardAsks(text).forEach(k => { if (!cur.asked.includes(k)) cur.asked.push(k); if (!cur.heard.includes(k)) cur.heard.push(k); });
                    paintAsks();
                }
                lv.talking = role === 'caller';
                paintLines(); paintAvatar();
            },
            onError: (msg, code) => {
                if (!D || D.cur !== cur || !cur.live) return;
                // No microphone, or live voice isn't set up here: the rest of the drill runs as text.
                if (['MIC', 'NOT_CONFIGURED', 'NO_MODEL'].includes(code)) D.live = false;
                if (lv.lines.length) { lv.status = 'ended'; lv.note = msg; paintPhone(); return; }
                cur.live = null; cur.liveNote = msg; paint();
            }
        });
    };
    window.fddMute = function () { const lv = D && D.cur && D.cur.live; if (!lv) return; lv.muted = window.LiveCall.setMuted(!lv.muted); paintPhone(); };
    window.fddHangUp = function () { const lv = D && D.cur && D.cur.live; if (!lv) return; hangUp(); lv.status = 'ended'; paintPhone(); };
    window.fddAskAloud = function (k) {
        const cur = D && D.cur; if (!cur || cur.submitted) return;
        const label = (ASKS.find(a => a[0] === k) || [])[1] || k;
        if (cur.live && cur.live.status === 'live') {
            window.LiveCall.sendText(k === 'relationship' ? 'What is your relationship to the client?' : k === 'dol' ? 'What was the date of the accident?' : `Can I have your ${label.toLowerCase()}, please?`);
            if (!cur.asked.includes(k)) cur.asked.push(k);
            paintAsks();
        } else if (!cur.live) window.fddAsk(k);
    };
    function hangUp() { if (!window.LiveCall) return; window.LiveCall.stopRing(); if (window.LiveCall.active()) window.LiveCall.stop(); }
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
    // True while a call is on the line and not yet scored: the top-bar case search
    // (case-library.js) then records the case it opens as this call's pick.
    window.fddOnCall = () => !!(D && screen === 'call' && D.cur && !D.cur.submitted);
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
        if (c.mock && sameNameCount(c.mock) > 1) idsOk = idsOk && cur.asked.includes('dol');
        const actOk = cur.action === c.answer;
        const secs = Math.round((Date.now() - cur.t0) / 1000);
        return { id: c.id, mock: c.mock, find, authOk, idsOk, actOk, secs,
            score: (find ? 30 : 0) + (authOk ? 30 : 0) + (idsOk ? 10 : 0) + (actOk ? 30 : 0),
            picked: { selected: cur.selected, auth: cur.auth, action: c.actions[cur.action], asked: cur.asked.slice() },
            live: !!(cur.live && cur.live.lines.length),
            transcript: cur.live && cur.live.lines.length ? cur.live.lines.map(l => `${l.role === 'you' ? 'You' : 'Caller'}: ${l.text}`).join('\n').slice(0, 4000) : undefined };
    }
    window.fddSubmit = function () {
        const cur = D.cur;
        if (!cur.selected || !cur.auth || cur.action == null) return;
        cur.submitted = true; stopTimer();
        if (cur.live) { hangUp(); if (cur.live.status !== 'ringing') cur.live.status = 'ended'; }
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
    window.fddHome = function () { hangUp(); stopTimer(); D = null; screen = 'home'; document.body.classList.remove('fdd-on'); loadHistory(); paint(); };

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
              <li><b>Ask</b> the caller for what you need (name, date of birth, address, SSN last 4, callback, relationship, date of the accident). On a live call, just ask out loud: what you ask is ticked as you say it.</li>
              <li><b>Find</b> their case with the search (name, phone, claim #, plate, DOL…), open it and read the file. Some callers aren't in the system, and some names are on more than one file: the date of the accident and the date of birth tell you which one.</li>
              <li><b>Authenticate</b>: compare what they told you with the file. Some callers get it wrong on purpose.</li>
              <li><b>Handle</b> the call.</li></ol>
            <p style="margin:0;color:#64748b;font-size:12px">Scored per call: find 30 · authenticate 40 (decision 30 + asking the right identifiers 10) · handle 30. Time per call is recorded. ${total} calls in the pool, across ${(window.MOCK_CASES || []).length} case files. The rules are in 🔍 Case Library → ☎ Firm directory.</p></div>
            <div class="fdd-sec"><h4>Start a drill</h4>
            <div style="display:flex;gap:8px;align-items:center"><select id="fdd-len" style="padding:8px;border:1px solid #cbd5e1;border-radius:7px;font-size:12.5px">
                <option value="5">5 calls (~10 min)</option><option value="8" selected>8 calls (~15 min)</option><option value="12">12 calls (~25 min)</option><option value="${total}">All ${total} calls</option></select>
            <button class="fdd-go alt" style="margin:0;flex:1" onclick="fddStart()">▶ Take the first call</button></div>
            ${liveOK() ? `<label class="fdd-live-opt"><input type="checkbox" id="fdd-live" ${livePref() ? 'checked' : ''} onchange="fddSetLive(this.checked)"><span><b>🎙 Live voice calls.</b> The phone rings, you answer and talk, and the caller talks back like a real call. Use a headset and allow the microphone. Turn this off to read the calls as text.</span></label>`
                : `<p class="fdd-live-opt">🎙 Live voice calls need Chrome or Edge with a microphone. In this browser the calls run as text.</p>`}</div>
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
        let v = c.gives[k];
        if (k === 'dol' && v == null && caseOf(c.mock)) v = caseOf(c.mock).dateOfLoss;
        if (v == null) return c.auth === 'business' ? 'Caller: "I\'m calling for the company; I don\'t have that."' : 'Caller: "I don\'t know / I\'d rather not say."';
        return `Caller: "${v}"`;
    }

    function callHTML() {
        const entry = D.calls[D.i], c = entry.call, cur = D.cur, done = cur.submitted;
        const r = done ? D.results[D.results.length - 1] : null;
        const fb = done ? feedbackHTML(entry, r) : '';
        const lv = cur.live;
        return `${fb}
        ${lv ? `<div class="fdd-phone" id="fdd-phone">${phoneHTML()}</div>`
             : `${cur.liveNote ? `<div class="fdd-dup">🎙 ${esc(cur.liveNote)}</div>` : ''}<div class="fdd-caller">📞 ${esc(c.opening)}</div>`}
        <div class="fdd-sec"><h4>1 · Ask the caller${lv ? ' (out loud)' : ''}</h4><div class="fdd-asks" id="fdd-asks">${asksHTML()}</div>
            ${lv ? `<p style="margin:6px 0 0;font-size:11.5px;color:#64748b">Ask out loud: each identifier is ticked as you ask for it. Tap one to ask it in writing instead.</p>`
                 : `<div class="fdd-tr">${cur.asked.map(k => `<div><span class="q">You: ${esc((ASKS.find(a => a[0] === k) || [])[1])}?</span><br><span class="a">${esc(answerFor(c, k))}</span></div>`).join('')}</div>`}</div>
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

    function asksHTML() {
        const cur = D.cur, lv = cur.live;
        return ASKS.map(([k, l]) => {
            const asked = cur.asked.includes(k);
            return lv ? `<button class="${asked ? 'heard' : ''}" onclick="fddAskAloud('${k}')" ${asked || cur.submitted ? 'disabled' : ''}>${asked ? '✓ ' : ''}${l}</button>`
                      : `<button class="${asked ? 'on' : ''}" onclick="fddAsk('${k}')">${l}</button>`;
        }).join('');
    }
    function paintAsks() { const el = $id('fdd-asks'); if (el && D && D.cur) el.innerHTML = asksHTML(); }
    function phoneHTML() {
        const lv = D.cur.live, done = D.cur.submitted;
        const st = { ringing: ['Incoming call', 'Ringing… answer it'], connecting: ['Connecting…', 'Allow the microphone if asked'], live: ['On the call', lv.muted ? 'You\'re muted' : 'Talk normally: the caller hears you'], ended: ['Call ended', done ? '' : 'Finish steps 2–4, then score the call'] }[lv.status] || ['', ''];
        return `<div class="row"><div class="fdd-av ${lv.status === 'ringing' ? 'ringing' : ''}" id="fdd-av">📞</div><div class="st"><b>${st[0]}</b><span>${st[1]}</span></div><span class="t" style="font-family:'IBM Plex Mono',monospace;color:#fdba74;font-weight:800">${lv.status === 'live' ? '● LIVE' : ''}</span></div>
            <div class="ctl">${lv.status === 'ringing' && !done ? `<button class="answer" onclick="fddAnswer()">📞 Answer</button>` : ''}
                ${lv.status === 'live' ? `<button class="${lv.muted ? 'on' : ''}" onclick="fddMute()">${lv.muted ? '🔇 Unmute' : '🎙 Mute'}</button><button class="hang" onclick="fddHangUp()">✆ Hang up</button>` : ''}</div>
            ${lv.note ? `<div class="note">${esc(lv.note)}</div>` : ''}
            ${lv.status === 'ringing' ? '' : `<div class="fdd-ltx" id="fdd-ltx">${linesHTML()}</div>`}`;
    }
    function linesHTML() {
        const lv = D.cur.live;
        if (!lv.lines.length) return lv.status === 'live' ? '<em>Greet the caller the way you answer the firm\'s phone.</em>' : '';
        return lv.lines.map(l => `<div class="${l.role}">${esc(l.text)}</div>`).join('');
    }
    function paintPhone() { const el = $id('fdd-phone'); if (el && D && D.cur && D.cur.live) { el.innerHTML = phoneHTML(); const tx = $id('fdd-ltx'); if (tx) tx.scrollTop = tx.scrollHeight; } }
    function paintLines() { const tx = $id('fdd-ltx'); if (tx && D && D.cur && D.cur.live) { tx.innerHTML = linesHTML(); tx.scrollTop = tx.scrollHeight; } }
    function paintAvatar() { const av = $id('fdd-av'); if (av && D && D.cur && D.cur.live) av.classList.toggle('talking', !!D.cur.live.talking && D.cur.live.status === 'live'); }

    function paintResults() {
        const box = $id('fdd-res'); if (!box || !D) return;
        const cur = D.cur, q = (cur.q || '').trim();
        if (q.length < 2) { box.innerHTML = '<p style="margin:4px 0 0;font-size:11.5px;color:#94a3b8">Type at least 2 characters.</p>'; return; }
        const hits = (window.mockSearch ? window.mockSearch(q) : []).slice(0, 12);
        const dup = [...new Set(hits.map(nameKey))].filter(k => hits.filter(c => nameKey(c) === k).length > 1);
        const warn = dup.length ? `<p class="fdd-dup">⚠ More than one file is named ${dup.map(k => `<b>${esc(hits.find(c => nameKey(c) === k).client.name)}</b>`).join(' and ')}. Match the date of the accident (DOL) and the date of birth before you open one.</p>` : '';
        box.innerHTML = hits.length ? warn + hits.map(c => `<div class="fdd-row ${cur.selected === c.id ? 'sel' : ''}" onclick="fddPick('${c.id}')"><span class="id">${c.id}</span><span class="nm">${esc(c.client.name)}<br><span class="mt">DOL <b>${esc(c.dateOfLoss)}</b> · DOB ${esc(c.client.dob)} · ${esc(c.caseType === 'Others' ? c.caseTypeOther : c.caseType)} · ${esc(c.phase)}</span></span></div>`).join('')
            : '<p style="margin:4px 0 0;font-size:11.5px;color:#94a3b8">No cases match.</p>';
    }

    function feedbackHTML(entry, r) {
        const c = entry.call, k = c.mock && caseOf(c.mock);
        const cls = r.score >= 85 ? 'ok' : r.score >= 60 ? 'mid' : 'bad';
        const same = c.mock ? sameNameCount(c.mock) : 0;
        const need = (PERSONAL.includes(c.auth) ? 'name, date of birth, and address or SSN last 4'
            : c.auth === 'unauthorized' ? 'their name and their relationship to the client' : 'their name and a callback number')
            + (same > 1 ? `, plus the date of the accident (${same} files are named ${k.client.name})` : '');
        return `<div class="fdd-fb ${cls}"><div style="display:flex;justify-content:space-between;align-items:center"><b>${r.score}/100</b><span>⏱ ${fmtSec(r.secs)}</span></div>
            <div>${r.find ? '✓' : '✗'} <b>Find:</b> ${c.mock ? `${esc(c.mock)} · ${esc(k ? k.client.name : '')}${k ? ` (DOL ${esc(k.dateOfLoss)})` : ''}` : 'not in the system'}${r.find ? '' : ` (you picked ${esc(r.picked.selected)})`}</div>
            <div>${r.authOk ? '✓' : '✗'} <b>Authenticate:</b> ${esc((AUTH.find(a => a[0] === c.auth) || [])[1])}</div>
            <div>${r.idsOk ? '✓' : '✗'} <b>Asked for:</b> ${need}</div>
            <div>${r.actOk ? '✓' : '✗'} <b>Handle:</b> ${esc(c.actions[c.answer])}</div>
            <div style="margin-top:5px;color:#334155">${esc(c.why)}</div>
            ${k && k.reception ? `<div style="margin-top:5px;color:#64748b;font-size:11.5px"><b>On file:</b> ${esc(k.reception.verify)}</div>` : ''}
            ${r.live ? `<div style="margin-top:5px;color:#64748b;font-size:11.5px">🎙 Live call · you asked for: ${r.picked.asked.length ? esc(r.picked.asked.map(a => (ASKS.find(x => x[0] === a) || [])[1]).join(', ')) : 'nothing'}</div>` : ''}</div>`;
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
            if (!signedIn && $id('fdd-panel')) { hangUp(); stopTimer(); D = null; screen = 'home'; document.body.classList.remove('fdd-on'); $id('fdd-panel').classList.remove('open'); }
            else if (signedIn && new URLSearchParams(location.search).get('drill') && !window.__fddOpened) { window.__fddOpened = true; setTimeout(openFrontDeskDrill, 80); }
            return r;
        };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI); else buildUI();
})();
