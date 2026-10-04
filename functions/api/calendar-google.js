import { json, requireSession } from '../_utils.js';
import {
    ensureGoogleTables, googleConfigured, googleStatus, readLink, exchangeCode, seal, unseal, revokeUnlessShared, otherGoogleLink, sharedRefresh,
    gcal, googleMessage, googleEventId, contentHash, GoogleError, GOOGLE_SCOPES, WRITE_ROLES,
    WALL_RE, DATE_RE, validTimeZone, addDays,
} from '../_google_calendar.js';

// Connects the Firm Calendar (the Calendar tab) to the attorney's Google Calendar.
//
// The trainee signs in to Google in a popup (Google Identity Services, code
// model) and picks the attorney's calendar from the calendars their Google
// account can see (the attorney shares it with them). Then:
//   - the attorney's events show in the Calendar tab (GET ?action=events);
//   - the events the trainee schedules there are copied into that calendar
//     (POST push / remove). Each copy has a fixed id per trainee and event, so
//     syncing again updates it instead of adding a duplicate.
//
// GET  ?action=calendars                 calendars the Google account can see
// GET  ?action=events&timeMin&timeMax    the chosen calendar's events (RFC 3339 range, ≤ 62 days)
// POST { action: 'connect', code }       finish Google sign-in (code from the popup)
// POST { action: 'select', calendarId }  use this calendar as the attorney's
// POST { action: 'push', events, force } copy up to PUSH_MAX events into it
// POST { action: 'remove', keys }        remove copies (event deleted here or layer turned off)
// POST { action: 'purge', scope }        remove copies in bulk ('others': other calendars, 'all')
// POST { action: 'disconnect' }          revoke access and forget the link
//
// Batches are small because a Pages Function may make only 50 outgoing
// requests per call; the page loops until everything is done.

const PUSH_MAX = 10, REMOVE_MAX = 20;
const KEY_RE = /^(ev|sim|dl):[A-Za-z0-9:_-]{1,80}$/;
const calPath = (id) => `/calendars/${encodeURIComponent(id)}`;

function fail(error, status = 400, code) { return json({ success: false, error, code }, status); }

function mapCalendar(c) {
    return {
        id: c.id, name: c.summaryOverride || c.summary || c.id, primary: !!c.primary,
        accessRole: c.accessRole, canWrite: WRITE_ROLES.includes(c.accessRole), tz: c.timeZone || '', color: c.backgroundColor || '',
    };
}
async function listCalendars(env, db, link) {
    const res = await gcal(env, db, link, 'GET', '/users/me/calendarList?minAccessRole=freeBusyReader&maxResults=250');
    if (!res.ok) throw new GoogleError(googleMessage(res), res.status === 403 ? 403 : 502);
    // Writable first, and calendars shared with the trainee (the attorney's) before their own.
    return (res.data.items || []).filter(c => !c.deleted).map(mapCalendar)
        .sort((a, b) => (b.canWrite - a.canWrite) || (a.primary - b.primary) || a.name.localeCompare(b.name));
}

