import { json, requireSession, upsertSessionHeartbeat, HEARTBEAT_GRACE_SECONDS } from '../_utils.js';
import { reportLiveView, waitForWatch, HOLD_MAX_MS } from '../_liveview.js';

export async function onRequestGet({ request, env }) {
    // Who's currently online, their real name, and which case they're
    // viewing — that's admin dashboard info, not something every visitor
    // should be able to pull with no login at all.
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;

    const { results } = await env.DB.prepare(
        `SELECT username, full_name, batch_id, user_type, current_case, last_seen
         FROM heartbeats ORDER BY last_seen DESC`
    ).all();
    return json(results || []);
}

export async function onRequestPost({ request, env }) {
    // skipHeartbeatCheck: true — see the comment on requireSession() in
    // _utils.js. This endpoint's job is to refresh the heartbeat; it can't
    // also require the heartbeat to already be fresh to run.
    const auth = await requireSession(request, env, { skipHeartbeatCheck: true });
    if (!auth.ok) return auth.response;
    const { session } = auth;

    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const { fullName, currentCase, where, snapshot, screen, mirror, hold } = body;

    // Which account the page sending this believes it is (app.js: `as`). A browser holds ONE
    // session cookie, but each tab keeps its own idea of who it is (sessionStorage). So a second
    // trainee signing in on the same browser — another tab, a ticketed link from their course,
    // a shared training-room computer — replaces the cookie under every page already open, and
    // those pages then write their work, their "online" and their screen into the new account.
    // That is what made 👁 Watch live show the wrong trainee: the live view is keyed on the
    // username this request authenticates as, so the stale tab's screen was filed under whoever
    // signed in last. Nothing is recorded for a page that is no longer who it thinks it is; it
    // is told so, and signs itself out of this tab (the cookie stays: it belongs to the new user).
    const claimed = typeof body.as === 'string' ? body.as.trim() : '';
    if (claimed && claimed !== session.username) {
        return json({ success: false, code: 'SESSION_CHANGED', error: 'This browser is signed in as someone else now. Open the CMS again from your course to carry on.' }, 409);
    }

    // Identity comes from the verified session, not the request body —
    // otherwise anyone could POST a heartbeat claiming to be any username,
    // overwriting that user's "currently online" row. The name too: the one
    // signed into the session (older sessions without it fall back to the page's).
    const beat = {
        username: session.username,
        fullName: session.fullName || fullName || session.username,
        batchId: session.batchId,
        userType: session.userType,
        currentCase: currentCase || null
    };
    // A signed-out session stays signed out. Logging out deletes the heartbeat row and records which sign-in
    // ended (logout.js, the token's iat); a beat that finds no row checks that before making one again, so a
    // copy of an old session cookie can't bring the session back. A normal beat finds its row: one statement.
    const touched = await db.prepare(
        `UPDATE heartbeats SET full_name = ?, batch_id = ?, user_type = ?, current_case = ?, last_seen = datetime('now') WHERE username = ?`
    ).bind(beat.fullName, beat.batchId || null, beat.userType || null, beat.currentCase, beat.username).run();
    if (!(touched && touched.meta && touched.meta.changes)) {
        const ended = await db.prepare(
            `SELECT 1 AS ended FROM activity_log WHERE actor_username = ? AND action = 'logout' AND details = ? LIMIT 1`
        ).bind(session.username, JSON.stringify({ iat: session.iat })).first().catch(() => null);
        if (ended) return json({ success: false, error: 'Session expired.', code: 'SESSION_EXPIRED' }, 401);
        await upsertSessionHeartbeat(db, beat);
    }

    // Live view (_liveview.js): where a trainee is, and while an Admin watches, their screen and a snapshot
    // of their case. Always the session's own user: nobody can write another trainee's screen.
    // It's extra: a failure never stops the heartbeat. Admins (Trainee view too) aren't watched.
    let live = { watched: false };
    if (session.userType !== 'Admin' && (where || snapshot || screen)) {
        try { live = await reportLiveView(db, session.username, { where, snapshot, screen, mirror }); } catch (e) { live = { watched: false }; }
        // hold: a trainee nobody watches waits here (up to HOLD_MAX_MS) for a trainer to open 👁 Watch live, and
        // hears of it within about a second. It's this same heartbeat, held: no extra request.
        if (!live.watched && Number(hold) > 0) {
            try { if (await waitForWatch(db, session.username, Math.min(Number(hold) * 1000, HOLD_MAX_MS), request.signal)) live = { watched: true, screenId: null }; } catch (e) {}
        }
    }
    // screenId (while watched): the screen the server has, so the page sends it again only if it didn't arrive
    return json(Object.assign({ success: true, graceSeconds: HEARTBEAT_GRACE_SECONDS, watched: !!live.watched }, live.watched ? { screenId: live.screenId || null } : {}));
}
