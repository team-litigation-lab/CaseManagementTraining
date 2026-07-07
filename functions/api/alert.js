import { json, logActivity } from '../_utils.js';

// Returns the currently-live alert (respecting schedule + duration), or null.
async function getActiveAlert(db) {
    const alert = await db.prepare(
        `SELECT * FROM alerts WHERE stopped = 0 ORDER BY id DESC LIMIT 1`
    ).first();
    if (!alert) return null;

    const startAt = new Date(alert.start_at).getTime();
    const now = Date.now();
    if (now < startAt) {
        // Scheduled for the future — not live yet.
        return { pending: true, ...alert };
    }
    if (alert.duration_seconds && alert.duration_seconds > 0) {
        const endAt = startAt + alert.duration_seconds * 1000;
        if (now >= endAt) return null; // expired
    }
    return { active: true, ...alert };
}

export async function onRequestGet({ env }) {
    const result = await getActiveAlert(env.DB);
    if (!result || result.pending) return json({ active: false });
    return json({
        active: true,
        id: result.id,
        text: result.text,
        bgColor: result.bg_color,
        image: result.image,
        durationSeconds: result.duration_seconds,
        startAt: result.start_at
    });
}

export async function onRequestPost({ request, env }) {
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const { text, bgColor, image, durationSeconds, startAt } = body;
    if (!text || !String(text).trim()) return json({ success: false, error: 'Alert text is required.' }, 400);

    // Only one active alert at a time — stop any previous one.
    await db.prepare(`UPDATE alerts SET stopped = 1 WHERE stopped = 0`).run();

    await db.prepare(
        `INSERT INTO alerts (text, bg_color, image, duration_seconds, start_at, stopped)
         VALUES (?, ?, ?, ?, ?, 0)`
    ).bind(
        String(text).trim(),
        bgColor || '#b91c1c',
        image || null,
        Number(durationSeconds) || 0,
        startAt || new Date().toISOString()
    ).run();

    await logActivity(db, null, null, 'alert-set', { text, startAt, durationSeconds });
    return json({ success: true });
}

export async function onRequestDelete({ env }) {
    const db = env.DB;
    await db.prepare(`UPDATE alerts SET stopped = 1 WHERE stopped = 0`).run();
    await logActivity(db, null, null, 'alert-stop', null);
    return json({ success: true });
}
