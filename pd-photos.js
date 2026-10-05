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
   - A Training Library file has mock photos drawn from its file (the
     vehicles in its pd block and where each was hit, pdPhotos in
     mock-cases.js), marked SPECIMEN · TRAINING PHOTO. A trainee's saved
     work on the file shows them too.
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

    /* ---------- mock photos: a drawing of the vehicle and where it was hit ---------- */
    function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
    const BIKES = /harley|motorcycle|yamaha|kawasaki|ducati|triumph|suzuki gsx|street glide/i;
    // a dented, scraped patch: jagged dark lines and red scrapes around (x, y)
    function damage(x, y, r, seed) {
        let d = '', s = seed;
        const rnd = () => { s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0; return (s % 1000) / 1000; };
        for (let i = 0; i < 7; i++) {
            const a = rnd() * Math.PI * 2, l = r * (0.5 + rnd() * 0.6);
            d += `M${x} ${y} l${(Math.cos(a) * l * 0.5).toFixed(1)} ${(Math.sin(a) * l * 0.5).toFixed(1)} l${(Math.cos(a + 0.4) * l * 0.5).toFixed(1)} ${(Math.sin(a + 0.4) * l * 0.5).toFixed(1)} `;
        }
        return `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${(r * 0.7).toFixed(1)}" fill="#0f172a" fill-opacity=".22"/><path d="${d}" stroke="#111827" stroke-width="2" fill="none" stroke-linecap="round"/>
            <path d="M${x - r * 0.8} ${y - r * 0.3} q${r * 0.4} ${r * 0.3} ${r * 0.9} ${r * 0.1} M${x - r * 0.6} ${y + r * 0.3} q${r * 0.5} -${r * 0.2} ${r * 1.1} ${r * 0.15}" stroke="#b91c1c" stroke-width="2.5" fill="none" stroke-opacity=".7"/>`;
    }
    function sideCar(color, hitX) {
        return `<g><path d="M60 170 L90 128 Q110 104 150 102 L262 100 Q300 100 330 128 L372 138 Q400 142 404 162 L404 182 L60 182 Z" fill="${color}" stroke="#1f2937" stroke-width="2"/>
            <path d="M118 128 L146 108 L208 106 L208 132 Z M216 106 L262 106 Q290 108 312 132 L216 132 Z" fill="#cbd5e1" stroke="#334155" stroke-width="1.5"/>
            <line x1="212" y1="106" x2="212" y2="180" stroke="#1f2937" stroke-width="1.5"/><line x1="140" y1="134" x2="140" y2="178" stroke="#1f2937" stroke-width="1" stroke-opacity=".5"/>
            <circle cx="122" cy="184" r="24" fill="#111827"/><circle cx="122" cy="184" r="11" fill="#9ca3af"/><circle cx="336" cy="184" r="24" fill="#111827"/><circle cx="336" cy="184" r="11" fill="#9ca3af"/>
            <rect x="392" y="150" width="12" height="10" rx="2" fill="#fde68a"/><rect x="58" y="150" width="10" height="10" rx="2" fill="#ef4444"/>
            ${damage(hitX, 154, 30, hash(color + hitX))}</g>`;
    }
    function endCar(color, front, hitX) {
        return `<g><path d="M120 190 L120 120 Q126 92 160 86 L300 86 Q334 92 340 120 L340 190 Z" fill="${color}" stroke="#1f2937" stroke-width="2"/>
            <path d="M146 118 Q152 98 170 96 L290 96 Q308 98 314 118 Z" fill="#cbd5e1" stroke="#334155" stroke-width="1.5"/>
            <rect x="132" y="138" width="40" height="16" rx="4" fill="${front ? '#fef9c3' : '#ef4444'}" stroke="#334155"/><rect x="288" y="138" width="40" height="16" rx="4" fill="${front ? '#fef9c3' : '#ef4444'}" stroke="#334155"/>
            ${front ? '<rect x="190" y="140" width="80" height="22" rx="4" fill="#1f2937" fill-opacity=".75"/>' : ''}
            <rect x="112" y="168" width="236" height="20" rx="6" fill="#374151"/><rect x="200" y="170" width="60" height="15" rx="2" fill="#f8fafc" stroke="#334155"/>
            <rect x="128" y="190" width="30" height="16" rx="3" fill="#111827"/><rect x="302" y="190" width="30" height="16" rx="3" fill="#111827"/>
            ${damage(hitX, 160, 34, hash(color + hitX + front))}</g>`;
    }
    function bike(color, hitX) {
        return `<g><circle cx="130" cy="176" r="34" fill="none" stroke="#111827" stroke-width="10"/><circle cx="330" cy="176" r="34" fill="none" stroke="#111827" stroke-width="10"/>
            <path d="M130 176 L196 128 L290 124 L330 176 M196 128 L238 168 L290 124 M290 124 L314 96 L332 98" stroke="#374151" stroke-width="7" fill="none" stroke-linecap="round"/>
            <path d="M188 118 Q230 98 280 112 L270 132 L196 134 Z" fill="${color}" stroke="#1f2937" stroke-width="2"/><rect x="150" y="112" width="44" height="12" rx="5" fill="#111827"/>
            ${damage(hitX, 150, 28, hash(color + hitX + 'bike'))}</g>`;
    }
    const AREAS = { 'front': ['end', true, 230], 'rear': ['end', false, 230], 'left side': ['side', 0, 232], 'right side': ['side', 0, 232],
        'front left': ['side', 0, 372], 'front right': ['side', 0, 372], 'rear left': ['side', 0, 86], 'rear right': ['side', 0, 86] };
    function photoSvg(mc, p, i) {
        const v = (mc.pd && (p.vehicle === 'other' ? mc.pd.tp : mc.pd.client)) || {};
        const name = [v.year, v.make, v.model].filter(Boolean).join(' ') || (p.vehicle === 'other' ? 'Other vehicle' : 'Client vehicle');
        const h = hash(mc.id + (v.plate || '') + p.vehicle), color = `hsl(${h % 360},${40 + (h % 25)}%,${38 + (h % 18)}%)`;
        const [view, front, hitX] = AREAS[p.area] || AREAS.front;
        const isBike = BIKES.test(`${v.make} ${v.model}`);
        const drawing = isBike ? bike(color, view === 'end' ? (front ? 352 : 110) : hitX) : view === 'end' ? endCar(color, front, hitX) : sideCar(color, hitX);
        const flip = !isBike && view === 'side' && /left/.test(p.area) ? ' transform="translate(464 0) scale(-1 1)"' : '';
        const dol = mc.dateOfLoss || '';
        return `<svg viewBox="0 0 464 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(`Mock photo: ${name}, ${p.area} damage (training specimen)`)}" font-family="Arial, Helvetica, sans-serif">
<defs><linearGradient id="pdg-${esc(mc.id)}-${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cbd5e1"/><stop offset=".62" stop-color="#e2e8f0"/><stop offset=".63" stop-color="#6b7280"/><stop offset="1" stop-color="#4b5563"/></linearGradient></defs>
<rect width="464" height="290" fill="url(#pdg-${esc(mc.id)}-${i})"/>
<g stroke="#f8fafc" stroke-opacity=".5" stroke-width="3" stroke-dasharray="18 14"><line x1="0" y1="250" x2="464" y2="250"/></g>
<g${flip}>${drawing}</g>
<text x="232" y="150" font-size="40" font-weight="900" fill="#ef4444" fill-opacity=".14" text-anchor="middle" transform="rotate(-14 232 140)" letter-spacing="4">SPECIMEN</text>
<rect x="0" y="0" width="464" height="26" fill="#0f172a" fill-opacity=".78"/>
<text x="10" y="17" font-size="11" font-weight="800" fill="#fff">${esc(name)}${v.plate ? ' · ' + esc(v.plate) : ''}</text>
<text x="454" y="17" font-size="10" font-weight="700" fill="#fbbf24" text-anchor="end">${p.vehicle === 'other' ? 'OTHER VEHICLE' : 'CLIENT VEHICLE'}</text>
<rect x="0" y="262" width="464" height="28" fill="#0f172a" fill-opacity=".78"/>
<text x="10" y="280" font-size="11" fill="#fff"${String(p.caption || '').length > 58 ? ' textLength="360" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(p.caption || p.area + ' damage')}</text>
<text x="454" y="280" font-size="9" fill="#94a3b8" text-anchor="end">MOCK · TRAINING PHOTO${dol ? ' · DOL ' + esc(dol) : ''}</text>
</svg>`;
    }
    const mockPhotos = (mc) => (mc && Array.isArray(mc.pdPhotos) ? mc.pdPhotos : []);

    /* ---------- the grid and the larger view ---------- */
    function render() {
        const box = $id('pd-photo-grid'); if (!box) return;
        const mc = libId() && mockCase(libId()), mocks = mockPhotos(mc), mine = list(), edit = canEdit();
        const sig = JSON.stringify([mc ? mc.id : '', mine, edit]);
        if (box.dataset.sig === sig) return;
        box.dataset.sig = sig;
        const tiles = mocks.map((p, i) => `<figure class="pdp-tile pdp-mock"><button type="button" class="pdp-img" data-pdp="open" data-mock="${i}" title="${esc(p.caption || '')}. Click to enlarge.">${photoSvg(mc, p, i)}</button><figcaption>${esc(p.caption || p.area)}</figcaption></figure>`)
            .concat(mine.map((p, i) => `<figure class="pdp-tile"><button type="button" class="pdp-img" data-pdp="open" data-i="${i}" title="${esc(p.name || '')}. Click to enlarge."><img src="${esc(fileUrl(p.key))}" alt="${esc(p.caption || 'Property damage photo')}" loading="lazy"></button>
                <figcaption>${esc(p.caption || p.name || 'Photo')}${edit ? `<span class="pdp-acts no-print"><button type="button" data-pdp="caption" data-i="${i}" title="Change the caption">✎</button><button type="button" data-pdp="remove" data-i="${i}" title="Remove the photo">✕</button></span>` : ''}</figcaption></figure>`));
        box.innerHTML = tiles.length ? tiles.join('') : '<div class="pdp-empty">📷 No photos yet.</div>';
    }
    function closeView() { const m = $id('pdp-modal'); if (m) m.remove(); }
    function open(btn) {
        closeView();
        const mc = libId() && mockCase(libId());
        let inner = '', cap = '', meta = '';
        if (btn.dataset.mock != null) {
            const p = mockPhotos(mc)[+btn.dataset.mock]; if (!p) return;
            inner = photoSvg(mc, p, 'big' + btn.dataset.mock); cap = p.caption || p.area; meta = 'A mock photo drawn from the Training Library file, for practice: not a real photo.';
        } else {
            const p = list()[+btn.dataset.i]; if (!p) return;
            inner = `<img src="${esc(fileUrl(p.key))}" alt="${esc(p.caption || 'Property damage photo')}">`; cap = p.caption || '';
            meta = `${p.name ? `<b title="${p.orig ? 'Original file: ' + esc(p.orig) : ''}">${esc(p.name)}</b><br>` : ''}Added${p.at ? ' ' + esc(new Date(p.at).toLocaleDateString()) : ''}${p.by ? ' by ' + esc(p.by) : ''}.`;
        }
        document.body.insertAdjacentHTML('beforeend', `<div id="pdp-modal" class="cid-modal no-print" role="dialog" aria-label="Property damage photo" onclick="if(event.target===this)lshPdPhotos.close()">
            <div class="cid-box pdp-box"><div class="cid-head"><b>📷 ${esc(cap || 'Property damage photo')}</b><button type="button" class="cid-x" onclick="lshPdPhotos.close()" aria-label="Close">✕</button></div>
            <div class="cid-big pdp-big">${inner}</div><p class="cid-note">${meta}</p></div></div>`);
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $id('pdp-modal')) closeView(); });

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
    window.lshPdPhotos = { add, list, rename, render, open, close: closeView, mockSvg: (id, i) => { const mc = mockCase(id); const p = mockPhotos(mc)[i || 0]; return mc && p ? photoSvg(mc, p, i || 0) : ''; } };
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
