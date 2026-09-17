import { json, requireSession } from '../_utils.js';

// GET /api/server-logs
// Admin-only. Reads the existing `activity_log` table — already populated by
// login.js, logout.js, pause.js, lock.js, ping.js, revoke-user.js,
// suspend-user.js, and reinstate-user.js — and reshapes it for Master
// Control > Monitoring > Server Logs: human-readable labels, plus a computed
// `durationSeconds` for the paired event types:
//   - login  -> logout   (per actor_username)
//   - pause  -> resume   (site-wide, one at a time)
//   - lock   -> unlock   (site-wide, one at a time)
// Ping and the three revocation actions have no natural "duration" — they're
// point-in-time events — so durationSeconds is left null for those.
//
// NOTE ON SCHEMA: this assumes activity_log has the columns
//   id, actor_username, actor_batch, action, details, created_at
// (created_at being the row's own timestamp column). If your actual table
// uses a different timestamp column name, update the two SELECT/ORDER BY
// references below to match.
const LABELS = {
    login: 'Log In',
    logout: 'Log Out',
    pause: 'Pause',
    resume: 'Resume (Unpause)',
    lock: 'Lock',
    unlock: 'Unlock',
    ping: 'Ping',
    'suspend-user': 'Temporary Revocation',
    'reinstate-user': 'Lift Revocation',
    'revoke-user': 'Permanent Revocation'
};

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const db = env.DB;
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit'), 10) || 500, 2000);

    const { results } = await db.prepare(
        `SELECT id, actor_username, actor_batch, action, details, created_at
         FROM activity_log
         ORDER BY created_at DESC
         LIMIT ?`
    ).bind(limit).all();
    const rows = results || [];

    // Rows arrive newest-first; walk oldest-first so each "end" event can
    // look back at the most recent still-open "start" event of its kind.
    const chronological = rows.slice().reverse();
    const openLoginByActor = {};
    let openPauseAt = null;
    let openLockAt = null;

    const withDuration = chronological.map(r => {
        let durationSeconds = null;
        const ts = new Date(r.created_at).getTime();

        if (r.action === 'login') {
            openLoginByActor[r.actor_username] = ts;
        } else if (r.action === 'logout') {
            const startTs = openLoginByActor[r.actor_username];
            if (startTs != null) {
                durationSeconds = Math.max(0, Math.round((ts - startTs) / 1000));
                delete openLoginByActor[r.actor_username];
            }
        } else if (r.action === 'pause') {
            openPauseAt = ts;
        } else if (r.action === 'resume') {
            if (openPauseAt != null) {
                durationSeconds = Math.max(0, Math.round((ts - openPauseAt) / 1000));
                openPauseAt = null;
            }
        } else if (r.action === 'lock') {
            openLockAt = ts;
        } else if (r.action === 'unlock') {
            if (openLockAt != null) {
                durationSeconds = Math.max(0, Math.round((ts - openLockAt) / 1000));
                openLockAt = null;
            }
        }

        let details = null;
        try { details = r.details ? JSON.parse(r.details) : null; } catch (e) { details = null; }

        return {
            id: r.id,
            action: r.action,
            label: LABELS[r.action] || r.action,
            actorUsername: r.actor_username,
            actorBatch: r.actor_batch,
            details,
            occurredAt: r.created_at,
            durationSeconds
        };
    });

    withDuration.reverse(); // back to newest-first for display
    return json({ success: true, logs: withDuration });
}
