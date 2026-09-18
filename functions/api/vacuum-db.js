import { json, requireSession, logActivity, isMaster } from '../_utils.js';

// POST /api/vacuum-db
//
// Deleting rows (cases, registrations, revoked users, etc.) does NOT
// shrink the underlying SQLite file D1 stores your data in — it only
// marks that space as free for D1 to reuse on future inserts. The file
// itself (and the "database size" D1 reports) stays at its high-water
// mark until a VACUUM rebuilds it and hands the freed pages back.
//
// This endpoint runs that VACUUM on demand. It is intentionally
// restricted to the Master Account:
//   - VACUUM rewrites the entire database file, which briefly locks
//     the DB and can take real time once the DB has meaningful data,
//     so it shouldn't be something any Admin can kick off casually.
//   - It's a maintenance operation, not a day-to-day admin action —
//     matching how only the Master Account can revoke another Admin
//     elsewhere in this app (see revoke-user.js).
//
// Reports page counts before/after so the caller can see how much was
// actually reclaimed, rather than just "success: true" into the void.
export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const { session } = auth;
    if (!isMaster(session)) {
        return json({ success: false, error: 'Only the Master Account can run database maintenance.' }, 403);
    }
    const db = env.DB;

    const readStats = async () => {
        const [pageCount, freelist, pageSize] = await Promise.all([
            db.prepare(`PRAGMA page_count`).first(),
            db.prepare(`PRAGMA freelist_count`).first(),
            db.prepare(`PRAGMA page_size`).first(),
        ]);
        return {
            pageCount: Number(pageCount ? pageCount.page_count : 0),
            freelistCount: Number(freelist ? freelist.freelist_count : 0),
            pageSize: Number(pageSize ? pageSize.page_size : 0),
        };
    };

    let before;
    try {
        before = await readStats();
    } catch (e) {
        return json({ success: false, error: 'Could not read database stats before vacuuming: ' + e.message }, 500);
    }

    const startedAt = Date.now();
    try {
        // Raw, param-free statement — this is what env.DB.exec() is for,
        // as opposed to prepare()/bind() which is for parameterized queries.
        await db.exec('VACUUM');
    } catch (e) {
        // Some D1 deployments / plans reject VACUUM outright (it's a
        // heavier, whole-file operation than D1's usual query surface).
        // Surface that plainly instead of pretending it worked.
        await logActivity(db, session.username, session.batchId, 'vacuum-db-failed', { error: e.message });
        return json({
            success: false,
            error: 'VACUUM failed: ' + e.message,
            hint: 'If this persists, run it directly with: wrangler d1 execute <database-name> --remote --command "VACUUM;"'
        }, 500);
    }
    const durationMs = Date.now() - startedAt;

    let after;
    try {
        after = await readStats();
    } catch (e) {
        // The vacuum itself succeeded even if we can't re-read stats.
        after = null;
    }

    const bytesBefore = before.pageCount * before.pageSize;
    const bytesAfter = after ? after.pageCount * after.pageSize : null;
    const bytesReclaimed = bytesAfter !== null ? Math.max(0, bytesBefore - bytesAfter) : null;

    await logActivity(db, session.username, session.batchId, 'vacuum-db', {
        durationMs,
        pageCountBefore: before.pageCount,
        pageCountAfter: after ? after.pageCount : null,
        freelistCountBefore: before.freelistCount,
        bytesReclaimed
    });

    return json({
        success: true,
        durationMs,
        before: { pageCount: before.pageCount, freelistCount: before.freelistCount, approxBytes: bytesBefore },
        after: after ? { pageCount: after.pageCount, freelistCount: after.freelistCount, approxBytes: bytesAfter } : null,
        bytesReclaimed
    });
}
