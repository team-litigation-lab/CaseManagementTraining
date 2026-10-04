// Google Calendar for the Firm Calendar (firm-calendar.js in the page;
// /api/calendar-google on the server).
//
// A trainee can connect a Google account and pick the attorney's calendar
// (one shared with them): the attorney's real events then show in the Calendar
// tab next to the firm's calendars, and the events the trainee schedules are
// copied into it (calendar_google_links / calendar_google_sync).
//
// Tables are created on first use (CREATE TABLE IF NOT EXISTS), like
// front_desk_drills, so there is no manual migration.

const enc = new TextEncoder();

const DDL = [
    `CREATE TABLE IF NOT EXISTS calendar_google_links (
        username TEXT PRIMARY KEY,
        google_email TEXT,
        refresh_token TEXT NOT NULL,
        access_token TEXT,
        access_expires INTEGER,
        scope TEXT,
        calendar_id TEXT,
        calendar_name TEXT,
        calendar_tz TEXT,
        can_write INTEGER NOT NULL DEFAULT 0,
        connected_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_sync_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS calendar_google_sync (
        username TEXT NOT NULL,
        calendar_id TEXT NOT NULL,
        local_key TEXT NOT NULL,
        google_id TEXT NOT NULL,
        hash TEXT,
        synced_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (username, calendar_id, local_key)
    )`,
];
let tablesReady = false;
export async function ensureGoogleTables(db) {
    if (tablesReady) return;
    await db.batch(DDL.map(s => db.prepare(s)));
    tablesReady = true;
}

/* ---------- validation ---------- */
export const WALL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function validTimeZone(tz) {
    if (!tz || typeof tz !== 'string' || tz.length > 64) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
}
export function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}

/* ---------- Google OAuth + Calendar API ----------
   Needs two Pages settings (README → Firm Calendar → Google Calendar):
     GOOGLE_CLIENT_ID      (plain variable; the page needs it to open Google's sign-in)
     GOOGLE_CLIENT_SECRET  (encrypted secret)
   The page gets an authorization code from Google's sign-in popup (Google
   Identity Services, popup mode) and posts it to /api/calendar-google with the
   trainee's session, so the code can only ever be attached to the account that
   asked for it. Tokens are stored encrypted (AES-GCM, key derived from
   SESSION_SECRET). */
export const GOOGLE_SCOPES = [
    'openid', 'email',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
];
export const googleConfigured = (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GCAL = 'https://www.googleapis.com/calendar/v3';

function b64url(bytes) {
    let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '=';
    const bin = atob(str); const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
async function sealKey(env) {
    if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET is not configured.');
    const raw = await crypto.subtle.digest('SHA-256', enc.encode('lsh-calendar-token|' + env.SESSION_SECRET));
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(env, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(env), enc.encode(text));
    return `${b64url(iv)}.${b64url(new Uint8Array(ct))}`;
}
export async function unseal(env, sealed) {
    const [iv, ct] = String(sealed || '').split('.');
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(iv) }, await sealKey(env), unb64url(ct));
    return new TextDecoder().decode(pt);
}
async function sha256hex(s) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
    return [...h].map(b => b.toString(16).padStart(2, '0')).join('');
}
// Google event ids allow a-v and 0-9, so a hex digest works. The same trainee
// and event always get the same id, which makes a repeated sync an update.
export async function googleEventId(username, key) {
    return 'lsh' + (await sha256hex(`${username}|${key}`)).slice(0, 40);
}
export const contentHash = async (obj) => (await sha256hex(JSON.stringify(obj))).slice(0, 24);

export class GoogleError extends Error {
    constructor(message, status = 502, code = 'GOOGLE_ERROR') { super(message); this.status = status; this.code = code; }
}

export async function tokenRequest(params) {
    const r = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
}

export async function exchangeCode(env, code) {
    const { ok, data } = await tokenRequest({
        code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: 'postmessage', grant_type: 'authorization_code',
    });
    if (!ok) throw new GoogleError(`Google sign-in failed: ${data.error_description || data.error || 'unknown error'}`, 400);
    let email = '';
    try { email = JSON.parse(new TextDecoder().decode(unb64url(String(data.id_token || '').split('.')[1] || ''))).email || ''; } catch (e) { /* no id token */ }
    return { accessToken: data.access_token, refreshToken: data.refresh_token || '', expiresIn: Number(data.expires_in) || 3600, scope: data.scope || '', email };
}

