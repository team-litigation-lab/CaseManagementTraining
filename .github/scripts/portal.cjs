// Portal-only sign-in test: with the admin password set (and PORTAL_ONLY not "off"), the CMS signs trainees in only from the
// LSH Training Portal's ticket (checked by the Portal, stubbed here), never by a typed name or a username alone, never lets a
// trainee register in the CMS, and never signs an administrator in from a ticket (they type the admin password). When several
// accounts have the trainee's name it narrows them down (Batch ID, declined registrations left out, the approved account over
// ones still waiting) and refuses, never guesses, when it can't tell them apart (two approved; one beside a suspended one).
// Usage: node .github/scripts/portal.cjs   (from the repository root; Node 22.13+)
const { DatabaseSync } = require('node:sqlite');
const path = require('path'); const { pathToFileURL } = require('url');
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
    const guest = await imp('functions/api/guest-login.js');
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
        INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Bea', 'Batch', 'b2@x.io', 'Trainee', 'B011026', 'bea_oct', 'disabled:x', 'Approved');`);
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret', MASTER_ADMIN_PASSWORD: 'ci-master-pass' };   // no PORTAL_SSO_SECRET: tickets are checked by the Portal
    // the Portal's answer, stubbed
    const answers = {
        trainee: { ok: true, first: 'Tia', last: 'Trainee', batch: 'B300926' },
        newbie: { ok: true, first: 'Nia', last: 'Newbie', batch: 'B300926' },
        revoked: { ok: true, first: 'Rex', last: 'Revoked', batch: 'B300926' },
        dee: { ok: true, first: 'Dee', last: 'Double', batch: 'B300926' }, pat: { ok: true, first: 'Pat', last: 'Pair', batch: '' },
        sam: { ok: true, first: 'Sam', last: 'Same', batch: 'B300926' }, sue: { ok: true, first: 'Sue', last: 'Split', batch: 'B300926' },
        bea: { ok: true, first: 'Bea', last: 'Batch', batch: 'B011026' },
        admin: { ok: true, admin: true }, system: { ok: true, system: true },
        forged: { ok: false, code: 'signature' }, expired: { ok: false, code: 'expired' }
    };
    globalThis.fetch = async (url, init) => {
        if (!String(url).includes('/api/verify-ticket')) throw new Error('unexpected fetch ' + url);
        const a = answers[JSON.parse(init.body).ticket];
        return new Response(JSON.stringify(a || { ok: false, code: 'format' }), { status: a && a.ok ? 200 : 401, headers: { 'Content-Type': 'application/json' } });
    };
    const call = async (mod, method, body) => { const r = await mod[method]({ request: new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) }), env }); return { status: r.status, cookie: r.headers.get('set-cookie') || '', data: await r.json().catch(() => ({})) }; };
    let r = await portalLogin.onRequestGet({ env }); const st = await r.json();
    if (!st.portalOnly || st.verifies !== 'via the Portal') fail(`status should say portalOnly via the Portal (${JSON.stringify(st)})`);
    r = await call(portalLogin, 'onRequestPost', { ticket: 'trainee' });
    if (r.status !== 200 || r.data.user.username !== 'tia' || !/lsh_session=/.test(r.cookie)) fail(`a trainee ticket should sign the registered trainee in (${r.status} ${JSON.stringify(r.data)})`);
    if (sql.prepare("SELECT status FROM users WHERE username='tia'").get().status !== 'Approved') fail('the Portal\'s approval should approve a registration still waiting in the CMS');
    r = await call(portalLogin, 'onRequestPost', { ticket: 'newbie' });
    if (r.status !== 200 || !/^guest-/.test(r.data.user.username)) fail(`a trainee with no CMS account should get an approved one (${r.status} ${JSON.stringify(r.data)})`);
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
    for (const t of ['sam', 'sue']) {
        d = await as(t);
        if (d.status !== 409 || d.cookie || d.code !== 'NEED_BATCH') fail(`${t === 'sam' ? 'two approved accounts with the same name and batch' : 'an approved account beside a suspended one'} must be refused, not guessed: ${JSON.stringify(d)}`);
    }
    for (const t of ['admin', 'system']) {
        r = await call(portalLogin, 'onRequestPost', { ticket: t });
        if (r.status !== 403 || r.data.code !== 'ADMIN_PASSWORD_REQUIRED' || r.cookie) fail(`a ${t} ticket must never sign anyone in (${r.status} ${JSON.stringify(r.data)})`);
    }
    for (const t of ['forged', 'expired', 'junk']) { r = await call(portalLogin, 'onRequestPost', { ticket: t }); if (r.status !== 401 || r.cookie) fail(`a ${t} ticket must be refused (${r.status})`); }
    r = await call(login, 'onRequestPost', { username: 'tia', portalMode: 'Trainee' });
    if (r.status !== 403 || r.cookie) fail(`a trainee must not sign in by username alone (${r.status})`);
    r = await call(login, 'onRequestPost', { username: 'tia' });
    if (r.status === 200 || r.cookie) fail(`a trainee must not sign in by username alone, whatever the tab (${r.status})`);
    r = await call(register, 'onRequestPost', { fullName: 'A B', batchId: 'B300926', username: 'abc' });
    if (r.status !== 403 || r.data.code !== 'PORTAL_REQUIRED') fail(`registration here must be refused (${r.status})`);
    r = await call(guest, 'onRequestPost', { name: 'Tia Trainee', from: 'cm' });
    if (r.status !== 403 || r.data.code !== 'PORTAL_REQUIRED') fail(`a typed name must not sign anyone in (${r.status})`);
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
