import { json, requireSession, logActivity } from '../_utils.js';

// POST /api/review-comment
// Body: { reviewId, comment }
//
// Lets a trainer add or edit their feedback on one automated-review entry
// (see case_reviews table). Admin-only — this is the "Additional input
// from the trainer" half of the review a trainee sees on their dashboard;
// the automated findings half is generated server-side on save and is
// never editable here.
export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;

    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const { reviewId, comment } = body;
    if (!reviewId) return json({ success: false, error: 'Missing reviewId.' }, 400);

    const existing = await db.prepare(`SELECT id, trainee_username FROM case_reviews WHERE id = ?`).bind(reviewId).first();
    if (!existing) return json({ success: false, error: 'Review entry not found.' }, 404);

    await db.prepare(
        `UPDATE case_reviews SET trainer_comment = ?, trainer_username = ?, comment_updated_at = datetime('now') WHERE id = ?`
    ).bind((comment || '').trim() || null, session.username, reviewId).run();

    await logActivity(db, session.username, session.batchId, 'review-comment', { reviewId, traineeUsername: existing.trainee_username });

    return json({ success: true });
}
