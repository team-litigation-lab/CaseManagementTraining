/* =========================================================
   LSH CMS — TRAINING LIBRARY + PROGRAM CONTEXT
   ---------------------------------------------------------
   1. Program context. Every LSH training program can open the CMS
      with ?program=<id> (reception, intake, cm, ea, pd). It's remembered
      for the browser tab, shown in the header, used as the Training
      Library's default filter, and stamped on any practice copy a
      trainee saves (content.program), so trainers can tell which
      course a case came from.
   2. Training Library. The hardcoded mock cases in mock-cases.js open
      in the normal case editor as VIEW ONLY (nothing can be typed,
      saved, archived or autosaved), except the Notes and Tasks tabs:
      what a user adds or edits there (a call they logged, a task they
      set) is saved for that user (/api/mock-case-updates) and comes
      back when they reopen the case. "Work on a practice copy" makes
      the whole editor editable; Save Case then creates the trainee's
      own case, stamped with content.trainingLibraryId.
      Only Admins see the Training Library (its button, its window and
      its name). To trainees a mock case is a case file, known by its
      case number: they find it with the search bar above the case
      (case-library.js), and every way into the library (the banner,
      ?library=1) takes them there; the firm directory opens in the Case
      Library window.
   3. Caller scenarios (trainers/Admins only). For the front desk: how to
      verify the caller on this file, the calls it gets, the model handling
      and a reception call script for each, to run mock calls with trainees.
   Deep links: ?mock=MC-04 opens that case after sign-in (courses use it),
   ?library=1 opens the library.
   ========================================================= */
