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

   PRACTICE CALLS (no script), like the Training Portal's Call
   Simulator: a random caller from DRILL_CALLS phones in, and the
   trainee takes the whole call in their own words. No answer choices,
   no identifier buttons. After hanging up they pick the file and the
   authentication decision, can write a call note, and get a debrief:
   find 30 and authenticate 30 against the key, plus identifiers 10 and
   handling 30 from a review of the transcript against the key and the
   firm's rules (/api/call-ai). The call runs on live voice when it's on
   and working; otherwise, or when it's busy or drops, it goes on with
   the standard voice: the caller's lines come from /api/call-ai and are
   read out by the browser (call-voice.js), and the trainee types or
   talks. So a whole class can call at once, live voice spreads its
   calls over the keys (functions/api/live-call.js); the standard
   voice's lines and the debriefs take turns over every key, resting a
   key that hits its limit (functions/_ai.js); and a busy line is
   retried here with a back-off.
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
    let P = null;         // the practice call
    let timer = null;
    let screen = 'home';  // home | call | summary | practice | pcwrap | pcdebrief
    let pcLevel = 0;      // practice callers' level (0 = any)
    let pcRecent = [];    // the last few practice callers, so they don't repeat right away
    let pcLiveOff = 0, pcLiveWhy = '';   // live voice failed: practice calls use the standard voice until then
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
    .fdd-phone .meet{margin-top:8px;font-size:11.5px;line-height:1.5;color:#c7d2fe;background:rgba(255,255,255,.08);border-radius:8px;padding:7px 9px}
    .fdd-phone .meet summary{cursor:pointer;font-weight:800;color:#fff}.fdd-phone .meet ol{margin:6px 0 4px 18px;padding:0;list-style:decimal}.fdd-phone .meet li{display:list-item}.fdd-phone .meet p{margin:4px 0 0}.fdd-phone .meet b{color:#fff}
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
    .fdd-pc-id{background:linear-gradient(160deg,#0b1633,#13295a);color:#fff;border-radius:12px;padding:11px 13px;margin-bottom:8px;display:flex;align-items:center;gap:12px}
    .fdd-pc-id .av{width:38px;height:38px;border-radius:50%;background:#f97316;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
    .fdd-pc-id.ringing .av{animation:fddshake 1.1s ease-in-out infinite;background:#22c55e}
    .fdd-pc-id .who{flex:1;min-width:0}.fdd-pc-id .who b{display:block;font-size:14px}.fdd-pc-id .who span{font-size:11.5px;color:#fdba74}
    .fdd-pc-id .answer{border:none;border-radius:999px;padding:8px 14px;font-size:12px;font-weight:800;cursor:pointer;background:#22c55e;color:#fff}
    #fdd-pc-status{font-size:12px;color:#475569;margin:0 0 6px;min-height:16px}
    #fdd-pc-status.warn{color:#b45309;font-weight:600}
    .fdd-tx{display:flex;flex-direction:column;gap:6px;max-height:34vh;min-height:80px;overflow-y:auto;padding:6px 2px 8px}
    .fdd-msg{max-width:86%;padding:8px 11px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}
    .fdd-msg.c{align-self:flex-start;background:#0f2148;color:#fff;border-bottom-left-radius:3px}
    .fdd-msg.y{align-self:flex-end;background:#ffedd5;color:#7c2d12;border-bottom-right-radius:3px}
    .fdd-msg.s{align-self:center;color:#64748b;font-size:11.5px;font-style:italic;padding:2px 6px}
    .fdd-msg.typing{opacity:.65;letter-spacing:2px}
    .fdd-comp{display:flex;gap:6px;align-items:flex-end}
    .fdd-comp textarea,.fdd-note{flex:1;width:100%;box-sizing:border-box;min-height:46px;max-height:140px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;font-size:13px;resize:vertical}
    .fdd-note{min-height:74px;font-size:12.5px}
    .fdd-comp button,.fdd-ctl button{border:1px solid #cbd5e1;background:#fff;color:#0f2148;border-radius:8px;padding:8px 10px;font-weight:800;font-size:11.5px;cursor:pointer}
    .fdd-comp button.send{background:#0f2148;color:#fff;border-color:#0f2148;padding:10px 14px}
    .fdd-comp button:disabled,.fdd-ctl button:disabled{opacity:.45;cursor:not-allowed}
    .fdd-ctl{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
    .fdd-ctl button.on{background:#ecfdf5;border-color:#10b981;color:#047857}
    .fdd-ctl button.rec{background:#fee2e2;border-color:#ef4444;color:#b91c1c}
    .fdd-pc-note{flex-basis:100%;font-size:11.5px;line-height:1.45;color:#92400e;background:#fffbeb;border-radius:7px;padding:6px 9px}
    .fdd-hang{width:100%;background:#dc2626;color:#fff;border:none;border-radius:8px;padding:10px;font-weight:800;font-size:12px;text-transform:uppercase;cursor:pointer;margin:8px 0 10px}
    .fdd-seg{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px}
    .fdd-seg button{font-size:11px;font-weight:700;border:1px solid #cbd5e1;background:#fff;color:#0f2148;border-radius:999px;padding:5px 11px;cursor:pointer}
    .fdd-seg button.on{background:#0f2148;color:#fff;border-color:#0f2148}
    .fdd-rv ul{margin:3px 0 7px 18px;padding:0}.fdd-rv li{margin:2px 0;line-height:1.45}
    .fdd-rv .better{background:#f0f9ff;border-left:3px solid #0ea5e9;border-radius:5px;padding:6px 9px;margin-top:4px}
    .fdd-breach{margin-top:5px;color:#991b1b;font-weight:700}
    .fdd-tag{font-size:9.5px;font-weight:800;text-transform:uppercase;border-radius:4px;padding:1px 5px;background:#e0f2fe;color:#0369a1;white-space:nowrap}
    .fdd-dir summary{cursor:pointer;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
    .fdd-dir ul{margin:6px 0 0 16px;padding:0;font-size:12px;line-height:1.5}
    .fdd-script{border:1px solid #cbd5e1;border-radius:10px;margin:0 0 12px;background:#fff;font-size:12.3px;line-height:1.5;color:#0f172a;overflow:hidden}
    .fdd-script .sh{background:#0f2148;color:#fff;padding:8px 11px;display:flex;justify-content:space-between;gap:8px;align-items:center}
    .fdd-script .sh b{font-size:12.5px}.fdd-script .sh span{font-size:10px;font-weight:800;letter-spacing:.04em;color:#fdba74;text-transform:uppercase}
    .fdd-script .sb{padding:9px 11px}
    .fdd-script h5{margin:8px 0 3px;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748b}
    .fdd-script .say{background:#f1f5f9;border-left:3px solid #0f2148;border-radius:5px;padding:6px 9px;margin:3px 0;font-weight:600}
    .fdd-script .rsay{background:#ecfdf5;border-left:3px solid #10b981;border-radius:5px;padding:6px 9px;margin:3px 0}
    .fdd-script table{width:100%;border-collapse:collapse;font-size:11.8px}.fdd-script td{border-bottom:1px solid #e2e8f0;padding:3px 5px;vertical-align:top}.fdd-script td:first-child{color:#64748b;width:38%}
    .fdd-script .skey{background:#fff7ed;border-left:3px solid #f97316;border-radius:5px;padding:6px 9px;margin-top:4px}
    .fdd-script ul{margin:2px 0 0 16px;padding:0}
    .fdd-scripts-bar{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 10px}
    .fdd-scripts-bar button{font-size:10px;font-weight:800;text-transform:uppercase;background:#fff;border:1px solid #0f2148;color:#0f2148;border-radius:6px;padding:6px 9px;cursor:pointer}
    `;
    document.head.appendChild(css);

    function buildUI() {
        const lib = $id('lib-open-btn');
        if (lib && !$id('fdd-open-btn')) {
            lib.insertAdjacentHTML('afterend', `<button id="fdd-open-btn" class="fdd-btn" onclick="openFrontDeskDrill()">📞 Front Desk · practice calls</button>`);
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
    // Speakerphone (remembered): for a room, or to show the call in Google Meet.
    const SPEAKER_KEY = 'LSH_FDD_SPEAKER_V1';
    const speakerPref = () => { try { return localStorage.getItem(SPEAKER_KEY) === 'on'; } catch (e) { return false; } };
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
        if (!D && !P) { screen = 'home'; loadHistory(); }
        paint();
    };
    window.fddClose = function () {
        if (D && screen === 'call' && !confirm('Leave the drill? This run won\'t be scored.')) return;
        if (P && (screen === 'practice' || screen === 'pcwrap') && !confirm('Leave this call? It won\'t be scored.')) return;
        hangUp(); stopTimer(); D = null; endPractice(); screen = 'home';
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
        endPractice();
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
            live: D.live ? { status: 'ringing', lines: [], muted: false, speaker: speakerPref(), note: '' } : null };
        screen = 'call'; startTimer(); paint();
        if (D.cur.live) window.LiveCall.ring(3);
    }
    // Answer: the call connects and the caller hears you.
    window.fddAnswer = function () {
        const cur = D && D.cur, lv = cur && cur.live; if (!lv || lv.status !== 'ringing') return;
        lv.status = 'connecting'; cur.t0 = Date.now(); paintPhone();
        window.LiveCall.start({
            callId: D.calls[D.i].call.id,
            speaker: lv.speaker,
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
            onNotice: (msg) => { if (D && D.cur === cur && cur.live) { lv.note = msg; paintPhone(); } },
            onError: (msg, code) => {
                if (!D || D.cur !== cur || !cur.live) return;
                // No microphone, live voice not set up, the day's minutes used up, or a refused
                // region: the rest of the drill runs as text. (Busy lines: the next call tries again.)
                if (['MIC', 'NOT_CONFIGURED', 'BUDGET', 'REGION'].includes(code)) D.live = false;
                // A call that was already connected ends on the phone; one that never started runs as text.
                if (lv.lines.length || ['TIME', 'DROPPED'].includes(code)) { lv.status = 'ended'; lv.note = msg; paintPhone(); return; }
                cur.live = null; cur.liveNote = msg; paint();
            }
        });
    };
    window.fddSpeaker = function () {
        const lv = D && D.cur && D.cur.live; if (!lv) return;
        lv.speaker = !lv.speaker; lv.meetOpen = lv.speaker;
        if (window.LiveCall.active()) window.LiveCall.setSpeaker(lv.speaker);
        try { localStorage.setItem(SPEAKER_KEY, lv.speaker ? 'on' : 'off'); } catch (e) {}
        paintPhone();
    };
    window.fddMeetOpen = function (open) { const lv = D && D.cur && D.cur.live; if (lv) lv.meetOpen = !!open; };
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
        timer = setInterval(() => {
            const t0 = screen === 'call' && D && D.cur && !D.cur.submitted ? D.cur.t0 : screen === 'practice' && P && P.t0 && !P.ended ? P.t0 : null;
            const el = $id('fdd-timer'); if (el && t0) el.textContent = fmtSec(Math.round((Date.now() - t0) / 1000));
        }, 1000);
    }
    function stopTimer() { if (timer) clearInterval(timer); timer = null; }

    window.fddAsk = function (k) {
        const cur = D.cur; if (cur.submitted || cur.asked.includes(k)) return;
        cur.asked.push(k); paint();
    };
    // The search box and the file pick belong to the drill call or to the practice call on screen.
    const pickCtx = () => screen === 'call' && D ? D.cur : (screen === 'practice' || screen === 'pcwrap') && P ? P : null;
    window.fddSearch = function (v) { const p = pickCtx(); if (p) { p.q = v; paintResults(); } };
    window.fddPick = function (id) {
        if ((screen === 'practice' || screen === 'pcwrap') && P) {
            P.selected = id;
            if (id !== 'none' && typeof openMockCase === 'function') openMockCase(id, { silent: true });
            pcPick(); return;
        }
        if (!D || !D.cur) return;
        const cur = D.cur; if (cur.submitted) return;
        cur.selected = id;
        if (id !== 'none' && typeof openMockCase === 'function') openMockCase(id, { silent: true });
        paint();
    };
    // True while a call is on the line and not yet scored: the top-bar case search
    // (case-library.js) then records the case it opens as this call's pick.
    window.fddOnCall = () => !!(D && screen === 'call' && D.cur && !D.cur.submitted) || !!(P && (screen === 'practice' || screen === 'pcwrap'));
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
    let liveUsage = null;
    async function loadLiveUsage() {
        try {
            const res = await fetch('/api/live-call', { credentials: 'include' });
            const data = await res.json();
            liveUsage = data && data.success ? data : null;
        } catch (e) { liveUsage = null; }
    }
    async function loadHistory() {
        if (isAdmin()) await loadLiveUsage();
        try {
            const res = await fetch('/api/drill-results', { credentials: 'include' });
            const data = await res.json();
            history = data && data.success ? data : { results: [], isAdmin: false };
        } catch (e) { history = { results: [], isAdmin: false, error: true }; }
        if (screen === 'home' || screen === 'summary') paint();
        else if (screen === 'pcdebrief') { const h = $id('fdd-pc-hist'); if (h) h.innerHTML = historyHTML(); }
    }
    window.fddHome = function () { hangUp(); stopTimer(); D = null; endPractice(); screen = 'home'; document.body.classList.remove('fdd-on'); loadHistory(); paint(); };

    /* ---------- rendering ---------- */
    function paint() {
        const p = $id('fdd-panel'); if (!p) return;
        if (['practice', 'pcwrap', 'pcdebrief'].includes(screen) && !P) screen = 'home';
        const title = screen === 'call' ? `Call ${D.i + 1} of ${D.calls.length}` : screen === 'summary' ? 'Drill complete'
            : screen === 'practice' ? 'Practice call' : screen === 'pcwrap' ? 'Wrap up the call' : screen === 'pcdebrief' ? 'Call debrief' : 'Front Desk Calls';
        const t0 = screen === 'call' ? D.cur.t0 : screen === 'practice' ? P.t0 : null;
        const clock = screen === 'call' || screen === 'practice' ? `<span class="t" id="fdd-timer">${t0 ? fmtSec(Math.round((Date.now() - t0) / 1000)) : '0:00'}</span>` : '';
        const hide = ['call', 'practice', 'pcwrap'].includes(screen) ? `<button onclick="fddMinimize()" title="Hide to read the case">▭ Case</button>` : '';
        p.innerHTML = `<div class="fdd-h"><b>📞 ${title}</b>${clock}${hide}<button onclick="fddClose()">✕</button></div>
            <div class="fdd-b">${screen === 'call' ? callHTML() : screen === 'summary' ? summaryHTML() : screen === 'practice' ? practiceHTML()
                : screen === 'pcwrap' ? pcWrapHTML() : screen === 'pcdebrief' ? pcDebriefHTML() : homeHTML()}</div>`;
        if (['call', 'practice', 'pcwrap'].includes(screen)) paintResults();
        if (screen === 'practice') { pcIdCard(); pcControls(); pcTr(); const box = $id('fdd-pc-in'); if (box) box.value = P.draft || ''; }
        if (screen === 'pcdebrief') paintSaved();
    }
    function paintButtons() {
        const cur = D && D.cur; const b = $id('fdd-submit');
        if (b) b.disabled = !(cur && cur.selected && cur.auth && cur.action != null);
    }

    function homeHTML() {
        const total = (window.DRILL_CALLS || []).length;
        const lv = [[0, 'Any caller'], [1, 'Level 1 · warm-up'], [2, 'Level 2'], [3, 'Level 3 · tricky']];
        return `${liveOK() ? `<label class="fdd-live-opt" style="margin:0 0 10px"><input type="checkbox" id="fdd-live" ${livePref() ? 'checked' : ''} onchange="fddSetLive(this.checked)"><span><b>🎙 Live voice calls.</b> The phone rings, you answer and talk, and the caller talks back like a real call. Use a headset and allow the microphone. Turn this off to type (practice calls) or read (drill) instead.</span></label>`
                : `<p class="fdd-live-opt" style="margin:0 0 10px">🎙 Live voice calls need Chrome or Edge with a microphone. In this browser you type (practice calls) or read (drill).</p>`}
            <div class="fdd-sec"><h4>📞 Practice call · no script</h4>
            <p style="margin:0 0 6px;line-height:1.5">A caller phones the front desk and you take the whole call in your own words, like on the job: no script and no answer choices. The caller reacts to what you say.</p>
            <ol style="margin:0 0 8px 18px;padding:0;line-height:1.55">
              <li><b>Answer</b> and greet the caller, and find out what they need.</li>
              <li><b>Ask</b> for what you need to identify them, <b>find</b> their file (search by name, case number, phone, DOL…) and <b>verify</b> them against it. Some callers aren't clients, some aren't allowed to get information, and some names are on more than one file.</li>
              <li><b>Help</b> them from the file, or take a complete message and route it. Then hang up.</li></ol>
            <p style="margin:0 0 4px;font-size:12px;color:#475569">After the call you pick the file and who the caller was, and you get a debrief: find 30 · authenticate 30 · asked the right identifiers 10 · handled the call 30.</p>
            <div class="fdd-seg">${lv.map(([n, l]) => `<button class="${pcLevel === n ? 'on' : ''}" onclick="fddPracticeLevel(${n}, this)">${l}</button>`).join('')}</div>
            <button class="fdd-go alt" onclick="fddPracticeStart()">📞 Take a practice call</button></div>
            <div class="fdd-sec"><h4>📋 Scored drill · step by step</h4>
            <p style="margin:0 0 6px;line-height:1.5;font-size:12.3px">A run of calls where you <b>ask</b> for identifiers, <b>find</b> the case, <b>authenticate</b> the caller (some get it wrong on purpose) and pick how to <b>handle</b> the call. On a live call, just ask out loud: what you ask is ticked as you say it. Scored per call: find 30 · authenticate 40 (decision 30 + asking the right identifiers 10) · handle 30. ${total} calls in the pool, across ${(window.MOCK_CASES || []).length} case files. The firm directory and front-desk rules are below.</p>
            <div style="display:flex;gap:8px;align-items:center"><select id="fdd-len" style="padding:8px;border:1px solid #cbd5e1;border-radius:7px;font-size:12.5px">
                <option value="5">5 calls (~10 min)</option><option value="8" selected>8 calls (~15 min)</option><option value="12">12 calls (~25 min)</option><option value="${total}">All ${total} calls</option></select>
            <button class="fdd-go" style="margin:0;flex:1" onclick="fddStart()">▶ Take the first call</button></div></div>
            ${directoryHTML()}
            ${historyHTML()}`;
    }

    // Admins: how much the live voice calls are being used (and roughly what they cost).
    function liveUsageHTML() {
        const u = liveUsage; if (!u) return '';
        const lim = u.limits || {};
        return `<div class="fdd-sec"><h4>🎙 Live voice calls</h4>
            <div class="fdd-grid"><div><span>On calls now</span><b>${u.activeNow}</b></div><div><span>Calls · 24 h</span><b>${u.last24h.calls}</b></div><div><span>Minutes · 24 h</span><b>${u.last24h.minutes}${lim.dailyMinutes ? `<span style="display:inline;font-size:10px"> / ${lim.dailyMinutes}</span>` : ''}</b></div><div><span>Est. cost · 24 h</span><b>$${u.last24h.estCost.toFixed(2)}</b></div></div>
            <p style="margin:4px 0 0;font-size:11.5px;color:#64748b;line-height:1.5">${u.keys.length} key${u.keys.length === 1 ? '' : 's'}: ${u.keys.map(k => `${esc(k.slot)} (${k.activeNow} now)`).join(', ') || 'none set'} · calls end at ${lim.maxMinutes} min${lim.perKey ? ` · at most ${lim.perKey} at once per key` : ''}${u.last24h.refused ? ` · ${u.last24h.refused} tr${u.last24h.refused === 1 ? 'y' : 'ies'} refused by Google (busy), moved to another key or to text` : ''}. The cost is an estimate at Google's paid per-minute price (Google's billing page has the exact amount). Google's limits are per Google Cloud project, so keys from different projects add capacity.</p></div>`;
    }
    function historyHTML() {
        if (!history) return `<p style="color:#64748b;font-size:12px">Loading results…</p>`;
        const rows = history.results || [];
        if (history.isAdmin && isAdmin()) {   // not in Trainee view
            const by = {};
            rows.forEach(r => { (by[r.username] = by[r.username] || []).push(r); });
            const team = Object.entries(by).map(([u, rs]) => {
                const n = rs.length, avg = (k) => Math.round(rs.reduce((a, r) => a + (r[k] || 0), 0) / n);
                return { u, name: rs[0].full_name || u, batch: rs[0].batch_id || '', n, practice: rs.filter(r => r.mode === 'practice').length, score: avg('score'), best: Math.max(...rs.map(r => r.score)), find: avg('find_pct'), auth: avg('auth_pct'), act: avg('action_pct'), secs: avg('avg_seconds'), last: rs[0].created_at };
            }).sort((a, b) => b.score - a.score);
            return `${liveUsageHTML()}<div class="fdd-sec"><h4>Team results (${rows.length} drills and practice calls)</h4>${team.length ? `<table class="fdd-tbl"><thead><tr><th>Trainee</th><th>Runs</th><th>Avg</th><th>Find</th><th>Auth</th><th>Handle</th><th>Sec/call</th></tr></thead><tbody>
                ${team.map(t => `<tr><td><b>${esc(t.name)}</b><br><span style="color:#64748b">${esc(t.batch)}</span></td><td>${t.n}${t.practice ? `<br><span style="color:#64748b">${t.practice} practice</span>` : ''}</td><td><b>${t.score}%</b><br><span style="color:#64748b">best ${t.best}%</span></td><td>${t.find}%</td><td>${t.auth}%</td><td>${t.act}%</td><td>${t.secs}</td></tr>`).join('')}</tbody></table>` : '<p style="color:#64748b;font-size:12px;margin:0">No drills completed yet.</p>'}</div>`;
        }
        return `<div class="fdd-sec"><h4>My results</h4>${rows.length ? `<table class="fdd-tbl"><thead><tr><th>Date</th><th>Type</th><th>Score</th><th>Find</th><th>Auth</th><th>Handle</th><th>Sec/call</th></tr></thead><tbody>
            ${rows.slice(0, 15).map(r => `<tr><td>${esc(String(r.created_at || '').slice(0, 16))}</td><td>${r.mode === 'practice' ? '<span class="fdd-tag">Practice call</span>' : `Drill · ${r.calls}`}</td><td><b>${r.score}%</b></td><td>${r.find_pct}%</td><td>${r.auth_pct}%</td><td>${r.action_pct}%</td><td>${r.avg_seconds}</td></tr>`).join('')}</tbody></table>` : `<p style="color:#64748b;font-size:12px;margin:0">${history.error ? 'Couldn\'t load results.' : 'No calls yet. Your scores will appear here and on your trainer\'s team view.'}</p>`}</div>`;
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
            <input class="fdd-search" placeholder="Search name, case number, DOL, DOB, phone, claim #, plate…" value="${esc(cur.q)}" oninput="fddSearch(this.value)" ${done ? 'disabled' : ''}>
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
        const st = { ringing: ['Incoming call', 'Ringing… answer it'], connecting: ['Connecting…', 'Allow the microphone if asked'], live: ['On the call', lv.muted ? 'You\'re muted' : lv.speaker ? 'Speakerphone: let the caller finish, then answer' : 'Talk normally: the caller hears you'], ended: ['Call ended', done ? '' : 'Finish steps 2–4, then score the call'] }[lv.status] || ['', ''];
        return `<div class="row"><div class="fdd-av ${lv.status === 'ringing' ? 'ringing' : ''}" id="fdd-av">📞</div><div class="st"><b>${st[0]}</b><span>${st[1]}</span></div><span class="t" style="font-family:'IBM Plex Mono',monospace;color:#fdba74;font-weight:800">${lv.status === 'live' ? '● LIVE' : ''}</span></div>
            <div class="ctl">${lv.status === 'ringing' && !done ? `<button class="answer" onclick="fddAnswer()">📞 Answer</button>` : ''}
                ${lv.status === 'live' ? `<button class="${lv.muted ? 'on' : ''}" onclick="fddMute()">${lv.muted ? '🔇 Unmute' : '🎙 Mute'}</button>` : ''}
                ${lv.status !== 'ended' ? `<button class="${lv.speaker ? 'on' : ''}" id="fdd-speaker" onclick="fddSpeaker()" title="Speakerphone: louder, for a room or a Google Meet">${lv.speaker ? '🔊 Speaker on' : '🔈 Speaker'}</button>` : ''}
                ${lv.status === 'live' ? `<button class="hang" onclick="fddHangUp()">✆ Hang up</button>` : ''}</div>
            ${lv.note ? `<div class="note">${esc(lv.note)}</div>` : ''}
            ${lv.speaker && lv.status !== 'ended' ? `<details class="meet" id="fdd-meet" ${lv.meetOpen ? 'open' : ''} ontoggle="fddMeetOpen(this.open)"><summary>🔊 Speakerphone is on · showing this call in Google Meet</summary>
                <ol><li>In Meet, click <b>Present now → A tab</b> (or <b>Share screen → Chrome tab</b>) and pick this CMS tab.</li>
                <li>Turn on <b>Also share tab audio</b>, then <b>Share</b>. The class hears the caller.</li>
                <li>Keep your Meet microphone on, so the class hears you too.</li></ol>
                <p>On speakerphone your microphone pauses while the caller talks (so the caller doesn't hear its own voice and cut in). Wait for them to finish, then answer.</p></details>` : ''}
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
        const box = $id('fdd-res'), cur = pickCtx(); if (!box || !cur) return;
        const q = (cur.q || '').trim();
        if (q.length < 2) { box.innerHTML = '<p style="margin:4px 0 0;font-size:11.5px;color:#94a3b8">Type at least 2 characters.</p>'; return; }
        const hits = (window.mockSearch ? window.mockSearch(q) : []).slice(0, 12);
        const dup = [...new Set(hits.map(nameKey))].filter(k => hits.filter(c => nameKey(c) === k).length > 1);
        const warn = dup.length ? `<p class="fdd-dup">⚠ More than one file is named ${dup.map(k => `<b>${esc(hits.find(c => nameKey(c) === k).client.name)}</b>`).join(' and ')}. Match the date of the accident (DOL) and the date of birth before you open one.</p>` : '';
        box.innerHTML = hits.length ? warn + hits.map(c => `<div class="fdd-row ${cur.selected === c.id ? 'sel' : ''}" onclick="fddPick('${c.id}')"><span class="id">${c.id}</span><span class="nm">${esc(c.client.name)}<br><span class="mt">DOL <b>${esc(c.dateOfLoss)}</b> · DOB ${esc(c.client.dob)} · ${esc(c.caseNumber || '')} · ${esc(c.caseType === 'Others' ? c.caseTypeOther : c.caseType)} · ${esc(c.phase)}</span></span></div>`).join('')
            : '<p style="margin:4px 0 0;font-size:11.5px;color:#94a3b8">No cases match.</p>';
    }

    /* ---------- reception call scripts (Admins: the Caller scenarios panel) ----------
       A trainer runs a mock call by playing the caller: what they open with, what they
       answer when asked for each identifier (wrong answers included), how to stay in
       character; then what a ready receptionist says, the key, and a scoring checklist. */
    const ACTOR = {
        client: 'You\'re the client. Friendly and cooperative: give your details when you\'re asked, and you want a real answer to your question.',
        authorized: 'You\'re calling for the client and the file lists you as allowed (a signed authorization, a power of attorney, the estate). Give your details when asked; you expect an answer.',
        failed: 'You can only give the details below, and some are missing or don\'t match the file. If they can\'t verify you, push back once ("Come on, it\'s me"), then accept a callback to the number on file or a message.',
        unauthorized: 'You\'re NOT on the file. Push once or twice ("I\'m family, I have a right to know"), politely but firmly. If they hold the line kindly, leave a message. Never get abusive.',
        business: 'You\'re calling for a company. Professional and brief: give your name, company, claim or reference number and callback number. You don\'t have the client\'s personal details.',
        newcaller: 'You\'re not a client yet. You were hurt and want to know if the firm can help. Answer questions about what happened simply; you expect intake or a callback.'
    };
    const SCRIPT_ASKS = [['name', 'Full name'], ['dob', 'Date of birth'], ['address', 'Address'], ['ssn4', 'Last 4 of SSN'], ['callback', 'Callback number'], ['relationship', 'Relationship to the client'], ['dol', 'Date of the accident']];
    function verifyLine(c) {
        const same = c.mock && sameNameCount(c.mock) > 1 ? ' And what was the date of the accident?' : '';
        if (c.auth === 'unauthorized') return 'May I have your full name, and your relationship to the person you\'re calling about?';
        if (c.auth === 'business') return 'May I have your name, your company, the claim or reference number, and a good callback number?';
        if (c.auth === 'newcaller') return 'May I have your full name and a good callback number? And can you tell me briefly what happened, and when?';
        if (c.auth === 'authorized') return 'May I have your full name and your relationship to the client? And to verify the file, the client\'s date of birth and their address or the last 4 of their Social Security number?' + same;
        return 'Before I look into that, may I have your full name, your date of birth, and your address or the last 4 of your Social Security number?' + same;
    }
    function scriptHTML(c) {
        const k = caseOf(c.mock), g = c.gives || {};
        const val = (key) => { const v = key === 'dol' && g.dol == null && k ? k.dateOfLoss : g[key]; return v == null || String(v).trim() === '' ? null : String(v); };
        const none = c.auth === 'business' ? 'I\'m calling for the company; I don\'t have that.' : 'I don\'t know / I\'d rather not say.';
        const lvl = { 1: 'Level 1 · warm-up', 2: 'Level 2', 3: 'Level 3 · tricky' }[c.level] || '';
        return `<div class="fdd-script" data-call="${esc(c.id)}">
            <div class="sh"><b>📜 ${esc(c.id)} · ${esc(g.name || 'Caller')}</b><span>${esc(lvl)}${c.voice ? ' · ' + (c.voice === 'f' ? 'female' : 'male') + ' caller' : ''}</span></div>
            <div class="sb">
            <h5>You play the caller · calls from ${esc(callerId(c))}</h5>
            <div class="say">“${esc(unquote(c.opening))}”</div>
            <h5>If the receptionist asks for…</h5>
            <table>${SCRIPT_ASKS.map(([key, l]) => `<tr><td>${l}</td><td>${esc(val(key) || none)}</td></tr>`).join('')}</table>
            <h5>Stay in character</h5><div>${esc(ACTOR[c.auth] || '')} Don't volunteer details; answer what you're asked. Hang up once you have your answer, a next step, or a message is taken.</div>
            <h5>A ready receptionist</h5>
            <div class="rsay">1. “Thank you for calling ${esc(firmName())}, this is [name]. How may I help you?”</div>
            <div class="rsay">2. ${c.mock ? 'Finds the file (search by name, DOB, phone, case number, claim #…) and asks: ' : ''}“${esc(verifyLine(c))}”</div>
            <div class="rsay">3. Decides: <b>${esc(authLabel(c.auth))}</b></div>
            <div class="rsay">4. ${esc(c.actions[c.answer])}</div>
            <div class="rsay">5. Confirms the callback number and any message, then: “Is there anything else I can help you with? Thank you for calling.”</div>
            <h5>Key</h5>
            <div class="skey">${k ? `<b>File:</b> ${esc(k.id)} · ${esc(k.client.name)} · ${esc(k.caseNumber || '')} · DOL ${esc(k.dateOfLoss)}<br>` : '<b>File:</b> none, not in the system (a potential new client)<br>'}
                <b>Why:</b> ${esc(c.why)}${k && k.reception ? `<br><b>On file:</b> ${esc(k.reception.verify)}` : ''}</div>
            <h5>Score it (100)</h5>
            <ul><li>Found the right file (or knew there's none): 30</li><li>Right verification decision: 30</li><li>Asked for ${esc(needFor(c))}: 10</li><li>Handled it as above, shared nothing they shouldn't, closed well: 30</li></ul>
            </div></div>`;
    }
    // A ready script for one of a library file's own caller scenarios (reception.calls): the
    // file's verify rule and model handling, with the lines a ready receptionist says.
    function scenarioScriptHTML(k, s, i) {
        const r = k.reception || {}, cl = k.client || {};
        const who = unquote(s.from).split(/[,(]/)[0].trim();
        const isClient = /\(client\)/i.test(s.from) || who === cl.name;
        const quoted = /^\s*["“]/.test(s.ask || '');
        const ssn4 = (String(cl.ssn || '').match(/(\d{4})\s*$/) || [])[1];
        // Same client name on another file: the date of the accident tells them apart, or (same accident) the date of birth or case number.
        const twins = (window.MOCK_CASES || []).filter(x => x.id !== k.id && nameKey(x) === nameKey(k)), same = twins.length > 0;
        const sameAsk = !same ? '' : twins.some(x => x.dateOfLoss === k.dateOfLoss)
            ? ' The same name, address and accident are on another file: the date of birth or the case number decides which file.'
            : ' Same name on more than one file: “And what was the date of the accident?”';
        const caller = isClient
            ? `You're the client. When they ask, verify with the file's details:<table>
                <tr><td>Full name</td><td>${esc(cl.name)}</td></tr><tr><td>Date of birth</td><td>${esc(cl.dob || '')}</td></tr>
                <tr><td>Address</td><td>${esc(cl.address || '')}</td></tr>${ssn4 ? `<tr><td>Last 4 of SSN</td><td>${esc(ssn4)}</td></tr>` : ''}
                ${same ? `<tr><td>Date of the accident</td><td>${esc(k.dateOfLoss || '')}</td></tr>` : ''}</table>
                Friendly and cooperative; you want a real answer. Don't volunteer details; answer what you're asked.`
            : 'Give your name, who you are to the client (or your company) and a callback number when asked. You don\'t have the client\'s date of birth or Social Security number, unless the file authorizes you (see On file below: then answer from it). If they won\'t help, push back once, then accept a message. Never get abusive.';
        return `<div class="fdd-script" data-scenario="${esc(k.id)}-${i + 1}">
            <div class="sh"><b>📜 ${esc(k.id)} · caller scenario ${i + 1}</b><span>${esc(isClient ? 'client' : 'caller')}</span></div>
            <div class="sb">
            <h5>You play the caller · ${esc(unquote(s.from))}</h5>
            <div class="say">${quoted ? `“${esc(unquote(s.ask))}”` : `(In your own words) ${esc(s.ask)}`}</div>
            <div>${caller}</div>
            <h5>A ready receptionist</h5>
            <div class="rsay">1. “Thank you for calling ${esc(firmName())}, this is [name]. How may I help you?”</div>
            <div class="rsay">2. “May I have your full name and a good callback number, in case we get disconnected? And who are you calling about?”</div>
            <div class="rsay">3. Before sharing anything. The client, or someone the file authorizes: “May I have ${isClient ? 'your' : 'the client\'s'} date of birth, and the address on file or the last 4 of the Social Security number?”${sameAsk} Anyone else: share nothing about the case, not even that it's a client.</div>
            <div class="rsay">4. ${esc(s.handle)}</div>
            <div class="rsay">5. Reads back the callback number and any message, then: “Is there anything else I can help you with? Thank you for calling.”</div>
            <h5>Key</h5>
            <div class="skey"><b>File:</b> ${esc(k.id)} · ${esc(cl.name)} · ${esc(k.caseNumber || '')} · DOL ${esc(k.dateOfLoss || '')}<br><b>On file:</b> ${esc(r.verify || '')}</div>
            </div></div>`;
    }
    // One caller scenario's script (Caller scenarios panel, Admins).
    window.fddScenarioScript = function (mockId, i) {
        const k = caseOf(mockId), s = k && k.reception && k.reception.calls[i];
        return s ? scenarioScriptHTML(k, s, i) : '';
    };
    // The simulator callers' scripts for one library case (or all of them).
    window.fddCallScripts = function (mockId) {
        const calls = (window.DRILL_CALLS || []).filter(d => mockId ? d.mock === mockId : true);
        return calls.map(scriptHTML).join('');
    };
    // Printable page of the scripts: one file's (its caller scenarios and simulator callers), or every simulator caller.
    window.fddPrintScripts = function (mockId) {
        const k = mockId && caseOf(mockId);
        const title = k ? `Reception call scripts · ${k.id} ${k.client.name}` : 'Reception call scripts · all simulator callers';
        const body = k ? ((k.reception && k.reception.calls) || []).map((s, i) => scenarioScriptHTML(k, s, i)).join('') + window.fddCallScripts(mockId)
            : window.fddCallScripts();
        const w = window.open('', '_blank');
        if (!w) { if (typeof showToast === 'function') showToast('Allow pop-ups for this site to print the scripts.', 'error'); return; }
        w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css.textContent}
            body{font-family:Arial,sans-serif;margin:24px;color:#0f172a}h1{font-size:18px;margin:0 0 14px}.fdd-script{break-inside:avoid;page-break-inside:avoid}
            @media print{.fdd-script .sh{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head>
            <body><h1>${esc(title)}</h1>${body}</body></html>`);
        w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
    };

    // The identifiers the front desk has to ask this caller for (the 10 identifier points).
    function needFor(c) {
        const k = c.mock && caseOf(c.mock), same = c.mock ? sameNameCount(c.mock) : 0;
        return (PERSONAL.includes(c.auth) ? 'name, date of birth, and address or SSN last 4'
            : c.auth === 'unauthorized' ? 'their name and their relationship to the client' : 'their name and a callback number')
            + (same > 1 ? `, plus the date of the accident (${same} files are named ${k.client.name})` : '');
    }
    function feedbackHTML(entry, r) {
        const c = entry.call, k = c.mock && caseOf(c.mock);
        const cls = r.score >= 85 ? 'ok' : r.score >= 60 ? 'mid' : 'bad';
        const need = needFor(c);
        return `<div class="fdd-fb ${cls}"><div style="display:flex;justify-content:space-between;align-items:center"><b>${r.score}/100</b><span>⏱ ${fmtSec(r.secs)}</span></div>
            <div>${r.find ? '✓' : '✗'} <b>Find:</b> ${c.mock ? `${esc(c.mock)} · ${esc(k ? k.client.name : '')}${k ? ` (${esc(k.caseNumber || '')}, DOL ${esc(k.dateOfLoss)})` : ''}` : 'not in the system'}${r.find ? '' : ` (you picked ${esc(r.picked.selected)})`}</div>
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

    /* ---------- practice calls (no script) ---------- */
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const cut = (v, n) => String(v == null ? '' : v).slice(0, n);
    const firmName = () => String((window.MOCK_FIRM || {}).name || 'the law firm').replace(/\s*\(fictional\)\s*/i, '').trim();
    const unquote = (t) => String(t || '').trim().replace(/^["“]+|["”]+$/g, '').trim();
    const authLabel = (k) => (AUTH.find(a => a[0] === k) || [])[1] || '';
    const voice = () => window.CallVoice || null;
    const pcOn = () => !!(P && screen === 'practice' && !P.ended);
    // Standard-voice settings, remembered in this browser.
    const pcPref = (k, dflt) => { try { const v = localStorage.getItem('LSH_FDD_' + k + '_V1'); return v == null ? dflt : v === 'on'; } catch (e) { return dflt; } };
    const pcSetPref = (k, on) => { try { localStorage.setItem('LSH_FDD_' + k + '_V1', on ? 'on' : 'off'); } catch (e) {} };

    window.fddPracticeLevel = function (n, btn) {
        pcLevel = n;
        if (btn) btn.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
    };

    // The standard voice's caller: who they are and what they know, never the key's answer
    // or "why" (the caller can't hand the trainee the answer). Live voice builds its own
    // caller from the same call (functions/_live.js).
    const ROLE = {
        client: 'You are the client on this case (or, for a child\'s case, the parent or guardian who signed with the firm). You want a real answer to your question. When the receptionist asks you to confirm who you are, you give the details you know without fuss.',
        authorized: 'You are calling about someone else\'s case, and the client\'s file lists you as allowed to get information (a signed authorization, a power of attorney, or the estate\'s administrator). When the receptionist asks you to confirm who you are and who the client is, you give the details you know. You expect an answer.',
        failed: 'You say this is your case (or that you may speak for the client), but you can only give the details listed below, and some are missing or don\'t match what the firm has. If the receptionist says they can\'t verify you, push back once, then accept what they offer (a callback to the number on file, or a message).',
        unauthorized: 'You are NOT on the client\'s file as someone who may get information, but you feel you should be told (you are family, a friend, or similar). Push for an answer once or twice, politely but firmly. If the receptionist holds the line kindly, accept leaving a message. Never get abusive.',
        business: 'You are calling from a business (an insurance company, a medical provider, another law office, a vendor). You are professional and brief. When asked, you give your name, your company, any claim or reference number and your callback number. You don\'t know the client\'s personal details (date of birth, SSN, home address). You expect to be put through to the right person, or to leave a detailed message.',
        newcaller: 'You are not a client of this firm. You were hurt recently and are calling to ask whether the firm can help you. Answer questions about what happened simply. You expect to be put through to the intake team or to get a callback.'
    };
    const GIVES = [['name', 'Your name'], ['dob', 'A date of birth, if asked'], ['address', 'An address, if asked'], ['ssn4', 'Last 4 of the Social Security number, if asked'],
        ['callback', 'Your callback number'], ['relationship', 'Who you are to the client'], ['dol', 'The date of the accident, if asked']];
    function callerPrompt(c) {
        const k = caseOf(c.mock), g = c.gives || {};
        const val = (key) => key === 'dol' && g.dol == null && k ? k.dateOfLoss : g[key];
        const knows = GIVES.filter(([key]) => val(key) != null && String(val(key)).trim() !== '').map(([key, l]) => `- ${l}: ${val(key)}`).join('\n');
        const bg = k && PERSONAL.includes(c.auth) ? `\nBACKGROUND (what you know about the accident; use it to answer naturally, never recite it):\n${k.narrative}\n` : '';
        return `You are role-playing a caller phoning the front desk of ${firmName()}, a personal injury law firm. The person answering is a receptionist. Stay in character for the whole call.

WHO YOU ARE AND WHY YOU CALL
Why you're calling (say it in your own words once they greet you): "${unquote(c.opening)}"
${ROLE[c.auth] || ROLE.client}

WHAT YOU SAY WHEN ASKED (give each detail only when the receptionist asks for it, exactly as written here, even if it seems wrong; never correct it or add to it):
${knows || '- Your name: you\'d rather not say.'}
For anything not listed, say you don't know it or would rather not say.
${bg}
HOW TO TALK
- Talk like a real person on the phone: 1 to 3 short sentences per turn, plain spoken English. No lists, no stage directions, no narration, no quotation marks.
- Don't volunteer details before you're asked. Answer what the receptionist asks, then wait for them.
- Never say you are an AI, a computer, a simulation or a training exercise, and never coach the receptionist or tell them what they should do.
- If they put you on hold or look something up, just say something short like "Sure, I'll wait."
- If they tell you something that doesn't sound right for your case, react like a real caller (confused, ask them to check), but don't supply facts you weren't given.
- When the call has reached its natural end (you got your answer, left a message, or they said goodbye), say a short goodbye and put [END_CALL] at the very end of that line. If the receptionist is rude or hangs up on you, end the call the same way.

The call has just been answered. When the receptionist greets you, say why you're calling.`;
    }
    // The transcript as Gemini turns: it starts with the receptionist, and turns by the same side are joined.
    function apiMessages(l) {
        const out = [];
        l.msgs.filter(m => m.who !== 'sys').forEach(m => {
            const role = m.who === 'caller' ? 'model' : 'user';
            if (!out.length && role === 'model') out.push({ role: 'user', text: '(The receptionist picks up.)' });
            if (out.length && out[out.length - 1].role === role) out[out.length - 1].text += ' ' + m.text; else out.push({ role, text: m.text });
        });
        // The start of the call and the latest turns (the list always ends on the receptionist's line).
        return out.length > 41 ? [out[0], out[1], ...out.slice(-39)] : out;
    }
    const cleanLine = (t) => unquote(String(t || '').replace(/\[END_CALL\]/gi, ' ').replace(/\*[^*]*\*/g, ' ').replace(/^\s*(caller|client|me)\s*:\s*/i, '').replace(/\s+/g, ' '));

    // One request to /api/call-ai. retry: worth trying again (busy line, network).
    async function askAI(purpose, system, messages, json) {
        try {
            const res = await fetch('/api/call-ai', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ purpose, system, messages, json: !!json })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data && data.success && data.text) return { ok: true, text: String(data.text) };
            return { ok: false, retry: res.status === 429 || res.status >= 500, error: (data && data.error) || `Error ${res.status}.` };
        } catch (e) { return { ok: false, retry: true, error: 'Connection problem.' }; }
    }
    // A busy line is retried 3 times (1.5 s, 3 s, 6 s). stale() → the call moved on; stop quietly.
    async function askWithRetry(purpose, system, messages, json, stale, onWait) {
        for (let attempt = 0; ; attempt++) {
            const r = await askAI(purpose, system, messages, json);
            if (stale()) return null;
            if (r.ok || !r.retry || attempt >= 3) return r;
            if (onWait) onWait(attempt + 1);
            await sleep([1500, 3000, 6000][attempt]);
            if (stale()) return null;
        }
    }

    function endPractice() {
        const l = P; P = null;
        if (l) { l.ended = l.ended || 'left'; l.req++; clearTimeout(l.kick); if (l.transport === 'live' && window.LiveCall) window.LiveCall.stop(); }
        if (window.LiveCall) window.LiveCall.stopRing();
        const V = voice(); if (V) V.stopAll();
    }

    window.fddPracticeStart = function () {
        const unsaved = typeof hasCaseContent === 'function' && hasCaseContent() && typeof currentCaseId !== 'undefined' && currentCaseId === null;
        if (unsaved && !confirm('The call opens case files in the editor, which clears the unsaved case that\'s there now. Start anyway?')) return;
        const box = $id('fdd-live'); if (box) window.fddSetLive(box.checked);
        const all = window.DRILL_CALLS || [];
        const pool = all.filter(c => !pcLevel || c.level === pcLevel);
        let choices = pool.filter(c => !pcRecent.includes(c.id)); if (!choices.length) choices = pool.length ? pool : all;
        const call = choices[Math.floor(Math.random() * choices.length)];
        if (!call) return;
        pcRecent = [call.id, ...pcRecent].slice(0, Math.max(0, Math.min(8, pool.length - 1)));
        const V = voice();
        hangUp(); stopTimer(); D = null; endPractice();
        P = { call, transport: liveOK() && livePref() && Date.now() > pcLiveOff ? 'live' : 'standard', answered: false, t0: null, t1: null, msgs: [],
            speak: !!(V && V.canSpeak && pcPref('SPEAK', true)), hands: !!(V && V.canListen && pcPref('HANDS', false)),
            selected: null, q: '', auth: null, note: '', draft: '', busy: false, closing: false, ended: false, req: 0, muted: false,
            status: 'Incoming call… press 📞 Answer.', warn: false, voiceNote: '', program: (window.lshProgram && window.lshProgram()) || '' };
        document.body.classList.add('fdd-on');
        if (typeof closeCallsPanel === 'function') closeCallsPanel();
        screen = 'practice'; paint();
        if (window.LiveCall) window.LiveCall.ring(3);
    };

    // Answer: the call connects; the caller waits for the trainee's greeting (and says "Hello?" if there's none).
    window.fddPracticeAnswer = function () {
        const my = P; if (!pcOn() || my.answered) return;
        my.answered = true; my.t0 = Date.now(); startTimer();
        if (window.LiveCall) window.LiveCall.stopRing();
        if (my.transport === 'live') startLive(my);
        else {
            const V = voice(); if (V && my.speak) V.unlock();
            if (liveOK() && livePref() && pcLiveWhy) my.voiceNote = `🎙 ${pcLiveWhy} This call uses the standard voice: type your reply${V && V.canListen ? ' or press 🎙 Talk' : ''}.`;
            pcStatus('Connected. Greet the caller the way you answer the firm\'s phone.');
            my.kick = setTimeout(() => { if (P === my && !my.ended && !my.msgs.length && !my.busy) callerSays('Hello?', false); }, 6000);
        }
        pcIdCard(); pcControls(); pcTr();
        const b = $id('fdd-pc-in'); if (b) b.focus({ preventScroll: true });
    };

    // Live voice (live-call.js): the caller hears the trainee and talks back. If it can't start,
    // is busy, or drops, the call carries on with the standard voice, transcript and all.
    function startLive(my) {
        pcStatus('Connecting… allow the microphone if the browser asks.');
        my.speakerOn = speakerPref();
        window.LiveCall.start({
            callId: my.call.id, speaker: my.speakerOn,
            onState: (st) => {
                if (P !== my || my.ended || my.transport !== 'live') return;
                if (st === 'live') { my.liveUp = my.usedLive = true; pcStatus(liveTalkHint(my)); pcControls(); }
                else if (st === 'ended') toStandard(my, 'The live line closed.');
            },
            onLine: (role, text, id) => {
                if (P !== my || my.ended || my.transport !== 'live') return;
                const m = my.msgs.find(x => x.id === id);
                if (m) m.text = text; else my.msgs.push({ who: role === 'you' ? 'you' : 'caller', text, id });
                pcTr();
            },
            onNotice: (msg) => { if (P === my && !my.ended && my.transport === 'live') pcStatus(msg, true); },
            onError: (msg, code) => {
                if (P !== my || my.ended || my.transport !== 'live') return;
                if (code === 'TIME') return pcEnd('time');   // the call's time limit (LIVE_MAX_MINUTES)
                toStandard(my, msg, code);
            }
        });
    }
    // The live voice messages end with what the drill does ("This call runs as text…"); a practice call goes on with the standard voice instead.
    const textless = (m) => String(m).replace(/[;,]?\s*(?:so\s+)?(?:this call|the drill|the call)\s+runs as text[^.]*\.?/gi, '.').replace(/\s*,?\s*or run (?:it|this call) as text/gi, '').replace(/\.{2,}/g, '.').replace(/\s+\./g, '.').trim();
    function toStandard(my, why, code) {
        my.transport = 'standard'; my.liveUp = false;
        if (window.LiveCall && window.LiveCall.active()) window.LiveCall.stop();
        why = code === 'DROPPED' ? (/busy/i.test(why) ? 'The live voice service got busy.' : 'The live line dropped.') : textless(why || 'Live voice isn\'t available.');
        // Not set up, no microphone, the day's live minutes used up, a refused region: not again
        // this visit. Busy or dropped: the next practice call tries live voice again.
        const off = ['NOT_CONFIGURED', 'NO_MODEL', 'MIC', 'BUDGET', 'REGION'].includes(code);
        pcLiveWhy = off ? why : ''; pcLiveOff = off ? Infinity : 0;
        my.voiceNote = `🎙 ${why} The call goes on with the standard voice: type your reply${voice() && voice().canListen ? ' or press 🎙 Talk' : ''}.`;
        const V = voice(); if (V && my.speak) V.unlock();
        pcStatus(my.msgs.length ? 'Your turn.' : 'Greet the caller the way you answer the firm\'s phone.');
        pcControls(); pcTr();
    }

    function yourTurn() {
        const l = P; if (!l || l.ended) return;
        const V = voice();
        pcStatus(`Your turn: ${V && V.canListen ? 'press 🎙 Talk or type' : 'type'} your reply (Enter sends).`);
        pcControls();
        if (l.hands) pcListen();
        else { const b = $id('fdd-pc-in'); if (b && document.activeElement !== b && $id('fdd-panel').classList.contains('open')) b.focus({ preventScroll: true }); }
    }
    // The caller's line out loud (standard voice, speaker on). then() runs when they finish.
    function sayAloud(text, then) {
        const my = P; let fired = false;
        const fin = () => { if (fired) return; fired = true; if (my.afterSpeak === fin) my.afterSpeak = null; if (P === my && then) then(); };
        my.afterSpeak = fin;
        const V = voice();
        if (!my.speak || !V || !V.canSpeak) return fin();
        pcStatus('The caller is talking…');
        V.speak(text, { gender: my.call.voice, name: (my.call.gives || {}).name, onDone: fin,
            onNoVoice: () => { if (P === my && !my.noVoice) { my.noVoice = true; my.speak = false; pcControls(); } } });
    }
    function callerSays(text, end) {
        const my = P;
        my.msgs.push({ who: 'caller', text }); pcTr();
        if (end) my.closing = true;
        sayAloud(text, () => { if (P !== my || my.ended) return; if (end) return pcEnd('caller'); yourTurn(); });
    }

    window.fddPracticeSend = async function () {
        const my = P; if (!pcOn() || !my.answered || my.busy || my.closing) return;
        const box = $id('fdd-pc-in');
        const text = cut(box ? box.value : '', 1000).trim();
        if (!text) return;
        if (my.transport === 'live') {   // typed into the live call
            if (!window.LiveCall.sendText(text)) { pcStatus('Still connecting… send it again in a moment.', true); return; }
            if (box) box.value = ''; my.draft = ''; return;
        }
        if (box) box.value = ''; my.draft = '';
        clearTimeout(my.kick);
        const V = voice(); if (V) { V.stopSpeaking(); V.stopListening(); }
        my.afterSpeak = null;
        my.msgs.push({ who: 'you', text });
        my.busy = true; pcTr(); pcStatus(''); pcControls();
        const reqNo = ++my.req;
        const r = await askWithRetry('caller', callerPrompt(my.call), apiMessages(my), false,
            () => P !== my || my.ended || my.req !== reqNo,
            (n) => pcStatus(`The line is busy… retrying (${n} of 3).`, true));
        if (!r) return;
        my.busy = false;
        if (!r.ok) {
            my.msgs.pop(); pcTr();
            const b = $id('fdd-pc-in'); if (b && !b.value) { b.value = text; my.draft = text; }
            pcStatus(`⚠ The caller didn't come through: ${r.error} Your line is back in the box. Send it again.`, true);
            pcControls(); return;
        }
        const end = /\[END_CALL\]/i.test(r.text);
        pcControls();
        callerSays(cleanLine(r.text) || (end ? 'Okay. Bye.' : '…'), end);
    };
    window.fddPracticeKey = function (e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); fddPracticeSend(); }
    };
    window.fddPracticeInput = function (el) {
        if (P) P.draft = el.value;
        const V = voice(); if (V && V.isListening()) { V.stopListening(); pcControls(); }   // typing takes over from the microphone
    };

    // Standard voice: the trainee's reply by microphone (Chrome/Edge), sent when they pause.
    function pcListen() {
        const my = P, V = voice();
        if (!pcOn() || my.transport !== 'standard' || my.busy || my.closing || !V || !V.canListen) return;
        const box = $id('fdd-pc-in'); const before = box ? box.value.trim() : '';
        const ok = V.listen({
            onText: (t) => { const b = $id('fdd-pc-in'); if (b && P === my) { b.value = (before ? before + ' ' : '') + t; my.draft = b.value; } },
            onEnd: (t) => {
                if (P !== my || my.ended) return;
                pcControls();
                const b = $id('fdd-pc-in');
                if (t && b && b.value.trim()) fddPracticeSend();
                else pcStatus('Didn\'t catch that. Press 🎙 Talk to try again, or type.');
            },
            onBlocked: () => { if (P === my) { my.hands = false; pcStatus('The microphone is blocked. Allow it in the browser\'s address bar, or type your reply.', true); pcControls(); } }
        });
        if (ok) { pcStatus('🎙 Listening… speak now (it sends when you pause).'); pcControls(); }
    }
    window.fddPracticeTalk = function () {
        const V = voice(); if (!pcOn() || !V || P.transport !== 'standard') return;
        if (V.isListening()) { V.stopListening(true); return; }
        if (P.afterSpeak) { V.stopSpeaking(); P.afterSpeak = null; }   // talking over the caller
        pcListen();
    };
    window.fddPracticeHands = function () {
        const V = voice(); if (!P || !V || !V.canListen) return;
        P.hands = !P.hands; pcSetPref('HANDS', P.hands);
        if (!P.hands) V.stopListening();
        else if (pcOn() && P.answered && !P.busy && !P.afterSpeak && !V.isListening()) pcListen();
        pcControls();
    };
    window.fddPracticeSpeaker = function () {
        const V = voice(); if (!P || !V || !V.canSpeak) return;
        P.speak = !P.speak; P.noVoice = false; pcSetPref('SPEAK', P.speak);
        if (P.speak) V.unlock(); else { V.stopSpeaking(); const f = P.afterSpeak; if (f) f(); }
        pcControls();
    };
    window.fddPracticeReplay = function () {
        const V = voice(); if (!pcOn() || P.busy || !V || !V.canSpeak) return;
        const last = [...P.msgs].reverse().find(m => m.who === 'caller'); if (!last) return;
        const pending = P.afterSpeak; V.stopSpeaking(); V.stopListening(); P.afterSpeak = null;
        const was = P.speak; P.speak = true;
        sayAloud(last.text, pending || yourTurn);
        P.speak = was;
    };
    const liveTalkHint = (l) => l.speakerOn ? 'On the call, on speakerphone: let the caller finish, then answer. You can also type.' : 'On the call: talk normally, the caller hears you. You can also type.';
    // Speakerphone on live voice (the drill's setting, remembered): louder, for a room or a Google Meet.
    window.fddPracticeSpeakerphone = function () {
        if (!pcOn() || P.transport !== 'live' || !window.LiveCall) return;
        P.speakerOn = !P.speakerOn;
        if (window.LiveCall.active()) window.LiveCall.setSpeaker(P.speakerOn);
        try { localStorage.setItem(SPEAKER_KEY, P.speakerOn ? 'on' : 'off'); } catch (e) {}
        if (P.liveUp) pcStatus(liveTalkHint(P));
        pcControls();
    };
    window.fddPracticeMute = function () {
        if (!pcOn() || P.transport !== 'live' || !window.LiveCall) return;
        P.muted = window.LiveCall.setMuted(!P.muted); pcControls();
    };
    window.fddPracticeHangUp = function () {
        if (!pcOn()) return;
        if (!P.msgs.some(m => m.who === 'you')) {
            if (!confirm('Hang up without saying anything? This call won\'t be scored.')) return;
            return fddHome();
        }
        pcEnd('you');
    };
    function pcEnd(by) {
        const l = P; if (!l || l.ended) return;
        l.ended = by; l.t1 = Date.now(); l.req++; l.busy = false; l.afterSpeak = null; clearTimeout(l.kick);
        stopTimer();
        if (l.transport === 'live' && window.LiveCall) window.LiveCall.stop();
        const V = voice(); if (V) V.stopAll();
        l.msgs.push({ who: 'sys', text: by === 'caller' ? 'The caller hung up.' : by === 'time' ? 'The call reached its time limit.' : 'You ended the call.' });
        screen = 'pcwrap'; paint(); fddRestore();
        const b = $id('fdd-panel').querySelector('.fdd-b'); if (b) b.scrollTop = 0;
    }

    /* practice: partial updates, so typing, the search box and scrolling survive */
    function pcStatus(text, warn) {
        if (!P) return; P.status = text; P.warn = !!warn;
        const el = $id('fdd-pc-status'); if (el) { el.textContent = text; el.classList.toggle('warn', !!warn); }
    }
    const trHTML = (msgs) => msgs.map(m => `<div class="fdd-msg ${m.who === 'caller' ? 'c' : m.who === 'you' ? 'y' : 's'}">${esc(m.text)}</div>`).join('');
    function pcTr() {
        const box = $id('fdd-pc-tr'); if (!box || !P) return;
        box.innerHTML = trHTML(P.msgs) + (P.busy ? '<div class="fdd-msg c typing">…</div>' : '')
            + (!P.msgs.length ? `<div class="fdd-msg s">${P.answered ? 'The caller is on the line. Greet them.' : 'Ringing…'}</div>` : '');
        box.scrollTop = box.scrollHeight;
    }
    // What the phone shows: the number the caller gives as their callback, when it is one.
    const callerId = (c) => (String((c.gives || {}).callback || '').match(/\(?\d{3}\)?[\s.-]*\d{3}-\d{4}/) || [])[0] || 'Unknown number';
    function pcIdCard() {
        const el = $id('fdd-pc-id'); if (!el || !P) return;
        const ringing = !P.answered;
        el.className = 'fdd-pc-id' + (ringing ? ' ringing' : '');
        el.innerHTML = `<div class="av">${ringing ? '📞' : '👤'}</div><div class="who"><b>${ringing ? 'Incoming call…' : 'On the line'}</b><span>Caller ID: ${esc(callerId(P.call))}${P.answered ? ` · ${P.transport === 'live' ? '🎙 live voice' : 'standard voice'}` : ''}</span></div>
            ${ringing ? '<button class="answer" onclick="fddPracticeAnswer()">📞 Answer</button>' : ''}`;
    }
    function pcControls() {
        const el = $id('fdd-pc-ctl'), l = P; if (!el || !l) return;
        const V = voice() || {}, on = pcOn() && l.answered, can = on && !l.busy && !l.closing;
        const std = l.transport === 'standard', listening = std && V.isListening && V.isListening();
        const send = $id('fdd-pc-send'); if (send) send.disabled = !can;
        const box = $id('fdd-pc-in'); if (box) box.disabled = !on;
        el.innerHTML = (!std ? `<button class="${l.muted ? 'rec' : ''}" onclick="fddPracticeMute()" ${on ? '' : 'disabled'}>${l.muted ? '🔇 Unmute' : '🎙 Mute'}</button>
                <button class="${l.speakerOn ? 'on' : ''}" onclick="fddPracticeSpeakerphone()" ${on ? '' : 'disabled'} title="Speakerphone: louder, for a room or a Google Meet (share this tab with its audio)">${l.speakerOn ? '🔊 Speakerphone on' : '🔈 Speakerphone'}</button>` : '')
            + (std && V.canListen ? `<button id="fdd-pc-talk" class="${listening ? 'rec' : ''}" onclick="fddPracticeTalk()" ${can ? '' : 'disabled'}>${listening ? '■ Done talking' : '🎙 Talk'}</button>
                <button class="${l.hands ? 'on' : ''}" onclick="fddPracticeHands()" title="Listen for your reply after the caller speaks">🔁 Hands-free ${l.hands ? 'on' : 'off'}</button>` : '')
            + (std && V.canSpeak ? `<button class="${l.speak ? 'on' : ''}" onclick="fddPracticeSpeaker()" title="Read the caller's lines out loud">${l.speak ? '🔊 Voice on' : '🔇 Voice off'}</button>
                <button onclick="fddPracticeReplay()" ${on && !l.busy && l.msgs.some(m => m.who === 'caller') ? '' : 'disabled'} title="Hear the caller's last line again">↻ Replay</button>` : '')
            + (l.voiceNote ? `<div class="fdd-pc-note">${esc(l.voiceNote)}</div>` : '')
            + (std && l.noVoice ? `<div class="fdd-pc-note">This computer has no voice for the caller: read their lines.</div>` : '');
    }
    function pcPick() {
        const el = $id('fdd-pick-line'), l = P; if (!l) return;
        if (el) el.innerHTML = pickLine(l.selected);
        const none = $id('fdd-none'); if (none) none.style.cssText = l.selected === 'none' ? 'margin-top:6px;background:#ecfdf5;border-color:#10b981' : 'margin-top:6px';
        paintResults(); pcWrapButton();
    }
    function pickLine(sel) {
        if (!sel) return 'No file opened yet.';
        if (sel === 'none') return '✓ You marked this caller as <b>not in the system</b>.';
        const k = caseOf(sel);
        return `✓ Opened <b>${esc(sel)}</b>${k ? ` · ${esc(k.client.name)} · ${esc(k.caseNumber || '')} · DOL ${esc(k.dateOfLoss)}` : ''} (view only). Use <b>▭ Case</b> to read it.`;
    }
    function findHTML(l, title) {
        return `<div class="fdd-sec"><h4>${title}</h4>
            <input class="fdd-search" id="fdd-pc-q" placeholder="Search name, case number, DOL, DOB, phone, claim #, plate…" value="${esc(l.q)}" oninput="fddSearch(this.value)">
            <div class="fdd-res" id="fdd-res"></div>
            <button class="fdd-chip" id="fdd-none" style="margin-top:6px;${l.selected === 'none' ? 'background:#ecfdf5;border-color:#10b981' : ''}" onclick="fddPick('none')">No matching case on file</button>
            <p id="fdd-pick-line" style="margin:6px 0 0;font-size:11.5px;color:#475569">${pickLine(l.selected)}</p></div>`;
    }
    function directoryHTML() {
        const F = window.MOCK_FIRM || {};
        return `<details class="fdd-sec fdd-dir"><summary>☎ Firm directory and front-desk rules</summary>
            <ul>${(F.directory || []).map(d => `<li><b>${esc(d.name)}</b>, ${esc(d.role)} · ext ${esc(d.ext)}</li>`).join('')}</ul>
            <ul>${(F.rules || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul></details>`;
    }

    function practiceHTML() {
        const l = P;
        return `<div id="fdd-pc-id"></div>
            <p id="fdd-pc-status" class="${l.warn ? 'warn' : ''}">${esc(l.status)}</p>
            <div class="fdd-sec" style="padding:8px 10px"><div class="fdd-tx" id="fdd-pc-tr"></div>
              <div class="fdd-comp"><textarea id="fdd-pc-in" maxlength="1000" placeholder="Type what you say to the caller…" onkeydown="fddPracticeKey(event)" oninput="fddPracticeInput(this)"></textarea>
                <button class="send" id="fdd-pc-send" onclick="fddPracticeSend()" disabled>Send</button></div>
              <div class="fdd-ctl" id="fdd-pc-ctl"></div></div>
            <button class="fdd-hang" onclick="fddPracticeHangUp()">✆ Hang up</button>
            ${findHTML(l, 'Find the file')}
            ${directoryHTML()}`;
    }

    function pcWrapHTML() {
        const l = P, secs = Math.round(((l.t1 || Date.now()) - (l.t0 || Date.now())) / 1000);
        return `<div class="fdd-fb mid" style="margin-bottom:10px"><b>${l.ended === 'caller' ? 'The caller hung up.' : l.ended === 'time' ? 'The call reached its time limit.' : 'Call ended.'}</b> ⏱ ${fmtSec(secs)}. Wrap it up the way you would at the desk, then get your debrief.</div>
            ${findHTML(l, '1 · Which file was this call about?')}
            <div class="fdd-sec"><h4>2 · Authentication: who was the caller?</h4>${AUTH.map(([k, lab]) => `<label class="fdd-opt"><input type="radio" name="fdd-auth" value="${k}" ${l.auth === k ? 'checked' : ''} onchange="fddPracticeAuth(this.value)"><span>${esc(lab)}</span></label>`).join('')}</div>
            <div class="fdd-sec"><h4>3 · Call note (optional)</h4><textarea class="fdd-note" id="fdd-pc-note" maxlength="1500" placeholder="Who called, what they wanted, what you told them or the message you took, and who it goes to." oninput="fddPracticeNote(this.value)">${esc(l.note)}</textarea></div>
            <button class="fdd-go alt" id="fdd-pc-go" onclick="fddPracticeReview()" ${l.selected && l.auth ? '' : 'disabled'}>Get my debrief →</button>
            <details class="fdd-sec" style="margin-top:10px"><summary style="cursor:pointer;font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b">Transcript</summary><div class="fdd-tx" style="max-height:none">${trHTML(l.msgs)}</div></details>`;
    }
    function pcWrapButton() { const b = $id('fdd-pc-go'); if (b && P) b.disabled = !(P.selected && P.auth); }
    window.fddPracticeAuth = function (v) { if (P) { P.auth = v; pcWrapButton(); } };
    window.fddPracticeNote = function (v) { if (P) P.note = cut(v, 1500); };

    const transcriptText = (l) => l.msgs.map(m => m.who === 'caller' ? `Caller: ${m.text}` : m.who === 'you' ? `Receptionist: ${m.text}` : `(${m.text})`).join('\n');
    const REVIEW_SYSTEM = 'You coach receptionists in training at a personal injury law firm. You review one practice phone call against the firm\'s front-desk rules and the answer key, and you reply with JSON only. Be specific and fair: refer to what the receptionist actually said. Judge only what is in the transcript and the wrap-up; the receptionist could not see the answer key. The transcript may come from speech recognition, so ignore small transcription slips. Write to the receptionist as "you". Never mention AI, models or prompts.';
    function reviewPrompt(l) {
        const c = l.call, k = caseOf(c.mock), F = window.MOCK_FIRM || {}, g = c.gives || {};
        const picked = l.selected === 'none' ? 'not in the system' : l.selected ? `${l.selected}${caseOf(l.selected) ? ' · ' + caseOf(l.selected).client.name : ''}` : 'none';
        return `FIRM FRONT-DESK RULES
${(F.rules || []).map(r => '- ' + r).join('\n')}

DIRECTORY
${(F.directory || []).map(d => `- ${d.name}, ${d.role}, ext ${d.ext}`).join('\n')}

ANSWER KEY FOR THIS CALL
Caller: ${g.name || 'unknown'}${g.relationship ? ` (${g.relationship})` : ''}
Caller's file: ${k ? `${k.id} · ${k.client.name} · case ${k.caseNumber || ''} · DOL ${k.dateOfLoss}` : 'none: the caller is not in the system'}
Correct authentication: ${authLabel(c.auth)}
${k && k.reception ? `On the file: ${k.reception.verify}\n` : ''}Identifiers the receptionist had to ask the caller for: ${needFor(c)}
The right way to handle it: ${c.actions[c.answer]}
Why: ${c.why}
Wrong ways (for reference): ${c.actions.filter((_, i) => i !== c.answer).join(' | ')}

TRANSCRIPT
${transcriptText(l)}

THE RECEPTIONIST'S WRAP-UP (after the call)
File they matched: ${picked}
Their authentication decision: ${authLabel(l.auth) || 'none'}
Their call note: ${l.note.trim() || '(none)'}

Reply with exactly this JSON:
{"askedIds": true or false, "idsNote": "", "handling": 0-100, "handlingNote": "", "breach": true or false, "breachNote": "", "verdict": "", "strengths": [""], "improve": [""], "betterLine": ""}
- askedIds: true only if, during the call, the receptionist asked the caller for every identifier listed in the key (asking counts even if the caller couldn't answer). idsNote: one sentence on what they asked for or missed.
- handling (0-100): how well they handled the call: reached the right outcome from the key; gave only correct information from the file; took a complete message (name, callback number, reason, who it's for) when one was needed; routed to the right person; stayed courteous and in control; closed the call clearly. 90-100: what a senior receptionist would do. 70-89: right outcome with small gaps. 40-69: partly right. Below 40: wrong outcome. handlingNote: 1-2 sentences.
- breach: true if the receptionist disclosed case information (even confirming the person is a client) to a caller who was not verified or not authorized, read an identifier out to the caller, or gave legal advice, a case value or a settlement opinion. breachNote: what was disclosed, or "".
- verdict: one sentence overall. strengths and improve: 1 to 3 short points each.
- betterLine: one thing they could have said, word for word, at the moment it mattered most.`;
    }
    function parseReview(text) {
        const t = String(text || '').replace(/```(?:json)?/gi, '');
        const a = t.indexOf('{'), b = t.lastIndexOf('}');
        if (a < 0 || b <= a) return null;
        let j; try { j = JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
        if (!j || typeof j !== 'object' || !isFinite(Number(j.handling))) return null;
        const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(x => cut(x, 300)).filter(Boolean).slice(0, 3);
        return { askedIds: j.askedIds === true || j.askedIds === 'true', idsNote: cut(j.idsNote, 400),
            handling: Math.max(0, Math.min(100, Math.round(Number(j.handling)))), handlingNote: cut(j.handlingNote, 600),
            breach: j.breach === true || j.breach === 'true', breachNote: cut(j.breachNote, 400), verdict: cut(j.verdict, 400),
            strengths: list(j.strengths), improve: list(j.improve), betterLine: cut(j.betterLine, 400) };
    }
    // find 30 and authenticate 30 against the key; identifiers 10 and handling 30 from the review.
    function pcScore(l) {
        const c = l.call, rv = l.review;
        const find = l.selected === (c.mock || 'none'), authOk = l.auth === c.auth, idsOk = rv.askedIds;
        const handling = rv.breach ? 0 : rv.handling;
        return { id: c.id, mock: c.mock, mode: 'practice', voice: l.usedLive ? 'live' : 'standard', find, authOk, idsOk, breach: rv.breach, handling,
            secs: Math.max(0, Math.round((l.t1 - l.t0) / 1000)),
            score: (find ? 30 : 0) + (authOk ? 30 : 0) + (idsOk ? 10 : 0) + Math.round(handling * 0.3) };
    }
    window.fddPracticeReview = async function () {
        const my = P; if (!my || !my.ended || !my.selected || !my.auth || my.reviewing) return;
        my.reviewing = true; my.reviewError = null; screen = 'pcdebrief'; paint();
        const r = await askWithRetry('review', REVIEW_SYSTEM, [{ role: 'user', text: reviewPrompt(my) }], true, () => P !== my);
        if (!r) return;
        my.reviewing = false;
        const rv = r.ok ? parseReview(r.text) : null;
        if (!rv) { my.reviewError = r.ok ? 'The review came back unreadable.' : r.error; paint(); return; }
        my.review = rv; my.result = pcScore(my); paint();
        const b = $id('fdd-panel').querySelector('.fdd-b'); if (b) b.scrollTop = 0;
        savePractice(my);
    };
    window.fddPracticeBackToWrap = function () { if (P && !P.review && !P.reviewing) { screen = 'pcwrap'; paint(); } };
    async function savePractice(l) {
        const r = l.result;
        const detail = Object.assign({}, r, { picked: { selected: l.selected, auth: l.auth }, turns: l.msgs.filter(m => m.who === 'you').length,
            note: cut(l.note, 1500), review: l.review, transcript: '' });
        const full = transcriptText(l);
        detail.transcript = full.length > 12000 ? '…' + full.slice(-12000) : full;
        while (JSON.stringify([detail]).length > 19000 && detail.transcript.length > 500) detail.transcript = '…' + detail.transcript.slice(-Math.floor(detail.transcript.length * 0.7));
        l.saved = 'saving'; paintSaved();
        try {
            const res = await fetch('/api/drill-results', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ mode: 'practice', program: l.program, calls: 1, details: [detail], score: r.score,
                    findPct: r.find ? 100 : 0, authPct: Math.round(((r.authOk ? 30 : 0) + (r.idsOk ? 10 : 0)) / 40 * 100), actionPct: r.handling, avgSeconds: r.secs })
            });
            const data = await res.json().catch(() => ({}));
            l.saved = data && data.success ? 'saved' : 'failed';
        } catch (e) { l.saved = 'failed'; }
        paintSaved(); loadHistory();
    }
    function paintSaved() {
        const el = $id('fdd-pc-saved'), l = P; if (!el || !l) return;
        el.style.color = l.saved === 'failed' ? '#b91c1c' : '#047857';
        el.textContent = l.saved === 'saving' ? 'Saving…' : l.saved === 'saved' ? '✓ Saved to your results (your trainer sees them too)' : l.saved === 'failed' ? 'Couldn\'t save this result. Check your connection.' : '';
    }

    function pcDebriefHTML() {
        const l = P, c = l.call, k = caseOf(c.mock);
        if (l.reviewing) return `<div class="fdd-sec" style="text-align:center;padding:26px 12px"><div style="font-size:26px">📝</div><b>Reviewing your call…</b><p style="margin:6px 0 0;color:#64748b;font-size:12px">This takes a few seconds.</p></div>`;
        if (!l.review) return `<div class="fdd-fb bad"><b>Couldn't get your debrief.</b> ${esc(l.reviewError || '')}</div>
            <button class="fdd-go alt" onclick="fddPracticeReview()">Try again</button><button class="fdd-go" onclick="fddPracticeBackToWrap()">← Back to the wrap-up</button>`;
        const r = l.result, rv = l.review, cls = r.score >= 85 ? 'ok' : r.score >= 60 ? 'mid' : 'bad';
        const li = (a) => a.length ? `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
        return `<div class="fdd-sec" style="text-align:center"><div class="fdd-score">${r.score}/100</div><div style="color:#64748b">Practice call · ⏱ ${fmtSec(r.secs)} · ${l.msgs.filter(m => m.who === 'you').length} replies</div>
                <div class="fdd-grid"><div><span>Find</span><b>${r.find ? 30 : 0}/30</b></div><div><span>Authenticate</span><b>${r.authOk ? 30 : 0}/30</b></div><div><span>Identifiers</span><b>${r.idsOk ? 10 : 0}/10</b></div><div><span>Handling</span><b>${Math.round(r.handling * 0.3)}/30</b></div></div>
                <div id="fdd-pc-saved" style="font-size:11.5px"></div></div>
            <div class="fdd-fb ${cls}">
                <div>${r.find ? '✓' : '✗'} <b>Find:</b> ${k ? `${esc(k.id)} · ${esc(k.client.name)} (${esc(k.caseNumber || '')}, DOL ${esc(k.dateOfLoss)})` : 'not in the system'}${r.find ? '' : ` (you picked ${esc(l.selected === 'none' ? 'not in the system' : l.selected)})`}</div>
                <div>${r.authOk ? '✓' : '✗'} <b>Authenticate:</b> ${esc(authLabel(c.auth))}${r.authOk ? '' : ` (you picked: ${esc(authLabel(l.auth))})`}</div>
                <div>${r.idsOk ? '✓' : '✗'} <b>Asked for:</b> ${esc(needFor(c))}. ${esc(rv.idsNote)}</div>
                <div>${rv.handling >= 70 && !rv.breach ? '✓' : '✗'} <b>Handling ${r.handling}/100:</b> ${esc(rv.handlingNote)}</div>
                ${rv.breach ? `<div class="fdd-breach">⚠ Disclosure: ${esc(rv.breachNote || 'information was shared that shouldn\'t have been')}. Handling scores 0.</div>` : ''}
                <div style="margin-top:6px"><b>The key:</b> ${esc(c.actions[c.answer])}</div>
                <div style="margin-top:3px;color:#334155">${esc(c.why)}</div>
                ${k && k.reception ? `<div style="margin-top:5px;color:#64748b;font-size:11.5px"><b>On file:</b> ${esc(k.reception.verify)}</div>` : ''}</div>
            <div class="fdd-sec fdd-rv"><h4>Debrief</h4>
                ${rv.verdict ? `<p style="margin:0 0 6px"><b>${esc(rv.verdict)}</b></p>` : ''}
                ${rv.strengths.length ? `<div style="font-weight:700;color:#047857">What went well</div>${li(rv.strengths)}` : ''}
                ${rv.improve.length ? `<div style="font-weight:700;color:#b45309">To work on</div>${li(rv.improve)}` : ''}
                ${rv.betterLine ? `<div class="better"><b>Try saying:</b> “${esc(rv.betterLine)}”</div>` : ''}</div>
            <details class="fdd-sec"><summary style="cursor:pointer;font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b">Transcript${l.note ? ' and your note' : ''}</summary>
                <div class="fdd-tx" style="max-height:none">${trHTML(l.msgs)}</div>${l.note ? `<p style="margin:6px 0 0;font-size:12px"><b>Your note:</b> ${esc(l.note)}</p>` : ''}</details>
            <button class="fdd-go alt" onclick="fddPracticeStart()">📞 Take another call</button>
            <button class="fdd-go" onclick="fddHome()">My results</button>
            <div id="fdd-pc-hist" style="margin-top:10px">${historyHTML()}</div>`;
    }

    // The sidebar button goes in after the Training Library button exists.
    const origApply = window.applySessionUI;
    if (typeof origApply === 'function') {
        window.applySessionUI = function () {
            const r = origApply.apply(this, arguments);
            buildUI();
            const signedIn = typeof hasAuthorizedAccess === 'function' && hasAuthorizedAccess();
            if (!signedIn && $id('fdd-panel')) { hangUp(); stopTimer(); D = null; endPractice(); screen = 'home'; document.body.classList.remove('fdd-on'); $id('fdd-panel').classList.remove('open'); }
            else if (signedIn && new URLSearchParams(location.search).get('drill') && !window.__fddOpened) { window.__fddOpened = true; setTimeout(openFrontDeskDrill, 80); }
            return r;
        };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI); else buildUI();
})();
