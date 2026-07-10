// Shared helpers for LSH Case Management System Cloudflare Pages Functions.

export function json(data, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...extraHeaders }
    });
}

/* =====================================================================
   BASE64URL HELPERS
   ===================================================================== */
function toBase64Url(bytes) {
    let str = '';
    bytes.forEach(b => { str += String.fromCharCode(b); });
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const bin = atob(str);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}
function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
}

/* =====================================================================
   SESSION TOKENS
   Signed (HMAC-SHA256), not encrypted — payload is base64url-visible to
   the client but cannot be forged or altered without env.SESSION_SECRET,
   which only the server holds. This replaces trusting whatever the
   client claims about who's logged in.

   REQUIRES an env.SESSION_SECRET to be set:
     wrangler pages secret put SESSION_SECRET
   (or via the Cloudflare Pages dashboard -> Settings -> Environment
   variables, as an encrypted secret, NOT a plain variable).
   ===================================================================== */
async function getHmacKey(secret) {
    if (!secret) throw new Error('SESSION_SECRET is not configured.');
    const enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function createSessionToken(payload, secret, ttlSeconds = 43200 /* 12h */) {
    const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSeconds };
    const encodedBody = toBase64Url(new TextEncoder().encode(JSON.stringify(body)));
    const key = await getHmacKey(secret);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encodedBody));
    return `${encodedBody}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(token, secret) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [encodedBody, encodedSig] = token.split('.');
    if (!encodedBody || !encodedSig) return null;
    try {
        const key = await getHmacKey(secret);
        const expectedSig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encodedBody)));
        const providedSig = fromBase64Url(encodedSig);
        if (!constantTimeEqual(expectedSig, providedSig)) return null;
        const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedBody)));
        if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

export function getCookie(request, name) {
    const header = request.headers.get('Cookie') || '';
    const match = header.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}
export function sessionCookie(token, maxAgeSeconds) {
    return `lsh_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}
