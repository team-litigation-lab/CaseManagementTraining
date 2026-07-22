import { json, clearSessionCookie, getCookie, verifySessionToken, logActivity } from '../_utils.js';

export async function onRequestPost({ request, env }) {
    try {
        const token = getCookie(request, 'lsh_session');
        const payload = await verifySessionToken(token, env.SESSION_SECRET);
        if (payload?.username) {
            await env.DB.prepare(`DELETE FROM heartbeats WHERE username = ?`).bind(payload.username).run();
            // Previously missing entirely — Server Logs (see /api/server-logs)
            // pairs this 'logout' row with the matching earlier 'login' row
            // (same actor_username) to compute session duration. Without this
            // call, every session showed a login with no matching logout.
            await logActivity(env.DB, payload.username, payload.batchId, 'logout', null);
        }
    } catch (e) {
        console.error('logout heartbeat cleanup failed', e);
    }
    return json({ success: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}
