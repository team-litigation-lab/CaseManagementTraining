import { json, logActivity, isUsernameTombstoned, cleanBatchId } from '../_utils.js';
import { portalOnly } from '../_portal.js';
import { isGuestUsername, isTrainerUsername, cleanGuestName, parseFullName } from '../_guest.js';
// Trainees register with three things: their full name, their Batch ID (B + the
// date their batch started, MMDDYY, e.g. B100526: cleanBatchId in _utils.js) and a
// username. There's no password: once an Admin approves the registration, they
// open the CMS from the LSH Training Portal (portal-login.js).
// Accounts registered earlier with a password sign in the same way.
const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;
// Day 1 of training is the day they register: the trainee's own date (their time
// zone) when it's within a day of the server's, otherwise the server's.
function startDate(sent) {
    const today = new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(sent || ''))) return today;
    const t = new Date(sent + 'T00:00:00Z').getTime();
    return !isNaN(t) && Math.abs(t - new Date(today + 'T00:00:00Z').getTime()) <= 86400000 ? sent : today;
}
export async function onRequestPost({ request, env }) {
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    if (portalOnly(env)) {
        return json({ success: false, code: 'PORTAL_REQUIRED', error: 'Registration is on the LSH Training Portal now. Register there, then open the CMS from the Portal.' }, 403);
    }
    const rawName = String(body.fullName || '').trim();
    const rawBatch = String(body.batchId || '').trim();
    const username = String(body.username || '').trim();
    if (!rawName || !rawBatch || !username) {
        return json({ success: false, error: 'Please fill in your full name, Batch ID and username.' }, 400);
    }
    const name = cleanGuestName(rawName);
    if (!name) {
        return json({ success: false, error: 'Enter your first and last name (letters, spaces, periods, hyphens or apostrophes; up to 60 characters).' }, 400);
    }
    const batchId = cleanBatchId(rawBatch);
    if (!batchId) {
        return json({ success: false, error: 'Enter your Batch ID as B and the date your batch started (MMDDYY), e.g. B100526.' }, 400);
    }
    if (!USERNAME_RE.test(username)) {
        return json({ success: false, error: 'Usernames are 3 to 30 letters, numbers or underscores.' }, 400);
    }
    // Usernames starting "guest-" belong to the name-only accounts (_guest.js):
    // reserved, so nobody registers their way into one.
    if (isGuestUsername(username)) {
        return json({ success: false, error: 'Usernames starting with "guest-" are reserved. Please choose another username.' }, 400);
    }
    if (isTrainerUsername(username)) {
        return json({ success: false, error: 'Usernames starting with "trainer-" are reserved. Please choose another username.' }, 400);
    }
    const existing = await db.prepare(`SELECT id FROM users WHERE username = ?`).bind(username).first();
    if (existing) {
        return json({ success: false, error: 'That username is already taken.' }, 409);
    }
    // A username that once belonged to a permanently-revoked account can
    // never be re-registered — this closes off the risk of a new user
    // inheriting an old (deleted) user's case visibility, since cases are
    // linked by username rather than by a durable row id. See
    // tombstoneUser()/isUsernameTombstoned() in _utils.js.
    if (await isUsernameTombstoned(db, username)) {
        return json({ success: false, error: 'That username has been permanently retired and cannot be used again.' }, 409);
    }
    const { first, mi, last, suffix } = parseFullName(name);
    // email and password stay filled for the table: a placeholder address, and a
    // password no sign-in accepts (as for trainers' accounts in login.js).
    await db.prepare(
        `INSERT INTO users (first_name, mi, last_name, suffix, email, user_type, batch_id, username, password, status, training_start_date)
         VALUES (?, ?, ?, ?, ?, 'Trainee', ?, ?, ?, 'Pending', ?)`
    ).bind(first, mi, last, suffix, `${username.toLowerCase()}@trainee.invalid`, batchId, username,
        'disabled:' + crypto.randomUUID() + crypto.randomUUID(), startDate(body.trainingStartDate)).run();
    await logActivity(db, username, batchId, 'register', { userType: 'Trainee' });
    return json({ success: true, batchId });
}
