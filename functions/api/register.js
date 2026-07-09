import { json, logActivity, hashPassword, isUsernameTombstoned } from '../_utils.js';
// ...
const existing = await db.prepare(`SELECT id FROM users WHERE username = ?`).bind(username).first();
if (existing) {
    return json({ success: false, error: 'That username is already taken.' }, 409);
}
if (await isUsernameTombstoned(db, username)) {
    return json({ success: false, error: 'That username has been permanently retired and cannot be used again.' }, 409);
}

const REG_PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{8,}$/;

export async function onRequestPost({ request, env }) {
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }

    const { firstName, mi, lastName, suffix, email, userType, username, password, trainingStartDate } = body;

    if (!firstName || !lastName || !email || !userType || !username || !password) {
        return json({ success: false, error: 'Please fill out all required fields.' }, 400);
    }
    if (!/^[^\s@]+@gmail\.com$/i.test(email)) {
        return json({ success: false, error: 'Please enter a valid Gmail address.' }, 400);
    }
    if (!['Admin', 'Trainee'].includes(userType)) {
        return json({ success: false, error: 'Invalid user type.' }, 400);
    }
    if (!REG_PASSWORD_RE.test(password)) {
        return json({
            success: false,
            error: 'Password must be at least 8 characters long and contain only letters and numbers (at least one letter and one number).'
        }, 400);
    }

    let normalizedTrainingStartDate = null;
    if (userType === 'Trainee') {
        if (!trainingStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(trainingStartDate) || isNaN(new Date(trainingStartDate).getTime())) {
            return json({ success: false, error: 'Please enter a valid start of training date.' }, 400);
        }
        normalizedTrainingStartDate = trainingStartDate;
    }

    const existing = await db.prepare(`SELECT id FROM users WHERE username = ?`).bind(username).first();
    if (existing) {
        return json({ success: false, error: 'That username is already taken.' }, 409);
    }

    const hashedPassword = await hashPassword(password);

    await db.prepare(
        `INSERT INTO users (first_name, mi, last_name, suffix, email, user_type, batch_id, username, password, status, training_start_date)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, 'Pending', ?)`
    ).bind(firstName, mi || null, lastName, suffix || null, email, userType, username, hashedPassword, normalizedTrainingStartDate).run();

    await logActivity(db, username, null, 'register', { userType });

    return json({ success: true });
}
