/* =========================================================
   LSH CMS — CLIENT MESSAGING (the 💬 Messages tab)
   ---------------------------------------------------------
   Texting with clients the way CasePeer does it: a text to the
   firm's number lands on the case file whose contact owns the
   number, in the file's 💬 Messages tab, and whoever handles it
   answers from the file. Here the texts come from the Training
   Library's people (message-packs.js): a client, an authorized
   relative, a cousin who isn't on the file, a client in danger.
   They are played by the AI (/api/call-ai, 'caller') from the file
   itself, so what they say matches what the trainee reads.

   - 💬 Client Messaging (sidebar, after 📞 Call Simulator): the
     conversations by program (Reception, Intake, Case Management,
     Medical Summary & Demand, Property Damage, EA / PA), each as
     Practice (coaching shown, a debrief, no score in the course) or
     Graded (no coaching, scored, counts in the trainee's course).
     ?messages=1 opens it from a course link (&program= picks the
     tab, &thread=<id> starts one, &mode=graded graded).
   - Starting one opens its file view only (Notes and Tasks stay
     open, as in the Call Simulator) on the 💬 Messages tab, and the
     first text comes in. The header says whose number it is on the
     file — or that the file doesn't have it. Quick replies fill in
     from the file ({cm}, {next_visit}…); the counter shows how many
     texts a message will send as.
   - ✓ End conversation → the Case Note (and 📝 Add to Case Notes on
     the file) → the debrief on the firm's Client Messaging scorecard
     and the conversation's goals (/api/call-ai, 'review'). A missed
     critical goal (a privacy breach, advice by text, an emergency
     handled by text) caps it at 59%. Saved to /api/drill-results
     (mode 'msg' or 'msg-graded'; a graded one counts in the course
     through the Portal) and to the file's thread (/api/case-messages),
     so the conversation is on the Messages tab next time.

   No <select> or contenteditable anywhere here on purpose: the case
   editor saves every select and contenteditable on the page by
   position (buildCaseContentPayload in app.js). Buttons, inputs and
   textareas only.
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t) => { if (typeof showToast === 'function') showToast(m, t || 'info'); };
    const session = () => (typeof getSession === 'function' ? getSession() : null);
    const isAdmin = () => { const s = session(); return !!(s && s.userType === 'Admin') && !(window.isTraineeView && window.isTraineeView()); };
    const signedIn = () => typeof hasAuthorizedAccess === 'function' && hasAuthorizedAccess();
    const K = () => window.MESSAGE_PACKS || null;
    const firm = () => window.MOCK_FIRM || null;
    const caseOf = (id) => (window.MOCK_CASES || []).find(c => c.id === id) || null;
    const openFileId = () => (typeof window.mockCurrentId === 'function' ? window.mockCurrentId() : null);
    const fmtSec = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const clock = (d) => { const x = new Date(d); let h = x.getHours(); const m = String(x.getMinutes()).padStart(2, '0'), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${m} ${ap}`; };
    const day = (d) => new Date(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const MODES = ['msg', 'msg-graded'];

    /* ---------- the look ---------- */
    const css = document.createElement('style');
    css.textContent = `
    #pane-messages .cmx{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;min-height:560px}
    @media (max-width:1100px){#pane-messages .cmx{grid-template-columns:1fr}}
    .cmx-main{display:flex;flex-direction:column;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;min-height:560px}
    .cmx-head{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc}
    .cmx-av{width:36px;height:36px;border-radius:50%;background:#0f2148;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex:none}
    .cmx-av.unk{background:#94a3b8}
    .cmx-who{flex:1;min-width:0}.cmx-who b{display:block;font-size:13px;color:#0f2148}.cmx-who small{font-size:11px;color:#475569}
    .cmx-badge{display:inline-block;font-size:10px;font-weight:800;border-radius:999px;padding:2px 8px;margin-left:6px;vertical-align:1px}
    .cmx-badge.on{background:#dcfce7;color:#166534}.cmx-badge.unk{background:#fef3c7;color:#92400e}.cmx-badge.out{background:#fee2e2;color:#991b1b}
    .cmx-clock{font:700 12px/1 monospace;color:#0f2148;background:#e2e8f0;border-radius:6px;padding:5px 7px}
    .cmx-thread{flex:1;overflow-y:auto;padding:16px 14px;background:#f1f5f9;display:flex;flex-direction:column;gap:6px;max-height:62vh}
    .cmx-day{align-self:center;font-size:10.5px;font-weight:700;color:#64748b;background:#e2e8f0;border-radius:999px;padding:2px 10px;margin:8px 0 4px}
    .cmx-msg{max-width:72%;padding:8px 11px;border-radius:16px;font-size:13px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word;box-shadow:0 1px 1px rgba(15,33,72,.06)}
    .cmx-msg.them{align-self:flex-start;background:#fff;color:#0f172a;border-bottom-left-radius:4px}
    .cmx-msg.you{align-self:flex-end;background:#0f2148;color:#fff;border-bottom-right-radius:4px}
    .cmx-meta{font-size:10px;color:#64748b;margin:-2px 4px 4px}.cmx-meta.you{align-self:flex-end}.cmx-meta.them{align-self:flex-start}
    .cmx-sys{align-self:center;font-size:11px;color:#475569;font-style:italic;margin:4px 0}
    .cmx-typing{align-self:flex-start;background:#fff;border-radius:16px;padding:9px 13px;display:flex;gap:4px}
    .cmx-typing i{width:6px;height:6px;border-radius:50%;background:#94a3b8;animation:cmxb 1s infinite}
    .cmx-typing i:nth-child(2){animation-delay:.15s}.cmx-typing i:nth-child(3){animation-delay:.3s}
    @keyframes cmxb{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
    .cmx-compose{border-top:1px solid #e2e8f0;padding:10px 12px;background:#fff;position:relative}
    .cmx-compose textarea,.cmx-wrap textarea{width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:9px 11px;font:13px/1.45 Arial,Helvetica,sans-serif;resize:vertical;min-height:62px;color:#0f172a;background:#fff}
    .cmx-compose textarea:focus,.cmx-wrap textarea:focus{outline:2px solid #f97316;outline-offset:0;border-color:#f97316}
    .cmx-row{display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap}
    .cmx-row .sp{flex:1}
    .cmx-count{font-size:11px;color:#475569}.cmx-count.over{color:#b91c1c;font-weight:700}
    .cmx-btn{font-size:11px;font-weight:800;border-radius:8px;padding:8px 13px;cursor:pointer;border:1px solid #0f2148;background:#0f2148;color:#fff;text-transform:uppercase;letter-spacing:.02em}
    .cmx-btn.alt{background:#fff;color:#0f2148;border-color:#cbd5e1}
    .cmx-btn.go{background:#f97316;border-color:#f97316}
    .cmx-btn.ok{background:#166534;border-color:#166534}
    .cmx-btn:disabled{opacity:.55;cursor:not-allowed}
    .cmx-tpl{position:absolute;bottom:100%;left:12px;width:min(420px,calc(100% - 24px));max-height:300px;overflow-y:auto;background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 12px 30px rgba(15,33,72,.18);padding:6px;z-index:5}
    .cmx-tpl button{display:block;width:100%;text-align:left;background:none;border:0;border-radius:7px;padding:8px 9px;cursor:pointer;font-size:12px;color:#0f172a}
    .cmx-tpl button:hover,.cmx-tpl button:focus{background:#fff7ed}
    .cmx-tpl b{display:block;font-size:11.5px;color:#0f2148}.cmx-tpl span{color:#475569}
    .cmx-side{display:flex;flex-direction:column;gap:12px}
    .cmx-card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;font-size:12px;color:#334155}
    .cmx-card h4{margin:0 0 8px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#0f2148}
    .cmx-card ul{margin:0;padding-left:16px}.cmx-card li{margin:3px 0}
    .cmx-card details summary{cursor:pointer;font-weight:700;color:#0f2148}
    .cmx-empty{padding:30px 22px;text-align:center;color:#475569;font-size:13px}
    .cmx-empty h3{margin:0 0 6px;color:#0f2148;font-size:15px}
    .cmx-start{display:flex;flex-direction:column;gap:8px;margin:14px auto 0;max-width:520px;text-align:left}
    .cmx-start div{display:flex;align-items:center;gap:8px;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;background:#fff}
    .cmx-start div span{flex:1;font-size:12.5px}
    .cmx-wrap{padding:12px;border-top:1px solid #e2e8f0;background:#fffbeb}
    .cmx-wrap h4{margin:0 0 6px;font-size:12px;color:#0f2148}
    .cmx-score{display:flex;align-items:center;gap:12px;margin-bottom:8px}
    .cmx-score b{font-size:30px;color:#0f2148;line-height:1}.cmx-score.low b{color:#b91c1c}
    .cmx-sc{width:100%;border-collapse:collapse;font-size:11.5px}.cmx-sc td{border-top:1px solid #e2e8f0;padding:5px 4px;vertical-align:top}.cmx-sc td.n{white-space:nowrap;font-weight:800;color:#0f2148}
    .cmx-goals{list-style:none;padding:0;margin:0}.cmx-goals li{display:flex;gap:6px;margin:4px 0}.cmx-goals .ok{color:#166534;font-weight:800}.cmx-goals .no{color:#b91c1c;font-weight:800}
    .cmx-goals small{display:block;color:#64748b}
    .cmx-better{background:#eff6ff;border-left:3px solid #1d4ed8;padding:6px 9px;border-radius:6px;margin-top:8px}
    .cmx-cap{background:#fee2e2;color:#7f1d1d;border-radius:8px;padding:7px 9px;margin:6px 0;font-size:11.5px}
    #tab-messages .cmx-unread{display:inline-block;min-width:16px;height:16px;line-height:16px;border-radius:8px;background:#ef4444;color:#fff;font-size:10px;font-weight:800;text-align:center;margin-left:4px;padding:0 4px}
    #cmx-modal .lib-box{max-width:980px}
    .cmx-progs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 12px}
    .cmx-progs button{font-size:11px;font-weight:800;border-radius:999px;padding:6px 11px;border:1px solid #cbd5e1;background:#fff;color:#0f2148;cursor:pointer}
    .cmx-progs button.on{background:#0f2148;color:#fff;border-color:#0f2148}
    .cmx-list{display:flex;flex-direction:column;gap:8px}
    .cmx-item{display:flex;align-items:center;gap:10px;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#fff}
    .cmx-item .t{flex:1;min-width:0}.cmx-item .t b{display:block;color:#0f2148;font-size:13px}.cmx-item .t small{color:#475569;font-size:11.5px}
    .cmx-lvl{font-size:10px;font-weight:800;border-radius:999px;padding:2px 8px;background:#f1f5f9;color:#334155}
    .cmx-hist{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}.cmx-hist th{text-align:left;font-size:10.5px;text-transform:uppercase;color:#64748b;padding:4px}.cmx-hist td{border-top:1px solid #e2e8f0;padding:6px 4px}
    .cmx-hist button{background:none;border:0;color:#1d4ed8;cursor:pointer;font-weight:700;padding:0;font-size:12px}
    #cmx-open-btn{width:100%}
    `;
    document.head.appendChild(css);

    /* ---------- state ---------- */
    // The conversation in progress (one at a time):
    // { t, file, sender, number, graded, t0, secs, msgs: [{ who: 'them'|'you', text, at }], phase: 'chat'|'wrap'|'debrief',
    //   waiting, quiet (they seem done), optedOut, note, notedOnFile, reviewing, review, reviewError, saved, course }
    let C = null;
    let threads = { ref: null, list: [], loading: false };   // the open file's saved conversations (/api/case-messages)
    let home = { program: null, view: 'list', history: null, saved: null };
    let tplOpen = false, unread = 0, tick = null, bypassGuard = false;

    /* ---------- the sidebar button, the tab's badge, the launcher ---------- */
    function buildUI() {
        const work = $id('sb-work');
        if (work && !$id('cmx-open-btn')) {
            const after = $id('fdd-open-btn');
            const html = `<button id="cmx-open-btn" class="fdd-btn" onclick="openClientMessaging()">💬 Client Messaging</button>`;
            if (after && after.parentElement === work) after.insertAdjacentHTML('afterend', html); else work.insertAdjacentHTML('beforeend', html);
        }
        const btn = $id('cmx-open-btn'); if (btn) btn.style.display = session() ? '' : 'none';
        if (!$id('cmx-modal')) {
            document.body.insertAdjacentHTML('beforeend', `<div class="modal-overlay no-print" id="cmx-modal" style="z-index:2945;">
                <div class="modal-box wide lib-box" style="display:flex;flex-direction:column;max-height:88vh;width:94vw">
                    <h2 class="serif">💬 Client Messaging</h2>
                    <div class="sub mono">Text conversations on the Training Library files, in your program's role. Practice shows coaching and a debrief; Graded is scored and counts in your course.</div>
                    <div id="cmx-modal-body" style="overflow-y:auto;flex:1"></div>
                    <div class="modal-btn-row"><button class="btn-ghost" onclick="closeClientMessaging()">Close</button></div>
                </div></div>`);
        }
    }
    function paintBadge() {
        const tab = $id('tab-messages'); if (!tab) return;
        let b = tab.querySelector('.cmx-unread');
        if (!unread) { if (b) b.remove(); return; }
        if (!b) { tab.insertAdjacentHTML('beforeend', '<span class="cmx-unread"></span>'); b = tab.querySelector('.cmx-unread'); }
        b.textContent = String(unread);
    }
    const paneActive = () => { const p = $id('pane-messages'); return !!(p && p.style.display === 'block'); };

    // The program tab the launcher opens on: the trainee's program (training-library.js), else Reception.
    function defaultProgram() {
        const p = String((window.lshProgram && window.lshProgram()) || '').toLowerCase();
        return K() && K().programOf(p) ? p : 'reception';
    }
    window.openClientMessaging = function (opts) {
        if (!signedIn()) { toast('Sign in to use Client Messaging.', 'error'); return; }
        if (!K()) { toast('Client Messaging is not loaded.', 'error'); return; }
        buildUI();
        opts = opts || {};
        if (opts.program && K().programOf(opts.program)) home.program = opts.program;
        if (!home.program) home.program = defaultProgram();
        home.view = opts.view || 'list';
        $id('cmx-modal').classList.add('open');
        paintHome();
        loadHistory();
    };
    window.closeClientMessaging = function () { const m = $id('cmx-modal'); if (m) m.classList.remove('open'); };
    window.cmxProgram = function (p) { home.program = p; home.view = 'list'; paintHome(); };
    window.cmxView = function (v) { home.view = v; home.saved = null; paintHome(); if (v !== 'list') loadHistory(); };

    function paintHome() {
        const body = $id('cmx-modal-body'); if (!body || !K()) return;
        const progs = K().PROGRAMS.map(p => `<button type="button" class="${home.view === 'list' && home.program === p.id ? 'on' : ''}" onclick="cmxProgram('${p.id}')">${p.icon} ${esc(p.short)}</button>`).join('')
            + `<button type="button" class="${home.view === 'results' ? 'on' : ''}" onclick="cmxView('results')">📊 ${isAdmin() ? 'Team results' : 'My results'}</button>`
            + `<button type="button" class="${home.view === 'policy' ? 'on' : ''}" onclick="cmxView('policy')">📋 Texting policy</button>`;
        let main = '';
        if (home.view === 'policy') main = policyHTML();
        else if (home.view === 'results') main = home.saved ? savedHTML(home.saved) : resultsHTML();
        else {
            const p = K().programOf(home.program);
            const list = K().threadsIn(home.program);
            const busy = C && C.phase !== 'debrief';
            main = `<p style="font-size:12px;color:#475569;margin:0 0 8px">${esc(p.label)} · counts in your ${esc(p.course === 'FT' ? 'Standard Training' : p.label)} course as <b>${esc(K().LINE)}</b> when graded.</p>`
                + (busy ? `<div class="cmx-cap" style="background:#fff7ed;color:#7c2d12">A conversation is in progress (${esc(C.t.title)}). <button class="cmx-btn alt" style="margin-left:6px" onclick="cmxBackToChat()">Back to it</button></div>` : '')
                + `<div class="cmx-list">${list.map(t => {
                    const c = caseOf(t.mock), s = c ? K().senderOf(t, c) : { name: '?' };
                    const best = bestOf(t.id);
                    return `<div class="cmx-item"><div class="t"><b>${esc(t.title)}</b><small>${esc(s.name)}${s.client ? '' : ` (${esc(s.role)})`} · file ${esc(c ? (c.caseNumber || c.id) : t.mock)}${isAdmin() ? ` · ${esc(t.mock)}` : ''}${best != null ? ` · your best ${best}%` : ''}</small></div>
                        <span class="cmx-lvl">${esc(t.level)}</span>
                        <button class="cmx-btn alt" ${busy ? 'disabled' : ''} onclick="cmxStart('${t.id}', false)">Practice</button>
                        <button class="cmx-btn go" ${busy ? 'disabled' : ''} onclick="cmxStart('${t.id}', true)">Graded</button></div>`;
                }).join('')}</div>`;
        }
        body.innerHTML = `<div class="cmx-progs">${progs}</div>${main}`;
    }
    function policyHTML() {
        return `<div class="cmx-card"><h4>The firm's texting policy</h4><ol style="margin:0;padding-left:18px">${K().SMS_POLICY.map(x => `<li style="margin:5px 0">${esc(x)}</li>`).join('')}</ol></div>
            <div class="cmx-card" style="margin-top:10px"><h4>How a conversation is scored</h4><table class="cmx-sc">${K().RUBRIC.map(r => `<tr><td class="n">${esc(r.metric)} ×${r.weight}</td><td>${esc(r.what)}</td></tr>`).join('')}</table>
            <p style="margin:8px 0 0">Each metric is rated 0-5. Missing a conversation's critical goal (sharing with someone unauthorized, advice by text, an emergency handled by text) caps it at 59%.</p></div>`;
    }

    /* ---------- results ---------- */
    async function loadHistory() {
        try {
            const res = await fetch('/api/drill-results', { credentials: 'include' });
            const data = await res.json();
            home.history = data && data.success ? data : { results: [], isAdmin: false };
        } catch (e) { home.history = { results: [], error: true }; }
        if ($id('cmx-modal') && $id('cmx-modal').classList.contains('open')) paintHome();
    }
    const msgRows = () => ((home.history && home.history.results) || []).filter(r => MODES.includes(r.mode));
    function bestOf(threadId) {
        const mine = msgRows().filter(r => r.call_id === threadId && (!home.history.isAdmin || r.username === (session() || {}).username));
        return mine.length ? Math.max(...mine.map(r => r.score)) : null;
    }
    function resultsHTML() {
        const rows = msgRows();
        if (!home.history) return '<p class="cmx-empty">Loading…</p>';
        if (home.history.error) return '<p class="cmx-empty">Couldn\'t load the results. Check your connection and open this again.</p>';
        if (!rows.length) return '<p class="cmx-empty">No conversations yet. Pick one on a program tab.</p>';
        const when = (r) => String(r.created_at || '').slice(0, 16).replace('T', ' ');
        const table = `<table class="cmx-hist"><tr>${home.history.isAdmin ? '<th>Trainee</th>' : ''}<th>Conversation</th><th>Mode</th><th>Score</th><th>When</th><th></th></tr>
            ${rows.slice(0, 200).map(r => `<tr>${home.history.isAdmin ? `<td>${esc(r.full_name || r.username)}</td>` : ''}<td>${esc(r.title || r.call_id || '')}</td><td>${r.mode === 'msg-graded' ? '<b>Graded</b>' : 'Practice'}</td>
                <td><b>${r.score}%</b></td><td>${esc(when(r))}</td><td><button onclick="cmxOpenSaved(${Number(r.id)})">View</button></td></tr>`).join('')}</table>`;
        if (!home.history.isAdmin) return table;
        // the team: each trainee's graded conversations, average and best
        const by = {};
        rows.filter(r => r.mode === 'msg-graded').forEach(r => { const k = r.username; (by[k] = by[k] || { name: r.full_name || r.username, n: 0, sum: 0, best: 0 }); by[k].n++; by[k].sum += r.score; by[k].best = Math.max(by[k].best, r.score); });
        const team = Object.values(by).sort((a, b) => a.name.localeCompare(b.name));
        return `${team.length ? `<div class="cmx-card"><h4>Graded conversations by trainee</h4><table class="cmx-hist"><tr><th>Trainee</th><th>Graded</th><th>Average</th><th>Best</th></tr>
            ${team.map(x => `<tr><td>${esc(x.name)}</td><td>${x.n}</td><td>${Math.round(x.sum / x.n)}%</td><td>${x.best}%</td></tr>`).join('')}</table></div>` : ''}
            <div class="cmx-card" style="margin-top:10px"><h4>Every conversation</h4>${table}</div>`;
    }
    window.cmxOpenSaved = async function (id) {
        home.saved = { loading: true };
        paintHome();
        try {
            const res = await fetch('/api/drill-results?id=' + encodeURIComponent(id), { credentials: 'include' });
            const data = await res.json();
            const r = data && data.success && data.result;
            let d = null; try { d = JSON.parse((r && r.details) || '[]')[0] || null; } catch (e) { d = null; }
            home.saved = r && d ? { row: r, d } : { error: true };
        } catch (e) { home.saved = { error: true }; }
        paintHome();
    };
    function savedHTML(s) {
        if (s.loading) return '<p class="cmx-empty">Loading…</p>';
        if (s.error) return '<p class="cmx-empty">That conversation couldn\'t be opened.</p>';
        const d = s.d, msgs = Array.isArray(d.msgs) ? d.msgs : [];
        return `<p><button class="cmx-btn alt" onclick="cmxView('results')">← Back to the results</button></p>
            <div class="cmx-card"><h4>${esc(d.title)} · ${d.mode === 'msg-graded' ? 'Graded' : 'Practice'} · ${s.row.score}%</h4>
            <p style="margin:0 0 6px">${esc(s.row.full_name || s.row.username)} · with ${esc(d.caller || '')} (${esc(d.number || '')}) · ${esc(String(s.row.created_at || '').slice(0, 16))}</p>
            <div class="cmx-thread" style="max-height:340px;border-radius:10px">${msgs.map(m => bubble(m, d.caller)).join('')}</div>
            ${d.note ? `<h4 style="margin-top:10px">Case note</h4><p style="white-space:pre-wrap;margin:0">${esc(d.note)}</p>` : ''}</div>
            <div class="cmx-card" style="margin-top:10px">${debriefHTML({ score: s.row.score, verdict: d.verdict, scorecard: d.scorecard, goals: d.goals, strengths: d.strengths, improve: d.improve, betterReply: d.betterLine, capped: d.capped, criticalMissed: d.criticalMissed })}</div>`;
    }

    /* ---------- starting a conversation ---------- */
    window.cmxStart = function (id, graded) {
        const t = K() && K().find(id), c = t && caseOf(t.mock);
        if (!t || !c) { toast('That conversation was not found.', 'error'); return false; }
        if (C && C.phase !== 'debrief' && !confirm('End the conversation in progress? It won\'t be saved.')) return false;
        stopTick();
        bypassGuard = true;
        let opened = false;
        try { opened = typeof window.openMockCase === 'function' ? window.openMockCase(t.mock, { silent: true, viewOnly: true, reason: 'messages' }) !== false : false; }
        finally { bypassGuard = false; }
        if (!opened) { toast('The case file couldn\'t be opened.', 'error'); return false; }
        const s = K().senderOf(t, c), on = K().numberOnFile(s.number, c);
        C = { t, file: c, sender: s, onFile: on, graded: !!graded, t0: Date.now(), secs: 0, msgs: [], phase: 'chat', waiting: false, quiet: false, optedOut: false,
            note: '', notedOnFile: false, reviewing: false, review: null, reviewError: '', saved: '', course: null, draft: '' };
        closeClientMessaging();
        if (typeof window.showTab === 'function') window.showTab('messages');
        paint();
        startTick();
        const mine = C;
        setTimeout(() => { if (C === mine) arrive(t.opening); }, 1100);
        return true;
    };
    window.cmxBackToChat = function () { closeClientMessaging(); if (typeof window.showTab === 'function') window.showTab('messages'); };
    function startTick() { stopTick(); tick = setInterval(() => { if (!C || C.phase !== 'chat') return stopTick(); const el = $id('cmx-clock'); if (el) el.textContent = fmtSec(Math.round((Date.now() - C.t0) / 1000)); }, 1000); }
    function stopTick() { if (tick) clearInterval(tick); tick = null; }

    // A text from them comes in
    const OPT_OUT = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\b/i;
    function arrive(text) {
        if (!C) return;
        const clean = String(text || '').replace(/\[END\]/gi, '').replace(/^\s*["“]|["”]\s*$/g, '').trim();
        if (clean) C.msgs.push({ who: 'them', text: clean.slice(0, 600), at: Date.now() });
        if (/\[END\]/i.test(String(text || ''))) C.quiet = true;
        if (OPT_OUT.test(clean)) C.optedOut = true;
        if (!paneActive()) { unread++; paintBadge(); }
        if (clean) ping();
        paint();
    }
    function ping() {
        try {
            const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
            o.frequency.value = 880; g.gain.value = 0.04; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.12);
            setTimeout(() => a.close(), 300);
        } catch (e) { /* no sound: fine */ }
    }

    /* ---------- the texter's next text ---------- */
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
    // A busy line is retried 3 times (1.5 s, 3 s, 6 s); stale() → the conversation moved on, stop quietly.
    async function askWithRetry(purpose, system, messages, json, stale, module) {
        for (let attempt = 0; ; attempt++) {
            const r = await askAI(purpose, system, messages, json, module);
            if (stale()) return null;
            if (r.ok || !r.retry || attempt >= 3) return r;
            await new Promise(res => setTimeout(res, 1500 * Math.pow(2, attempt)));
            if (stale()) return null;
        }
    }
    // The conversation as the texter's model sees it: their texts are the model's, the trainee's the user's; texts in a row
    // from the same side are one turn.
    function turns() {
        const out = [{ role: 'user', text: '(Your text to the firm\'s number is about to go out. Send your first text.)' }];
        C.msgs.forEach(m => {
            const role = m.who === 'them' ? 'model' : 'user', last = out[out.length - 1];
            if (last.role === role) last.text += '\n' + m.text; else out.push({ role, text: m.text });
        });
        if (out[out.length - 1].role === 'model') out.push({ role: 'user', text: '(No new text from the firm yet. If you would wait, reply with [END] only.)' });
        return out;
    }
    async function reply() {
        if (!C || C.waiting) return;
        const mine = C, sentAt = mine.msgs.length;
        mine.waiting = true; paint();
        const r = await askWithRetry('caller', K().texterPrompt(mine.t, mine.file, firm()), turns(), false, () => C !== mine || mine.phase !== 'chat', K().aiModule(mine.t));
        if (C !== mine) return;
        if (!r) { mine.waiting = false; paint(); return; }
        if (!r.ok) { mine.waiting = false; mine.msgs.push({ who: 'sys', text: `Their reply didn't come through (${r.error}). Send your text again, or end the conversation.`, at: Date.now() }); paint(); return; }
        // a person takes a moment to type: about a second plus their message's length
        const wait = Math.min(3500, 600 + String(r.text).length * 18);
        await new Promise(res => setTimeout(res, wait));
        if (C !== mine || mine.phase !== 'chat') return;
        mine.waiting = false;
        if (String(r.text).replace(/\[END\]/gi, '').trim()) arrive(r.text); else { mine.quiet = true; paint(); }
        // the trainee texted again while they were typing: they answer that too
        if (mine.msgs.slice(sentAt).some(m => m.who === 'you') && !mine.quiet) reply();
    }

    /* ---------- sending ---------- */
    // GSM-7 texts are 160 characters (153 per part when longer); anything else (emoji, curly quotes) 70 (67).
    const GSM = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;
    function segments(text) {
        const s = String(text || ''); if (!s) return { chars: 0, parts: 0, per: 160 };
        const gsm = GSM.test(s), one = gsm ? 160 : 70, many = gsm ? 153 : 67;
        return { chars: s.length, parts: s.length <= one ? 1 : Math.ceil(s.length / many), per: one, gsm };
    }
    window.cmxInput = function (el) {
        if (!C) return;
        C.draft = el.value;
        const seg = segments(el.value), n = $id('cmx-count');
        if (n) { n.textContent = seg.chars ? `${seg.chars} characters · ${seg.parts} text${seg.parts === 1 ? '' : 's'}${seg.gsm === false ? ' (special characters)' : ''}` : ''; n.className = 'cmx-count' + (seg.parts > 3 ? ' over' : ''); }
        const b = $id('cmx-send'); if (b) b.disabled = !el.value.trim();
    };
    window.cmxKey = function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); cmxSend(); } };
    window.cmxSend = function () {
        if (!C || C.phase !== 'chat') return;
        const box = $id('cmx-text'), text = String(box ? box.value : C.draft || '').trim();
        if (!text) return;
        if (text.length > 1000) { toast('That\'s too long for a text. Keep it short, or say you will call.', 'error'); return; }
        C.msgs.push({ who: 'you', text, at: Date.now() });
        C.draft = ''; tplOpen = false;
        paint();
        const again = $id('cmx-text'); if (again) again.focus();
        reply();
    };

    /* ---------- quick replies ---------- */
    function fields() {
        const c = C ? C.file : caseOf(openFileId()), f = firm() || {}, s = session() || {};
        const dir = (name) => (f.directory || []).find(d => d.name === name);
        const cm = c && c.caseManager ? c.caseManager : '', cmEntry = cm ? dir(cm) : null;
        const next = c ? (c.chrono || []).filter(r => r.next).map(r => ({ r, d: Date.parse(String(r.next).split(' ')[0]) })).sort((a, b) => (a.d || 0) - (b.d || 0))[0] : null;
        const prov = next && (c.facilities || []).find(x => x.name === next.r.facility);
        const sender = C ? C.sender : null;
        return {
            client_first: sender ? String(sender.name).split(/\s+/)[0] : (c ? String(c.client.name).split(/\s+/)[0] : ''),
            my_name: String(s.fullName || s.username || '').split(/\s+/)[0],
            firm: f.name ? f.name.replace(/\s*\(fictional\)\s*/i, '') : '', main_line: f.mainLine || '', firm_address: f.address || '',
            cm: cm || 'our Intake Team', cm_ext: cmEntry ? cmEntry.ext : (cm ? '' : '100'),
            attorney: c ? c.attorney : '',
            provider: next ? next.r.facility : '', next_visit: next ? next.r.next : '', provider_phone: prov ? prov.phone : ''
        };
    }
    const fill = (text) => { const v = fields(); return String(text).replace(/\{(\w+)\}/g, (all, k) => (v[k] ? v[k] : `[${k.replace(/_/g, ' ')}]`)); };
    window.cmxTemplates = function () { tplOpen = !tplOpen; paint(); };
    window.cmxUseTemplate = function (id) {
        const t = K().TEMPLATES.find(x => x.id === id); if (!t || !C) return;
        const box = $id('cmx-text');
        const text = fill(t.text);
        const now = box && box.value.trim() ? `${box.value.trim()} ${text}` : text;
        C.draft = now; tplOpen = false; paint();
        const b = $id('cmx-text'); if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); cmxInput(b); }
    };

    /* ---------- ending, the note, the debrief ---------- */
    window.cmxEnd = function () {
        if (!C || C.phase !== 'chat') return;
        if (!C.msgs.some(m => m.who === 'you') && !confirm('You haven\'t replied yet. End the conversation anyway?')) return;
        C.phase = 'wrap'; C.secs = Math.round((Date.now() - C.t0) / 1000); stopTick();
        const s = C.sender;
        C.note = C.note || `Text conversation with ${s.name}${s.client ? '' : ` (${s.role.toLowerCase()})`} from ${s.number}.\nVerified: \nThey asked: \nI told them: \nNext step and who owns it: `;
        paint();
        const n = $id('cmx-note'); if (n) n.focus();
    };
    window.cmxNote = function (el) { if (C) C.note = el.value; const b = $id('cmx-grade'); if (b) b.disabled = C.graded && !noteWritten(); };
    // A note is written when there's more in it than the outline it starts with.
    const OUTLINE = /^(text conversation with.*|verified:|they asked:|i told them:|next step and who owns it:)\s*$/i;
    const noteWritten = () => !!C && String(C.note || '').split('\n').filter(l => l.trim() && !OUTLINE.test(l.trim())).join(' ').replace(/\s+/g, ' ').length >= 30;
    const mayLogToFile = () => !isAdmin() && !!$id('note-body');
    window.cmxLogNote = function () {
        if (!C || !noteWritten()) { toast('Write the note first.', 'error'); return; }
        if (!mayLogToFile()) { toast('A trainer\'s note would change the library file for everyone, so it isn\'t added. It is saved with the conversation.', 'info'); return; }
        if (typeof addRow !== 'function') return;
        addRow('note-body');
        const tr = $id('note-body').lastElementChild; if (!tr) return;
        const sel = tr.querySelector('select'), role = K().roleOf(C.t);
        if (sel) { const o = [...sel.options].find(x => x.text === role); if (o) sel.value = o.value; }
        const cells = tr.querySelectorAll('[contenteditable="true"]'), text = cells[cells.length - 1];
        if (text) { text.innerText = `💬 ${C.note.trim()}`; text.dispatchEvent(new Event('input', { bubbles: true })); }
        C.notedOnFile = true;
        toast('Added to the file\'s Case Notes.', 'success');
        paint();
    };
    window.cmxBackToChatPhase = function () { if (C && C.phase === 'wrap') { C.phase = 'chat'; C.t0 = Date.now() - C.secs * 1000; startTick(); paint(); } };
    window.cmxGrade = async function () {
        if (!C || C.phase !== 'wrap') return;
        if (C.graded && !noteWritten()) { toast('A graded conversation needs its Case Note.', 'error'); return; }
        const mine = C;
        mine.phase = 'debrief'; mine.reviewing = true; mine.reviewError = ''; paint();
        const prompt = K().gradePrompt(mine.t, { file: mine.file, firm: firm(), transcript: transcript(mine), note: noteWritten() ? mine.note : '', secs: mine.secs });
        const r = await askWithRetry('review', K().GRADE_SYSTEM, [{ role: 'user', text: prompt }], true, () => C !== mine, K().aiModule(mine.t));
        if (C !== mine || !r) return;
        mine.reviewing = false;
        const g = r.ok ? K().parseGrade(r.text, mine.t) : null;
        if (!g) { mine.reviewError = r.ok ? 'The debrief came back unreadable.' : r.error; paint(); return; }
        mine.review = g; paint();
        save(mine);
    };
    window.cmxRetryGrade = function () { if (C && C.phase === 'debrief' && !C.review) { C.phase = 'wrap'; cmxGrade(); } };
    const who = (m, c) => (m.who === 'you' ? 'FIRM (trainee)' : m.who === 'sys' ? 'SYSTEM' : `${c.sender.name.toUpperCase()} (${c.sender.number})`);
    function transcript(c) {
        const t0 = c.t0;
        return c.msgs.filter(m => m.who !== 'sys').map(m => `[+${fmtSec(Math.max(0, Math.round((m.at - t0) / 1000)))}] ${who(m, c)}: ${m.text}`).join('\n');
    }
    async function save(c) {
        const g = c.review, course = K().courseOf(c.t);
        const detail = { pack: true, kind: 'message', id: c.t.id, program: course.program, cmsProgram: c.t.program, line: K().LINE, title: c.t.title, caller: c.sender.name, role: c.sender.role,
            number: c.sender.number, onFile: c.onFile.on, mode: c.graded ? 'msg-graded' : 'msg', secs: c.secs, score: g.score, verdict: g.verdict, goals: g.goals,
            strengths: g.strengths, improve: g.improve, betterLine: g.betterReply, scorecard: g.scorecard, capped: g.capped, criticalMissed: g.criticalMissed,
            file: { id: c.t.mock, caseNumber: c.file.caseNumber || '' }, course, turns: c.msgs.filter(m => m.who === 'you').length,
            note: noteWritten() ? String(c.note).slice(0, 3000) : '', notedOnFile: c.notedOnFile, optedOut: c.optedOut,
            msgs: c.msgs.filter(m => m.who !== 'sys').slice(0, 80).map(m => ({ who: m.who, text: String(m.text).slice(0, 600), at: new Date(m.at).toISOString() })) };
        c.saved = 'saving'; paint();
        try {
            const res = await fetch('/api/drill-results', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ mode: detail.mode, program: course.program, calls: 1, details: [detail], score: g.score, findPct: 0, authPct: 0, actionPct: 0, avgSeconds: c.secs })
            });
            const data = await res.json().catch(() => ({}));
            c.saved = data && data.success ? 'saved' : 'failed';
            c.course = data && data.course || null;
        } catch (e) { c.saved = 'failed'; }
        // the file's Messages tab keeps the conversation (the trainee's own copy)
        try {
            await fetch('/api/case-messages', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ ref: c.t.mock, conversation: { id: c.t.id, title: c.t.title, with: c.sender.name, number: c.sender.number, graded: c.graded, score: g.score, msgs: detail.msgs } })
            });
            threads.ref = null;   // read again next time the tab paints
        } catch (e) { /* the result is what counts; the tab's history is a convenience */ }
        if (C === c) paint();
        loadHistory();
    }
    window.cmxAgain = function () { if (C) { const id = C.t.id, g = C.graded; C = null; cmxStart(id, g); } };
    window.cmxDone = function () { C = null; unread = 0; paintBadge(); stopTick(); paint(); openClientMessaging({ program: home.program }); };
    function countedText(c) {
        const x = c.course;
        if (!c.graded) return 'Practice: saved in your results, not counted in your course.';
        if (!x) return c.saved === 'saved' ? 'Saved.' : '';
        if (x.counted) return `It counts toward your course (${esc(x.line || K().LINE)})${x.best && typeof x.best.score === 'number' ? `: your best there is ${x.best.score}%` : ''}.`;
        if (x.reason === 'not-connected') return 'Saved here, but not counted in your course: this site isn\'t connected to the Training Portal yet. Tell your trainer.';
        if (x.reason === 'no-name') return 'Saved here, but not counted in your course: your account has no first and last name. Tell your trainer.';
        return 'Saved here; the Training Portal didn\'t take it yet, so it may not show in your course.';
    }

    /* ---------- the Messages tab ---------- */
    const initials = (n) => String(n || '?').replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
    function bubble(m, name) {
        if (m.who === 'sys') return `<div class="cmx-sys">${esc(m.text)}</div>`;
        const at = m.at ? clock(m.at) : '';
        return `<div class="cmx-msg ${m.who === 'you' ? 'you' : 'them'}">${esc(m.text)}</div><div class="cmx-meta ${m.who === 'you' ? 'you' : 'them'}">${m.who === 'you' ? 'You' : esc(name || '')}${at ? ` · ${at}` : ''}</div>`;
    }
    function paint() {
        const pane = $id('pane-messages'); if (!pane) return;
        const keepScroll = pane.querySelector('.cmx-thread');
        const atBottom = !keepScroll || keepScroll.scrollHeight - keepScroll.scrollTop - keepScroll.clientHeight < 40;
        const focused = document.activeElement && document.activeElement.id;
        pane.innerHTML = C && caseOf(openFileId()) && openFileId() === C.t.mock ? conversationHTML() : idleHTML();
        const th = pane.querySelector('.cmx-thread'); if (th && atBottom) th.scrollTop = th.scrollHeight;
        if (focused) { const el = $id(focused); if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) { el.focus(); if (el.value != null) el.setSelectionRange(el.value.length, el.value.length); } }
        if (!threads.loading && threads.ref !== openFileId()) loadThreads();
    }
    function headHTML(name, number, on, extra) {
        const badge = on && on.on ? `<span class="cmx-badge on">On file: ${esc(on.who)}</span>` : `<span class="cmx-badge unk">Unknown number: not on this file</span>`;
        return `<div class="cmx-head"><div class="cmx-av${on && on.on ? '' : ' unk'}">${esc(initials(on && on.on ? name : '#'))}</div>
            <div class="cmx-who"><b>${esc(on && on.on ? name : number)}${C && C.optedOut ? '<span class="cmx-badge out">⛔ Replied STOP</span>' : ''}</b><small>${on && on.on ? `${esc(number)} ` : ''}${badge}</small></div>${extra || ''}</div>`;
    }
    function conversationHTML() {
        const c = C, s = c.sender;
        const clockEl = c.phase === 'chat' ? `<span class="cmx-clock" id="cmx-clock" title="Time in the conversation">${fmtSec(Math.round((Date.now() - c.t0) / 1000))}</span>` : '';
        const tag = `<span class="cmx-lvl" style="${c.graded ? 'background:#fff7ed;color:#9a3412' : ''}">${c.graded ? 'Graded' : 'Practice'}</span>`;
        const thread = `<div class="cmx-thread" id="cmx-thread"><div class="cmx-day">${esc(day(c.t0))}</div>${c.msgs.map(m => bubble(m, s.name)).join('')}
            ${c.waiting ? '<div class="cmx-typing" aria-label="typing"><i></i><i></i><i></i></div>' : ''}
            ${c.quiet && c.phase === 'chat' ? `<div class="cmx-sys">${esc(s.name)} seems done. End the conversation when you are.</div>` : ''}</div>`;
        let bottom = '';
        if (c.phase === 'chat') {
            const seg = segments(c.draft);
            bottom = `<div class="cmx-compose">${tplOpen ? `<div class="cmx-tpl" role="menu">${K().TEMPLATES.map(t => `<button type="button" role="menuitem" onclick="cmxUseTemplate('${t.id}')"><b>${esc(t.label)}</b><span>${esc(fill(t.text))}</span></button>`).join('')}</div>` : ''}
                <label for="cmx-text" style="position:absolute;left:-9999px">Your text to ${esc(s.name)}</label>
                <textarea id="cmx-text" rows="3" placeholder="Text ${esc(s.client ? String(s.name).split(' ')[0] : 'them')}…  (Enter sends · Shift+Enter for a new line)" oninput="cmxInput(this)" onkeydown="cmxKey(event)">${esc(c.draft)}</textarea>
                <div class="cmx-row"><button type="button" class="cmx-btn alt" onclick="cmxTemplates()" aria-expanded="${tplOpen}">⚡ Quick replies</button>
                <span id="cmx-count" class="cmx-count${seg.parts > 3 ? ' over' : ''}">${seg.chars ? `${seg.chars} characters · ${seg.parts} text${seg.parts === 1 ? '' : 's'}` : ''}</span><span class="sp"></span>
                <button type="button" class="cmx-btn alt" onclick="cmxEnd()">✓ End conversation</button>
                <button type="button" id="cmx-send" class="cmx-btn go" onclick="cmxSend()" ${c.draft && c.draft.trim() ? '' : 'disabled'}>Send ➤</button></div></div>`;
        } else if (c.phase === 'wrap') {
            bottom = `<div class="cmx-wrap"><h4>📝 Case Note</h4>
                <p style="margin:0 0 6px;font-size:11.5px;color:#475569">Who texted (name and number), verified or not, what they asked, what you told them, and the next step with who owns it.${c.graded ? ' A graded conversation needs it.' : ''}</p>
                <label for="cmx-note" style="position:absolute;left:-9999px">Case note</label>
                <textarea id="cmx-note" rows="6" oninput="cmxNote(this)">${esc(c.note)}</textarea>
                <div class="cmx-row"><button type="button" class="cmx-btn alt" onclick="cmxBackToChatPhase()">← Back to the texts</button>
                ${mayLogToFile() ? `<button type="button" class="cmx-btn alt" onclick="cmxLogNote()" ${c.notedOnFile ? 'disabled' : ''}>${c.notedOnFile ? '✓ In the Case Notes' : '📝 Add to Case Notes'}</button>` : ''}
                <span class="sp"></span><button type="button" id="cmx-grade" class="cmx-btn go" onclick="cmxGrade()" ${c.graded && !noteWritten() ? 'disabled' : ''}>Get my debrief</button></div></div>`;
        } else {
            bottom = `<div class="cmx-wrap" style="background:#fff">${c.reviewing ? '<p style="margin:0">Reviewing the conversation…</p>'
                : c.review ? debriefHTML(c.review) + `<p style="margin:8px 0 0;font-size:11.5px;color:#475569">${c.saved === 'saving' ? 'Saving…' : c.saved === 'failed' ? '⚠ It couldn\'t be saved. Check your connection.' : countedText(c)}</p>
                    <div class="cmx-row"><span class="sp"></span><button type="button" class="cmx-btn alt" onclick="cmxAgain()">↻ Try it again</button><button type="button" class="cmx-btn" onclick="cmxDone()">Back to Client Messaging</button></div>`
                : `<p style="margin:0 0 8px">The debrief couldn't be had: ${esc(c.reviewError)}</p><div class="cmx-row"><button type="button" class="cmx-btn go" onclick="cmxRetryGrade()">Try again</button></div>`}</div>`;
        }
        return `<div class="cmx"><div class="cmx-main">${headHTML(s.name, s.number, c.onFile, `${tag}${clockEl}`)}${thread}${bottom}</div>${sideHTML(c)}</div>`;
    }
    function sideHTML(c) {
        const f = c.file, cl = f.client || {};
        const coaching = !c.graded ? `<div class="cmx-card"><h4>🎯 What a good reply does (Practice)</h4><ul>${c.t.goals.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>` : '';
        return `<aside class="cmx-side"><div class="cmx-card"><h4>On this file</h4>
            <div><b>${esc(cl.name)}</b> · ${esc(f.caseNumber || f.id)}</div><div>Mobile on file: ${esc(cl.phone || '—')}</div>
            <div>Attorney: ${esc(f.attorney || '—')} · Case manager: ${esc(f.caseManager || 'not assigned')}</div>
            <p style="margin:6px 0 0;color:#475569">Everything else is on the file's tabs: click any tab and come back here.</p></div>
            ${coaching}
            <div class="cmx-card"><details><summary>📋 Texting policy</summary><ol style="margin:6px 0 0;padding-left:16px">${K().SMS_POLICY.map(x => `<li style="margin:4px 0">${esc(x)}</li>`).join('')}</ol></details></div></aside>`;
    }
    function debriefHTML(g) {
        const sc = g.scorecard || { rows: [] };
        return `<div class="cmx-score${g.score < 60 ? ' low' : ''}"><b>${g.score}%</b><div>${g.verdict ? `<div style="font-weight:700;color:#0f172a">${esc(g.verdict)}</div>` : ''}</div></div>
            ${g.capped || (g.criticalMissed && g.criticalMissed.length) ? `<div class="cmx-cap"><b>Capped at 59%:</b> a critical goal was missed: ${esc((g.criticalMissed || []).join('; '))}</div>` : ''}
            <h4 style="margin:8px 0 4px;font-size:11px;text-transform:uppercase;color:#0f2148">Goals</h4>
            <ul class="cmx-goals">${(g.goals || []).map(x => `<li><span class="${x.met ? 'ok' : 'no'}">${x.met ? '✓' : '○'}</span><div>${esc(x.goal)}${x.note ? `<small>${esc(x.note)}</small>` : ''}</div></li>`).join('')}</ul>
            <h4 style="margin:10px 0 4px;font-size:11px;text-transform:uppercase;color:#0f2148">${esc(sc.title || 'Scorecard')}${sc.average != null ? ` · ${sc.average} / 5` : ''}</h4>
            <table class="cmx-sc">${(sc.rows || []).map(r => `<tr><td class="n">${esc(r.metric)}</td><td class="n">${r.score}/5</td><td>${esc(r.feedback || '')}</td></tr>`).join('')}</table>
            ${g.strengths && g.strengths.length ? `<div style="font-weight:700;color:#166534;margin-top:8px">What worked</div><ul style="margin:2px 0;padding-left:18px">${g.strengths.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
            ${g.improve && g.improve.length ? `<div style="font-weight:700;color:#9a3412;margin-top:6px">Next time</div><ul style="margin:2px 0;padding-left:18px">${g.improve.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
            ${g.betterReply ? `<div class="cmx-better"><b>Try texting:</b> “${esc(g.betterReply)}”</div>` : ''}`;
    }
    // No conversation on this file right now: its saved conversations, and the ones that can be started on it.
    function idleHTML() {
        const id = openFileId(), c = caseOf(id);
        if (!c) {
            return `<div class="cmx-empty"><h3>💬 Messages</h3><p>Texts with a client show here, on their file. The Training Library's files have conversations to practice: open <b>💬 Client Messaging</b> in the sidebar.</p>
                <p><button class="cmx-btn go" onclick="openClientMessaging()">Open Client Messaging</button></p></div>`;
        }
        const here = K() ? K().THREADS.filter(t => t.mock === id) : [];
        const p = String((window.lshProgram && window.lshProgram()) || '');
        here.sort((a, b) => (b.program === p) - (a.program === p));
        const past = threads.ref === id ? threads.list : [];
        const history = past.length ? `<div class="cmx-thread" style="max-height:48vh">${past.map(cv => `<div class="cmx-day">${esc(cv.title)} · ${esc(day(cv.at))}${cv.graded ? ` · graded ${cv.score}%` : ''}</div>${(cv.msgs || []).map(m => bubble({ who: m.who, text: m.text, at: Date.parse(m.at) }, cv.with)).join('')}`).join('')}</div>`
            : threads.loading ? '<p class="cmx-empty">Loading the texts…</p>' : '<p class="cmx-empty" style="padding:18px">No texts on this file yet.</p>';
        const start = here.length ? `<div class="cmx-start">${here.map(t => `<div><span><b>${esc(t.title)}</b> · ${esc((K().programOf(t.program) || {}).short || '')} · ${esc(t.level)}</span>
            <button class="cmx-btn alt" onclick="cmxStart('${t.id}', false)">Practice</button><button class="cmx-btn go" onclick="cmxStart('${t.id}', true)">Graded</button></div>`).join('')}</div>` : '';
        const cl = c.client || {};
        return `<div class="cmx"><div class="cmx-main">${headHTML(cl.name, cl.phone || '', { on: true, who: `${cl.name} (client)` })}${history}
            <div class="cmx-compose" style="background:#f8fafc"><p style="margin:0;font-size:12px;color:#475569">${here.length ? 'Start a conversation on this file:' : 'No practice conversations are set up for this file. Open 💬 Client Messaging in the sidebar for the ones that are.'}</p>${start}</div></div>
            <aside class="cmx-side"><div class="cmx-card"><h4>💬 Client Messaging</h4><p style="margin:0 0 8px">Texts to the firm land on the file whose contact owns the number, like a real case management system. Practice and graded conversations for every program are in the sidebar.</p>
            <button class="cmx-btn go" onclick="openClientMessaging()">Open Client Messaging</button></div>
            <div class="cmx-card"><details><summary>📋 Texting policy</summary><ol style="margin:6px 0 0;padding-left:16px">${(K() ? K().SMS_POLICY : []).map(x => `<li style="margin:4px 0">${esc(x)}</li>`).join('')}</ol></details></div></aside></div>`;
    }
    async function loadThreads() {
        const id = openFileId(); if (!id || !signedIn()) return;
        threads.loading = true; threads.ref = id; threads.list = [];
        try {
            const res = await fetch('/api/case-messages?ref=' + encodeURIComponent(id), { credentials: 'include' });
            const data = await res.json();
            if (threads.ref === id) threads.list = data && data.success && Array.isArray(data.conversations) ? data.conversations : [];
        } catch (e) { /* no history: the tab still works */ }
        threads.loading = false;
        if (paneActive() && openFileId() === id && !(C && C.t.mock === id)) paint();
    }

    /* ---------- the tab, the case changing, the session ---------- */
    const baseShowTab = window.showTab;
    if (typeof baseShowTab === 'function') {
        window.showTab = function (id) {
            const r = baseShowTab.apply(this, arguments);
            if (id === 'messages') { unread = 0; paintBadge(); paint(); }
            return r;
        };
    }
    // Another file (or a blank case) while a conversation is going: ask first; the conversation stays on its own file.
    ['openMockCase', 'loadCase', 'newCase'].forEach(name => {
        const fn = window[name];
        if (typeof fn !== 'function') return;
        window[name] = function () {
            if (!bypassGuard && C && C.phase !== 'debrief' && !(name === 'openMockCase' && arguments[0] === C.t.mock)) {
                if (!confirm('A text conversation is in progress on this file. Leave it? It won\'t be saved.')) return false;
                C = null; stopTick(); unread = 0; paintBadge();
            }
            const r = fn.apply(this, arguments);
            setTimeout(() => { threads.ref = null; if (paneActive()) paint(); }, 120);
            return r;
        };
    });
    // A course link: ?messages=1 opens Client Messaging (&program= its tab), &thread=<id> starts that conversation (&mode=graded).
    function openFromLink() {
        const q = new URLSearchParams(location.search);
        if (!q.has('messages') && !q.has('thread')) return false;
        const t = q.get('thread') && K() && K().find(q.get('thread'));
        if (t) { home.program = t.program; cmxStart(t.id, q.get('mode') === 'graded'); return true; }
        openClientMessaging({ program: String(q.get('program') || '').toLowerCase() });
        return true;
    }
    const origApply = window.applySessionUI;
    if (typeof origApply === 'function') {
        window.applySessionUI = function () {
            const r = origApply.apply(this, arguments);
            buildUI();
            if (!signedIn()) { C = null; stopTick(); unread = 0; paintBadge(); closeClientMessaging(); threads = { ref: null, list: [], loading: false }; home.history = null; }
            else if (!window.__cmxOpened && /[?&](messages|thread)=/.test(location.search)) { window.__cmxOpened = true; setTimeout(openFromLink, 400); }
            return r;
        };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI); else buildUI();
    window.cmxState = () => ({ C, threads, home, fields: C ? fields() : null });   // for the tests and debugging
    window.cmxFill = fill;
    window.cmxSegments = segments;
})();
