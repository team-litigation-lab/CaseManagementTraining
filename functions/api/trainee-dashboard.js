import { json, requireSession, buildFullName } from '../_utils.js';

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
        `SELECT r.id, r.case_repository_id, r.case_id, r.client_name, r.training_day,
                r.automated_findings, r.changed_sections, r.ai_review, r.ai_review_status, r.ai_reviewed_at,
                r.trainer_comment, r.trainer_username, r.comment_updated_at, r.created_at,
                t.first_name AS t_first, t.mi AS t_mi, t.last_name AS t_last, t.suffix AS t_suffix
         FROM case_reviews r LEFT JOIN users t ON t.username = r.trainer_username
         WHERE r.trainee_username = ?
         ORDER BY r.created_at DESC`
    ).bind(targetUsername).all();

    const entries = (results || []).map(row => {
        let findings = [];
        try { findings = JSON.parse(row.automated_findings); } catch (e) { findings = []; }
        let changedSections = [];
        try { changedSections = row.changed_sections ? JSON.parse(row.changed_sections) : []; } catch (e) { changedSections = []; }
        let aiReview = null;
        try { aiReview = row.ai_review ? JSON.parse(row.ai_review) : null; } catch (e) { aiReview = null; }
        const entry = {
            id: row.id,
            caseRepositoryId: row.case_repository_id,
            caseId: row.case_id,
            clientName: row.client_name,
            trainingDay: row.training_day,
            findings,
            changedSections,
            aiReview,
            aiReviewStatus: row.ai_review_status,
            aiReviewedAt: row.ai_reviewed_at,
            createdAt: row.created_at,
        };
        // Trainer Notes: the trainee reads their trainer's note on each entry (My Dashboard, read only);
        // only an Admin can write one (review-comment.js). The trainer is shown by name.
        entry.trainerComment = row.trainer_comment;
        entry.trainerUsername = row.trainer_username;
        entry.trainerName = buildFullName({ first_name: row.t_first, mi: row.t_mi, last_name: row.t_last, suffix: row.t_suffix }) || null;
        entry.commentUpdatedAt = row.comment_updated_at;
        return entry;
    });

    return json({ success: true, username: targetUsername, entries }, 200, { 'Cache-Control': 'no-store' });
}
