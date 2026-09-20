import { json, requireSession } from '../_utils.js';

// GET /api/trainer-roster
//
// Admin-only. Returns every registered Trainee with a quick health status
// and two trends: completeness (from runAutomatedReview()'s findings, see
// _utils.js) and AI writing quality (see _ai-review.js), each comparing
// their earliest review entry against their most recent one. This is the
// "all trainees at a glance" view — for a single trainee's full
// day-by-day feed, see /api/trainee-dashboard (already used by both the
// trainee's own dashboard and this roster's drill-down).
//
// Deliberately does the trend aggregation here in JS after one query per
// table, rather than as complex correlated SQL — the realistic row count
// for a training cohort (a handful of trainees x a handful of days x a
// handful of cases) makes that both simpler and safer to get right than
// hand-rolled MIN/MAX-row subqueries in SQLite.
export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const db = env.DB;

    const { results: users } = await db.prepare(
        `SELECT username, training_start_date,
                TRIM(REPLACE(first_name || ' ' || COALESCE(mi, '') || ' ' || last_name, '  ', ' ')) AS full_name
         FROM users WHERE user_type = 'Trainee' ORDER BY full_name`
    ).all();

    const { results: reviews } = await db.prepare(
        `SELECT trainee_username, training_day, automated_findings, ai_review, ai_review_status, case_repository_id
         FROM case_reviews ORDER BY trainee_username, training_day ASC`
    ).all();

    const byTrainee = {};
    for (const r of (reviews || [])) {
        if (!byTrainee[r.trainee_username]) byTrainee[r.trainee_username] = [];
        byTrainee[r.trainee_username].push(r);
    }

    function summarizeFindings(row) {
        let findings = [];
        try { findings = JSON.parse(row.automated_findings); } catch (e) { findings = []; }
        return {
            fails: findings.filter(f => f.status === 'fail').length,
            warnings: findings.filter(f => f.status === 'warning').length,
            pass: findings.filter(f => f.status === 'pass').length,
        };
    }

    const roster = (users || []).map(u => {
        const rows = byTrainee[u.username] || [];
        const distinctCases = new Set(rows.map(r => r.case_repository_id)).size;

        const earliestCompleteness = rows.length ? summarizeFindings(rows[0]) : null;
        const latestCompleteness = rows.length ? summarizeFindings(rows[rows.length - 1]) : null;

        const aiScores = rows
            .filter(r => r.ai_review_status === 'complete')
            .map(r => { try { return JSON.parse(r.ai_review).writingQualityScore; } catch (e) { return null; } })
            .filter(s => typeof s === 'number');
        const earliestAi = aiScores.length ? aiScores[0] : null;
        const latestAi = aiScores.length ? aiScores[aiScores.length - 1] : null;

        let health = 'none'; // no case activity logged yet
        if (latestCompleteness) {
            if (latestCompleteness.fails > 0) health = 'red';
            else if (latestCompleteness.warnings > 0) health = 'yellow';
            else health = 'green';
        }

        return {
            username: u.username,
            fullName: u.full_name || u.username,
            trainingStartDate: u.training_start_date,
            distinctCases,
            entryCount: rows.length,
            lastActiveDay: rows.length ? rows[rows.length - 1].training_day : null,
            health,
            completeness: { earliest: earliestCompleteness, latest: latestCompleteness },
            writingQuality: { earliest: earliestAi, latest: latestAi },
        };
    });

    return json({ success: true, roster }, 200, { 'Cache-Control': 'no-store' });
}
