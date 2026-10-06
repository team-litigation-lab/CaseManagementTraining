/* =========================================================
   LSH CMS — THE CLIENT'S ID AND SSN IN THE CASE HEADER
   ---------------------------------------------------------
   Client's ID (#kx-client-id, in the middle of the case header):
     - A Training Library client (mock-cases.js) has a mock ID made from their
       file: name, date of birth, address and an ID number. It is marked
       SPECIMEN · TRAINING ONLY and follows no real issuer's design. Its photo is, in
       this order: the realistic photo an Admin made (library-photos.js), the built-in
       synthetic photo in mock-id-photos/ (adults only; a minor's ID keeps the drawn
       portrait), the drawn portrait (case-photos.js). The signature is kept in its
       own box under the photo, so it can't run into the address.
     - Any other client: ⬆ Upload ID takes a photo or scan of their ID (JPG, PNG
       or WebP, made smaller here before it's sent). It is kept in the site's
       file storage (/api/upload, R2, as Doc Hub files are) and saved with the
       case by its key, in the hidden field in #kx-client-id. Replace or remove
       it from the larger view.
     Click the card for the larger view.
   SSN (#head-ssn-field, beside Contact) and DOB (#head-dob-field, beside
   Case Manager): the Profile tab's SSN and DOB (#client-ssn-field,
   #client-dob-field) shown again; typing in either changes both. Only the
   Profile tab's are saved (app.js: data-mirror); its DOB box is hidden, so the
   DOB is typed in the header.
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t) => { if (typeof showToast === 'function') showToast(m, t || 'info'); };

    /* ---------- the SSN beside Contact, the DOB beside Case Manager ---------- */
    function linkSsn() { link('client-ssn-field', 'head-ssn-field'); link('client-dob-field', 'head-dob-field'); }
    function link(profId, headId) {
        const prof = $id(profId), head = $id(headId);
        if (!prof || !head) return;
        // Whichever changed is copied to the other; when both changed at once (a case loading), the Profile tab's wins.
        const mo = new MutationObserver((recs) => {
            const fromProf = recs.some(r => prof.contains(r.target));
            const [src, dst] = fromProf ? [prof, head] : [head, prof];
            if (dst.innerHTML !== src.innerHTML) dst.innerHTML = src.innerHTML;
        });
        [prof, head].forEach(el => mo.observe(el, { childList: true, characterData: true, subtree: true }));
        if (head.innerHTML !== prof.innerHTML) head.innerHTML = prof.innerHTML;
    }

    /* ---------- mock IDs for the Training Library's clients ---------- */
    function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
    // A long line is squeezed to fit its space rather than running off the card.
    const fit = (text, chars, width) => String(text).length > chars ? ` textLength="${width}" lengthAdjust="spacingAndGlyphs"` : '';
    // The name as it belongs on an ID: not the file's note about who signs for the client ("(minor), by her father…").
    const idName = (n) => String(n || '').replace(/\s*\(.*$/, '').replace(/^Estate of\s+/i, '').trim();
    // Built-in photos for the library's adults: mock-id-photos/<name>-<birth year>.jpg, synthetic faces (no real person; see that
    // folder's README), one per person so a client who is in several files looks the same in each. A minor has none.
    const ID_PHOTOS = new Set(`
        marcus-lee-2000 schuyler-beauchamp-2000 jose-hernandez-1994 andre-coleman-1991
        rhys-beaumont-1991 bjorn-courthope-1988 ahmed-rahman-1985 james-wilson-1983
        carlos-mendoza-1977 derek-thompson-1975 brian-o-neill-1972 samuel-boateng-1970
        cian-masserene-1970 robert-chen-1969 walter-grant-1968 tomas-rivera-1964
        jose-hernandez-1962 william-harris-1958 james-wilson-1956 george-hammond-1949
        harold-jenkins-1948 keisha-brown-1995 brittany-kirkcudbright-1996 niamh-cholmondeley-1998
        mireille-featherstonhaugh-1994 olivia-bennett-1993 aisha-patel-1992 emily-nguyen-1990
        tanya-reed-1990 maria-santos-1988 latoya-jackson-1987 hannah-pierce-1987
        rachel-donovan-1986 nicole-adams-1984 denise-carter-1981 ngozi-okonkwo-1979
        maria-santos-1971 siobhan-masserene-1968 linda-garcia-1961 saoirse-shaughnessy-1955
        patricia-lewis-1946`.split(/\s+/).filter(Boolean));
    const photoSlug = (who, dob) => `${who} ${String(dob || '').slice(-4)}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    function builtInPhoto(mc) {
        if (window.LSHCasePhotos && window.LSHCasePhotos.looksOf(mc).minor) return null;
        const c = mc.client || {}, slug = photoSlug(idName(c.name), c.dob);
        return ID_PHOTOS.has(slug) ? `mock-id-photos/${slug}.jpg` : null;
    }
    // The ID's photo (84×104 at 16,52): the realistic photo when the library has one (library-photos.js), else the built-in
    // photo, else the drawn portrait (case-photos.js), else a silhouette.
    const realPhoto = (mc) => window.lshLibraryPhotos ? window.lshLibraryPhotos.url(mc, 'id') : null;
    function photo(mc, hue) {
        const img = realPhoto(mc) || builtInPhoto(mc);
        if (img) return `<image href="${esc(img)}" x="16" y="52" width="84" height="104" preserveAspectRatio="xMidYMid slice"/>`;
        if (window.LSHCasePhotos) return `<g transform="translate(16 52)">${window.LSHCasePhotos.portrait(mc, 84, 104)}</g>`;
        return `<g fill="hsl(${hue},28%,52%)"><circle cx="58" cy="90" r="20"/><ellipse cx="58" cy="152" rx="36" ry="32"/></g>`;
    }
    function mockIdSvg(mc) {
        const c = mc.client || {}, h = hash(mc.id + '|' + c.name);
        const words = idName(c.name).split(/\s+/).filter(Boolean);
        const last = words.length > 1 ? words.pop() : (words[0] || ''), first = words.length ? words.join(' ') : '';
        const md = /^(\d{2})\/(\d{2})\//.exec(c.dob || ''), mmdd = md ? `${md[1]}/${md[2]}` : '01/15';
        const idNo = 'T' + String(h % 100000000).padStart(8, '0');
        const addr = String(c.address || ''), cut = addr.indexOf(',');
        const line1 = (cut > 0 ? addr.slice(0, cut) : addr).toUpperCase(), line2 = (cut > 0 ? addr.slice(cut + 1).trim() : '').toUpperCase();
        const hue = h % 360, sign = `${first} ${last}`.trim();
        // The signature lives in its own box under the photo (x 16–100) and can't reach the address: it is sized for a wide
        // script font, squeezed if it still won't fit, and clipped to the box as a last resort.
        const SIG_W = 80, sigSize = Math.max(8, Math.min(15, SIG_W / (Math.max(sign.length, 1) * 0.62)));
        const sigFit = sign.length * sigSize * 0.62 > SIG_W ? ` textLength="${SIG_W}" lengthAdjust="spacingAndGlyphs"` : '';
        const L = (x, y, t) => `<text x="${x}" y="${y}" font-size="6.5" font-weight="700" fill="#64748b" letter-spacing=".6">${t}</text>`;
        const V = (x, y, t, size, w, color) => `<text x="${x}" y="${y}" font-size="${size}" font-weight="800" fill="${color || '#0f172a'}"${w ? fit(t, w[0], w[1]) : ''}>${esc(t)}</text>`;
        return `<svg viewBox="0 0 340 214" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Mock ID for ${esc(c.name)} (training specimen)" font-family="Arial, Helvetica, sans-serif">
<defs><linearGradient id="cidg-${esc(mc.id)}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e0f2fe"/><stop offset="1" stop-color="#ecfdf5"/></linearGradient>
<clipPath id="cidc-${esc(mc.id)}"><rect x="16" y="52" width="84" height="104" rx="6"/></clipPath>
<clipPath id="cids-${esc(mc.id)}"><rect x="16" y="162" width="84" height="18"/></clipPath></defs>
<rect width="340" height="214" rx="12" fill="url(#cidg-${esc(mc.id)})" stroke="#94a3b8"/>
<g fill="none" stroke="#0ea5e9" stroke-opacity=".14">${[70, 92, 114, 136, 158, 180].map(y => `<path d="M0 ${y} C 60 ${y - 14}, 120 ${y + 14}, 180 ${y} S 300 ${y - 14}, 340 ${y}"/>`).join('')}</g>
<path d="M0 12 a12 12 0 0 1 12 -12 h316 a12 12 0 0 1 12 12 v28 h-340 z" fill="#0c4a6e"/>
<text x="16" y="20" font-size="13.5" font-weight="900" fill="#fff" letter-spacing="1.2">IDENTIFICATION CARD</text>
<text x="16" y="33" font-size="7" font-weight="700" fill="#bae6fd" letter-spacing=".5">MOCK · FOR TRAINING ONLY · NOT A GOVERNMENT ID</text>
<text x="324" y="27" font-size="9" font-weight="900" fill="#fbbf24" text-anchor="end" letter-spacing="1">LSH</text>
<rect x="16" y="52" width="84" height="104" rx="6" fill="hsl(${hue},45%,86%)"/>
<g clip-path="url(#cidc-${esc(mc.id)})">${photo(mc, hue)}</g>
<rect x="16" y="52" width="84" height="104" rx="6" fill="none" stroke="#64748b" stroke-opacity=".5"/>
<g clip-path="url(#cids-${esc(mc.id)})"><text x="18" y="176" font-size="${sigSize}" fill="#1e3a8a" font-family="'Segoe Script','Brush Script MT','Lucida Handwriting',cursive"${sigFit}>${esc(sign)}</text></g>
<path d="M16 180 H100" stroke="#94a3b8" stroke-width=".6"/>
${L(114, 58, 'ID NO.')}${V(114, 71, idNo, 13, null, '#b91c1c')}
${L(114, 86, 'LN')}${V(114, 98, last.toUpperCase(), 12, [18, 210])}
${L(114, 112, 'FN')}${V(114, 124, first.toUpperCase(), 12, [18, 210])}
${L(114, 139, 'DOB')}${V(114, 151, c.dob || '—', 10.5)}${L(192, 139, 'ISS')}${V(192, 151, `${mmdd}/2023`, 10.5)}${L(264, 139, 'EXP')}${V(264, 151, `${mmdd}/2031`, 10.5, null, '#b91c1c')}
${L(114, 166, 'ADDRESS')}${V(114, 178, line1, 9, [34, 214])}${V(114, 190, line2, 9, [34, 214])}
<text x="16" y="204" font-size="6.5" font-weight="700" fill="#64748b" letter-spacing=".5">LEGAL SUPPORT HELP · CASE MANAGEMENT TRAINING</text>
<text x="170" y="128" font-size="44" font-weight="900" fill="#ef4444" fill-opacity=".13" text-anchor="middle" transform="rotate(-16 170 118)" letter-spacing="4">SPECIMEN</text>
</svg>`;
    }

    /* ---------- which client: a library file, or an uploaded ID ---------- */
    let loadedLibId = null;   // a saved case that is someone's work on a library file (its trainingLibraryId)
    const libId = () => (window.mockCurrentId && window.mockCurrentId()) || loadedLibId;
    const mockCase = (id) => (typeof MOCK_CASES !== 'undefined' ? MOCK_CASES : []).find(c => c.id === id) || null;
    const keyField = () => document.querySelector('#kx-client-id [data-k="file"]');
    function savedFile() {
        const f = keyField(), t = f ? f.textContent.trim() : '';
        if (!t) return null;
        try { const o = JSON.parse(t); return o && typeof o.key === 'string' && o.key ? o : null; } catch (e) { return null; }
    }
    const fileUrl = (key) => '/api/file?key=' + encodeURIComponent(key);
    function setFile(o) {
        const f = keyField(); if (!f) return;
        f.textContent = o ? JSON.stringify(o) : '';
        f.dispatchEvent(new Event('input', { bubbles: true }));   // the case has changed (autosave, "unsaved changes")
        render();
    }
    const canUpload = () => !(window.mockIsViewOnly && window.mockIsViewOnly());

    function render() {
        const box = $id('client-id-card'); if (!box) return;
        const mc = libId() && mockCase(libId()), f = mc ? null : savedFile();
        const sig = mc ? 'mock:' + mc.id + '|' + (realPhoto(mc) || '') : f ? 'file:' + f.key : 'none:' + canUpload();
        if (box.dataset.sig === sig) return;
        box.dataset.sig = sig;
        if (mc) box.innerHTML = `<button type="button" class="cid-thumb" onclick="lshClientId.open()" title="Client's ID (a mock ID for training). Click to enlarge.">${mockIdSvg(mc)}</button>`;
        else if (f) box.innerHTML = `<button type="button" class="cid-thumb cid-photo" onclick="lshClientId.open()" title="Client's ID. Click to enlarge."><img src="${esc(fileUrl(f.key))}" alt="Client's ID"></button>`;
        else box.innerHTML = `<div class="cid-empty"><span>🪪 No ID on file</span>${canUpload() ? '<button type="button" class="cid-up no-print" onclick="lshClientId.pick()">⬆ Upload ID</button>' : ''}</div>`;
    }

    /* ---------- the larger view ---------- */
    function closeView() { const m = $id('cid-modal'); if (m) m.remove(); }
    function open() {
        closeView();
        const mc = libId() && mockCase(libId()), f = mc ? null : savedFile();
        if (!mc && !f) return;
        const body = mc ? `<div class="cid-big">${mockIdSvg(mc)}</div><p class="cid-note">A mock ID made from the Training Library file, for practice. It's a specimen, not a real ID${realPhoto(mc) ? '; its photo is AI-made, of a fictional person' : ''}.</p>${window.lshLibraryPhotos ? window.lshLibraryPhotos.adminBar(mc, 'id') : ''}`
            : `<div class="cid-big"><img src="${esc(fileUrl(f.key))}" alt="Client's ID"></div>
               <p class="cid-note">${f.name ? `<b title="${f.orig ? 'Original file: ' + esc(f.orig) : ''}">${esc(f.name)}</b><br>` : ''}Uploaded${f.at ? ' ' + esc(new Date(f.at).toLocaleDateString()) : ''}${f.by ? ' by ' + esc(f.by) : ''}. It's kept with the case once the case is saved.</p>
               ${canUpload() ? '<div class="cid-actions"><button type="button" onclick="lshClientId.pick()">⬆ Replace</button><button type="button" class="cid-remove" onclick="lshClientId.remove()">🗑 Remove</button></div>' : ''}`;
        document.body.insertAdjacentHTML('beforeend', `<div id="cid-modal" class="cid-modal no-print" role="dialog" aria-label="Client's ID" onclick="if(event.target===this)lshClientId.close()">
            <div class="cid-box"><div class="cid-head"><b>🪪 Client's ID</b><button type="button" class="cid-x" onclick="lshClientId.close()" aria-label="Close">✕</button></div>${body}</div></div>`);
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $id('cid-modal')) closeView(); });
    // a realistic photo was made, changed or removed (or the list came in): show it
    document.addEventListener('lsh-library-photos', () => { render(); if ($id('cid-modal') && libId() && mockCase(libId())) open(); });

    /* ---------- uploading ---------- */
    // A photo from a phone can be several MB: it is redrawn at most 1,600 px on its long side as a JPG
    // (well under the 2 MB upload limit), which also leaves the photo's location data behind.
    async function shrink(file) {
        if (!/^image\/(jpeg|png|webp|gif|bmp)$/i.test(file.type || '')) throw new Error('Choose a photo or scan of the ID (JPG, PNG or WebP).');
        let img;
        try { img = await createImageBitmap(file); } catch (e) { throw new Error('That image couldn\'t be opened. Try a JPG or PNG.'); }
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
        const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
        const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85));
        if (!blob) throw new Error('That image couldn\'t be prepared. Try another photo.');
        return new File([blob], 'client-id.jpg', { type: 'image/jpeg' });
    }
    let picker = null;
    function pick() {
        if (!canUpload()) return;
        if (!picker) {
            picker = document.createElement('input');
            picker.type = 'file'; picker.accept = 'image/jpeg,image/png,image/webp'; picker.hidden = true; picker.id = 'cid-file';
            picker.addEventListener('change', () => { const f = picker.files && picker.files[0]; picker.value = ''; if (f) upload(f); });
            document.body.appendChild(picker);
        }
        picker.click();
    }
    let busy = false;
    async function upload(file) {
        if (busy) return;
        if (typeof uploadFileToR2 !== 'function') { toast('Uploading isn\'t available here.', 'error'); return; }
        busy = true;
        const box = $id('client-id-card'); if (box) { box.dataset.sig = ''; box.innerHTML = '<div class="cid-empty"><span>Uploading…</span></div>'; }
        try {
            const named = typeof caseFileName === 'function' ? caseFileName('Client ID', 'id.jpg') : file.name;   // (shrink makes a JPG)
            const up = await uploadFileToR2(await shrink(file), 'client-id', named);
            const who = typeof getSession === 'function' && getSession();
            closeView();
            setFile({ key: up.key, name: named, orig: file.name, at: new Date().toISOString(), by: (who && (who.fullName || who.username)) || '' });
            toast('Client\'s ID uploaded. Save the case to keep it with the case.', 'success');
        } catch (e) {
            toast(e && e.message ? e.message : 'The ID couldn\'t be uploaded. Please try again.', 'error');
            render();
        } finally { busy = false; if (box && box.dataset.sig === '') render(); }
    }
    function remove() {
        if (!canUpload() || !savedFile()) return;
        if (!confirm('Remove the client\'s ID from this case?')) return;
        closeView(); setFile(null);
        toast('Client\'s ID removed. Save the case to keep the change.', 'info');
    }

    /* ---------- staying up to date ---------- */
    const later = () => setTimeout(render, 0);
    const after = (name, before) => {
        const f = window[name]; if (typeof f !== 'function' || f.__cid) return;
        const w = function () { if (before) before.apply(this, arguments); const r = f.apply(this, arguments); later(); return r; };
        w.__cid = true; window[name] = w;
    };
    function start() {
        linkSsn();
        // a saved case loaded into the editor: remember which library file it's work on (if any)
        after('applyCaseContentToDOM', (content, root) => { if (!root || root === document) loadedLibId = (content && content.trainingLibraryId) || null; });
        after('blankCaseEditorContent', () => { loadedLibId = null; });
        ['openMockCase', 'closeCase', 'loadCase'].forEach(n => after(n));
        const prevAfter = window.afterKeyedApplied;
        window.afterKeyedApplied = function () { const r = typeof prevAfter === 'function' ? prevAfter.apply(this, arguments) : undefined; later(); return r; };
        const f = keyField();
        if (f) new MutationObserver(later).observe(f, { childList: true, characterData: true, subtree: true });
        render();
    }
    window.lshClientId = { open, close: closeView, pick, remove, render, mockIdSvg: (id) => { const mc = mockCase(id); return mc ? mockIdSvg(mc) : ''; } };
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
