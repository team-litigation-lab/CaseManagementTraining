// Live view: an Admin watches a trainee's screen as they work (Master Control → Monitoring → 👁 Watch live).
//
// The trainee's page says where it is with every heartbeat (heartbeat.js → reportLiveView): the screen,
// the case, the tab and any open panel. Each change goes on the trainee's trail (the last 40 steps).
// While an Admin is watching (they read /api/live-view in the last WATCH_MS), the heartbeat's answer says
// so: the page then also sends a snapshot of the case as it stands (at most every 3 s, only when it
// changed), and shows the trainee that their trainer is viewing their screen (live-view.js).
//
// Table (made on first use, like guest_accounts):
//   live_view  username, where_json, trail_json, snapshot_json, snapshot_at, watched_until (ms), watched_by, updated_at
export const WATCH_MS = 15000;
const TRAIL_MAX = 40;
const SNAPSHOT_MAX = 400000;   // characters of JSON; a bigger case isn't mirrored (the trail still is)

let ready = false;
export async function ensureLiveViewTable(db) {
    if (ready) return;
    await db.prepare(`CREATE TABLE IF NOT EXISTS live_view (
        username TEXT PRIMARY KEY, where_json TEXT, trail_json TEXT, snapshot_json TEXT, snapshot_at TEXT,
        watched_until INTEGER DEFAULT 0, watched_by TEXT, updated_at TEXT)`).run();
    ready = true;
}

const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
// What the page says about where it is: short strings only.
export function cleanWhere(w) {
    if (!w || typeof w !== 'object') return null;
    return { screen: clip(w.screen, 40), caseName: clip(w.caseName, 80), caseId: clip(w.caseId, 40), tab: clip(w.tab, 40), panel: clip(w.panel, 80), detail: clip(w.detail, 120) };
}

// A trainee's heartbeat: record where they are (a new step on the trail when it changed) and, while
// they're watched, the snapshot. Returns whether an Admin is watching.
export async function reportLiveView(db, username, where, snapshot) {
    await ensureLiveViewTable(db);
    const row = await db.prepare(`SELECT where_json, trail_json, watched_until FROM live_view WHERE username = ?`).bind(username).first();
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
    if (watched && snapshot && typeof snapshot === 'object') {
        const s = JSON.stringify(snapshot);
        if (s.length <= SNAPSHOT_MAX) await db.prepare(`UPDATE live_view SET snapshot_json = ?, snapshot_at = ? WHERE username = ?`).bind(s, now, username).run();
    }
    return watched;
}