export function clearSessionCookie() {
    return `lsh_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/** Client heartbeat interval is 2s; grace window is 3× that. */
export const HEARTBEAT_GRACE_SECONDS = 6;

/**
 * True when the user's heartbeats row was touched within the grace window.
 * Sessions without a recent heartbeat are expired even if the signed cookie
 * has not reached its Max-Age yet (tab/browser close, idle timeout, etc.).
 */
export async function isSessionHeartbeatAlive(db, username) {
    const row = await db.prepare(
        `SELECT 1 AS ok FROM heartbeats
         WHERE username = ?
         AND datetime(last_seen) >= datetime('now', ?)`
    ).bind(username, `-${HEARTBEAT_GRACE_SECONDS} seconds`).first();
    return !!row;
}

export async function upsertSessionHeartbeat(db, { username, fullName, batchId, userType, currentCase = null }) {
    await db.prepare(
        `INSERT INTO heartbeats (username, full_name, batch_id, user_type, current_case, last_seen)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(username) DO UPDATE SET
           full_name = excluded.full_name, batch_id = excluded.batch_id,
           user_type = excluded.user_type, current_case = excluded.current_case,
           last_seen = excluded.last_seen`
    ).bind(username, fullName || username, batchId || null, userType || null, currentCase).run();
}

/**
 * Verifies the caller's session cookie. Use this at the top of any
 * endpoint that returns or mutates real data — never trust a
 * username/batchId/userType sent in the request body or query string.
 */
export async function requireSession(request, env, { adminOnly = false } = {}) {
    const token = getCookie(request, 'lsh_session');
    const payload = await verifySessionToken(token, env.SESSION_SECRET);
    if (!payload) {
        return { ok: false, response: json({ success: false, error: 'Not authenticated.', code: 'NOT_AUTHENTICATED' }, 401) };
    }
    const alive = await isSessionHeartbeatAlive(env.DB, payload.username);
    if (!alive) {
        return { ok: false, response: json({ success: false, error: 'Session expired.', code: 'SESSION_EXPIRED' }, 401) };
    }
    // Re-check the account's live status on every request, not just at
    // login. A signed session token + a live heartbeat alone would
    // otherwise keep working for up to 12h even after an admin suspends
    // (see suspend-user.js) or permanently revokes (see revoke-user.js)
    // the account — this is what makes both of those take effect against
    // an already-open session immediately instead of on next login.
    const liveUser = await env.DB.prepare(`SELECT status FROM users WHERE username = ?`).bind(payload.username).first();
    if (!liveUser || liveUser.status !== 'Approved') {
        return { ok: false, response: json({ success: false, error: 'Your access has been revoked.', code: 'ACCESS_REVOKED' }, 401) };
    }
    if (adminOnly && payload.userType !== 'Admin') {
        return { ok: false, response: json({ success: false, error: 'Admin access required.' }, 403) };
    }
    return { ok: true, session: payload };
}

export async function getSiteState(db) {
    const row = await db.prepare(`SELECT locked, locked_by_batch FROM site_state WHERE id = 1`).first();
    return { locked: !!(row && row.locked), lockedBy: row ? row.locked_by_batch : null };
}

/* =====================================================================
   MASTER ACCOUNT
   There is exactly one Master Account, identified by username. It has two
   special properties enforced wherever revocation decisions are made
   (see revoke-user.js):
     1. It is the ONLY account allowed to revoke another Admin.
     2. It can never itself be revoked, by anyone, including itself.
   ===================================================================== */
export const MASTER_USERNAME = 'LSHADMIN123';

/** True if this session belongs to the one, un-revokable Master Account. */
export function isMaster(session) {
    return !!session && session.username === MASTER_USERNAME;
}

/* =====================================================================
   PASSWORD HASHING (PBKDF2-SHA256 via Web Crypto — no external deps
   needed, works in the Workers/Pages runtime).

   Stored format: pbkdf2:<iterations>:<saltB64url>:<hashB64url>

   isLegacyPlaintext()/upgradePasswordHash() exist so existing accounts
   (currently stored as plaintext) keep working and get transparently
   upgraded to a hash the next time that user logs in successfully —
   no manual DB migration required.
   ===================================================================== */
async function pbkdf2(password, saltBytes, iterations) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, keyMaterial, 256);
    return new Uint8Array(bits);
}

export async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iterations = 100000;
    const hashBytes = await pbkdf2(password, salt, iterations);
    return `pbkdf2:${iterations}:${toBase64Url(salt)}:${toBase64Url(hashBytes)}`;
}

export async function verifyPassword(password, stored) {
    if (!stored) return false;
    if (!stored.startsWith('pbkdf2:')) {
        // Legacy plaintext row.
        return stored === password;
    }
    const parts = stored.split(':');
    if (parts.length !== 4) return false;
    const [, iterStr, saltB64, hashB64] = parts;
    const iterations = parseInt(iterStr, 10);
    const salt = fromBase64Url(saltB64);
    const expected = fromBase64Url(hashB64);
    const actual = await pbkdf2(password, salt, iterations);
    return constantTimeEqual(actual, expected);
}

export function isLegacyPlaintext(stored) {
    return !!stored && !stored.startsWith('pbkdf2:');
}

export async function upgradePasswordHash(db, userId, plainPassword) {
    try {
        const newHash = await hashPassword(plainPassword);
        await db.prepare(`UPDATE users SET password = ? WHERE id = ?`).bind(newHash, userId).run();
    } catch (e) {
        // Never let a migration failure break the login/lock flow.
        console.error('password upgrade failed', e);
    }
}

/* =====================================================================
   BATCH ID / CREDENTIAL HELPERS
   ===================================================================== */
// Batch ID format: B<DD><MM><YYYY>-LSH<TYPE>-<XXX>
// For Admins, DD/MM/YYYY is their registration date (users.created_at).
// For Trainees, DD/MM/YYYY is their start-of-training date, which they
// supply at registration (users.training_start_date) — see register.js.
// XXX is a three-digit sequence number, chronological per user type.
//
// XXX comes from an atomic, per-user-type D1 counter (same UPDATE ...
// RETURNING pattern as nextCaseId() below), rather than a COUNT(*)
// read-then-write — the old approach could let two admins approving two
// different users of the same type at nearly the same moment both read
// the same count before either write landed, producing a collision.
//
// Requires this table to exist (run once via wrangler d1 execute):
//   CREATE TABLE IF NOT EXISTS batch_id_counter (
//     user_type TEXT PRIMARY KEY,
//     value INTEGER NOT NULL DEFAULT 0
//   );
//   INSERT OR IGNORE INTO batch_id_counter (user_type, value) VALUES ('Admin', 0);
//   INSERT OR IGNORE INTO batch_id_counter (user_type, value) VALUES ('Trainee', 0);
export async function nextBatchId(db, userType, referenceDate) {
    const d = referenceDate ? new Date(referenceDate) : new Date();
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    const prefix = userType === 'Admin' ? 'LSHADMIN' : 'LSHTRAINEE';

    const row = await db.prepare(
        `UPDATE batch_id_counter SET value = value + 1 WHERE user_type = ? RETURNING value`
    ).bind(userType).first();
    if (!row || typeof row.value !== 'number') {
        throw new Error(`batch_id_counter has no row for user_type=${userType} — run the migration in _utils.js (see nextBatchId comment) before issuing Batch IDs.`);
    }
    const xxx = String(row.value).padStart(3, '0');
    return `B${dd}${mm}${yyyy}-${prefix}-${xxx}`;
}

/* =====================================================================
   PERMANENT REVOCATION / TOMBSTONE
   "Permanent Revocation" deletes the live users row entirely (disabling
   login), while keeping that user's saved cases intact (cases are linked
   by username, not by a foreign key to this row — see cases.js). To make
   sure a brand-new registrant can never accidentally inherit a deleted
   user's old cases by re-using their username, every deleted username is
   recorded here and permanently blocked from re-registration (see
   isUsernameTombstoned(), used by register.js).

   Requires this table to exist (run once via wrangler d1 execute):
     CREATE TABLE IF NOT EXISTS deleted_users (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       username TEXT NOT NULL,
       user_type TEXT,
       batch_id TEXT,
       email TEXT,
       full_name TEXT,
       deleted_by TEXT,
       deleted_at TEXT NOT NULL
     );
   ===================================================================== */
export async function tombstoneUser(db, user, deletedByUsername) {
    const fullName = [user.first_name, user.mi, user.last_name].filter(Boolean).join(' ');
    await db.prepare(
        `INSERT INTO deleted_users (username, user_type, batch_id, email, full_name, deleted_by, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(user.username, user.user_type, user.batch_id || null, user.email || null, fullName, deletedByUsername || null).run();
}

export async function isUsernameTombstoned(db, username) {
    const row = await db.prepare(`SELECT 1 AS ok FROM deleted_users WHERE username = ? LIMIT 1`).bind(username).first();
    return !!row;
}

/* =====================================================================
   CASE ID GENERATION (server-enforced, cross-device unique)
   Format: LSH-<Year>-<TypeCode>-<XXXXXX>

   The XXXXXX sequence comes from a single-row counter table incremented
   with `UPDATE ... RETURNING`. This is one atomic SQL statement — D1
   executes each individual statement atomically even though it doesn't
   support multi-statement BEGIN/COMMIT transactions — so two Save Case
   requests arriving from different devices at the same moment can never
   receive the same number.

   Requires this table to exist (run once via wrangler d1 execute):
     CREATE TABLE IF NOT EXISTS case_id_counter (
       id INTEGER PRIMARY KEY CHECK (id = 1),
       value INTEGER NOT NULL DEFAULT 0
     );
     INSERT OR IGNORE INTO case_id_counter (id, value) VALUES (1, 0);
   ===================================================================== */
export async function nextCaseId(db, typeCode) {
    const row = await db.prepare(
        `UPDATE case_id_counter SET value = value + 1 WHERE id = 1 RETURNING value`
    ).first();
    if (!row || typeof row.value !== 'number') {
        throw new Error('case_id_counter is not set up — run the migration (see _utils.js nextCaseId comment) before issuing Case IDs.');
    }
    const year = new Date().getUTCFullYear();
    const safeType = (typeCode || 'CASE').toString().replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 4) || 'CASE';
    const xxx = String(row.value).padStart(6, '0');
    return `LSH-${year}-${safeType}-${xxx}`;
}

