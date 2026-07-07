// Shared helpers for LSH Case Management System Cloudflare Pages Functions.

export function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

// Batch ID format: <YEAR>-LSH<TYPE>-<DDMMXXX>
// DD/MM is the approval date, XXX is a daily-reset-free running sequence
// per user type, tracked via a simple counter row we keep inside site_state
// using a lightweight key/value pattern (one row per counter).
export async function nextBatchId(db, userType) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const prefix = userType === 'Admin' ? 'LSHADMIN' : 'LSHTRAINEE';

    const countRow = await db.prepare(
        `SELECT COUNT(*) AS n FROM users WHERE user_type = ? AND batch_id IS NOT NULL AND batch_id != ''`
    ).bind(userType).first();
    const seq = ((countRow && countRow.n) || 0) + 1;
    const xxx = String(seq).padStart(3, '0');
    return `${year}-${prefix}-${dd}${mm}${xxx}`;
}

export async function verifyAdminCredentials(db, batchId, password) {
    const user = await db.prepare(
        `SELECT * FROM users WHERE batch_id = ? AND password = ? AND user_type = 'Admin' AND status = 'Approved'`
    ).bind(batchId, password).first();
    return user || null;
}

export async function verifyUsernamePassword(db, username, password, userType) {
    let query = `SELECT * FROM users WHERE username = ? AND password = ? AND status = 'Approved'`;
    const binds = [username, password];
    if (userType) { query += ` AND user_type = ?`; binds.push(userType); }
    const user = await db.prepare(query).bind(...binds).first();
    return user || null;
}

export async function logActivity(db, actorUsername, actorBatch, action, details) {
    try {
        await db.prepare(
            `INSERT INTO activity_log (actor_username, actor_batch, action, details) VALUES (?, ?, ?, ?)`
        ).bind(actorUsername || null, actorBatch || null, action, details ? JSON.stringify(details) : null).run();
    } catch (e) {
        // Activity logging is best-effort and must never break the request.
        console.error('activity log failed', e);
    }
}
