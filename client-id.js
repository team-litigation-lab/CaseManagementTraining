/* =========================================================
   LSH CMS — THE CLIENT'S ID AND SSN IN THE CASE HEADER
   ---------------------------------------------------------
   Client's ID (#kx-client-id, in the middle of the case header):
     - A Training Library client (mock-cases.js) has a mock ID made from their
       file: name, date of birth, address and an ID number. It is marked
       SPECIMEN · TRAINING ONLY and follows no real issuer's design. Its photo is a
       portrait drawn from the client's age (the same person looks the same in
       every file); a client with `photo: '<image url>'` in mock-cases.js shows
       that picture instead. The signature is kept in its own box under the photo.
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
    // A studio-style head-and-shoulders portrait, drawn with soft gradients, a little blur and film grain so it reads as a
    // photo rather than a pictogram. `h` is seeded by the client's name and date of birth (the same person looks the same
    // in every file); the age shapes the face (a child's rounder face and bigger eyes, grey hair and lines from the 50s).
    const REF_YEAR = 2026;   // the year the Training Library's files are set in
    function portraitSvg(h, uid, age) {
        const pick = (arr, n) => arr[Math.floor(h / n) % arr.length];
        const si = Math.floor(h / 3) % 6;
        const skin = [['#f3cfb0', '#d9a883'], ['#e7b58c', '#c68d63'], ['#d09a6e', '#a8734a'], ['#b27a50', '#8a5834'], ['#8d5a38', '#69401f'], ['#6b4228', '#4a2b17']][si];
        const lips = ['#c98282', '#b9726c', '#9e5a52', '#7f433a', '#66322b', '#4f2620'][si];
        const natural = pick(['#1c1410', '#2e1e14', '#4a3020', '#6e4a2a', '#a8793f', '#2a2a2a'], 7);
        const hair = age >= 60 ? pick(['#cfcfcf', '#b3b3b3', '#e4e4e4'], 7)
            : age >= 45 && h % 3 === 0 ? pick(['#7a7a7a', '#8d8d8d'], 7) : natural;
        const eye = pick(['#3b2a1c', '#5a3b22', '#2f4b6b', '#4b6b45'], 11);
        const cloth = pick(['#1f2a44', '#334155', '#4b5563', '#7f1d1d', '#0f4c5c', '#3f3f46'], 13);
        const bg = pick([['#cbd5e1', '#94a3b8'], ['#bfdbfe', '#7aa2d6'], ['#d6d3d1', '#a8a29e'], ['#c7d2c0', '#8fa38a']], 17);
        const style = Math.floor(h / 19) % 5;
        const glasses = age >= 25 && Math.floor(h / 32) % 100 < (age >= 55 ? 40 : 15);
        const y = age >= 18 ? 0 : Math.min(1, (18 - age) / 10);              // 0 grown up … 1 small child
        const old = Math.max(0, Math.min(1, (age - 40) / 40));                // 0 … 1: how much the face shows its age
        const cx = 42, cy = 44 + 4.5 * y, rx = 16.5 - 0.7 * y, ry = 21 - 4.5 * y;
        const eyeY = 42 + 5 * y, eRx = 3.6 + 0.9 * y, eRy = 2.1 + 0.9 * y, iris = 1.9 + 0.7 * y;
        const browY = eyeY - 6 - 0.5 * y, mouthY = 58 + 3.2 * y, noseBot = eyeY + 9 - 2 * y;
        const face = `M${cx - rx} ${cy - 2} C${cx - rx} ${cy - ry * .62} ${cx - rx * .62} ${cy - ry} ${cx} ${cy - ry} C${cx + rx * .62} ${cy - ry} ${cx + rx} ${cy - ry * .62} ${cx + rx} ${cy - 2} C${cx + rx} ${cy + ry * .55} ${cx + rx * .55} ${cy + ry * .96} ${cx} ${cy + ry} C${cx - rx * .55} ${cy + ry * .96} ${cx - rx} ${cy + ry * .55} ${cx - rx} ${cy - 2} Z`;
        const g = (n) => `${n}-${uid}`, dy = 8 * y;
        const back = [
            '',
            '',
            `<path d="M20 52 C16 18 32 8 42 8 C54 8 68 18 64 52 L68 92 L16 92 Z" fill="${hair}"/>`,
            `<g fill="${hair}"><circle cx="42" cy="26" r="21"/><circle cx="26" cy="34" r="11"/><circle cx="58" cy="34" r="11"/><circle cx="31" cy="20" r="10"/><circle cx="53" cy="20" r="10"/></g>`,
            `<circle cx="42" cy="9" r="8" fill="${hair}"/>`
        ][style];
        const front = [
            `<path d="M26 40 C24 18 33 13 43 13 C54 13 60 20 58 40 C56 31 52 27 42 27 C34 27 29 31 26 40 Z" fill="${hair}"/>`,
            `<path d="M26 40 C24 17 34 12 44 13 C55 14 60 22 58 40 C57 30 50 25 36 29 C31 31 28 35 26 40 Z" fill="${hair}"/>`,
            `<path d="M26 42 C24 19 33 13 43 13 C54 13 61 21 58 42 C57 33 54 27 44 25 C36 28 29 32 26 42 Z" fill="${hair}"/>`,
            `<path d="M27 36 C28 22 35 18 42 18 C50 18 57 22 57 36 C54 29 50 27 42 27 C34 27 30 29 27 36 Z" fill="${hair}"/>`,
            `<path d="M26 40 C25 20 34 15 43 15 C53 15 60 21 58 40 C56 31 52 27 42 27 C34 27 29 31 26 40 Z" fill="${hair}"/>`
        ][style];
        const hl = `<ellipse cx="37" cy="${style === 3 ? 12 : 19}" rx="9" ry="3.6" fill="#fff" fill-opacity=".16" transform="rotate(-18 37 ${style === 3 ? 12 : 19})"/>`;
        const lineOp = (0.1 + 0.3 * old).toFixed(2);
        const lines = old < .12 ? '' : `<g fill="none" stroke="${skin[1]}" stroke-width=".7" stroke-linecap="round" stroke-opacity="${lineOp}">
<path d="M${cx - 8} ${cy - 15} q8 -1.6 16 0"/><path d="M${cx - 7} ${cy - 11.5} q7 -1.2 14 0"/>
<path d="M${cx - 8} ${eyeY + 3.6} q3.5 1.6 7 0 M${cx + 1} ${eyeY + 3.6} q3.5 1.6 7 0"/>
<path d="M${cx - 6.5} ${noseBot - 1} q-3 5 -1.5 10 M${cx + 6.5} ${noseBot - 1} q3 5 1.5 10"/></g>`;
        const specs = !glasses ? '' : `<g fill="#fff" fill-opacity=".1" stroke="#1f2937" stroke-width="1" stroke-opacity=".85"><rect x="${cx - 14.2}" y="${eyeY - 4.6}" width="12.4" height="9.2" rx="3.2"/><rect x="${cx + 1.8}" y="${eyeY - 4.6}" width="12.4" height="9.2" rx="3.2"/><path d="M${cx - 1.8} ${eyeY - 1} q1.8 -1.4 3.6 0" fill="none"/><path d="M${cx - 14.2} ${eyeY - 1.5} L${cx - 17} ${eyeY - 2.5} M${cx + 14.2} ${eyeY - 1.5} L${cx + 17} ${eyeY - 2.5}" fill="none"/></g>`;
        return `<defs>
<linearGradient id="${g('pbg')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient>
<radialGradient id="${g('pfc')}" cx=".4" cy=".34" r=".82"><stop offset="0" stop-color="${skin[0]}"/><stop offset=".62" stop-color="${skin[0]}"/><stop offset="1" stop-color="${skin[1]}"/></radialGradient>
<linearGradient id="${g('pnk')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skin[1]}"/><stop offset="1" stop-color="${skin[0]}"/></linearGradient>
<radialGradient id="${g('pvg')}" cx=".5" cy=".45" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
<clipPath id="${g('pnc')}"><path d="M35 54 h14 v22 q-7 8 -14 0 Z"/></clipPath>
<filter id="${g('psf')}" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation=".35"/></filter>
<filter id="${g('psh')}" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="2"/></filter>
<filter id="${g('pgr')}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="${h % 97}"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .55 0"/></filter>
</defs>
<rect width="84" height="104" fill="url(#${g('pbg')})"/>
<g filter="url(#${g('psf')})">
<g transform="translate(0 ${dy})">${back}</g>
<path d="M-4 104 C -2 87 12 80 30 76 L54 76 C72 80 86 87 88 104 Z" fill="${cloth}"/>
<path d="M32 76 L42 92 L52 76 Z" fill="#f8fafc"/><path d="M32 76 L42 92 L36 76 Z M52 76 L42 92 L48 76 Z" fill="#fff" fill-opacity=".55"/>
<path d="M35 54 h14 v22 q-7 8 -14 0 Z" fill="url(#${g('pnk')})"/>
<g clip-path="url(#${g('pnc')})"><ellipse cx="${cx}" cy="${cy + ry + 1}" rx="${rx - 2}" ry="5.5" fill="#000" fill-opacity=".22" filter="url(#${g('psh')})"/></g>
<ellipse cx="${cx - rx - 0.6}" cy="${cy + 2}" rx="${2.8 + 0.6 * y}" ry="${5 + 0.4 * y}" fill="${skin[1]}"/><ellipse cx="${cx + rx + 0.6}" cy="${cy + 2}" rx="${2.8 + 0.6 * y}" ry="${5 + 0.4 * y}" fill="${skin[1]}"/>
<path d="${face}" fill="url(#${g('pfc')})"/>
<g transform="translate(0 ${dy})">${front}${hl}</g>
${lines}
<g fill="none" stroke="${hair}" stroke-width="${1.5 - 0.2 * y}" stroke-linecap="round" stroke-opacity=".85"><path d="M30.5 ${browY} Q35 ${browY - 2} 39 ${browY}"/><path d="M45 ${browY} Q49 ${browY - 2} 53.5 ${browY}"/></g>
<g><ellipse cx="35" cy="${eyeY}" rx="${eRx}" ry="${eRy}" fill="#f6f3ee"/><ellipse cx="49" cy="${eyeY}" rx="${eRx}" ry="${eRy}" fill="#f6f3ee"/>
<circle cx="35" cy="${eyeY}" r="${iris}" fill="${eye}"/><circle cx="49" cy="${eyeY}" r="${iris}" fill="${eye}"/>
<circle cx="35" cy="${eyeY}" r="${0.9 + 0.3 * y}" fill="#0b0b0b"/><circle cx="49" cy="${eyeY}" r="${0.9 + 0.3 * y}" fill="#0b0b0b"/>
<circle cx="35.6" cy="${eyeY - 0.7}" r=".5" fill="#fff"/><circle cx="49.6" cy="${eyeY - 0.7}" r=".5" fill="#fff"/>
<path d="M${35 - eRx - 0.5} ${eyeY - 0.4} Q35 ${eyeY - eRy - 2.4} ${35 + eRx + 0.5} ${eyeY - 0.4} M${49 - eRx - 0.5} ${eyeY - 0.4} Q49 ${eyeY - eRy - 2.4} ${49 + eRx + 0.5} ${eyeY - 0.4}" fill="none" stroke="#1a1210" stroke-opacity=".75" stroke-width=".9" stroke-linecap="round"/></g>
${specs}
<path d="M${cx} ${eyeY} L${cx - 1.8} ${noseBot} Q${cx} ${noseBot + 2} ${cx + 1.8} ${noseBot}" fill="none" stroke="${skin[1]}" stroke-width="1.1" stroke-linecap="round" stroke-opacity=".8"/>
<ellipse cx="${cx + 0.4}" cy="${noseBot - 3.5}" rx="1" ry="2.2" fill="#fff" fill-opacity=".16"/>
<path d="M${cx - 5.5} ${mouthY - 0.4} Q${cx - 2.5} ${mouthY - 2.2} ${cx} ${mouthY - 1.2} Q${cx + 2.5} ${mouthY - 2.2} ${cx + 5.5} ${mouthY - 0.4} Q${cx} ${mouthY + 1.2} ${cx - 5.5} ${mouthY - 0.4} Z" fill="${lips}" fill-opacity=".95"/>
<path d="M${cx - 5.5} ${mouthY - 0.4} Q${cx} ${mouthY + 4} ${cx + 5.5} ${mouthY - 0.4} Q${cx} ${mouthY + 1.2} ${cx - 5.5} ${mouthY - 0.4} Z" fill="${lips}" fill-opacity=".72"/>
<path d="M${cx - 5.5} ${mouthY - 0.4} Q${cx} ${mouthY + 1.3} ${cx + 5.5} ${mouthY - 0.4}" fill="none" stroke="#000" stroke-opacity=".28" stroke-width=".5"/>
<ellipse cx="${cx - 9}" cy="${eyeY + 9}" rx="4" ry="2.5" fill="#e11d48" fill-opacity="${0.06 + 0.05 * y}"/><ellipse cx="${cx + 9}" cy="${eyeY + 9}" rx="4" ry="2.5" fill="#e11d48" fill-opacity="${0.06 + 0.05 * y}"/>
</g>
<rect width="84" height="104" filter="url(#${g('pgr')})" opacity=".35"/>
<rect width="84" height="104" fill="url(#${g('pvg')})"/>`;
    }
    // The name as it belongs on an ID: not the file's note about who signs for the client ("(minor), by her father…").
    const idName = (n) => String(n || '').replace(/\s*\(.*$/, '').replace(/^Estate of\s+/i, '').trim();
    function mockIdSvg(mc) {
        const c = mc.client || {}, h = hash(mc.id + '|' + c.name);
        const who = idName(c.name), words = who.split(/\s+/).filter(Boolean);
        const last = words.length > 1 ? words.pop() : (words[0] || ''), first = words.length ? words.join(' ') : '';
        const md = /^(\d{2})\/(\d{2})\//.exec(c.dob || ''), mmdd = md ? `${md[1]}/${md[2]}` : '01/15';
        const yr = +((/(\d{4})\s*$/.exec(c.dob || '') || [])[1]), age = yr ? Math.max(0, REF_YEAR - yr) : 35;
        const idNo = 'T' + String(h % 100000000).padStart(8, '0');
        const addr = String(c.address || ''), cut = addr.indexOf(',');
        const line1 = (cut > 0 ? addr.slice(0, cut) : addr).toUpperCase(), line2 = (cut > 0 ? addr.slice(cut + 1).trim() : '').toUpperCase();
        const sign = `${first} ${last}`.trim();
        // The signature lives in its own box under the photo (x 16–100) and can't reach the address: it is sized
        // for a wide script font, squeezed if it still won't fit, and clipped to the box as a last resort.
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
<g clip-path="url(#cidc-${esc(mc.id)})"><g transform="translate(16 52)">${c.photo ? `<image href="${esc(c.photo)}" width="84" height="104" preserveAspectRatio="xMidYMid slice"/>` : portraitSvg(hash(who + '|' + (c.dob || '')), esc(mc.id), age)}</g></g>
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
        const sig = mc ? 'mock:' + mc.id : f ? 'file:' + f.key : 'none:' + canUpload();
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
        const body = mc ? `<div class="cid-big">${mockIdSvg(mc)}</div><p class="cid-note">A mock ID made from the Training Library file, for practice. It's a specimen, not a real ID.</p>`
            : `<div class="cid-big"><img src="${esc(fileUrl(f.key))}" alt="Client's ID"></div>
               <p class="cid-note">${f.name ? `<b title="${f.orig ? 'Original file: ' + esc(f.orig) : ''}">${esc(f.name)}</b><br>` : ''}Uploaded${f.at ? ' ' + esc(new Date(f.at).toLocaleDateString()) : ''}${f.by ? ' by ' + esc(f.by) : ''}. It's kept with the case once the case is saved.</p>
               ${canUpload() ? '<div class="cid-actions"><button type="button" onclick="lshClientId.pick()">⬆ Replace</button><button type="button" class="cid-remove" onclick="lshClientId.remove()">🗑 Remove</button></div>' : ''}`;
        document.body.insertAdjacentHTML('beforeend', `<div id="cid-modal" class="cid-modal no-print" role="dialog" aria-label="Client's ID" onclick="if(event.target===this)lshClientId.close()">
            <div class="cid-box"><div class="cid-head"><b>🪪 Client's ID</b><button type="button" class="cid-x" onclick="lshClientId.close()" aria-label="Close">✕</button></div>${body}</div></div>`);
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $id('cid-modal')) closeView(); });

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
