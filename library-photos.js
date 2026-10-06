/* =========================================================
   LSH CMS — REALISTIC PHOTOS FOR THE TRAINING LIBRARY
   ---------------------------------------------------------
   The photo on each library client's mock ID, and for a vehicle-crash file
   the crash scene and each damaged vehicle, can be a realistic photo made by
   Gemini's image model (functions/api/library-photos.js). Until a file has
   one, its drawn photo (case-photos.js) shows. Every photo keeps its mock
   labels (SPECIMEN; "AI-made training photo"), and the people in them are
   fictional. A minor's ID keeps the drawn portrait.
     - Admins: a photo's larger view has ✨ Make a realistic photo (↻ Make a
       new one), ⬆ Use my own photo and ↺ Back to the drawing; Master Control
       → Overview → 📷 Training Library photos makes every missing one.
     - The description Gemini gets is built here from the file (the client's
       age and look from case-photos.js looksOf; the crash and the vehicles
       from CRASH and the file's pd block).
     - A new photo is made smaller in the Admin's browser (a JPG, at most
       1,280 px) and kept in the site's file storage; browsers keep a copy
       (a new photo has a new address, so it shows at once).
     - The same client in two files (same name and date of birth) has one ID
       photo: the first file's.
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t, d) => { if (typeof showToast === 'function') showToast(m, t || 'info', d); };
    const P = () => window.LSHCasePhotos;
    const cases = () => (typeof MOCK_CASES !== 'undefined' ? MOCK_CASES : []);
    const mockCase = (id) => cases().find(c => c.id === id) || null;
    const session = () => (typeof getSession === 'function' ? getSession() : null);
    const isAdmin = () => { const s = session(); return !!(s && s.userType === 'Admin'); };
    const changed = () => document.dispatchEvent(new CustomEvent('lsh-library-photos'));

    /* ---------- which photos exist ---------- */
    let index = null, loading = null, failedAt = 0;
    function load(force) {
        if (loading) return loading;
        if (index && !force) return Promise.resolve(index);
        loading = fetch('/api/library-photos', { credentials: 'same-origin', cache: 'no-store' })
            .then(r => r.ok ? r.json() : Promise.reject(new Error('status ' + r.status)))
            .then(d => { index = d && d.photos && typeof d.photos === 'object' ? d.photos : {}; failedAt = 0; })
            .catch(() => { failedAt = Date.now(); })
            .then(() => { loading = null; changed(); return index; });
        return loading;
    }
    // The file whose photo a slot shows: an ID is the person's (their first file's), anything else the file's own.
    const personKey = (o) => String(((o && o.client) || {}).name || '').trim().toLowerCase() + '|' + (((o && o.client) || {}).dob || '');
    function owner(mc, kind) {
        if (kind !== 'id') return mc.id;
        const first = cases().find(o => personKey(o) === personKey(mc));
        return first ? first.id : mc.id;
    }
    const minor = (mc) => !!(P() && P().looksOf(mc).minor);
    // The realistic photo's address, or null (none yet: the drawing shows). Loads the list the first time.
    function url(mc, kind) {
        if (!mc || (kind === 'id' && minor(mc))) return null;
        if (!index) { if (!loading && Date.now() - failedAt > 30000) load(); return null; }
        const id = owner(mc, kind), v = index[id] && index[id][kind];
        return v ? `/api/library-photos?img=${encodeURIComponent(id + '/' + kind)}&v=${encodeURIComponent(v)}` : null;
    }
    // Every photo a file can have: its client's ID (unless a minor's, or the same client's earlier file has it),
    // the crash scene, each vehicle.
    function slots(mc) {
        const out = [], p = P(); if (!p || !mc) return out;
        if (!minor(mc) && owner(mc, 'id') === mc.id) out.push({ mc, kind: 'id', label: `${(mc.client || {}).name}: ID photo` });
        if (p.hasScene(mc)) out.push({ mc, kind: 'scene', label: `${mc.id}: crash scene` });
        p.vehiclePhotos(mc).forEach((ph, i) => out.push({ mc, kind: 'v' + i, label: `${mc.id}: ${ph.caption || ph.area}` }));
        return out;
    }

    /* ---------- what Gemini is asked for ---------- */
    const NOUN = { bike: 'touring motorcycle', semi: 'tractor-trailer (semi truck)', box: 'box truck', bus: 'city transit bus', van: 'van', pickup: 'pickup truck', suv: 'SUV', sedan: 'sedan' };
    const clean = (label) => String(label || '').replace(/\s*\([^)]*\)/g, '').split(' · ')[0].trim();
    // "a white 2022 Ford Transit van with "SWIFT PARCEL" lettering on the side"
    function D(v) {
        if (!v) return 'vehicle';
        let base = clean(v.label);
        if (/'s\b/.test(base)) base = '';
        const noun = NOUN[v.body] || 'car', has = /\b(bus|van|truck|pickup|suv|car|motorcycle|tractor-trailer)\b/i.test(base);
        return `${v.color} ${base ? base + (has ? '' : ' ' + noun) : noun}${v.decal ? ` with "${v.decal}" lettering on the side` : ''}`;
    }
    const N = (v) => { const b = clean(v && v.label).replace(/^\d{4}\s+/, ''); return b && !/'s\b/.test(b) ? b : (NOUN[v && v.body] || 'car'); };
    const sideOf = (hit) => /left/.test(hit) ? "driver's side" : /right/.test(hit) ? 'passenger side' : String(hit || 'side');
    const VIEW = { 'front': 'the front', 'rear': 'the rear', 'left side': "the driver's side", 'right side': 'the passenger side', 'front left': "the front driver's-side corner",
        'front right': 'the front passenger-side corner', 'rear left': "the rear driver's-side corner", 'rear right': 'the rear passenger-side corner' };
    function damageWords(area, body) {
        const kind = area === 'front' || area === 'rear' ? area : /side/.test(area) ? 'side' : 'corner';
        if (body === 'bike') return kind === 'front' ? 'the front fork bent, the front fender crushed and the headlight smashed' : 'the crash bar, saddlebag and engine guard scraped and dented';
        return { front: 'the front bumper torn loose, the hood buckled, the grille cracked and a headlight broken',
            rear: 'the rear bumper pushed in, the trunk lid or tailgate crumpled and a taillight broken',
            side: 'the doors caved in and creased, the paint scraped and a side window cracked',
            corner: 'the corner crushed: the fender crumpled, the bumper cover hanging loose and the lamp broken' }[kind];
    }
    const HAIR_COLOR = { black: 'black', dark: 'dark brown', brown: 'brown', auburn: 'auburn', blond: 'blond', gray: 'graying', white: 'white' };
    const HAIR_STYLE = { short: 'short', side: 'short, side-parted', crop: 'close-cropped', bald: 'thinning, closely trimmed', long: 'long', bob: 'chin-length', bun: 'pulled-back', curls: 'curly' };
    const NOT_REAL = 'No added text, captions, logos or watermark.';
    function promptFor(mc, kind) {
        const p = P();
        if (kind === 'id') {
            const L = p.looksOf(mc);
            return { aspect: '3:4', prompt: `A realistic photograph for the portrait on a mock identification card (a training prop; the person is fictional, not a real or famous person): `
                + `a ${L.age}-year-old ${L.female ? 'woman' : 'man'} with ${L.toneName} skin and ${HAIR_STYLE[L.style] || 'short'} ${HAIR_COLOR[L.hairName] || 'brown'} hair`
                + `${L.glasses ? ', wearing glasses' : ''}${L.beard ? ', with a short trimmed beard' : ''}, in a ${L.shirtName} ${L.female ? 'top' : 'collared shirt'}. `
                + `Head and shoulders, facing the camera, a neutral relaxed expression, even soft front lighting, a plain light gray-blue backdrop, sharp focus, natural skin texture, `
                + `like a photo taken at a DMV counter. Portrait orientation. Only the photo: no card, no border. ${NOT_REAL}` };
        }
        const cr = p.CRASH[mc.id] || {}, c = p.vehicleOf(mc, 'client'), o = p.vehicleOf(mc, 'other'), t = p.vehicleOf(mc, 'third');
        if (kind === 'scene') {
            const place = clean(cr.place) || 'a city street', item = cr.items === 'cane' ? 'a dropped wooden cane' : cr.items === 'groceries' ? 'spilled grocery bags' : 'a dropped bag';
            const what = {
                'rear-end': `a ${D(o)} has rear-ended a ${D(c)}: the ${N(o)}'s front end is crumpled into the ${N(c)}'s crushed rear bumper`,
                'chain': `a three-vehicle chain collision: a ${D(o)} rear-ended a ${D(c)}, which was pushed into the back of a ${D(t)}`,
                'head-on': `a head-on collision: the crushed front ends of a ${D(c)} and a ${D(o)} pressed together`,
                'sideswipe': `a sideswipe: a ${D(o)} has scraped along the ${sideOf(c && c.hit)} of a ${D(c)}, leaving long scrapes and dents down its side`,
                't-bone': `a broadside (T-bone) crash: the front of a ${D(o)} is pushed into the ${sideOf(c && c.hit)} doors of a ${D(c)}`,
                'backing': `a backing collision: a ${D(o)} backed into the ${sideOf(c && c.hit)} of a ${D(c)}${cr.items === 'groceries' ? '; spilled grocery bags lie beside it' : ''}`,
                'left-turn': `a ${D(o)} that turned left across traffic, its ${sideOf(o && o.hit)} dented where a ${D(c)} hit it; the ${c && c.body === 'bike' ? 'motorcycle lies on its side on the pavement beside it' : N(c) + ' is stopped against it'}`,
                'pedestrian': o && o.reversing ? `a ${D(o)} stopped halfway out of a parking space after backing into a pedestrian; ${item} lies on the asphalt behind it`
                    : `a ${D(o)} stopped just past a marked crosswalk it turned into; ${item} lies on the crosswalk and traffic cones mark the spot`,
                'hit-and-run': `a ${D(c)} pulled over at the curb after a hit-and-run: its ${VIEW[c && c.hit] ? VIEW[c.hit].replace(/^the /, '') : 'side'} is dented and scraped, and the other vehicle is gone`
            }[cr.type] || `a car crash involving a ${D(c)}`;
            const where = { intersection: /&| and /i.test(place) ? `at the intersection of ${place}` : `at an intersection on ${place}`, highway: `on the shoulder of ${place}, a multi-lane highway`,
                road: `on ${place}, a two-lane road`, parking: `in ${place}`, 'gas station': `at the exit of a gas station onto ${place}`, crosswalk: `at the ${place}` }[cr.setting] || `on ${place}`;
            const signal = { red: ', with traffic lights overhead', stop: ', with a stop sign at the corner', walk: ', with pedestrian crossing signals', school: ', with a school-zone sign' }[cr.signal] || '';
            const police = cr.type !== 'hit-and-run' && cr.setting !== 'parking' ? 'A police cruiser with its light bar on is parked behind. ' : '';
            return { aspect: '16:9', prompt: `A realistic smartphone photo of a car-crash scene minutes after it happened, for a mock accident file (a training prop): ${what}, ${where}${signal}. `
                + `${police}Broken glass and plastic on the road. Daytime, ${hashOf(mc.id) % 3 === 0 ? 'overcast' : 'clear'} sky. A wide shot from the sidewalk at eye level showing where the vehicles stopped. `
                + `No injured people, no blood, no recognizable faces, no readable license plates. ${NOT_REAL}` };
        }
        const ph = p.vehiclePhotos(mc)[+String(kind).slice(1)] || {}, v = p.vehicleOf(mc, ph.vehicle === 'other' ? 'other' : 'client') || c || o;
        const area = ph.area || 'front';
        return { aspect: '4:3', prompt: `A realistic photo taken by an insurance adjuster for a mock auto-claim file (a training prop): a ${D(v)} after a crash, parked on gravel in a tow yard `
            + `with a chain-link fence behind it, photographed from ${VIEW[area] || 'the front'} at eye level so the damage is clear: ${damageWords(area, v && v.body)}. `
            + `${ph.caption ? 'The damage to show: ' + ph.caption.replace(/[.\s]+$/, '') + '. ' : ''}Overcast daylight, natural colors, sharp focus, the whole vehicle in the frame. `
            + `The license plate is not readable. No people. ${NOT_REAL}` };
    }
    function hashOf(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

    /* ---------- making, keeping and removing a photo (Admins) ---------- */
    // A picture (a data: URL or a picked file's URL) → a JPG at most `max` px on its long side.
    function toJpeg(src, max) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const k = Math.min(1, (max || 1280) / Math.max(img.naturalWidth, img.naturalHeight));
                const cv = document.createElement('canvas');
                cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
                cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
                cv.toBlob(b => b ? resolve(b) : reject(new Error('The picture could not be made into a JPG.')), 'image/jpeg', 0.86);
            };
            img.onerror = () => reject(new Error('That file isn\'t a picture this browser can open.'));
            img.src = src;
        });
    }
    async function answer(r) {
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.success) { const e = new Error(d.error || `The server answered ${r.status}.`); e.status = r.status; throw e; }
        return d;
    }
    async function keep(id, kind, blob, model) {
        const d = await answer(await fetch(`/api/library-photos?img=${encodeURIComponent(id + '/' + kind)}`, {
            method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': blob.type || 'image/jpeg', 'X-Photo-Model': model || 'upload' }, body: blob }));
        index = index || {};
        (index[id] = index[id] || {})[kind] = d.ver || String(Date.now());
        changed();
    }
    async function make(mc, kind) {
        const { prompt, aspect } = promptFor(mc, kind), id = owner(mc, kind);
        const d = await answer(await fetch('/api/library-photos', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caseId: id, kind, prompt, aspect }) }));
        await keep(id, kind, await toJpeg(`data:${d.mime || 'image/png'};base64,${d.data}`), d.model);
    }
    async function useFile(mc, kind, file) {
        const u = URL.createObjectURL(file);
        try { await keep(owner(mc, kind), kind, await toJpeg(u), 'upload'); } finally { URL.revokeObjectURL(u); }
    }
    async function remove(mc, kind) {
        const id = owner(mc, kind);
        await answer(await fetch(`/api/library-photos?img=${encodeURIComponent(id + '/' + kind)}`, { method: 'DELETE', credentials: 'same-origin' }));
        if (index && index[id]) delete index[id][kind];
        changed();
    }

    /* ---------- the buttons in a photo's larger view ---------- */
    // HTML for the larger view of a library photo: the Admin's buttons (nothing for anyone else).
    function adminBar(mc, kind) {
        if (!isAdmin() || !mc) return '';
        if (kind === 'id' && minor(mc)) return '<p class="lp-note no-print">A minor\'s ID keeps the drawn portrait.</p>';
        const has = !!url(mc, kind), shared = kind === 'id' && owner(mc, kind) !== mc.id;
        return `<div class="lp-admin no-print" data-lp-case="${esc(mc.id)}" data-lp-kind="${esc(kind)}">
            <button type="button" data-lp="make">${has ? '↻ Make a new realistic photo' : '✨ Make a realistic photo'}</button>
            <button type="button" data-lp="upload">⬆ Use my own photo</button>
            ${has ? '<button type="button" data-lp="remove">↺ Back to the drawing</button>' : ''}
            <span class="lp-status" role="status">${shared ? `Shared with ${esc(owner(mc, kind))} (the same client).` : ''}</span></div>`;
    }
    async function run(bar, what, fn) {
        const status = bar.querySelector('.lp-status');
        bar.querySelectorAll('button').forEach(b => { b.disabled = true; });
        if (status) status.textContent = what;
        try { await fn(); toast('📷 Photo updated.', 'success'); }
        catch (e) {
            if (status) status.textContent = '⚠ ' + (e && e.message || e);
            bar.querySelectorAll('button').forEach(b => { b.disabled = false; });
        }
    }
    document.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('.lp-admin [data-lp]'); if (!btn) return;
        const bar = btn.closest('.lp-admin'), mc = mockCase(bar.dataset.lpCase), kind = bar.dataset.lpKind; if (!mc) return;
        const act = btn.dataset.lp;
        if (act === 'make') run(bar, 'Making the photo… (about 20 seconds)', () => make(mc, kind));
        else if (act === 'remove') run(bar, 'Removing…', () => remove(mc, kind));
        else if (act === 'upload') {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
            input.onchange = () => { const f = input.files && input.files[0]; if (f) run(bar, 'Saving the photo…', () => useFile(mc, kind, f)); };
            input.click();
        }
    });

    /* ---------- Master Control → Overview: every missing photo ---------- */
    let bulk = null;   // { stop, done, failed, total }
    function panel() {
        const box = $id('lp-panel'); if (!box) return;
        if (!isAdmin()) { box.innerHTML = ''; return; }
        if (!index) { box.innerHTML = `<p class="lp-note">${loading ? 'Loading…' : 'The photo list couldn\'t be loaded.'}</p><button type="button" class="lp-btn" onclick="lshLibraryPhotos.load(true)">↻ Load</button>`; return; }
        const all = cases().flatMap(slots), have = all.filter(s => url(s.mc, s.kind)), missing = all.filter(s => !url(s.mc, s.kind));
        const count = (k) => { const a = all.filter(s => k.test(s.kind)); return `${a.filter(s => url(s.mc, s.kind)).length} of ${a.length}`; };
        box.innerHTML = `<p class="lp-note">Realistic photos made by Gemini for the Training Library's files: <b>${have.length} of ${all.length}</b> made
            (client IDs ${count(/^id$/)} · crash scenes ${count(/^scene$/)} · vehicles ${count(/^v\d/)}). A file without one shows its drawn photo; a minor's ID keeps the drawn portrait.
            One photo at a time: open it larger in the file (the ID card, or the Property Damage tab's photos).</p>
            ${bulk ? `<p class="lp-note"><b>Making photos: ${bulk.done} of ${bulk.total} done${bulk.failed ? `, ${bulk.failed} not made` : ''}…</b></p><button type="button" class="lp-btn" onclick="lshLibraryPhotos.stop()">■ Stop</button>`
                : missing.length ? `<button type="button" class="lp-btn lp-go" onclick="lshLibraryPhotos.makeMissing()">✨ Make the ${missing.length} missing photo${missing.length === 1 ? '' : 's'}</button>` : '<p class="lp-note">✅ Every photo is made.</p>'}
            <div class="lp-log" id="lp-log">${bulk && bulk.last ? esc(bulk.last) : ''}</div>`;
    }
    async function makeMissing() {
        if (!isAdmin() || bulk) return;
        await load(true);
        const todo = cases().flatMap(slots).filter(s => !url(s.mc, s.kind));
        if (!todo.length) { panel(); return; }
        if (!confirm(`Make ${todo.length} realistic photo${todo.length === 1 ? '' : 's'} with Gemini?\n\nIt takes about ${Math.max(1, Math.ceil(todo.length * 20 / 3 / 60))} minute(s); keep this page open. Google bills each photo to the Gemini key's project.`)) return;
        bulk = { stop: false, done: 0, failed: 0, total: todo.length, last: '' };
        panel();
        const queue = todo.slice();
        const worker = async () => {
            while (queue.length && !bulk.stop) {
                const s = queue.shift();
                try { await make(s.mc, s.kind); bulk.done++; }
                catch (e) {
                    bulk.failed++; bulk.last = `⚠ ${s.label}: ${e && e.message || e}`;
                    // no key, billing, the limit, signed out: the rest would fail the same way
                    if ([401, 402, 403, 429, 501].includes(e && e.status)) bulk.stop = true;
                }
                panel();
            }
        };
        await Promise.all([worker(), worker(), worker()]);
        const msg = `📷 ${bulk.done} photo${bulk.done === 1 ? '' : 's'} made${bulk.failed ? `, ${bulk.failed} not made` : ''}.`;
        const last = bulk.last, failed = bulk.failed; bulk = null; panel();
        const log = $id('lp-log'); if (log && last) log.textContent = last;
        toast(msg, failed ? 'warning' : 'success', 6000);
    }
    function start() {
        document.addEventListener('lsh-library-photos', panel);
        const box = $id('lp-panel');
        // the list loads when the panel is first seen (Master Control is open)
        if (box && 'IntersectionObserver' in window) new IntersectionObserver((es) => { if (es.some(e => e.isIntersecting) && isAdmin()) { if (!index) load(); panel(); } }).observe(box);
    }

    window.lshLibraryPhotos = { load, url, slots, promptFor, adminBar, make, remove, makeMissing, stop: () => { if (bulk) bulk.stop = true; }, owner };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