(function () {
    'use strict';

    /* ---------- program context ---------- */
    const PROGRAM_KEY = 'LSH_CMS_PROGRAM';
    const PROGRAM_ALIASES = {
        reception: 'reception', receptionist: 'reception', frontdesk: 'reception', 'front-desk': 'reception',
        intake: 'intake', cm: 'cm', casemanagement: 'cm', 'case-management': 'cm',
        ea: 'ea', pa: 'ea', eapa: 'ea', 'ea-pa': 'ea',
        pd: 'pd', propertydamage: 'pd', 'property-damage': 'pd'
    };
    function normProgram(p) {
        const k = String(p || '').trim().toLowerCase().replace(/\s+/g, '');
        return PROGRAM_ALIASES[k] || '';
    }
    const params = new URLSearchParams(location.search);
    try {
        const fromUrl = normProgram(params.get('program'));
        if (fromUrl) sessionStorage.setItem(PROGRAM_KEY, fromUrl);
    } catch (e) { /* storage blocked: program just isn't remembered */ }
    function currentProgram() {
        try { return sessionStorage.getItem(PROGRAM_KEY) || ''; } catch (e) { return ''; }
    }
    function programLabel(id) {
        const p = (window.MOCK_PROGRAMS || []).find(x => x.id === id);
        return p ? p.label : '';
    }
    window.lshProgram = currentProgram;
    window.lshSetProgram = function (id) {
        try { id ? sessionStorage.setItem(PROGRAM_KEY, id) : sessionStorage.removeItem(PROGRAM_KEY); } catch (e) {}
        libState.program = id || 'all';
        paintProgramUI();
        renderLibraryList();
    };

    /* ---------- mock case state ---------- */
    let mockId = null;         // id of the Training Library case in the editor (view-only or practice copy)
    let mockViewOnly = false;  // true while it's the untouched library copy
    let mockEditing = false;   // an Admin has the library case open to edit (Save goes to the library)
    let editTouched = false;   // …and has changed something since it opened or was saved
    let libState = { program: currentProgram() || 'all', q: '', tab: 'cases' };
    window.mockIsViewOnly = () => !!(mockId && mockViewOnly);
    window.mockIsLibraryEdit = () => !!(mockId && mockEditing);
    window.mockCurrentId = () => mockId;
    // Called by the save/archive/update buttons. Returns true (and explains) when saving must be blocked.
    // The case itself never saves; pending Notes and Tasks updates are saved right away instead.
    window.mockBlocksSave = function (silent) {
        if (mockId && mockEditing) { saveLibraryEdit(); return true; } // an Admin editing the library case: Save goes to the library
        if (!(mockId && mockViewOnly)) return false;
        const pending = updatesPending();
        if (pending) saveUpdates();
        if (!silent && typeof showToast === 'function') showToast(pending || upd.saved
            ? `Your Notes and Tasks on this ${kindWord()} are saved to your account. The rest of the case is view only: click "Work on a practice copy" to save a full copy of your own.`
            : `This ${kindWord()} is view only. You can add Notes and Tasks, or click "Work on a practice copy" to make your own copy you can save.`, 'info', 5000);
        return true;
    };
    // Extra keys stamped on every saved case payload.
    window.mockPayloadTags = function () {
        const tags = {};
        if (mockId) tags.trainingLibraryId = mockId;
        const p = currentProgram(); if (p) tags.program = p;
        return tags;
    };
    // blankCaseEditorContent() calls this: any wipe of the editor ends library mode.
    window.mockReset = function () {
        mockId = null; mockViewOnly = false; mockEditing = false;
        setReadOnly(false);
        paintBanner();
    };
    window.mockSnapshot = () => ({ mockId, mockViewOnly, mockEditing, mockEditDirty: !!(mockEditing && editTouched) });
    // restoreCurrentEditorState() hands back what mockSnapshot() stored.
    window.mockRestore = function (data) {
        if (!data || !data.mockId || !findCase(data.mockId)) return false;
        // The library case, reopened fresh: view only, or an Admin's with nothing unsaved (or someone who isn't an Admin now, in Trainee view).
        if (data.mockViewOnly || (data.mockEditing && (!isAdmin() || !data.mockEditDirty))) { openMockCase(data.mockId, { silent: true }); return true; }
        mockId = data.mockId; mockViewOnly = false;
        // An Admin's unsaved changes to the library case come back as unsaved changes (the normal restore puts the content back).
        mockEditing = !!data.mockEditing; editTouched = mockEditing;
        paintBanner();
        return false; // the normal restore puts the practice copy back
    };

    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const findCase = (id) => (window.MOCK_CASES || []).find(c => c.id === String(id || '').toUpperCase());
    // Everything a front-desk caller might give you: our case number, names (client, contacts,
    // adjusters, other drivers), phone numbers, email, DOB, address, claim/policy/file numbers,
    // report numbers, plates, and the narrative. Digits-only matching for numbers.
    const searchText = (c) => {
        const bits = [c.id, c.caseNumber, c.client.name, c.client.phone, c.client.email, c.client.dob, c.client.address, c.dateOfLoss,
            c.client.emergency && c.client.emergency.name, c.client.emergency && c.client.emergency.phone,
            c.caseType, c.caseTypeOther, c.phase, c.attorney, c.caseManager, c.narrative,
            c.police && c.police.number];
        (c.bi || []).concat(c.pipum || []).forEach(x => bits.push(x.holder, x.carrier, x.policy, x.claim, x.adjuster, x.contact));
        (c.liens || []).forEach(x => bits.push(x.entity, x.file));
        (c.facilities || []).forEach(x => bits.push(x.name));
        if (c.pd) [c.pd.client, c.pd.tp].forEach(v => { if (v) bits.push(v.plate, v.owner, v.driver, v.make, v.model); });
        (c.docs || []).forEach(x => bits.push(x.summary));
        return bits.filter(Boolean).join(' | ');
    };
    const _idx = {};
    // Numbers match on their digits, so a case number works however it's typed
    // ("LSH-2026-MVA-901379", "lsh 2026 mva 901379", "MVA901379", "901379").
    function mockMatches(c, query) {
        const q = norm(query); if (!q) return true;
        const text = _idx[c.id] || (_idx[c.id] = searchText(c));
        const t = norm(text);
        if (q.split(' ').every(w => t.includes(w))) return true;
        const digits = q.replace(/\D/g, '');
        return digits.length >= 4 && text.replace(/\D/g, '').includes(digits);
    }
    window.mockSearch = (query) => (window.MOCK_CASES || []).filter(c => mockMatches(c, query));
    const isAdmin = () => { const s = typeof getSession === 'function' ? getSession() : null; return !!(s && s.userType === 'Admin'); };
    // Trainees never see the Training Library: to them a mock case is a case file, known by its case number.
    const kindWord = () => isAdmin() ? 'Training Library case' : 'case file';
    const fileRef = (c) => isAdmin() ? c.id : (c.caseNumber || c.id);
    // How a stored case reference is shown (time entries and calendar events keep "MC-01"): trainees see the case number.
    window.lshShownRef = (ref) => { const c = /^MC-\d+$/.test(ref || '') && findCase(ref); return c ? fileRef(c) : (ref || ''); };

    /* ---------- styles ---------- */
    const css = document.createElement('style');
    css.textContent = `
    #mock-banner{display:none;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 18px;background:#0f2148;color:#fff;font-size:12px;border-bottom:3px solid #f97316}
    #mock-banner.open{display:flex}
    #mock-banner b{color:#fdba74}
    #mock-banner .mb-tag{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:800;background:#f97316;color:#fff;border-radius:4px;padding:2px 6px;letter-spacing:.5px}
    #mock-banner .mb-sp{flex:1;min-width:10px}
    #mock-banner button{font-size:10.5px;font-weight:800;text-transform:uppercase;border-radius:6px;padding:7px 11px;cursor:pointer;border:1px solid #334155;background:#13284f;color:#fff}
    #mock-banner button.pri{background:#10b981;border-color:#10b981}
    #mock-banner .mb-tag.edit{background:#10b981}
    #mock-banner .mb-ed{color:#cbd5e1;font-size:11px}
    #capture-area.mock-loading{opacity:.45;pointer-events:none;transition:opacity .15s}
    .lib-row .ed{display:inline-block;margin-left:6px;font-size:9.5px;font-weight:800;color:#047857;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:4px;padding:1px 5px;text-transform:uppercase;letter-spacing:.3px}
    #mock-banner button:hover{border-color:#f97316}
    #capture-area.mock-ro .add-btn,#capture-area.mock-ro .hub-btn,#capture-area.mock-ro .revert-btn,#capture-area.mock-ro td button,#capture-area.mock-ro .pdf-card > button{display:none !important}
    #capture-area.mock-ro [contenteditable]{cursor:default;caret-color:transparent}
    #capture-area.mock-ro select:disabled,#capture-area.mock-ro input[readonly]{opacity:1;cursor:default}
    #capture-area.mock-ro.mock-upd-ready .mock-upd .add-btn,#capture-area.mock-ro.mock-upd-ready .mock-upd td button{display:inline-block !important}
    #capture-area.mock-ro.mock-upd-ready .mock-upd [contenteditable]{cursor:text;caret-color:auto}
    .mock-upd-bar{display:none;align-items:center;gap:10px;flex-wrap:wrap;background:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #f97316;border-radius:8px;padding:9px 12px;margin-bottom:12px;font-size:12px;color:#7c2d12;line-height:1.45}
    #capture-area.mock-ro .mock-upd-bar{display:flex}
    .mock-upd-bar .mub-text{flex:1;min-width:220px}
    .mock-upd-bar .mub-state{font-weight:800;color:#047857;white-space:nowrap}
    .mock-upd-bar .mub-state[data-state="error"]{color:#b91c1c;white-space:normal}
    .mock-upd-bar button{font-size:10.5px;font-weight:800;text-transform:uppercase;background:#fff;border:1px solid #f97316;color:#c2410c;border-radius:6px;padding:6px 10px;cursor:pointer}
    #capture-area:not(.mock-upd-ready) .mock-upd-bar button{display:none}
    .lib-btn{width:100%;border:1px solid #f97316;color:#fdba74;background:rgba(249,115,22,.08);padding:9px 0;border-radius:8px;font-size:10.5px;font-weight:800;text-transform:uppercase;cursor:pointer;margin-bottom:8px}
    .lib-btn:hover{background:#f97316;color:#fff}
    .lib-prog{width:100%;padding:7px 8px;border-radius:6px;border:1px solid #1e2c4d;background:#0d1c3d;color:#cbd5e1;font-size:10.5px;margin-bottom:22px}
    .lib-prog-label{font-size:9px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px}
    #library-modal .lib-box{max-width:980px;width:94vw;max-height:88vh;display:flex;flex-direction:column}
    .lib-tabs{display:flex;gap:6px;margin:0 0 12px;flex-wrap:wrap}
    .lib-tabs button,.lib-chip{font-size:11px;font-weight:700;border:1px solid #e2e8f0;background:#fff;color:#0f2148;border-radius:999px;padding:6px 12px;cursor:pointer}
    .lib-tabs button.on,.lib-chip.on{background:#0f2148;color:#fff;border-color:#0f2148}
    .lib-row{display:grid;grid-template-columns:70px minmax(0,1fr) 150px 100px;gap:12px;align-items:center;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;background:#fff}
    .lib-row:hover{border-color:#f97316}
    .lib-row .id{font-family:'IBM Plex Mono',monospace;font-weight:800;color:#f97316;font-size:12px}
    .lib-row .nm{font-weight:800;color:#0f2148;font-size:13px}
    .lib-row .sm{font-size:11.5px;color:#475569;margin-top:2px}
    .lib-row .meta{font-size:10.5px;color:#64748b;line-height:1.5}
    .lib-row .pills span{display:inline-block;font-size:9.5px;font-weight:700;background:#eef2ff;color:#1e3a8a;border-radius:999px;padding:1px 7px;margin:2px 3px 0 0}
    .lib-row button{font-size:10.5px;font-weight:800;text-transform:uppercase;background:#0f2148;color:#fff;border:none;border-radius:6px;padding:8px 10px;cursor:pointer}
    .lib-row .acts{display:flex;flex-direction:column;gap:5px}
    .lib-row button.pdf{background:#fff;color:#0f2148;border:1px solid #cbd5e1;padding:5px 8px;font-size:9.5px}
    .lib-row button.pdf:hover{border-color:#f97316;color:#c2410c}
    .lib-dl{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:11.5px;color:#334155}
    .lib-dl b{color:#0f2148}
    .lib-dl .sp{flex:1}
    .lib-dl button{font-size:10.5px;font-weight:800;text-transform:uppercase;border-radius:6px;padding:7px 11px;cursor:pointer;background:#0f2148;color:#fff;border:1px solid #0f2148}
    .lib-dl button.alt{background:#fff;color:#0f2148;border-color:#cbd5e1}
    .lib-dl button:disabled,.lib-row button:disabled{opacity:.6;cursor:wait}
    @media (max-width:760px){.lib-row{grid-template-columns:1fr}}
    .lib-dir{width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:14px}
    .lib-dir td,.lib-dir th{border:1px solid #e2e8f0;padding:6px 9px;text-align:left}
    .lib-dir th{background:#f1f5f9;color:#0f2148}
    .lib-rules li{font-size:12.5px;color:#334155;margin-bottom:6px;line-height:1.5}
    #mock-calls-panel{position:fixed;top:0;right:0;bottom:0;width:min(440px,100vw);background:#fff;z-index:2980;box-shadow:-10px 0 30px rgba(0,0,0,.2);transform:translateX(105%);transition:transform .2s ease;display:flex;flex-direction:column}
    #mock-calls-panel.open{transform:none}
    #mock-calls-panel .mcp-h{background:#0f2148;color:#fff;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:10px}
    #mock-calls-panel .mcp-h b{font-size:14px}
    #mock-calls-panel .mcp-b{padding:14px 16px;overflow-y:auto;flex:1}
    .mcp-verify{background:#fff7ed;border-left:4px solid #f97316;border-radius:6px;padding:9px 11px;font-size:12px;color:#7c2d12;margin-bottom:12px}
    .mcp-call{border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:10px}
    .mcp-call .from{font-size:10.5px;font-weight:800;text-transform:uppercase;color:#64748b}
    .mcp-call .ask{font-size:13px;color:#0f2148;font-weight:700;margin:4px 0 8px}
    .mcp-call .key{display:none;font-size:12px;color:#14532d;background:#f0fdf4;border-radius:6px;padding:8px 10px;margin-top:6px}
    .mcp-call.shown .key{display:block}
    .mcp-script{margin-top:8px}.mcp-script summary{cursor:pointer;font-size:10.5px;font-weight:800;text-transform:uppercase;color:#0f2148;letter-spacing:.04em}
    .mcp-script .fdd-script{margin:8px 0 0}
    .mcp-scripts{border-top:2px solid #e2e8f0;margin:14px 0 12px;padding-top:12px}.mcp-scripts .mcp-sh{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#0f2148}
    .mcp-scripts p{font-size:11.5px;color:#64748b;margin:4px 0 8px}
    `;
    document.head.appendChild(css);

    /* ---------- DOM: sidebar block, banner, modal, side panel ---------- */
    function buildUI() {
        // The sidebar's slots (index.html): the program at the top (#sb-program), the Training Library
        // button first in Trainer tools (#sb-trainer). The select is the sidebar's only <select>, so moving it
        // within the sidebar keeps every saved case's selects in the same order (posSels in app.js).
        const prog = $id('sb-program'), tools = $id('sb-trainer');
        if (prog && tools && !$id('lib-open-btn')) {
            tools.querySelector('.sb-head').insertAdjacentHTML('afterend',
                `<button id="lib-open-btn" class="lib-btn" onclick="openTrainingLibrary()">📚 Training Library · ${(window.MOCK_CASES || []).length} mock cases</button>`);
            prog.insertAdjacentHTML('beforeend', `
                <p class="lib-prog-label">Training program</p>
                <select id="lib-program-select" class="lib-prog" onchange="lshSetProgram(this.value)">
                    <option value="">All programs</option>
                    ${(window.MOCK_PROGRAMS || []).map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('')}
                </select>`);
        }
        const main = $id('capture-area') && $id('capture-area').parentElement;
        if (main && !$id('mock-banner')) {
            main.insertAdjacentHTML('afterbegin', `<div id="mock-banner" class="no-print"></div>`);
        }
        if (!$id('library-modal')) {
            document.body.insertAdjacentHTML('beforeend', `
            <div class="modal-overlay no-print" id="library-modal" style="z-index:2940;">
                <div class="modal-box wide lib-box">
                    <h2 class="serif">📚 Training Library</h2>
                    <div class="sub mono">Mock cases for every LSH training program. Open one to edit it for everyone (trainees see it view only), or download them as a PDF.</div>
                    <div class="lib-tabs" id="lib-tabs"></div>
                    <div id="lib-filters"></div>
                    <div id="lib-body" style="overflow-y:auto;flex:1;"></div>
                    <div class="modal-btn-row"><button class="btn-ghost" onclick="closeTrainingLibrary()">Close</button></div>
                </div>
            </div>
            <div id="mock-calls-panel" class="no-print" aria-hidden="true"></div>`);
        }
        // Notes and Tasks stay editable on a library case (see "Notes & Tasks updates" below).
        ['pane-notes', 'pane-tasks'].forEach(id => {
            const pane = $id(id);
            if (!pane || pane.querySelector('.mock-upd-bar')) return;
            pane.classList.add('mock-upd');
            pane.insertAdjacentHTML('afterbegin', `<div class="mock-upd-bar no-print"><span class="mub-text"></span><span class="mub-state"></span><button onclick="mockResetUpdates()">↺ Reset to the original</button></div>`);
        });
        paintProgramUI();
        paintRoleUI();
    }

    // Trainees don't browse the Training Library, or even see its name: they search the Case Library.
    function paintRoleUI() {
        const btn = $id('lib-open-btn'); if (btn) btn.style.display = isAdmin() ? '' : 'none';
        document.querySelectorAll('.mock-upd-bar .mub-text').forEach(t => { t.innerHTML = `✎ <b>${isAdmin() ? 'Training Library case' : 'Case file'}:</b> you can add and edit Notes and Tasks here (log the calls you take). They save to your account automatically and come back when you reopen this case.`; });
        if (!isAdmin()) closeTrainingLibrary();
    }

    function paintProgramUI() {
        const sel = $id('lib-program-select'); if (sel) sel.value = currentProgram();
        const title = $id('portal-title'); if (!title) return;
        const base = title.innerText.replace(/\s+·\s+.*TRAINING$/, '');
        const p = programLabel(currentProgram());
        title.innerText = p ? `${base} · ${p.toUpperCase()} TRAINING` : base;
    }

    /* ---------- library modal ---------- */
    window.openTrainingLibrary = function (tab) {
        if (typeof hasAuthorizedAccess === 'function' && !hasAuthorizedAccess()) return;
        if (!isAdmin() && typeof window.focusCaseSearch === 'function') { if (tab === 'desk') window.openCaseLibrary('desk'); else window.focusCaseSearch(); return; }
        buildUI();
        libState.tab = tab || libState.tab || 'cases';
        renderLibraryList();
        $id('library-modal').classList.add('open');
    };
    window.closeTrainingLibrary = function () { const m = $id('library-modal'); if (m) m.classList.remove('open'); };
    window.libSetTab = function (t) { libState.tab = t; renderLibraryList(); };
    window.libSetProgram = function (p) { libState.program = p; renderLibraryList(); };
    window.libSearch = function (v) { libState.q = v; renderLibraryList(false); };

    function renderLibraryList(repaintFilters) {
        const body = $id('lib-body'); if (!body) return;
        const tabs = $id('lib-tabs'), filters = $id('lib-filters');
        tabs.innerHTML = [['cases', '🗂 Mock cases'], ['desk', '☎ Firm directory & front-desk rules']]
            .map(([k, l]) => `<button class="${libState.tab === k ? 'on' : ''}" onclick="libSetTab('${k}')">${l}</button>`).join('');
        if (libState.tab === 'desk') { filters.innerHTML = ''; body.innerHTML = deskHTML(); return; }
        if (repaintFilters !== false || !filters.innerHTML) {
            filters.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
                ${[['all', 'All programs']].concat((window.MOCK_PROGRAMS || []).map(p => [p.id, p.label]))
                    .map(([k, l]) => `<button class="lib-chip ${libState.program === k ? 'on' : ''}" onclick="libSetProgram('${k}')">${esc(l)}</button>`).join('')}
                <input type="search" placeholder="Search name, phone, DOB, claim #, plate, case ID…" value="${esc(libState.q)}" oninput="libSearch(this.value)" style="flex:1;min-width:180px;padding:7px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:12px">
            </div>`;
        }
        const list = libList();
        const dl = list.length ? `<div class="lib-dl">⬇ <span>Download the <b>${list.length}</b> case${list.length === 1 ? '' : 's'} listed as a PDF</span><span class="sp"></span>
            <button onclick="libPdf(null, true, this)" title="Every tab of each case, plus its trainer-only front-desk key (verification, caller scenarios, practice calls)">PDF · trainer copy</button>
            <button class="alt" onclick="libPdf(null, false, this)" title="Every tab of each case, without the answer keys: safe to give trainees">PDF · case files only</button></div>` : '';
        body.innerHTML = list.length ? dl + list.map(c => `<div class="lib-row">
            <div class="id">${c.id}</div>
            <div><div class="nm">${esc(c.client.name)}${edits[c.id] ? `<span class="ed" title="Edited by ${esc(edits[c.id].updatedBy || '')} · ${esc(edits[c.id].updatedAt || '')} UTC">✎ edited</span>` : ''}</div><div class="sm">${esc(c.summary)}</div>
                <div class="pills">${c.programs.map(p => `<span>${esc(programLabel(p))}</span>`).join('')}</div></div>
            <div class="meta">${esc(c.caseType === 'Others' ? c.caseTypeOther : c.caseType)} · ${esc(c.phase)}<br>DOL ${esc(c.dateOfLoss)}<br><span class="mono">${esc(c.caseNumber || '')}</span><br>${esc(c.level)}</div>
            <div class="acts"><button onclick="openMockCase('${c.id}')">Open case</button><button class="pdf" onclick="libPdf(['${c.id}'], true, this)" title="This case as a PDF (trainer copy)">⬇ PDF</button></div>
        </div>`).join('') : '<p style="font-size:12px;color:#94a3b8">No mock cases match.</p>';
    }
    // The cases the library window lists now (program filter and search).
    function libList() {
        const q = norm(libState.q);
        return (window.MOCK_CASES || []).filter(c =>
            (libState.program === 'all' || c.programs.includes(libState.program)) &&
            (!q || mockMatches(c, q)));
    }
    // ⬇ PDF (Admins): the cases listed, or one case (library-pdf.js makes the file).
    window.libPdf = async function (ids, trainer, btn) {
        if (!isAdmin() || typeof window.libraryPdf !== 'function') return;
        const label = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = 'Preparing…'; }
        try {
            const title = ids ? '' : [libState.program !== 'all' ? programLabel(libState.program) : '', libState.q.trim() ? `search “${libState.q.trim()}”` : ''].filter(Boolean).join(' · ');
            const r = await window.libraryPdf({ ids: ids || libList().map(c => c.id), trainer: !!trainer, title });
            if (typeof showToast === 'function') showToast(`Downloaded ${r.name} (${r.pages} pages).`, 'success', 4000);
        } catch (e) {
            if (typeof showToast === 'function') showToast((e && e.message) || 'Couldn\'t make the PDF. Try again.', 'error', 5000);
        } finally { if (btn) { btn.disabled = false; btn.innerHTML = label; } }
    };
    // What library-pdf.js says about a case an Admin edited in the CMS.
    window.mockEditInfo = (id) => (edits[id] ? { updatedBy: edits[id].updatedBy, updatedAt: edits[id].updatedAt } : null);

    window.mockDeskHTML = () => deskHTML();
    function deskHTML() {
        const f = window.MOCK_FIRM || { directory: [], rules: [] };
        return `<p style="font-size:13px;color:#0f2148;margin:0 0 4px"><b>${esc(f.name)}</b></p>
            <p style="font-size:12px;color:#475569;margin:0 0 12px">Main line ${esc(f.mainLine)} · Fax ${esc(f.fax)} · ${esc(f.address)}<br>${esc(f.hours)}</p>
            <table class="lib-dir"><thead><tr><th>Name</th><th>Role</th><th>Ext.</th></tr></thead><tbody>
                ${f.directory.map(d => `<tr><td><b>${esc(d.name)}</b></td><td>${esc(d.role)}</td><td class="mono">${esc(d.ext)}</td></tr>`).join('')}</tbody></table>
            <p style="font-size:12px;font-weight:800;color:#0f2148;margin:0 0 6px;text-transform:uppercase">Front-desk rules for every call</p>
            <ol class="lib-rules">${f.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ol>`;
    }

    /* ---------- filling the editor ---------- */
    let uid = 0;
    // Row/card builders in app.js name elements with Date.now(), so rows added in the
    // same millisecond would share ids. Give every id in the new node a unique suffix
    // and rewrite the inline handlers that refer to it.
    function uniquifyIds(node) {
        const ids = [...node.querySelectorAll('[id]')].map(el => el.id);
        if (!ids.length) return;
        const suffix = '-m' + (++uid);
        node.querySelectorAll('[id]').forEach(el => { el.id = el.id + suffix; });
        node.querySelectorAll('[onclick],[onchange]').forEach(el => {
            ['onclick', 'onchange'].forEach(attr => {
                let v = el.getAttribute(attr); if (!v) return;
                ids.forEach(id => { v = v.split(`'${id}'`).join(`'${id}${suffix}'`); });
                el.setAttribute(attr, v);
            });
        });
    }
    function setVal(el, v) {
        if (!el || v == null || v === '') return;
        if (el.tagName === 'SELECT') {
            if ([...el.options].some(o => o.value === v || o.text === v)) el.value = v;
            return;
        }
        if (el.tagName === 'INPUT') { el.value = v; return; }
        el.innerText = v;
    }
    function fieldFor(scope, label) {
        if (!scope) return null;
        const want = norm(label);
        const labs = [...scope.querySelectorAll('label')].filter(l => norm(l.textContent).startsWith(want));
        for (const l of labs) {
            const sib = l.nextElementSibling;
            if (sib && sib.matches('[contenteditable], select, input')) return sib;
            if (sib) { const inner = sib.querySelector('[contenteditable], select, input'); if (inner) return inner; }
            const inParent = l.parentElement && l.parentElement.querySelector('[contenteditable], select, input');
            if (inParent) return inParent;
        }
        return null;
    }
    function cardByHead(scope, head) {
        return [...scope.querySelectorAll('.pdf-card')].find(c => { const h = c.querySelector('.section-head'); return h && norm(h.textContent) === norm(head); }) || null;
    }
    function set(scope, label, v) { setVal(fieldFor(scope, label), v); }
    function setOther(select, otherEl, revertEl, text) {
        if (!select || !otherEl) return;
        select.value = select.querySelector('option[value="Other"]') ? 'Other' : 'Others';
        select.classList.add('hidden');
        otherEl.classList.remove('hidden');
        otherEl.innerText = text || '';
        if (revertEl) revertEl.style.display = 'inline-block';
    }
    function added(containerId, before) {
        const box = $id(containerId);
        const node = box.lastElementChild;
        if (!node || node === before) return null;
        uniquifyIds(node);
        return node;
    }
    function cells(tr) { return [...tr.children]; }
    function editIn(td) { return td && td.querySelector('[contenteditable]'); }
    function selIn(td) { return td && td.querySelector('select'); }
    // The New Matter intake form (intake-form.js) fills a new case with the same helpers.
    window.caseFill = { setVal, set, fieldFor, cardByHead, setOther, added, cells, editIn, selIn };

    function fillCase(c) {
        const header = document.querySelector('#capture-area .header-card');
        setVal($id('client-name-field'), c.client.name);
        set(header, 'Contact', c.client.phone);
        set(header, 'Target Settlement', c.target);
        setVal($id('attorney-field'), c.attorney);
        setVal($id('case-manager-field'), c.caseManager);
        const phaseSel = $id('phase-selector'); if (phaseSel) phaseSel.value = c.phase;
        if (typeof updatePhaseDisplay === 'function') updatePhaseDisplay(c.phase);
        setVal($id('date-of-loss-field'), c.dateOfLoss);
        setVal($id('sol-bar-field'), c.sol);
        if (c.caseType === 'Others') setOther($id('main-case-type'), $id('main-case-other'), $id('main-revert'), c.caseTypeOther);
        else if ($id('main-case-type')) $id('main-case-type').value = c.caseType;

        // Profile
        const prof = $id('pane-profile');
        const idCard = cardByHead(prof, 'Identity');
        set(idCard, 'DOB', c.client.dob); set(idCard, 'SSN', c.client.ssn);
        set(idCard, 'Email Address', c.client.email); set(idCard, 'Home Address', c.client.address);
        const em = cardByHead(prof, 'Emergency Contact');
        if (c.client.emergency) { set(em, 'Full Name', c.client.emergency.name); set(em, 'Phone', c.client.emergency.phone); set(em, 'Relationship', c.client.emergency.relationship); }
        const emp = cardByHead(prof, 'Employment Details');
        if (c.client.employment) { set(emp, 'Status', c.client.employment.status); set(emp, 'Employer Name', c.client.employment.employer); set(emp, 'Job Position', c.client.employment.title); }
        const narr = cardByHead(prof, 'Case Narrative');
        setVal(narr && narr.querySelector('[contenteditable]'), c.narrative);
        // Primary Injury (a keyed card: its fields are named by data-k)
        const inj = $id('kx-injury');
        if (inj && c.injury) Object.entries(c.injury).forEach(([k, v]) => setVal(inj.querySelector(`[data-k="${k}"]`), v));

        // Police
        const pol = $id('pane-police');
        if (c.police) {
            set(pol, 'Responding Agency', c.police.agency); set(pol, 'Report Number', c.police.number);
            set(pol, 'Reporting Officer', c.police.officer); set(pol, "Officer's Narrative", c.police.narrative);
        }

        // Insurance
        const ins = $id('pane-matrix');
        const hi = cardByHead(ins, 'Health Insurance');
        if (c.health) { set(hi, 'Carrier', c.health.carrier); set(hi, 'Member ID', c.health.memberId); set(hi, 'Group Number', c.health.group); }
        (c.bi || []).forEach(b => {
            addBI(); const card = added('bi-container'); if (!card) return;
            set(card, 'Policy Holder', b.holder); set(card, 'Carrier', b.carrier); set(card, 'Policy #', b.policy); set(card, 'Claim #', b.claim);
            set(card, 'Adjuster Name', b.adjuster); set(card, 'Adjuster Contact', b.contact); set(card, 'Liability Accepted', b.liability); set(card, 'Policy Limits', b.limits);
        });
        (c.pipum || []).forEach(p => {
            addPIPUM(); const card = added('pip-um-container'); if (!card) return;
            set(card, 'Coverage Type', p.type); set(card, 'Policy Holder', p.holder); set(card, 'Insurance Carrier', p.carrier); set(card, 'Policy #', p.policy);
            set(card, 'Claim Number', p.claim); set(card, 'Adjuster Name', p.adjuster); set(card, 'Adjuster Contact', p.contact); set(card, 'Policy Limits', p.limits);
        });

        // Liens
        (c.liens || []).forEach(l => {
            addLien(); const card = added('lien-container'); if (!card) return;
            const sel = fieldFor(card, 'Type of Lien');
            if (l.type === 'Other') {
                const wrap = sel && sel.parentElement;
                setOther(sel, wrap && wrap.querySelector('[contenteditable]'), wrap && wrap.querySelector('.revert-btn'), l.typeOther);
            } else setVal(sel, l.type);
            set(card, 'Lienholder Entity', l.entity); set(card, 'Claim / File #', l.file); set(card, 'Lien Amount', l.amount);
        });

        // Treatment
        (c.chrono || []).forEach(ch => {
            addChronology(); const tr = added('chrono-container'); if (!tr) return;
            const td = cells(tr); const list = td[0].querySelector('.chrono-dos-list');
            (ch.dos || []).forEach((d, i) => {
                if (i === 0) { setVal(list.querySelector('[contenteditable]'), d); return; }
                list.insertAdjacentHTML('beforeend', `<div class="flex items-center gap-1 mb-1"><div contenteditable="true" class="text-xs" data-ph="MM/DD/YYYY" data-fmt="date"></div><button onclick="this.parentElement.remove()" class="text-red-400 font-bold text-[10px]">×</button></div>`);
                setVal(list.lastElementChild.querySelector('[contenteditable]'), d);
            });
            setVal(editIn(td[1]), ch.facility); setVal(editIn(td[2]), ch.next); setVal(editIn(td[3]), ch.notes);
        });
        (c.facilities || []).forEach(f => {
            addFacility(); const tr = added('facility-container'); if (!tr) return;
            const td = cells(tr);
            setVal(editIn(td[0]), f.name);
            const sp = selIn(td[1]);
            if (f.specialty === 'Other') setOther(sp, td[1].querySelector('[contenteditable]'), td[1].querySelector('.revert-btn'), f.specialtyOther);
            else setVal(sp, f.specialty);
            setVal(editIn(td[2]), f.phone); setVal(editIn(td[3]), f.email); setVal(editIn(td[4]), f.dates);
            setVal(selIn(td[5]), f.status); setVal(editIn(td[6]), f.charges);
        });
        const tn = cardByHead($id('pane-medical'), 'Treatment Notes');
        setVal(tn && tn.querySelector('[contenteditable]'), c.treatmentNotes);

        // Property damage
        if (c.pd) {
            const pd = $id('pane-pd');
            const cv = cardByHead(pd, 'Client Vehicle'), tv = cardByHead(pd, 'Third Party Vehicle');
            const v = c.pd.client, t = c.pd.tp;
            if (v) { set(cv, 'Year', v.year); set(cv, 'Make', v.make); set(cv, 'Model', v.model); set(cv, 'License Plate', v.plate); set(cv, 'Registered Owner', v.owner); set(cv, "Driver's Name", v.driver); }
            if (t) {
                set(tv, 'Year', t.year); set(tv, 'Make', t.make); set(tv, 'Model', t.model); set(tv, 'License Plate', t.plate);
                setVal($id('tp-owner'), t.owner); setVal($id('tp-driver'), t.driver);
                setVal($id('tp-driver-insured'), t.insured); set(tv, 'Carrier / Policy Details', t.carrierPolicy);
                set(tv, "Driver's Contact Number", t.driverPhone); set(tv, "Driver's Insurance Company", t.driverInsurer);
                set(tv, "Vehicle Owner's Contact Number", t.ownerPhone); set(tv, "Vehicle Owner's Policy", t.ownerPolicy);
            }
        }

        // Litigation
        if (c.lit) {
            setVal($id('sol-litigation-field'), c.lit.sol); setVal($id('complaint-filed-field'), c.lit.filed);
            setVal($id('discovery-cutoff-field'), c.lit.cutoff); setVal($id('trial-date-field'), c.lit.trial);
            (c.lit.rows || []).forEach(r => {
                addRow('lit-body'); const tr = added('lit-body'); if (!tr) return;
                const td = cells(tr);
                setVal(selIn(td[0]), r.type); setVal(editIn(td[1]), r.party); setVal(editIn(td[2]), r.due); setVal(selIn(td[3]), r.status);
            });
        }

        // Finance, Doc Hub, Notes, Tasks
        (c.finance || []).forEach(f => {
            addRow('fin-body'); const tr = added('fin-body'); if (!tr) return;
            const td = cells(tr);
            setVal(editIn(td[0]), f.date); setVal(selIn(td[1]), f.staff); setVal(editIn(td[2]), f.desc); setVal(editIn(td[3]), f.amount);
        });
        (c.docs || []).forEach(d => {
            addDocument(d.cat); const tr = added('doc-body'); if (!tr) return;
            setVal(editIn(cells(tr)[1]), d.summary);
        });
        Object.entries(UPD_BODIES).forEach(([key, body]) => fillRows(body, c[key]));
        if (typeof toggleOwnerExtra === 'function') toggleOwnerExtra();
        if (typeof toggleDriverInsuredExtra === 'function') toggleDriverInsuredExtra();
        if (typeof updateTotals === 'function') updateTotals();
    }

    /* ---------- view-only mode ---------- */
    // The Notes and Tasks tabs (.mock-upd) are open for editing once the user's saved updates have loaded.
    const updatesOpen = () => { const a = $id('capture-area'); return !!(a && a.classList.contains('mock-upd-ready')); };
    const inUpdates = (t) => { const el = t && (t.nodeType === 3 ? t.parentElement : t); return !!(el && el.closest && el.closest('.mock-upd') && updatesOpen()); };
    // Parts of the page that aren't the case (the Calendar tab) stay typeable on a view-only case.
    const freeEdit = (t) => { const el = t && (t.nodeType === 3 ? t.parentElement : t); return !!(el && el.closest && el.closest('[data-free-edit]')); };
    const blockEdit = (e) => { if (mockId && mockViewOnly && !inUpdates(e.target) && !freeEdit(e.target)) { e.preventDefault(); e.stopPropagation(); } };
    const blockKeys = (e) => {
        if (!(mockId && mockViewOnly)) return;
        const t = e.target;
        if (!t || !t.closest || !t.closest('#capture-area [contenteditable]') || inUpdates(t)) return;
        if ((e.ctrlKey || e.metaKey) && /^[ca]$/i.test(e.key)) return; // copy / select all
        if (e.key.startsWith('Arrow') || e.key === 'Tab' || e.key === 'Home' || e.key === 'End' || e.key === 'Escape') return;
        e.preventDefault();
    };
    let listenersOn = false;
    function setReadOnly(on) {
        const area = $id('capture-area'); if (!area) return;
        if (!listenersOn) {
            area.addEventListener('beforeinput', blockEdit, true);
            area.addEventListener('paste', blockEdit, true);
            area.addEventListener('drop', blockEdit, true);
            area.addEventListener('keydown', blockKeys, true);
            const changed = (e) => { if (inUpdates(e.target)) scheduleUpdateSave(); };
            // An Admin's changes to the library case: typing, a dropdown, or a button that adds or removes something (not the tab buttons).
            const touch = (e) => { if (mockId && mockEditing && !freeEdit(e.target)) editTouched = true; };
            area.addEventListener('input', touch, true);
            area.addEventListener('change', touch, true);
            area.addEventListener('click', (e) => { const b = e.target && e.target.closest && e.target.closest('button, [onclick]'); if (b && !b.closest('.tab-btn')) touch(e); }, true);
            area.addEventListener('input', changed, true);
            area.addEventListener('change', changed, true);
            Object.values(UPD_BODIES).forEach(id => { const b = $id(id); if (b) new MutationObserver(scheduleUpdateSave).observe(b, { childList: true }); });
            listenersOn = true;
        }
        area.classList.toggle('mock-ro', !!on);
        if (!on) area.classList.remove('mock-upd-ready');
        area.querySelectorAll('select').forEach(s => {
            if (s.closest('.tab-btn')) return;
            if (on) { if (!s.disabled) { s.disabled = true; s.dataset.mockRo = '1'; } }
            else if (s.dataset.mockRo) { s.disabled = false; delete s.dataset.mockRo; }
        });
        ['attorney-field', 'case-manager-field'].forEach(id => { const el = $id(id); if (el) el.readOnly = !!on; });
    }

    /* ---------- Notes & Tasks updates on a library case ----------
       The library original never changes, but its Notes and Tasks tabs are
       editable so trainees can log the calls they take and the tasks they set.
       What a user has there is saved for that user only (/api/mock-case-updates,
       debounced, and flushed before the editor is cleared) and replaces the
       original Notes and Tasks when they reopen the case. Editing opens only
       after their saved updates have loaded, so a slow load can't lead to
       saving over them. "Reset to the original" deletes them. */
    const UPD_BODIES = { notes: 'note-body', tasks: 'task-body' };
    const upd = { id: null, base: '', seq: 0, timer: null, pending: false, saved: false, chain: Promise.resolve() };
    // A contenteditable cell's text with its line breaks, even when its tab is hidden
    // (innerText drops <br> on elements that aren't rendered).
    function cellText(el) {
        if (!el) return '';
        const c = el.cloneNode(true);
        c.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
        c.querySelectorAll('div, p').forEach(d => d.prepend('\n'));
        return c.textContent.replace(/\u00a0/g, ' ').replace(/^\n+/, '').trimEnd();
    }
    function readRows(bodyId) {
        const box = $id(bodyId);
        return box ? [...box.children].map(tr => {
            const td = cells(tr);
            return { date: cellText(editIn(td[0])).trim(), staff: (selIn(td[1]) || {}).value || '', text: cellText(editIn(td[2])) };
        }) : [];
    }
    const snapshotRows = () => JSON.stringify({ notes: readRows(UPD_BODIES.notes), tasks: readRows(UPD_BODIES.tasks) });
    function fillRows(bodyId, list) {
        (list || []).forEach(n => {
            addRow(bodyId); const tr = added(bodyId); if (!tr) return;
            const td = cells(tr);
            const date = editIn(td[0]); if (date) date.innerText = n.date || '';
            setVal(selIn(td[1]), n.staff); setVal(editIn(td[2]), n.text);
        });
    }
    const updatesPending = () => !!(mockId && mockViewOnly && upd.id === mockId && updatesOpen() && snapshotRows() !== upd.base);
    function paintUpdState(state, detail) {
        const text = { loading: 'Loading your updates…', loaded: '✓ Your saved updates are shown', saving: 'Saving…',
            saved: `✓ Saved${detail ? ' ' + detail : ''}`, error: `⚠ Couldn't save${detail ? ` (${detail})` : ''}. Your changes are still on screen; they'll be saved with your next change.` }[state] || '';
        document.querySelectorAll('.mub-state').forEach(el => { el.textContent = text; el.dataset.state = state || ''; });
    }
    function openUpdates() {
        const area = $id('capture-area'); if (!area) return;
        area.classList.add('mock-upd-ready');
        area.querySelectorAll('.mock-upd select').forEach(s => { if (s.dataset.mockRo) { s.disabled = false; delete s.dataset.mockRo; } });
    }
    async function loadUpdates(id) {
        const seq = ++upd.seq;
        clearTimeout(upd.timer); upd.pending = false;
        upd.id = id; upd.saved = false; upd.base = snapshotRows();
        paintUpdState('loading');
        let u = null;
        try {
            const res = await fetch('/api/mock-case-updates?mock=' + encodeURIComponent(id), { credentials: 'include' });
            const data = await res.json();
            u = data && data.success && data.updates;
        } catch (e) { /* offline: keep the library original */ }
        if (seq !== upd.seq || mockId !== id || !mockViewOnly) return;
        if (u) {
            Object.entries(UPD_BODIES).forEach(([key, bodyId]) => {
                if (!Array.isArray(u[key])) return;
                $id(bodyId).innerHTML = '';
                fillRows(bodyId, u[key]);
            });
            upd.saved = true;
        }
        upd.base = snapshotRows();
        openUpdates();
        paintUpdState(u ? 'loaded' : '');
    }
    function scheduleUpdateSave() {
        if (!(mockId && mockViewOnly) || upd.id !== mockId || !updatesOpen()) return;
        clearTimeout(upd.timer); upd.pending = true;
        upd.timer = setTimeout(() => saveUpdates(), 1200);
    }
    // Takes what's on screen now (before any await, so a flush just before the editor
    // is cleared still has it) and queues it: saves reach the server in order, so the
    // newest always lands last. On page exit it goes straight out with keepalive.
    function saveUpdates(opts) {
        opts = opts || {};
        clearTimeout(upd.timer); upd.pending = false;
        if (!updatesPending()) return upd.chain;
        const id = mockId, snap = snapshotRows();
        upd.base = snap;
        const post = () => postUpdates(id, snap, !!opts.keepalive);
        upd.chain = opts.keepalive ? post() : upd.chain.then(post);
        return upd.chain;
    }
    async function postUpdates(id, snap, keepalive) {
        const mine = () => upd.id === id;
        if (mine()) paintUpdState('saving');
        try {
            const res = await fetch('/api/mock-case-updates', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', keepalive,
                body: JSON.stringify(Object.assign({ mock: id }, JSON.parse(snap)))
            });
            const data = await res.json().catch(() => ({}));
            if (!(data && data.success)) throw new Error((data && data.error) || '');
            if (mine()) { upd.saved = true; paintUpdState('saved', new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })); }
        } catch (e) {
            if (mine() && upd.base === snap) upd.base = ''; // not saved: the next change (or Save Case) sends it again
            if (mine()) paintUpdState('error', e && e.message);
        }
    }
    // Called before anything clears the editor (app.js: blankCaseEditorContent, loadCase).
    // opts.keepalive: the page is about to reload or close, so the save must outlive it.
    window.mockFlushUpdates = function (opts) { if (updatesPending()) saveUpdates(opts); };
    const flushOnLeave = () => { if (upd.pending) saveUpdates({ keepalive: true }); };
    window.addEventListener('pagehide', flushOnLeave);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushOnLeave(); });
    const activeTab = () => { const p = document.querySelector('#capture-area .tab-pane.active'); return p ? p.id.replace(/^pane-/, '') : 'profile'; };
    window.mockResetUpdates = async function () {
        const id = mockId; if (!id || !mockViewOnly) return;
        const rc = findCase(id) || { id };
        if (!confirm(`Reset the Notes and Tasks on ${fileRef(rc)} to the ${isAdmin() ? 'Training Library original' : 'original file'}? Your saved updates on this case will be deleted.`)) return;
        clearTimeout(upd.timer); upd.pending = false;
        upd.base = snapshotRows();
        await upd.chain; // a save still on its way must land before the delete, not after
        try {
            const res = await fetch('/api/mock-case-updates?mock=' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' });
            const data = await res.json().catch(() => ({}));
            if (!(data && data.success)) throw new Error();
        } catch (e) {
            if (typeof showToast === 'function') showToast('Couldn\'t reset right now. Check your connection and try again.', 'error');
            return;
        }
        if (mockId !== id || !mockViewOnly) return; // they moved on while it was resetting
        upd.base = snapshotRows(); // nothing left to flush: the reopen below starts from the original
        openMockCase(id, { silent: true, tab: activeTab() });
        if (typeof showToast === 'function') showToast(`Notes and Tasks on ${fileRef(rc)} are back to the original.`, 'success', 3000);
    };

    /* ---------- Admins' edits to library cases ----------
       An Admin can edit a library case in the editor (✎ Edit library case) and save it to
       the library for everyone (/api/mock-case-edits). The edited version replaces the
       mock-cases.js original wherever the case opens, and its key facts (name, phone,
       DOB, DOL…) update the search and the library list. Restore the original deletes
       the edit. Trainees' own Notes and Tasks still go on top of whichever version it is. */
    const edits = {};      // mock id -> { facts, updatedBy, updatedAt } for every edited case
    const originals = {};  // mock id -> the mock-cases.js facts an edit replaced
    let openSeq = 0, editsFor = null;
    const FACT_PATHS = { name: ['client', 'name'], phone: ['client', 'phone'], email: ['client', 'email'], dob: ['client', 'dob'], address: ['client', 'address'],
        emergencyName: ['client', 'emergency', 'name'], emergencyPhone: ['client', 'emergency', 'phone'], dateOfLoss: ['dateOfLoss'], sol: ['sol'],
        phase: ['phase'], attorney: ['attorney'], caseManager: ['caseManager'], narrative: ['narrative'] };
    const getPath = (o, p) => p.reduce((x, k) => (x == null ? x : x[k]), o);
    const setPath = (o, p, v) => { const last = p[p.length - 1], box = p.slice(0, -1).reduce((x, k) => (x[k] = x[k] || {}), o); box[last] = v; };
    function patchFacts(id, facts) {
        const c = findCase(id); if (!c || !facts) return;
        if (!originals[id]) { originals[id] = {}; Object.entries(FACT_PATHS).forEach(([k, p]) => { originals[id][k] = getPath(c, p); }); }
        Object.entries(FACT_PATHS).forEach(([k, p]) => { if (typeof facts[k] === 'string' && (k !== 'name' || facts[k].trim())) setPath(c, p, facts[k]); });
        delete _idx[id];
    }
    function unpatchFacts(id) {
        const c = findCase(id), o = originals[id]; if (!c || !o) return;
        Object.entries(FACT_PATHS).forEach(([k, p]) => setPath(c, p, o[k]));
        delete originals[id]; delete _idx[id];
    }
    // What the search and the library list use, read from the editor.
    function readFacts() {
        const t = (id) => cellText($id(id)).trim(); // as typed (innerText would apply the fields' CSS uppercase)
        const v = (id) => { const el = $id(id); return el ? String(el.value || '').trim() : ''; };
        return { name: t('client-name-field').split('\n')[0].trim(), phone: t('client-phone-field'), email: t('client-email-field'), dob: t('client-dob-field'),
            address: t('client-address-field'), emergencyName: t('emergency-name-field'), emergencyPhone: t('emergency-phone-field'),
            dateOfLoss: t('date-of-loss-field'), sol: t('sol-bar-field'), phase: v('phase-selector'), attorney: v('attorney-field'),
            caseManager: v('case-manager-field'), narrative: t('case-narrative-field') };
    }
    // Every edit's facts, once per signed-in user (the search needs them before any case opens).
    function loadEdits(refresh) {
        if (refresh) editsFor = null;
        const s = typeof getRealSession === 'function' ? getRealSession() : typeof getSession === 'function' ? getSession() : null, who = s && s.username;
        if (!who || editsFor === who) return;
        editsFor = who;
        fetch('/api/mock-case-edits', { credentials: 'include' }).then(r => r.json()).then(d => {
            if (!(d && d.success)) { editsFor = null; return; }
            const seen = new Set();
            (d.edits || []).forEach(e => { if (!findCase(e.mock)) return; seen.add(e.mock); edits[e.mock] = e; patchFacts(e.mock, e.facts); });
            Object.keys(edits).forEach(id => { if (!seen.has(id)) { delete edits[id]; unpatchFacts(id); } });
            const m = $id('library-modal'); if (m && m.classList.contains('open')) renderLibraryList(false);
            if (mockId && mockViewOnly) paintBanner();
        }).catch(() => { editsFor = null; });
    }
    // Other trainers' new edits reach an open page's search within a few minutes.
    setInterval(() => { if (typeof hasAuthorizedAccess === 'function' && hasAuthorizedAccess()) loadEdits(true); }, 5 * 60 * 1000);
    // The case's current edit, fresh from the server each time it opens (another trainer may have just saved one).
    async function fetchEdit(id) {
        try {
            const res = await fetch('/api/mock-case-edits?mock=' + encodeURIComponent(id), { credentials: 'include', signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined });
            const d = await res.json();
            return d && d.success ? { ok: true, edit: d.edit } : { ok: false };
        } catch (e) { return { ok: false }; }
    }
    // The library version on screen: the original from mock-cases.js (with any known edit's facts).
    function showBase(c) {
        if (typeof blankCaseEditorContent === 'function') blankCaseEditorContent();
        if (typeof revertOther === 'function') revertOther('main-case-type', 'main-case-other', 'main-revert');
        fillCase(c);
        // The file's case number, as on a real file (the banner says it's a library case).
        const idField = $id('case-id-field'); if (idField) idField.innerText = c.caseNumber || `${c.id} · TRAINING LIBRARY`;
    }
    // Puts an Admin's edit on screen, or the original back when the edit is gone.
    function showEdit(c, e) {
        const keep = { mockId, mockViewOnly, mockEditing };
        if (e && e.content) {
            edits[c.id] = { mock: c.id, facts: e.facts, updatedBy: e.updatedBy, updatedAt: e.updatedAt };
            patchFacts(c.id, e.facts);
            showBase(c);
            if (typeof applyCaseContentToDOM === 'function') applyCaseContentToDOM(e.content, document);
            const ph = $id('phase-selector'); if (ph && typeof updatePhaseDisplay === 'function') updatePhaseDisplay(ph.value);
        } else if (edits[c.id]) {
            delete edits[c.id]; unpatchFacts(c.id);
            showBase(c);
        } else return;
        ({ mockId, mockViewOnly, mockEditing } = keep); // showBase's wipe ends library mode; this is still the same case
        setReadOnly(mockViewOnly);
        paintBanner();
    }
    const editDirty = () => !!(mockId && mockEditing && editTouched);
    window.mockEditDirty = editDirty;   // cms-update.js waits while there are unsaved changes
    window.addEventListener('beforeunload', (e) => { if (editDirty()) { e.preventDefault(); e.returnValue = ''; } });
    // Anything that's about to replace the case in the editor asks first when an Admin has unsaved changes to it.
    window.mockConfirmLeave = function () {
        if (!editDirty()) return true;
        if (!confirm('Discard your unsaved changes to this Training Library case?')) return false;
        editTouched = false; return true;
    };
    // 💾 Save to the library (also what Save Case does while editing).
    let saving = false;
    window.saveLibraryEdit = async function () {
        if (!(mockId && mockEditing) || !isAdmin() || saving) return;
        const id = mockId, c = findCase(id);
        const content = buildCaseContentPayload(); delete content.trainingLibraryId; delete content.program;
        const facts = readFacts();
        if (!facts.name) { if (typeof showToast === 'function') showToast('The client name can\'t be empty.', 'error'); return; }
        saving = true;
        let d = null;
        try {
            const res = await fetch('/api/mock-case-edits', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ mock: id, content, facts }) });
            d = await res.json().catch(() => null);
        } catch (e) { /* offline */ }
        saving = false;
        if (!(d && d.success)) { if (typeof showToast === 'function') showToast(`Couldn't save to the library${d && d.error ? ': ' + d.error : ''}. Your changes are still on screen.`, 'error', 5000); return; }
        if (mockId !== id || !mockEditing) return;
        edits[id] = { mock: id, facts, updatedBy: d.updatedBy, updatedAt: d.updatedAt };
        patchFacts(id, facts);
        editTouched = false;
        openMockCase(id, { silent: true, tab: activeTab() });
        if (typeof showToast === 'function') showToast(`Saved to the Training Library. Everyone who opens ${c ? fileRef(c) : id} now sees this version.`, 'success', 4000);
    };
    // ↺ Restore the original (Admins): deletes the edit.
    window.restoreLibraryOriginal = async function () {
        if (!mockId || !isAdmin()) return;
        const id = mockId, c = findCase(id);
        if (!confirm(`Restore ${id} to the original library case? The edited version is deleted for everyone.`)) return;
        let d = null;
        try { d = await (await fetch('/api/mock-case-edits?mock=' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' })).json(); } catch (e) { /* offline */ }
        if (!(d && d.success)) { if (typeof showToast === 'function') showToast('Couldn\'t restore right now. Check your connection and try again.', 'error'); return; }
        delete edits[id]; unpatchFacts(id);
        editTouched = false;
        openMockCase(id, { silent: true, tab: activeTab() });
        if (typeof showToast === 'function') showToast(`${c ? fileRef(c) : id} is back to the original.`, 'success', 3000);
    };
    // ↺ Undo my changes: the library version again, as last saved.
    window.cancelLibraryEdit = function () {
        if (!mockId || !mockEditing || !window.mockConfirmLeave()) return;
        openMockCase(mockId, { silent: true, tab: activeTab() });
    };

    function paintBanner() {
        const b = $id('mock-banner'); if (!b) return;
        const c = mockId && findCase(mockId);
        if (!c) { b.classList.remove('open'); b.innerHTML = ''; closeCallsPanel(); return; }
        b.classList.add('open');
        const find = isAdmin() ? `<button onclick="openTrainingLibrary()">📚 Library</button>` : `<button onclick="focusCaseSearch()">🔍 Search cases</button>`;
        const calls = isAdmin() ? `<button onclick="openCallsPanel()">☎ Caller scenarios</button>` : '';   // trainers only
        const ed = edits[c.id];
        const edNote = isAdmin() && ed ? `<span class="mb-ed">✎ Edited by ${esc(ed.updatedBy || 'an Admin')}${ed.updatedAt ? ' · ' + esc(ed.updatedAt) + ' UTC' : ''}</span>` : '';
        if (mockEditing) {   // trainers: the library case, open to edit
            b.innerHTML = `<span class="mb-tag edit">TRAINING LIBRARY · EDITABLE · ${esc(fileRef(c))}</span><span><b>${esc(c.client.name)}</b> · DOL ${esc(c.dateOfLoss)} — edit it like any case. <b>Save</b> saves it to the library for everyone; trainees see it view only. The practice calls on this file keep their own answers.</span>${edNote}<span class="mb-sp"></span>
               ${calls}<button class="pri" onclick="saveLibraryEdit()">💾 Save to the library</button><button onclick="cancelLibraryEdit()">↺ Undo my changes</button>${ed ? `<button onclick="restoreLibraryOriginal()">↺ Restore the original</button>` : ''}<button onclick="startPracticeCopy()">✍ Practice copy</button>${find}<button onclick="closeMockCase()">✕ Close</button>`;
            return;
        }
        b.innerHTML = mockViewOnly
            ? `<span class="mb-tag">${isAdmin() ? 'TRAINING LIBRARY' : 'CASE FILE'} · ${esc(fileRef(c))}</span><span><b>${esc(c.client.name)}</b> · DOL ${esc(c.dateOfLoss)} — view only; you can add Notes and Tasks. Look things up the way you would on a live call.</span>${edNote}<span class="mb-sp"></span>
               ${calls}<button class="pri" onclick="startPracticeCopy()">✍ Work on a practice copy</button>${find}<button onclick="closeMockCase()">✕ Close</button>`
            : `<span class="mb-tag">PRACTICE COPY · ${esc(fileRef(c))}</span><span>Your own copy of <b>${esc(c.client.name)}</b>. Save Case adds it to your cases; the ${isAdmin() ? 'library original' : 'original file'} never changes.</span><span class="mb-sp"></span>
               ${calls}<button onclick="openMockCase('${c.id}')">↺ Back to the ${isAdmin() ? 'library original' : 'original file'}</button>`;
    }

    window.openMockCase = function (id, opts) {
        opts = opts || {};
        const c = findCase(id);
        if (!c) { if (typeof showToast === 'function') showToast(`That ${kindWord()} was not found.`, 'error'); return false; }
        if (typeof hasAuthorizedAccess === 'function' && !hasAuthorizedAccess()) return false;
        buildUI();
        if (!window.mockConfirmLeave()) return false;
        const unsavedOwnWork = !mockViewOnly && typeof currentCaseId !== 'undefined' && currentCaseId === null && typeof hasCaseContent === 'function' && hasCaseContent();
        if (!opts.silent && unsavedOwnWork && !confirm(`Open this ${kindWord()}? The unsaved case in the editor will be cleared.`)) return false;
        // Trainers (Admins) open library cases ready to edit (Save goes to the library); everyone else, view only.
        const editor = isAdmin();
        showBase(c);
        mockId = c.id; mockViewOnly = !editor; mockEditing = editor; editTouched = false;
        if (editor) {
            upd.id = null; clearTimeout(upd.timer); upd.pending = false;
            if (typeof currentCaseId !== 'undefined') { currentCaseId = null; currentCaseIsDraft = false; currentCaseCanEdit = true; }
        }
        setReadOnly(!editor);
        paintBanner();
        // An Admin's edit of this case (if any) replaces the original, then a trainee's own Notes and Tasks go on top.
        // A trainer's copy stays shut until the library version is in, so nothing is typed over the wrong one.
        const seq = ++openSeq, area = $id('capture-area');
        if (area && (editor || edits[c.id])) area.classList.add('mock-loading');
        fetchEdit(c.id).then(r => {
            if (seq !== openSeq || mockId !== c.id || (editor ? !mockEditing : !mockViewOnly)) return;
            if (area) area.classList.remove('mock-loading');
            if (r.ok) showEdit(c, r.edit);
            if (editor && !r.ok) { // can't tell what the library has now: don't let an edit of an old version go over it
                mockEditing = false; mockViewOnly = true; setReadOnly(true); paintBanner();
                if (typeof showToast === 'function') showToast('Couldn\'t load the library version of this case, so it\'s view only for now. Reopen it to edit.', 'error', 5000);
            }
            editTouched = false;
            if (mockViewOnly) loadUpdates(c.id);
            if (typeof persistCurrentEditorState === 'function') persistCurrentEditorState();
        });
        closeTrainingLibrary();
        if (typeof showTab === 'function') showTab(opts.tab || 'profile');
        if (typeof persistCurrentEditorState === 'function') persistCurrentEditorState();
        if (!opts.silent && typeof showToast === 'function') showToast(`Opened ${fileRef(c)}: ${c.client.name} ${editor ? '(editable: Save saves it to the Training Library)' : '(view only)'}`, 'info', 3000);
        return true;
    };
    window.startPracticeCopy = function () {
        if (!mockId) return;
        if (updatesPending()) saveUpdates(); // keep the library-case notes too; the copy carries them as well
        mockViewOnly = false; mockEditing = false; editTouched = false;
        setReadOnly(false);
        if (typeof currentCaseId !== 'undefined') { currentCaseId = null; currentCaseIsDraft = false; currentCaseCanEdit = true; }
        if (typeof generateCaseId === 'function') generateCaseId();
        paintBanner();
        if (typeof persistCurrentEditorState === 'function') persistCurrentEditorState();
        if (typeof showToast === 'function') showToast('Practice copy ready. Edit freely; Save Case creates your own case (it autosaves as a draft).', 'success', 5000);
    };
    window.closeMockCase = function () {
        if (!window.mockConfirmLeave()) return;
        if (typeof blankCaseEditorContent === 'function') blankCaseEditorContent();
        if (typeof clearPersistedEditorState === 'function') clearPersistedEditorState();
        if (typeof revertOther === 'function') revertOther('main-case-type', 'main-case-other', 'main-revert');
        if (typeof updatePhaseDisplay === 'function') updatePhaseDisplay('INTAKE');
        if (typeof generateCaseId === 'function') generateCaseId();
        if (typeof showTab === 'function') showTab('profile');
    };

    /* ---------- caller scenarios side panel (trainers/Admins only) ---------- */
    window.openCallsPanel = function () {
        const c = mockId && findCase(mockId); const p = $id('mock-calls-panel'); if (!c || !p) return;
        if (!isAdmin()) { closeCallsPanel(); return; }
        const r = c.reception || { verify: '', calls: [] };
        p.innerHTML = `<div class="mcp-h"><div><div style="font-size:10px;color:#fdba74;font-weight:800;letter-spacing:1px">${c.id} · CALLER SCENARIOS</div><b>${esc(c.client.name)}</b></div>
            <button onclick="closeCallsPanel()" style="background:none;border:1px solid #334155;color:#fff;border-radius:6px;padding:4px 9px;cursor:pointer">✕</button></div>
            <div class="mcp-b">
            <div class="mcp-verify"><b>Verify before sharing anything:</b> ${esc(r.verify)}</div>
            <p style="font-size:11.5px;color:#64748b;margin:0 0 10px">Trainers only. Run these as mock calls: you play the caller, and the trainee answers from this case file (tabs: Profile, Treatment, Notes, Tasks…) and the ☎ Firm directory. Each call has the model handling and a reception call script.</p>
            ${r.calls.map((k, i) => `<div class="mcp-call shown" id="mcp-call-${i}">
                <div class="from">📞 ${esc(k.from)}</div><div class="ask">${esc(k.ask)}</div>
                <div class="key">✅ ${esc(k.handle)}</div>
                ${window.fddScenarioScript ? `<details class="mcp-script"><summary>📜 Reception call script</summary>${fddScenarioScript(c.id, i)}</details>` : ''}</div>`).join('')}
            ${window.fddCallScripts ? scriptsSection(c) : ''}
            <button onclick="openTrainingLibrary('desk')" style="font-size:10.5px;font-weight:800;text-transform:uppercase;background:#0f2148;color:#fff;border:none;border-radius:6px;padding:8px 12px;cursor:pointer">☎ Firm directory & rules</button>
            </div>`;
        p.classList.add('open'); p.setAttribute('aria-hidden', 'false');
    };
    // Admins: the simulator callers on this file, scripted for a trainer to play the caller, and print buttons.
    function scriptsSection(c) {
        const mine = (window.DRILL_CALLS || []).filter(d => d.mock === c.id).length, all = (window.DRILL_CALLS || []).length;
        return `<div class="mcp-scripts"><div class="mcp-sh">🎭 Mock-call scripts · you play the caller</div>
            <p>Run a mock call: read the caller's lines, answer the trainee's questions from the table, then score the call.</p>
            <div class="fdd-scripts-bar"><button onclick="fddPrintScripts('${c.id}')">🖨 Print this file's scripts</button><button onclick="fddPrintScripts()">🖨 Print all ${all} simulator callers</button></div>
            ${mine ? fddCallScripts(c.id) : '<p>No simulator callers on this file: use the caller scenarios above, or print all.</p>'}</div>`;
    }
    function closeCallsPanel() { const p = $id('mock-calls-panel'); if (p) { p.classList.remove('open'); p.setAttribute('aria-hidden', 'true'); } }
    window.closeCallsPanel = closeCallsPanel;

    /* ---------- wiring ---------- */
    // Program label follows the session header; ?mock= / ?library= open after sign-in.
    let deepLinkDone = false;
    const origApply = window.applySessionUI;
    if (typeof origApply === 'function') {
        window.applySessionUI = function () {
            const r = origApply.apply(this, arguments);
            buildUI();
            const signedIn = typeof hasAuthorizedAccess === 'function' && hasAuthorizedAccess();
            if (!signedIn) { mockId = null; mockViewOnly = false; mockEditing = false; setReadOnly(false); paintBanner(); }
            else loadEdits();
            if (signedIn && !deepLinkDone) {
                deepLinkDone = true;
                const m = params.get('mock');
                if (m && findCase(m)) setTimeout(() => openMockCase(m, { silent: true }), 50);
                else if (params.get('library')) setTimeout(() => openTrainingLibrary(), 50);
            }
            return r;
        };
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeCallsPanel(); closeTrainingLibrary(); } });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI); else buildUI();
})();