function toGoogleEvent(ev, id, origin) {
    const body = {
        id,
        summary: ev.title,
        description: ev.description,
        location: ev.location || undefined,
        start: ev.allDay ? { date: ev.start } : { dateTime: `${ev.start}:00`, timeZone: ev.tz },
        end: ev.allDay ? { date: addDays(ev.end, 1) } : { dateTime: `${ev.end}:00`, timeZone: ev.tz },
        extendedProperties: { private: { lshTraining: '1', lshKey: ev.key } },
        source: { title: 'LSH Firm Calendar', url: origin + '/?calendar=1' },
    };
    return body;
}
function validPush(ev) {
    if (!ev || !KEY_RE.test(String(ev.key || ''))) return 'bad key';
    if (!String(ev.title || '').trim() || String(ev.title).length > 300) return 'bad title';
    const re = ev.allDay ? DATE_RE : WALL_RE;
    if (!re.test(String(ev.start || '')) || !re.test(String(ev.end || '')) || ev.end < ev.start) return 'bad time';
    if (!ev.allDay && !validTimeZone(ev.tz)) return 'bad time zone';
    if (String(ev.description || '').length > 8000 || String(ev.location || '').length > 300) return 'too long';
    return null;
}

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;
    if (!googleConfigured(env)) return fail('Google Calendar isn\'t set up on this site yet.', 501, 'GOOGLE_NOT_CONFIGURED');
    await ensureGoogleTables(db);
    const link = await readLink(db, session.username);
    if (!link) return fail('Connect Google Calendar first.', 409, 'GOOGLE_NOT_CONNECTED');
    const url = new URL(request.url);
    try {
        const action = url.searchParams.get('action');
        if (action === 'calendars') return json({ success: true, calendars: await listCalendars(env, db, link) });
        if (action === 'events') {
            if (!link.calendar_id) return fail('Pick the attorney\'s calendar first.', 409, 'GOOGLE_NO_CALENDAR');
            const tMin = Date.parse(url.searchParams.get('timeMin') || ''), tMax = Date.parse(url.searchParams.get('timeMax') || '');
            if (!tMin || !tMax || tMax <= tMin || tMax - tMin > 62 * 86400000) return fail('Bad time range.');
            const items = [];
            let pageToken = '';
            for (let page = 0; page < 3; page++) {
                const q = new URLSearchParams({
                    timeMin: new Date(tMin).toISOString(), timeMax: new Date(tMax).toISOString(),
                    singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
                    fields: 'items(id,status,summary,location,htmlLink,start,end,extendedProperties),nextPageToken',
                });
                if (pageToken) q.set('pageToken', pageToken);
                const res = await gcal(env, db, link, 'GET', `${calPath(link.calendar_id)}/events?${q}`);
                if (!res.ok) return fail(googleMessage(res), res.status === 404 ? 404 : 502, 'GOOGLE_ERROR');
                (res.data.items || []).forEach(e => {
                    if (e.status === 'cancelled') return;
                    const priv = (e.extendedProperties && e.extendedProperties.private) || {};
                    items.push({
                        id: e.id, title: e.summary || '(busy)', location: e.location || '', link: e.htmlLink || '',
                        allDay: !!(e.start && e.start.date),
                        start: e.start ? (e.start.dateTime || e.start.date) : '', end: e.end ? (e.end.dateTime || e.end.date) : '',
                        lshKey: priv.lshKey || '',
                    });
                });
                pageToken = res.data.nextPageToken;
                if (!pageToken) break;
            }
            return json({ success: true, events: items, calendarId: link.calendar_id });
        }
        return fail('Unknown action.');
    } catch (e) {
        if (e instanceof GoogleError) return fail(e.message, e.status, e.code);
        throw e;
    }
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;
    if (!googleConfigured(env)) return fail('Google Calendar isn\'t set up on this site yet.', 501, 'GOOGLE_NOT_CONFIGURED');
    let body;
    try { body = await request.json(); } catch (e) { return fail('Invalid request body.'); }
    await ensureGoogleTables(db);
    const username = session.username;

    try {
        if (body.action === 'connect') {
            const code = String(body.code || '');
            if (!code || code.length > 2048) return fail('Missing sign-in code.');
            const t = await exchangeCode(env, code);
            const granted = t.scope.split(/\s+/);
            const missing = GOOGLE_SCOPES.filter(s => s.startsWith('https://') && !granted.includes(s));
            if (missing.length) {
                await revokeUnlessShared(db, 'drive_links', username, t.email, t.accessToken);   // (not when Drive backup uses this account)
                return fail('Google didn\'t give access to the calendar. Connect again and tick both calendar permissions when Google asks.', 400, 'GOOGLE_SCOPES');
            }
            if (!t.refreshToken) {
                // Google only hands out a refresh token on a fresh grant. When Drive backup is connected to the same
                // account, its grant now covers the calendar too: use it. Otherwise revoking clears the old grant, so
                // the next Connect gets one.
                const drive = await otherGoogleLink(db, 'drive_links', username, t.email);
                const shared = await sharedRefresh(env, drive, GOOGLE_SCOPES.filter(s => s.startsWith('https://')));
                if (shared) Object.assign(t, { refreshToken: shared.refreshToken, accessToken: shared.accessToken, expiresIn: shared.expiresIn });
                else if (drive) return fail('Google didn\'t return long-term access for the calendar. Disconnect Google Drive (Doc Hub), connect Google Calendar, then connect Google Drive again.', 409, 'GOOGLE_RETRY');
                else {
                    await revokeUnlessShared(db, 'drive_links', username, t.email, t.accessToken);
                    return fail('Google didn\'t return long-term access. Click Connect Google Calendar once more.', 409, 'GOOGLE_RETRY');
                }
            }
            const old = await readLink(db, username);
            // the old account's access is given back (unless it's the same account, or Drive backup still uses it)
            if (old && !(old.google_email && old.google_email === t.email)) { try { await revokeUnlessShared(db, 'drive_links', username, old.google_email, await unseal(env, old.refresh_token)); } catch (e) { /* old token unreadable */ } }
            const expires = Date.now() + t.expiresIn * 1000;
            await db.prepare(
                `INSERT INTO calendar_google_links (username, google_email, refresh_token, access_token, access_expires, scope, calendar_id, calendar_name, calendar_tz, can_write, connected_at, last_sync_at)
                 VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, datetime('now'), NULL)
                 ON CONFLICT(username) DO UPDATE SET google_email = excluded.google_email, refresh_token = excluded.refresh_token,
                   access_token = excluded.access_token, access_expires = excluded.access_expires, scope = excluded.scope,
                   calendar_id = NULL, calendar_name = NULL, calendar_tz = NULL, can_write = 0, connected_at = excluded.connected_at, last_sync_at = NULL`
            ).bind(username, t.email || null, await seal(env, t.refreshToken), await seal(env, t.accessToken), expires, t.scope).run();
            const link = await readLink(db, username);
            return json({ success: true, google: await googleStatus(env, db, username), calendars: await listCalendars(env, db, link) });
        }

        const link = await readLink(db, username);
        if (!link) return fail('Connect Google Calendar first.', 409, 'GOOGLE_NOT_CONNECTED');

        if (body.action === 'disconnect') {
            try { await revokeUnlessShared(db, 'drive_links', username, link.google_email, await unseal(env, link.refresh_token)); } catch (e) { /* forget it anyway */ }
            await db.batch([
                db.prepare(`DELETE FROM calendar_google_links WHERE username = ?`).bind(username),
                db.prepare(`DELETE FROM calendar_google_sync WHERE username = ?`).bind(username),
            ]);
            return json({ success: true, google: await googleStatus(env, db, username) });
        }

        if (body.action === 'select') {
            const id = String(body.calendarId || '');
            if (!id || id.length > 300) return fail('Pick a calendar.');
            const res = await gcal(env, db, link, 'GET', `/users/me/calendarList/${encodeURIComponent(id)}`);
            if (res.status === 404) return fail(`That calendar isn't shared with ${link.google_email || 'this Google account'}.`, 404);
            if (!res.ok) return fail(googleMessage(res), 502, 'GOOGLE_ERROR');
            const cal = mapCalendar(res.data);
            await db.prepare(`UPDATE calendar_google_links SET calendar_id = ?, calendar_name = ?, calendar_tz = ?, can_write = ? WHERE username = ?`)
                .bind(cal.id, cal.name, cal.tz || null, cal.canWrite ? 1 : 0, username).run();
            const other = await db.prepare(`SELECT COUNT(*) AS n FROM calendar_google_sync WHERE username = ? AND calendar_id != ?`).bind(username, cal.id).first();
            const { results } = await db.prepare(`SELECT local_key FROM calendar_google_sync WHERE username = ? AND calendar_id = ?`).bind(username, cal.id).all();
            const synced = {}; (results || []).forEach(r => { synced[r.local_key] = true; });
            return json({ success: true, google: await googleStatus(env, db, username), synced, otherCalendarCopies: other ? other.n : 0 });
        }

        if (body.action === 'push') {
            if (!link.calendar_id) return fail('Pick the attorney\'s calendar first.', 409, 'GOOGLE_NO_CALENDAR');
            if (!link.can_write) return fail(`${link.google_email || 'This Google account'} can see ${link.calendar_name || 'this calendar'} but can't add events to it. Ask the attorney to share it with "Make changes to events".`, 403, 'GOOGLE_READ_ONLY');
            const events = Array.isArray(body.events) ? body.events.slice(0, PUSH_MAX) : [];
            const origin = new URL(request.url).origin;
            const keys = events.map(e => String(e && e.key));
            const existing = {};
            if (keys.length) {
                const { results } = await db.prepare(`SELECT local_key, hash FROM calendar_google_sync WHERE username = ? AND calendar_id = ? AND local_key IN (${keys.map(() => '?').join(',')})`)
                    .bind(username, link.calendar_id, ...keys).all();
                (results || []).forEach(r => { existing[r.local_key] = r.hash; });
            }
            const results = [];
            for (const ev of events) {
                const bad = validPush(ev);
                if (bad) { results.push({ key: ev && ev.key, ok: false, error: bad }); continue; }
                const gid = await googleEventId(username, ev.key);
                const gbody = toGoogleEvent(ev, gid, origin);
                const hash = await contentHash(gbody);
                if (!body.force && existing[ev.key] === hash) { results.push({ key: ev.key, ok: true, unchanged: true }); continue; }
                let res = await gcal(env, db, link, 'POST', `${calPath(link.calendar_id)}/events`, gbody);
                // Already there (added before, possibly deleted since): update it, and bring it back if deleted.
                if (res.status === 409) res = await gcal(env, db, link, 'PUT', `${calPath(link.calendar_id)}/events/${gid}`, Object.assign({}, gbody, { status: 'confirmed' }));
                if (!res.ok) { results.push({ key: ev.key, ok: false, error: googleMessage(res) }); continue; }
                await db.prepare(
                    `INSERT INTO calendar_google_sync (username, calendar_id, local_key, google_id, hash, synced_at) VALUES (?, ?, ?, ?, ?, datetime('now'))
                     ON CONFLICT(username, calendar_id, local_key) DO UPDATE SET google_id = excluded.google_id, hash = excluded.hash, synced_at = excluded.synced_at`
                ).bind(username, link.calendar_id, ev.key, gid, hash).run();
                results.push({ key: ev.key, ok: true });
            }
            await db.prepare(`UPDATE calendar_google_links SET last_sync_at = datetime('now') WHERE username = ?`).bind(username).run();
            return json({ success: true, results });
        }

        if (body.action === 'remove' || body.action === 'purge') {
            let rows;
            if (body.action === 'remove') {
                const keys = (Array.isArray(body.keys) ? body.keys : []).map(String).filter(k => KEY_RE.test(k)).slice(0, REMOVE_MAX);
                if (!keys.length) return json({ success: true, removed: 0, failed: 0, remaining: 0 });
                ({ results: rows } = await db.prepare(`SELECT * FROM calendar_google_sync WHERE username = ? AND local_key IN (${keys.map(() => '?').join(',')}) LIMIT ${REMOVE_MAX}`)
                    .bind(username, ...keys).all());
            } else {
                const others = body.scope !== 'all';
                ({ results: rows } = await db.prepare(`SELECT * FROM calendar_google_sync WHERE username = ?${others ? ' AND calendar_id != ?' : ''} LIMIT ${REMOVE_MAX}`)
                    .bind(...(others ? [username, link.calendar_id || ''] : [username])).all());
            }
            let removed = 0, failed = 0;
            for (const row of rows || []) {
                const res = await gcal(env, db, link, 'DELETE', `${calPath(row.calendar_id)}/events/${row.google_id}`);
                // 404/410: already gone. Anything else (e.g. no longer allowed to edit that calendar)
                // counts as failed, but the row is dropped either way so a purge always finishes.
                if (res.ok || res.status === 404 || res.status === 410) removed++; else failed++;
                await db.prepare(`DELETE FROM calendar_google_sync WHERE username = ? AND calendar_id = ? AND local_key = ?`)
                    .bind(username, row.calendar_id, row.local_key).run();
            }
            let remaining = 0;
            if (body.action === 'purge') {
                const others = body.scope !== 'all';
                const r = await db.prepare(`SELECT COUNT(*) AS n FROM calendar_google_sync WHERE username = ?${others ? ' AND calendar_id != ?' : ''}`)
                    .bind(...(others ? [username, link.calendar_id || ''] : [username])).first();
                remaining = r ? r.n : 0;
            }
            return json({ success: true, removed, failed, remaining });
        }

        return fail('Unknown action.');
    } catch (e) {
        if (e instanceof GoogleError) return fail(e.message, e.status, e.code);
        throw e;
    }
}
