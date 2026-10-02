// Live view: an Admin watches a trainee's screen as they work (Master Control → Monitoring → 👁 Watch live).
//
// The trainee's page says where it is with every heartbeat (heartbeat.js → reportLiveView): the screen,
// the case, the tab and any open panel. Each change goes on the trainee's trail (the last 40 steps).
// While an Admin is watching (they read /api/live-view in the last WATCH_MS), the heartbeat's answer says
// so, and the page shows the trainee that their trainer is viewing their screen (live-view.js). Then each
// heartbeat (every 3 s) also carries:
//   - their screen: a copy of the page as it looks (zipped HTML, nothing in it runs), only when it changed.
//     At most SCREEN_MAX characters; a bigger one isn't kept and the Admin is told (too_big). The answer
//     says which screen is kept (screenId), so the page sends it again only if it didn't arrive;
//   - the view (tiny, every time): the window's size, where it's scrolled, the mouse pointer, the clocks;
//   - a snapshot of the case as it stands (at most every 3 s, only when it changed), for the summary.
// Only the trainee's own heartbeat writes their screen (the username comes from their session), and only
// Admins read it (/api/live-view). A page that can mirror its screen says so (mirror: 1); a watched page
// that doesn't is an older version still open (old_page_at), and the Admin is told. The copy of a screen
// is kept only while someone watches: the first heartbeat after the watch ends deletes it.
//
// Tables (made on first use, like guest_accounts):
//   live_view    username, where_json, trail_json, snapshot_json, snapshot_at, watched_until (ms), watched_by, updated_at
//   live_screen  username, screen_id, enc ('gzip' or 'raw'), data, view_json, too_big, screen_at, seen_at, old_page_at
//                (a table of its own: a screen and a case snapshot in one row could pass D1's limit for a row)
export const WATCH_MS = 15000;
const TRAIL_MAX = 40;
const SNAPSHOT_MAX = 400000;   // characters of JSON; a bigger case isn't mirrored (the trail still is)
export const SCREEN_MAX = 700000;   // characters of a zipped screen (base64): well under D1's limit for a row

let ready = false;
export async function ensureLiveViewTable(db) {
    if (ready) return;
    await db.prepare(`CREATE TABLE IF NOT EXISTS live_view (
        username TEXT PRIMARY KEY, where_json TEXT, trail_json TEXT, snapshot_json TEXT, snapshot_at TEXT,
        watched_until INTEGER DEFAULT 0, watched_by TEXT, updated_at TEXT)`).run();
    await db.prepare(`CREATE TABLE IF NOT EXISTS live_screen (
        username TEXT PRIMARY KEY, screen_id TEXT, enc TEXT, data TEXT, view_json TEXT, too_big INTEGER DEFAULT 0,
        screen_at TEXT, seen_at TEXT, old_page_at TEXT)`).run();
    ready = true;
}

const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
// What the page says about where it is: short strings only.
export function cleanWhere(w) {
    if (!w || typeof w !== 'object') return null;
    return { screen: clip(w.screen, 40), caseName: clip(w.caseName, 80), caseId: clip(w.caseId, 40), tab: clip(w.tab, 40), panel: clip(w.panel, 80), detail: clip(w.detail, 120) };
}

