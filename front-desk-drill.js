/* =========================================================
   LSH CMS — CALL SIMULATOR (the front desk drill and the call lines)
   ---------------------------------------------------------
   Measures a receptionist's (or any VA's) front-desk ability on the
   Training Library cases. Each drill is a set of incoming calls, the
   same calls in the same order for everyone (DRILL_CALLS in
   mock-cases.js, eight to a set: Set 1 is D01-D08). For every call the
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

   PRACTICE CALLS (no script), the Core callers: DRILL_CALLS listed by
   level (D01, D02…); the trainee picks the caller, and the
   trainee takes the whole call in their own words. No answer choices,
   no identifier buttons. After hanging up they match the file (the
   search finds names that sound like what they typed), see whether the
   caller was fully authenticated (checked from the transcript: name,
   DOB, DOL and one more identifier on file), can write a call note,
   and get a debrief on the firm's RECEPTION MOCK CALL scorecard: 14
   items rated 0-5. Five are checked from the call itself (the opening
   spiel, authentication, the closing spiel, time management, dead air
   and fillers); the rest come from a review of the transcript against
   the key, the firm's rules and the reception SOP (/api/call-ai).
   Clarity of speech and tone of voice are rated only on spoken calls.
   If the review can't be had, the debrief still shows the five checked
   items and offers to try again. The call runs on live voice when it's on
   and working; otherwise, or when it's busy or drops, it goes on with
   the standard voice: the caller's lines come from /api/call-ai and are
   read out by the browser (call-voice.js), and the trainee types or
   talks. So a whole class can call at once, live voice spreads its
   calls over the keys (functions/api/live-call.js); the standard
   voice's lines and the debriefs take turns over every key, resting a
   key that hits its limit (functions/_ai.js); and a busy line is
   retried here with a back-off.

   CALL LINES (call-packs.js; see "CALL LINES" below): every other
   platform's Call Simulator opens this one (?calls=1, with &program= or
   &flow= and &line=). Standard Training's Reception, Calendar
   Management and Intake Mock Calls, Case Management, Property Damage
   and EA / PA, each line with Practice and Graded calls, on the same
   phone (live voice or the standard voice) and graded on the call's
   goals and the note the line asks for.
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
    // Hard-to-say names (MOCK_NAME_SOUNDS in mock-cases.js). A call that names one also asks the
    // receptionist to get it spelled and read the spelling back with the NATO phonetic alphabet.
    const SPELL_ASKS = [['spell', 'Ask them to spell it'], ['nato', 'Read it back (NATO)']];
    const askLabel = (k) => (ASKS.concat(SPELL_ASKS).find(a => a[0] === k) || [])[1] || k;
    const NATO = { A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot', G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliett', K: 'Kilo', L: 'Lima', M: 'Mike',
        N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo', S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-ray', Y: 'Yankee', Z: 'Zulu' };
    const NATO_WORDS = /\b(alpha|alfa|bravo|charlie|delta|echo|foxtrot|golf|hotel|india|juliett?e?|kilo|lima|mike|november|oscar|papa|quebec|romeo|sierra|tango|uniform|victor|whiske?y|x-? ?ray|yankee|zulu)\b/gi;
    const sounds = () => window.MOCK_NAME_SOUNDS || {};
    // The hard names in a text, each once, in order.
    const hardWords = (text) => { const out = []; String(text || '').replace(/[A-Za-z]+/g, w => { if (sounds()[w] && !out.includes(w)) out.push(w); return w; }); return out; };
    // The hard names a drill caller says: in their opening and their name.
    const callNames = (c) => hardWords(`${c.opening} ${(c.gives || {}).name || ''}`);
    // What the receptionist hears: each hard name written the way it sounds.
    const heardAs = (text) => String(text == null ? '' : text).replace(/[A-Za-z]+/g, w => sounds()[w] ? sounds()[w].heard : w);
    const spellOut = (w) => w.toUpperCase().split('').join('-');
    const natoOf = (w) => w.toUpperCase().split('').map(ch => `${ch} as in ${NATO[ch] || ch}`).join(', ');
    const sayList = (words) => words.map(w => `${w} = “${sounds()[w].say}”`).join(' · ');
    window.fddHeardAs = heardAs;

    let D = null;         // the running drill
    let P = null;         // the practice call
    let timer = null;
    let screen = 'home';  // home | call | summary | practice | pcwrap | pcdebrief | saved
    let pcLevel = 1;      // the Core callers' level shown (they're listed by level)
    let drillSet = 1;     // the scored drill's set of calls (0 = all of them)
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
    .fdd-saved-tx{white-space:pre-wrap;font-size:12px;line-height:1.55;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px}
    .fdd-view{border:1px solid #cbd5e1;background:#fff;color:#0f2148;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:800;cursor:pointer}
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
    .fdd-comp button.mic{width:46px;height:46px;flex:0 0 46px;border-radius:50%;padding:0;font-size:20px;background:#ecfdf5;border:2px solid #10b981;color:#047857}
    .fdd-comp button.mic.rec{background:#ef4444;border-color:#ef4444;color:#fff;font-size:16px;animation:fddRec 1.2s ease-in-out infinite}
    @keyframes fddRec{50%{box-shadow:0 0 0 6px rgba(239,68,68,.25)}}
    .fdd-comp button:disabled,.fdd-ctl button:disabled{opacity:.45;cursor:not-allowed}
    .fdd-ctl{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
    .fdd-ctl button.on{background:#ecfdf5;border-color:#10b981;color:#047857}
    .fdd-ctl button.rec{background:#fee2e2;border-color:#ef4444;color:#b91c1c}
    .fdd-pc-note{flex-basis:100%;font-size:11.5px;line-height:1.45;color:#92400e;background:#fffbeb;border-radius:7px;padding:6px 9px}
    .fdd-hang{width:100%;background:#dc2626;color:#fff;border:none;border-radius:8px;padding:10px;font-weight:800;font-size:12px;text-transform:uppercase;cursor:pointer;margin:8px 0 10px}
    .fdd-seg{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px}
    .fdd-seg button{font-size:11px;font-weight:700;border:1px solid #cbd5e1;background:#fff;color:#0f2148;border-radius:999px;padding:5px 11px;cursor:pointer}
    .fdd-seg button.on{background:#0f2148;color:#fff;border-color:#0f2148}
    #fdd-core-calls{max-height:320px;overflow-y:auto;margin-bottom:6px}
    .fdd-best{font-size:10.5px;font-weight:800;color:#047857;white-space:nowrap;flex-shrink:0}
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
    .fdd-row .close{font-size:9.5px;font-weight:800;text-transform:uppercase;border-radius:4px;padding:1px 5px;background:#fef3c7;color:#92400e;white-space:nowrap}
    .fdd-ids{display:flex;flex-wrap:wrap;gap:5px;margin:2px 0 6px}
    .fdd-id{font-size:11px;font-weight:700;border-radius:999px;padding:4px 9px;border:1px solid #cbd5e1;background:#fff;color:#334155}
    .fdd-id.ok{background:#ecfdf5;border-color:#10b981;color:#047857}.fdd-id.miss{background:#fef2f2;border-color:#ef4444;color:#b91c1c}
    .fdd-authv{font-size:12.3px;line-height:1.45;border-radius:7px;padding:7px 9px}
    .fdd-authv.ok{background:#ecfdf5;color:#065f46}.fdd-authv.bad{background:#fef2f2;color:#991b1b}.fdd-authv.mid{background:#fffbeb;color:#92400e}
    .fdd-rub{width:100%;border-collapse:collapse;font-size:12px}
    .fdd-rub td{border-bottom:1px solid #e2e8f0;padding:6px 4px;vertical-align:top;line-height:1.4}
    .fdd-rub td.n{width:18px;color:#94a3b8;font-weight:800}
    .fdd-rub td.s{white-space:nowrap;text-align:right;font-family:'IBM Plex Mono',monospace;font-weight:800;color:#0f2148}
    .fdd-rub td.s.lo{color:#b91c1c}.fdd-rub td.s.na{color:#94a3b8;font-weight:600}
    .fdd-rub b{color:#0f2148}.fdd-rub .nt{display:block;font-size:11.3px;color:#475569;margin-top:2px}
    .fdd-rub .how{font-size:9px;font-weight:800;text-transform:uppercase;border-radius:4px;padding:0 4px;margin-left:5px;background:#e0f2fe;color:#0369a1;vertical-align:1px}
    .fdd-rub .how.ai{background:#f3e8ff;color:#7e22ce}
    .fdd-pick{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:2px 0 8px}
    .fdd-pick select{flex:1 1 180px;min-width:0;padding:7px 8px;border:1px solid #cbd5e1;border-radius:7px;font-size:12.5px;font-weight:700;color:#0f2148;background:#fff}
    .fdd-pick span{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
    .fdd-line{display:flex;align-items:center;gap:6px;padding:7px 0;border-top:1px solid #f1f5f9}
    .fdd-line .nm{flex:1;min-width:0;font-weight:700;font-size:12.5px;color:#0f2148}
    .fdd-line .nm small{display:block;font-weight:500;font-size:10.5px;color:#64748b}
    .fdd-line button{font-size:11px;font-weight:800;border:1px solid #cbd5e1;background:#fff;color:#0f2148;border-radius:7px;padding:6px 10px;cursor:pointer}
    .fdd-line button.g{background:#0f2148;color:#fff;border-color:#0f2148}
    .fdd-line a{font-size:11px;font-weight:800;border:1px solid #cbd5e1;background:#fff;color:#0f2148;border-radius:7px;padding:6px 10px;text-decoration:none}
    .fdd-brief>summary{cursor:pointer;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#0f2148}
    .fdd-brief p{margin:6px 0;font-size:12.3px;line-height:1.5}
    .fdd-brief ol,.fdd-brief ul{margin:4px 0 6px 18px;padding:0;font-size:12px;line-height:1.5}
    .fdd-bnote{color:#475569}
    .fdd-file summary{cursor:pointer;font-weight:700;font-size:12px;color:#0f2148}
    .fdd-file pre{white-space:pre-wrap;font:inherit;font-size:11.5px;line-height:1.5;max-height:260px;overflow-y:auto;background:#f8fafc;border:1px solid #e2e8f0;border-radius:7px;padding:8px;margin:6px 0 0}
    .fdd-pk-note{min-height:210px;max-height:none;font-family:'IBM Plex Mono',monospace;font-size:12px}
    .fdd-sc-wrap{padding:0;overflow:hidden}
    .fdd-sc{width:100%;border-collapse:collapse;table-layout:fixed;font-family:Cambria,Georgia,'Times New Roman',serif;font-size:12px;font-weight:700;color:#4f6228}
    .fdd-sc th{background:#63a537;color:#fff;text-align:left;padding:5px 7px;font-size:12.5px;border:1px solid #3f6f22}
    .fdd-sc th:nth-child(2),.fdd-sc td.n{text-align:center;width:48px}.fdd-sc th:nth-child(1){width:42%}
    .fdd-sc td{padding:5px 7px;border:1px solid #9cb98a;vertical-align:top;line-height:1.35}
    .fdd-sc tbody tr:nth-child(odd){background:#eaf4d7}.fdd-sc tbody tr:nth-child(even){background:#fff}
    .fdd-sc td.n{color:#1f2d10}.fdd-sc td.fb{font-family:'Inter',system-ui,sans-serif;font-weight:500;font-size:11.3px;color:#334155}
    .fdd-sc tr.avg td{background:#eaf4d7;border-top:2px solid #63a537}
    .fdd-sc-cap{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#475569;padding:8px 10px 6px}
    .fdd-sc-edit select{width:44px;font:inherit;font-weight:800;padding:2px;border:1px solid #9cb98a;border-radius:4px;background:#fff;color:#1f2d10}
    .fdd-sc-edit textarea{width:100%;box-sizing:border-box;font:500 11.3px/1.35 'Inter',system-ui,sans-serif;color:#334155;border:1px solid #cbd5e1;border-radius:4px;padding:3px 5px;resize:vertical;min-height:34px}
    .fdd-sc-trainer .fdd-sc-cap,.fdd-sc-edit .fdd-sc-cap{color:#0f2148}
    .fdd-cal-out{list-style:none;margin:0;padding:0}.fdd-cal-out li{border:1px solid #e2e8f0;border-left:3px solid #c2410c;border-radius:6px;padding:6px 9px;margin:0 0 6px;font-size:12px;line-height:1.4}
    .fdd-cal-out li span{display:block;color:#475569;font-size:11.5px}.fdd-cal-out li small{display:block;color:#64748b;font-size:11px;white-space:pre-wrap;margin-top:2px}
    .fdd-goals{list-style:none;margin:0;padding:0}
    .fdd-goals li{display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #f1f5f9;font-size:12.3px;line-height:1.4}
    .fdd-goals li span{font-weight:900;width:16px;flex-shrink:0}.fdd-goals li span.ok{color:#047857}.fdd-goals li span.no{color:#b45309}
    .fdd-goals small{display:block;color:#475569;font-size:11.3px;margin-top:2px}
    .fdd-tag.g{background:#fef3c7;color:#92400e}
    `;
    document.head.appendChild(css);

    function buildUI() {
        // 📞 Call Simulator: in the sidebar after 📝 New Intake (index.html, #sb-work; 🗓 Attorney's Calendar comes next)
        const work = $id('sb-work'), intake = $id('nm-open-btn');
        if (work && !$id('fdd-open-btn')) {
            const html = `<button id="fdd-open-btn" class="fdd-btn" onclick="openFrontDeskDrill()">📞 Call Simulator</button>`;
            if (intake && intake.parentElement === work) intake.insertAdjacentHTML('afterend', html); else work.insertAdjacentHTML('beforeend', html);
        }
        // Everyone signed in gets it, trainees too (their calls and scores are saved for their trainer);
        // a course link with ?drill=1 opens it as well.
        const btn = $id('fdd-open-btn');
        if (btn) { const s = typeof getSession === 'function' ? getSession() : null; btn.style.display = s ? '' : 'none'; }
        if (!$id('fdd-panel')) {
            document.body.insertAdjacentHTML('beforeend', `<div id="fdd-panel" class="no-print" aria-hidden="true"></div>
                <button id="fdd-mini" class="no-print" onclick="fddRestore()">📞 Back to the call</button>`);
        }
    }

    // The scored drill's calls come in sets of DRILL_SET, in the pool's order (Set 1 is D01-D08, and so on), so everyone
    // who takes a set gets the same calls and the scores compare; 0 is all of them.
    const DRILL_SET = 8;
    const drillSets = () => Math.ceil((window.DRILL_CALLS || []).length / DRILL_SET);
    const drillSetCalls = (n) => { const all = window.DRILL_CALLS || []; return n ? all.slice((n - 1) * DRILL_SET, n * DRILL_SET) : all.slice(); };
    // The Core callers at a level, in the pool's order.
    const coreCalls = (level) => (window.DRILL_CALLS || []).filter(c => c.level === level);
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
        spell: /\bspell(ing|ed)?\b|how (is|do you|would you) (that|it|you) (spelled|spell)/i,
        dol: /date of (the |your )?(accident|loss|incident|injury|crash|fall)|\bd\.? ?o\.? ?l\b|when did (it|this|that|the accident|the crash|the incident|the fall|you get hurt|you get injured) (happen|occur)|when (was|did) (the|your) (accident|crash|incident|fall|injury)|what (date|day) (was|did) (the|your) (accident|crash|incident|fall)/i
    };
    const heardAsks = (text) => Object.keys(HEARD).filter(k => HEARD[k].test(text));
    // Practice calls also listen for the claim number and the firm's case number (the rubric's identifiers).
    const HEARD_MORE = {
        claim: /\bclaim ?(number|no\b|#)|\b(your|the|her|his) claim\b[^.?!]{0,20}\bnumber|number (for|on) (your|the|her|his) claim|reference number|policy number/i,
        caseno: /\bcase ?(number|no\b|#|id\b)|\b(your|the|her|his) case\b[^.?!]{0,20}\bnumber|number (for|on) (your|the|her|his) case|file number/i
    };

    /* ---------- open / close ---------- */
    window.openFrontDeskDrill = function () {
        if (typeof hasAuthorizedAccess === 'function' && !hasAuthorizedAccess()) return;
        buildUI();
        if (typeof closeCallsPanel === 'function') closeCallsPanel();
        if (typeof closeTrainingLibrary === 'function') closeTrainingLibrary();
        // It works on the Cases System: Master Control and My Dashboard (full-page views over the case) step aside.
        if (typeof exitMasterControl === 'function' && $id('master-control-page')) exitMasterControl();
        if (typeof closeTraineeDashboard === 'function' && $id('trainee-dashboard-page')) closeTraineeDashboard();
        $id('fdd-panel').classList.add('open'); $id('fdd-panel').setAttribute('aria-hidden', 'false'); document.body.classList.add('fdd-open');
        $id('fdd-mini').style.display = 'none';
        if (!D && !P) { screen = 'home'; loadHistory(); }
        paint(); fitCase();
    };
    window.fddClose = function () {
        if (D && screen === 'call' && !confirm('Leave the drill? This run won\'t be scored.')) return;
        if (P && (screen === 'practice' || screen === 'pcwrap') && !confirm('Leave this call? It won\'t be scored.')) return;
        hangUp(); stopTimer(); D = null; endPractice(); screen = 'home';
        document.body.classList.remove('fdd-on', 'fdd-open'); fitCase();
        $id('fdd-panel').classList.remove('open'); $id('fdd-panel').setAttribute('aria-hidden', 'true');
        $id('fdd-mini').style.display = 'none';
    };
    // Hide the panel to read the case behind it; the floating button brings it back. (On a wide screen the
    // case moves over while the panel is open, so both are in view: body.fdd-open, fitCase.)
    window.fddMinimize = function () { $id('fdd-panel').classList.remove('open'); document.body.classList.remove('fdd-open'); fitCase(); $id('fdd-mini').style.display = 'block'; };
    window.fddRestore = function () { $id('fdd-panel').classList.add('open'); document.body.classList.add('fdd-open'); fitCase(); $id('fdd-mini').style.display = 'none'; $id('fdd-mini').textContent = '📞 Back to the call'; };
    // While the panel is open (body.fdd-open) the case moves over beside it on a wide screen, the sidebar stepping
    // aside and the case shown a little smaller when there isn't room (case-fit.js); hiding or closing the panel
    // puts it all back.
    const fitCase = () => { if (window.lshFitCase) window.lshFitCase(); };

    /* ---------- drill flow ---------- */
    window.fddStart = function () {
        const unsaved = typeof hasCaseContent === 'function' && hasCaseContent() && typeof currentCaseId !== 'undefined' && currentCaseId === null;
        if (unsaved && !confirm('The drill opens case files in the editor, which clears the unsaved case that\'s there now. Start anyway?')) return;
        const box = $id('fdd-set'); if (box) drillSet = parseInt(box.value, 10) || 0;
        const pool = drillSetCalls(drillSet);
        if (!pool.length) return;
        const liveBox = $id('fdd-live');
        if (liveBox) window.fddSetLive(liveBox.checked);
        endPractice();
        D = {
            live: liveOK() && (liveBox ? liveBox.checked : livePref()),
            program: (window.lshProgram && window.lshProgram()) || '', set: drillSet,
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
                    // A read-back with the phonetic alphabet: three or more NATO words said on the call.
                    const said = lv.lines.filter(x => x.role === 'you').map(x => x.text).join(' ');
                    if ((said.match(NATO_WORDS) || []).length >= 3 && !cur.asked.includes('nato')) { cur.asked.push('nato'); cur.heard.push('nato'); }
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
        const label = askLabel(k);
        if (cur.live && cur.live.status === 'live') {
            const c = D.calls[D.i].call;
            window.LiveCall.sendText(k === 'relationship' ? 'What is your relationship to the client?' : k === 'dol' ? 'What was the date of the accident?'
                : k === 'spell' ? 'Could you spell the name for me, please?' : k === 'nato' ? `Let me read that back: ${callNames(c).map(natoOf).join('; ')}. Is that right?`
                : `Can I have your ${label.toLowerCase()}, please?`);
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
            if (id !== 'none' && typeof openMockCase === 'function') openMockCase(id, { silent: true, viewOnly: true });
            pcPick(); setTimeout(fitCase, 50); return;
        }
        if (!D || !D.cur) return;
        const cur = D.cur; if (cur.submitted) return;
        cur.selected = id;
        if (id !== 'none' && typeof openMockCase === 'function') openMockCase(id, { silent: true, viewOnly: true });
        paint(); setTimeout(fitCase, 50);
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
        if (PERSONAL.includes(c.auth)) idsOk = cur.asked.includes('name') && cur.asked.includes('dob') && cur.asked.includes('dol') && (cur.asked.includes('address') || cur.asked.includes('ssn4'));
        else if (c.auth === 'unauthorized') idsOk = cur.asked.includes('name') && cur.asked.includes('relationship');
        else idsOk = cur.asked.includes('name') && cur.asked.includes('callback');
        if (c.mock && sameNameCount(c.mock) > 1) idsOk = idsOk && cur.asked.includes('dol');
        if (callNames(c).length) idsOk = idsOk && cur.asked.includes('spell') && cur.asked.includes('nato');
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
                body: JSON.stringify(Object.assign({ program: D.program, calls: D.results.length, details: D.results.map(r => Object.assign({ set: D.set }, r)) }, D.summary))
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
        if (screen === 'home' || screen === 'results' || screen === 'summary' || screen === 'line') paint();
        else if (screen === 'pcdebrief') { const h = $id('fdd-pc-hist'); if (h) h.innerHTML = historyHTML(); }
    }
    window.fddHome = function () { hangUp(); stopTimer(); D = null; endPractice(); screen = 'home'; document.body.classList.remove('fdd-on'); loadHistory(); paint(); };

    /* ---------- rendering ---------- */
    function paint() {
        const p = $id('fdd-panel'); if (!p) return;
        if (['practice', 'pcwrap', 'pcdebrief'].includes(screen) && !P) screen = 'home';
        if (screen === 'line' && !LN) screen = 'home';
        const title = screen === 'call' ? `Call ${D.i + 1} of ${D.calls.length}` : screen === 'summary' ? 'Drill complete'
            : screen === 'practice' ? (P.pack && P.graded ? 'Graded call' : 'Practice call') : screen === 'pcwrap' ? 'Wrap up the call' : screen === 'pcdebrief' ? 'Call debrief' : screen === 'saved' ? 'Saved call'
            : screen === 'line' ? esc(LN.line) : screen === 'results' ? 'Results and saved calls' : 'Call Simulator';
        const t0 = screen === 'call' ? D.cur.t0 : screen === 'practice' ? P.t0 : null;
        const clock = screen === 'call' || screen === 'practice' ? `<span class="t" id="fdd-timer">${t0 ? fmtSec(Math.round((Date.now() - t0) / 1000)) : '0:00'}</span>` : '';
        const hide = ['call', 'practice', 'pcwrap'].includes(screen) ? `<button onclick="fddMinimize()" title="Hide to read the case">▭ Case</button>` : '';
        p.innerHTML = `<div class="fdd-h"><b>📞 ${title}</b>${clock}${hide}<button onclick="fddClose()">✕</button></div>
            <div class="fdd-b">${screen === 'call' ? callHTML() : screen === 'summary' ? summaryHTML() : screen === 'practice' ? practiceHTML()
                : screen === 'pcwrap' ? (P.pack ? packWrapHTML() : pcWrapHTML()) : screen === 'pcdebrief' ? (P.pack ? packDebriefHTML() : pcDebriefHTML()) : screen === 'saved' ? savedCallHTML()
                : screen === 'line' ? lineHTML() : screen === 'results' ? resultsHTML() : homeHTML()}</div>`;
        if (['call', 'practice', 'pcwrap'].includes(screen)) paintResults();
        if (screen === 'practice') { pcIdCard(); pcControls(); pcTr(); const box = $id('fdd-pc-in'); if (box) box.value = P.draft || ''; }
        if (screen === 'pcdebrief') paintSaved();
    }
    function paintButtons() {
        const cur = D && D.cur; const b = $id('fdd-submit');
        if (b) b.disabled = !(cur && cur.selected && cur.auth && cur.action != null);
    }

    // The home screen is the call lines: every program's calls, Practice and Graded, and under them only the way to the
    // results (My results, an Admin's team table, 🎧 Saved calls). The Core callers' practice call and the scored drill
    // are no longer offered there.
    function homeHTML() {
        return (linesHomeHTML() || '<p style="color:#64748b;font-size:12px">The call lines aren\'t available.</p>')
            + '<button class="fdd-go" style="background:#475569" onclick="fddResults()">📊 Results and saved calls</button>';
    }
    // The results on a screen of their own (a call's debrief shows them too).
    window.fddResults = function () { hangUp(); stopTimer(); D = null; endPractice(); screen = 'results'; document.body.classList.remove('fdd-on'); loadHistory(); paint(); };
    const resultsHTML = () => `${historyHTML()}<button class="fdd-go" onclick="fddHome()">← Call lines</button>`;

    window.fddDrillSet = function (v) { drillSet = parseInt(v, 10) || 0; };
    // The Core callers at the level picked, each with the start of what they call about and your best score on them.
    function coreListHTML() {
        return coreCalls(pcLevel).map(c => `<div class="fdd-row" data-call="${esc(c.id)}" onclick="fddPracticeStart('${esc(c.id)}')"><span class="id">${esc(c.id)}</span>
            <span class="nm" style="font-weight:500">${esc(clip(unquote(c.opening), 88))}</span>${bestHTML(c.id, 'practice')}</div>`).join('');
    }
    const clip = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t; };
    // Your best score on one call (your own results: an Admin's list has everyone's). A graded call's, or a practice one's.
    function bestOn(id, mode) {
        const me = (session() || {}).username;
        const rows = ((history && history.results) || []).filter(r => r.call_id === id && r.username === me && (mode === 'graded' ? r.mode === 'graded' : r.mode !== 'graded'));
        return rows.length ? Math.max(...rows.map(r => Number(r.score) || 0)) : null;
    }
    const bestHTML = (id, mode) => { const b = bestOn(id, mode); return b == null ? '' : `<span class="fdd-best" title="Your best score on this call">✓ ${b}%</span>`; };

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
        const all = history.results || [], rows = filterRows(all), filtered = rows.length !== all.length || rf.line !== 'all' || rf.mode !== 'all';
        if (history.isAdmin && isAdmin()) {   // not in Trainee view
            const by = {};
            rows.forEach(r => { (by[r.username] = by[r.username] || []).push(r); });
            const team = Object.entries(by).map(([u, rs]) => {
                const n = rs.length, avg = (k) => Math.round(rs.reduce((a, r) => a + (r[k] || 0), 0) / n);
                // Find / Auth / Handle are the front desk's (drills and Core callers calls); a line call has its own goals
                const core = rs.filter(r => !isLineRow(r)), cavg = (k) => core.length ? Math.round(core.reduce((a, r) => a + (r[k] || 0), 0) / core.length) + '%' : '—';
                return { u, name: rs[0].full_name || u, batch: rs[0].batch_id || '', n, practice: rs.filter(r => r.mode === 'practice').length, lines: rs.filter(isLineRow).length, graded: rs.filter(r => r.mode === 'graded').length,
                    score: avg('score'), best: Math.max(...rs.map(r => r.score)), find: cavg('find_pct'), auth: cavg('auth_pct'), act: cavg('action_pct'), secs: avg('avg_seconds'), last: rs[0].created_at };
            }).sort((a, b) => b.score - a.score);
            return `${liveUsageHTML()}<div class="fdd-sec"><h4>Team results (${rows.length} calls and drills)</h4>${filterHTML()}${team.length ? `<table class="fdd-tbl"><thead><tr><th>Trainee</th><th>Runs</th><th>Avg</th><th>Find</th><th>Auth</th><th>Handle</th><th>Sec/call</th></tr></thead><tbody>
                ${team.map(t => `<tr><td><b>${esc(t.name)}</b><br><span style="color:#64748b">${esc(t.batch)}</span></td><td>${t.n}${t.practice ? `<br><span style="color:#64748b">${t.practice} practice</span>` : ''}${t.lines ? `<br><span style="color:#64748b">${t.lines} line call${t.lines === 1 ? '' : 's'}${t.graded ? ` (${t.graded} graded)` : ''}</span>` : ''}</td><td><b>${t.score}%</b><br><span style="color:#64748b">best ${t.best}%</span></td><td>${t.find}</td><td>${t.auth}</td><td>${t.act}</td><td>${t.secs}</td></tr>`).join('')}</tbody></table>` : `<p style="color:#64748b;font-size:12px;margin:0">${filtered ? 'No calls match.' : 'No drills completed yet.'}</p>`}</div>` + savedListHTML(rows, true);
        }
        return `<div class="fdd-sec"><h4>My results</h4>${all.length ? filterHTML() : ''}${rows.length ? `<table class="fdd-tbl"><thead><tr><th>Date</th><th>Type</th><th>Score</th><th>Find</th><th>Auth</th><th>Handle</th><th>Sec/call</th></tr></thead><tbody>
            ${rows.slice(0, 15).map(r => `<tr><td>${esc(String(r.created_at || '').slice(0, 16))}</td><td>${rowType(r)}</td><td><b>${r.score}%</b></td>${isLineRow(r) ? '<td>—</td><td>—</td><td>—</td>' : `<td>${r.find_pct}%</td><td>${r.auth_pct}%</td><td>${r.action_pct}%</td>`}<td>${r.avg_seconds}</td></tr>`).join('')}</tbody></table>` : `<p style="color:#64748b;font-size:12px;margin:0">${history.error ? 'Couldn\'t load results.' : filtered ? 'No calls match.' : 'No calls yet. Your scores will appear here and on your trainer\'s team view.'}</p>`}</div>` + savedListHTML(rows, false);
    }

    // 🎧 Saved calls: the Call Simulator's practice calls, newest first (an Admin's lists everyone's), each opening
    // with its scorecard, the review and the whole transcript (fddSavedCall).
    function savedListHTML(rows, team) {
        const calls = rows.filter(r => r.mode === 'practice' || isLineRow(r)).slice(0, team ? 40 : 15);
        if (!calls.length) return '';
        return `<div class="fdd-sec"><h4>🎧 Saved calls</h4><table class="fdd-tbl"><thead><tr><th>Date</th>${team ? '<th>Trainee</th>' : ''}<th>Call</th><th>Score</th><th></th></tr></thead><tbody>
            ${calls.map(r => `<tr><td>${esc(String(r.created_at || '').slice(0, 16))}</td>${team ? `<td><b>${esc(r.full_name || r.username)}</b><br><span style="color:#64748b">${esc(r.batch_id || '')}</span></td>` : ''}<td>${rowType(r)}${r.title ? `<br><span style="color:#64748b">${esc(r.title)}</span>` : ''}</td><td><b>${Number(r.score) || 0}%</b>${r.trainer_pct != null ? `<br><span style="color:#0f2148" title="The trainer's scorecard">👤 ${Number(r.trainer_pct) || 0}%</span>` : ''}</td>
                <td><button class="fdd-view" onclick="fddSavedCall(${Number(r.id)})">View</button></td></tr>`).join('')}</tbody></table></div>`;
    }
    let SAVED = null;   // the saved call being read
    window.fddSavedCall = async function (id) {
        SAVED = { id, loading: true }; screen = 'saved'; paint();
        try {
            const res = await fetch('/api/drill-results?id=' + encodeURIComponent(id), { credentials: 'include' });
            const data = await res.json();
            if (!data || !data.success || !data.result) throw new Error((data && data.error) || 'That call wasn\'t found.');
            let d = null; try { d = (JSON.parse(data.result.details || '[]') || [])[0] || null; } catch (e) { d = null; }
            SAVED = { id, row: data.result, d };
        } catch (e) { SAVED = { id, error: e.message || 'Couldn\'t load that call.' }; }
        if (screen === 'saved') { paint(); const b = $id('fdd-panel').querySelector('.fdd-b'); if (b) b.scrollTop = 0; }
    };
    window.fddSavedBack = function () { SAVED = null; screen = 'results'; paint(); };
    function savedCallHTML() {
        const back = `<button class="fdd-go" onclick="fddSavedBack()">← Back to the results</button>`;
        if (!SAVED || SAVED.loading) return `<p style="color:#64748b;font-size:12px">Loading the call…</p>${back}`;
        if (SAVED.error || !SAVED.d) return `<div class="fdd-fb bad">${esc(SAVED.error || 'This call has no scorecard or transcript saved with it.')}</div>${back}`;
        if (SAVED.d.pack) return savedPackHTML(SAVED.row, SAVED.d, back);
        const row = SAVED.row, d = SAVED.d, rv = d.review || {}, k = d.mock && caseOf(d.mock);
        const items = (d.items || []).map(i => { const r = RUBRIC.find(x => x[0] === i.k) || [i.k, i.k, 'auto']; return { key: i.k, label: r[1], how: r[2], s: i.s, note: i.n }; });
        const li = (x) => Array.isArray(x) && x.filter(Boolean).length ? `<ul>${x.filter(Boolean).map(v => `<li>${esc(v)}</li>`).join('')}</ul>` : '';
        const score = Number(row.score) || 0, cls = score >= 85 ? 'ok' : score >= 60 ? 'mid' : 'bad';
        return `<div class="fdd-sec" style="text-align:center"><div style="font-size:10.5px;font-weight:800;letter-spacing:.08em;color:#64748b;text-transform:uppercase">Reception mock call · ${esc(row.full_name || row.username)}</div>
                <div class="fdd-score">${score}/100</div>
                <div style="color:#64748b">${esc(String(row.created_at || '').slice(0, 16))}${d.points != null ? ` · ${Number(d.points)}/${Number(d.outOf) || 0} points` : ''}${d.secs != null ? ` · ⏱ ${fmtSec(Number(d.secs) || 0)}` : ''}${d.voice === 'live' ? ' · live voice' : ''}</div></div>
            ${rv.breach ? `<div class="fdd-fb bad"><div class="fdd-breach" style="margin:0">⚠ Disclosure: ${esc(rv.breachNote || 'information was shared that shouldn\'t have been')}.</div></div>` : ''}
            ${items.length ? `<div class="fdd-sec"><h4>Scorecard</h4>${rubricHTML({ items })}</div>` : ''}
            <div class="fdd-fb ${cls}"><div>${d.find ? '✓' : '✗'} <b>File:</b> ${k ? `${esc(k.id)} · ${esc(k.client.name)} (${esc(k.caseNumber || '')})` : esc(d.mock || 'not in the system')}</div>
                ${d.auth && Array.isArray(d.auth.missing) && d.auth.missing.length ? `<div>✗ <b>Not asked:</b> ${esc(d.auth.missing.join(', '))}</div>` : ''}</div>
            ${rv.verdict || li(rv.strengths) || li(rv.improve) ? `<div class="fdd-sec"><h4>Review</h4>${rv.verdict ? `<p style="margin:0 0 6px">${esc(rv.verdict)}</p>` : ''}
                ${li(rv.strengths) ? `<b>Went well</b>${li(rv.strengths)}` : ''}${li(rv.improve) ? `<b>To work on</b>${li(rv.improve)}` : ''}${rv.betterLine ? `<p style="margin:6px 0 0"><b>A better line:</b> ${esc(rv.betterLine)}</p>` : ''}</div>` : ''}
            ${d.note ? `<div class="fdd-sec"><h4>The receptionist's note</h4><p style="margin:0;white-space:pre-wrap">${esc(d.note)}</p></div>` : ''}
            <div class="fdd-sec"><h4>Transcript</h4><div class="fdd-saved-tx">${esc(d.transcript || 'No transcript was saved with this call.')}</div></div>
            ${back}`;
    }

    function answerFor(c, k) {
        if (k === 'spell') return `Caller: "That's ${callNames(c).map(spellOut).join(', ')}."`;
        if (k === 'nato') return 'Caller: "Yes, that\'s right."';
        let v = c.gives[k] == null ? c.gives[k] : heardAs(c.gives[k]);
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
             : `${cur.liveNote ? `<div class="fdd-dup">🎙 ${esc(cur.liveNote)}</div>` : ''}<div class="fdd-caller">📞 ${esc(heardAs(c.opening))}</div>`}
        <div class="fdd-sec"><h4>1 · Ask the caller${lv ? ' (out loud)' : ''}</h4><div class="fdd-asks" id="fdd-asks">${asksHTML()}</div>
            ${lv ? `<p style="margin:6px 0 0;font-size:11.5px;color:#64748b">Ask out loud: each identifier is ticked as you ask for it. Tap one to ask it in writing instead.</p>`
                 : `<div class="fdd-tr">${cur.asked.map(k => `<div><span class="q">You: ${esc(askLine(c, k))}</span><br><span class="a">${esc(answerFor(c, k))}</span></div>`).join('')}</div>`}</div>
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

    // What the receptionist says for each ask in the text drill.
    function askLine(c, k) {
        if (k === 'spell') return 'Could you spell that for me, please?';
        if (k === 'nato') return `Let me read that back: ${callNames(c).map(natoOf).join('; ')}.`;
        return askLabel(k) + '?';
    }
    function asksHTML() {
        const cur = D.cur, lv = cur.live;
        return ASKS.concat(callNames(D.calls[D.i].call).length ? SPELL_ASKS : []).map(([k, l]) => {
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
        const close = (c) => window.mockSoundsLike && window.mockSoundsLike(c, q) ? ' <span class="close" title="Not spelled the same: a name on this file sounds like what you typed">Sounds like</span>' : '';
        box.innerHTML = hits.length ? warn + hits.map(c => `<div class="fdd-row ${cur.selected === c.id ? 'sel' : ''}" onclick="fddPick('${c.id}')"><span class="id">${c.id}</span><span class="nm">${esc(c.client.name)}${close(c)}<br><span class="mt">DOL <b>${esc(c.dateOfLoss)}</b> · DOB ${esc(c.client.dob)} · ${esc(c.caseNumber || '')} · ${esc(c.caseType === 'Others' ? c.caseTypeOther : c.caseType)} · ${esc(c.phase)}</span></span></div>`).join('')
            : '<p style="margin:4px 0 0;font-size:11.5px;color:#94a3b8">No cases match. Try part of the name, the last name, the date of birth (MM/DD/YYYY) or the callback number.</p>';
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
        if (c.auth === 'unauthorized') return 'May I have your full name, and your relationship to the person you\'re calling about?';
        if (c.auth === 'business') return 'May I have your name, your company, the claim or reference number, and a good callback number?';
        if (c.auth === 'newcaller') return 'May I have your full name and a good callback number? And can you tell me briefly what happened, and when?';
        if (c.auth === 'authorized') return 'May I have your full name and your relationship to the client? And to verify the file, the client\'s date of birth, the date of the accident, and their address or the last 4 of their Social Security number?';
        return 'Before I look into that, may I have your full name, your date of birth, the date of the accident, and your address or the last 4 of your Social Security number?';
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
            ${sayNamesHTML(callNames(c))}
            <h5>If the receptionist asks for…</h5>
            <table>${SCRIPT_ASKS.map(([key, l]) => `<tr><td>${l}</td><td>${esc(val(key) || none)}</td></tr>`).join('')}</table>
            <h5>Stay in character</h5><div>${esc(ACTOR[c.auth] || '')} Don't volunteer details; answer what you're asked. Hang up once you have your answer, a next step, or a message is taken.</div>
            <h5>A ready receptionist</h5>
            <div class="rsay">1. “Thank you for calling ${esc(firmName())}, this is [name]. How may I help you?”</div>
            <div class="rsay">2. ${c.mock ? 'Finds the file (search by name, DOB, phone, case number, claim #…) and asks: ' : ''}“${esc(verifyLine(c))}”</div>
            ${spellStepHTML(callNames(c))}
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
    // The role-player's pronunciation guide, and the receptionist's spell-back step, for a call with hard names.
    function sayNamesHTML(words) {
        return words.length ? `<h5>Say the names like this</h5><div>${esc(sayList(words))}. Say them naturally and don't spell them unless you're asked; then spell slowly, letter by letter. If the read-back is wrong, correct it.</div>` : '';
    }
    function spellStepHTML(words) {
        return words.length ? `<div class="rsay">↳ Hears a name they can't be sure of: “Could you spell that for me, please?” Then reads it back with the NATO alphabet: “${esc(words.map(natoOf).join('; '))}.” Searches with the spelling, not the sound.</div>` : '';
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
            : ' Same name on more than one file: the date of the accident tells them apart.';
        const names = hardWords(`${cl.name} ${s.from} ${s.ask}`);
        const caller = isClient
            ? `You're the client. When they ask, verify with the file's details:<table>
                <tr><td>Full name</td><td>${esc(cl.name)}</td></tr><tr><td>Date of birth</td><td>${esc(cl.dob || '')}</td></tr>
                <tr><td>Address</td><td>${esc(cl.address || '')}</td></tr>${ssn4 ? `<tr><td>Last 4 of SSN</td><td>${esc(ssn4)}</td></tr>` : ''}
                <tr><td>Date of the accident</td><td>${esc(k.dateOfLoss || '')}</td></tr></table>
                Friendly and cooperative; you want a real answer. Don't volunteer details; answer what you're asked.`
            : 'Give your name, who you are to the client (or your company) and a callback number when asked. You don\'t have the client\'s date of birth or Social Security number, unless the file authorizes you (see On file below: then answer from it). If they won\'t help, push back once, then accept a message. Never get abusive.';
        return `<div class="fdd-script" data-scenario="${esc(k.id)}-${i + 1}">
            <div class="sh"><b>📜 ${esc(k.id)} · caller scenario ${i + 1}</b><span>${esc(isClient ? 'client' : 'caller')}</span></div>
            <div class="sb">
            <h5>You play the caller · ${esc(unquote(s.from))}</h5>
            <div class="say">${quoted ? `“${esc(unquote(s.ask))}”` : `(In your own words) ${esc(s.ask)}`}</div>
            <div>${caller}</div>
            ${sayNamesHTML(names)}
            <h5>A ready receptionist</h5>
            <div class="rsay">1. “Thank you for calling ${esc(firmName())}, this is [name]. How may I help you?”</div>
            <div class="rsay">2. “May I have your full name and a good callback number, in case we get disconnected? And who are you calling about?”</div>
            ${spellStepHTML(names)}
            <div class="rsay">3. Before sharing anything. The client, or someone the file authorizes: “May I have ${isClient ? 'your' : 'the client\'s'} date of birth, the date of the accident, and the address on file or the last 4 of the Social Security number?”${sameAsk} Anyone else: share nothing about the case, not even that it's a client.</div>
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
        const personal = PERSONAL.includes(c.auth);
        return (personal ? 'name, date of birth, the date of the accident (DOL), and address or SSN last 4'
            : c.auth === 'unauthorized' ? 'their name and their relationship to the client' : 'their name and a callback number')
            + (same > 1 ? (personal ? ` (${same} files are named ${k.client.name}: the DOL tells them apart)` : `, plus the date of the accident (${same} files are named ${k.client.name})`) : '')
            + (callNames(c).length ? `, and the spelling of ${callNames(c).join(' ')}, read back with the NATO alphabet` : '');
    }
    function feedbackHTML(entry, r) {
        const c = entry.call, k = c.mock && caseOf(c.mock);
        const cls = r.score >= 85 ? 'ok' : r.score >= 60 ? 'mid' : 'bad';
        const need = needFor(c);
        return `<div class="fdd-fb ${cls}"><div style="display:flex;justify-content:space-between;align-items:center"><b>${r.score}/100</b><span>⏱ ${fmtSec(r.secs)}</span></div>
            <div>${r.find ? '✓' : '✗'} <b>Find:</b> ${c.mock ? `${esc(c.mock)} · ${esc(k ? k.client.name : '')}${k ? ` (${esc(k.caseNumber || '')}, DOL ${esc(k.dateOfLoss)})` : ''}` : 'not in the system'}${r.find ? '' : ` (you picked ${esc(r.picked.selected)})`}</div>
            <div>${r.authOk ? '✓' : '✗'} <b>Authenticate:</b> ${esc((AUTH.find(a => a[0] === c.auth) || [])[1])}</div>
            <div>${r.idsOk ? '✓' : '✗'} <b>Asked for:</b> ${esc(need)}</div>
            <div>${r.actOk ? '✓' : '✗'} <b>Handle:</b> ${esc(c.actions[c.answer])}</div>
            <div style="margin-top:5px;color:#334155">${esc(c.why)}</div>
            ${k && k.reception ? `<div style="margin-top:5px;color:#64748b;font-size:11.5px"><b>On file:</b> ${esc(k.reception.verify)}</div>` : ''}
            ${r.live ? `<div style="margin-top:5px;color:#64748b;font-size:11.5px">🎙 Live call · you asked for: ${r.picked.asked.length ? esc(r.picked.asked.map(askLabel).join(', ')) : 'nothing'}</div>` : ''}</div>`;
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
            <button class="fdd-go" onclick="fddResults()">My results</button>`;
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
        const list = $id('fdd-core-calls'); if (list) { list.innerHTML = coreListHTML(); list.scrollTop = 0; }
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
    // Hard names in a typed practice call: written the way they sound, spelled only when asked.
    function namesRule(words) {
        if (!words.length) return '';
        return `\nSAYING NAMES (this is a phone call: the receptionist only hears you)\n- Always write these names the way they sound, never with their real spelling: ${words.map(w => `write "${sounds()[w].heard}" for ${w}`).join(', ')}.\n- Only when the receptionist asks you to spell a name, spell it letter by letter with the real spelling: ${words.map(w => `${w} is ${spellOut(w)}`).join(', ')}.\n- If they read a spelling back wrong, correct the letter they got wrong. If they read it back right (for example with the phonetic alphabet), say that's right.\n`;
    }
    function callerPrompt(c) {
        const k = caseOf(c.mock), g = c.gives || {};
        const val = (key) => key === 'dol' && g.dol == null && k ? k.dateOfLoss : g[key];
        const knows = GIVES.filter(([key]) => val(key) != null && String(val(key)).trim() !== '').map(([key, l]) => `- ${l}: ${heardAs(val(key))}`).join('\n');
        const bg = k && PERSONAL.includes(c.auth) ? `\nBACKGROUND (what you know about the accident; use it to answer naturally, never recite it):\n${heardAs(k.narrative)}\n` : '';
        return `You are role-playing a caller phoning the front desk of ${firmName()}, a personal injury law firm. The person answering is a receptionist. Stay in character for the whole call.

WHO YOU ARE AND WHY YOU CALL
Why you're calling (say it in your own words once they greet you): "${heardAs(unquote(c.opening))}"
${ROLE[c.auth] || ROLE.client}

WHAT YOU SAY WHEN ASKED (give each detail only when the receptionist asks for it, exactly as written here, even if it seems wrong; never correct it or add to it):
${knows || '- Your name: you\'d rather not say.'}
For anything not listed, say you don't know it or would rather not say.
${bg}${namesRule(hardWords(`${c.opening} ${g.name || ''} ${k ? k.client.name : ''}`))}
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
            if (!out.length && role === 'model') out.push({ role: 'user', text: l.pack ? (l.out ? '(The trainee calls you and you pick up.)' : '(The trainee answers the phone.)') : '(The receptionist picks up.)' });
            if (out.length && out[out.length - 1].role === role) out[out.length - 1].text += ' ' + m.text; else out.push({ role, text: m.text });
        });
        // The start of the call and the latest turns (the list always ends on the receptionist's line).
        return out.length > 41 ? [out[0], out[1], ...out.slice(-39)] : out;
    }
    const cleanLine = (t) => unquote(String(t || '').replace(/\[END_CALL\]/gi, ' ').replace(/\*[^*]*\*/g, ' ').replace(/^\s*(caller|client|me)\s*:\s*/i, '').replace(/\s+/g, ' '));

    // One request to /api/call-ai. retry: worth trying again (busy line, network). module: a line's call counts under its line (call-packs.js aiModule).
    async function askAI(purpose, system, messages, json, module) {
        try {
            const res = await fetch('/api/call-ai', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ purpose, system, messages, json: !!json, module: module || '' })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data && data.success && data.text) return { ok: true, text: String(data.text) };
            return { ok: false, retry: res.status === 429 || res.status >= 500, error: (data && data.error) || `Error ${res.status}.` };
        } catch (e) { return { ok: false, retry: true, error: 'Connection problem.' }; }
    }
    // A busy line is retried 3 times (1.5 s, 3 s, 6 s). stale() → the call moved on; stop quietly.
    async function askWithRetry(purpose, system, messages, json, stale, onWait, module) {
        for (let attempt = 0; ; attempt++) {
            const r = await askAI(purpose, system, messages, json, module);
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

    // A Core caller: the one picked (id); with none, the first one at the level shown.
    window.fddPracticeStart = function (id) {
        const unsaved = typeof hasCaseContent === 'function' && hasCaseContent() && typeof currentCaseId !== 'undefined' && currentCaseId === null;
        if (unsaved && !confirm('The call opens case files in the editor, which clears the unsaved case that\'s there now. Start anyway?')) return;
        const box = $id('fdd-live'); if (box) window.fddSetLive(box.checked);
        const all = window.DRILL_CALLS || [];
        const call = (id && all.find(c => c.id === id)) || coreCalls(pcLevel)[0] || all[0];
        if (!call) return;
        pcLevel = call.level;
        const V = voice();
        hangUp(); stopTimer(); D = null; endPractice();
        P = { call, transport: liveOK() && livePref() && Date.now() > pcLiveOff ? 'live' : 'standard', answered: false, ringAt: Date.now(), t0: null, t1: null, msgs: [],
            speak: !!(V && V.canSpeak && pcPref('SPEAK', true)), hands: !!(V && V.canListen && pcPref('HANDS', true)),
            selected: null, q: '', note: '', draft: '', busy: false, closing: false, ended: false, req: 0, muted: false, replyStart: null, micUsed: false,
            status: 'Incoming call… press 📞 Answer.', warn: false, voiceNote: '', program: (window.lshProgram && window.lshProgram()) || '' };
        document.body.classList.add('fdd-on');
        if (typeof closeCallsPanel === 'function') closeCallsPanel();
        screen = 'practice'; paint();
        if (window.LiveCall) window.LiveCall.ring(3);
    };

    // Answer: the call connects; the caller waits for the trainee's greeting (and says "Hello?" if there's none).
    // A line's call you place (P.out) rings on the other end first (dialOut).
    window.fddPracticeAnswer = function () {
        const my = P; if (!pcOn() || my.answered) return;
        if (my.pack && my.out) { const V = voice(); if (V && my.speak) V.unlock(); return dialOut(my); }
        pcConnect(my);
    };
    function pcConnect(my) {
        my.answered = true; my.t0 = Date.now(); startTimer();
        if (window.LiveCall) window.LiveCall.stopRing();
        const first = my.pack && my.out;   // they picked up: they speak first
        if (my.transport === 'live') startLive(my);
        else {
            const V = voice(); if (V && my.speak) V.unlock();
            if (liveOK() && livePref() && pcLiveWhy) my.voiceNote = `🎙 ${pcLiveWhy} This call uses the standard voice: ${V && V.canListen ? 'talk (🎙) or type your reply' : 'type your reply'}.`;
            if (first) { my.opened = true; pcStatus(''); }
            else {
                pcStatus(my.pack ? 'Connected. Greet the caller.' : 'Connected. Greet the caller the way you answer the firm\'s phone.');
                // No greeting in 6 s: "Hello?" (not while they're in the middle of saying one)
                my.kick = setTimeout(() => { const b = $id('fdd-pc-in'); if (P === my && !my.ended && !my.msgs.length && !my.busy && !(b && b.value.trim())) callerSays('Hello?', false); }, 6000);
            }
        }
        if (my.pack) { const br = $id('fdd-panel').querySelector('.fdd-brief'); if (br) br.open = false; }
        pcIdCard(); pcControls(); pcTr();
        if (first && my.transport === 'standard') callerSays(my.call.opening, false);
        else if (first) return;
        else if (my.transport === 'standard' && my.hands) pcListen(true);   // hands-free: say the greeting
        else { const b = $id('fdd-pc-in'); if (b) b.focus({ preventScroll: true }); }
    }

    // Live voice (live-call.js): the caller hears the trainee and talks back. If it can't start,
    // is busy, or drops, the call carries on with the standard voice, transcript and all.
    function startLive(my) {
        pcStatus('Connecting… allow the microphone if the browser asks.');
        my.speakerOn = speakerPref();
        window.LiveCall.start({
            callId: my.call.id, speaker: my.speakerOn,
            // a line's call: on a call you place, they pick up and speak first; a silence after you answer is nobody's receptionist
            pickup: my.pack && my.out ? '(Your phone rings and you pick up.)' : '',
            nudge: my.pack ? '(The call is connected, but the other person hasn\'t said anything yet.)' : '',
            onState: (st) => {
                if (P !== my || my.ended || my.transport !== 'live') return;
                if (st === 'live') { my.liveUp = my.usedLive = true; pcStatus(liveTalkHint(my)); pcControls(); }
                else if (st === 'ended') toStandard(my, 'The live line closed.');
            },
            onLine: (role, text, id) => {
                if (P !== my || my.ended || my.transport !== 'live') return;
                const m = my.msgs.find(x => x.id === id), now = Date.now();
                if (m) { m.text = text; m.upd = now; } else my.msgs.push({ who: role === 'you' ? 'you' : 'caller', text, id, at: now, upd: now, spoken: true });
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
        if (my.pack && my.msgs.some(m => m.who === 'caller' && m.spoken)) my.opened = true;   // a line's caller already opened on live voice
        if (window.LiveCall && window.LiveCall.active()) window.LiveCall.stop();
        why = code === 'DROPPED' ? (/busy/i.test(why) ? 'The live voice service got busy.' : 'The live line dropped.') : textless(why || 'Live voice isn\'t available.');
        // Not set up, no microphone, the day's live minutes used up, a refused region: not again
        // this visit. Busy or dropped: the next practice call tries live voice again.
        const off = ['NOT_CONFIGURED', 'NO_MODEL', 'MIC', 'BUDGET', 'REGION'].includes(code);
        pcLiveWhy = off ? why : ''; pcLiveOff = off ? Infinity : 0;
        my.voiceNote = `🎙 ${why} The call goes on with the standard voice: ${voice() && voice().canListen ? 'talk (🎙) or type your reply' : 'type your reply'}.`;
        const V = voice(); if (V && my.speak) V.unlock();
        pcStatus(my.msgs.length ? 'Your turn.' : 'Greet the caller the way you answer the firm\'s phone.');
        pcControls(); pcTr();
    }

    function yourTurn() {
        const l = P; if (!l || l.ended) return;
        const V = voice();
        pcStatus(`Your turn: ${V && V.canListen ? 'press 🎙 and talk, or type' : 'type'} your reply (Enter sends).`);
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
        if (V.isListening()) { V.stopListening(); pcControls(); }   // the microphone waits while the caller talks
        pcStatus('The caller is talking…');
        V.speak(text, { gender: my.call.voice || my.call.gender, name: (my.call.gives || {}).name || my.call.name, onDone: fin,
            onNoVoice: () => { if (P === my && !my.noVoice) { my.noVoice = true; my.speak = false; pcControls(); } } });
    }
    function callerSays(text, end) {
        const my = P, line = { who: 'caller', text, at: Date.now() };
        my.msgs.push(line); pcTr();
        if (end) my.closing = true;
        my.replyStart = null;
        sayAloud(text, () => { line.end = Date.now(); if (P !== my || my.ended) return; if (end) return pcEnd('caller'); yourTurn(); });
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
        const now = Date.now();
        my.msgs.push({ who: 'you', text, at: now, start: Math.min(now, my.replyStart || now), spoken: my.micUsed });
        my.replyStart = null; my.micUsed = false;
        if (my.pack && !my.opened) { my.opened = true; pcTr(); pcStatus(''); return callerSays(my.call.opening, false); }   // a line's caller opens with their own words
        my.busy = true; pcTr(); pcStatus(''); pcControls();
        const reqNo = ++my.req;
        const r = await askWithRetry('caller', my.pack ? packs().callerPrompt(my.call) : callerPrompt(my.call), apiMessages(my), false,
            () => P !== my || my.ended || my.req !== reqNo,
            (n) => pcStatus(`The line is busy… retrying (${n} of 3).`, true), my.pack ? packs().aiModule(my.call) : '');
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
        if (P) { P.draft = el.value; if (!P.replyStart && el.value.trim()) P.replyStart = Date.now(); }
        const V = voice(); if (V && V.isListening()) { V.stopListening(); pcControls(); }   // typing takes over from the microphone
    };

    // Standard voice: the trainee's reply by microphone (Chrome/Edge), sent when they pause.
    // Hands-free (on unless the trainee turns it off) listens from the greeting on, after each of the
    // caller's lines; a silence is tried twice more before it asks them to press 🎙 or type.
    function pcListen(greeting) {
        const my = P, V = voice();
        if (!pcOn() || my.transport !== 'standard' || my.busy || my.closing || !V || !V.canListen) return;
        const box = $id('fdd-pc-in'); const before = box ? box.value.trim() : '';
        let blocked = false;
        const ok = V.listen({
            onText: (t) => { const b = $id('fdd-pc-in'); if (b && P === my) { b.value = (before ? before + ' ' : '') + t; my.draft = b.value; if (!my.replyStart) my.replyStart = Date.now(); my.micUsed = true; } },
            onEnd: (t) => {
                if (P !== my || my.ended) return;
                pcControls();
                if (blocked) return;
                const b = $id('fdd-pc-in');
                if (t && b && b.value.trim()) { my.silences = 0; fddPracticeSend(); }
                else if (my.hands && (my.silences || 0) < 2 && !my.busy && !my.afterSpeak) { my.silences = (my.silences || 0) + 1; pcListen(greeting && !my.msgs.length); }
                else { my.silences = 0; pcStatus('Didn\'t catch that. Press 🎙 and talk, or type your reply.'); }
            },
            onBlocked: () => { blocked = true; if (P === my) { my.hands = false; pcStatus('The microphone is blocked. Allow it in the browser\'s address bar, or type your reply.', true); pcControls(); } }
        });
        if (ok) { pcStatus(greeting ? '🎙 Listening… greet the caller (it sends when you pause).' : '🎙 Listening… speak now (it sends when you pause).'); pcControls(); }
    }
    window.fddPracticeTalk = function () {
        const V = voice(); if (!pcOn() || !V || P.transport !== 'standard') return;
        if (V.isListening()) { V.stopListening(true); return; }
        if (P.afterSpeak) { V.stopSpeaking(); P.afterSpeak = null; }   // talking over the caller
        P.silences = 0;
        pcListen(!P.msgs.length);
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
        if (P.pack) {
            const ring = !P.answered && (!P.out || P.dialing);
            el.className = 'fdd-pc-id' + (ring ? ' ringing' : '');
            el.innerHTML = `<div class="av">${P.answered ? '👤' : '📞'}</div><div class="who"><b>${P.answered ? 'On the line' : P.out ? (P.dialing ? 'Calling…' : 'Your call') : 'Incoming call…'}</b><span>${esc(packWho(P))}${P.answered ? ` · ${P.transport === 'live' ? '🎙 live voice' : 'standard voice'}` : ''}</span></div>
                ${P.answered || P.dialing ? '' : `<button class="answer" onclick="fddPracticeAnswer()">${P.out ? '📞 Call' : '📞 Answer'}</button>`}`;
            return;
        }
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
            + (std && V.canListen ? `<button class="${l.hands ? 'on' : ''}" onclick="fddPracticeHands()" title="Listen for your reply after the caller speaks, and send it when you pause">🔁 Hands-free ${l.hands ? 'on' : 'off'}</button>` : '')
            + (std && V.canSpeak ? `<button class="${l.speak ? 'on' : ''}" onclick="fddPracticeSpeaker()" title="Read the caller's lines out loud">${l.speak ? '🔊 Voice on' : '🔇 Voice off'}</button>
                <button onclick="fddPracticeReplay()" ${on && !l.busy && l.msgs.some(m => m.who === 'caller') ? '' : 'disabled'} title="Hear the caller's last line again">↻ Replay</button>` : '')
            + (l.voiceNote ? `<div class="fdd-pc-note">${esc(l.voiceNote)}</div>` : '')
            + (std && l.noVoice ? `<div class="fdd-pc-note">This computer has no voice for the caller: read their lines.</div>` : '')
            + (std && !V.canListen ? `<div class="fdd-pc-note">🎙 To answer by voice instead of typing, use Chrome or Edge.</div>` : '');
        // 🎙 next to the reply box: press and talk (it sends when you pause); press again to send now
        const talk = $id('fdd-pc-talk');
        if (talk) {
            talk.style.display = std && V.canListen ? '' : 'none';
            talk.disabled = !can;
            talk.classList.toggle('rec', !!listening);
            talk.textContent = listening ? '■' : '🎙';
            talk.title = listening ? 'Done talking: send it now' : 'Talk: press, then speak. It sends when you pause.';
            talk.setAttribute('aria-label', talk.title);
        }
    }
    function pcPick() {
        const el = $id('fdd-pick-line'), l = P; if (!l) return;
        if (el) el.innerHTML = pickLine(l.selected);
        const none = $id('fdd-none'); if (none) none.style.cssText = l.selected === 'none' ? 'margin-top:6px;background:#ecfdf5;border-color:#10b981' : 'margin-top:6px';
        paintResults(); pcWrapButton();
    }
    function pickLine(sel) {
        if (!sel) return 'No file opened yet. Search above: names are found even when they\'re spelled the way they sound.';
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
            <ul>${(F.rules || []).map(r => `<li>${esc(r)}</li>`).join('')}</ul>
            ${(F.sop || []).length ? `<p style="margin:8px 0 0;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#64748b">Reception SOP</p><ul>${F.sop.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}</details>`;
    }

    function practiceHTML() {
        const l = P;
        return `${l.pack ? briefHTML(l) : ''}<div id="fdd-pc-id"></div>
            <p id="fdd-pc-status" class="${l.warn ? 'warn' : ''}">${esc(l.status)}</p>
            <div class="fdd-sec" style="padding:8px 10px"><div class="fdd-tx" id="fdd-pc-tr"></div>
              <div class="fdd-comp"><button class="mic" id="fdd-pc-talk" onclick="fddPracticeTalk()" disabled>🎙</button><textarea id="fdd-pc-in" maxlength="1000" placeholder="${voice() && voice().canListen ? 'Press 🎙 and talk, or type what you say to the caller…' : 'Type what you say to the caller…'}" onkeydown="fddPracticeKey(event)" oninput="fddPracticeInput(this)"></textarea>
                <button class="send" id="fdd-pc-send" onclick="fddPracticeSend()" disabled>Send</button></div>
              <div class="fdd-ctl" id="fdd-pc-ctl"></div></div>
            <button class="fdd-hang" onclick="fddPracticeHangUp()">✆ Hang up</button>
            ${!l.pack || l.call.doc ? findHTML(l, 'Find the file') + directoryHTML() : ''}`;
    }

    /* ---------- practice: what's checked from the call itself ---------- */
    // Authentication, as on the firm's RECEPTION MOCK CALL scorecard (Name, DOL, DOB, Claim No, Case No):
    // a caller asking about a case gives their full name, date of birth, the date of the accident and one
    // more identifier on file (claim #, case #, address or SSN last 4); an authorized caller also says who
    // they are to the client. An identifier counts when the receptionist asked for it in their own words,
    // or when the caller gave it without being asked.
    const ID_LABEL = { name: 'Full name', dob: 'Date of birth', dol: 'Date of the accident (DOL)', claim: 'Claim number', caseno: 'Case number',
        address: 'Address', ssn4: 'SSN last 4', relationship: 'Relationship to the client', callback: 'Callback number' };
    const EXTRA = ['claim', 'caseno', 'address', 'ssn4'];
    function authGroups(c) {
        if (PERSONAL.includes(c.auth)) return [['name']].concat(c.auth === 'authorized' ? [['relationship']] : [], [['dob'], ['dol'], EXTRA]);
        return c.auth === 'unauthorized' ? [['name'], ['relationship']] : [['name'], ['callback']];
    }
    const groupLabel = (keys) => keys.length > 1 ? 'one more identifier on file (claim #, case #, address or SSN last 4)' : ID_LABEL[keys[0]].replace(/^\w/, ch => ch.toLowerCase());
    const digitsOf = (v) => String(v == null ? '' : v).replace(/\D/g, '');
    const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    // A date the caller said ("03/22/1988", "March 22nd, 1988"): its month and day are both there.
    function saidDate(text, date) {
        const m = String(date || '').match(/^(\d{1,2})\/(\d{1,2})\/\d{2,4}$/); if (!m) return false;
        const t = String(text || '').toLowerCase(), mo = Number(m[1]), d = Number(m[2]);
        return new RegExp(`\\b0?${mo}[/.-]0?${d}\\b`).test(t) || (new RegExp(`\\b${MONTHS[mo - 1]}`).test(t) && new RegExp(`\\b0?${d}(st|nd|rd|th)?\\b`).test(t));
    }
    function idsGot(l) {
        const c = l.call, g = c.gives || {}, k = caseOf(c.mock);
        const you = l.msgs.filter(m => m.who === 'you').map(m => m.text).join('\n');
        const said = l.msgs.filter(m => m.who === 'caller').map(m => m.text).join('\n'), low = said.toLowerCase(), sd = digitsOf(said);
        const asked = new Set(heardAsks(you).concat(Object.keys(HEARD_MORE).filter(key => HEARD_MORE[key].test(you))));
        const given = new Set();
        const name = heardAs(g.name || '').toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 3);
        if (name.length && name.every(w => low.includes(w))) given.add('name');
        const cb = digitsOf(g.callback); if (cb.length >= 7 && sd.includes(cb.slice(-7))) given.add('callback');
        if (saidDate(said, g.dob)) given.add('dob');
        if (k) {
            const cn = digitsOf(k.caseNumber); if (cn.length >= 6 && sd.includes(cn.slice(-6))) given.add('caseno');
            if ((k.bi || []).concat(k.pipum || []).some(x => digitsOf(x.claim).length >= 5 && sd.includes(digitsOf(x.claim)))) given.add('claim');
            if (saidDate(said, k.dateOfLoss)) given.add('dol');
        }
        if (/\b(i'?m (his|her|their|the client'?s?)|my (son|daughter|child|mother|father|mom|dad|wife|husband|brother|sister|grand\w+|client|patient|insured)|on behalf of|power of attorney)\b/i.test(said)) given.add('relationship');
        return { asked, given };
    }
    function authCheck(l) {
        const c = l.call, { asked, given } = idsGot(l);
        const groups = authGroups(c).map(keys => {
            const hit = keys.find(key => asked.has(key)) || keys.find(key => given.has(key));
            return { keys, ok: !!hit, hit: hit || '', by: !hit ? '' : asked.has(hit) ? 'asked' : 'given' };
        });
        const got = groups.filter(x => x.ok).length, personal = PERSONAL.includes(c.auth), full = got === groups.length;
        const missing = groups.filter(x => !x.ok).map(x => groupLabel(x.keys));
        return { groups, got, full, personal, missing, score: Math.round(5 * got / groups.length),
            note: full ? (personal ? 'You got the name, date of birth, date of the accident and one more identifier on file.' : 'You got what this caller needed.')
                : `Missing: ${missing.join(', ')}.` };
    }

    const FILLER = /\b(u+m+|u+h+m*|e+rm|a+h+|h+m{2,}|you know|i mean)\b/gi;
    const HOLD = /\b(one moment|a moment|one second|a second|a minute|on hold|hold on|please hold|bear with me|let me (check|look|pull|see|find|get|verify|confirm)|give me a (sec|second|moment|minute))\b/i;
    const wordCount = (t) => (String(t || '').match(/[A-Za-z0-9']+/g) || []).length;
    const firstWords = (t, n) => { const w = String(t || '').split(/\s+/).filter(Boolean); return w.slice(0, n).join(' ') + (w.length > n ? '…' : ''); };
    // When the receptionist started a reply: the first keystroke or word heard (standard voice); on live
    // voice, when the line first showed, or its last update less the time it takes to say it.
    const replyStart = (m) => m.start || (m.at ? Math.min(m.at, (m.upd || m.at) - wordCount(m.text) * 400) : null);
    function autoChecks(l) {
        const c = l.call, you = l.msgs.filter(m => m.who === 'you');
        // the opening spiel: thanks, the firm's name, your name
        const first = you.length ? you[0].text : '';
        const firm = /legal support help|\blsh\b|training law group/i.test(first) || first.toLowerCase().includes(firmName().toLowerCase());
        const thanks = /thank(s| you) for calling|good (morning|afternoon|evening|day)/i.test(first);
        const self = /\b(this is|my name is|you'?re (speaking|talking) (with|to)|i'?m|i am)\s+(?!(the|a|an|front|reception|legal|lsh|training|calling|here|glad|happy|sorry|so|just|going|not|regarding|about|your|our|my|with|from)\b)[a-z]+/i.test(first)
            || /\b(?!(desk|help|reception|group|lsh|office)\b)[a-z]+ speaking\b/i.test(first);
        const intro = { score: (thanks ? 1 : 0) + (firm ? 2 : 0) + (self ? 2 : 0) };
        intro.note = !you.length ? 'You didn\'t say anything.' : intro.score === 5 ? 'You thanked the caller, named the firm and gave your name.'
            : `Missing: ${[!thanks && 'thanking the caller', !firm && 'the firm\'s name', !self && 'your name'].filter(Boolean).join(', ')}. Open with “Thank you for calling Legal Support Help. This is (your name).”`;
        // the closing spiel: more help, thanks, goodbye
        const tail = you.slice(-2).map(m => m.text).join(' ');
        const more = /anything else|something else|any other (question|concern)|else (i|we) can (help|assist|do)/i.test(tail);
        const thank = /thank(s| you)/i.test(tail);
        const bye = /\b(good)?-? ?bye\b|have a (good|great|nice|wonderful|blessed|lovely|safe)|take care|enjoy (the|your)/i.test(tail);
        const closing = { score: (more ? 2 : 0) + (thank ? 1 : 0) + (bye ? 2 : 0) };
        closing.note = closing.score === 5 ? 'You offered more help, thanked the caller and said goodbye.'
            : `Missing: ${[!more && 'offering more help (“Is there anything else I can help you with?”)', !thank && 'thanking the caller', !bye && 'a goodbye'].filter(Boolean).join(', ')}.`;
        // silences: from the end of the caller's line to the start of the reply (not after "one moment, please")
        const gaps = []; let callerEnd = null, callerText = '', prevYou = '';
        l.msgs.forEach(m => {
            if (m.who === 'caller') { callerEnd = m.end || m.upd || m.at || null; callerText = m.text; return; }
            if (m.who !== 'you') return;
            const st = replyStart(m);
            if (callerEnd && st) gaps.push({ secs: Math.round((st - callerEnd) / 1000), hold: HOLD.test(prevYou), after: callerText });
            callerEnd = null; prevYou = m.text;
        });
        const limit = l.usedLive ? 8 : 10;
        const greet = you.length && l.t0 && replyStart(you[0]) ? Math.max(0, Math.round((replyStart(you[0]) - l.t0) / 1000)) : 0;
        const dead = gaps.filter(g => !g.hold && g.secs > limit), longHold = gaps.filter(g => g.hold && g.secs > 60);
        const words = you.reduce((n, m) => n + wordCount(m.text), 0);
        const fillers = you.map(m => m.text.match(FILLER) || []).reduce((a, b) => a.concat(b), []);
        const rate = words ? fillers.length / words * 100 : 0, silences = dead.length + (greet > 6 ? 1 : 0);
        const deadair = { score: Math.max(0, 5 - Math.min(3, silences) - (rate > 5 ? 2 : rate > 2 ? 1 : 0)) };
        deadair.note = [
            silences ? [greet > 6 ? `${greet} s before your greeting` : ''].concat(dead.slice(0, 2).map(g => `${g.secs} s of silence after “${firstWords(g.after, 8)}”`)).filter(Boolean).join('; ')
                + '. Keep the caller with you (“One moment while I pull up your file.”).' : 'No long silences.',
            fillers.length ? `${fillers.length} filler${fillers.length === 1 ? '' : 's'} (${[...new Set(fillers.map(f => f.toLowerCase()))].slice(0, 4).join(', ')}).` : 'No fillers.'
        ].join(' ');
        // time management: answered on the first ring, a focused call, no long holds
        const answer = l.ringAt && l.t0 ? Math.max(0, Math.round((l.t0 - l.ringAt) / 1000)) : 0;
        const secs = Math.max(0, Math.round(((l.t1 || Date.now()) - (l.t0 || Date.now())) / 1000));
        const time = { score: Math.max(0, 5 - (answer > 7 ? 2 : answer > 3 ? 1 : 0) - (secs > 720 ? 2 : secs > 480 ? 1 : 0) - (longHold.length ? 1 : 0)) };
        time.note = `Answered in ${answer} s${answer > 3 ? ' (the firm\'s policy is one ring, about 3 s)' : ', on the first ring'}; the call took ${fmtSec(secs)}${secs > 480 ? ' (keep it focused: verify, answer or take the message, close)' : ''}${longHold.length ? `; the caller waited ${longHold[0].secs} s on hold without hearing from you` : ''}.`;
        const auth = authCheck(l);
        return { intro, auth, closing, time, deadair, answer, secs, file: { ok: l.selected === (c.mock || 'none') },
            spoken: !!(l.usedLive || you.some(m => m.spoken)) };
    }
    function authHTML(l) {
        const a = l.auto.auth, c = l.call;
        const chips = a.groups.map(x => `<span class="fdd-id ${x.ok ? 'ok' : 'miss'}">${x.ok ? '✓' : '✗'} ${esc(x.keys.length > 1 ? (x.ok ? 'One more: ' + ID_LABEL[x.hit] : 'One more identifier on file') : ID_LABEL[x.keys[0]])}${x.by === 'given' ? ' (they gave it)' : ''}</span>`).join('');
        const needs = a.personal ? 'A caller asking about a case: full name, date of birth, the date of the accident, and one more identifier on file (claim #, case #, address or SSN last 4)' + (c.auth === 'authorized' ? ', and who they are to the client.' : '.')
            : c.auth === 'unauthorized' ? 'What this caller needed: their name and their relationship to the client.' : 'What this caller needed: their name and a callback number.';
        return `<div class="fdd-ids">${chips}</div>
            <div class="fdd-authv ${a.full ? 'ok' : a.got ? 'mid' : 'bad'}">${a.full ? `✓ <b>${a.personal ? 'Fully authenticated.' : 'Complete.'}</b> You got every identifier this call needed.` : `✗ <b>Not fully authenticated.</b> Missing: ${esc(a.missing.join(', '))}.`}</div>
            <p style="margin:6px 0 0;font-size:11.3px;color:#64748b;line-height:1.45">${esc(needs)} Checked from what was said on the call.</p>`;
    }

    function pcWrapHTML() {
        const l = P, secs = Math.round(((l.t1 || Date.now()) - (l.t0 || Date.now())) / 1000);
        l.auto = autoChecks(l);
        return `<div class="fdd-fb mid" style="margin-bottom:10px"><b>${l.ended === 'caller' ? 'The caller hung up.' : l.ended === 'time' ? 'The call reached its time limit.' : 'Call ended.'}</b> ⏱ ${fmtSec(secs)}. Wrap it up the way you would at the desk, then get your debrief.</div>
            ${findHTML(l, '1 · Which file was this call about?')}
            <div class="fdd-sec"><h4>2 · Authentication (checked from the call)</h4>${authHTML(l)}</div>
            <div class="fdd-sec"><h4>3 · Call note (optional)</h4><textarea class="fdd-note" id="fdd-pc-note" maxlength="1500" placeholder="Who called, what they wanted, what you told them or the message you took, and who it goes to." oninput="fddPracticeNote(this.value)">${esc(l.note)}</textarea></div>
            <button class="fdd-go alt" id="fdd-pc-go" onclick="fddPracticeReview()">Get my debrief →</button>
            <p id="fdd-pc-go-note" style="margin:6px 0 0;font-size:11.5px;color:#92400e">${esc(pcGoNote())}</p>
            <details class="fdd-sec" style="margin-top:10px"><summary style="cursor:pointer;font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b">Transcript</summary><div class="fdd-tx" style="max-height:none">${trHTML(l.msgs)}</div></details>`;
    }
    const pcGoNote = () => !P ? '' : [(!P.pack || P.call.doc) && !P.selected ? 'No file matched yet: the debrief counts the file as not found. Search above, or choose “No matching case on file”.' : '',
        P.pack && P.graded && packs().noteOf(P.call) && noteWritten(P).length < 30 ? 'Write the note first: it\'s graded with the call.' : ''].filter(Boolean).join(' ');
    function pcWrapButton() { const n = $id('fdd-pc-go-note'); if (n) n.textContent = pcGoNote(); }
    window.fddPracticeNote = function (v) { if (P) { P.note = cut(v, P.pack ? 3000 : 1500); if (P.pack) pcWrapButton(); } };

    /* ---------- practice: the RECEPTION MOCK CALL scorecard ---------- */
    // 14 items, each 0-5. 'auto': checked from the call (above); 'ai': from the review of the transcript.
    const RUBRIC = [
        ['intro', 'Introduction of Law Firm and Name', 'auto'], ['auth', 'Authentication (Name, DOL, DOB, Claim No, Case No.)', 'auto'],
        ['service', 'Customer Service', 'ai'], ['assertive', 'Assertiveness', 'ai'], ['listening', 'Listening Skills', 'ai'],
        ['comprehension', 'Comprehension', 'ai'], ['details', 'Attention to Details', 'ai'], ['resolution', 'Resolution', 'ai'],
        ['transfer', 'Transfer Procedure', 'ai'], ['closing', 'Closing Spiel', 'auto'], ['time', 'Time Management', 'auto'],
        ['deadair', 'Dead Air/Fillers', 'auto'], ['clarity', 'Clarity of Speech (Articulation, Volume, Enunciation)', 'ai'], ['tone', 'Tone of Voice', 'ai']
    ];
    const AI_KEYS = RUBRIC.filter(r => r[2] === 'ai').map(r => r[0]);
    const CORE_AI = ['service', 'assertive', 'listening', 'comprehension', 'details', 'resolution'];

    const transcriptText = (l) => l.msgs.map(m => m.who === 'caller' ? `Caller: ${m.text}` : m.who === 'you' ? `Receptionist: ${m.text}` : `(${m.text})`).join('\n');
    const REVIEW_SYSTEM = 'You coach receptionists in training at a personal injury law firm. You score one practice phone call on the firm\'s RECEPTION MOCK CALL scorecard, against the firm\'s front-desk rules, its reception SOP and the answer key, and you reply with JSON only. Be specific and fair: refer to what the receptionist actually said. Judge only what is in the transcript and the wrap-up; the receptionist could not see the answer key. The transcript may come from speech recognition, so ignore small transcription slips. Write to the receptionist as "you". Never mention AI, models or prompts.';
    function reviewPrompt(l) {
        const c = l.call, k = caseOf(c.mock), F = window.MOCK_FIRM || {}, g = c.gives || {}, a = l.auto;
        const picked = l.selected === 'none' ? 'not in the system' : l.selected ? `${l.selected}${caseOf(l.selected) ? ' · ' + caseOf(l.selected).client.name : ''}` : 'none';
        let tx = transcriptText(l); if (tx.length > 16000) tx = '…' + tx.slice(-16000);
        return `FIRM FRONT-DESK RULES
${(F.rules || []).map(r => '- ' + r).join('\n')}

RECEPTION SOP
${(F.sop || []).map(r => '- ' + r).join('\n')}

DIRECTORY
${(F.directory || []).map(d => `- ${d.name}, ${d.role}, ext ${d.ext}`).join('\n')}

ANSWER KEY FOR THIS CALL
Caller: ${g.name || 'unknown'}${g.relationship ? ` (${g.relationship})` : ''}
Caller's file: ${k ? `${k.id} · ${k.client.name} · case ${k.caseNumber || ''} · DOL ${k.dateOfLoss} · status ${k.phase}` : 'none: the caller is not in the system'}
Who the caller is: ${authLabel(c.auth)}
${k && k.reception ? `On the file: ${k.reception.verify}\n` : ''}Identifiers the receptionist had to get: ${a.auth.personal ? 'full name, date of birth, date of the accident and one more identifier on file (claim #, case #, address or SSN last 4)' + (c.auth === 'authorized' ? ', and the relationship to the client' : '') : needFor(c)}
The right way to handle it: ${c.actions[c.answer]}
Why: ${c.why}
Wrong ways (for reference): ${c.actions.filter((_, i) => i !== c.answer).join(' | ')}

TRANSCRIPT (${a.spoken ? 'a spoken call' : 'a typed call: the receptionist typed their side'})
${tx}

THE RECEPTIONIST'S WRAP-UP (after the call)
File they matched: ${picked}${a.file.ok ? ' (the right file)' : ' (not the caller\'s file)'}
Their call note: ${l.note.trim() || '(none)'}

ALREADY SCORED FROM THE CALL (don't rate these again; mention them in the verdict only if they matter)
- Introduction of Law Firm and Name: ${a.intro.score}/5. ${a.intro.note}
- Authentication: ${a.auth.score}/5. ${a.auth.note}
- Closing Spiel: ${a.closing.score}/5. ${a.closing.note}
- Time Management: ${a.time.score}/5. ${a.time.note}
- Dead Air/Fillers: ${a.deadair.score}/5. ${a.deadair.note}

RATE THESE from 0 to 5 (5: what a senior receptionist would do; 4: good, small gaps; 3: acceptable; 2: needs work; 1: poor; 0: not done at all):
- service (Customer Service): courteous, patient and helpful; acknowledged the caller's concern; the caller felt taken care of.
- assertive (Assertiveness): polite but in control of the call; held the firm's rules (verification, what may not be shared) without giving in or being rude; guided the caller to the next step.
- listening (Listening Skills): picked up what the caller said and asked; didn't make them repeat themselves; answered their actual question.
- comprehension (Comprehension): understood the request and the file (status, who's who) and gave only correct information.
- details (Attention to Details): caught the details: names (spelled and read back when they're hard), numbers, identifiers that don't match the file, the right file when names repeat; read back the callback number; a complete message when one was needed.${a.file.ok ? '' : ' They matched the wrong file, or none: at most 2.'}
- resolution (Resolution): reached the right outcome from the key, or the right next step, and the caller knew what happens next.
- transfer (Transfer Procedure): when the call needed a transfer or routing to someone: the right person from the directory, the caller told who they're being put through to, and the person taking it told the caller's name and reason (SOP). null when no transfer or routing was needed.
- clarity (Clarity of Speech): ${a.spoken ? 'from the transcript of what they said: clear, complete sentences, no garbled or trailing phrases.' : 'null: this call was typed.'}
- tone (Tone of Voice): ${a.spoken ? 'from what they said: warm, calm and professional (the transcript can\'t carry the voice itself, so judge the wording).' : 'null: this call was typed.'}

Reply with exactly this JSON:
{"ratings": {"service": 0, "assertive": 0, "listening": 0, "comprehension": 0, "details": 0, "resolution": 0, "transfer": 0, "clarity": 0, "tone": 0}, "notes": {"service": "", "assertive": "", "listening": "", "comprehension": "", "details": "", "resolution": "", "transfer": "", "clarity": "", "tone": ""}, "breach": false, "breachNote": "", "verdict": "", "strengths": [""], "improve": [""], "betterLine": ""}
- ratings: whole numbers from 0 to 5, or null where it says null. notes: one short sentence each, on what they did.
- breach: true if the receptionist disclosed case information (even confirming the person is a client) to a caller who was not verified or not authorized, read an identifier out to the caller, gave out any part of a Social Security number, or gave legal advice, a case value or a settlement opinion. breachNote: what was disclosed, or "".
- verdict: one sentence overall. strengths and improve: 1 to 3 short points each.
- betterLine: one thing they could have said, word for word, at the moment it mattered most.`;
    }
    function parseReview(text, spoken) {
        const t = String(text || '').replace(/```(?:json)?/gi, '');
        const a = t.indexOf('{'), b = t.lastIndexOf('}');
        if (a < 0 || b <= a) return null;
        let j; try { j = JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
        if (!j || typeof j !== 'object') return null;
        const r = j.ratings && typeof j.ratings === 'object' ? j.ratings : {}, n = j.notes && typeof j.notes === 'object' ? j.notes : {};
        const rate = (v) => v == null || v === '' || /^n\/?a$/i.test(String(v)) || !isFinite(Number(v)) ? null : Math.max(0, Math.min(5, Math.round(Number(v))));
        const ratings = {}, notes = {};
        AI_KEYS.forEach(key => { ratings[key] = rate(r[key]); notes[key] = cut(n[key], 300); });
        if (!spoken) ratings.clarity = ratings.tone = null;
        if (CORE_AI.filter(key => ratings[key] == null).length > 1) return null;   // not a scorecard
        const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(x => cut(x, 300)).filter(Boolean).slice(0, 3);
        return { ratings, notes, breach: j.breach === true || j.breach === 'true', breachNote: cut(j.breachNote, 400), verdict: cut(j.verdict, 400),
            strengths: list(j.strengths), improve: list(j.improve), betterLine: cut(j.betterLine, 400) };
    }
    // The scorecard: each item 0-5, null when it doesn't apply, undefined while the review isn't in.
    // The score is the share of the points on the items that have one. A disclosure scores
    // Authentication and Resolution 0; the wrong file caps Attention to Details at 2.
    function pcScore(l) {
        const c = l.call, a = l.auto, rv = l.review;
        const items = RUBRIC.map(([key, label, how]) => {
            let s, note = '';
            if (how === 'auto') { s = a[key].score; note = a[key].note; }
            else if (rv) { s = rv.ratings[key]; note = rv.notes[key] || ''; }
            if ((key === 'clarity' || key === 'tone') && !a.spoken) { s = null; note = 'Rated on spoken calls only: this call was typed.'; }
            if (key === 'transfer' && rv && s == null && !note) note = 'No transfer was needed on this call.';
            if (key === 'details' && typeof s === 'number' && !a.file.ok && s > 2) { s = 2; note = (note ? note + ' ' : '') + 'The file you matched isn\'t the caller\'s.'; }
            if (rv && rv.breach && (key === 'auth' || key === 'resolution')) { s = 0; note = `Disclosure: ${rv.breachNote || 'information was shared that shouldn\'t have been'}.`; }
            return { key, label, how, s, note };
        });
        const rated = items.filter(i => typeof i.s === 'number'), pts = rated.reduce((n, i) => n + i.s, 0);
        const of = (key) => items.find(i => i.key === key).s;
        return { id: c.id, mock: c.mock, mode: 'practice', voice: l.usedLive ? 'live' : 'standard', partial: !rv, items,
            find: a.file.ok, authOk: a.auth.full, breach: !!(rv && rv.breach), secs: a.secs, answerSecs: a.answer,
            score: rated.length ? Math.round(pts / (5 * rated.length) * 100) : 0, points: pts, outOf: 5 * rated.length,
            authPct: Math.round(of('auth') / 5 * 100), actionPct: typeof of('resolution') === 'number' ? Math.round(of('resolution') / 5 * 100) : 0 };
    }
    // The debrief shows the items checked from the call at once; the reviewed items follow. If the review
    // can't be had, those five stay on screen with a way to try again, and the call is saved once it comes.
    window.fddPracticeReview = async function () {
        const my = P; if (!my || !my.ended || my.reviewing || my.review) return;
        if (my.pack) return packReview(my);
        my.auto = autoChecks(my); my.result = pcScore(my);
        my.reviewing = true; my.reviewError = null; screen = 'pcdebrief'; paint();
        const top = () => { const b = $id('fdd-panel').querySelector('.fdd-b'); if (b) b.scrollTop = 0; };
        top();
        const r = await askWithRetry('review', REVIEW_SYSTEM, [{ role: 'user', text: reviewPrompt(my) }], true, () => P !== my);
        if (!r) return;
        my.reviewing = false;
        const rv = r.ok ? parseReview(r.text, my.auto.spoken) : null;
        if (!rv) { my.reviewError = r.ok ? 'The review came back unreadable.' : r.error; paint(); return; }
        my.review = rv; my.result = pcScore(my); paint(); top();
        savePractice(my);
    };
    window.fddPracticeBackToWrap = function () { if (P && !P.review && !P.reviewing) { screen = 'pcwrap'; paint(); } };
    async function savePractice(l) {
        const r = l.result, rv = l.review;
        const detail = Object.assign({}, r, { items: r.items.map(i => ({ k: i.key, s: i.s === undefined ? null : i.s, n: cut(i.note, 240) })),
            picked: { selected: l.selected }, auth: { got: l.auto.auth.groups.filter(x => x.ok).map(x => x.hit), missing: l.auto.auth.missing },
            turns: l.msgs.filter(m => m.who === 'you').length, note: cut(l.note, 1500),
            review: { breach: rv.breach, breachNote: rv.breachNote, verdict: rv.verdict, strengths: rv.strengths, improve: rv.improve, betterLine: rv.betterLine }, transcript: '' });
        const full = transcriptText(l);
        detail.transcript = full.length > 9000 ? '…' + full.slice(-9000) : full;
        while (JSON.stringify([detail]).length > 19000 && detail.transcript.length > 500) detail.transcript = '…' + detail.transcript.slice(-Math.floor(detail.transcript.length * 0.7));
        l.saved = 'saving'; paintSaved();
        try {
            const res = await fetch('/api/drill-results', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ mode: 'practice', program: l.program, calls: 1, details: [detail], score: r.score,
                    findPct: r.find ? 100 : 0, authPct: r.authPct, actionPct: r.actionPct, avgSeconds: r.secs })
            });
            const data = await res.json().catch(() => ({}));
            l.saved = data && data.success ? 'saved' : 'failed';
        } catch (e) { l.saved = 'failed'; }
        paintSaved(); loadHistory();
    }
    function paintSaved() {
        const el = $id('fdd-pc-saved'), l = P; if (!el || !l) return;
        el.style.color = l.saved === 'failed' ? '#b91c1c' : '#047857';
        el.textContent = l.saved === 'saving' ? 'Saving…' : l.saved === 'saved' ? '✓ Saved to your results (your trainer sees them too).' + (l.pack ? countedText(l) : '') : l.saved === 'failed' ? 'Couldn\'t save this result. Check your connection.' : '';
    }

    function rubricHTML(r) {
        return `<table class="fdd-rub"><tbody>${r.items.map((i, n) => {
            const num = typeof i.s === 'number';
            return `<tr><td class="n">${n + 1}</td><td><b>${esc(i.label)}</b><span class="how ${i.how === 'ai' ? 'ai' : ''}">${i.how === 'ai' ? 'review' : 'from the call'}</span>${i.note ? `<span class="nt">${esc(i.note)}</span>` : ''}</td>
                <td class="s ${num ? (i.s <= 2 ? 'lo' : '') : 'na'}">${num ? `${i.s}/5` : i.s === null ? 'N/A' : '…'}</td></tr>`;
        }).join('')}</tbody></table>`;
    }
    // The next Core caller at the same level (none after the last one).
    const coreNext = (c) => { const l = coreCalls(c.level), i = l.findIndex(x => x.id === c.id); return i >= 0 ? l[i + 1] || null : null; };
    function pcDebriefHTML() {
        const l = P, c = l.call, k = caseOf(c.mock), a = l.auto, r = l.result, rv = l.review;
        if (!a || !r) return '';
        const cls = r.score >= 85 ? 'ok' : r.score >= 60 ? 'mid' : 'bad';
        const li = (x) => x.length ? `<ul>${x.map(v => `<li>${esc(v)}</li>`).join('')}</ul>` : '';
        const res = r.items.find(i => i.key === 'resolution').s, au = r.items.find(i => i.key === 'auth').s;
        const authLine = c.auth === 'failed'
            ? `The caller's details don't match the file, so they couldn't be verified and nothing about the case could be shared. ${a.auth.full ? 'You asked for everything you needed to find that out.' : a.auth.note}`
            : `${authLabel(c.auth)}. ${a.auth.full ? (a.auth.personal ? 'Fully authenticated.' : 'You got what this caller needed.') : 'Not fully authenticated. ' + a.auth.note}`;
        const status = l.reviewing ? `<div class="fdd-fb mid"><b>📝 Reviewing your call…</b> The items checked from the call are in; the rest takes a few seconds.</div>`
            : !rv ? `<div class="fdd-fb bad"><b>The rest of the scorecard didn't load.</b> ${esc(l.reviewError || '')} The items checked from the call are below. This call is saved once the review comes through.
                <button class="fdd-go alt" onclick="fddPracticeReview()">Try the review again</button><button class="fdd-go" onclick="fddPracticeBackToWrap()">← Back to the wrap-up</button></div>` : '';
        return `<div class="fdd-sec" style="text-align:center"><div style="font-size:10.5px;font-weight:800;letter-spacing:.08em;color:#64748b;text-transform:uppercase">Reception mock call</div>
                <div class="fdd-score">${r.score}/100</div>
                <div style="color:#64748b">${rv ? '' : 'So far: the items checked from the call · '}${r.points}/${r.outOf} points · ⏱ ${fmtSec(r.secs)} · answered in ${r.answerSecs} s</div>
                <div class="fdd-grid"><div><span>File</span><b>${r.find ? '✓' : '✗'}</b></div><div><span>Authentication</span><b>${au}/5</b></div><div><span>Resolution</span><b>${typeof res === 'number' ? res + '/5' : '…'}</b></div><div><span>Replies</span><b>${l.msgs.filter(m => m.who === 'you').length}</b></div></div>
                <div id="fdd-pc-saved" style="font-size:11.5px"></div></div>
            ${status}
            ${rv && rv.breach ? `<div class="fdd-fb bad"><div class="fdd-breach" style="margin:0">⚠ Disclosure: ${esc(rv.breachNote || 'information was shared that shouldn\'t have been')}. Authentication and Resolution score 0.</div></div>` : ''}
            <div class="fdd-sec"><h4>Scorecard</h4>${rubricHTML(r)}</div>
            <div class="fdd-fb ${cls}">
                <div>${r.find ? '✓' : '✗'} <b>File:</b> ${k ? `${esc(k.id)} · ${esc(k.client.name)} (${esc(k.caseNumber || '')}, DOL ${esc(k.dateOfLoss)})` : 'not in the system'}${r.find ? '' : ` (you ${l.selected ? `picked ${esc(l.selected === 'none' ? 'not in the system' : l.selected)}` : 'didn\'t match a file'})`}</div>
                <div>${a.auth.full ? '✓' : '✗'} <b>Authentication:</b> ${esc(authLine)}</div>
                <div style="margin-top:6px"><b>The key:</b> ${esc(c.actions[c.answer])}</div>
                <div style="margin-top:3px;color:#334155">${esc(c.why)}</div>
                ${k && k.reception ? `<div style="margin-top:5px;color:#64748b;font-size:11.5px"><b>On file:</b> ${esc(k.reception.verify)}</div>` : ''}</div>
            ${rv ? `<div class="fdd-sec fdd-rv"><h4>Debrief</h4>
                ${rv.verdict ? `<p style="margin:0 0 6px"><b>${esc(rv.verdict)}</b></p>` : ''}
                ${rv.strengths.length ? `<div style="font-weight:700;color:#047857">What went well</div>${li(rv.strengths)}` : ''}
                ${rv.improve.length ? `<div style="font-weight:700;color:#b45309">To work on</div>${li(rv.improve)}` : ''}
                ${rv.betterLine ? `<div class="better"><b>Try saying:</b> “${esc(rv.betterLine)}”</div>` : ''}</div>` : ''}
            <details class="fdd-sec"><summary style="cursor:pointer;font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b">Transcript${l.note ? ' and your note' : ''}</summary>
                <div class="fdd-tx" style="max-height:none">${trHTML(l.msgs)}</div>${l.note ? `<p style="margin:6px 0 0;font-size:12px"><b>Your note:</b> ${esc(l.note)}</p>` : ''}</details>
            ${coreNext(c) ? `<button class="fdd-go alt" onclick="fddPracticeStart('${esc(coreNext(c).id)}')">📞 Next caller: ${esc(coreNext(c).id)}</button>` : ''}
            <button class="fdd-go" style="background:#475569" onclick="fddPracticeStart('${esc(c.id)}')">↻ Take this call again</button>
            <button class="fdd-go" onclick="fddResults()">My results</button>
            <div id="fdd-pc-hist" style="margin-top:10px">${historyHTML()}</div>`;
    }


    /* =========================================================
       CALL LINES (call-packs.js): Standard Training's ☎ Reception, 🗓 Calendar
       Management and 📋 Intake Mock Calls, Case Management, Property Damage and
       EA / PA. A line's call runs on the same phone as a Core callers practice
       call (P.pack: live voice, or the standard voice), as practice (a caller you
       pick, with the brief and the goals) or graded (numbered calls, Graded call
       1, 2…, the same for everyone; who's calling isn't shown until the debrief). The caller speaks first on a call you place; on a
       call you answer, they open once you've greeted them. After the call: the
       file (Standard Training calls are about Training Library files), the note
       the line asks for, and a debrief on the call's goals (/api/call-ai); then
       it's saved with the results (mode 'line' or 'graded').
       ========================================================= */
    const packs = () => window.CALL_PACKS || null;
    let lnView = null;   // the home screen's call-lines tab: a program, or Reception / Intake / Calendaring across them
    let LN = null;       // the line on the 'line' screen: { program, line, graded }
    function defaultView() {
        const p = String((window.lshProgram && window.lshProgram()) || '').toLowerCase();
        return p === 'cm' || p === 'md' ? 'CM' : p === 'pd' ? 'PD' : p === 'ea' ? 'EA' : 'FT';
    }
    const lineCalls = (l) => packs() ? packs().callsIn(l.program, l.line) : [];
    // A line's graded calls: every caller on it, numbered (Graded call 1, 2…) in a fixed order of their own, not the
    // practice list's, so the number doesn't say who's calling; the same numbers for everyone.
    const hashId = (t) => { let h = 2166136261; for (const ch of String(t)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0; return h; };
    const gradedCalls = (l) => lineCalls(l).slice().sort((a, b) => hashId(a.id) - hashId(b.id) || (a.id < b.id ? -1 : 1));
    const callsFor = (l, mode) => mode === 'graded' ? gradedCalls(l) : lineCalls(l);
    // The call after this one on the line's list (none after the last one).
    const nextOn = (l, mode, id) => { const list = callsFor(l, mode), i = list.findIndex(c => c.id === id); return i >= 0 ? list[i + 1] || null : null; };
    const lineArg = (l) => esc(JSON.stringify([l.program, l.line]));
    const programLabel = (k) => ((packs() && packs().programOf(k)) || {}).label || k;
    function linesHomeHTML() {
        const K = packs(); if (!K) return '';
        const view = lnView || defaultView();
        const rows = K.linesIn(view).map(l => `<div class="fdd-line"><span class="nm">${esc(l.icon)} ${esc(l.line)}${view === l.program ? '' : ` <span class="fdd-tag">${esc(l.program === 'FT' ? 'Standard' : l.program)}</span>`}<small>${lineCalls(l).length} calls</small></span>
            <button onclick="fddOpenLine(${lineArg(l)})">Practice</button><button class="g" onclick="fddLineGraded(${lineArg(l)})">Graded</button></div>`).join('');
        // Calendaring: the calendars the calls are booked on (the CMS's Attorney's Calendar; the Portal's two calendar simulators)
        const row = (name, what, open) => `<div class="fdd-line"><span class="nm">${name}<small>${what}</small></span>${open}</div>`;
        const portal = (path) => `<a href="https://cm-training-activity.pages.dev${path}" target="_blank" rel="noopener">Open ↗</a>`;
        const cal = view !== 'calendaring' ? '' : (typeof window.openAttorneyCalendar === 'function' ? row('🗓 Attorney\'s Calendar', 'book, move and cancel on the attorney\'s week', '<button onclick="fddClose();openAttorneyCalendar()">Open</button>') : '')
            + row('📅 Google Calendar Simulator', 'Standard Training\'s Calendar Management, on the Portal', portal('/simulators/gcal.html?program=FT'))
            + row('🗓 Calendaring Simulator', 'a week full of conflicts, on the Portal', portal('/simulators/calendar.html'));
        return `<div class="fdd-sec"><h4>📞 Call lines</h4>
            <div class="fdd-pick"><span>Calls</span><select id="fdd-calls-view" aria-label="Which calls" onchange="fddLinesView(this.value)">
                <optgroup label="By program">${K.VIEWS.filter(v => v.program).map(v => `<option value="${esc(v.k)}" ${v.k === view ? 'selected' : ''}>${esc(v.icon)} ${esc(K.programOf(v.k).label)}</option>`).join('')}</optgroup>
                <optgroup label="Across programs">${K.VIEWS.filter(v => !v.program).map(v => `<option value="${esc(v.k)}" ${v.k === view ? 'selected' : ''}>${esc(v.icon)} ${esc(v.label)}</option>`).join('')}</optgroup></select></div>
            ${rows}${cal}
            <p style="margin:6px 0 0;font-size:11.5px;color:#64748b;line-height:1.45"><b>Practice:</b> pick a caller, with your brief and what you're scored on; it's saved with your results. <b>Graded:</b> numbered calls, the same for everyone; who's calling isn't shown until the debrief, and it counts in your course.</p></div>`;
    }
    window.fddLinesView = function (k) { lnView = k; paint(); };
    const findLine = (program, line) => (packs() ? packs().LINES : []).find(l => l.program === program && l.line === line) || null;
    window.fddOpenLine = function (program, line, graded) {
        if (Array.isArray(program)) [program, line] = program;
        const l = findLine(program, line); if (!l) return;
        LN = { program: l.program, line: l.line, graded: !!graded };
        if (P && P.pack) endPractice();
        screen = 'line'; paint();
        const b = $id('fdd-panel').querySelector('.fdd-b'); if (b) b.scrollTop = 0;
    };
    // Graded: the line's numbered graded calls, first.
    window.fddLineGraded = function (program, line) {
        if (Array.isArray(program)) [program, line] = program;
        fddOpenLine(program, line, true);
    };
    function lineHTML() {
        const K = packs(), l = LN && findLine(LN.program, LN.line);
        if (!K || !l) return `<p>That line isn't available.</p><button class="fdd-go" onclick="fddHome()">← All call lines</button>`;
        const calls = lineCalls(l), course = l.program === 'FT' ? 'your Standard Training progress' : `your ${programLabel(l.program)} progress`;
        const out = (c) => c.dir === 'out' ? '<span class="fdd-tag">You call</span> ' : '';
        const graded = `<div class="fdd-sec fdd-graded-calls"><h4>🎯 Graded calls (${calls.length})</h4>
                <p style="margin:0 0 4px;font-size:11.5px;color:#64748b;line-height:1.45">Who's calling isn't shown until the debrief${l.program === 'FT' ? ': find their file in the CMS while you talk' : ''}. Each counts toward ${esc(course)}.</p>
                ${gradedCalls(l).map((c, i) => `<div class="fdd-row" data-call="${esc(c.id)}" onclick="fddLineCall('${esc(c.id)}','graded')"><span class="id">#${i + 1}</span><span class="nm">Graded call ${i + 1}</span>
                    <span class="mt">${out(c)}${esc(c.level || '')}</span>${bestHTML(c.id, 'graded')}</div>`).join('')}</div>`;
        const practice = `<div class="fdd-sec fdd-practice-calls"><h4>📞 Practice calls (${calls.length})</h4>
                ${calls.map(c => `<div class="fdd-row" data-call="${esc(c.id)}" onclick="fddLineCall('${esc(c.id)}','practice')"><span class="nm">${esc(c.title)}<br><span class="mt">${esc(c.name)} · ${esc(c.role)}</span></span>
                    <span class="mt">${out(c)}${esc(c.level || '')}</span>${bestHTML(c.id, 'practice')}</div>`).join('')}</div>`;
        // live voice or typing, chosen here (the home screen is only the call lines)
        const live = liveOK() ? `<label class="fdd-live-opt" style="margin:0 0 10px"><input type="checkbox" id="fdd-live" ${livePref() ? 'checked' : ''} onchange="fddSetLive(this.checked)"><span><b>🎙 Live voice calls.</b> The phone rings, you answer and talk, and the caller talks back like a real call. Use a headset and allow the microphone. Turn this off to type instead.</span></label>`
            : `<p class="fdd-live-opt" style="margin:0 0 10px">🎙 Live voice calls need Chrome or Edge with a microphone. In this browser you type instead.</p>`;
        return `<div class="fdd-sec" style="padding-bottom:8px"><h4 style="margin:0">${esc(l.icon)} ${esc(l.line)} · ${esc(programLabel(l.program))}</h4></div>
            ${live}
            ${LN.graded ? graded + practice : practice + graded}
            ${l.tips ? `<details class="fdd-sec fdd-dir"><summary>Tips for this line</summary><ul>${l.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}
            <button class="fdd-go" onclick="fddHome()">← All call lines</button>`;
    }
    // A call on the line: the one picked (with none, the first on its list); graded calls by their number.
    window.fddLineCall = function (id, mode) {
        const K = packs(), l = LN && findLine(LN.program, LN.line); if (!K || !l) return;
        const list = callsFor(l, mode), call = (id && list.find(c => c.id === id)) || list[0];
        if (!call) return;
        const unsaved = call.doc && typeof hasCaseContent === 'function' && hasCaseContent() && typeof currentCaseId !== 'undefined' && currentCaseId === null;
        if (unsaved && !confirm('The call opens case files in the editor, which clears the unsaved case that\'s there now. Start anyway?')) return;
        const box = $id('fdd-live'); if (box) window.fddSetLive(box.checked);
        const V = voice(), note = K.noteOf(call);
        hangUp(); stopTimer(); D = null; endPractice();
        P = { pack: true, graded: mode === 'graded', num: mode === 'graded' ? list.indexOf(call) + 1 : 0, call, out: call.dir === 'out', transport: liveOK() && livePref() && Date.now() > pcLiveOff ? 'live' : 'standard',
            answered: false, dialing: false, opened: false, ringAt: Date.now(), t0: null, t1: null, msgs: [],
            speak: !!(V && V.canSpeak && pcPref('SPEAK', true)), hands: !!(V && V.canListen && pcPref('HANDS', true)),
            selected: null, q: '', note: note ? note.template : '', draft: '', busy: false, closing: false, ended: false, req: 0, muted: false, replyStart: null, micUsed: false,
            status: call.dir === 'out' ? 'Ready when you are: press 📞 Call.' : 'Incoming call… press 📞 Answer.', warn: false, voiceNote: '', program: call.program };
        document.body.classList.add('fdd-on');
        if (typeof closeCallsPanel === 'function') closeCallsPanel();
        screen = 'practice'; paint();
        const b = $id('fdd-panel').querySelector('.fdd-b'); if (b) b.scrollTop = 0;
        if (!P.out && window.LiveCall) window.LiveCall.ring(3);
    };
    // Who the phone shows: on a graded call nobody in particular until the debrief.
    const packWho = (l) => l.graded && !l.review ? (l.out ? l.call.role.replace(/\s*\(you are calling [^)]*\)/i, '') : 'Unknown caller') : `${l.call.name} · ${l.call.role.replace(/\s*\(you are calling [^)]*\)/i, '')}`;
    // The brief, above the phone: your role, what you know, the file or summary you work from, and (practice) the goals.
    function briefHTML(l) {
        const K = packs(), c = l.call, doc = K.docOf(c), file = K.caseOf(c), note = K.noteOf(c), tips = K.tipsOf(c), sc = K.scorecardOf(c);
        const docLine = !doc ? '' : l.graded
            ? `<p class="fdd-bnote">🗂 The call is about one of the Training Library files: get the caller's name, verify them and find their file (search below or at the top).</p>`
            : `<p class="fdd-bnote">🗂 The call is about <b>${esc(doc.title)}</b>. <button class="fdd-chip" onclick="fddPick('${esc(doc.id)}')">Open ${esc(doc.id)}</button></p>`;
        return `<details class="fdd-sec fdd-brief" ${l.answered ? '' : 'open'}><summary>${esc(K.iconOf(c))} ${esc(c.line)} · ${l.graded ? `graded call ${l.num}` : 'practice'}${l.graded ? '' : `: ${esc(c.title)}`}</summary>
            <p>${esc(l.graded && doc ? 'You answer the phone at LSH Training Law Group (fictional). The call is about one of the firm\'s Training Library files.' : c.you)}</p>
            <p><b>${l.graded ? 'When' : 'What you know'}:</b> ${esc(c.facts)}</p>
            ${docLine}
            ${file ? `<details class="fdd-file"><summary>📂 ${esc(file.label)}</summary><pre>${esc(file.text)}</pre></details>` : ''}
            ${l.graded ? '<p class="fdd-bnote">What you\'re scored on is in your debrief.</p>' : `<b>You're scored on</b><ol>${c.goals.map(g => `<li>${esc(g)}</li>`).join('')}${note ? `<li>Documentation: ${esc(note.title)}</li>` : ''}</ol>`}
            ${sc ? `<p class="fdd-bnote fdd-sc-brief">📊 Your debrief is the firm's ${esc(sc.title)} scorecard, each rated 0 to 5: ${sc.metrics.map(m => esc(m.name)).join(' · ')}.</p>` : ''}
            ${tips ? `<b>Tips</b><ul>${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
            ${note ? `<p class="fdd-bnote">📝 After the call you write the ${esc(note.title.toLowerCase())}.</p>` : ''}</details>`;
    }
    // A call you place: it rings on the other end, then they pick up and speak first.
    function dialOut(my) {
        if (my.dialing) return;
        my.dialing = true; pcStatus('Ringing…'); pcIdCard();
        if (window.LiveCall) window.LiveCall.ring(2);
        setTimeout(() => { if (P === my && !my.ended && !my.answered) pcConnect(my); }, 4400);
    }
    const noteWritten = (l) => { const n = packs().noteOf(l.call); let t = String(l.note || ''); if (n) n.template.split('\n').forEach(x => { if (x.trim()) t = t.split(x.trim()).join(' '); }); return t.replace(/\s+/g, ' ').trim(); };
    function packWrapHTML() {
        const l = P, K = packs(), c = l.call, note = K.noteOf(c), secs = Math.round(((l.t1 || Date.now()) - (l.t0 || Date.now())) / 1000);
        let n = 0;
        return `<div class="fdd-fb mid" style="margin-bottom:10px"><b>${l.ended === 'caller' ? 'The caller hung up.' : l.ended === 'time' ? 'The call reached its time limit.' : 'Call ended.'}</b> ⏱ ${fmtSec(secs)}. ${note ? 'Document it, then get your debrief.' : 'Get your debrief.'}</div>
            ${c.doc ? findHTML(l, `${++n} · Which file was this call about?`) : ''}
            <div class="fdd-sec"><h4>${++n} · 📝 ${esc(note ? note.title : 'Call note (optional)')}</h4>
                <p style="margin:0 0 6px;font-size:11.5px;color:#475569">Write it the way it would go into the file. It's graded against what was actually said, so don't add anything you weren't told.</p>
                <textarea class="fdd-note fdd-pk-note" id="fdd-pc-note" maxlength="3000" oninput="fddPracticeNote(this.value)">${esc(l.note)}</textarea></div>
            <button class="fdd-go alt" id="fdd-pc-go" onclick="fddPracticeReview()">Get my debrief →</button>
            <p id="fdd-pc-go-note" style="margin:6px 0 0;font-size:11.5px;color:#92400e">${esc(pcGoNote())}</p>
            <details class="fdd-sec" style="margin-top:10px"><summary style="cursor:pointer;font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b">Transcript</summary><div class="fdd-tx" style="max-height:none">${trHTML(l.msgs)}</div></details>`;
    }
    const packTranscript = (l) => l.msgs.map(m => m.who === 'caller' ? `${l.call.name.toUpperCase()}: ${m.text}` : m.who === 'you' ? `TRAINEE: ${m.text}` : `(${m.text})`).join('\n');
    async function packReview(my) {
        const K = packs(), c = my.call, note = K.noteOf(c), written = noteWritten(my);
        if (my.graded && note && written.length < 30) { pcStatus(''); alert(`Write the ${note.title.toLowerCase()} first: it's graded with the call.`); return; }
        my.secs = Math.max(0, Math.round(((my.t1 || Date.now()) - (my.t0 || Date.now())) / 1000));
        my.spoken = !!(my.usedLive || my.msgs.some(m => m.who === 'you' && m.spoken));
        my.reviewing = true; my.reviewError = null; screen = 'pcdebrief'; paint();
        const top = () => { const b = $id('fdd-panel').querySelector('.fdd-b'); if (b) b.scrollTop = 0; };
        top();
        let tx = packTranscript(my); if (tx.length > 14000) tx = '…' + tx.slice(-14000);
        const prompt = K.gradePrompt(c, { transcript: tx, secs: my.secs, spoken: my.spoken, note: written.length >= 30 ? my.note : '', picked: c.doc ? { id: my.selected } : null });
        const r = await askWithRetry('review', K.GRADE_SYSTEM, [{ role: 'user', text: prompt }], true, () => P !== my, null, K.aiModule(c));
        if (!r) return;
        my.reviewing = false;
        const g = r.ok ? K.parseGrade(r.text, c) : null;
        if (!g) { my.reviewError = r.ok ? 'The debrief came back unreadable.' : r.error; paint(); return; }
        my.review = g; paint(); top();
        savePack(my);
    }
    async function savePack(l) {
        const K = packs(), c = l.call, g = l.review, file = c.doc ? { id: c.doc, picked: l.selected || null, ok: l.selected === c.doc } : null;
        const detail = { pack: true, id: c.id, program: c.program, line: c.line, title: c.title, caller: c.name, role: c.role, mode: l.graded ? 'graded' : 'practice',
            voice: l.usedLive ? 'live' : 'standard', secs: l.secs, score: g.score, verdict: g.verdict, goals: g.goals, strengths: g.strengths, improve: g.improve, betterLine: g.betterLine,
            scorecard: g.scorecard || null, file, course: K.courseOf(c), turns: l.msgs.filter(m => m.who === 'you').length, note: cut(noteWritten(l) ? l.note : '', 3000), transcript: '' };
        if (g.scorecard) detail.calendar = await calendarOutput(l);
        const full = packTranscript(l);
        detail.transcript = full.length > 9000 ? '…' + full.slice(-9000) : full;
        l.saved = 'saving'; paintSaved();
        try {
            const res = await fetch('/api/drill-results', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ mode: l.graded ? 'graded' : 'line', program: c.program, calls: 1, details: [detail], score: g.score,
                    findPct: file && file.ok ? 100 : 0, authPct: 0, actionPct: 0, avgSeconds: l.secs })
            });
            const data = await res.json().catch(() => ({}));
            l.saved = data && data.success ? 'saved' : 'failed';
            l.course = data && data.course || null;   // a graded call: where it counted (functions/api/drill-results.js)
        } catch (e) { l.saved = 'failed'; }
        paintSaved(); loadHistory();
    }
    // Where a graded call counted, for the saved line.
    function countedText(l) {
        const c = l.course; if (!c) return '';
        const where = c.program === 'FT' && c.lesson ? `your Standard Training, lesson ${c.lesson}` : `your ${programLabel(c.program)} course (${c.line})`;
        return c.counted ? ` It counts toward ${where}${c.best && typeof c.best.score === 'number' ? `: your best there is ${c.best.score}%` : ''}.`
            : ' It couldn\'t reach your course just now; your trainer still sees it here.';
    }
    // The firm's scorecard (FT Calendar Management), laid out as the trainers' sheet: each metric rated 0-5 with its
    // feedback, then the weighted average (out of 5; the call's score is it as a %).
    const scN = (v, d) => { const x = Math.max(0, Math.min(5, Number(v) || 0)); return d ? String(Math.round(x * 10) / 10) : String(Math.round(x)); };
    function scorecardHTML(sc, caption, cls) {
        if (!sc || !Array.isArray(sc.rows) || !sc.rows.length) return '';
        return `<div class="fdd-sec fdd-sc-wrap ${cls || ''}">${caption ? `<div class="fdd-sc-cap">${caption}</div>` : ''}<table class="fdd-sc"><thead><tr><th>${esc(sc.title || 'SCORECARD')}</th><th>Score</th><th>FEEDBACK</th></tr></thead>
            <tbody>${sc.rows.map(r => `<tr><td>${esc(r.metric)}</td><td class="n">${scN(r.score)}</td><td class="fb">${esc(r.feedback || '')}</td></tr>`).join('')}
            <tr class="avg"><td>WEIGHTED AVERAGE</td><td class="n">${scN(sc.average, 1)}</td><td class="fb">out of 5${sc.pct != null ? ` · ${Math.round(Number(sc.pct) || 0)}%` : ''}</td></tr></tbody></table></div>`;
    }
    const AUTO_CAP = '🤖 Automated scorecard';
    const trainerCap = (t) => `👤 Trainer's scorecard${t.by ? ` · ${esc(t.by)}` : ''}${t.at ? ` · ${esc(String(t.at).slice(0, 10))}` : ''}`;
    // An Admin scores a trainee's call on the same sheet: each metric 0-5 with feedback (it starts from their own scores
    // if they've scored it, or the automated ones), the weighted average as they go; 💾 saves it with the call.
    function trainerEditHTML(row, d) {
        const auto = d.scorecard, base = d.trainer || auto, sel = (i, v) => `<select class="fdd-sc-in" data-i="${i}" aria-label="Score" onchange="fddTrainerAvg()">${[0, 1, 2, 3, 4, 5].map(x => `<option value="${x}" ${Number(v) === x ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
        return `<div class="fdd-sec fdd-sc-wrap fdd-sc-edit"><div class="fdd-sc-cap">${d.trainer ? trainerCap(d.trainer) + ' · change it below' : '👤 Your scorecard for this call: it starts from the automated scores; change any of them'}</div>
            <table class="fdd-sc"><thead><tr><th>${esc(auto.title || 'SCORECARD')}</th><th>Score</th><th>FEEDBACK</th></tr></thead>
            <tbody>${auto.rows.map((r, i) => `<tr><td>${esc(r.metric)}</td><td class="n">${sel(i, (base.rows[i] || r).score)}</td><td class="fb"><textarea class="fdd-sc-fb" data-i="${i}" maxlength="600" rows="2" aria-label="Feedback">${esc((base.rows[i] || r).feedback || '')}</textarea></td></tr>`).join('')}
            <tr class="avg"><td>WEIGHTED AVERAGE</td><td class="n" id="fdd-sc-avg">${scN(base.average, 1)}</td><td class="fb" id="fdd-sc-pct">out of 5 · ${Math.round(Number(base.pct) || 0)}%</td></tr></tbody></table>
            <div style="display:flex;gap:8px;align-items:center;padding:8px 10px"><button class="fdd-go alt" style="margin:0;width:auto;padding:8px 14px" onclick="fddTrainerSave(${Number(row.id)})">💾 Save my scorecard</button><span id="fdd-sc-msg" style="font-size:11.5px;color:#64748b"></span></div></div>`;
    }
    window.fddTrainerAvg = function () {
        if (!SAVED || !SAVED.d || !SAVED.d.scorecard) return;
        const rows = SAVED.d.scorecard.rows, vals = [...document.querySelectorAll('.fdd-sc-edit select.fdd-sc-in')].map(x => Number(x.value) || 0);
        const w = rows.reduce((a, r) => a + (Number(r.weight) || 1), 0), avg = rows.reduce((a, r, i) => a + (Number(r.weight) || 1) * (vals[i] || 0), 0) / w;
        const a = $id('fdd-sc-avg'), p = $id('fdd-sc-pct');
        if (a) a.textContent = scN(avg, 1); if (p) p.textContent = `out of 5 · ${Math.round(avg / 5 * 100)}%`;
    };
    window.fddTrainerSave = async function (id) {
        const msg = $id('fdd-sc-msg'), say = (t, bad) => { if (msg) { msg.textContent = t; msg.style.color = bad ? '#b91c1c' : '#64748b'; } };
        const fbs = [...document.querySelectorAll('.fdd-sc-edit textarea.fdd-sc-fb')];
        const rows = [...document.querySelectorAll('.fdd-sc-edit select.fdd-sc-in')].map((x, i) => ({ score: Number(x.value), feedback: fbs[i] ? fbs[i].value : '' }));
        say('Saving…');
        try {
            const res = await fetch('/api/drill-results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ action: 'trainer-scorecard', id, rows }) });
            const data = await res.json().catch(() => ({}));
            if (!data || !data.success) throw new Error((data && data.error) || 'It wasn\'t saved.');
            if (SAVED && SAVED.id === id && SAVED.d) SAVED.d.trainer = data.trainer;
            const r = ((history && history.results) || []).find(x => Number(x.id) === Number(id)); if (r) r.trainer_pct = data.trainer.pct;
            paint(); say('');
            const m2 = $id('fdd-sc-msg'); if (m2) m2.textContent = '✓ Saved: the trainee sees it with the call.';
        } catch (e) { say(e.message || 'It wasn\'t saved.', true); }
    };
    // The trainee's calendar output for a Calendar Management call: the appointments they booked or changed on the CMS
    // calendar (the 🗓 Attorney's Calendar or the Firm Calendar) from the start of the call until it was saved.
    const CAL_NAMES = { attorney: 'Attorney\'s Calendar', reyes: 'Atty. Marcus Reyes', brooks: 'Atty. Elena Brooks', okafor: 'Atty. David Okafor', firm: 'Firm / Staff' };
    async function calendarOutput(l) {
        if (!packs().scorecardOf(l.call) || !l.t0) return null;
        try {
            const data = await (await fetch('/api/calendar?list=mine', { credentials: 'include' })).json();
            if (!data || !data.success) return null;
            const when = (v) => { const t = Date.parse(String(v || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(v || '')) ? '' : 'Z')); return isFinite(t) ? t : 0; };
            return (data.events || []).filter(e => Math.max(when(e.createdAt), when(e.updatedAt)) >= l.t0 - 60000).slice(0, 8)
                .map(e => ({ title: cut(e.title, 160), type: cut(e.type, 40), calendar: cut(e.calendar, 20), date: cut(e.date, 10), start: cut(e.start, 5), end: cut(e.end, 5), allDay: !!e.allDay,
                    location: cut(e.location, 200), caseLabel: cut(e.caseLabel, 120), notes: cut(e.notes, 600), invite: (Array.isArray(e.invite) ? e.invite : []).slice(0, 8).map(x => cut(typeof x === 'string' ? x : (x && (x.name || x.id)) || '', 60)) }));
        } catch (e) { return null; }
    }
    const t12 = (hm) => { const m = /^(\d\d):(\d\d)$/.exec(hm || ''); if (!m) return ''; const h = +m[1]; return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`; };
    function calendarOutputHTML(row, d) {
        const evs = Array.isArray(d.calendar) ? d.calendar : null, admin = isAdmin() && history && history.isAdmin;
        const day = (evs && evs[0] && evs[0].date) || String(row.created_at || '').slice(0, 10);
        const open = admin ? `<button class="fdd-chip" onclick='fddTraineeCalendar(${JSON.stringify(String(row.username || ''))}, ${JSON.stringify(String(row.full_name || row.username || ''))}, ${JSON.stringify(day)})'>🗓 Open ${esc(row.full_name || row.username || 'the trainee')}'s calendar</button>` : '';
        const list = evs && evs.length ? `<ul class="fdd-cal-out">${evs.map(e => `<li><b>${esc(e.title || '(No title)')}</b><span>${esc(e.date || '')}${e.allDay ? ' · all day' : e.start ? ` · ${esc(t12(e.start))}${e.end ? '–' + esc(t12(e.end)) : ''} ET` : ''} · ${esc(CAL_NAMES[e.calendar] || e.calendar || '')}${e.type ? ` · ${esc(e.type)}` : ''}</span>${e.location ? `<span>📍 ${esc(e.location)}</span>` : ''}${e.caseLabel ? `<span>📂 ${esc(e.caseLabel)}</span>` : ''}${e.invite && e.invite.length ? `<span>👥 ${esc(e.invite.join(', '))}</span>` : ''}${e.notes ? `<small>${esc(e.notes)}</small>` : ''}</li>`).join('')}</ul>`
            : `<p style="margin:0;color:#64748b;font-size:12px">${evs ? 'Nothing was booked or changed on the CMS calendar during this call.' : 'This call was saved before calendar output was kept with it.'}</p>`;
        return `<div class="fdd-sec"><h4>🗓 Calendar output</h4>${list}${d.note ? `<p style="margin:8px 0 2px;font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b">The calendar entry and note they wrote</p><p style="margin:0;white-space:pre-wrap;font-size:12px">${esc(d.note)}</p>` : ''}${open ? `<div style="margin-top:8px">${open}</div>` : ''}</div>`;
    }
    // An Admin opens the trainee's own calendar (the 🗓 Attorney's Calendar with only that trainee's appointments) on the call's week.
    window.fddTraineeCalendar = function (username, name, date) {
        if (typeof window.openAttorneyCalendar !== 'function') return;
        window.fddMinimize(); $id('fdd-mini').textContent = '📞 Back to the saved call';   // the calendar gets the screen
        window.openAttorneyCalendar({ user: { username, name }, date });
    };
    // The debrief: the score, each goal met or not yet, what worked, what's next, and a better line.
    function goalsHTML(goals) {
        return `<ul class="fdd-goals">${(goals || []).map(g => `<li><span class="${g.met ? 'ok' : 'no'}">${g.met ? '✓' : '○'}</span><div>${esc(g.goal)}${g.note ? `<small>${esc(g.note)}</small>` : ''}</div></li>`).join('')}</ul>`;
    }
    function reviewHTML(g) {
        const li = (x) => x && x.length ? `<ul>${x.map(v => `<li>${esc(v)}</li>`).join('')}</ul>` : '';
        return `<div class="fdd-sec fdd-rv"><h4>Debrief</h4>${g.verdict ? `<p style="margin:0 0 6px"><b>${esc(g.verdict)}</b></p>` : ''}
            ${g.strengths && g.strengths.length ? `<div style="font-weight:700;color:#047857">What worked</div>${li(g.strengths)}` : ''}
            ${g.improve && g.improve.length ? `<div style="font-weight:700;color:#b45309">Not yet: next time</div>${li(g.improve)}` : ''}
            ${g.betterLine ? `<div class="better"><b>Try saying:</b> “${esc(g.betterLine)}”</div>` : ''}</div>`;
    }
    function packDebriefHTML() {
        const l = P, K = packs(), c = l.call, g = l.review, doc = K.docOf(c);
        const status = l.reviewing ? `<div class="fdd-fb mid"><b>📝 Grading your call…</b> It takes a few seconds.</div>`
            : !g ? `<div class="fdd-fb bad"><b>The debrief didn't load.</b> ${esc(l.reviewError || '')} The call is saved once it comes through.
                <button class="fdd-go alt" onclick="fddPracticeReview()">Try again</button><button class="fdd-go" onclick="fddPracticeBackToWrap()">← Back to the wrap-up</button></div>` : '';
        const ln = findLine(c.program, c.line), nx = ln && nextOn(ln, l.graded ? 'graded' : 'practice', c.id);
        const again = l.graded ? (nx ? `<button class="fdd-go alt" onclick="fddLineCall('${esc(nx.id)}','graded')">🎯 Next: Graded call ${l.num + 1}</button>` : '')
            : `<button class="fdd-go alt" onclick="fddLineCall('${esc(c.id)}','practice')">↻ Try this call again</button>${nx ? `<button class="fdd-go" style="background:#475569" onclick="fddLineCall('${esc(nx.id)}','practice')">📞 Next caller: ${esc(nx.title)}</button>` : ''}`;
        return `<div class="fdd-sec" style="text-align:center"><div style="font-size:10.5px;font-weight:800;letter-spacing:.08em;color:#64748b;text-transform:uppercase">${esc(K.iconOf(c))} ${esc(c.line)} · ${l.graded ? `graded call ${l.num}` : 'practice'}</div>
                <div class="fdd-score">${g ? g.score + '/100' : '…'}</div>
                <div style="color:#334155;font-weight:700">${esc(c.title)}</div>
                <div style="color:#64748b">${esc(c.name)} · ${esc(c.role)}${doc ? ` · ${esc(doc.id)}` : ''} · ⏱ ${fmtSec(l.secs || 0)}${l.usedLive ? ' · live voice' : ''}</div>
                <div id="fdd-pc-saved" style="font-size:11.5px"></div></div>
            ${status}
            ${doc ? `<div class="fdd-fb ${l.selected === doc.id ? 'ok' : 'bad'}">${l.selected === doc.id ? '✓' : '✗'} <b>File:</b> ${esc(doc.title)}${l.selected === doc.id ? '' : ` (you ${l.selected ? `picked ${esc(l.selected === 'none' ? 'not in the system' : l.selected)}` : 'didn\'t match a file'})`}</div>` : ''}
            ${g ? `${scorecardHTML(g.scorecard, AUTO_CAP)}<div class="fdd-sec"><h4>Goals</h4>${goalsHTML(g.goals)}</div>${reviewHTML(g)}` : ''}
            <details class="fdd-sec"><summary style="cursor:pointer;font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b">Transcript${noteWritten(l) ? ' and your note' : ''}</summary>
                <div class="fdd-tx" style="max-height:none">${trHTML(l.msgs)}</div>${noteWritten(l) ? `<p style="margin:6px 0 0;font-size:12px;white-space:pre-wrap"><b>Your note:</b>\n${esc(l.note)}</p>` : ''}</details>
            ${g ? again : ''}
            <button class="fdd-go" onclick="fddOpenLine('${esc(c.program)}', ${esc(JSON.stringify(c.line))})">← ${esc(c.line)}</button>
            <div id="fdd-pc-hist" style="margin-top:10px">${historyHTML()}</div>`;
    }
    // A saved line call (🎧 Saved calls).
    function savedPackHTML(row, d, back) {
        const score = Number(row.score) || 0;
        return `<div class="fdd-sec" style="text-align:center"><div style="font-size:10.5px;font-weight:800;letter-spacing:.08em;color:#64748b;text-transform:uppercase">${esc(d.line || '')} · ${d.mode === 'graded' ? 'graded call' : 'practice'} · ${esc(row.full_name || row.username)}</div>
                <div class="fdd-score">${score}/100</div>
                <div style="color:#334155;font-weight:700">${esc(d.title || '')}</div>
                <div style="color:#64748b">${esc(String(row.created_at || '').slice(0, 16))} · ${esc(d.caller || '')}${d.secs != null ? ` · ⏱ ${fmtSec(Number(d.secs) || 0)}` : ''}${d.voice === 'live' ? ' · live voice' : ''}</div></div>
            ${d.file ? `<div class="fdd-fb ${d.file.ok ? 'ok' : 'bad'}">${d.file.ok ? '✓' : '✗'} <b>File:</b> ${esc(d.file.id)}${d.file.ok ? '' : ` (picked ${esc(d.file.picked || 'none')})`}</div>` : ''}
            ${d.scorecard ? (isAdmin() && history && history.isAdmin ? trainerEditHTML(row, d) : d.trainer ? scorecardHTML(d.trainer, trainerCap(d.trainer), 'fdd-sc-trainer') : '') : ''}
            ${scorecardHTML(d.scorecard, AUTO_CAP)}
            ${d.scorecard ? calendarOutputHTML(row, d) : ''}
            ${Array.isArray(d.goals) && d.goals.length ? `<div class="fdd-sec"><h4>Goals</h4>${goalsHTML(d.goals)}</div>` : ''}
            ${reviewHTML({ verdict: d.verdict, strengths: d.strengths, improve: d.improve, betterLine: d.betterLine })}
            ${d.note && !d.scorecard ? `<div class="fdd-sec"><h4>The note</h4><p style="margin:0;white-space:pre-wrap">${esc(d.note)}</p></div>` : ''}
            <div class="fdd-sec"><h4>Transcript</h4><div class="fdd-saved-tx">${esc(d.transcript || 'No transcript was saved with this call.')}</div></div>
            ${back}`;
    }
    const isLineRow = (r) => r.mode === 'line' || r.mode === 'graded';
    // The results, kept apart for grading: one program's or one line's calls (or the Core callers'), graded or practice.
    let rf = { line: 'all', mode: 'all' };
    function filterRows(rows) {
        return rows.filter(r => {
            const line = rf.line === 'all' || (rf.line === 'core' ? !isLineRow(r) : rf.line === 'drill' ? r.mode === 'drill'
                : rf.line.startsWith('S:') ? r.mode === 'drill' && r.drill_set != null && Number(r.drill_set) === Number(rf.line.slice(2)) : rf.line.startsWith('P:') ? isLineRow(r) && r.program === rf.line.slice(2) : isLineRow(r) && `${r.program}|${r.line}` === rf.line);
            const mode = rf.mode === 'all' || (rf.mode === 'graded' ? r.mode === 'graded' : r.mode !== 'graded');
            return line && mode;
        });
    }
    function filterHTML() {
        const K = packs(), opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`;
        return `<div class="fdd-pick"><span>Show</span><select id="fdd-rf-line" aria-label="Which calls" onchange="fddResultsFilter('line', this.value)">${opt('all', 'All calls', rf.line)}${opt('core', '☎ Core callers (front desk)', rf.line)}
            <optgroup label="📋 Scored drill">${opt('drill', 'All drills', rf.line)}${Array.from({ length: drillSets() }, (_, i) => opt('S:' + (i + 1), 'Set ' + (i + 1), rf.line)).join('')}${opt('S:0', 'All the calls', rf.line)}</optgroup>
            ${K ? K.PROGRAMS.map(p => `<optgroup label="${esc(p.icon + ' ' + p.label)}">${opt('P:' + p.k, 'All ' + p.label + ' calls', rf.line)}${K.linesOf(p.k).map(l => opt(p.k + '|' + l.line, l.icon + ' ' + l.line, rf.line)).join('')}</optgroup>`).join('') : ''}</select>
            <select id="fdd-rf-mode" aria-label="Practice or graded" style="flex:0 1 150px" onchange="fddResultsFilter('mode', this.value)">${opt('all', 'Practice and graded', rf.mode)}${opt('graded', '🎯 Graded only', rf.mode)}${opt('practice', 'Practice only', rf.mode)}</select></div>`;
    }
    window.fddResultsFilter = function (k, v) {
        rf[k] = v;
        if (screen === 'pcdebrief') { const h = $id('fdd-pc-hist'); if (h) h.innerHTML = historyHTML(); } else paint();
    };
    const rowType = (r) => r.mode === 'practice' ? '<span class="fdd-tag">Practice call</span>' : r.mode === 'line' ? `<span class="fdd-tag">${esc(r.line || 'Line')} · practice</span>`
        : r.mode === 'graded' ? `<span class="fdd-tag g">${esc(r.line || 'Line')} · graded</span>` : `Drill · ${r.drill_set == null ? '' : Number(r.drill_set) ? `Set ${Number(r.drill_set)} · ` : 'all · '}${r.calls}`;
    // A link from another platform: ?calls=1 opens the Call Simulator, &program= or &flow= picks the tab
    // (standard, cms, pd, ea-pa, reception, intake, calendaring), &line= opens a line, &mode=graded with its graded calls first.
    function openFromLink() {
        const q = new URLSearchParams(location.search), K = packs();
        const want = q.get('calls') || q.get('line') || q.get('flow');
        if (!want || !K) return false;
        openFrontDeskDrill();
        const view = K.viewOf(q.get('flow')) || K.viewOf(q.get('program'));
        if (view) lnView = view;
        const lines = view ? K.linesIn(view) : K.LINES;
        const l = q.get('line') && (lines.find(x => x.line.toLowerCase() === q.get('line').toLowerCase()) || K.LINES.find(x => x.line.toLowerCase() === q.get('line').toLowerCase()));
        if (l) fddOpenLine(l.program, l.line, q.get('mode') === 'graded');
        else paint();
        return true;
    }

    // The sidebar button goes in after the Training Library button exists.
    const origApply = window.applySessionUI;
    if (typeof origApply === 'function') {
        window.applySessionUI = function () {
            const r = origApply.apply(this, arguments);
            buildUI();
            const signedIn = typeof hasAuthorizedAccess === 'function' && hasAuthorizedAccess();
            if (!signedIn && $id('fdd-panel')) { hangUp(); stopTimer(); D = null; endPractice(); screen = 'home'; document.body.classList.remove('fdd-on', 'fdd-open'); fitCase(); $id('fdd-panel').classList.remove('open'); }
            else if (signedIn && !window.__fddOpened && /[?&](drill|calls|line|flow)=/.test(location.search)) { window.__fddOpened = true; setTimeout(() => { if (!openFromLink()) openFrontDeskDrill(); }, 80); }
            return r;
        };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI); else buildUI();
})();
