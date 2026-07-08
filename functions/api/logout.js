import { json, clearSessionCookie, getCookie, verifySessionToken } from '../_utils.js';

export async function onRequestPost({ request, env }) {
    try {
        const token = getCookie(request, 'lsh_session');
        const payload = await verifySessionToken(token, env.SESSION_SECRET);
        if (payload?.username) {
            await env.DB.prepare(`DELETE FROM heartbeats WHERE username = ?`).bind(payload.username).run();
        }
    } catch (e) {
        console.error('logout heartbeat cleanup failed', e);
    }
    return json({ success: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}