const int = (v, lo, hi) => { if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null; const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
const KEY = /^\d{1,7}$/;
function keyed(o, max, each) {
    const out = {};
    if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
    for (const k of Object.keys(o).slice(0, max)) { if (!KEY.test(k)) continue; const v = each(o[k]); if (v !== null) out[k] = v; }
    return out;
}
// The view: numbers and short strings only.
export function cleanView(v) {
    if (!v || typeof v !== 'object') return null;
    const out = { vw: int(v.vw, 200, 8000) || 1280, vh: int(v.vh, 150, 8000) || 800, sx: int(v.sx, 0, 1e7) || 0, sy: int(v.sy, 0, 1e7) || 0, hidden: !!v.hidden };
    const px = int(v.px, -50, 10000), py = int(v.py, -50, 10000);
    if (px !== null && py !== null) { out.px = px; out.py = py; }
    out.scroll = keyed(v.scroll, 300, s => Array.isArray(s) ? [int(s[0], 0, 1e7) || 0, int(s[1], 0, 1e7) || 0] : null);
    out.tick = keyed(v.tick, 50, t => (typeof t === 'string' ? clip(t, 80) : null));
    if (KEY.test(String(v.focus == null ? '' : v.focus))) out.focus = String(v.focus);
    if (typeof v.origin === 'string' && /^https?:\/\/[^\s/?#]{1,120}$/.test(v.origin)) out.origin = v.origin;
    return out;
}
// The screen as sent: an id, the view, and the copy itself (or how big it was) when it changed.
// The HTML isn't read here: the Admin's page cleans it again before it shows it, in a sandboxed frame.
export function cleanScreen(s) {
    if (!s || typeof s !== 'object') return null;
    const id = /^[a-z0-9-]{1,40}$/.test(String(s.id || '')) ? String(s.id) : '';
    const out = { id, view: cleanView(s.view) };
    if (id && typeof s.data === 'string' && (s.enc === 'raw' || (s.enc === 'gzip' && /^[A-Za-z0-9+/=]*$/.test(s.data)))) {
        if (s.data.length <= SCREEN_MAX) { out.data = s.data; out.enc = s.enc; }
        else out.tooBig = s.data.length;
    } else if (int(s.tooBig, 1, 1e9)) out.tooBig = int(s.tooBig, 1, 1e9);
    return out;
}

// Keep what the page sent about its screen. Returns the id of the screen kept now.
async function saveScreen(db, username, sc, keptId, now) {
    const view = sc.view ? JSON.stringify(sc.view) : null;
    if (sc.data !== undefined) {   // a new screen
        await db.prepare(`INSERT INTO live_screen (username, screen_id, enc, data, view_json, too_big, screen_at, seen_at, old_page_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, NULL)
            ON CONFLICT(username) DO UPDATE SET screen_id = excluded.screen_id, enc = excluded.enc, data = excluded.data, view_json = excluded.view_json,
                too_big = 0, screen_at = excluded.screen_at, seen_at = excluded.seen_at, old_page_at = NULL`)
            .bind(username, sc.id, sc.enc, sc.data, view, now, now).run();
        return sc.id;
    }
    if (sc.tooBig) {   // too big to keep: the last one goes too (it isn't their screen any more)
        await db.prepare(`INSERT INTO live_screen (username, screen_id, enc, data, view_json, too_big, seen_at, old_page_at) VALUES (?, NULL, NULL, NULL, ?, ?, ?, NULL)
            ON CONFLICT(username) DO UPDATE SET screen_id = NULL, enc = NULL, data = NULL, view_json = excluded.view_json, too_big = excluded.too_big,
                seen_at = excluded.seen_at, old_page_at = NULL`)
            .bind(username, view, sc.tooBig, now).run();
        return null;
    }
    // the same screen as before (or a tab in the background): only the view
    await db.prepare(`INSERT INTO live_screen (username, view_json, seen_at) VALUES (?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET view_json = excluded.view_json, seen_at = excluded.seen_at, old_page_at = NULL`)
        .bind(username, view, now).run();
    return keptId;
}

// A trainee's heartbeat: record where they are (a new step on the trail when it changed) and, while they're
// watched, their screen and the snapshot. Returns { watched, screenId } (screenId: the screen kept, while watched).
export async function reportLiveView(db, username, { where, snapshot, screen, mirror } = {}) {
    await ensureLiveViewTable(db);
    const row = await db.prepare(`SELECT v.where_json, v.trail_json, v.watched_until, s.username AS has_screen, s.screen_id
        FROM live_view v LEFT JOIN live_screen s ON s.username = v.username WHERE v.username = ?`).bind(username).first();
    const now = new Date().toISOString();
    const w = cleanWhere(where);
    if (w) {
        const key = JSON.stringify(w);
        if (!row || row.where_json !== key) {
            let trail = [];
            try { trail = JSON.parse((row && row.trail_json) || '[]'); } catch (e) { trail = []; }
            if (!Array.isArray(trail)) trail = [];
            trail.push(Object.assign({ at: now }, w));
            await db.prepare(`INSERT INTO live_view (username, where_json, trail_json, updated_at) VALUES (?, ?, ?, ?)
                ON CONFLICT(username) DO UPDATE SET where_json = excluded.where_json, trail_json = excluded.trail_json, updated_at = excluded.updated_at`)
                .bind(username, key, JSON.stringify(trail.slice(-TRAIL_MAX)), now).run();
        }
    }
    const watched = !!(row && Number(row.watched_until) > Date.now());
    if (!watched) {
        // the copy of their screen is kept only while someone watches
        if (row && row.has_screen) await db.prepare(`DELETE FROM live_screen WHERE username = ?`).bind(username).run();
        return { watched: false };
    }
    if (snapshot && typeof snapshot === 'object') {
        const s = JSON.stringify(snapshot);
        if (s.length <= SNAPSHOT_MAX) await db.prepare(`UPDATE live_view SET snapshot_json = ?, snapshot_at = ? WHERE username = ?`).bind(s, now, username).run();
    }
    let screenId = (row && row.screen_id) || null;
    const sc = cleanScreen(screen);
    if (sc) screenId = await saveScreen(db, username, sc, screenId, now);
    else if (!mirror) {   // an older page, from before screens were mirrored: the Admin is told
        await db.prepare(`INSERT INTO live_screen (username, old_page_at) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET old_page_at = excluded.old_page_at`).bind(username, now).run();
    }
    return { watched: true, screenId };
}
