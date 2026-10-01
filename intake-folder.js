/* =========================================================
   LSH CMS — INTAKE FOLDER
   ---------------------------------------------------------
   A separate folder in the Case Repository for intake files
   (Case Library → 📥 Intake folder, or the sidebar button, or
   ?intake=1). Two kinds of file:
     - Typed intakes: 📝 New intake opens the intake form (the
       sidebar's 📝 New Intake, intake-form.js): saving it grades it
       and creates the new case. Typed intakes saved here earlier
       open in Intake mode (the orange bar above the case): Save
       Case, Archive and autosave all save the intake while the bar
       is showing, and 📂 Move to case files turns it into a case.
     - Intake documents: ⬆ Upload a PDF or image of an intake.
   Each save or upload is checked against the intake checklist
   (functions/_intake.js) and then reviewed automatically by
   Claude (functions/_intake-review.js): score, summary, what's
   missing, red flags, follow-up questions. Trainees see their
   own files; Admins see everyone's.
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t) => { if (typeof showToast === 'function') showToast(m, t || 'info'); };
    const session = () => (typeof getSession === 'function' ? getSession() : null);
    const isAdmin = () => { const s = session(); return !!(s && s.userType === 'Admin'); };
    const signedIn = () => typeof hasAuthorizedAccess === 'function' && hasAuthorizedAccess();
    const API = '/api/intake-files';
    const MODE_KEY = 'LSH_INTAKE_MODE_V1';
    const UPLOAD_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    const MAX_UPLOAD = 2 * 1024 * 1024;   // /api/upload's limit

    // The folder: files (null until loaded), the filter chip, search, the file shown open.
    const F = { files: null, error: '', filter: 'all', q: '', open: null, pending: null, reviewing: new Set(), reviewConfigured: true, busy: false };
    // Intake mode in the editor: { id: saved intake id or null, file: last saved summary }.
    let editing = null;

    async function api(url, opts) {
        let res, data = {};
        try { res = await fetch(url, Object.assign({ credentials: 'include' }, opts || {})); } catch (e) { throw new Error('Network error. Check your connection and try again.'); }
        try { data = await res.json(); } catch (e) { data = {}; }
        if (!res.ok || data.success === false) throw new Error(data.error || `Request failed (${res.status}).`);
        return data;
    }
    const post = (body) => api(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    function ago(ts) {
        const ms = Date.parse(String(ts || '').replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(ts || '') ? '' : 'Z'));
        if (!ms) return '';
        const m = Math.round((Date.now() - ms) / 60000);
        return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
    }
    const scoreClass = (n) => n == null ? 'na' : n >= 85 ? 'good' : n >= 60 ? 'mid' : 'bad';
    const fileSize = (b) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
    const kindLabel = (f) => f.kind === 'form' ? '📝 Typed intake' : `📄 ${f.docMime === 'application/pdf' ? 'PDF' : f.docMime.startsWith('image/') ? 'Image' : 'Document'}`;
    const needsAttention = (f) => f.fails > 0 || f.aiStatus === 'failed' || f.aiStatus === 'stalled' || !!(f.review && f.review.redFlags && f.review.redFlags.length);

    /* ---------- styles ---------- */
    const css = document.createElement('style');
    css.textContent = `
    #intake-bar{display:none;flex-shrink:0;align-items:center;gap:10px;flex-wrap:wrap;background:#fff7ed;border:2px solid #f97316;border-radius:10px;padding:9px 14px;margin:12px 32px 0;position:relative;z-index:5}
    body.intake-mode #intake-bar{display:flex}
    #intake-bar .ib-tag{font-family:'IBM Plex Mono',monospace;font-weight:900;font-size:11px;color:#fff;background:#f97316;border-radius:6px;padding:4px 9px;letter-spacing:.5px}
    #intake-bar .ib-state{flex:1;min-width:180px;font-size:12px;color:#7c2d12;line-height:1.4}
    #intake-bar button{font-size:10.5px;font-weight:800;text-transform:uppercase;border-radius:7px;padding:7px 11px;cursor:pointer;border:1px solid #fdba74;background:#fff;color:#9a3412}
    #intake-bar button.primary{background:#f97316;border-color:#f97316;color:#fff}
    #intake-bar button:hover{filter:brightness(.96)}
    #intake-bar button[disabled]{opacity:.6;cursor:wait}
    .if-open-btn{width:100%;border:1px solid #f97316;color:#fdba74;background:rgba(249,115,22,.08);padding:8px 0;border-radius:8px;font-size:10px;font-weight:800;text-transform:uppercase;cursor:pointer;margin:0 0 24px}
    .if-open-btn:hover{background:#f97316;color:#fff}
    .if-top{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 10px}
    .if-top button{font-size:11px;font-weight:800;text-transform:uppercase;border-radius:8px;padding:9px 13px;cursor:pointer;border:1px solid #0f2148;background:#0f2148;color:#fff}
    .if-top button.alt{background:#fff;color:#0f2148}
    .if-note{font-size:12px;color:#64748b;line-height:1.5;margin:4px 2px 10px}
    .if-up{border:1px dashed #f97316;background:#fffaf5;border-radius:10px;padding:12px;margin:0 0 12px}
    .if-up .fn{font-weight:800;color:#0f2148;font-size:13px;margin-bottom:8px;word-break:break-all}
    .if-up .grid{display:grid;grid-template-columns:1fr 170px;gap:8px}
    .if-up input{border:1px solid #cbd5e1;border-radius:7px;padding:8px 10px;font-size:13px;width:100%;box-sizing:border-box;font-family:inherit}
    .if-up .row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
    .if-up .row button{font-size:11px;font-weight:800;text-transform:uppercase;border-radius:7px;padding:8px 12px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#0f2148}
    .if-up .row button.go{background:#f97316;border-color:#f97316;color:#fff}
    .if-row{border:1px solid #e2e8f0;border-radius:10px;margin-bottom:8px;background:#fff}
    .if-row.open{border-color:#f97316;box-shadow:0 2px 10px rgba(15,33,72,.08)}
    .if-head{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:center;padding:10px 12px;cursor:pointer}
    .if-head:hover{background:#fffaf5;border-radius:10px}
    .if-head .k{font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.4px}
    .if-head .nm{font-weight:800;color:#0f2148;font-size:13.5px;margin-top:2px}
    .if-head .sm{font-size:11px;color:#64748b;margin-top:2px;line-height:1.45}
    .if-badges{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
    .if-score{font-family:'IBM Plex Mono',monospace;font-weight:900;font-size:13px;border-radius:6px;padding:2px 8px}
    .if-score.good{background:#dcfce7;color:#166534}.if-score.mid{background:#fef3c7;color:#92400e}.if-score.bad{background:#fee2e2;color:#991b1b}.if-score.na{background:#f1f5f9;color:#64748b}
    .if-ai{font-size:10.5px;font-weight:800;color:#475569;white-space:nowrap}
    .if-ai.ok{color:#166534}.if-ai.warn{color:#b45309}.if-ai.run{color:#1d4ed8}
    .if-head .act{display:flex;gap:6px}
    .if-head .act button,.if-head .act a.btn{font-size:10.5px;font-weight:800;text-transform:uppercase;background:#0f2148;color:#fff;border:none;border-radius:6px;padding:8px 11px;cursor:pointer;text-decoration:none}
    .if-head .act button.del{background:#fff;color:#b91c1c;border:1px solid #fecaca}
    .if-detail{border-top:1px solid #f1f5f9;padding:12px 14px 14px;display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .if-detail h5{margin:0 0 8px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
    .if-find{display:flex;gap:7px;align-items:flex-start;font-size:12px;line-height:1.4;margin-bottom:5px;color:#334155}
    .if-find i{flex-shrink:0;width:16px;height:16px;border-radius:99px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:#fff;font-style:normal;margin-top:1px}
    .if-find i.pass{background:#16a34a}.if-find i.warning{background:#f59e0b}.if-find i.fail{background:#dc2626}
    .if-find b{font-weight:800;color:#0f172a}
    .if-rv p{font-size:12.5px;color:#334155;line-height:1.5;margin:0 0 8px}
    .if-rv .stars{color:#f59e0b;letter-spacing:1px;font-size:14px}
    .if-rv h6{margin:10px 0 4px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8}
    .if-rv ul{margin:0;padding-left:18px;font-size:12px;line-height:1.45;color:#334155}
    .if-rv ul li{margin-bottom:3px}
    .if-rv ul.red li{color:#991b1b}.if-rv ul.miss li{color:#92400e}.if-rv ul.good li{color:#166534}
    .if-rv .muted{font-size:12px;color:#64748b;font-style:italic}
    .if-dacts{grid-column:1 / -1;display:flex;gap:8px;flex-wrap:wrap;border-top:1px dashed #e2e8f0;padding-top:10px}
    .if-dacts button,.if-dacts a{font-size:10.5px;font-weight:800;text-transform:uppercase;border-radius:7px;padding:7px 11px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#0f2148;text-decoration:none}
    .if-dacts .go{background:#f97316;border-color:#f97316;color:#fff}
    @media (max-width:720px){.if-detail{grid-template-columns:1fr}.if-head{grid-template-columns:minmax(0,1fr) auto}.if-head .act{grid-column:1 / -1}.if-up .grid{grid-template-columns:1fr}#intake-bar{margin:0 12px}}
    `;
    document.head.appendChild(css);

    /* ---------- page pieces ---------- */
    function buildUI() {
        const main = $id('capture-area') && $id('capture-area').parentElement;
        if (main && !$id('intake-bar')) {
            $id('capture-area').insertAdjacentHTML('beforebegin', `
            <div id="intake-bar" class="no-print" role="region" aria-label="Intake file">
                <span class="ib-tag">📥 INTAKE FILE</span>
                <span class="ib-state" id="ib-state"></span>
                <button class="primary" data-ib="save">💾 Save to Intake folder</button>
                <button data-ib="review">📋 Checklist &amp; review</button>
                <button data-ib="move">📂 Move to case files</button>
                <button data-ib="close">✕ Close intake</button>
            </div>`);
            $id('intake-bar').addEventListener('click', (e) => {
                const b = e.target.closest('[data-ib]');
                if (!b) return;
                const a = b.dataset.ib;
                if (a === 'save') saveIntake();
                else if (a === 'review') { if (editing && editing.id) openIntakeFolder(editing.id); else toast('Save the intake first; the checklist and review run on every save.', 'info'); }
                else if (a === 'move') moveToCases();
                else if (a === 'close') closeIntake();
            });
        }
        const lib = document.querySelector('#sidebar-actions button[onclick="openCaseLibrary()"]');
        if (lib && !$id('intake-open-btn')) {
            lib.insertAdjacentHTML('afterend', '<button id="intake-open-btn" class="if-open-btn" onclick="openIntakeFolder()">📥 Intake Folder</button>');
            lib.classList.remove('mb-6'); lib.classList.add('mb-2');
        }
        const modal = $id('case-library-modal');
        if (modal && !modal.dataset.intakeWired) {
            modal.dataset.intakeWired = '1';
            modal.addEventListener('click', onFolderClick);
            modal.addEventListener('input', (e) => { if (e.target.id === 'if-q') { F.q = e.target.value; paintList(); } });
            modal.addEventListener('change', (e) => { if (e.target.id === 'if-file') pickFile(e.target); });
            modal.addEventListener('keydown', (e) => {
                const h = e.target.closest && e.target.closest('.if-head');
                if (h && e.target === h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); h.click(); }
            });
        }
    }

    /* ---------- the folder (a tab of the Case Library window) ---------- */
    window.openIntakeFolder = function (openId) {
        if (!signedIn() || typeof openCaseLibrary !== 'function') return;
        if (openId) F.open = openId;
        openCaseLibrary('intake');
    };
    // case-library.js calls this to draw the tab.
    window.paintIntakeFolder = function (filters, body) {
        buildUI();
        const admin = isAdmin();
        const files = F.files || [];
        const count = (fn) => files.filter(fn).length;
        const chips = [['all', `All (${files.length})`], ['form', `Typed (${count(f => f.kind === 'form')})`],
            ['document', `Documents (${count(f => f.kind === 'document')})`], ['attention', `Needs attention (${count(needsAttention)})`]];
        filters.innerHTML = `
            <div class="if-top">
                <button data-if="new">📝 New intake</button>
                <button class="alt" data-if="upload">⬆ Upload intake document</button>
                <input type="file" id="if-file" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,application/pdf,image/png,image/jpeg,image/gif,image/webp" hidden>
            </div>
            <p class="if-note">${admin
                ? 'Every trainee\'s intake files. Each one is checked against the intake checklist and reviewed automatically when it\'s saved or uploaded.'
                : 'Your intake files, kept apart from the case files. Each one is checked against the intake checklist and reviewed automatically when you save or upload it.'}
                ${F.reviewConfigured ? '' : ' <b>The automatic review isn\'t set up yet</b>, so only the checklist runs.'}</p>
            <input type="search" id="if-q" class="cl-search" placeholder="Search client name, file name${admin ? ', trainee' : ''}…" value="${esc(F.q)}" autocomplete="off" spellcheck="false">
            <div class="cl-chips">${chips.map(([k, l]) => `<button class="${F.filter === k ? 'on' : ''}" data-if="filter" data-v="${k}">${esc(l)}</button>`).join('')}</div>`;
        body.innerHTML = '<div id="if-upform"></div><div id="if-list"></div>';
        paintUpload();
        paintList();
        if (F.files === null) loadFiles();
    };
    const folderShowing = () => {
        const m = $id('case-library-modal');
        return !!(m && m.classList.contains('open') && $id('if-list'));
    };
    function repaint() {
        if (!folderShowing()) return;
        window.paintIntakeFolder($id('cl-filters'), $id('cl-body'));
    }
    async function loadFiles() {
        try {
            const r = await api(API);
            // A trainer's Trainee view (app.js) shows only their own files, as a trainee sees it.
            const tv = !!(session() && session().traineeView);
            F.files = (r.files || []).filter(f => !tv || f.mine); F.reviewConfigured = r.reviewConfigured !== false; F.error = '';
        } catch (e) { F.error = e.message; if (F.files === null) F.files = []; }
        repaint();
        schedulePoll();
    }
    // A review running from another tab or page: check back until it's done.
    let pollTimer = null;
    function schedulePoll() {
        clearTimeout(pollTimer);
        if ((F.files || []).some(f => f.aiStatus === 'pending' && !F.reviewing.has(f.id))) pollTimer = setTimeout(() => { if (folderShowing()) loadFiles(); }, 6000);
    }
    function upsert(file) {
        if (!F.files) F.files = [];
        const i = F.files.findIndex(f => f.id === file.id);
        if (i >= 0) F.files[i] = Object.assign(F.files[i], file); else F.files.unshift(file);
    }

    function visibleFiles() {
        const q = F.q.trim().toLowerCase();
        return (F.files || []).filter(f => {
            if (F.filter === 'form' && f.kind !== 'form') return false;
            if (F.filter === 'document' && f.kind !== 'document') return false;
            if (F.filter === 'attention' && !needsAttention(f)) return false;
            return !q || [f.clientName, f.docName, f.ownerName, f.ownerBatchId, f.dateOfLoss, f.note].join(' ').toLowerCase().includes(q);
        });
    }
    function aiBadge(f) {
        if (F.reviewing.has(f.id) || f.aiStatus === 'pending') return '<span class="if-ai run">⏳ Reviewing…</span>';
        if (f.aiStatus === 'complete' && f.review) return `<span class="if-ai ok">✓ Review ${f.review.score}/5${f.stale ? ' · changed since' : ''}</span>`;
        if (f.aiStatus === 'stalled') return '<span class="if-ai warn">⚠ Review didn\'t finish</span>';
        if (f.aiStatus === 'failed') return '<span class="if-ai warn">⚠ Review failed</span>';
        if (f.aiStatus === 'skipped') return '<span class="if-ai warn">Not reviewable</span>';
        if (f.aiStatus === 'not-configured') return '<span class="if-ai">Checklist only</span>';
        return '<span class="if-ai">Not reviewed yet</span>';
    }
    function paintList() {
        const el = $id('if-list');
        if (!el) return;
        if (F.files === null) { el.innerHTML = '<p class="cl-hint">Loading the Intake folder…</p>'; return; }
        const list = visibleFiles();
        const err = F.error ? `<p class="cl-hint" style="color:#b91c1c">${esc(F.error)}</p>` : '';
        if (!list.length) {
            el.innerHTML = err + `<p class="cl-hint">${(F.files || []).length
                ? 'No intake files match.'
                : (isAdmin() ? 'No trainee has saved an intake file yet.' : 'Nothing here yet. Use <b>📝 New intake</b> to fill in an intake form (saving it creates the new case), or <b>⬆ Upload intake document</b> to add a PDF or image of an intake sheet.')}</p>`;
            return;
        }
        el.innerHTML = err + list.map(rowHTML).join('');
    }
    function rowHTML(f) {
        const admin = isAdmin(), open = F.open === f.id;
        const meta = [
            f.dateOfLoss && `DOL ${esc(f.dateOfLoss)}`,
            f.kind === 'document' && f.docName && `${esc(f.docName)} · ${fileSize(f.docSize)}`,
            `saved ${esc(ago(f.updatedAt))}`,
            admin && `by ${esc(f.ownerName)}${f.ownerBatchId ? ' · ' + esc(f.ownerBatchId) : ''}`,
            f.movedCaseId && '📂 moved to the case files',
        ].filter(Boolean).join(' · ');
        return `<div class="if-row${open ? ' open' : ''}" data-row="${f.id}">
            <div class="if-head" data-if="toggle" data-id="${f.id}" role="button" tabindex="0" aria-expanded="${open}">
                <div><div class="k">${kindLabel(f)}</div><div class="nm">${esc(f.clientName || '(no client name)')}</div><div class="sm">${meta}</div></div>
                <div class="if-badges"><span class="if-score ${scoreClass(f.checkScore)}" title="Intake checklist">${f.checkScore == null ? '—' : f.checkScore + '%'}</span>${aiBadge(f)}</div>
                <div class="act">${f.kind === 'form'
                    ? `<button data-if="edit" data-id="${f.id}">Open</button>`
                    : `<a class="btn" href="${esc(f.docUrl)}" target="_blank" rel="noopener">Open</a>`}
                    <button class="del" data-if="delete" data-id="${f.id}">Delete</button></div>
            </div>
            ${open ? detailHTML(f) : ''}
        </div>`;
    }
    function detailHTML(f) {
        const order = { fail: 0, warning: 1, pass: 2 };
        const findings = (f.findings || []).slice().sort((a, b) => order[a.status] - order[b.status]);
        const icon = { pass: '✓', warning: '!', fail: '✕' };
        const checklist = findings.length
            ? findings.map(x => `<div class="if-find"><i class="${x.status}">${icon[x.status]}</i><div><b>${esc(x.label)}</b>${x.essential ? '' : ' <span style="color:#94a3b8">(recommended)</span>'}: ${esc(x.message)}</div></div>`).join('')
            : '<p class="muted">No checklist yet.</p>';
        const r = f.review;
        const list = (title, items, cls) => items && items.length ? `<h6>${title}</h6><ul class="${cls || ''}">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
        let review;
        if (F.reviewing.has(f.id) || f.aiStatus === 'pending') review = '<p class="muted">⏳ Claude is reviewing this intake. It usually takes under a minute.</p>';
        else if (f.aiStatus === 'complete' && r) {
            review = `<p><span class="stars">${'★'.repeat(r.score)}${'☆'.repeat(5 - r.score)}</span> <b>${r.score}/5</b>${f.aiReviewedAt ? ` <span style="color:#94a3b8;font-size:11px">· ${esc(ago(f.aiReviewedAt))}</span>` : ''}</p>
                ${f.stale ? '<p class="muted">The intake changed after this review. Review again to update it.</p>' : ''}
                <p>${esc(r.summary)}</p>
                ${list('Red flags', r.redFlags, 'red')}${list('Missing', r.missing, 'miss')}${list('Ask the client next', r.followUps)}
                ${list('Done well', r.strengths, 'good')}${list('To improve', r.concerns)}`;
        } else if (f.review && f.review.reason) review = `<p class="muted">${esc(f.review.reason)}</p>`;
        else if (f.aiStatus === 'stalled') review = '<p class="muted">The review didn\'t finish (the page may have been closed). Run it again.</p>';
        else review = '<p class="muted">Not reviewed yet.</p>';
        const canReview = f.aiStatus !== 'skipped' && !F.reviewing.has(f.id) && f.aiStatus !== 'pending';
        return `<div class="if-detail">
            <div><h5>Intake checklist · ${f.checkScore == null ? 'after the review' : f.checkScore + '%'}</h5>${checklist}</div>
            <div class="if-rv"><h5>Automatic review</h5>${review}</div>
            <div class="if-dacts">
                ${canReview && F.reviewConfigured ? `<button data-if="review" data-id="${f.id}">↻ Review again</button>` : ''}
                ${f.kind === 'form' ? `<button class="go" data-if="edit" data-id="${f.id}">✎ Open in the editor</button>` : `<a href="${esc(f.docUrl)}" target="_blank" rel="noopener">Open the document ↗</a>`}
                ${f.note ? `<span class="if-note" style="margin:0;align-self:center">Note: ${esc(f.note)}</span>` : ''}
            </div>
        </div>`;
    }

    function onFolderClick(e) {
        const t = e.target.closest('[data-if]');
        if (!t) return;
        const a = t.dataset.if, id = +t.dataset.id;
        if (a === 'filter') { F.filter = t.dataset.v; repaint(); }
        else if (a === 'new') { if (typeof window.openNewIntake === 'function') { if (window.closeCaseLibrary) closeCaseLibrary(); window.openNewIntake(); } else startIntake(); }
        else if (a === 'upload') { const input = $id('if-file'); if (input) { input.value = ''; input.click(); } }
        else if (a === 'toggle') { if (e.target.closest('.act')) return; F.open = F.open === id ? null : id; paintList(); }
        else if (a === 'edit') { e.stopPropagation(); openIntake(id); }
        else if (a === 'delete') { e.stopPropagation(); deleteFile(id); }
        else if (a === 'review') runReview(id);
        else if (a === 'upcancel') { F.pending = null; paintUpload(); }
        else if (a === 'upgo') uploadPending();
    }

    /* ---------- uploads ---------- */
    function pickFile(input) {
        const file = input.files && input.files[0];
        if (!file) return;
        if (!UPLOAD_TYPES.includes(file.type)) { toast('Upload a PDF or an image (PNG, JPG, GIF, WEBP). Save Word files as PDF first.', 'error'); return; }
        if (file.size > MAX_UPLOAD) { toast('That file is larger than 2 MB. Compress it or save a smaller PDF.', 'error'); return; }
        F.pending = file;
        paintUpload();
        const n = $id('if-up-name'); if (n) n.focus();
    }
    function paintUpload() {
        const el = $id('if-upform');
        if (!el) return;
        if (!F.pending) { el.innerHTML = ''; return; }
        const f = F.pending;
        el.innerHTML = `<div class="if-up">
            <div class="fn">📄 ${esc(f.name)} · ${fileSize(f.size)}</div>
            <div class="grid"><input id="if-up-name" placeholder="Client name" maxlength="200" autocomplete="off"><input id="if-up-dol" placeholder="Date of loss (MM/DD/YYYY)" maxlength="10" autocomplete="off"></div>
            <input id="if-up-note" placeholder="Note for the reviewer (optional)" maxlength="1000" autocomplete="off" style="margin-top:8px">
            <div class="row"><button class="go" data-if="upgo"${F.busy ? ' disabled' : ''}>${F.busy ? 'Uploading…' : '⬆ Upload and review'}</button><button data-if="upcancel"${F.busy ? ' disabled' : ''}>Cancel</button></div>
        </div>`;
    }
    async function uploadPending() {
        const file = F.pending;
        if (!file || F.busy) return;
        const clientName = ($id('if-up-name') || {}).value || '', dateOfLoss = ($id('if-up-dol') || {}).value || '', note = ($id('if-up-note') || {}).value || '';
        F.busy = true; paintUpload();
        try {
            const form = new FormData();
            form.append('file', file, file.name);
            const up = await api('/api/upload', { method: 'POST', body: form });
            const r = await post({ action: 'document', key: up.key, filename: file.name, mime: file.type, size: file.size, clientName, dateOfLoss, note });
            F.pending = null; F.busy = false;
            upsert(r.file); F.open = r.file.id; F.filter = 'all';
            repaint();
            toast('Uploaded to the Intake folder.', 'success');
            if (r.needsReview) runReview(r.file.id);
        } catch (e) {
            F.busy = false; paintUpload();
            toast(e.message, 'error');
        }
    }

    /* ---------- the automatic review ---------- */
    async function runReview(id) {
        if (F.reviewing.has(id)) return;
        F.reviewing.add(id);
        const f = (F.files || []).find(x => x.id === id); if (f) f.aiStatus = 'pending';
        paintList(); paintBar();
        try {
            const r = await post({ action: 'review', id });
            upsert(r.file);
            const rv = r.file.review;
            if (r.file.aiStatus === 'complete') toast(`Review ready for ${r.file.clientName || 'the intake'}: ${rv.score}/5, checklist ${r.file.checkScore}%.`, 'success');
            else if (rv && rv.reason) toast(rv.reason, r.file.aiStatus === 'not-configured' ? 'info' : 'error');
            if (r.file.aiStatus === 'not-configured') F.reviewConfigured = false;
        } catch (e) {
            const g = (F.files || []).find(x => x.id === id); if (g) g.aiStatus = 'failed';
            toast(`The review didn't run: ${e.message}`, 'error');
        }
        F.reviewing.delete(id);
        if (editing && editing.id === id) { editing.file = (F.files || []).find(x => x.id === id) || editing.file; paintBar(); }
        repaint();
    }

    async function deleteFile(id) {
        const f = (F.files || []).find(x => x.id === id);
        if (!f || !confirm(`Delete this intake file${f.clientName ? ` (${f.clientName})` : ''}? This can't be undone.`)) return;
        try {
            await api(`${API}?id=${id}`, { method: 'DELETE' });
            F.files = F.files.filter(x => x.id !== id);
            if (editing && editing.id === id) { editing.id = null; editing.file = null; saveMode(); paintBar(); }
            repaint();
            toast('Intake file deleted.', 'info');
        } catch (e) { toast(e.message, 'error'); }
    }

    /* ---------- Intake mode in the case editor ---------- */
    function saveMode() {
        try { if (editing) sessionStorage.setItem(MODE_KEY, JSON.stringify({ id: editing.id })); else sessionStorage.removeItem(MODE_KEY); } catch (e) { /* private mode */ }
    }
    function paintBar() {
        buildUI();
        document.body.classList.toggle('intake-mode', !!editing);
        const st = $id('ib-state');
        if (!st || !editing) return;
        const f = editing.file;
        if (!editing.id) st.innerHTML = '<b>New intake</b> · not saved yet. It will be filed in the Intake folder, not with the cases.';
        else {
            const rv = F.reviewing.has(editing.id) ? '⏳ reviewing…' : f && f.aiStatus === 'complete' && f.review ? `review ${f.review.score}/5` : f && f.aiStatus === 'not-configured' ? 'checklist only' : 'not reviewed yet';
            st.innerHTML = `<b>Intake file #${editing.id}</b> · checklist ${f && f.checkScore != null ? f.checkScore + '%' : '—'} · ${rv}${f && f.fails ? ` · <b>${f.fails} essential${f.fails === 1 ? '' : 's'} missing</b>` : ''}`;
        }
    }
    function blankEditor() {
        blankCaseEditorContent();
        clearPersistedEditorState();
        currentCaseId = null; currentCaseIsDraft = false; currentCaseCanEdit = true;
        revertOther('main-case-type', 'main-case-other', 'main-revert');
        updatePhaseDisplay('INTAKE');
        const ps = $id('phase-selector'); if (ps) ps.value = 'Intake';
        generateCaseId();
        showTab('profile');
    }
    function leaveLibraryCase() {
        if (window.mockFlushUpdates) window.mockFlushUpdates();
        if (window.mockReset) window.mockReset();
    }
    function enter(id, file) {
        editing = { id: id || null, file: file || null };
        saveMode(); paintBar();
        persistCurrentEditorState();
    }
    // A blank editor in Intake mode, without asking (the smoke test uses it to test Intake mode). False when
    // an Admin keeps unsaved changes to a library case.
    window.intakeFolderBegin = function () {
        if (window.mockConfirmLeave && !window.mockConfirmLeave()) return false;
        leaveLibraryCase();
        blankEditor();
        enter(null, null);
        if (window.closeCaseLibrary) closeCaseLibrary();
        return true;
    };
    function startIntake() {
        if (hasCaseContent() && !confirm('Start a new intake? What\'s in the case editor now will be cleared. Save it first if you need it.')) return;
        leaveLibraryCase();
        blankEditor();
        enter(null, null);
        if (window.closeCaseLibrary) closeCaseLibrary();
        const n = $id('client-name-field'); if (n) n.focus();
        toast('New intake: fill in the client\'s details, then 💾 Save to Intake folder.', 'info');
    }
    async function openIntake(id) {
        try {
            const r = await api(`${API}?id=${id}`);
            if (!r.file.content) { toast('This intake has no content to open.', 'error'); return; }
            if (hasCaseContent() && !(editing && editing.id === id) && !confirm('Open this intake in the case editor? What\'s in the editor now will be replaced. Save it first if you need it.')) return;
            leaveLibraryCase();
            blankEditor();
            applyCaseContentToDOM(r.file.content, document);
            currentCaseId = null; currentCaseIsDraft = false; currentCaseCanEdit = true;
            generateCaseId();
            if (typeof updateTotals === 'function') updateTotals();
            if (typeof toggleOwnerExtra === 'function') toggleOwnerExtra();
            if (typeof toggleDriverInsuredExtra === 'function') toggleDriverInsuredExtra();
            showTab('profile');
            upsert(r.file);
            enter(id, r.file);
            if (window.closeCaseLibrary) closeCaseLibrary();
        } catch (e) { toast(e.message, 'error'); }
    }
    const clientNameNow = () => (($id('client-name-field') || {}).innerText || '').split('\n')[0].trim();
    // quiet: autosave (no review, no messages); returns true when saved.
    async function saveIntake(opts) {
        opts = opts || {};
        const ed = editing;   // the intake this save belongs to, even if the editor moves on meanwhile
        if (!ed) return false;
        const clientName = clientNameNow();
        if (!clientName) { if (!opts.quiet) toast('Enter the client\'s name first.', 'error'); return false; }
        const btn = document.querySelector('#intake-bar [data-ib="save"]');
        if (btn && !opts.quiet) { btn.disabled = true; btn.textContent = 'Saving…'; }
        try {
            const r = await post({ action: 'save', id: ed.id, content: buildCaseContentPayload(), clientName });
            ed.id = r.file.id; ed.file = r.file;
            upsert(r.file);
            if (editing === ed) { saveMode(); paintBar(); persistCurrentEditorState(); }
            if (!opts.quiet) {
                toast(`Saved to the Intake folder. Checklist ${r.file.checkScore}%${r.file.fails ? `, ${r.file.fails} essential${r.file.fails === 1 ? '' : 's'} missing` : ''}.`, r.file.fails ? 'info' : 'success');
                if (r.needsReview && F.reviewConfigured) runReview(r.file.id);
            }
            repaint();
            return true;
        } catch (e) {
            if (!opts.quiet) toast(`Couldn't save the intake: ${e.message}`, 'error');
            return false;
        } finally {
            if (btn && !opts.quiet) { btn.disabled = false; btn.textContent = '💾 Save to Intake folder'; }
        }
    }
    function exitMode() { editing = null; saveMode(); paintBar(); }
    function closeIntake() {
        if (hasCaseContent() && !confirm('Close this intake? Changes since the last save are lost. The saved intake stays in the Intake folder.')) return;
        exitMode();
        blankEditor();
        if (typeof renderRepo === 'function') renderRepo();
    }
    // An accepted intake becomes a regular case: save it to the case files (assigns a Case ID)
    // and note on the intake file which case it became.
    async function moveToCases() {
        const id = editing && editing.id;
        if (!clientNameNow()) { toast('Enter the client\'s name first.', 'error'); return; }
        if (!confirm('Move this intake to the case files? It is saved as a case with a Case ID, and the intake file stays in the Intake folder, marked as moved.')) return;
        if (id) await saveIntake({ quiet: true });
        exitMode();
        await orig.saveCase();
        if (currentCaseId === null) { enter(id, editing ? editing.file : null); return; }   // the case save failed: stay in Intake mode
        if (id) {
            try { const r = await post({ action: 'moved', id, caseRepositoryId: currentCaseId }); upsert(r.file); }
            catch (e) { toast(`The case was saved, but the intake file couldn't be marked as moved: ${e.message}`, 'error'); }
        }
    }

    // While the bar shows, the editor's own save paths save the intake instead of a case.
    const orig = {};
    ['saveCase', 'archiveCaseAsDraft', 'updateCase', 'autoSaveProgress', 'newCase', 'loadCase', 'openMockCase', 'startNewCaseFromInactivityPrompt']
        .forEach(n => { orig[n] = window[n]; });
    const wrap = (name, fn) => { if (typeof orig[name] === 'function') window[name] = fn; };
    wrap('saveCase', function () { return editing ? saveIntake() : orig.saveCase.apply(this, arguments); });
    wrap('archiveCaseAsDraft', function () { return editing ? saveIntake() : orig.archiveCaseAsDraft.apply(this, arguments); });
    wrap('updateCase', function () { return editing ? saveIntake() : orig.updateCase.apply(this, arguments); });
    // Autosave (every minute, on inactivity, on leaving the page) saves the intake quietly and never makes a case draft.
    wrap('autoSaveProgress', function () { return editing ? (hasCaseContent() ? saveIntake({ quiet: true }) : Promise.resolve(false)) : orig.autoSaveProgress.apply(this, arguments); });
    wrap('newCase', function () {
        if (editing) {
            if (hasCaseContent() && !confirm('Leave this intake and start a new case? Changes since the last save are lost. The saved intake stays in the Intake folder.')) return;
            exitMode(); blankEditor();
            return;
        }
        return orig.newCase.apply(this, arguments);
    });
    wrap('startNewCaseFromInactivityPrompt', async function () {
        if (editing) { if (hasCaseContent()) await saveIntake({ quiet: true }); exitMode(); }
        return orig.startNewCaseFromInactivityPrompt.apply(this, arguments);
    });
    // Opening another case leaves Intake mode; the intake is saved quietly first so nothing is lost.
    const leaveQuietly = () => { if (!editing) return; if (hasCaseContent()) saveIntake({ quiet: true }); exitMode(); };
    wrap('loadCase', function () { leaveQuietly(); return orig.loadCase.apply(this, arguments); });
    wrap('openMockCase', function () { leaveQuietly(); return orig.openMockCase.apply(this, arguments); });

    window.intakeFolderState = () => ({ editing, files: F.files });   // for the smoke test and debugging

    // Signed out: leave Intake mode and forget the folder. Signed in: bring Intake mode back after a
    // refresh (the editor's content is restored by app.js), and ?intake=1 opens the folder.
    const origApply = window.applySessionUI;
    if (typeof origApply === 'function') {
        window.applySessionUI = function () {
            const r = origApply.apply(this, arguments);
            buildUI();
            if (!signedIn()) {
                editing = null; document.body.classList.remove('intake-mode');
                F.files = null; F.open = null; F.pending = null;
            } else {
                if (!editing) {
                    let saved = null;
                    try { saved = JSON.parse(sessionStorage.getItem(MODE_KEY) || 'null'); } catch (e) { saved = null; }
                    if (saved) {
                        editing = { id: saved.id || null, file: null }; paintBar();
                        if (editing.id) api(`${API}?id=${editing.id}`).then(r => { if (editing && editing.id === r.file.id) { editing.file = r.file; paintBar(); } }).catch(() => {});
                    }
                }
                if (new URLSearchParams(location.search).get('intake') && !window.__intakeOpened) { window.__intakeOpened = true; setTimeout(() => window.openIntakeFolder(), 80); }
            }
            return r;
        };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI); else buildUI();
})();
