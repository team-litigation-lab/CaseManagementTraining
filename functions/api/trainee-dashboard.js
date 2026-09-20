import { json, requireSession } from '../_utils.js';

// GET /api/trainee-dashboard?username=<optional>
//
// Returns the automated-review feed (see runAutomatedReview() in
// _utils.js, triggered from case-repository.js on every save) for a
// trainee, organized by training day. Any user can fetch their own;
// viewing someone else's requires Admin (a trainer checking on a
// specific trainee's progress).
//
// Phase 1 — trainee-side reading only. Phase 3 adds the full
// trainer-facing dashboard that lists every trainee at once; this
// endpoint's ?username= support is what that will build on.
export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;

    const url = new URL(request.url);
    const requestedUsername = url.searchParams.get('username');
    const targetUsername = requestedUsername || session.username;

    if (requestedUsername && requestedUsername !== session.username && session.userType !== 'Admin') {
        return json({ success: false, error: 'Only an Admin can view another trainee\'s dashboard.' }, 403);
    }

    const { results } = await db.prepare(
        `SELECT id, case_repository_id, case_id, client_name, training_day,
                automated_findings, trainer_comment, trainer_username,
                comment_updated_at, created_at
         FROM case_reviews
         WHERE trainee_username = ?
         ORDER BY created_at DESC`
    ).bind(targetUsername).all();

    const entries = (results || []).map(row => {
        let findings = [];
        try { findings = JSON.parse(row.automated_findings); } catch (e) { findings = []; }
        return {
            id: row.id,
            caseRepositoryId: row.case_repository_id,
            caseId: row.case_id,
            clientName: row.client_name,
            trainingDay: row.training_day,
            findings,
            trainerComment: row.trainer_comment,
            trainerUsername: row.trainer_username,
            commentUpdatedAt: row.comment_updated_at,
            createdAt: row.created_at,
        };
    });

    return json({ success: true, username: targetUsername, entries }, 200, { 'Cache-Control': 'no-store' });
}
