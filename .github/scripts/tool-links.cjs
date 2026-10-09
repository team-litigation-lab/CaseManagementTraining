// Training tools open signed in: no CMS log-in page.
//
// The course platforms (Foundational-Training and the other LSH course repos, js/lsh-tool-links.js)
// append a signed, short-lived ticket to every link they send here, minted by their Worker's
// /api/auth/tool-ticket with the Portal's PORTAL_SSO_SECRET. This is the CMS side of that
// handshake: functions/_portal.js checks the ticket, /api/portal-login opens the trainee's account
// and guest-access.js signs them in and gets out of the way, so a trainee arriving with a valid
// ticket lands straight on the page the link asked for and never sees a log-in form.
//
// The ticket, exactly as the course Worker signs it (and this test mints it):
//   base64url(JSON {first, last, b, exp}) + "." + base64url(HMAC-SHA256("portal-sso:" + secret, payload))
// good for 5 minutes; an administrator's is {r:"a", exp} and the Portal's own is {r:"s", exp}.
//
// Checks (the API, with PORTAL_SSO_SECRET set, so the CMS checks the signature itself and never
// calls the Portal): a real ticket signs the registered trainee in; one signed with another secret,
// one whose signature or payload is altered, an expired one and one dated too far ahead are all
// refused, with no session cookie; an administrator's and the Portal's own ticket never sign anyone
// in; the status says it verifies here.
// Checks (in a browser): arriving with a ticket signs the trainee in with no log-in form and no
// Portal notice, takes the ticket out of the address bar, and opens what the link asked for — the
// Call Simulator (?calls=1&program=&line=&mode=graded), the Front Desk Drill (?drill=1), a Training
// Library case (?mock=), the Training Library / Case Library (?library=1), the Intake folder
// (?intake=1) and the Firm Calendar (?calendar=1); an administrator's ticket shows the admin
// password instead of signing anyone in; an expired ticket leaves the normal sign-in in place and
// grants nothing.
// Usage: node .github/scripts/tool-links.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const http = require('http'); const fs = require('fs'); const path = require('path'); const { pathToFileURL } = require('url');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
function d1(db) {
    return { prepare(sql) {
        const make = (args) => ({ bind: (...a) => make(a),
            async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
            async first() { const r = db.prepare(sql).get(...args); return r === undefined ? null : { ...r }; },
            async all() { return { results: db.prepare(sql).all(...args).map(r => ({ ...r })) }; } });
        return make([]);
    } };
}
const failures = []; const fail = (m) => failures.push(m);
const SECRET = 'ci-portal-sso-secret';
const enc = new TextEncoder();
const b64url = (bytes) => Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// A ticket, signed the way the course Worker signs it (worker.js /api/auth/tool-ticket).
async function mint(claims, { secret = SECRET, exp = Date.now() + 5 * 60 * 1000 } = {}) {
    const payload = b64url(enc.encode(JSON.stringify({ ...claims, exp })));
    const key = await crypto.subtle.importKey('raw', enc.encode('portal-sso:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return `${payload}.${b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload))))}`;
}
const traineeTicket = (o) => mint({ first: 'Tia', last: 'Trainee', b: 'B300926' }, o);

(async () => {
    const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
    const portalLogin = await import(pathToFileURL(path.join(ROOT, 'functions/api/portal-login.js')).href);
    const hbApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/heartbeat.js')).href);
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, mi TEXT, last_name TEXT, suffix TEXT, email TEXT, user_type TEXT, batch_id TEXT, username TEXT UNIQUE, password TEXT, status TEXT, training_start_date TEXT, created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        CREATE TABLE activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_username TEXT, actor_batch TEXT, action TEXT, details TEXT, created_at TEXT DEFAULT (datetime('now')));
        INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Tia', 'Trainee', 't@x.io', 'Trainee', 'B300926', 'tia', 'disabled:x', 'Approved');`);
    // The CMS holds the same PORTAL_SSO_SECRET as the course platforms, so it checks the signature itself.
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret', MASTER_ADMIN_PASSWORD: 'ci-master-pass', PORTAL_SSO_SECRET: SECRET };
    // Nothing may go out to the Portal while the CMS holds the secret.
    const realFetch = globalThis.fetch;
    let wentOut = 0;
    globalThis.fetch = async (url, init) => { wentOut++; throw new Error('the CMS asked the Portal to check a ticket it can check itself: ' + url); };

    /* ---------------- the API ---------------- */
    const post = async (ticket) => {
        const r = await portalLogin.onRequestPost({ request: new Request('http://x/api/portal-login', { method: 'POST', body: JSON.stringify({ ticket }) }), env });
        return { status: r.status, cookie: r.headers.get('set-cookie') || '', data: await r.json().catch(() => ({})) };
    };
    let st = await (await portalLogin.onRequestGet({ env })).json();
    if (!st.portalOnly || !st.hasSecret || st.verifies !== 'here') fail(`with the secret set, the status should say it verifies here: ${JSON.stringify(st)}`);

    let r = await post(await traineeTicket());
    if (r.status !== 200 || !r.data.success || r.data.user.username !== 'tia' || !/lsh_session=/.test(r.cookie)) fail(`a ticket from the course platform should sign the trainee in: ${r.status} ${JSON.stringify(r.data)}`);
    if (r.data.user.via !== 'LSH Training Portal') fail(`the sign-in should be recorded as coming from the Portal: ${JSON.stringify(r.data.user)}`);
    if (wentOut) fail(`the CMS called the Portal ${wentOut} time(s) although it holds the secret`);

    // Nothing weakened: a wrong secret, a tampered signature or payload, and the clock.
    r = await post(await traineeTicket({ secret: 'not-the-portal-secret' }));
    if (r.status !== 401 || r.data.code !== 'signature' || r.cookie) fail(`a ticket signed with another secret must be refused: ${r.status} ${JSON.stringify(r.data)}`);
    const good = await traineeTicket();
    const flip = (s) => s.slice(0, -2) + (s.slice(-2, -1) === 'a' ? 'b' : 'a') + s.slice(-1);
    r = await post(flip(good));
    if (r.status !== 401 || r.data.code !== 'signature' || r.cookie) fail(`a ticket whose signature was altered must be refused: ${r.status} ${JSON.stringify(r.data)}`);
    r = await post(b64url(enc.encode(JSON.stringify({ first: 'Mal', last: 'Lory', exp: Date.now() + 60000 }))) + '.' + good.split('.')[1]);
    if (r.status !== 401 || r.data.code !== 'signature' || r.cookie) fail(`a ticket whose payload was swapped must be refused: ${r.status} ${JSON.stringify(r.data)}`);
    r = await post(await traineeTicket({ exp: Date.now() - 1000 }));
    if (r.status !== 401 || r.data.code !== 'expired' || r.cookie) fail(`an expired ticket must be refused: ${r.status} ${JSON.stringify(r.data)}`);
    r = await post(await traineeTicket({ exp: Date.now() + 60 * 60 * 1000 }));
    if (r.status !== 401 || r.data.code !== 'expired' || r.cookie) fail(`a ticket dated far ahead must be refused: ${r.status} ${JSON.stringify(r.data)}`);
    r = await post(await mint({ first: 'Tia', last: 'Trainee', b: 'B300926' }, { exp: 0 }));
    if (r.status !== 401 || r.cookie) fail(`a ticket with no expiry must be refused: ${r.status} ${JSON.stringify(r.data)}`);
    for (const [what, claims] of [['an administrator\'s', { r: 'a' }], ['the Portal\'s own system', { r: 's' }]]) {
        r = await post(await mint(claims));
        if (r.status !== 403 || r.data.code !== 'ADMIN_PASSWORD_REQUIRED' || r.cookie) fail(`${what} ticket must never sign anyone in: ${r.status} ${JSON.stringify(r.data)}`);
    }
    r = await post(await mint({ first: '', last: '', b: 'B300926' }));
    if (r.status !== 401 || r.cookie) fail(`a ticket with no name must be refused: ${r.status}`);
    for (const junk of ['', 'not-a-ticket', 'a.b.c']) { r = await post(junk); if (r.status !== 401 || r.cookie) fail(`"${junk}" must be refused: ${r.status}`); }
    globalThis.fetch = realFetch;

    /* ---------------- in a browser: a trainee arrives on a link ---------------- */
    await new Promise(res => server.listen(0, res));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const bridge = (ctx, e) => async (route) => {
        const req = route.request(), u = new URL(req.url()), m = req.method();
        const cookie = (await req.allHeaders())['cookie'] || '';
        const j = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
        const real = (method) => new Request('http://x' + u.pathname + u.search, { method, headers: { Cookie: cookie }, body: method === 'POST' ? req.postData() : undefined });
        if (u.pathname === '/api/portal-login' && m === 'GET') { const res = await portalLogin.onRequestGet({ env: e }); return route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); }
        if (u.pathname === '/api/portal-login' && m === 'POST') {
            const res = await portalLogin.onRequestPost({ request: real('POST'), env: e });
            const set = res.headers.get('set-cookie') || '';
            const token = (set.match(/lsh_session=([^;]*)/) || [])[1];
            // the real cookie is Secure/SameSite=None/Partitioned; put it in the jar plainly so it sticks over http
            if (token) await ctx.addCookies([{ name: 'lsh_session', value: token, domain: 'localhost', path: '/' }]);
            return route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
        }
        if (u.pathname === '/api/heartbeat') { const res = await hbApi.onRequestPost({ request: real('POST'), env: e }); return route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); }
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: '' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
        if (u.pathname === '/api/login') return j({ success: false, error: 'CI stops here.' }, 401);
        return j({ success: true, users: [], cases: [], results: [], entries: [], events: [], files: [], photos: [], logs: [] });
    };
    // A fresh page, arriving on a course link with a ticket on it.
    const arrive = async (query, e = env) => {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('dialog', d => d.accept());
        await page.route('**/api/**', bridge(ctx, e));
        await page.route(/cdn\.tailwindcss\.com|html2pdf/, rr => rr.fulfill({ contentType: 'text/javascript', body: '' }));
        await page.goto(base + query, { waitUntil: 'load' });
        await page.waitForTimeout(2200);
        return { ctx, page, errors };
    };
    const state = (page) => page.evaluate(() => ({
        session: (() => { try { return JSON.parse(sessionStorage.getItem('LSH_SESSION_V1') || 'null'); } catch (e) { return null; } })(),
        gate: !!document.querySelector('#auth-gate.open'),
        notice: !!document.getElementById('portal-only-overlay'),
        url: location.search,
        adminTab: !!document.querySelector('#auth-login-view:not(.hidden)')
    }));

    // every page a course link can land a trainee on
    const LANDINGS = [
        ['the Call Simulator on a line, graded', 'calls=1&program=reception&flow=standard&line=' + encodeURIComponent('Reception Mock Calls') + '&mode=graded', '#fdd-panel.open'],
        ['the Front Desk Drill', 'drill=1', '#fdd-panel.open'],
        ['a Training Library case file', 'mock=MC-04', null],
        ['the Case Library search (a trainee\'s ?library=1)', 'library=1', null],
        ['the Intake folder', 'intake=1', '#case-library-modal.open'],
        ['the Firm Calendar', 'calendar=1', '#pane-calendar.active']
    ];
    for (const [what, query, selector] of LANDINGS) {
        const t = await traineeTicket();
        const { ctx, page, errors } = await arrive('?ticket=' + encodeURIComponent(t) + '&' + query);
        const s = await state(page);
        if (!s.session || s.session.username !== 'tia') fail(`${what}: the ticket didn't sign the trainee in (${JSON.stringify(s.session)})`);
        if (s.gate || s.notice) fail(`${what}: a log-in page was shown to a trainee who arrived with a valid ticket (gate ${s.gate}, Portal notice ${s.notice})`);
        if (/ticket=/.test(s.url)) fail(`${what}: the ticket is still in the address (${s.url})`);
        if (selector) {
            await page.waitForSelector(selector, { timeout: 8000 }).catch(() => fail(`${what}: the link didn't open it (${selector})`));
        } else if (query === 'mock=MC-04') {
            await page.waitForFunction(() => (document.getElementById('client-name-field') || {}).innerText.trim().length > 2, null, { timeout: 8000 })
                .catch(() => fail(`${what}: the case file didn't open`));
        } else {
            // a trainee has no Training Library: ?library=1 puts them in the Case Library search
            // (the Training Library is for Admins), or opens the Case Library if the bar isn't on screen
            await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'cl-bar-input'
                || !!document.querySelector('#case-library-modal.open'), null, { timeout: 8000 })
                .catch(() => fail(`${what}: the trainee wasn't put in the Case Library search`));
            if (await page.isVisible('#library-modal.open')) fail(`${what}: a trainee was given the Admins' Training Library`);
        }
        if (errors.length) fail(`${what}: the page errored (${errors.slice(0, 2).join(' · ')})`);
        await ctx.close();
    }

    // an administrator's ticket: the admin password, never a sign-in
    {
        const { ctx, page } = await arrive('?ticket=' + encodeURIComponent(await mint({ r: 'a' })) + '&library=1');
        const s = await state(page);
        if (s.session) fail(`an administrator's ticket signed someone in (${JSON.stringify(s.session)})`);
        if (!s.adminTab) fail('an administrator\'s ticket should go to the admin password sign-in');
        await ctx.close();
    }
    // an expired ticket: the normal sign-in, and nothing granted
    for (const [what, ticket] of [['expired', await traineeTicket({ exp: Date.now() - 1000 })], ['wrongly signed', await traineeTicket({ secret: 'wrong' })]]) {
        const { ctx, page } = await arrive('?ticket=' + encodeURIComponent(ticket) + '&calls=1');
        const s = await state(page);
        if (s.session) fail(`an ${what} ticket signed someone in (${JSON.stringify(s.session)})`);
        if (!s.gate && !s.notice) fail(`an ${what} ticket should fall back to the normal sign-in`);
        if (await page.isVisible('#fdd-panel.open')) fail(`an ${what} ticket opened the Call Simulator anyway`);
        await ctx.close();
    }

    // The CMS not locked to Portal-only (PORTAL_ONLY=off, or no admin password set yet): its own
    // sign-in is still there, but a course link must STILL open signed in — a trainee following one
    // never meets a log-in page. Being locked in is about hiding the CMS's own sign-in, not about
    // whether a signed ticket is honoured.
    for (const [what, e] of [['PORTAL_ONLY=off', { ...env, PORTAL_ONLY: 'off' }], ['no admin password set', { ...env, MASTER_ADMIN_PASSWORD: '' }]]) {
        const { ctx, page } = await arrive('?ticket=' + encodeURIComponent(await traineeTicket()) + '&drill=1', e);
        const s2 = await state(page);
        if (!s2.session || s2.session.username !== 'tia') fail(`with ${what}, a course link didn't sign the trainee in (${JSON.stringify(s2.session)})`);
        if (s2.gate || s2.notice) fail(`with ${what}, a trainee following a course link was shown a log-in page (gate ${s2.gate}, notice ${s2.notice})`);
        await page.waitForSelector('#fdd-panel.open', { timeout: 8000 }).catch(() => fail(`with ${what}, the link didn't open the Front Desk Drill`));
        await ctx.close();
    }
    // ...and a bad ticket there leaves the CMS's own sign-in up, not the "Portal only" card
    {
        const { ctx, page } = await arrive('?ticket=' + encodeURIComponent(await traineeTicket({ exp: Date.now() - 1000 })) + '&drill=1', { ...env, PORTAL_ONLY: 'off' });
        const s3 = await state(page);
        if (s3.session) fail(`with PORTAL_ONLY=off, an expired ticket signed someone in (${JSON.stringify(s3.session)})`);
        if (s3.notice) fail('with the CMS not locked to the Portal, a bad ticket shouldn\'t say there is no sign-in here');
        if (!s3.gate) fail('with the CMS not locked to the Portal, a bad ticket should leave its own sign-in up');
        await ctx.close();
    }

    await browser.close(); server.close();
    if (failures.length) { console.error(failures.map((m, i) => `${i + 1}. ${m}`).join('\n')); process.exit(1); }
    console.log(`Training tools open signed in: ticket checked here (signature, expiry, admin and system tickets refused); ${LANDINGS.length} landing pages open with no log-in form.`);
    process.exit(0);
})().catch(e => { console.error(e); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); });
