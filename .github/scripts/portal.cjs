// Portal-only sign-in test: with the admin password set (and PORTAL_ONLY not "off"), the CMS signs trainees in only from the
// LSH Training Portal's ticket (checked by the Portal, stubbed here), never by a typed name or a username alone, never lets a
// trainee register in the CMS, and never signs an administrator in from a ticket (they type the admin password). When several
// accounts have the trainee's name it narrows them down (declined registrations left out first, then the Batch ID, then the
// approved account over ones still waiting) and refuses, never guesses, when it can't tell them apart (two approved; one
// beside a suspended one). The Portal's approval is the only approval: a trainee with no CMS account gets one, already
// approved, and a registration this CMS declined is reinstated — only Revoked and Suspended stay blocked.
// Usage: node .github/scripts/portal.cjs   (from the repository root; Node 22.13+)
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs'); const path = require('path'); const { pathToFileURL } = require('url');
const ROOT = process.cwd();
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
const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);
(async () => {
    const portalLogin = await imp('functions/api/portal-login.js');
    const login = await imp('functions/api/login.js');
    const register = await imp('functions/api/register.js');
    const exportApi = await imp('functions/api/export-trainees.js');
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, mi TEXT, last_name TEXT, suffix TEXT, email TEXT, user_type TEXT, batch_id TEXT, username TEXT UNIQUE, password TEXT, status TEXT, training_start_date TEXT, created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        CREATE TABLE activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_username TEXT, actor_batch TEXT, action TEXT, details TEXT, created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE deleted_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, user_type TEXT, batch_id TEXT, email TEXT, full_name TEXT, deleted_by TEXT, deleted_at TEXT NOT NULL);
        CREATE TABLE batch_id_counter (user_type TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0);
        INSERT INTO batch_id_counter VALUES ('Admin', 0), ('Trainee', 0);
        INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Tia', 'Trainee', 't@x.io', 'Trainee', 'B300926', 'tia', 'disabled:x', 'Pending');
        INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Rex', 'Revoked', 'r@x.io', 'Trainee', 'B300926', 'rex', 'disabled:x', 'Revoked');
        -- the same name more than once: a declined registration and the account in use; an approved one and one still waiting;
        -- two approved in the same batch; one approved and one suspended; two in different batches
        INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Dee', 'Double', 'd1@x.io', 'Trainee', 'B300926', 'dee_old', 'disabled:x', 'Rejected');
        INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Dee', 'Double', 'd2@x.io', 'Trainee', 'B300926', 'dee', 'disabled:x', 'Approved');
        INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Pat', 'Pair', 'p1@x.io', 'Trainee', 'B300926', 'pat', 'disabled:x', 'Approved');
        INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Pat', 'Pair', 'p2@x.io', 'Trainee', 'B300926', 'pat_again', 'disabled:x', 'Pending');
        INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Sam', 'Same', 's1@x.io', 'Trainee', 'B300926', 'sam1', 'disabled:x', 'Approved');
        INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Sam', 'Same', 's2@x.io', 'Trainee', 'B300926', 'sam2', 'disabled:x', 'Approved');
        INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Sue', 'Split', 'u1@x.io', 'Trainee', 'B300926', 'sue', 'disabled:x', 'Approved');
        INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Sue', 'Split', 'u2@x.io', 'Trainee', 'B300926', 'sue_s', 'disabled:x', 'Suspended');
        INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Bea', 'Batch', 'b1@x.io', 'Trainee', 'B300926', 'bea_sep', 'disabled:x', 'Approved');
        INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Bea', 'Batch', 'b2@x.io', 'Trainee', 'B011026', 'bea_oct', 'disabled:x', 'Approved');
        -- a registration this CMS declined, and nothing else under that name: the Portal's approval reinstates it
        INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Dan', 'Declined', 'dn@x.io', 'Trainee', 'B300926', 'dan', 'disabled:x', 'Rejected');
        -- a declined registration carrying the batch the ticket names, beside the account actually in use (no batch on it):
        -- the Batch ID must not pick the declined one (that is what told a newly registered trainee they were declined)
        INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Mia', 'Mixed', 'm1@x.io', 'Trainee', 'B300926', 'mia_old', 'disabled:x', 'Rejected');
        INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Mia', 'Mixed', 'm2@x.io', 'Trainee', NULL, 'mia', 'disabled:x', 'Approved');`);
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret', MASTER_ADMIN_PASSWORD: 'ci-master-pass' };   // no PORTAL_SSO_SECRET: tickets are checked by the Portal
    // the Portal's answer, stubbed
    const answers = {
        trainee: { ok: true, first: 'Tia', last: 'Trainee', batch: 'B300926' },
        newbie: { ok: true, first: 'Nia', last: 'Newbie', batch: 'B300926' },
        revoked: { ok: true, first: 'Rex', last: 'Revoked', batch: 'B300926' },
        coach: { ok: true, admin: true, name: 'Coach Ana' }, coach2: { ok: true, admin: true, name: 'Coach Ana' },
        dee: { ok: true, first: 'Dee', last: 'Double', batch: 'B300926' }, pat: { ok: true, first: 'Pat', last: 'Pair', batch: '' },
        sam: { ok: true, first: 'Sam', last: 'Same', batch: 'B300926' }, sue: { ok: true, first: 'Sue', last: 'Split', batch: 'B300926' },
        bea: { ok: true, first: 'Bea', last: 'Batch', batch: 'B011026' },
        dan: { ok: true, first: 'Dan', last: 'Declined', batch: 'B300926' }, mia: { ok: true, first: 'Mia', last: 'Mixed', batch: 'B300926' },
        admin: { ok: true, admin: true }, system: { ok: true, system: true },
        forged: { ok: false, code: 'signature' }, expired: { ok: false, code: 'expired' }
    };
    globalThis.fetch = async (url, init) => {
        if (!String(url).includes('/api/verify-ticket')) throw new Error('unexpected fetch ' + url);
        const a = answers[JSON.parse(init.body).ticket];
        return new Response(JSON.stringify(a || { ok: false, code: 'format' }), { status: a && a.ok ? 200 : 401, headers: { 'Content-Type': 'application/json' } });
    };
    const call = async (mod, method, body, e = env) => { const r = await mod[method]({ request: new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) }), env: e }); return { status: r.status, cookie: r.headers.get('set-cookie') || '', data: await r.json().catch(() => ({})) }; };
    let r = await portalLogin.onRequestGet({ env }); const st = await r.json();
    if (!st.portalOnly || st.verifies !== 'via the Portal') fail(`status should say portalOnly via the Portal (${JSON.stringify(st)})`);
    r = await call(portalLogin, 'onRequestPost', { ticket: 'trainee' });
    if (r.status !== 200 || r.data.user.username !== 'tia' || !/lsh_session=/.test(r.cookie)) fail(`a trainee ticket should sign the registered trainee in (${r.status} ${JSON.stringify(r.data)})`);
    if (sql.prepare("SELECT status FROM users WHERE username='tia'").get().status !== 'Approved') fail('the Portal\'s approval should approve a registration still waiting in the CMS');
    // Registration is on the Portal (api/register.js refuses it here), so a trainee with no CMS account is given
    // one from the ticket, already approved — refusing left them nowhere to register.
    r = await call(portalLogin, 'onRequestPost', { ticket: 'newbie' });
    const made = sql.prepare("SELECT * FROM users WHERE username = 'guest-nia-newbie--b300926'").get();
    if (r.status !== 200 || !r.cookie || !made) fail(`a trainee with no CMS account should be given one from the ticket (${r.status} ${JSON.stringify(r.data)})`);
    else if (made.status !== 'Approved' || made.user_type !== 'Trainee' || made.batch_id !== 'B300926' || !made.training_start_date || !/^disabled:/.test(made.password)) fail(`the account made from a ticket should be an approved trainee, with a start date and no password of its own: ${JSON.stringify(made)}`);
    const via = sql.prepare("SELECT last_via FROM guest_accounts WHERE username = 'guest-nia-newbie--b300926'").get();
    if (!via || via.last_via !== 'portal') fail(`an account made from a ticket should be noted as coming from the Portal: ${JSON.stringify(via)}`);
    r = await call(portalLogin, 'onRequestPost', { ticket: 'newbie' });   // a second visit opens the same account, not another one
    if (r.status !== 200 || sql.prepare("SELECT COUNT(*) AS n FROM users WHERE first_name = 'Nia'").get().n !== 1) fail('a second visit should open the same account, not make another');
    r = await call(portalLogin, 'onRequestPost', { ticket: 'revoked' });
    if (r.status !== 403) fail(`a revoked trainee must stay blocked (${r.status})`);
    // the same name more than once: narrowed down when it can be told apart, refused (never guessed) when it can't
    const as = async (t) => { const x = await call(portalLogin, 'onRequestPost', { ticket: t }); return { status: x.status, user: x.data.user && x.data.user.username, cookie: !!x.cookie, code: x.data.code }; };
    let d = await as('dee');
    if (d.status !== 200 || d.user !== 'dee') fail(`a declined registration with the same name should be left out: ${JSON.stringify(d)}`);
    d = await as('pat');
    if (d.status !== 200 || d.user !== 'pat' || sql.prepare("SELECT status FROM users WHERE username='pat_again'").get().status !== 'Pending') fail(`the approved account should be used over one still waiting (and that one left as it is): ${JSON.stringify(d)}`);
    d = await as('bea');
    if (d.status !== 200 || d.user !== 'bea_oct') fail(`the Portal's Batch ID should pick the account in that batch: ${JSON.stringify(d)}`);
    d = await as('dan');
    if (d.status !== 200 || d.user !== 'dan' || sql.prepare("SELECT status FROM users WHERE username='dan'").get().status !== 'Approved') fail(`the Portal's approval should reinstate a registration this CMS declined: ${JSON.stringify(d)}`);
    d = await as('mia');
    if (d.status !== 200 || d.user !== 'mia') fail(`a declined registration must not win the Batch ID narrowing over the account in use: ${JSON.stringify(d)}`);
    if (sql.prepare("SELECT status FROM users WHERE username='mia_old'").get().status !== 'Rejected') fail('the declined duplicate should be left as it is');
    for (const t of ['sam', 'sue']) {
        d = await as(t);
        if (d.status !== 409 || d.cookie || d.code !== 'NEED_BATCH') fail(`${t === 'sam' ? 'two approved accounts with the same name and batch' : 'an approved account beside a suspended one'} must be refused, not guessed: ${JSON.stringify(d)}`);
    }
    // a trainer signed in to the Portal with their own admin account: their own CMS Admin account, no password; once only
    r = await call(portalLogin, 'onRequestPost', { ticket: 'coach' });
    if (r.status !== 200 || r.data.user.userType !== 'Admin' || r.data.user.fullName !== 'Coach Ana' || !/lsh_session=/.test(r.cookie)) fail(`a trainer's admin ticket should sign them in as that trainer (${r.status} ${JSON.stringify(r.data)})`);
    const coachUser = r.data.user.username;
    r = await call(portalLogin, 'onRequestPost', { ticket: 'coach' });
    if (r.status !== 401 || r.data.code !== 'used' || r.cookie) fail(`an admin ticket used again must be refused (${r.status} ${JSON.stringify(r.data)})`);
    r = await call(portalLogin, 'onRequestPost', { ticket: 'coach2' });
    if (r.status !== 200 || r.data.user.username !== coachUser) fail(`the same trainer again should be the same CMS account (${JSON.stringify(r.data)})`);
    r = await call(portalLogin, 'onRequestPost', { ticket: 'admin' });
    if (r.status !== 200 || r.data.user.userType !== 'Admin') fail(`an admin ticket with no name should open the Master Account (${r.status} ${JSON.stringify(r.data)})`);
    r = await call(portalLogin, 'onRequestPost', { ticket: 'system' });
    if (r.status !== 403 || r.cookie) fail(`the Portal's system ticket must never sign anyone in (${r.status} ${JSON.stringify(r.data)})`);
    for (const t of ['forged', 'expired', 'junk']) { r = await call(portalLogin, 'onRequestPost', { ticket: t }); if (r.status !== 401 || r.cookie) fail(`a ${t} ticket must be refused (${r.status})`); }
    // Single sign-on: locked to the Portal, the Portal's ticket is the only way a trainee signs in. A typed username,
    // even an approved trainee's, signs no one in (with or without the Trainee tab's portalMode).
    r = await call(login, 'onRequestPost', { username: 'tia', portalMode: 'Trainee' });
    if (r.status !== 403 || r.data.code !== 'PORTAL_REQUIRED' || r.cookie) fail(`a typed username must not sign a trainee in while the CMS is locked to the Portal (${r.status} ${JSON.stringify(r.data)})`);
    r = await call(login, 'onRequestPost', { username: 'tia' });
    if (r.status === 200 || r.cookie) fail(`a typed username without portalMode must not sign a trainee in either (${r.status})`);
    // PORTAL_ONLY=off is still the way back to the username sign-in (the CMS's own tests use it)
    r = await call(login, 'onRequestPost', { username: 'tia', portalMode: 'Trainee' }, { ...env, PORTAL_ONLY: 'off' });
    if (r.status !== 200 || !/lsh_session=/.test(r.cookie)) fail(`with PORTAL_ONLY=off an approved trainee should still sign in by username (${r.status} ${JSON.stringify(r.data)})`);
    r = await call(login, 'onRequestPost', { username: 'rex' });
    if (r.status === 200 || r.cookie) fail(`a revoked trainee must not sign in by username (${r.status})`);
    r = await call(login, 'onRequestPost', { username: 'nobody-at-all' });
    if (r.status === 200 || r.cookie) fail(`an unknown username must not sign anyone in (${r.status})`);
    r = await call(register, 'onRequestPost', { fullName: 'A B', batchId: 'B300926', username: 'abc' });
    if (r.status !== 403 || r.data.code !== 'PORTAL_REQUIRED') fail(`registration here must be refused (${r.status})`);
    // A typed name must not sign anyone in. There is no longer an endpoint that could: name sign-in was
    // removed, so the check is that the route is gone rather than that it refuses.
    if (fs.existsSync(path.join(ROOT, 'functions/api/guest-login.js'))) fail('functions/api/guest-login.js is back: a typed name could sign someone in');
    r = await call(login, 'onRequestPost', { portalMode: 'Admin', password: 'ci-master-pass' });
    if (r.status !== 200 || r.data.user.user_type !== 'Admin') fail(`the admin password must still sign an admin in (${r.status})`);
    r = await call(login, 'onRequestPost', { portalMode: 'Admin', password: 'wrong' });
    if (r.status !== 401) fail(`a wrong admin password must be refused (${r.status})`);
    r = await call(exportApi, 'onRequestPost', { ticket: 'admin' });
    if (r.status !== 403) fail(`the trainee export needs the Portal's system ticket, not an admin one (${r.status})`);
    r = await call(exportApi, 'onRequestPost', { ticket: 'system' });
    if (r.status !== 200 || !Array.isArray(r.data.trainees)) fail(`the trainee export should answer the system ticket (${r.status})`);
    // PORTAL_ONLY=off is the way back
    const off = { ...env, PORTAL_ONLY: 'off' };
    r = await portalLogin.onRequestGet({ env: off }); if ((await r.json()).portalOnly) fail('PORTAL_ONLY=off should turn the lock off');
    if (failures.length) { console.error(failures.map((m, i) => `${i + 1}. ${m}`).join('\n')); process.exit(1); }
    console.log('Portal-only sign-in test passed.');
})();
