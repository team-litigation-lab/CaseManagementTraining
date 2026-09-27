/* =========================================================
   LSH CMS — TRAINING LIBRARY + PROGRAM CONTEXT
   ---------------------------------------------------------
   1. Program context. Every LSH training program can open the CMS
      with ?program=<id> (reception, intake, cm, ea). It's remembered
      for the browser tab, shown in the header, used as the Training
      Library's default filter, and stamped on any practice copy a
      trainee saves (content.program), so trainers can tell which
      course a case came from.
   2. Training Library. The hardcoded mock cases in mock-cases.js open
      in the normal case editor as VIEW ONLY (nothing can be typed,
      saved, archived or autosaved). "Work on a practice copy" makes the
      editor editable; Save Case then creates the trainee's own case,
      stamped with content.trainingLibraryId.
   3. Caller scenarios. For the front desk: how to verify the caller on
      this file, the calls it gets, and the model handling (hidden until
      the trainee reveals it; always shown to Admins).
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
        ea: 'ea', pa: 'ea', eapa: 'ea', 'ea-pa': 'ea'
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
    let libState = { program: currentProgram() || 'all', q: '', tab: 'cases' };
    window.mockIsViewOnly = () => !!(mockId && mockViewOnly);
    window.mockCurrentId = () => mockId;
    // Called by the save/archive/update buttons. Returns true (and explains) when saving must be blocked.
    window.mockBlocksSave = function (silent) {
        if (!(mockId && mockViewOnly)) return false;
        if (!silent && typeof showToast === 'function') showToast('This is a Training Library case (view only). Click "Work on a practice copy" to make your own copy you can save.', 'info', 5000);
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
        mockId = null; mockViewOnly = false;
        setReadOnly(false);
        paintBanner();
    };
    window.mockSnapshot = () => ({ mockId, mockViewOnly });
    // restoreCurrentEditorState() hands back what mockSnapshot() stored.
    window.mockRestore = function (data) {
        if (!data || !data.mockId || !findCase(data.mockId)) return false;
        if (data.mockViewOnly) { openMockCase(data.mockId, { silent: true }); return true; }
        mockId = data.mockId; mockViewOnly = false; paintBanner();
        return false; // the normal restore puts the practice copy back
    };

    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const findCase = (id) => (window.MOCK_CASES || []).find(c => c.id === String(id || '').toUpperCase());
    // Everything a front-desk caller might give you: names (client, contacts, adjusters,
    // other drivers), phone numbers, email, DOB, address, claim/policy/file numbers,
    // report numbers, plates, and the narrative. Digits-only matching for numbers.
    const searchText = (c) => {
        const bits = [c.id, c.client.name, c.client.phone, c.client.email, c.client.dob, c.client.address,
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
    #mock-banner button:hover{border-color:#f97316}
    #capture-area.mock-ro .add-btn,#capture-area.mock-ro .hub-btn,#capture-area.mock-ro .revert-btn,#capture-area.mock-ro td button,#capture-area.mock-ro .pdf-card > button{display:none !important}
    #capture-area.mock-ro [contenteditable]{cursor:default;caret-color:transparent}
    #capture-area.mock-ro select:disabled,#capture-area.mock-ro input[readonly]{opacity:1;cursor:default}
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
    .mcp-call textarea{width:100%;min-height:54px;border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit}
    .mcp-call .key{display:none;font-size:12px;color:#14532d;background:#f0fdf4;border-radius:6px;padding:8px 10px;margin-top:6px}
    .mcp-call.shown .key{display:block}
    .mcp-call button{font-size:10px;font-weight:800;text-transform:uppercase;background:#fff;border:1px solid #0f2148;color:#0f2148;border-radius:6px;padding:5px 9px;cursor:pointer;margin-top:6px}
    `;
    document.head.appendChild(css);

    /* ---------- DOM: sidebar block, banner, modal, side panel ---------- */
    function buildUI() {
        const dash = document.querySelector('#sidebar-actions button[onclick="openTraineeDashboard()"]');
        if (dash && !$id('lib-open-btn')) {
            dash.classList.remove('mb-8'); dash.classList.add('mb-4');
            dash.insertAdjacentHTML('afterend', `
                <button id="lib-open-btn" class="lib-btn" onclick="openTrainingLibrary()">📚 Training Library · ${(window.MOCK_CASES || []).length} mock cases</button>
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
                    <div class="sub mono">Hardcoded mock cases for every LSH training program. They open view-only; work on a practice copy to save your own.</div>
                    <div class="lib-tabs" id="lib-tabs"></div>
                    <div id="lib-filters"></div>
                    <div id="lib-body" style="overflow-y:auto;flex:1;"></div>
                    <div class="modal-btn-row"><button class="btn-ghost" onclick="closeTrainingLibrary()">Close</button></div>
                </div>
            </div>
            <div id="mock-calls-panel" class="no-print" aria-hidden="true"></div>`);
        }
        paintProgramUI();
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
        const q = norm(libState.q);
        const list = (window.MOCK_CASES || []).filter(c =>
            (libState.program === 'all' || c.programs.includes(libState.program)) &&
            (!q || mockMatches(c, q)));
        body.innerHTML = list.length ? list.map(c => `<div class="lib-row">
            <div class="id">${c.id}</div>
            <div><div class="nm">${esc(c.client.name)}</div><div class="sm">${esc(c.summary)}</div>
                <div class="pills">${c.programs.map(p => `<span>${esc(programLabel(p))}</span>`).join('')}</div></div>
            <div class="meta">${esc(c.caseType === 'Others' ? c.caseTypeOther : c.caseType)} · ${esc(c.phase)}<br>DOL ${esc(c.dateOfLoss)}<br>${esc(c.level)}</div>
            <div><button onclick="openMockCase('${c.id}')">Open case</button></div>
        </div>`).join('') : '<p style="font-size:12px;color:#94a3b8">No mock cases match.</p>';
    }

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
        [['notes', 'note-body'], ['tasks', 'task-body']].forEach(([key, body]) => {
            (c[key] || []).forEach(n => {
                addRow(body); const tr = added(body); if (!tr) return;
                const td = cells(tr);
                setVal(editIn(td[0]), n.date); setVal(selIn(td[1]), n.staff); setVal(editIn(td[2]), n.text);
            });
        });
        if (typeof toggleOwnerExtra === 'function') toggleOwnerExtra();
        if (typeof toggleDriverInsuredExtra === 'function') toggleDriverInsuredExtra();
        if (typeof updateTotals === 'function') updateTotals();
    }

    /* ---------- view-only mode ---------- */
    const blockEdit = (e) => { if (mockId && mockViewOnly) { e.preventDefault(); e.stopPropagation(); } };
    const blockKeys = (e) => {
        if (!(mockId && mockViewOnly)) return;
        const t = e.target;
        if (!t || !t.closest || !t.closest('#capture-area [contenteditable]')) return;
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
            listenersOn = true;
        }
        area.classList.toggle('mock-ro', !!on);
        area.querySelectorAll('select').forEach(s => {
            if (s.closest('.tab-btn')) return;
            if (on) { if (!s.disabled) { s.disabled = true; s.dataset.mockRo = '1'; } }
            else if (s.dataset.mockRo) { s.disabled = false; delete s.dataset.mockRo; }
        });
        ['attorney-field', 'case-manager-field'].forEach(id => { const el = $id(id); if (el) el.readOnly = !!on; });
    }

    function paintBanner() {
        const b = $id('mock-banner'); if (!b) return;
        const c = mockId && findCase(mockId);
        if (!c) { b.classList.remove('open'); b.innerHTML = ''; closeCallsPanel(); return; }
        b.classList.add('open');
        b.innerHTML = mockViewOnly
            ? `<span class="mb-tag">TRAINING LIBRARY · ${c.id}</span><span><b>${esc(c.client.name)}</b> — view only. Look things up the way you would on a live call.</span><span class="mb-sp"></span>
               <button onclick="openCallsPanel()">☎ Caller scenarios</button><button class="pri" onclick="startPracticeCopy()">✍ Work on a practice copy</button><button onclick="openTrainingLibrary()">📚 Library</button><button onclick="closeMockCase()">✕ Close</button>`
            : `<span class="mb-tag">PRACTICE COPY · ${c.id}</span><span>Your own copy of <b>${esc(c.client.name)}</b>. Save Case adds it to your cases; the library original never changes.</span><span class="mb-sp"></span>
               <button onclick="openCallsPanel()">☎ Caller scenarios</button><button onclick="openMockCase('${c.id}')">↺ Back to the library original</button>`;
    }

    window.openMockCase = function (id, opts) {
        opts = opts || {};
        const c = findCase(id);
        if (!c) { if (typeof showToast === 'function') showToast('That Training Library case was not found.', 'error'); return false; }
        if (typeof hasAuthorizedAccess === 'function' && !hasAuthorizedAccess()) return false;
        buildUI();
        const unsavedOwnWork = !mockViewOnly && typeof currentCaseId !== 'undefined' && currentCaseId === null && typeof hasCaseContent === 'function' && hasCaseContent();
        if (!opts.silent && unsavedOwnWork && !confirm('Open this Training Library case? The unsaved case in the editor will be cleared.')) return false;
        if (typeof blankCaseEditorContent === 'function') blankCaseEditorContent();
        if (typeof revertOther === 'function') revertOther('main-case-type', 'main-case-other', 'main-revert');
        fillCase(c);
        mockId = c.id; mockViewOnly = true;
        const idField = $id('case-id-field'); if (idField) idField.innerText = `${c.id} · TRAINING LIBRARY`;
        setReadOnly(true);
        paintBanner();
        closeTrainingLibrary();
        if (typeof showTab === 'function') showTab('profile');
        if (typeof persistCurrentEditorState === 'function') persistCurrentEditorState();
        if (!opts.silent && typeof showToast === 'function') showToast(`Opened ${c.id}: ${c.client.name} (view only)`, 'info', 3000);
        return true;
    };
    window.startPracticeCopy = function () {
        if (!mockId) return;
        mockViewOnly = false;
        setReadOnly(false);
        if (typeof currentCaseId !== 'undefined') { currentCaseId = null; currentCaseIsDraft = false; currentCaseCanEdit = true; }
        if (typeof generateCaseId === 'function') generateCaseId();
        paintBanner();
        if (typeof persistCurrentEditorState === 'function') persistCurrentEditorState();
        if (typeof showToast === 'function') showToast('Practice copy ready. Edit freely; Save Case creates your own case (it autosaves as a draft).', 'success', 5000);
    };
    window.closeMockCase = function () {
        if (typeof blankCaseEditorContent === 'function') blankCaseEditorContent();
        if (typeof clearPersistedEditorState === 'function') clearPersistedEditorState();
        if (typeof revertOther === 'function') revertOther('main-case-type', 'main-case-other', 'main-revert');
        if (typeof updatePhaseDisplay === 'function') updatePhaseDisplay('INTAKE');
        if (typeof generateCaseId === 'function') generateCaseId();
        if (typeof showTab === 'function') showTab('profile');
    };

    /* ---------- caller scenarios side panel ---------- */
    window.openCallsPanel = function () {
        const c = mockId && findCase(mockId); const p = $id('mock-calls-panel'); if (!c || !p) return;
        const admin = isAdmin();
        const r = c.reception || { verify: '', calls: [] };
        p.innerHTML = `<div class="mcp-h"><div><div style="font-size:10px;color:#fdba74;font-weight:800;letter-spacing:1px">${c.id} · CALLER SCENARIOS</div><b>${esc(c.client.name)}</b></div>
            <button onclick="closeCallsPanel()" style="background:none;border:1px solid #334155;color:#fff;border-radius:6px;padding:4px 9px;cursor:pointer">✕</button></div>
            <div class="mcp-b">
            <div class="mcp-verify"><b>Verify before sharing anything:</b> ${esc(r.verify)}</div>
            <p style="font-size:11.5px;color:#64748b;margin:0 0 10px">Answer each call from what's in this case file (tabs: Profile, Treatment, Notes, Tasks…) and the ☎ Firm directory in the Library. Write what you'd say and do, then reveal the model handling.${admin ? ' <b>Admin:</b> model handling is shown.' : ''}</p>
            ${r.calls.map((k, i) => `<div class="mcp-call ${admin ? 'shown' : ''}" id="mcp-call-${i}">
                <div class="from">📞 ${esc(k.from)}</div><div class="ask">${esc(k.ask)}</div>
                ${admin ? '' : `<textarea placeholder="What do you say and do?"></textarea><button onclick="this.closest('.mcp-call').classList.add('shown')">Reveal model handling</button>`}
                <div class="key">✅ ${esc(k.handle)}</div></div>`).join('')}
            <button onclick="openTrainingLibrary('desk')" style="font-size:10.5px;font-weight:800;text-transform:uppercase;background:#0f2148;color:#fff;border:none;border-radius:6px;padding:8px 12px;cursor:pointer">☎ Firm directory & rules</button>
            </div>`;
        p.classList.add('open'); p.setAttribute('aria-hidden', 'false');
    };
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
            if (!signedIn) { mockId = null; mockViewOnly = false; setReadOnly(false); paintBanner(); }
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
