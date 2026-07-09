import { json, requireSession, nextPrintSequence } from '../_utils.js';
export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const { caseId } = body;
    if (!caseId) return json({ success: false, error: 'Missing caseId.' }, 400);
    try {
        const printSequence = await nextPrintSequence(db, caseId);
        return json({ success: true, printSequence });
    } catch (e) {
        return json({ success: false, error: e.message }, 500);
    }
}
