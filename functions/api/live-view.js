import { json, requireSession } from '../_utils.js';
import { ensureLiveViewTable, WATCH_MS } from '../_liveview.js';
// GET /api/live-view?username=…  (Admins only)
// Where a trainee is right now, the trail of where they've been, and (while watched) a snapshot of the
// case on their screen. Reading it marks the trainee as watched for the next WATCH_MS, so their page
// starts sending snapshots (see _liveview.js); the Admin's live view reads it every 3 s.
const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const db = env.DB;
    const username = String(new URL(request.url).searchParams.get('username') || '').trim().slice(0, 80);
    if (!username) return json({ success: false, error: 'Which trainee? Add ?username=.' }, 400);
    await ensureLiveViewTable(db);
    await db.prepare(`INSERT INTO live_view (username, watched_until, watched_by) VALUES (?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET watched_until = excluded.watched_until, watched_by = excluded.watched_by`)
        .bind(username, Date.now() + WATCH_MS, auth.session.username).run();
    const [hb, lv] = await Promise.all([
        db.prepare(`SELECT full_name, user_type, current_case, last_seen FROM heartbeats WHERE username = ?`).bind(username).first(),
        db.prepare(`SELECT where_json, trail_json, snapshot_json, snapshot_at, updated_at FROM live_view WHERE username = ?`).bind(username).first()
    ]);
    // heartbeats.last_seen is SQLite's datetime('now'): UTC, without the Z
    const seen = hb && hb.last_seen ? Date.parse(String(hb.last_seen).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(hb.last_seen) ? '' : 'Z')) : 0;
    return json({
        success: true, username,
        fullName: (hb && hb.full_name) || username,
        online: !!seen && Date.now() - seen < 90000,   // an open page sends a heartbeat every 30 s, 45 s in a background tab (Monitoring's "Online now" also allows 90 s)
        lastSeen: hb ? hb.last_seen : null,
        where: parse(lv && lv.where_json, null),
        trail: parse(lv && lv.trail_json, []).slice().reverse(),   // newest first
        snapshot: parse(lv && lv.snapshot_json, null),
        snapshotAt: (lv && lv.snapshot_at) || null,
        serverNow: new Date().toISOString()
    }, 200, { 'Cache-Control': 'no-store' });
}
