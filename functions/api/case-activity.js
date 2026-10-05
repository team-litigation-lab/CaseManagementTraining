import { json, requireSession, logActivity } from '../_utils.js';

// POST /api/case-activity { action: 'ssn-view', caseId, clientName }
// Records a look at something sensitive on a case in the activity log (Master Control › Monitoring › Server Logs).
// Today that is the full SSN in the case header: it shows only its last 4 digits until 👁 is pressed
// (case-alerts.js), and each press is logged here with who, when, and which case.
const ACTIONS = new Set(['ssn-view']);
// a short line of plain text: no control characters, at most n characters
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const action = String((body && body.action) || '');
    if (!ACTIONS.has(action)) return json({ success: false, error: 'Unknown action.' }, 400);
    const { session } = auth;
    await logActivity(env.DB, session.username, session.batchId, action, { caseId: clip(body.caseId, 60), client: clip(body.clientName, 120) });
    return json({ success: true });
}
