// POST /api/export-trainees { ticket }  (the Portal's own system ticket, see _portal.js)
// The Portal's "Import existing registrations" reads the CMS's trainee list from here, so trainees registered in
// the CMS don't register again on the Portal. Names, batch and status only: no usernames, emails or passwords.
import { json } from '../_utils.js';
import { readPortalTicket, portalOnly } from '../_portal.js';

export async function onRequestPost({ request, env }) {
    if (!portalOnly(env)) return json({ success: false, code: 'NOT_CONFIGURED' }, 501);
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const who = await readPortalTicket(env, body.ticket);
    if (!who || !who.system) return json({ success: false, error: 'The Portal\'s system ticket is required.' }, 403);
    const { results } = await env.DB.prepare(
        `SELECT first_name, mi, last_name, suffix, batch_id, status FROM users WHERE user_type = 'Trainee' LIMIT 10000`
    ).all();
    return json({ success: true, trainees: (results || []).map(u => ({ first: u.first_name, mi: u.mi || '', last: u.last_name, suffix: u.suffix || '', batch: u.batch_id || '', status: u.status })) },
        200, { 'Cache-Control': 'no-store' });
}
