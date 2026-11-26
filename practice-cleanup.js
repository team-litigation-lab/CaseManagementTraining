/* =========================================================
   LSH CaseWorX — 🧹 PRACTICE CLEANUP (Master Control → Monitoring)
   ---------------------------------------------------------
   Trainers clear what trainees' practice leaves behind: their drafts, and their practice copies of the
   Training Library files (a trainee's own case for a file: content.trainingLibraryId). The list is the
   case list Admins already load (/api/case-repository, which marks a practice copy with its libraryId);
   a trainer picks what to show (Drafts · Practice on library files · All trainee cases), narrows it by a
   trainee's name, batch or the client, ticks cases (or Select all shown) and deletes them, after a
   confirm naming how many and whose. Deleting is the case's own DELETE (owner or Admin); a trainer's
   own cases are never listed. Nothing here is part of a saved case.
   ========================================================= */
(function () {
    'use strict';
    if (window.LSHPracticeCleanup) return;
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const me = () => ((typeof getRealSession === 'function' ? getRealSession() : null) || {}).username || '';
    const isAdmin = () => ((typeof getRealSession === 'function' ? getRealSession() : null) || {}).userType === 'Admin';
    const cache = () => { try { return Array.isArray(_repoCache) ? _repoCache : []; } catch (e) { return []; } };   // (app.js)
    let view = 'drafts', picked = new Set(), shown = [];

    function rows() {
        const q = (($id('pc-search') || {}).value || '').trim().toLowerCase();
        return cache().filter(c => c.ownerUsername && c.ownerUsername !== me())
            .filter(c => view === 'drafts' ? c.isDraft : view === 'library' ? !!c.libraryId : true)
            .filter(c => !q || [c.ownerUsername, c.ownerBatchId, c.clientName, c.caseId, c.libraryId, c.submittedBy].join(' ').toLowerCase().includes(q));
    }
    const when = (t) => { const d = t ? new Date(String(t).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? '' : 'Z')) : null; return d && !isNaN(d) ? d.toLocaleString() : ''; };
    function paint() {
        const box = $id('pc-list'); if (!box) return;
        shown = rows();
        [...picked].forEach(id => { if (!shown.some(c => String(c.id) === id)) picked.delete(id); });
        const counts = { drafts: 0, library: 0, all: 0 };
        cache().filter(c => c.ownerUsername && c.ownerUsername !== me()).forEach(c => { counts.all++; if (c.isDraft) counts.drafts++; if (c.libraryId) counts.library++; });
        document.querySelectorAll('#pc-chips button[data-pc]').forEach(b => { b.classList.toggle('on', b.dataset.pc === view); const n = b.querySelector('b'); if (n) n.textContent = counts[b.dataset.pc]; });
        box.innerHTML = shown.length ? shown.map(c => `<label class="pc-row${picked.has(String(c.id)) ? ' on' : ''}">
                <input type="checkbox" data-pc-id="${esc(c.id)}" ${picked.has(String(c.id)) ? 'checked' : ''}>
                <span class="pc-main"><b>${esc(c.clientName || 'Unnamed client')}</b>
                    <small>${c.isDraft ? '<i class="pc-tag d">Draft</i>' : ''}${c.libraryId ? `<i class="pc-tag l">Practice · ${esc(c.libraryId)}</i>` : ''}${c.caseId ? `<code>${esc(c.caseId)}</code>` : ''} @${esc(c.ownerUsername)}${c.ownerBatchId ? ' · ' + esc(c.ownerBatchId) : ''} · updated ${esc(when(c.updatedAt))}</small></span>
                <button type="button" class="pc-del" data-pc-del="${esc(c.id)}" title="Delete this case">🗑</button></label>`).join('')
            : `<p class="pc-empty">${view === 'drafts' ? 'No trainee drafts.' : view === 'library' ? 'No practice copies of library files.' : 'No trainee cases.'}</p>`;
        const all = $id('pc-all'); if (all) { all.checked = !!shown.length && shown.every(c => picked.has(String(c.id))); all.disabled = !shown.length; }
        const del = $id('pc-del-sel'); if (del) { del.disabled = !picked.size; del.textContent = `🗑 Delete selected (${picked.size})`; }
        const allLbl = $id('pc-all-lbl'); if (allLbl) allLbl.textContent = `Select all shown (${shown.length})`;
    }
    async function remove(ids) {
        if (!ids.length) return;
        const list = ids.map(id => cache().find(c => String(c.id) === String(id))).filter(Boolean);
        const owners = [...new Set(list.map(c => '@' + c.ownerUsername))];
        if (!confirm(`Delete ${list.length === 1 ? `"${list[0].clientName || 'Unnamed client'}"` : list.length + ' cases'} (${owners.slice(0, 4).join(', ')}${owners.length > 4 ? '…' : ''})? This can't be undone.`)) return;
        let ok = 0, bad = 0;
        for (const c of list) {
            try { const r = await fetch('/api/case-repository?id=' + encodeURIComponent(c.id), { method: 'DELETE', credentials: 'include' }); const d = await r.json().catch(() => ({})); if (r.ok && d.success !== false) { ok++; picked.delete(String(c.id)); } else bad++; }
            catch (e) { bad++; }
        }
        if (typeof showToast === 'function') showToast(`${ok} case${ok === 1 ? '' : 's'} deleted.` + (bad ? ` ${bad} couldn't be deleted.` : ''), bad ? 'error' : 'success');
        if (typeof refreshRepoCache === 'function') await refreshRepoCache();
        paint();
    }
    function mount() {
        if ($id('pc-section') || !isAdmin()) return;
        const pane = $id('admin-dash-monitoring'); if (!pane) return;
        const anchor = [...pane.querySelectorAll('.mc-section-title')].find(x => /Server Logs/.test(x.textContent));
        const html = `<section id="pc-section" class="pc-section">
            <div class="pc-head"><h3>🧹 Trainees' practice cases</h3>
                <p>Clear what practice leaves behind: trainees' drafts and their copies of the Training Library files. Pick, tick and delete; it asks first.</p></div>
            <div class="mon-chips" id="pc-chips">
                <button type="button" data-pc="drafts">Drafts <b>0</b></button><button type="button" data-pc="library">Practice on library files <b>0</b></button><button type="button" data-pc="all">All trainee cases <b>0</b></button>
                <input type="search" id="pc-search" placeholder="Trainee, batch, client or Case ID" aria-label="Search trainee cases">
            </div>
            <div class="pc-bar"><label><input type="checkbox" id="pc-all"> <span id="pc-all-lbl">Select all shown (0)</span></label>
                <button type="button" id="pc-del-sel" class="pc-delsel" disabled>🗑 Delete selected (0)</button></div>
            <div id="pc-list" class="pc-list"></div>
        </section>`;
        if (anchor) anchor.insertAdjacentHTML('beforebegin', html); else pane.insertAdjacentHTML('beforeend', html);
        $id('pc-chips').addEventListener('click', (e) => { const b = e.target.closest('button[data-pc]'); if (b) { view = b.dataset.pc; paint(); } });
        $id('pc-search').addEventListener('input', paint);
        $id('pc-all').addEventListener('change', (e) => { shown.forEach(c => e.target.checked ? picked.add(String(c.id)) : picked.delete(String(c.id))); paint(); });
        $id('pc-del-sel').addEventListener('click', () => remove([...picked]));
        $id('pc-list').addEventListener('click', (e) => { const d = e.target.closest('[data-pc-del]'); if (d) { e.preventDefault(); remove([d.dataset.pcDel]); } });
        $id('pc-list').addEventListener('change', (e) => { const x = e.target.closest('[data-pc-id]'); if (!x) return; x.checked ? picked.add(x.dataset.pcId) : picked.delete(x.dataset.pcId); paint(); });
        const css = document.createElement('style'); css.id = 'pc-css'; css.textContent = `
        .pc-section{margin:22px 0 6px}
        .pc-head{padding:14px 18px;margin-bottom:12px;border-radius:14px;color:#fff;border-bottom:3px solid #c9973f;background:linear-gradient(120deg,#081226 0%,#132a5c 60%,#1d3f86 100%)}
        .pc-head h3{margin:0 0 4px;font-size:17px;font-weight:900;color:#fff}.pc-head p{margin:0;font-size:13px;font-weight:600;color:#cbd5e1}
        #pc-chips button b{margin-left:4px;padding:0 7px;border-radius:999px;background:#eef2ff;font-size:11.5px}#pc-chips button.on b{background:#c9973f;color:#fff}
        .pc-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px;font-size:13px;font-weight:800;color:#1E2340}
        .pc-bar label{display:flex;align-items:center;gap:6px;cursor:pointer}
        .pc-delsel{border:0;border-radius:999px;padding:7px 14px;font-size:12.5px;font-weight:900;color:#fff;background:#b91c1c;cursor:pointer}.pc-delsel[disabled]{opacity:.4;cursor:not-allowed}
        .pc-list{display:grid;gap:8px;max-height:420px;overflow-y:auto;padding:2px}
        .pc-row{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:12px;cursor:pointer;border:2px solid transparent;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,#1e3a8a,#2b4fa8 45%,#c9973f) border-box}
        .pc-row.on{background:linear-gradient(#fff7ed,#fff7ed) padding-box,linear-gradient(135deg,#b91c1c,#f97316) border-box}
        .pc-row input{width:17px;height:17px;flex:none}.pc-main{flex:1;min-width:0}.pc-main b{display:block;font-size:14.5px;font-weight:900;color:#0b1430}
        .pc-main small{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#475569}.pc-main code{font-size:11px;background:#eef2f7;border-radius:4px;padding:0 5px;color:#1E2340}
        .pc-tag{font-style:normal;font-size:10.5px;font-weight:900;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:1px 8px}.pc-tag.d{background:#fef3c7;color:#92400e}.pc-tag.l{background:#e0e7ff;color:#1e3a8a}
        .pc-del{flex:none;border:1.5px solid #fecaca;background:#fff;color:#b91c1c;border-radius:9px;padding:5px 10px;font-size:15px;cursor:pointer}.pc-del:hover{background:#b91c1c;color:#fff}
        .pc-empty{font-size:13px;font-weight:700;color:#64748b;margin:6px 2px}`;
        document.head.appendChild(css);
        paint();
    }
    window.LSHPracticeCleanup = { paint, remove };
    // Master Control's Monitoring tab: built when first shown; the list follows the case list (it refreshes every minute and on each save)
    function tick() { if ($id('admin-dash-monitoring') && $id('master-control-page') && $id('master-control-page').classList.contains('open')) { mount(); paint(); } }
    function start() { setInterval(tick, 1500); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
