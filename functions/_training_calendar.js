// Shared helpers for the embedded Training Calendar (training-calendar.js in
// the page; /api/training-calendar and /api/calendar-google on the server).
//
// Three layers show in the calendar:
//   - the trainee's own events (training_calendar_events, saved here);
//   - the training schedule: a curated, fictional attorney caseload (TEMPLATE
//     below), dated from the trainee's users.training_start_date so every batch
//     gets it on the right days without anyone re-dating it;
//   - case deadlines from the trainee's own saved cases (case_repository's
//     sol_bar / sol_litigation / complaint_filed / discovery_cutoff / trial_date).
// A trainee can also connect a Google account and pick the attorney's calendar
// (one shared with them): the attorney's events then show in the calendar, and
// the layers they choose are copied into it (calendar_google_links / _sync).
//
// Tables are created on first use (CREATE TABLE IF NOT EXISTS), like
// front_desk_drills, so there is no manual migration.

const enc = new TextEncoder();

const DDL = [
    `CREATE TABLE IF NOT EXISTS training_calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT,
        all_day INTEGER NOT NULL DEFAULT 0,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        tz TEXT NOT NULL,
        location TEXT,
        attendees TEXT,
        notes TEXT,
        case_ref TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_training_calendar_events_user ON training_calendar_events(username, start_at)`,
    `CREATE TABLE IF NOT EXISTS calendar_prefs (
        username TEXT PRIMARY KEY,
        tz TEXT,
        layers TEXT,
        sync_layers TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
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
export async function ensureCalendarTables(db) {
    if (tablesReady) return;
    await db.batch(DDL.map(s => db.prepare(s)));
    tablesReady = true;
}

/* ---------- validation ---------- */
export const CATEGORIES = ['meeting', 'call', 'court', 'deposition', 'mediation', 'deadline', 'travel', 'other'];
export const WALL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function validTimeZone(tz) {
    if (!tz || typeof tz !== 'string' || tz.length > 64) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
}
export const DEFAULT_TZ = 'America/New_York';
export const DEFAULT_LAYERS = { mine: true, sim: true, deadlines: true, google: true };
export const DEFAULT_SYNC = { mine: true, sim: false, deadlines: false };
export function pickFlags(input, defaults) {
    const out = {};
    for (const k of Object.keys(defaults)) out[k] = input && typeof input[k] === 'boolean' ? input[k] : defaults[k];
    return out;
}
export async function readPrefs(db, username) {
    const row = await db.prepare(`SELECT tz, layers, sync_layers FROM calendar_prefs WHERE username = ?`).bind(username).first();
    const parse = (s) => { try { return JSON.parse(s || 'null'); } catch (e) { return null; } };
    return {
        tz: row && validTimeZone(row.tz) ? row.tz : DEFAULT_TZ,
        layers: pickFlags(row && parse(row.layers), DEFAULT_LAYERS),
        syncLayers: pickFlags(row && parse(row.sync_layers), DEFAULT_SYNC),
    };
}

/* ---------- the training schedule ----------
   A realistic litigation caseload arc from intake through trial, ~5 weeks.
   Fictional matters. `day` is a business-day offset from the trainee's start
   date; h:m is the attorney's local time (the calendar's time zone). Keys
   (sim:<day>-<hhmm>) stay stable so a copy in Google is updated, not doubled. */
const TEMPLATE = [
    { day: 0, h: 9, m: 0, dur: 60, cat: 'meeting', title: 'Client Intake Meeting — New Case Review', loc: 'Conference Room A', desc: 'Initial consultation and case intake for a newly assigned matter.' },
    { day: 0, h: 14, m: 0, dur: 30, cat: 'meeting', title: 'Team Case Assignment Briefing', loc: 'Zoom', desc: 'Weekly briefing on new and ongoing case assignments.' },
    { day: 1, h: 10, m: 0, dur: 90, cat: 'other', title: 'Draft Initial Complaint — Doe v. Smith', loc: '', desc: 'Draft and review the initial complaint prior to filing.' },
    { day: 2, h: 13, m: 0, dur: 30, cat: 'deadline', title: 'File Complaint with Court — Doe v. Smith', loc: 'Superior Court e-filing', desc: 'Deadline to file the complaint with the court clerk.' },
    { day: 4, h: 9, m: 30, dur: 60, cat: 'deadline', title: 'Discovery Requests Due — Johnson Matter', loc: '', desc: 'Respond to outstanding discovery requests.' },
    { day: 6, h: 11, m: 0, dur: 30, cat: 'call', title: 'Client Status Call — Martinez Case', loc: 'Phone', desc: 'Scheduled update call with the client on case progress.' },
    { day: 7, h: 14, m: 0, dur: 60, cat: 'meeting', title: 'Deposition Prep — Garcia', loc: 'Conference Room B', desc: 'Prepare questions and exhibits ahead of the Garcia deposition.' },
    { day: 9, h: 9, m: 0, dur: 180, cat: 'deposition', title: 'Deposition — Garcia v. State Farm', loc: 'Court reporter office, Suite 400', desc: 'Deposition of the defendant\'s witness.' },
    { day: 11, h: 15, m: 0, dur: 60, cat: 'court', title: 'Motion Hearing — Discovery Dispute', loc: 'Superior Court, Dept. 12', desc: 'Court hearing on a motion to compel discovery.' },
    { day: 13, h: 10, m: 0, dur: 120, cat: 'mediation', title: 'Mediation Session — Thompson Claim', loc: 'Mediation center, 3rd floor', desc: 'Mediation session with opposing counsel.' },
    { day: 14, h: 16, m: 0, dur: 30, cat: 'deadline', title: 'Discovery Cut-off — Johnson Matter', loc: '', desc: 'Deadline: all discovery must be complete.' },
    { day: 16, h: 13, m: 0, dur: 30, cat: 'deadline', title: 'Expert Witness Disclosure Deadline', loc: '', desc: 'Deadline to disclose expert witnesses and reports.' },
    { day: 17, h: 11, m: 0, dur: 90, cat: 'court', title: 'Settlement Conference — Doe v. Smith', loc: 'Superior Court, Dept. 4', desc: 'Settlement conference before the assigned judge.' },
    { day: 19, h: 9, m: 0, dur: 60, cat: 'meeting', title: 'Trial Prep Meeting', loc: 'Conference Room A', desc: 'Internal trial preparation and strategy meeting.' },
    { day: 20, h: 14, m: 0, dur: 60, cat: 'court', title: 'Pretrial Conference', loc: 'Superior Court, Dept. 12', desc: 'Final pretrial conference with the court.' },
    { day: 21, h: 13, m: 0, dur: 120, cat: 'other', title: 'CLE Seminar — Ethics in Litigation', loc: 'Bar association, Room 210', desc: 'Continuing legal education seminar.' },
    { day: 24, h: 9, m: 0, dur: 360, cat: 'court', title: 'Trial — Garcia v. State Farm (Mock)', loc: 'Superior Court, Dept. 12', desc: 'Simulated trial date for training purposes.' },
];

// Date-only arithmetic on 'YYYY-MM-DD' strings, done in UTC so it never drifts.
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const isWeekend = (d) => d.getUTCDay() === 0 || d.getUTCDay() === 6;
export function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return ymd(d);
}
function nextWeekday(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    while (isWeekend(d)) d.setUTCDate(d.getUTCDate() + 1);
    return ymd(d);
}
function addBusinessDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00Z');
    while (n > 0) { d.setUTCDate(d.getUTCDate() + 1); if (!isWeekend(d)) n--; }
    return ymd(d);
}
const wall = (dateStr, minutes) => `${dateStr}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

// Falls back to today when the account has no training start date (e.g. an Admin previewing it).
export function trainingSchedule(trainingStartDate) {
    const usedFallback = !(trainingStartDate && DATE_RE.test(trainingStartDate));
    const anchor = nextWeekday(usedFallback ? new Date().toISOString().slice(0, 10) : trainingStartDate);
    const events = TEMPLATE.map(ev => {
        const date = addBusinessDays(anchor, ev.day);
        const start = ev.h * 60 + ev.m;
        return {
            key: `sim:${ev.day}-${pad(ev.h)}${pad(ev.m)}`,
            title: ev.title, category: ev.cat, location: ev.loc, notes: ev.desc,
            start: wall(date, start), end: wall(date, Math.min(start + ev.dur, 23 * 60 + 59)),
        };
    });
    return { anchor, usedFallback, events };
}

/* ---------- case deadlines ---------- */
const DEADLINE_FIELDS = [
    ['sol_bar', 'SOL deadline'],
    ['sol_litigation', 'SOL (Litigation tab)'],
    ['complaint_filed', 'Complaint filed'],
    ['discovery_cutoff', 'Discovery cut-off'],
    ['trial_date', 'Trial date'],
];
// The case editor stores these as typed MM/DD/YYYY text; anything else is skipped.
function mdyToDate(s) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim());
    return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}
export async function caseDeadlines(db, username) {
    let rows = [];
    try {
        const r = await db.prepare(
            `SELECT id, case_id, client_name, is_draft, sol_bar, sol_litigation, complaint_filed, discovery_cutoff, trial_date
             FROM case_repository WHERE owner_username = ? ORDER BY updated_at DESC LIMIT 300`
        ).bind(username).all();
        rows = r.results || [];
    } catch (e) {
        // No case_repository yet (fresh database): no deadlines.
        return [];
    }
    const out = [];
    for (const row of rows) {
        const client = (row.client_name || '').trim() || 'Unnamed client';
        for (const [col, label] of DEADLINE_FIELDS) {
            const date = mdyToDate(row[col]);
            if (!date) continue;
            out.push({
                key: `dl:${row.id}:${col}`, date, label, title: `${label} — ${client}`,
                caseId: row.case_id || '', clientName: client, isDraft: !!row.is_draft,
            });
        }
    }
    return out;
}

/* ---------- Google OAuth + Calendar API ----------
   Needs two Pages settings (README → Training Calendar → Google setup):
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

async function tokenRequest(params) {
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
