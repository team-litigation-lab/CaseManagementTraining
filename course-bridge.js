/* 🔗 The CMS and the course that framed it: which case is open, and filing a document into it.

   A lesson in a training course (Case Management's ⧉ Side by side) frames the CMS beside the step, and the
   step used to ask the trainee to copy the Case ID out of the case header and type it into "Log Your Work".
   The CMS is integrated with the course, so it says which case is open instead: the course fills the box in.

   How it works: the course posts {lsh:"cms-case?"} to this frame; the CMS answers that origin with
   {lsh:"cms-case", caseId, client, phase, at}, and tells it again whenever the open case changes (a case
   saved and given its ID, another file opened, the editor reset). It is the case header the CMS already
   shows — #case-id-field, #client-name-field and the phase, watched for changes — so every way a case is opened
   (a new save, My cases, the Case Library, a Training Library file) is covered without hooking each one.

   Filing a document (the course's document-filing step): the course sends the document it is teaching with
   the name the trainee wrote for it, and the CMS checks that name against the firm's convention
   (caseFileName in app.js — the one source of truth) before anything is uploaded. A name that doesn't
   follow it is refused, with what is wrong with each part, and nothing is filed; a name that does is
   uploaded into the open case under the Doc Hub category the trainee chose, exactly as an upload in the
   CMS would be, and the case is saved. The trainee types the name: the CMS never quietly corrects it.

   Who may be on the other side: the course that frames the CMS beside a step, and also a page the CMS
   itself opened — the Training Portal's Medical Records Requests simulator, launched from the CMS, files
   the records and the itemized bill it produces straight into the open case the same way. So an answer
   goes back to whoever asked (the asking window), not to window.parent by assumption, and the file works
   framed or not. Nothing else changes: an asker still has to be an allowed origin.

   What it does not do: nothing is sent to a page that did not ask, and only an LSH course, the Training
   Portal or one of its simulators may ask (ORIGINS). What it tells the course is the case header and
   nothing else from the file — no client details, no documents. What it will do is file a document an
   asker sends into the case the trainee has open; it files nothing into a Training Library file (view
   only) or a case with no Case ID, and it answers no other request. */
