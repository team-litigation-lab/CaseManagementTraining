import { json, requireSession, logActivity, isMaster } from '../_utils.js';

// POST /api/db-cleanup  (Master Account only; Master Control → Access Control → 🧹 Clear old data)
//
// D1 can't VACUUM: neither the Workers binding nor wrangler can shrink the database file, so the old
// "Run Database Vacuum" button and vacuum-d1.yml could never work. What does work is clearing out the
// data that's only ever needed for a while; D1 reuses that space for new data. The database file only
// gets smaller by copying it into a fresh one (the Migrate D1 workflow, README → 🔒 Security).
//
// Cleared (nothing a trainee made, no case, result or log someone reads later):
//   pings          sent more than 7 days ago (a page shows a ping for a minute)
//   heartbeats     nobody seen for 30 days (Monitoring's online list)
//   live_screen    a trainee's last screen copy for the live view, older than a day
//   live_view      where a trainee was and their case snapshot, untouched for 7 days
//   guest_login_rate  the wrong-name / wrong-password counts of earlier hours
//   live_call_log  live voice call records older than 90 days (the usage panel shows the last 24 hours)
//   alerts         stopped alerts older than 30 days
// Each table is tried on its own: one that doesn't exist yet is just skipped.
const RULES = [
    ['pings', 'pings sent more than 7 days ago', `DELETE FROM pings WHERE datetime(fired_at) < datetime('now', '-7 days')`],
    ['heartbeats', 'online status of people not seen for 30 days', `DELETE FROM heartbeats WHERE datetime(last_seen) < datetime('now', '-30 days')`],
    ['live_screen', 'live view screen copies older than a day', `DELETE FROM live_screen WHERE seen_at IS NULL OR datetime(seen_at) < datetime('now', '-1 day')`],
    ['live_view', 'live view snapshots untouched for 7 days', `DELETE FROM live_view WHERE updated_at IS NULL OR datetime(updated_at) < datetime('now', '-7 days')`],
    ['guest_login_rate', 'sign-in attempt counts of earlier hours', `DELETE FROM guest_login_rate WHERE window_start < ?`, () => [Math.floor(Date.now() / 3600000) - 1]],
    ['live_call_log', 'live call records older than 90 days', `DELETE FROM live_call_log WHERE datetime(created_at) < datetime('now', '-90 days')`],
    ['alerts', 'stopped alerts older than 30 days', `DELETE FROM alerts WHERE stopped = 1 AND datetime(start_at) < datetime('now', '-30 days')`]
];

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const { session } = auth;
    if (!isMaster(session)) {
        return json({ success: false, error: 'Only the Master Account can run database maintenance.' }, 403);
    }
    const cleared = [];
    let total = 0;
    for (const [table, what, sql, args] of RULES) {
        try {
            const r = await env.DB.prepare(sql).bind(...(args ? args() : [])).run();
            const n = (r && r.meta && r.meta.changes) || 0;
            total += n;
            cleared.push({ table, what, rows: n });
        } catch (e) {
            cleared.push({ table, what, rows: 0, skipped: true });   // not made yet on this database
        }
    }
    await logActivity(env.DB, session.username, session.batchId, 'db-cleanup', { rows: total });
    return json({ success: true, rows: total, cleared });
}
