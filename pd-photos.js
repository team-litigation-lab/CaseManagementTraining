/* =========================================================
   LSH CMS — PROPERTY DAMAGE PHOTOS (Property Damage tab)
   ---------------------------------------------------------
   - ⬆ Add Photos: photos of the vehicles, the scene and the damage
     (JPG, PNG or WebP; several at once). Each is redrawn at most 1,600 px
     on its long side as a JPG (under the 2 MB upload limit, and the
     photo's location data is left behind), kept in the site's file
     storage (/api/upload, as Doc Hub files are) and named by the firm's
     convention (<Case ID>_<Last-First>_PD-Photo_<date>.jpg).
   - The list (key, name, original name, caption, when, by whom) is saved
     with the case by id: the hidden field in #kx-pd-photos (data-keyed).
   - A Training Library file has mock photos made from its file: for a
     vehicle crash, the crash scene, then each vehicle and where it was hit
     (pdPhotos in mock-cases.js, or case-photos.js CRASH photos for a file
     without a property damage block). case-photos.js draws them; once an
     Admin has made a realistic photo (library-photos.js) it shows instead.
     All are marked SPECIMEN · TRAINING PHOTO. A trainee's saved work on the
     file shows them too.
   - Click a photo for the larger view; ✎ changes its caption and ✕
     removes it (where the case can be edited). Save the case to keep
     changes. Doc Hub's ☁ Google Drive backup copies uploaded photos too.
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t, d) => { if (typeof showToast === 'function') showToast(m, t || 'info', d); };
    const field = () => document.querySelector('#kx-pd-photos [data-k="photos"]');
    const fileUrl = (key) => '/api/file?key=' + encodeURIComponent(key);
    const MAX = 20;   // photos on a case

    /* ---------- the saved list ---------- */
    function list() {
        const f = field(), t = f ? f.textContent.trim() : '';
        if (!t) return [];
        try {
            const a = JSON.parse(t);
            return Array.isArray(a) ? a.filter(p => p && typeof p.key === 'string' && p.key)
                .map(p => Object.assign({}, p, { name: typeof p.name === 'string' ? p.name : '', caption: typeof p.caption === 'string' ? p.caption : '' })) : [];
        } catch (e) { return []; }
    }
    function setList(a) {
        const f = field(); if (!f) return;
        f.textContent = a.length ? JSON.stringify(a) : '';
        f.dispatchEvent(new Event('input', { bubbles: true }));   // the case has changed (autosave, "unsaved changes")
        render();
    }
    // Save Case gave the case its ID: photos named NO-CASE-ID_… take it (app.js renameNoCaseIdFiles)
    function rename(fn) {
        const a = list(); let n = 0;
        a.forEach(p => { const next = p.name ? fn(p.name) : null; if (next && next !== p.name) { p.name = next; n++; } });
        if (n) { const f = field(); if (f) f.textContent = JSON.stringify(a); render(); }
        return n;
    }

    /* ---------- which file: a library file's mock photos ---------- */
    let loadedLibId = null;   // a saved case that is someone's work on a library file
    const libId = () => (window.mockCurrentId && window.mockCurrentId()) || loadedLibId;
    const mockCase = (id) => (typeof MOCK_CASES !== 'undefined' ? MOCK_CASES : []).find(c => c.id === id) || null;
    function canEdit() {
        if (window.mockIsViewOnly && window.mockIsViewOnly()) return false;
        const area = $id('capture-area'), pane = $id('pane-pd');
        if (!area || !area.classList.contains('mock-ro')) return true;
        return !!(pane && pane.classList.contains('mock-open') && area.classList.contains('mock-areas-ready'));
    }

    /* ---------- a library file's mock photos ---------- */
    // The crash scene (an MVA file) and each vehicle's damage: drawn from the file by case-photos.js, or the realistic
    // photo an Admin made (library-photos.js). [{ kind: 'scene' | 'v<n>', p, caption }]
    const CP = () => window.LSHCasePhotos, LP = () => window.lshLibraryPhotos;
    function mockShots(mc) {
        const cp = CP(); if (!mc || !cp) return [];
        const out = cp.hasScene(mc) ? [{ kind: 'scene', caption: `Crash scene · ${String(cp.CRASH[mc.id].place || '').replace(/\s*\([^)]*\)/g, '')}` }] : [];
        cp.vehiclePhotos(mc).forEach((p, i) => out.push({ kind: 'v' + i, p, caption: p.caption || p.area }));
        return out;
    }
    const realOf = (mc, kind) => LP() ? LP().url(mc, kind) : null;
    const shotSvg = (mc, s) => s.kind === 'scene' ? CP().scene(mc, realOf(mc, s.kind)) : CP().vehiclePhoto(mc, s.p, +s.kind.slice(1), realOf(mc, s.kind));

    /* ---------- the grid and the larger view ---------- */
    function render() {
        const box = $id('pd-photo-grid'); if (!box) return;
        const mc = libId() && mockCase(libId()), shots = mockShots(mc), mine = list(), edit = canEdit();
        const sig = JSON.stringify([mc ? mc.id : '', shots.map(x => realOf(mc, x.kind) || ''), mine, edit]);
        if (box.dataset.sig === sig) return;
        box.dataset.sig = sig;
        const tiles = shots.map((x, i) => `<figure class="pdp-tile pdp-mock${x.kind === 'scene' ? ' pdp-scene' : ''}"><button type="button" class="pdp-img" data-pdp="open" data-mock="${i}" title="${esc(x.caption)}. Click to enlarge.">${shotSvg(mc, x)}</button><figcaption>${esc(x.caption)}</figcaption></figure>`)
            .concat(mine.map((p, i) => `<figure class="pdp-tile"><button type="button" class="pdp-img" data-pdp="open" data-i="${i}" title="${esc(p.name || '')}. Click to enlarge."><img src="${esc(fileUrl(p.key))}" alt="${esc(p.caption || 'Property damage photo')}" loading="lazy"></button>
                <figcaption>${esc(p.caption || p.name || 'Photo')}${edit ? `<span class="pdp-acts no-print"><button type="button" data-pdp="caption" data-i="${i}" title="Change the caption">✎</button><button type="button" data-pdp="remove" data-i="${i}" title="Remove the photo">✕</button></span>` : ''}</figcaption></figure>`));
        box.innerHTML = tiles.length ? tiles.join('') : '<div class="pdp-empty">📷 No photos yet.</div>';
    }
    let openMock = null;   // the library photo open larger (shown again when it changes)
    function closeView() { const m = $id('pdp-modal'); if (m) m.remove(); openMock = null; }
    function open(btn) {
        closeView();
        const mc = libId() && mockCase(libId());
        let inner = '', cap = '', meta = '';
        if (btn.dataset.mock != null) {
            const x = mockShots(mc)[+btn.dataset.mock]; if (!x) return;
            inner = shotSvg(mc, x); cap = x.caption;
            meta = (realOf(mc, x.kind) ? 'A realistic, AI-made photo for practice: the file, its people and its vehicles are fictional.' : 'A mock photo drawn from the Training Library file, for practice: not a real photo.')
                + (LP() ? LP().adminBar(mc, x.kind) : '');
        } else {
            const p = list()[+btn.dataset.i]; if (!p) return;
            inner = `<img src="${esc(fileUrl(p.key))}" alt="${esc(p.caption || 'Property damage photo')}">`; cap = p.caption || '';
            meta = `${p.name ? `<b title="${p.orig ? 'Original file: ' + esc(p.orig) : ''}">${esc(p.name)}</b><br>` : ''}Added${p.at ? ' ' + esc(new Date(p.at).toLocaleDateString()) : ''}${p.by ? ' by ' + esc(p.by) : ''}.`;
        }
        document.body.insertAdjacentHTML('beforeend', `<div id="pdp-modal" class="cid-modal no-print" role="dialog" aria-label="Property damage photo" onclick="if(event.target===this)lshPdPhotos.close()">
            <div class="cid-box pdp-box"><div class="cid-head"><b>📷 ${esc(cap || 'Property damage photo')}</b><button type="button" class="cid-x" onclick="lshPdPhotos.close()" aria-label="Close">✕</button></div>
            <div class="cid-big pdp-big">${inner}</div><div class="cid-note">${meta}</div></div></div>`);
        if (btn.dataset.mock != null) openMock = +btn.dataset.mock;
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $id('pdp-modal')) closeView(); });
    // a realistic photo was made, changed or removed (or the list came in): show it
    document.addEventListener('lsh-library-photos', () => { render(); if ($id('pdp-modal') && openMock != null) open({ dataset: { mock: String(openMock) } }); });

    /* ---------- adding, captions, removing ---------- */
    async function shrink(file) {
        if (!/^image\/(jpeg|png|webp|gif|bmp)$/i.test(file.type || '')) throw new Error(`${file.name}: choose a photo (JPG, PNG or WebP).`);
        let img;
        try { img = await createImageBitmap(file); } catch (e) { throw new Error(`${file.name} couldn't be opened. Try a JPG or PNG.`); }
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
        const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
        const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85));
        if (!blob) throw new Error(`${file.name} couldn't be prepared. Try another photo.`);
        return new File([blob], 'pd-photo.jpg', { type: 'image/jpeg' });
    }
    let busy = false;
    async function add(input) {
        const files = Array.from((input && input.files) || []); if (input) input.value = '';
        if (!files.length || busy) return;
        if (!canEdit()) { toast('This case\'s property damage can\'t be changed here.', 'info'); return; }
        if (typeof uploadFileToR2 !== 'function') { toast('Uploading isn\'t available here.', 'error'); return; }
        const room = MAX - list().length;
        if (room <= 0) { toast(`A case holds ${MAX} photos at most. Remove one first.`, 'info'); return; }
        busy = true;
        const grid = $id('pd-photo-grid'); if (grid) grid.insertAdjacentHTML('beforeend', '<div class="pdp-empty pdp-busy">Uploading…</div>');
        let done = 0; const errors = [];
        // the case they were added to: one still uploading when another case opens doesn't land on that one
        const gen = typeof _editorGen !== 'undefined' ? _editorGen : null, sameCase = () => gen === null || _editorGen === gen;
        for (const file of files.slice(0, room)) {
            if (!sameCase()) { errors.push('Another case was opened, so the rest of the photos weren\'t added.'); break; }
            try {
                const named = typeof caseFileName === 'function' ? caseFileName('PD Photo', 'photo.jpg') : file.name;   // (shrink makes a JPG)
                const up = await uploadFileToR2(await shrink(file), 'pd-photo', named);
                if (!sameCase()) { errors.push('Another case was opened, so the rest of the photos weren\'t added.'); break; }
                const who = typeof getSession === 'function' && getSession();
                setList(list().concat([{ key: up.key, name: named, orig: file.name, caption: '', at: new Date().toISOString(), by: (who && (who.fullName || who.username)) || '' }]));
                done++;
            } catch (e) { errors.push(e && e.message ? e.message : `${file.name} couldn't be uploaded.`); }
        }
        busy = false;
        const b = grid && grid.querySelector('.pdp-busy'); if (b) b.remove();
        render();
        if (files.length > room) errors.push(`Only ${room} more photo${room === 1 ? '' : 's'} fit${room === 1 ? 's' : ''} on this case.`);
        if (done) toast(`${done} photo${done === 1 ? '' : 's'} added. Save the case to keep ${done === 1 ? 'it' : 'them'}.`, 'success');
        if (errors.length) toast(errors.join(' '), 'error', 7000);
    }
    function caption(i) {
        const a = list(), p = a[i]; if (!p || !canEdit()) return;
        const typed = prompt('A caption for this photo (what it shows):', p.caption || '');
        if (typed == null) return;
        p.caption = typed.replace(/\s+/g, ' ').trim().slice(0, 120);
        setList(a);
    }
    function remove(i) {
        const a = list(); if (!a[i] || !canEdit()) return;
        if (!confirm('Remove this photo from the case?')) return;
        a.splice(i, 1); setList(a);
        toast('Photo removed. Save the case to keep the change.', 'info');
    }

    /* ---------- staying up to date ---------- */
    const later = () => setTimeout(render, 0);
    const after = (name, before) => {
        const f = window[name]; if (typeof f !== 'function' || f.__pdp) return;
        const w = function () { if (before) before.apply(this, arguments); const r = f.apply(this, arguments); later(); return r; };
        w.__pdp = true; window[name] = w;
    };
    function start() {
        const grid = $id('pd-photo-grid');
        if (grid) grid.addEventListener('click', (e) => {
            const b = e.target.closest('button[data-pdp]'); if (!b) return;
            if (b.dataset.pdp === 'open') open(b);
            else if (b.dataset.pdp === 'caption') caption(+b.dataset.i);
            else if (b.dataset.pdp === 'remove') remove(+b.dataset.i);
        });
        after('applyCaseContentToDOM', (content, root) => { if (!root || root === document) loadedLibId = (content && content.trainingLibraryId) || null; });
        after('blankCaseEditorContent', () => { loadedLibId = null; });
        ['openMockCase', 'closeCase', 'loadCase'].forEach(n => after(n));
        const prevAfter = window.afterKeyedApplied;
        window.afterKeyedApplied = function () { const r = typeof prevAfter === 'function' ? prevAfter.apply(this, arguments) : undefined; later(); return r; };
        const f = field(); if (f) new MutationObserver(later).observe(f, { childList: true, characterData: true, subtree: true });
        const area = $id('capture-area'); if (area) new MutationObserver(later).observe(area, { attributes: true, attributeFilter: ['class'] });
        render();
    }
    window.lshPdPhotos = { add, list, rename, render, open, close: closeView, mockSvg: (id, i) => { const mc = mockCase(id); const x = mockShots(mc)[i || 0]; return mc && x ? shotSvg(mc, x) : ''; } };
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
