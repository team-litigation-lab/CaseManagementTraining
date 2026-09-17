import { json, requireSession } from '../_utils.js';
export async function onRequestGet({ request, env }) {
    // Names, emails, batch IDs, and approval status for every registered
    // user — this should never have been world-readable. Admin only.
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const db = env.DB;
    // full_name is computed here (First [MI] Last — suffix intentionally
    // excluded, matching the convention already used by tombstoneUser() in
    // _utils.js) so every consumer gets one consistent display name instead
    // of each caller re-deriving it from the separate name columns. The
    // Ping recipient search dropdown in particular has no client-side
    // fallback and depends on this field directly for sorting/searching/
    // display.
    const { results } = await db.prepare(
        `SELECT id, first_name, mi, last_name, suffix, email, user_type, batch_id, username, status, created_at, training_start_date,
                TRIM(REPLACE(first_name || ' ' || COALESCE(mi, '') || ' ' || last_name, '  ', ' ')) AS full_name
         FROM users ORDER BY created_at ASC`
    ).all();
    return json(results || []);
}
