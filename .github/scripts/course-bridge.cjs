// The open case, told to the course that framed the CMS (course-bridge.js).
//
// A lesson frames the CMS beside the step and used to ask the trainee to copy the Case ID out of the
// case header by hand. The CMS now answers the course's question with the open case, and says so again
// when the case changes, so the course fills the box in (the course's js/cm-cms-case.js).
// Checks: nothing is sent to a page that did not ask; an LSH course may ask and is answered with the
// case header; the answer follows the case (a save that assigns the ID, another file opened); a page on
// any other site is refused; the answer carries nothing but the case header; the firm's naming convention
// is enforced on the name the trainee wrote, part by part, with what is wrong; and a document with a wrong
// name is refused with nothing uploaded.
// Usage: node .github/scripts/course-bridge.cjs   (from the repository root; needs `npm i playwright`)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const cms = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});

const failures = [];
const check = (ok, m) => { console.log((ok ? 'PASS ' : 'FAIL ') + m); if (!ok) failures.push(m); };

(async () => {
    await new Promise(r => cms.listen(0, r));
    const cmsBase = `http://localhost:${cms.address().port}/`;
    // the course: another origin (its own port), framing the CMS the way a lesson does
    const course = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        // ?beside=1 is a page sitting beside the CMS rather than framing it (a Portal simulator): it asks
        // the CMS itself, and the answer has to come back to it, not to the page that framed the CMS.
        if (/beside=1/.test(req.url)) {
            return res.end(`<!doctype html><title>Beside the CMS</title><body><p>beside</p><script>
              const cms = () => parent.document.getElementById('cms').contentWindow;
              const wait = (kind) => new Promise((done) => {
                const on = (e) => { if (e.data && e.data.lsh === kind) { removeEventListener('message', on); done(e.data); } };
                addEventListener('message', on); setTimeout(() => { removeEventListener('message', on); done(null); }, 4000);
              });
              window.askTheCms = () => { const p = wait('cms-case'); cms().postMessage({ lsh: 'cms-case?' }, '*'); return p; };
              window.fileWithTheCms = (name) => { const p = wait('cms-doc-filed');
                cms().postMessage({ lsh: 'cms-doc-file', id: 'beside1', name, category: 'Medical Records', original: 'records.pdf',
                  mime: 'application/pdf', summary: 'from a page beside the CMS', bytes: new TextEncoder().encode('%PDF-1.4 x').buffer }, '*');
                return p; };
            </script></body>`);
        }
        res.end(`<!doctype html><title>Course</title><body>
          <iframe id="cms" src="${cmsBase}" style="width:900px;height:600px"></iframe>
          <iframe id="beside" src="/?beside=1" style="width:300px;height:120px"></iframe>
          <script>
            window.heard = [];
            addEventListener('message', e => { if (e.data && e.data.lsh === 'cms-case') window.heard.push(e.data); });
            window.askCms = () => document.getElementById('cms').contentWindow.postMessage({ lsh: 'cms-case?' }, '*');
          </script></body>`);
    });
    await new Promise(r => course.listen(0, r));
    const courseBase = `http://localhost:${course.address().port}/`;

    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    page.on('pageerror', e => failures.push('page error: ' + e.message));
    // the CMS's own server, answered by the test: an upload keeps the name it is given, and a save succeeds
    let uploaded = [];
    await page.route('**/api/upload', async (route) => {
        const fd = route.request().postData() || '';
        const name = (/filename="([^"]+)"/.exec(fd) || [])[1] || 'unknown';
        uploaded.push(name);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: 'documents/test/' + name, filename: name }) });
    });
    await page.route('**/api/case-repository**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, ok: true, caseId: 'LSH-2026-MVA-000041', id: 41 }) }));
    await page.goto(courseBase, { waitUntil: 'load' });
    const frame = page.frames().find(f => f.url().startsWith(cmsBase));
    if (!frame) { console.log('FAIL the CMS frame did not load'); process.exit(1); }
    await frame.waitForFunction(() => !!window.__lshCourseBridge, null, { timeout: 15000 });

    // 1. nothing is sent to a page that did not ask
    await page.waitForTimeout(400);
    check((await page.evaluate(() => window.heard.length)) === 0, 'the CMS tells a framing page nothing until it asks');

    // 2. an LSH course asks, and is answered with the case that is open
    await frame.evaluate(() => {
        document.getElementById('case-id-field').innerText = 'LSH-2026-MVA-000041';
        document.getElementById('client-name-field').innerText = 'John Doe';
    });
    await page.evaluate(() => window.askCms());
    await page.waitForFunction(() => window.heard.length > 0, null, { timeout: 5000 }).catch(() => {});
    let heard = await page.evaluate(() => window.heard);
    check(heard.length === 1 && heard[0].caseId === 'LSH-2026-MVA-000041', `the answer carries the open case's ID: ${JSON.stringify(heard[0] || null)}`);
    // the header shows the client in capitals, and innerText is what it shows
    check(!!heard[0] && /^john doe$/i.test(heard[0].client || ''), `and the client whose file it is: ${(heard[0] || {}).client}`);
    check(!!heard[0] && Object.keys(heard[0]).sort().join(',') === 'at,caseId,client,dol,lsh,phase',
        `and nothing else from the file (the DOL, which the course's case documents follow): ${Object.keys(heard[0] || {}).sort().join(',')}`);

    // 3. the answer follows the case: a save that assigns the ID, another file opened
    await frame.evaluate(() => { document.getElementById('case-id-field').innerText = 'LSH-2026-PRL-000042'; });
    await page.waitForFunction(() => window.heard.length > 1, null, { timeout: 5000 }).catch(() => {});
    heard = await page.evaluate(() => window.heard);
    check(heard.length === 2 && heard[1].caseId === 'LSH-2026-PRL-000042', 'a new Case ID is told to the course without it asking again');
    await frame.evaluate(() => { document.getElementById('client-name-field').innerText = 'Maria Santos'; });
    await page.waitForFunction(() => window.heard.length > 2, null, { timeout: 5000 }).catch(() => {});
    heard = await page.evaluate(() => window.heard);
    check(heard.length === 3 && /^maria santos$/i.test(heard[2].client || ''), 'so is another file being opened');

    // 4. a draft with no ID yet is not dressed up as a saved case
    const draft = await frame.evaluate(() => {
        document.getElementById('case-id-field').innerText = 'Assigned on Save Case';
        return window.__lshCourseBridge.openCase().caseId;
    });
    check(draft === '', `a case with no ID yet answers with no Case ID: "${draft}"`);

    // 5. only an LSH course or the Training Portal may ask
    const verdicts = await frame.evaluate(() => {
        const a = window.__lshCourseBridge.allowed;
        return {
            course: a('https://case-management-training.legalsupporthelp.workers.dev'),
            preview: a('https://b1c2d3.case-management-training.legalsupporthelp.workers.dev'),
            portal: a('https://cm-training-activity.pages.dev'),
            evil: a('https://evil.example'),
            lookalike: a('https://legalsupporthelp.workers.dev.evil.example'),
            http: a('http://case-management-training.legalsupporthelp.workers.dev'),
            none: a('null')
        };
    });
    check(verdicts.course && verdicts.preview, 'an LSH course Worker may ask (its preview addresses too)');
    check(verdicts.portal, 'so may the LSH Training Portal');
    check(!verdicts.evil && !verdicts.lookalike, 'another site is refused, lookalike hosts included');
    check(!verdicts.http && !verdicts.none, 'and so is plain http, or a page with no origin at all');

    // ---- the naming convention, as the course's filing step sees it ----------------------------
    // (the convention itself is caseFileName in app.js; these are the refusals a trainee gets)
    await frame.evaluate(() => {
        document.getElementById('case-id-field').innerText = 'LSH-2026-MVA-000041';
        document.getElementById('client-name-field').innerText = 'Garcia, Linda';
    });
    const naming = await frame.evaluate(() => {
        const B = window.__lshCourseBridge, d = new Date();
        const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const right = `LSH-2026-MVA-000041_Garcia-Linda_Medical-Records_${day}.pdf`;
        const p = (name) => B.nameProblems(name, 'Medical Records', 'records.pdf');
        return {
            day, right,
            ok: p(right),
            dup: p(right.replace(day, day + '-2')),                     // the second of the day is still right
            spaces: p(`LSH-2026-MVA-000041_Garcia Linda_Medical-Records_${day}.pdf`),
            order: p(`LSH-2026-MVA-000041_Linda-Garcia_Medical-Records_${day}.pdf`),
            wrongCase: p(`LSH-2026-MVA-000099_Garcia-Linda_Medical-Records_${day}.pdf`),
            wrongType: p(`LSH-2026-MVA-000041_Garcia-Linda_Bills_${day}.pdf`),
            usDate: p(`LSH-2026-MVA-000041_Garcia-Linda_Medical-Records_10-16-2026.pdf`),
            ext: p(`LSH-2026-MVA-000041_Garcia-Linda_Medical-Records_${day}.PDF`),
            short: p(`records.pdf`),
            empty: p('')
        };
    });
    check(naming.ok.length === 0, `a name in the convention is accepted: ${naming.right} ${JSON.stringify(naming.ok)}`);
    check(naming.dup.length === 0, 'the second file of the same type that day ("…-2") is accepted too');
    check(/only letters, digits/i.test(naming.spaces.join(' ')), `a space in the name is refused and says so: ${JSON.stringify(naming.spaces)}`);
    check(/last name first/i.test(naming.order.join(' ')) || /Garcia-Linda/.test(naming.order.join(' ')), `the client the wrong way round is refused: ${JSON.stringify(naming.order)}`);
    check(/Case ID/i.test(naming.wrongCase.join(' ')), `another case's ID is refused: ${JSON.stringify(naming.wrongCase)}`);
    check(/type/i.test(naming.wrongType.join(' ')), `a type that isn't the category is refused: ${JSON.stringify(naming.wrongType)}`);
    check(naming.usDate.length > 0, `a date written the US way is refused: ${JSON.stringify(naming.usDate)}`);
    check(/\.pdf/i.test(naming.ext.join(' ')) && naming.ext.length > 0, `an upper-case extension is refused: ${JSON.stringify(naming.ext)}`);
    check(naming.short.length > 0 && naming.empty.length > 0, 'the file\'s own name, or no name at all, is refused');

    // ---- filing the document the course sends ---------------------------------------------------
    // the Doc Hub rows a case carries (the case editor builds them when a case opens)
    await frame.evaluate(() => ['Intake Documents', 'Medical Records', 'Police Report', 'Case Files', 'Bills'].forEach(c => addDocument(c)));
    const cats = await frame.evaluate(() => window.__lshCourseBridge.categories());
    check(cats.length > 0 && cats.some(c => /medical/i.test(c)), `the Doc Hub categories are offered to the course: ${cats.join(', ')}`);

    // the course asks the CMS to file a document: the request is answered, and a wrong name files nothing
    const refused = await page.evaluate(async (name) => {
        const bytes = new TextEncoder().encode('%PDF-1.4 a practice document').buffer;
        const f = document.getElementById('cms');
        return await new Promise(res => {
            const on = (e) => { if (e.data && e.data.lsh === 'cms-doc-filed') { removeEventListener('message', on); res(e.data); } };
            addEventListener('message', on);
            f.contentWindow.postMessage({ lsh: 'cms-doc-file', id: 'r1', name, category: 'Medical Records', original: 'records.pdf', mime: 'application/pdf', bytes }, '*', [bytes]);
            setTimeout(() => res({ timedOut: true }), 8000);
        });
    }, 'medical records.pdf');
    check(refused && refused.ok === false && (refused.problems || []).length > 0, `a document with a wrong name is refused, with what is wrong: ${JSON.stringify(refused)}`);
    check((await frame.evaluate(() => document.querySelectorAll('#doc-body .doc-attachment a[data-r2-key]').length)) === 0, 'and nothing is uploaded');

    const fileIt = (name) => page.evaluate(async (n) => {
        const bytes = new TextEncoder().encode('%PDF-1.4 a practice document').buffer;
        const f = document.getElementById('cms');
        return await new Promise(res => {
            const on = (e) => { if (e.data && e.data.lsh === 'cms-doc-filed') { removeEventListener('message', on); res(e.data); } };
            addEventListener('message', on);
            f.contentWindow.postMessage({ lsh: 'cms-doc-file', id: 'r2', name: n, category: 'Medical Records', original: 'records.pdf', mime: 'application/pdf', bytes, summary: 'Dr Patel records' }, '*', [bytes]);
            setTimeout(() => res({ timedOut: true }), 10000);
        });
    }, name);

    const filed = await fileIt(naming.right);
    check(filed && filed.ok === true && filed.name === naming.right, `a document named in the convention is filed: ${JSON.stringify(filed)}`);
    const onCase = await frame.evaluate(() => {
        const a = document.querySelector('#doc-body .doc-attachment a[data-r2-key]');
        const row = a && a.closest('tr'), label = row && row.querySelector('td div');
        // the summary is read whether or not it is still editable: a filed row is locked (cms-doc-lock.js)
        const sum = row && row.querySelector('[contenteditable]');
        return { name: a && a.getAttribute('download'), category: label && label.textContent.trim(), summary: sum && sum.innerText.trim(),
                 locked: !!(row && row.classList.contains('doc-row-locked')),
                 // the summary keeps contenteditable="true" on purpose (the case saves by position); it is
                 // locked by event instead, so the check is that typing into it does nothing.
                 summaryLocked: !!(sum && sum.dataset.docLocked === '1'),
                 typedIn: (() => {
                     if (!sum) return null;
                     const before = sum.innerText;
                     const ev = new InputEvent('beforeinput', {bubbles: true, cancelable: true, inputType: 'insertText', data: 'X'});
                     const allowed = sum.dispatchEvent(ev);
                     return {allowed, changed: sum.innerText !== before};
                 })(),
                 uploads: row ? row.querySelectorAll('input[type="file"]').length : -1,
                 buttons: row ? row.querySelectorAll('button').length : -1 };
    });
    check(onCase.name === naming.right, `it is on the case under that name: ${JSON.stringify(onCase)}`);
    check(/medical records/i.test(onCase.category || ''), 'under the category the trainee chose');
    check(/Dr Patel/.test(onCase.summary || ''), 'with what it is in the row');
    check(filed.saved === true, 'and the case is saved, so the document is still there on the next visit');
    // a filed document is part of the case record: its row is locked (cms-doc-lock.js)
    check(onCase.locked === true, 'the filed row is locked');
    check(onCase.summaryLocked === true, 'its summary is locked');
    check(onCase.typedIn && onCase.typedIn.allowed === false && onCase.typedIn.changed === false,
        `and typing into it does nothing: ${JSON.stringify(onCase.typedIn)}`);
    check(onCase.uploads === 0, 'no second file can replace what was filed');
    check(onCase.buttons === 0, 'and it cannot be detached or the row deleted');

    // a category this case does not have is refused, and says which it has
    const badCat = await page.evaluate(async () => {
        const bytes = new TextEncoder().encode('x').buffer;
        const f = document.getElementById('cms');
        return await new Promise(res => {
            const on = (e) => { if (e.data && e.data.lsh === 'cms-doc-filed') { removeEventListener('message', on); res(e.data); } };
            addEventListener('message', on);
            f.contentWindow.postMessage({ lsh: 'cms-doc-file', id: 'r3', name: 'x', category: 'Random Folder', original: 'x.pdf', mime: 'application/pdf', bytes }, '*', [bytes]);
            setTimeout(() => res({ timedOut: true }), 8000);
        });
    });
    check(badCat.ok === false && /not a Doc Hub category/i.test(badCat.error || ''), `a category the case does not have is refused: ${badCat.error}`);

    // a Training Library file is view only: nothing is filed into it
    await frame.evaluate(() => { window.mockIsViewOnly = () => true; });
    const viewOnly = await fileIt(naming.right);
    check(viewOnly.ok === false && /view only/i.test(viewOnly.error || ''), `nothing is filed into a Training Library file: ${viewOnly.error}`);
    await frame.evaluate(() => { window.mockIsViewOnly = () => false; });

    // no Case ID yet: the document would be named NO-CASE-ID_…, so it waits for the case to be saved
    await frame.evaluate(() => { document.getElementById('case-id-field').innerText = 'Assigned on Save Case'; });
    const noId = await fileIt(naming.right);
    check(noId.ok === false && /Case ID/i.test(noId.error || ''), `a case with no Case ID files nothing: ${noId.error}`);

    // the course cannot ask the CMS to do anything else
    const other = await page.evaluate(async () => {
        const f = document.getElementById('cms');
        const seen = [];
        const on = (e) => seen.push(e.data && e.data.lsh);
        addEventListener('message', on);
        ['cms-save', 'cms-delete-case', 'cms-run', 'cms-doc-list'].forEach(k => f.contentWindow.postMessage({ lsh: k, id: 'x' }, '*'));
        await new Promise(r => setTimeout(r, 500));
        removeEventListener('message', on);
        return seen.filter(k => k !== 'cms-case');   // (the open case changing is announced on its own)
    });
    check(other.length === 0, `any other request is ignored: ${JSON.stringify(other)}`);

    // ---- an asker that is not the framing page -------------------------------------------------
    // The Training Portal's Medical Records Requests simulator files the records and the itemized bill it
    // produces into the open case the same way the course's filing step does. It is not the CMS's
    // window.parent - it sits beside it - so the answer has to go back to the window that asked.
    await frame.evaluate(() => {
        document.getElementById('case-id-field').innerText = 'LSH-2026-MVA-000041';
        document.getElementById('client-name-field').innerText = 'Garcia, Linda';
    });
    const beside = page.frames().find(f => /beside=1/.test(f.url()));
    check(!!beside, 'a page beside the CMS is on the test page');
    if (beside) {
        const answer = await beside.evaluate(() => window.askTheCms());
        check(!!answer && answer.caseId === 'LSH-2026-MVA-000041',
            `a page beside the CMS is answered too, not window.parent: ${JSON.stringify(answer)}`);
        const filed = await beside.evaluate((name) => window.fileWithTheCms(name), `LSH-2026-MVA-000041_Garcia-Linda_Medical-Records_${await frame.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })}.pdf`);
        check(!!filed && filed.ok === true, `and it can file a document into the open case: ${JSON.stringify(filed)}`);
    }

    await browser.close(); cms.close(); course.close();
    if (failures.length) { console.error(`\n${failures.length} check(s) failed.`); process.exit(1); }
    console.log('\nAll good: the course is told which case is open, the convention is enforced on every name, and nothing else is answered.');
})().catch(e => { console.error(e); process.exit(1); });
