import { json, clearSessionCookie, getCookie, verifySessionToken, logActivity, claimedAccount, wrongAccount, sessionChangedResponse } from '../_utils.js';

export async function onRequestPost({ request, env }) {
    try {
        const token = getCookie(request, 'lsh_session');
        const payload = await verifySessionToken(token, env.SESSION_SECRET);
        // A tab left open from before someone else signed in on this browser must not end THEIR
        // session: its Log Out would delete the new trainee's heartbeat row and close their sign-in.
        // It signs itself out on its own side instead (app.js: handleSessionTakenOver). See _utils.js.
        if (payload && wrongAccount(claimedAccount(request), payload.username)) return sessionChangedResponse();
        if (payload?.username) {
            await env.DB.prepare(`DELETE FROM heartbeats WHERE username = ?`).bind(payload.username).run();
            // Previously missing entirely — Server Logs (see /api/server-logs)
            // pairs this 'logout' row with the matching earlier 'login' row
            // (same actor_username) to compute session duration. Without this
            // call, every session showed a login with no matching logout.
            // { iat }: which sign-in ended, so that session can't be brought back by a heartbeat (heartbeat.js).
            await logActivity(env.DB, payload.username, payload.batchId, 'logout', { iat: payload.iat });
        }
    } catch (e) {
        console.error('logout heartbeat cleanup failed', e);
    }
    return json({ success: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}
