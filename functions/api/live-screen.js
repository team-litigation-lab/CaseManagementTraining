import { json, requireSession } from '../_utils.js';
import { reportLiveView } from '../_liveview.js';
// POST /api/live-screen  (the trainee's own page, only while a trainer watches it: live-view.js)
// About a second after each change on the trainee's screen (at most once a second), and a short "still here"
// every couple of seconds otherwise: their screen when it changed, the view (scroll, pointer, clocks), where
// they are, and now and then a snapshot of the case. Always the session's own user: nobody can write another
// trainee's screen. The answer says whether they're still watched (when not, the page stops sending) and
// which screen the server has. See _liveview.js.
export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    if (session.userType === 'Admin') return json({ success: true, watched: false });   // trainers aren't watched
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    if (!body || typeof body !== 'object') return json({ success: false, error: 'Invalid request body.' }, 400);
    const live = await reportLiveView(env.DB, session.username, { where: body.where, snapshot: body.snapshot, screen: body.screen, mirror: 1 });
    return json(Object.assign({ success: true, watched: !!live.watched }, live.watched ? { screenId: live.screenId || null } : {}), 200, { 'Cache-Control': 'no-store' });
}
