/* =========================================================
   LSH CMS — CASE LIBRARY (search-first)
   ---------------------------------------------------------
   Every case in one place: the cases trainees save (the server's
   Case Repository) and the Training Library mock cases
   (mock-cases.js). Nothing is listed until you search, the way a
   front desk looks a caller up on a live call; "My cases" lists
   your own. Search by client name, date of the accident (DOL), date
   of birth, phone, claim/policy #, plate or case ID. When several
   files share a name, the results say so: the DOL and the DOB tell
   them apart (MC-01/21/22 are all "Maria Santos").

   The search bar at the top of the case workspace (Ctrl/Cmd+K) shows
   matching files in a dropdown; clicking one opens it, so trainees
   never need to open a library. The Case Library window (sidebar →
   Open Case Library) adds filters, "My cases" and the firm directory.
   For trainees, every way into the Training Library comes here.
   During a Front Desk Drill call, a mock case opened from here counts
   as the call's pick.

   No <select> or contenteditable here on purpose: the case editor
   saves every select and contenteditable on the page by position
   (buildCaseContentPayload in app.js), so adding one would shift
   saved cases.
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const session = () => (typeof getSession === 'function' ? getSession() : null);
    const isAdmin = () => { const s = session(); return !!(s && s.userType === 'Admin'); };
    const signedIn = () => typeof hasAuthorizedAccess === 'function' && hasAuthorizedAccess();
    const BAR_MAX = 25, MODAL_MAX = 60;

    let state = { tab: 'search', scope: 'all', q: '' };

    /* ---------- the files and the search ---------- */
    // "MM/DD/YYYY" -> sortable number (newest first); anything else sorts last.
    const dateKey = (d) => { const m = String(d || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? Number(m[3]) * 10000 + Number(m[1]) * 100 + Number(m[2]) : 0; };
    function allFiles() {
        const s = session();
        const repo = typeof _repoCache !== 'undefined' && Array.isArray(_repoCache) ? _repoCache : [];
        const mocks = (window.MOCK_CASES || []).map(c => ({
            kind: 'mock', id: c.id, name: c.client.name, dob: c.client.dob, dol: c.dateOfLoss, ref: c.id,
            phase: c.phase, type: c.caseType === 'Others' ? c.caseTypeOther : c.caseType
        }));
        const saved = repo.map(i => ({
            kind: 'saved', id: i.id, name: i.clientName || 'Unnamed Client', dob: '', dol: i.dateOfLoss || '', ref: i.caseId || '',
            phase: i.phase || '', type: '', draft: !!i.isDraft, canEdit: !!i.canEdit,
            mine: !!s && i.ownerUsername === s.username, by: i.submittedBy || i.ownerUsername || ''
        }));
        return mocks.concat(saved);
    }
    function savedMatches(f, q) {
        const text = [f.name, f.ref, f.dol, f.phase].concat(isAdmin() ? [f.by] : []).join(' | ');
        const t = norm(text);
        if (q.split(' ').every(w => t.includes(w))) return true;
        const digits = q.replace(/\D/g, '');
        return digits.length >= 4 && text.replace(/\D/g, '').includes(digits);
    }
    // scope: all | mock | saved | mine. An empty query only lists "mine".
    function search(query, scope) {
        const q = norm(query);
        let files = allFiles();
        if (scope === 'mock') files = files.filter(f => f.kind === 'mock');
        else if (scope === 'saved') files = files.filter(f => f.kind === 'saved');
        else if (scope === 'mine') files = files.filter(f => f.mine);
        if (q) {
            const mockHits = new Set((window.mockSearch ? window.mockSearch(q) : []).map(c => c.id));
            files = files.filter(f => f.kind === 'mock' ? mockHits.has(f.id) : savedMatches(f, q));
        } else if (scope !== 'mine') files = [];
        // Same names side by side, newest accident first, so the DOLs are easy to compare.
        return files.sort((a, b) => norm(a.name).localeCompare(norm(b.name)) || dateKey(b.dol) - dateKey(a.dol) || (a.kind === b.kind ? 0 : a.kind === 'mock' ? -1 : 1));
    }
    window.caseLibrarySearch = search;
    function sameNameWarning(hits) {
        const count = {};
        hits.forEach(f => { const k = norm(f.name); count[k] = (count[k] || 0) + 1; });
        const dups = Object.keys(count).filter(k => count[k] > 1);
        if (!dups.length) return '';
        const names = dups.map(k => `<b>${esc(hits.find(f => norm(f.name) === k).name)}</b> (${count[k]} files)`).join(', ');
        return `<div class="cl-dup">⚠ Same name on more than one file: ${names}. Ask for the <b>date of the accident (DOL)</b> and the <b>date of birth</b>, and open the file that matches both.</div>`;
    }
    const mineCount = () => allFiles().filter(f => f.mine).length;

    /* ---------- styles ---------- */
    const css = document.createElement('style');
    css.textContent = `
    #cl-bar{display:none;flex-shrink:0;padding:10px 32px;background:#fff;border-bottom:1px solid #e2e8f0}
    #cl-bar.on{display:block}
    .clb-wrap{position:relative;max-width:760px}
    .clb-field{display:flex;align-items:center;gap:8px;border:2px solid #cbd5e1;border-radius:10px;padding:0 10px;background:#fff}
    .clb-field:focus-within{border-color:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.15)}
    .clb-field .clb-icon{font-size:15px}
    #cl-bar-input{flex:1;min-width:0;border:none;outline:none;padding:10px 2px;font-size:14px;color:#0f2148;background:transparent}
    .clb-kbd{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:800;color:#64748b;border:1px solid #cbd5e1;border-radius:5px;padding:2px 6px;white-space:nowrap}
    @media (max-width:700px){#cl-bar{padding:8px 12px}.clb-kbd{display:none}}
    .clb-results{display:none;position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:2986;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 14px 34px rgba(15,33,72,.22);max-height:min(62vh,560px);overflow-y:auto;padding:8px}
    .clb-results.open{display:block}
    .clb-results .cl-dup{margin:0 0 8px}
    .clb-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:9px 10px;border-radius:8px;cursor:pointer;border:1px solid transparent}
    .clb-row + .clb-row{margin-top:2px}
    .clb-row:hover,.clb-row.on{background:#fff7ed;border-color:#fed7aa}
    .clb-row .nm{font-weight:800;color:#0f2148;font-size:13px}
    .clb-row .sm{font-size:11px;color:#64748b;margin-top:2px}
    .clb-row .dol{font-size:9.5px;font-weight:800;color:#64748b;text-transform:uppercase;text-align:right}
    .clb-row .dol b{display:block;font-family:'IBM Plex Mono',monospace;font-size:13px;color:#0f2148}
    .clb-hint{font-size:12px;color:#64748b;line-height:1.5;padding:6px 8px}
    #case-library-modal .cl-box{max-width:940px;width:94vw;max-height:88vh;display:flex;flex-direction:column}
    .cl-tabs,.cl-chips{display:flex;gap:6px;flex-wrap:wrap}
    .cl-tabs{margin:0 0 12px}
    .cl-tabs button,.cl-chips button{font-size:11px;font-weight:700;border:1px solid #e2e8f0;background:#fff;color:#0f2148;border-radius:999px;padding:6px 12px;cursor:pointer}
    .cl-tabs button.on,.cl-chips button.on{background:#0f2148;color:#fff;border-color:#0f2148}
    .cl-search{width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13.5px;margin:0 0 8px;outline:none}
    .cl-search:focus{border-color:#f97316}
    .cl-chips{margin:0 0 10px}
    .cl-hint{font-size:12.5px;color:#64748b;line-height:1.55;margin:6px 2px}
    .cl-dup{font-size:12px;line-height:1.5;color:#7c2d12;background:#fff7ed;border-left:4px solid #f97316;border-radius:6px;padding:8px 11px;margin:0 0 10px}
    .cl-row{display:grid;grid-template-columns:minmax(0,1fr) 130px auto;gap:12px;align-items:center;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;background:#fff}
    .cl-row:hover{border-color:#f97316}
    .cl-row .nm{font-weight:800;color:#0f2148;font-size:13px}
    .cl-row .sm{font-size:11px;color:#64748b;margin-top:2px;line-height:1.45}
    .cl-row .dol{font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.4px}
    .cl-row .dol b{display:block;font-family:'IBM Plex Mono',monospace;font-size:13px;color:#0f2148;letter-spacing:0}
    .cl-row .act{display:flex;gap:6px}
    .cl-row .act button{font-size:10.5px;font-weight:800;text-transform:uppercase;background:#0f2148;color:#fff;border:none;border-radius:6px;padding:8px 11px;cursor:pointer}
    .cl-row .act button.del{background:#fff;color:#b91c1c;border:1px solid #fecaca}
    .cl-tag{display:inline-block;font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:800;border-radius:4px;padding:1px 6px;margin-right:6px;vertical-align:1px}
    .cl-tag.mock{background:#fff7ed;color:#c2410c;border:1px solid #fed7aa}
    .cl-tag.saved{background:#eef2ff;color:#1e3a8a;border:1px solid #c7d2fe}
    .cl-tag.draft{background:#fff;color:#f97316;border:1px solid #f97316}
    .cl-tag.mine{background:#ecfdf5;color:#047857;border:1px solid #a7f3d0}
    @media (max-width:640px){.cl-row{grid-template-columns:minmax(0,1fr) auto}.cl-row .dol{grid-column:1}.cl-row .act{grid-column:2;grid-row:1 / span 2}}
    .cl-side-hint{font-size:10px;color:#64748b;line-height:1.5;margin:0 0 8px}
    .cl-side-hint a{color:#fdba74;cursor:pointer;text-decoration:underline}
    `;
    document.head.appendChild(css);

    /* ---------- DOM ---------- */
    function buildUI() {
        // The search bar sits at the top of the case workspace, above the case, outside
        // #capture-area (so the view-only guard on library cases doesn't block typing in it).
        const main = $id('capture-area') && $id('capture-area').parentElement;
        if (main && !$id('cl-bar')) {
            main.insertAdjacentHTML('afterbegin', `
            <div id="cl-bar" class="no-print" role="search">
                <div class="clb-wrap">
                    <div class="clb-field" onclick="document.getElementById('cl-bar-input').focus()">
                        <span class="clb-icon" aria-hidden="true">🔍</span>
                        <input type="search" id="cl-bar-input" name="cl-bar-q" placeholder="Search cases: name, DOL, DOB, phone, claim #, plate or case ID" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-form-type="other" aria-label="Search cases" aria-controls="cl-bar-results" aria-expanded="false" aria-autocomplete="list">
                        <span class="clb-kbd" aria-hidden="true">Ctrl K</span>
                    </div>
                    <div id="cl-bar-results" class="clb-results" role="listbox" aria-label="Matching cases"></div>
                </div>
            </div>`);
            wireBar();
        }
        if (!$id('case-library-modal')) {
            document.body.insertAdjacentHTML('beforeend', `
            <div class="modal-overlay no-print" id="case-library-modal" style="z-index:2990;" role="dialog" aria-modal="true" aria-labelledby="cl-title">
                <div class="modal-box wide cl-box">
                    <h2 class="serif" id="cl-title">🔍 Case Library</h2>
                    <div class="sub mono">Saved cases and the Training Library in one place. Search it the way you would on a live call.</div>
                    <div class="cl-tabs" id="cl-tabs"></div>
                    <div id="cl-filters"></div>
                    <div id="cl-body" style="overflow-y:auto;flex:1;"></div>
                    <div class="modal-btn-row"><button class="btn-ghost" onclick="closeCaseLibrary()">Close</button></div>
                </div>
            </div>`);
        }
        paintRole();
    }
    function paintRole() {
        const on = signedIn();
        const bar = $id('cl-bar'); if (bar) bar.classList.toggle('on', on);
        if (!on) closeBar();
        // The case list export lists every trainee's cases, so it's for Admins only.
        const exp = $id('export-repo-btn'); if (exp) exp.style.display = on && isAdmin() ? '' : 'none';
        if (!on) closeCaseLibrary();
    }

    /* ---------- modal ---------- */
    window.openCaseLibrary = function (tab, query) {
        if (!signedIn()) return;
        buildUI();
        state.tab = tab === 'desk' || tab === 'intake' ? tab : 'search';
        if (typeof query === 'string') { state.q = query; state.scope = 'all'; }
        paintModal();
        $id('case-library-modal').classList.add('open');
        const input = $id('cl-search'); if (input) { input.focus(); input.select(); }
    };
    window.closeCaseLibrary = function () { const m = $id('case-library-modal'); if (m) m.classList.remove('open'); };
    window.clSetTab = function (t) { state.tab = t; paintModal(); };
    window.clSetScope = function (s) { state.scope = s; paintModal(); const i = $id('cl-search'); if (i) i.focus(); };
    window.clSearch = function (v) { state.q = v; paintResults(); };
    // Re-draws the open results when the saved-case list refreshes (app.js refreshRepoCache).
    window.renderCaseLibrary = function () {
        const m = $id('case-library-modal');
        if (m && m.classList.contains('open') && state.tab === 'search') paintResults();
        if (barOpen()) paintBar();
    };

    function paintModal() {
        const tabs = $id('cl-tabs'), filters = $id('cl-filters'), body = $id('cl-body'); if (!tabs) return;
        tabs.innerHTML = [['search', '🔍 Search cases'], ['intake', '📥 Intake folder'], ['desk', '☎ Firm directory & rules']]
            .filter(([k]) => k !== 'intake' || window.paintIntakeFolder)
            .map(([k, l]) => `<button class="${state.tab === k ? 'on' : ''}" onclick="clSetTab('${k}')">${l}</button>`).join('');
        if (state.tab === 'desk') { filters.innerHTML = ''; body.innerHTML = window.mockDeskHTML ? window.mockDeskHTML() : ''; return; }
        // The Intake folder (intake-folder.js): intake files kept apart from the case files.
        if (state.tab === 'intake' && window.paintIntakeFolder) { window.paintIntakeFolder(filters, body); return; }
        const scopes = [['all', 'All files'], ['mock', 'Training Library'], ['saved', 'Saved cases'], ['mine', `My cases (${mineCount()})`]];
        filters.innerHTML = `<input type="search" id="cl-search" class="cl-search" placeholder="Search name, DOL, DOB, phone, claim #, plate or case ID…" value="${esc(state.q)}" oninput="clSearch(this.value)" autocomplete="off" spellcheck="false" aria-label="Search cases">
            <div class="cl-chips">${scopes.map(([k, l]) => `<button class="${state.scope === k ? 'on' : ''}" onclick="clSetScope('${k}')">${esc(l)}</button>`).join('')}</div>`;
        paintResults();
    }

    function rowHTML(f) {
        const admin = isAdmin();
        const tags = f.kind === 'mock'
            ? `<span class="cl-tag mock">TRAINING LIBRARY · ${esc(f.id)}</span>`
            : `<span class="cl-tag saved">${f.ref ? esc(f.ref) : 'NO CASE ID YET'}</span>${f.draft ? '<span class="cl-tag draft">DRAFT</span>' : ''}${f.mine ? '<span class="cl-tag mine">YOUR CASE</span>' : ''}`;
        const meta = [f.dob && `DOB ${esc(f.dob)}`, f.type && esc(f.type), f.phase && esc(f.phase), f.kind === 'saved' && admin && f.by && `By ${esc(f.by)}`].filter(Boolean).join(' · ');
        const open = f.kind === 'mock' ? `caseLibraryOpen('mock','${esc(f.id)}')` : `caseLibraryOpen('saved',${Number(f.id)})`;
        return `<div class="cl-row">
            <div><div>${tags}</div><div class="nm">${esc(f.name)}</div>${meta ? `<div class="sm">${meta}</div>` : ''}</div>
            <div class="dol">Date of loss<b>${esc(f.dol || '—')}</b></div>
            <div class="act"><button onclick="${open}">Open</button>${f.kind === 'saved' && f.canEdit ? `<button class="del" onclick="deleteCase(${Number(f.id)}, event)">Delete</button>` : ''}</div>
        </div>`;
    }

    function paintResults() {
        const body = $id('cl-body'); if (!body || state.tab !== 'search') return;
        const q = state.q.trim();
        const total = allFiles().length;
        if (state.scope !== 'mine' && q.length < 2) {
            body.innerHTML = `<p class="cl-hint">Type at least 2 characters to search <b>${total}</b> files: cases saved by trainees and the Training Library mock cases. Nothing is listed until you search, just like looking up a caller.</p>
                <p class="cl-hint">Some clients have more than one file, and some names belong to different people. Check the <b>date of the accident (DOL)</b> and the <b>date of birth</b> before you open one.</p>`;
            return;
        }
        const hits = search(q, state.scope);
        if (!hits.length) {
            body.innerHTML = `<p class="cl-hint">${state.scope === 'mine' && !q ? 'You haven\'t saved any cases yet.' : 'No files match. Try the last name only, the date of the accident (MM/DD/YYYY), a phone number or a claim number.'}</p>`;
            return;
        }
        const shown = hits.slice(0, MODAL_MAX);
        body.innerHTML = sameNameWarning(hits) + shown.map(rowHTML).join('')
            + (hits.length > shown.length ? `<p class="cl-hint">Showing ${shown.length} of ${hits.length} matches. Add more to your search to narrow it down.</p>` : '');
    }

    window.caseLibraryOpen = function (kind, id) {
        if (kind === 'saved') { if (typeof loadCase === 'function') loadCase(id); return; } // loadCase closes the library
        closeCaseLibrary();
        // On a Front Desk Drill call, opening the file from here is the call's pick.
        if (window.fddOnCall && window.fddOnCall() && window.fddPick) { window.fddPick(id); return; }
        if (typeof openMockCase === 'function') openMockCase(id);
    };

    /* ---------- search bar above the case (results in a dropdown) ---------- */
    let barHits = [], barActive = -1;
    const barOpen = () => { const r = $id('cl-bar-results'); return !!(r && r.classList.contains('open')); };
    function closeBar() {
        const r = $id('cl-bar-results'), i = $id('cl-bar-input');
        if (r) r.classList.remove('open');
        if (i) i.setAttribute('aria-expanded', 'false');
    }
    function paintBar() {
        const input = $id('cl-bar-input'), box = $id('cl-bar-results'); if (!input || !box) return;
        const q = input.value.trim();
        barHits = q.length < 2 ? [] : search(q, 'all');
        const shown = barHits.slice(0, BAR_MAX);
        if (barActive >= shown.length) barActive = shown.length - 1;
        box.innerHTML = q.length < 2
            ? `<div class="clb-hint">Type a name, the date of the accident (MM/DD/YYYY), a date of birth, phone, claim #, plate or case ID. Saved cases and the Training Library are both searched.</div>`
            : !shown.length ? `<div class="clb-hint">No files match "${esc(q)}". Try the last name only, the date of the accident, a phone number or a claim number.</div>`
            : sameNameWarning(barHits) + shown.map((f, i) => {
                const tag = f.kind === 'mock' ? `<span class="cl-tag mock">TRAINING LIBRARY · ${esc(f.id)}</span>`
                    : `<span class="cl-tag saved">${f.ref ? esc(f.ref) : 'NO CASE ID YET'}</span>${f.draft ? '<span class="cl-tag draft">DRAFT</span>' : ''}${f.mine ? '<span class="cl-tag mine">YOUR CASE</span>' : ''}`;
                const meta = [f.dob && `DOB ${esc(f.dob)}`, f.type && esc(f.type), f.phase && esc(f.phase), f.kind === 'saved' && isAdmin() && f.by && `By ${esc(f.by)}`].filter(Boolean).join(' · ');
                return `<div class="clb-row ${i === barActive ? 'on' : ''}" role="option" aria-selected="${i === barActive}" data-i="${i}">
                    <div><div class="nm">${esc(f.name)} ${tag}</div>${meta ? `<div class="sm">${meta}</div>` : ''}</div>
                    <div class="dol">Date of loss<b>${esc(f.dol || '—')}</b></div></div>`;
            }).join('') + (barHits.length > shown.length ? `<div class="clb-hint">Showing ${shown.length} of ${barHits.length}. Add the date of the accident or a date of birth to narrow it down.</div>` : '');
        box.classList.add('open');
        input.setAttribute('aria-expanded', 'true');
    }
    function openBarHit(i) {
        const f = barHits[i]; if (!f) return;
        closeBar();
        $id('cl-bar-input').blur();
        caseLibraryOpen(f.kind, f.id);
    }
    function wireBar() {
        const input = $id('cl-bar-input'), box = $id('cl-bar-results');
        input.addEventListener('input', () => { barActive = -1; paintBar(); });
        input.addEventListener('focus', () => { if (signedIn()) paintBar(); });
        input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) closeBar(); }, 120));
        input.addEventListener('keydown', (e) => {
            const n = Math.min(barHits.length, BAR_MAX);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!barOpen()) { paintBar(); return; }
                if (n) { barActive = (barActive + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; paintBar(); }
                const on = box.querySelector('.clb-row.on'); if (on) on.scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (n) openBarHit(barActive >= 0 ? barActive : 0);
            } else if (e.key === 'Escape') {
                e.stopPropagation();
                if (barOpen()) closeBar(); else { input.value = ''; input.blur(); }
            }
        });
        // Keep focus in the input while clicking the list, so its blur doesn't close the list first.
        box.addEventListener('mousedown', (e) => e.preventDefault());
        box.addEventListener('click', (e) => {
            const row = e.target.closest('.clb-row');
            if (row) openBarHit(Number(row.dataset.i));
        });
    }
    // Focuses the search bar (Ctrl/Cmd+K, and trainees' ways into the Training Library).
    window.focusCaseSearch = function () {
        if (!signedIn()) return;
        buildUI();
        const input = $id('cl-bar-input');
        if (!input || !input.offsetParent) { openCaseLibrary(); return; } // bar not on screen (e.g. another page is open)
        input.focus(); input.select();
        paintBar();
    };

    /* ---------- sidebar (app.js renderRepo calls this once access is checked) ---------- */
    window.renderCaseLibrarySidebar = function () {
        const list = $id('repo-list'), note = $id('repo-count-note'); if (!list) return;
        const n = mineCount();
        list.innerHTML = `<p class="cl-side-hint">Find any case (saved cases and the Training Library, ${allFiles().length} files) with the 🔍 search bar above the case. Nothing is listed until you search.${n ? ` <a onclick="openCaseLibrary('search'); clSetScope('mine')">My cases (${n})</a>` : ''}</p>`;
        if (note) note.innerHTML = '';
    };

    /* ---------- wiring ---------- */
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && String(e.key).toLowerCase() === 'k' && signedIn()) { e.preventDefault(); focusCaseSearch(); }
        else if (e.key === 'Escape') closeCaseLibrary();
    });
    const origApply = window.applySessionUI;
    if (typeof origApply === 'function') {
        window.applySessionUI = function () {
            const r = origApply.apply(this, arguments);
            buildUI();
            return r;
        };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI); else buildUI();
})();
