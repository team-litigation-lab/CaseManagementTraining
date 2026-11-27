// GET /api/session → { success, user: { username, fullName, batchId, userType } } for the sign-in this browser's
// cookie holds, or 401 when there is none (signed out, 8 hours with no activity, suspended or revoked: requireSession).
//
// A CaseWorX tab keeps who it is in sessionStorage (app.js), which the browser empties when the tab or the browser
// is closed. The sign-in itself lasts until 8 hours with no activity (_utils.js, SESSION_IDLE_SECONDS), so a page
// opened with no session of its own asks here and carries on as the account the cookie belongs to, instead of
// showing the sign-in screen again. Only ever the cookie's own account: nothing in the request picks who.
import { json, requireSession } from '../_utils.js';

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const s = auth.session;
    return json({ success: true, user: { username: s.username, fullName: s.fullName || s.username, batchId: s.batchId || null, userType: s.userType } },
        200, { 'Cache-Control': 'no-store' });
}
