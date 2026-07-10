import { json, requireSession, nextPrintSequence } from '../_utils.js';

// POST /api/print-sequence
// Issues the next atomic, cross-device-unique Print Sequence number for a
// given case's PDF Case Summary download. Called by the frontend at the
// moment a download is confirmed (see confirmDownload() in index.html).
// Replaces an earlier implementation that tracked a per-case download
// count purely in client-side localStorage, which could not stay unique
// across different devices/users downloading the same case.
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
        console.error('nextPrintSequence failed', e);
        return json({ success: false, error: e.message }, 500);
    }
}
