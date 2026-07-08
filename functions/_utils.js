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

/**
 * Verifies the caller's session cookie. Use this at the top of any
 * endpoint that returns or mutates real data — never trust a
 * username/batchId/userType sent in the request body or query string.
 */
export async function requireSession(request, env, { adminOnly = false } = {}) {
    const token = getCookie(request, 'lsh_session');
    const payload = await verifySessionToken(token, env.SESSION_SECRET);
    if (!payload) {
        return { ok: false, response: json({ success: false, error: 'Not authenticated.' }, 401) };
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
export async function nextBatchId(db, userType) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const prefix = userType === 'Admin' ? 'LSHADMIN' : 'LSHTRAINEE';

    const countRow = await db.prepare(
        `SELECT COUNT(*) AS n FROM users WHERE user_type = ? AND batch_id IS NOT NULL AND batch_id != ''`
    ).bind(userType).first();
    const seq = ((countRow && countRow.n) || 0) + 1;
    const xxx = String(seq).padStart(3, '0');
    return `${year}-${prefix}-${dd}${mm}${xxx}`;
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
