// Name-only access for trainees who open the CMS from another LSH training
// platform (the LSH Training Portal / Training Directory, Property Damage
// Claims Training, Standard Foundational Training, EA/PA Training, Case
// Management Training).
//
// They type their name (and batch) instead of registering, and get an
// ordinary, already-approved Trainee account, so everything the CMS does for
// trainees works for them too: saved cases get the automated review and the
// AI review, Front Desk Drill scores are saved, and trainers see them in the
// trainer roster. Admins still manage these accounts like any other
// (suspend, revoke).
//
// This is convenience, not security: the platforms that link here are open
// to their trainees without a password, so the name is all the CMS asks.
// Admin access still needs an admin account and password.
//
// Tables (created on first use, like drill-results.js):
//   guest_accounts    which users rows are name-only accounts, where they came from
//   guest_login_rate  new name-only accounts per connection per hour
export const GUEST_SOURCES = {
    portal: 'LSH Training Portal',
    pd: 'Property Damage Claims Training',
    standard: 'Standard Foundational Training',
    ea: 'EA/PA Training',
    cm: 'Case Management Training'
};

// Every name-only account's username starts with this. register.js refuses it,
// so a registered account can never be reached by typing a name.
export const GUEST_PREFIX = 'guest-';
export const isGuestUsername = (u) => String(u || '').toLowerCase().startsWith(GUEST_PREFIX);

export const NEW_GUESTS_PER_HOUR = 10;

const DDL = [
    `CREATE TABLE IF NOT EXISTS guest_accounts (
        username TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        course_batch TEXT,
        first_via TEXT,
        last_via TEXT,
        program TEXT,
        created_at TEXT NOT NULL,
        last_seen TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS guest_login_rate (
        ip TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        count INTEGER NOT NULL
    )`
];
export async function ensureGuestTables(db) {
    for (const sql of DDL) await db.prepare(sql).run();
}

// A real name: letters (any language), spaces, hyphens, apostrophes and periods.
export function cleanGuestName(raw) {
    const v = String(raw || '').normalize('NFC').trim().replace(/\s+/g, ' ').replace(/[’‘`]/g, "'");
    if (v.length < 2 || v.length > 60) return '';
    if (!/^[\p{L}][\p{L}\p{M} .'\-]*$/u.test(v)) return '';
    if (!/\s/.test(v)) return '';   // first and last name
    return v;
}
// Optional course batch (e.g. B050225). '' when blank, null when invalid.
export function cleanGuestBatch(raw) {
    const v = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!v) return '';
    return /^[A-Za-z0-9][A-Za-z0-9 \-]{0,23}$/.test(v) ? v : null;
}

function slug(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
// The same name and batch always give the same account, so a trainee's work
// follows them from one visit (and one platform) to the next.
export function guestUsername(name, batch) {
    let s = slug(name).slice(0, 40);
    if (!s) { let h = 0; for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0; s = 'n' + h.toString(36); }
    const b = slug(batch).slice(0, 24);
    return GUEST_PREFIX + s + (b ? '--' + b : '');
}

// users keeps first and last name apart. The CMS joins them back together for
// display, so taking the last word as the last name keeps the full name intact.
export function splitName(full) {
    const parts = full.split(' ');
    const last = parts.pop();
    return { first: parts.join(' '), last };
}

// Map of username -> platform label for the name-only accounts.
export async function guestVia(db) {
    await ensureGuestTables(db);
    const { results } = await db.prepare(`SELECT username, last_via FROM guest_accounts`).all();
    const out = {};
    for (const r of (results || [])) out[r.username] = GUEST_SOURCES[r.last_via] || r.last_via || 'Name only';
    return out;
}
