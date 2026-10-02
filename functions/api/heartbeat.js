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

    // Identity comes from the verified session, not the request body —
    // otherwise anyone could POST a heartbeat claiming to be any username,
    // overwriting that user's "currently online" row.
    await upsertSessionHeartbeat(db, {
        username: session.username,
        fullName: fullName || session.username,
        batchId: session.batchId,
        userType: session.userType,
        currentCase: currentCase || null
    });

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