export async function revokeToken(token) {
    if (!token) return;
    try {
        await fetch(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString() });
    } catch (e) { /* best effort */ }
}

/* Google Calendar and Google Drive backup (_google_drive.js) use the same Google sign-in (one OAuth client), so one
   person's Google account gives the CMS one grant covering both, and revoking any token of it revokes the whole grant.
   Before revoking, each side checks the other isn't connected to the same Google account (otherGoogleLink); a sign-in
   that comes back without a refresh token (the account had already said yes) can use the other side's, whose grant now
   includes the new permission (sharedRefresh). */
export async function otherGoogleLink(db, table, username, email) {
    if (!email) return null;
    try { return await db.prepare(`SELECT * FROM ${table} WHERE username = ? AND google_email = ?`).bind(username, email).first(); }
    catch (e) { return null; }   // (the other side's table isn't made until it's first used)
}
export async function sharedRefresh(env, link, scopes) {
    if (!link || !link.refresh_token) return null;
    try {
        const refreshToken = await unseal(env, link.refresh_token);
        const { ok, data } = await tokenRequest({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' });
        const granted = String((data && data.scope) || '').split(/\s+/);
        if (!ok || !scopes.every(s => granted.includes(s))) return null;
        return { refreshToken, accessToken: data.access_token, expiresIn: Number(data.expires_in) || 3600 };
    } catch (e) { return null; }
}
// Give Google access back, unless the other side still uses the same Google account's grant.
export async function revokeUnlessShared(db, otherTable, username, email, token) {
    if (await otherGoogleLink(db, otherTable, username, email)) return false;
    await revokeToken(token);
    return true;
}

export async function readLink(db, username) {
    return db.prepare(`SELECT * FROM calendar_google_links WHERE username = ?`).bind(username).first();
}

// A valid access token for this link, refreshed (and saved) when it is about to expire.
async function accessToken(env, db, link, force = false) {
    if (!force && link.access_token && Number(link.access_expires) > Date.now() + 60000) {
        return unseal(env, link.access_token);
    }
    const refresh = await unseal(env, link.refresh_token);
    const { ok, data } = await tokenRequest({
        client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: refresh, grant_type: 'refresh_token',
    });
    if (!ok) {
        if (data.error === 'invalid_grant') {
            // Access was removed on Google's side (or expired): forget the link so the page offers Connect again.
            await db.prepare(`DELETE FROM calendar_google_links WHERE username = ?`).bind(link.username).run();
            throw new GoogleError('The Google connection has expired or was removed. Connect Google Calendar again.', 401, 'GOOGLE_RECONNECT');
        }
        throw new GoogleError(`Google refused to refresh access: ${data.error_description || data.error || 'unknown error'}`);
    }
    const expires = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    link.access_token = await seal(env, data.access_token);
    link.access_expires = expires;
    await db.prepare(`UPDATE calendar_google_links SET access_token = ?, access_expires = ? WHERE username = ?`)
        .bind(link.access_token, expires, link.username).run();
    return data.access_token;
}

// One Calendar API call; retries once with a fresh token if Google says the token is stale.
export async function gcal(env, db, link, method, path, body) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const token = await accessToken(env, db, link, attempt > 0);
        const r = await fetch(GCAL + path, {
            method,
            headers: Object.assign({ Authorization: `Bearer ${token}` }, body ? { 'Content-Type': 'application/json' } : {}),
            body: body ? JSON.stringify(body) : undefined,
        });
        if (r.status === 401 && attempt === 0) continue;
        const data = r.status === 204 ? {} : await r.json().catch(() => ({}));
        return { status: r.status, ok: r.ok, data };
    }
}
export const googleMessage = (res) => (res && res.data && res.data.error && res.data.error.message) || `Google Calendar error ${res ? res.status : ''}`.trim();

export const WRITE_ROLES = ['owner', 'writer'];

// What the page needs to know about the trainee's Google connection.
export async function googleStatus(env, db, username) {
    const configured = googleConfigured(env);
    const link = configured ? await readLink(db, username) : null;
    return {
        configured,
        clientId: configured ? env.GOOGLE_CLIENT_ID : '',
        scopes: GOOGLE_SCOPES.join(' '),
        connected: !!link,
        email: link ? link.google_email || '' : '',
        calendarId: link ? link.calendar_id || '' : '',
        calendarName: link ? link.calendar_name || '' : '',
        calendarTz: link ? link.calendar_tz || '' : '',
        canWrite: !!(link && link.can_write),
        lastSyncAt: link ? link.last_sync_at || null : null,
    };
}
