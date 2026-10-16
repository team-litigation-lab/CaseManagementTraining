/* =========================================================
   LSH CMS — 💬 CLIENT MESSAGING
   ---------------------------------------------------------
   The case's text thread with its client, the way a firm's
   case management system keeps one:
     - the 💬 badge beside the timer (in the case header, under
       the search bars) shows the open case's unread texts on
       every tab; clicking it opens the thread;
     - the 💬 Messages tab holds the thread: the client's texts,
       the trainee's replies, and the coaching note on each
       reply (what a good answer does, and why).
   The client's side is scripted (message-packs.js), the same
   way the Call Simulator's callers are: nothing is ever sent
   to anyone, and the clients are fictional.

   The thread lives on the server (/api/messages), so it keeps
   its place across reloads and browser tabs, and a trainer can
   read what a trainee wrote. Each trainee has their own thread
   on a case.

   No <select> or contenteditable here on purpose: the case
   editor saves every select and contenteditable on the page by
   position (buildCaseContentPayload in app.js).
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t, d) => { if (typeof showToast === 'function') showToast(m, t || 'info', d); };
    const signedIn = () => typeof hasAuthorizedAccess === 'function' && hasAuthorizedAccess();
    const API = '/api/messages';
    const MAX_BODY = 1600;

    let M = { open: false, busy: false, messages: [], unread: 0, draft: '', error: '', thread: null, lastCase: '' };
    let channel = null;
    try { channel = new BroadcastChannel('lsh-messages'); channel.onmessage = () => { refresh(); }; } catch (e) { /* polling only */ }
    const announce = () => { if (channel) channel.postMessage('changed'); };

    /* ---------- the open case (the same reading as the timer) ---------- */
    function openCase() {
        const mockId = typeof window.mockCurrentId === 'function' ? window.mockCurrentId() : null;
        if (mockId) {
            const m = (window.MOCK_CASES || []).find(c => c.id === mockId);
            if (m) return { ref: m.id, label: m.client.name };
        }
        const nameEl = $id('client-name-field');
        const label = nameEl ? (nameEl.innerText.split('\n')[0] || '').trim() : '';
        if (!label) return null;
        const idText = $id('case-id-field') ? $id('case-id-field').innerText.trim() : '';
        return { ref: /^LSH-\d{4}-/.test(idText) && !/-----/.test(idText) ? idText : '', label };
    }
    const caseKey = (c) => c ? `${c.ref}|${c.label}`.toLowerCase() : '';
    const packs = () => window.MESSAGE_PACKS || null;
    const shownRef = (ref) => window.lshShownRef ? window.lshShownRef(ref) : ref;
    const fmtWhen = (s) => {
        const t = Date.parse(String(s || '').replace(' ', 'T') + (/[Z+]/.test(String(s)) ? '' : 'Z'));
        if (Number.isNaN(t)) return '';
        const d = new Date(t), today = new Date();
        const sameDay = d.toDateString() === today.toDateString();
        const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        return sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
    };

    /* ---------- server ---------- */
    async function api(method, url, body) {
        let res, data = {};
        try {
            res = await fetch(url, body ? { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method, credentials: 'include' });
        } catch (e) { throw new Error('Could not reach the server. Try again.'); }
        try { data = await res.json(); } catch (e) { data = {}; }
        if (!res.ok || data.success === false) { const err = new Error(data.error || `Request failed (${res.status}).`); err.status = res.status; throw err; }
        return data;
    }
    const caseBody = (c) => ({ caseRef: c.ref, caseLabel: c.label });
    function take(data) {
        M.messages = (data && data.messages) || [];
        M.unread = (data && data.unread) || 0;
        renderBadge();
        if (M.open) renderTab();
    }

    // The client's next text: the one the last answered message points to, or the pack's first.
    function nextScripted(c) {
        const P = packs(); if (!P) return null;
        const pack = P.packFor(c);
        const sent = M.messages.filter(m => m.direction === 'in');
        if (!sent.length) return P.message(pack, pack.start, c);
        const last = sent[sent.length - 1];
        // The client answers back only once the trainee has replied to their last text.
        const answered = M.messages.some(m => m.direction === 'out' && m.promptId === last.promptId);
        if (!answered) return null;
        const def = pack.messages[last.promptId];
        return def && def.next ? P.message(pack, def.next, c) : null;
    }
    async function deliverNext(c) {
        const m = nextScripted(c);
        if (!m) return;
        take(await api('POST', API, {
            action: 'deliver', ...caseBody(c),
            message: { body: m.body, sender: m.sender, promptId: m.id, packId: m.packId, goals: m.goals || [] }
        }));
        announce();
    }

    async function refresh() {
        const c = openCase();
        if (!signedIn() || !c) { M.messages = []; M.unread = 0; M.thread = null; renderBadge(); if (M.open) renderTab(); return; }
        if (M.busy) return;
        M.busy = true;
        try {
            const key = caseKey(c);
            if (key !== M.lastCase) { M.lastCase = key; M.draft = ''; }
            take(await api('GET', `${API}?caseRef=${encodeURIComponent(c.ref)}&caseLabel=${encodeURIComponent(c.label)}`));
            await deliverNext(c);      // the client's first text on a case nobody has opened yet
            M.error = '';
        } catch (e) {
            M.error = e.message || 'Could not load the messages.';
            if (M.open) renderTab();
        } finally { M.busy = false; }
    }

    /* ---------- the 💬 badge, beside the timer ---------- */
    function ensureCss() {
        if ($id('cm-css')) return;
        const css = document.createElement('style');
        css.id = 'cm-css';
        css.textContent = `
        #cm-header-row{display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-wrap:wrap}
        #cm-header-row #tt-widget{width:auto;margin:6px 0 0 0}
        #cm-badge{margin-top:6px}
        #cm-badge button{display:inline-flex;align-items:center;gap:6px;border:1px solid #e2e8f0;background:#f8fafc;color:#334155;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:800;cursor:pointer;line-height:1.25;white-space:nowrap}
        #cm-badge button:hover{border-color:#f97316;color:#c2410c}
        #cm-badge button.has{border-color:#f97316;background:#fff7ed;color:#c2410c;box-shadow:0 0 0 1px rgba(249,115,22,.25)}
        #cm-badge .cm-n{background:#f97316;color:#fff;border-radius:999px;padding:0 6px;font-size:10px;min-width:16px;text-align:center}
        #cm-root .cm-box{background:#fff;border-radius:10px;border-left:8px solid var(--orange,#f97316);box-shadow:0 4px 18px rgba(15,23,42,.08);padding:18px;color:#0f172a;font-size:13px}
        #cm-root h2{margin:0;font-size:20px}
        #cm-root .sub{font-size:11.5px;color:#64748b}
        #cm-root .cm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
        #cm-root .cm-thread{border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-top:14px;max-height:52vh;overflow-y:auto;background:#f8fafc}
        #cm-root .cm-msg{display:flex;flex-direction:column;max-width:min(560px,82%);margin-bottom:12px}
        #cm-root .cm-msg.out{margin-left:auto;align-items:flex-end}
        #cm-root .cm-who{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin-bottom:3px}
        #cm-root .cm-bub{background:#fff;border:1px solid #e2e8f0;border-radius:12px 12px 12px 3px;padding:9px 12px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
        #cm-root .cm-msg.out .cm-bub{background:#0f2148;border-color:#0f2148;color:#fff;border-radius:12px 12px 3px 12px}
        #cm-root .cm-msg.in.unread .cm-bub{border-color:#f97316;box-shadow:0 0 0 1px rgba(249,115,22,.25)}
        #cm-root .cm-when{font-size:10px;color:#94a3b8;margin-top:3px}
        #cm-root .cm-coach{border:1px dashed #cbd5e1;border-radius:10px;background:#fff;padding:10px 12px;margin:0 0 12px;font-size:12px;max-width:min(680px,100%)}
        #cm-root .cm-coach b{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#c2410c;margin-bottom:5px}
        #cm-root .cm-coach ul{margin:0 0 6px 16px;padding:0}
        #cm-root .cm-coach li{margin:2px 0}
        #cm-root .cm-coach .tip{color:#475569;font-style:italic}
        #cm-root .cm-empty{color:#64748b;font-size:12px;text-align:center;padding:18px 0}
        #cm-root .cm-reply{display:flex;gap:8px;align-items:flex-end;margin-top:12px}
        #cm-root textarea{flex:1;border:1px solid #cbd5e1;border-radius:9px;padding:9px 11px;font-size:13px;font-family:inherit;color:#0f172a;background:#fff;resize:vertical;min-height:62px;box-sizing:border-box}
        #cm-root textarea:focus{outline:none;border-color:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.15)}
        #cm-root .cm-btn{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:7px;padding:8px 13px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
        #cm-root .cm-btn:hover{border-color:#f97316;color:#c2410c}
        #cm-root .cm-btn.go{background:#f97316;border-color:#f97316;color:#fff}
        #cm-root .cm-btn.go:hover{background:#ea580c}
        #cm-root .cm-btn[disabled]{opacity:.55;cursor:default}
        #cm-root .cm-err{color:#b91c1c;font-size:12px;margin-top:8px}
        #cm-root .cm-count{font-size:10.5px;color:#94a3b8;text-align:right;margin-top:4px}
        @media (max-width:700px){#cm-root .cm-msg{max-width:100%}}`;
        document.head.appendChild(css);
    }
    // The badge goes beside the timer: both sit in one right-aligned row under the search bars.
    function badgeBox() {
        let b = $id('cm-badge');
        if (b) return b;
        const timer = $id('tt-widget');
        if (!timer || !timer.parentNode) return null;
        ensureCss();
        let row = $id('cm-header-row');
        if (!row) {
            row = document.createElement('div');
            row.id = 'cm-header-row';
            row.className = 'no-print';
            row.setAttribute('data-free-edit', '');     // the badge isn't an edit to the case
            timer.parentNode.insertBefore(row, timer);
            row.appendChild(timer);                      // the timer keeps its id, so time-tracker.js still finds it
        }
        b = document.createElement('div');
        b.id = 'cm-badge';
        b.className = 'no-print';
        b.setAttribute('data-free-edit', '');
        row.appendChild(b);
        return b;
    }
    function renderBadge() {
        const b = badgeBox(); if (!b) return;
        if (!signedIn() || !openCase()) { b.innerHTML = ''; return; }
        const n = M.unread;
        b.innerHTML = `<button type="button" class="${n ? 'has' : ''}" onclick="cmOpenMessages()" title="${n ? n + ' unread text' + (n === 1 ? '' : 's') + ' from the client' : 'The client\'s text messages on this case'}">
            <span aria-hidden="true">💬</span><span>Messages</span>${n ? `<span class="cm-n">${n}</span>` : ''}</button>`;
    }
    window.cmOpenMessages = function () { if (typeof showTab === 'function') showTab('messages'); };

    /* ---------- the Messages tab ---------- */
    function coachHtml(reply) {
        // The note shown under a reply: what the client's text was asking for, and why.
        const P = packs(); if (!P || !reply.promptId) return '';
        const pack = P.packs.concat([P.generic]).find(p => p.id === reply.packId) || P.generic;
        const def = pack && pack.messages[reply.promptId];
        const goals = (def && def.goals) || [];
        if (!goals.length && !(def && def.tip)) return '';
        return `<div class="cm-coach"><b>What a good reply does</b>
            <ul>${goals.map(g => `<li>${esc(g)}</li>`).join('')}</ul>
            ${def && def.tip ? `<div class="tip">${esc(def.tip)}</div>` : ''}</div>`;
    }
    function threadHtml(c) {
        if (!M.messages.length) {
            return `<div class="cm-empty">No texts on this case yet.${packs() ? ' The client writes first.' : ''}</div>`;
        }
        return M.messages.map(m => {
            const bubble = `<div class="cm-msg ${m.direction === 'in' ? 'in' : 'out'}${m.direction === 'in' && !m.read ? ' unread' : ''}">
                <span class="cm-who">${esc(m.direction === 'in' ? (m.sender || c.label || 'Client') : 'You')}</span>
                <div class="cm-bub">${esc(m.body)}</div>
                <span class="cm-when">${esc(fmtWhen(m.at))}</span></div>`;
            return m.direction === 'out' ? bubble + coachHtml(m) : bubble;
        }).join('');
    }
    function renderTab() {
        const pane = $id('pane-messages'); if (!pane) return;
        ensureCss();
        const c = openCase();
        if (!signedIn()) { pane.innerHTML = `<div id="cm-root"><div class="cm-box"><h2 class="serif">💬 Messages</h2><div class="sub">Sign in to read the client's messages.</div></div></div>`; return; }
        if (!c) { pane.innerHTML = `<div id="cm-root"><div class="cm-box"><h2 class="serif">💬 Messages</h2><div class="sub">Open a case to read its messages: a thread belongs to a case.</div></div></div>`; return; }

        const sel = (() => { const t = $id('cm-reply'); return t ? [t.selectionStart, document.activeElement === t] : null; })();
        const waiting = !!nextScripted(c);
        const P = packs(), pack = P ? P.packFor(c) : null;
        pane.innerHTML = `<div id="cm-root"><div class="cm-box">
            <div class="cm-head">
                <div>
                    <h2 class="serif">💬 Messages — ${esc(c.label)}${c.ref ? ` <span class="sub">· ${esc(shownRef(c.ref))}</span>` : ''}</h2>
                    <div class="sub">The client's texts on this case. They are practice: nothing here is sent to anyone.${pack && pack.about ? ' ' + esc(pack.about) : ''}</div>
                </div>
                <button type="button" class="cm-btn" onclick="cmReset()" title="Clear this thread and start the client's script over">↻ Start over</button>
            </div>
            <div class="cm-thread" id="cm-thread">${threadHtml(c)}</div>
            <div class="cm-reply">
                <textarea id="cm-reply" maxlength="${MAX_BODY}" placeholder="Write back to ${esc(c.label)}…" oninput="cmDraft(this.value)"></textarea>
                <button type="button" class="cm-btn go" id="cm-send" onclick="cmSend()" ${M.busy ? 'disabled' : ''}>Send</button>
            </div>
            <div class="cm-count">${M.draft.length}/${MAX_BODY}${waiting ? ' · the client is waiting for an answer' : ''}</div>
            ${M.error ? `<div class="cm-err">${esc(M.error)}</div>` : ''}
        </div></div>`;
        const box = $id('cm-thread'); if (box) box.scrollTop = box.scrollHeight;
        const t = $id('cm-reply');
        if (t) {
            t.value = M.draft;
            if (sel && sel[1]) { t.focus(); try { t.setSelectionRange(sel[0], sel[0]); } catch (e) { /* not placeable */ } }
        }
    }
    window.cmDraft = function (v) {
        M.draft = String(v || '').slice(0, MAX_BODY);
        const n = document.querySelector('#cm-root .cm-count');
        if (n) n.textContent = `${M.draft.length}/${MAX_BODY}` + (nextScripted(openCase()) ? ' · the client is waiting for an answer' : '');
    };
    window.cmSend = async function () {
        const c = openCase(); if (!c) { toast('Open a case first.', 'error'); return; }
        const body = M.draft.trim();
        if (!body) { toast('Type a message first.', 'error'); return; }
        if (M.busy) return;
        M.busy = true; M.error = '';
        try {
            // The reply answers the client's last text, so it's kept with it (and a trainer reads them together).
            const lastIn = [...M.messages].reverse().find(m => m.direction === 'in');
            take(await api('POST', API, {
                action: 'send', ...caseBody(c),
                message: { body, promptId: lastIn ? lastIn.promptId : '', packId: lastIn ? lastIn.packId : '' }
            }));
            M.draft = '';
            take(await api('POST', API, { action: 'read', ...caseBody(c) }));
            M.busy = false;
            await deliverNext(c);                 // the client writes back
            announce();
        } catch (e) {
            M.error = e.message || 'The message could not be sent.';
            toast(M.error, 'error');
        } finally { M.busy = false; renderTab(); }
    };
    window.cmReset = async function () {
        const c = openCase(); if (!c) return;
        if (!confirm('Clear this thread and start the client\'s messages over?')) return;
        try {
            take(await api('POST', API, { action: 'reset', ...caseBody(c) }));
            M.draft = '';
            await deliverNext(c);
            announce();
        } catch (e) { M.error = e.message || 'The thread could not be cleared.'; renderTab(); }
    };

    /* ---------- entry points ---------- */
    async function enter() {
        if (!signedIn()) { toast('Sign in to read the client\'s messages.', 'error'); return; }
        M.open = true;
        renderTab();
        await refresh();
        const c = openCase();
        if (c && M.unread) { try { take(await api('POST', API, { action: 'read', ...caseBody(c) })); announce(); } catch (e) { /* read again next time */ } }
    }
    function leave() { M.open = false; }
    const baseShowTab = window.showTab;
    if (typeof baseShowTab === 'function') {
        window.showTab = function (id) {
            const r = baseShowTab.apply(this, arguments);
            if (id === 'messages') enter(); else leave();
            return r;
        };
    }
    // Another case opened: its own thread.
    ['openMockCase', 'loadCase', 'newCase'].forEach(name => {
        const fn = window[name];
        if (typeof fn !== 'function') return;
        window[name] = function () {
            const r = fn.apply(this, arguments);
            setTimeout(() => { M.messages = []; M.unread = 0; renderBadge(); refresh(); }, 120);
            return r;
        };
    });
    const baseApply = window.applySessionUI;
    if (typeof baseApply === 'function') {
        window.applySessionUI = function () {
            const r = baseApply.apply(this, arguments);
            if (signedIn()) refresh();
            else { M = Object.assign(M, { open: false, messages: [], unread: 0, draft: '', error: '' }); renderBadge(); }
            return r;
        };
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden && signedIn()) refresh(); });
    setInterval(() => { if (signedIn() && !document.hidden) refresh(); }, 60000);
    window.addEventListener('load', () => { if (signedIn()) refresh(); });
    // time-tracker.js builds the timer once case-library.js has drawn the search bars: the badge goes beside it once it's there.
    const waitForTimer = setInterval(() => { if ($id('cm-badge')) { clearInterval(waitForTimer); return; } if ($id('tt-widget')) renderBadge(); }, 1000);
    window.clientMessagesState = () => M;   // for the tests and debugging
})();
