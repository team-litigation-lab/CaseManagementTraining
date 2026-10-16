/* 🔗 The open case, told to the course that framed the CMS.

   A lesson in a training course (Case Management's ⧉ Side by side) frames the CMS beside the step, and the
   step used to ask the trainee to copy the Case ID out of the case header and type it into "Log Your Work".
   The CMS is integrated with the course, so it says which case is open instead: the course fills the box in.

   How it works: the course posts {lsh:"cms-case?"} to this frame; the CMS answers that origin with
   {lsh:"cms-case", caseId, client, phase, at}, and tells it again whenever the open case changes (a case
   saved and given its ID, another file opened, the editor reset). It is the case header the CMS already
   shows — #case-id-field, #client-name-field and the phase, watched for changes — so every way a case is opened
   (a new save, My cases, the Case Library, a Training Library file) is covered without hooking each one.

   What it does not do: nothing is sent to a page that did not ask, and only an LSH course or the Training
   Portal may ask (ORIGINS). It carries the case header and nothing else from the file — no client details,
   no documents — and the course cannot ask the CMS to do anything through it: the only message it answers
   is the question above. Outside a frame the file does nothing at all. */
(function () {
    if (window.parent === window) return;   // not framed: nobody to tell

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

    const askers = new Set();   // the origins that asked, told again when the open case changes
    let last = '';

    function tell(origin, msg) {
        try { window.parent.postMessage(msg || openCase(), origin); } catch (e) { /* the parent went away */ }
    }
    function announce() {
        const now = openCase(), key = now.caseId + '|' + now.client + '|' + now.phase;
        if (key === last) return;
        last = key;
        askers.forEach(o => tell(o, now));
    }

    window.addEventListener('message', (e) => {
        if (!e.data || e.data.lsh !== 'cms-case?' || !allowed(e.origin)) return;
        const now = openCase();
        askers.add(e.origin);
        tell(e.origin, now);                                       // answered whether or not anything changed
        last = now.caseId + '|' + now.client + '|' + now.phase;    // so the next change is what announces
    });

    // for the checks (.github/scripts/course-bridge.cjs): who may ask, and what would be answered
    window.__lshCourseBridge = { allowed, openCase, origins: ORIGINS.map(String) };

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