/* =====================================================================
   PRINT SEQUENCE GENERATION (server-enforced, cross-device unique)
   Tracks how many times a given case's PDF summary has been downloaded,
   as a real atomic per-case counter — mirrors nextCaseId()'s pattern, so
   two people downloading the same case from two different devices at the
   same moment can never receive the same sequence number. This replaces
   an earlier implementation that tracked downloadCount purely in
   client-side localStorage, which could not be kept unique across
   devices/users at all.

   Requires this table to exist (run once via wrangler d1 execute):
     CREATE TABLE IF NOT EXISTS print_sequence_counter (
       case_id TEXT PRIMARY KEY,
       value INTEGER NOT NULL DEFAULT 0
     );
   ===================================================================== */
export async function nextPrintSequence(db, caseId) {
    const row = await db.prepare(
        `INSERT INTO print_sequence_counter (case_id, value) VALUES (?, 1)
         ON CONFLICT(case_id) DO UPDATE SET value = value + 1
         RETURNING value`
    ).bind(caseId).first();
    if (!row || typeof row.value !== 'number') {
        throw new Error('print_sequence_counter is not set up — run the migration (see _utils.js nextPrintSequence comment) before issuing print sequences.');
    }
    return row.value;
}

export async function verifyAdminCredentials(db, batchId, password) {
    const user = await db.prepare(
        `SELECT * FROM users WHERE batch_id = ? AND user_type = 'Admin' AND status = 'Approved'`
    ).bind(batchId).first();
    if (!user) return null;
    if (!(await verifyPassword(password, user.password))) return null;
    if (isLegacyPlaintext(user.password)) await upgradePasswordHash(db, user.id, password);
    return user;
}

export async function verifyUsernamePassword(db, username, password, userType) {
    let query = `SELECT * FROM users WHERE username = ? AND status = 'Approved'`;
    const binds = [username];
    if (userType) { query += ` AND user_type = ?`; binds.push(userType); }
    const user = await db.prepare(query).bind(...binds).first();
    if (!user) return null;
    if (!(await verifyPassword(password, user.password))) return null;
    if (isLegacyPlaintext(user.password)) await upgradePasswordHash(db, user.id, password);
    return user;
}

export async function logActivity(db, actorUsername, actorBatch, action, details) {
    try {
        await db.prepare(
            `INSERT INTO activity_log (actor_username, actor_batch, action, details) VALUES (?, ?, ?, ?)`
        ).bind(actorUsername || null, actorBatch || null, action, details ? JSON.stringify(details) : null).run();
    } catch (e) {
        console.error('activity log failed', e);
    }
}