(function () {

    // Who may ask: an LSH course Worker (case-management-training.legalsupporthelp.workers.dev and its
    // preview addresses), the LSH Training Portal, and a local server while the checks run.
    const ORIGINS = [
        /^https:\/\/([a-z0-9-]+\.)*legalsupporthelp\.workers\.dev$/,
        /^https:\/\/([a-z0-9-]+\.)?cm-training-activity\.pages\.dev$/,
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/
    ];
    const allowed = (origin) => ORIGINS.some(re => re.test(String(origin || '')));

    const txt = (id) => { const el = document.getElementById(id); return el ? el.innerText.replace(/\s+/g, ' ').trim() : ''; };
    // a real Case ID has digits and no spaces: "LSH-----" and "Assigned on Save Case" are not one (app.js caseFileName)
    const realId = (s) => (/\d/.test(s) && /^[A-Za-z0-9-]+$/.test(s) ? s : '');

    function openCase() {
        return {
            lsh: 'cms-case',
            caseId: realId(txt('case-id-field')),
            client: txt('client-name-field'),
            phase: txt('display-phase'),
            at: new Date().toISOString()
        };
    }

    // who asked, and where to answer: the window itself, because an asker can be the page that framed
    // the CMS (window.parent) or a page the CMS opened (a simulator). Told again when the open case changes.
    const askers = new Map();   // asking window → its origin
    let last = '';

    function tell(win, origin, msg) {
        try { (win || window.parent).postMessage(msg || openCase(), origin); } catch (e) { /* that window went away */ }
    }
    function announce() {
        const now = openCase(), key = now.caseId + '|' + now.client + '|' + now.phase;
        if (key === last) return;
        last = key;
        askers.forEach((origin, win) => { if (win.closed) askers.delete(win); else tell(win, origin, now); });
    }

    window.addEventListener('message', (e) => {
        if (!e.data || !allowed(e.origin)) return;
        const from = e.source || window.parent;
        if (e.data.lsh === 'cms-case?') {
            const now = openCase();
            askers.set(from, e.origin);
            tell(from, e.origin, now);                                 // answered whether or not anything changed
            last = now.caseId + '|' + now.client + '|' + now.phase;    // so the next change is what announces
            return;
        }
        // the name the trainee wrote, checked against the convention — nothing is uploaded
        if (e.data.lsh === 'cms-doc-check') {
            const problems = nameProblems(e.data.name, e.data.category, e.data.original || e.data.name);
            tell(from, e.origin, { lsh: 'cms-doc-checked', id: e.data.id, ok: !problems.length, problems, categories: categories() });
            return;
        }
        // the document itself, filed into the open case under the trainee's chosen category
        if (e.data.lsh === 'cms-doc-file') {
            fileDocument(e.data)
                .then(out => tell(from, e.origin, Object.assign({ lsh: 'cms-doc-filed', id: e.data.id, problems: [] }, out)))
                .catch(err => tell(from, e.origin, { lsh: 'cms-doc-filed', id: e.data.id, ok: false, problems: [], error: (err && err.message) || 'The document could not be filed.' }));
            return;
        }
    });

    /* ---------- filing a document the course sends ----------
       The name the trainee wrote is checked against the firm's convention:
           <Case ID>_<Last-First>_<Type>_<YYYY-MM-DD>.<ext>
       The expected name comes from caseFileName, so the convention lives in one place. Each part is
       compared on its own, so the refusal says what to fix rather than just "wrong". */
    const MAX_BYTES = 2 * 1024 * 1024;   // DOC_UPLOAD_MAX_BYTES in app.js (and upload.js's server-side limit)
    // a second file of the same type on the same day is named "…-2": the trainee's plain name is accepted
    // either way, so the "-2" is dropped before the comparison. (Only after the date, never inside it.)
    const dropDupSuffix = (name) => name.replace(/(\d{4}-\d{2}-\d{2})-\d{1,3}(\.[A-Za-z0-9]{1,8})?$/, (m, date, ext) => date + (ext || ''));

    // The Doc Hub's categories: its own buttons (Intake, Medical, Police… each adds a row of that category), then any
    // other category a row already carries. Read from the rows alone, a case with an empty Doc Hub (every new case,
    // John Doe's included) had no categories, so every document the course sent it was refused.
    function categories() {
        const out = [];
        document.querySelectorAll('#pane-docs button[onclick^="addDocument("]').forEach(b => {
            const m = /^addDocument\('([^']+)'\)$/.exec((b.getAttribute('onclick') || '').trim());
            if (m && !out.some(x => x.toLowerCase() === m[1].toLowerCase())) out.push(m[1]);
        });
        document.querySelectorAll('#doc-body tr').forEach(tr => {
            const label = tr.querySelector('td div'); const t = label ? label.textContent.trim() : '';
            if (t && !out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t);
        });
        return out;
    }
    const rowFor = (category) => Array.from(document.querySelectorAll('#doc-body tr')).find(tr => {
        const label = tr.querySelector('td div');
        return label && label.textContent.trim().toLowerCase() === String(category || '').trim().toLowerCase();
    }) || null;
    const emptyRowFor = (category) => { const r = rowFor(category); return r && !r.querySelector('.doc-attachment a') ? r : null; };

    function nameProblems(typed, category, original) {
        const name = String(typed || '').trim(), problems = [];
        if (!name) return ['The file needs a name, in the firm\'s convention: <Case ID>_<Last-First>_<Type>_<YYYY-MM-DD>.<ext>'];
        if (/[^A-Za-z0-9._-]/.test(name)) problems.push('Only letters, digits and - _ . may be used: no spaces, commas or brackets.');
        const expected = dropDupSuffix(typeof caseFileName === 'function' ? caseFileName(category, original) : '');
        if (!expected) return ['The CMS cannot work out this file\'s name: open the case first.'];
        const parts = (s) => { const dot = s.lastIndexOf('.'); const stem = dot > 0 ? s.slice(0, dot) : s; return { bits: stem.split('_'), ext: dot > 0 ? s.slice(dot + 1) : '' }; };
        const got = parts(dropDupSuffix(name)), want = parts(expected);
        const LABEL = ['the Case ID', 'the client (last name first)', 'the type (the Doc Hub category)', 'the date it was uploaded (YYYY-MM-DD)'];
        if (got.bits.length !== want.bits.length)
            problems.push(`The name has ${got.bits.length} part${got.bits.length === 1 ? '' : 's'} separated by _, and needs ${want.bits.length}: ${LABEL.join(', ')}.`);
        want.bits.forEach((w, i) => {
            const g = got.bits[i];
            if (g === undefined || g === w) return;
            problems.push(`${LABEL[i] ? LABEL[i].charAt(0).toUpperCase() + LABEL[i].slice(1) : 'Part ' + (i + 1)} should be "${w}", not "${g}".`);
        });
        if (want.ext && got.ext.toLowerCase() !== want.ext.toLowerCase())
            problems.push(`The file is a .${want.ext} , so the name must end .${want.ext} (lower case), not ".${got.ext}".`);
        if (!problems.length && dropDupSuffix(name) !== expected) problems.push(`The name should be "${expected}".`);
        return problems;
    }

    async function fileDocument(req) {
        const open = openCase();
        if (!open.caseId) return { ok: false, error: 'No case with a Case ID is open in the CMS. Open the case (or save it, so it is given its ID) and file the document again.' };
        if (window.mockIsViewOnly && window.mockIsViewOnly()) return { ok: false, error: 'This is a Training Library file, which is view only. Open your own case and file the document there.' };
        if (typeof addDocument !== 'function' || typeof handleDocUpload !== 'function') return { ok: false, error: 'The case editor is not open in the CMS.' };
        const cats = categories();
        if (!cats.some(c => c.toLowerCase() === String(req.category || '').trim().toLowerCase()))
            return { ok: false, error: `"${req.category}" is not a Doc Hub category on this case. The categories are: ${cats.join(', ')}.`, categories: cats };
        const bytes = req.bytes instanceof ArrayBuffer ? req.bytes : null;
        if (!bytes || !bytes.byteLength) return { ok: false, error: 'The document did not arrive. Try filing it again.' };
        if (bytes.byteLength > MAX_BYTES) return { ok: false, error: 'That document is too large to file (max 2 MB).' };

        const problems = nameProblems(req.name, req.category, req.original || req.name);
        if (problems.length) return { ok: false, problems, expected: dropDupSuffix(caseFileName(req.category, req.original || req.name)) };

        let row = emptyRowFor(req.category);
        if (!row) { addDocument(req.category); row = document.getElementById('doc-body').lastElementChild; }
        const summary = row && row.querySelector('[contenteditable="true"]');
        if (summary && !summary.innerText.trim()) summary.innerText = String(req.summary || req.original || '').replace(/\.[^.]+$/, '').slice(0, 200);
        const input = row && row.querySelector('input[type="file"]');
        if (!input) return { ok: false, error: 'The Doc Hub row could not take the document.' };
        const file = new File([bytes], String(req.original || req.name), { type: req.mime || 'application/octet-stream' });
        const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
        await handleDocUpload(input);
        const link = row.querySelector('.doc-attachment a[data-r2-key]');
        if (!link) return { ok: false, error: 'The upload did not finish. Try filing the document again.' };
        let saved = false;
        try { if (typeof saveCase === 'function') { const r = await saveCase({ quiet: true }); saved = !!(r && r.ok !== false); } } catch (e) { saved = false; }
        return { ok: true, name: link.getAttribute('download') || req.name, key: link.getAttribute('data-r2-key'), category: req.category, saved };
    }

    // for the checks (.github/scripts/course-bridge.cjs): who may ask, what would be answered, the naming
    window.__lshCourseBridge = { allowed, openCase, origins: ORIGINS.map(String), nameProblems, categories };

    // the case header, watched: every way a case is opened or saved writes these
    function watch() {
        const fields = ['case-id-field', 'client-name-field', 'display-phase']
            .map(id => document.getElementById(id)).filter(Boolean);
        if (!fields.length) return false;
        const obs = new MutationObserver(announce);
        fields.forEach(el => obs.observe(el, { childList: true, characterData: true, subtree: true }));
        return true;
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch, { once: true });
    else if (!watch()) document.addEventListener('DOMContentLoaded', watch, { once: true });
})();
