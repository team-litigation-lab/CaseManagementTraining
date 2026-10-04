// Name-only sign-in for trainees who open the CMS from another LSH training
// platform (the LSH Training Portal / Training Directory, Property Damage
// Claims Training, Standard Foundational Training, EA/PA Training, Case
// Management Training, Medsum & Demand Training).
//
// Trainees register in the CMS once (so their trainer can monitor their work);
// from a platform, typing their name signs them in to that registered account
// (functions/api/guest-login.js). Name-only accounts made before registration
// was required (usernames starting guest-) keep working. Admins still manage
// every account like any other (suspend, revoke).
//
// This is convenience, not security: the platforms that link here are open
// to their trainees without a password, so the name is all the CMS asks.
// Admin access still needs an admin account and password.
//
// Tables (created on first use, like drill-results.js):
//   guest_accounts    which users rows are name-only accounts, where they came from
//   guest_login_rate  failed name look-ups per connection per hour (guest-login.js)
export const GUEST_SOURCES = {
    portal: 'LSH Training Portal',
    pd: 'Property Damage Claims Training',
    standard: 'Standard Foundational Training',
    ea: 'EA/PA Training',
    cm: 'Case Management Training',
    md: 'Medsum & Demand Training'
};

// Every name-only account's username starts with this. register.js refuses it,
// so a registered account can never be reached by typing a name.
export const GUEST_PREFIX = 'guest-';
export const isGuestUsername = (u) => String(u || '').toLowerCase().startsWith(GUEST_PREFIX);

// Trainers sign in to the Admin Portal with their name and the admin password
// (functions/api/login.js): each name gets its own Admin account, made on first
// use. register.js refuses this prefix too, so no one can register into one.
export const TRAINER_PREFIX = 'trainer-';
export const isTrainerUsername = (u) => String(u || '').toLowerCase().startsWith(TRAINER_PREFIX);

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

// Registration's one Full Name box, split into the users columns. A middle initial
// ("P" or "P.") between the first and last names splits them there, so "Juan P. Dela
// Cruz" keeps "Dela Cruz" whole; a suffix (Jr., Sr., II to V) at the end goes to suffix;
// otherwise the last word is the last name, as splitName does. The full name reads the
// same either way (buildFullName in _utils.js), and name sign-in still finds it.
const SUFFIX_RE = /^(jr|sr|ii|iii|iv|v)\.?$/i;
export function parseFullName(full) {
    const words = String(full || '').split(' ');
    let suffix = null;
    if (words.length > 2 && SUFFIX_RE.test(words[words.length - 1])) suffix = words.pop();
    const i = words.findIndex((w, k) => k > 0 && k < words.length - 1 && /^\p{L}\.?$/u.test(w));
    if (i > 0) return { first: words.slice(0, i).join(' '), mi: words[i].replace('.', '').toUpperCase(), last: words.slice(i + 1).join(' '), suffix };
    const last = words.pop();
    return { first: words.join(' '), mi: null, last, suffix };
}

// The same name always gives the same trainer account.
export function trainerUsername(name) {
    let s = slug(name).slice(0, 48);
    if (!s) { let h = 0; for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0; s = 'n' + h.toString(36); }
    return TRAINER_PREFIX + s;
}

// Map of username -> platform label for the name-only accounts.
export async function guestVia(db) {
    await ensureGuestTables(db);
    const { results } = await db.prepare(`SELECT username, last_via FROM guest_accounts`).all();
    const out = {};
    for (const r of (results || [])) out[r.username] = GUEST_SOURCES[r.last_via] || r.last_via || 'Name only';
    return out;
}
