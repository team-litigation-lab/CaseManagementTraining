import { json, requireSession, nextCaseId, getSiteState, logActivity } from '../_utils.js';

// POST /api/case-id
// Issues the next permanent, cross-device-unique Case ID. Called by the
// frontend exactly once — at the moment "Save Case" is clicked for a case
// that doesn't already have one. Never called for drafts/previews, and
// never called more than once for the same case (the frontend re-uses the
// stored ID on subsequent saves of an already-finalized case).
export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;

    const state = await getSiteState(env.DB);
    if (state.locked && session.userType !== 'Admin') {
        return json({ success: false, error: 'Site is currently locked.' }, 403);
    }

    let body;
    try { body = await request.json(); } catch (e) { body = {}; }
    const typeCode = body && body.typeCode;

    let caseId;
    try {
        caseId = await nextCaseId(env.DB, typeCode);
    } catch (e) {
        console.error('nextCaseId failed', e);
        return json({ success: false, error: 'Could not assign a Case ID. Please try again.' }, 500);
    }

    await logActivity(env.DB, session.username, session.batchId, 'case-id-issued', { caseId });

    return json({ success: true, caseId });
}
