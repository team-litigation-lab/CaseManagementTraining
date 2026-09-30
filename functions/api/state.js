import { json } from '../_utils.js';

export async function onRequestGet({ env }) {
    const db = env.DB;

    let [state, announcement, alert, ping] = await Promise.all([
        db.prepare(`SELECT paused, locked, locked_by_batch FROM site_state WHERE id = 1`).first(),
        db.prepare(`SELECT text FROM announcements WHERE id = 1`).first(),
        db.prepare(`SELECT * FROM alerts WHERE stopped = 0 ORDER BY id DESC LIMIT 1`).first(),
        db.prepare(`SELECT id, text, target, by, fired_at FROM pings ORDER BY id DESC LIMIT 20`).all()
    ]);
    const recent = (ping && ping.results) || [];
    ping = recent[0] || null;

    let alertPayload = { active: false };
    if (alert) {
        const startAt = new Date(alert.start_at).getTime();
        const now = Date.now();
        const isLive = now >= startAt && !(alert.duration_seconds > 0 && now >= startAt + alert.duration_seconds * 1000);
        if (isLive) {
            alertPayload = {
                active: true,
                id: alert.id,
                text: alert.text,
                bgColor: alert.bg_color,
                image: alert.image,
                durationSeconds: alert.duration_seconds,
                startAt: alert.start_at
            };
        }
    }

    // A ping's target is stored as either a plain string ('__all__' or a single
    // username) or, for multi-recipient pings, a JSON-encoded array of usernames.
    // Parse it back into an array; if it isn't valid JSON (the plain-string case),
    // fall back to the raw stored value unchanged.
    const parseTarget = (t) => {
        if (typeof t !== 'string') return t;
        try { const parsed = JSON.parse(t); if (Array.isArray(parsed)) return parsed; } catch (e) { /* plain '__all__' or single username */ }
        return t;
    };
    // Each ping's age is measured here, on the server, so a trainee whose computer
    // clock is off still gets it. `pings` is the last minute's (newest first), so a
    // ping sent right after another one isn't lost between two polls; `ping` is the
    // newest, for pages loaded before `pings` existed.
    const now = Date.now();
    const shape = (p) => ({ id: p.id, text: p.text, target: parseTarget(p.target), by: p.by, firedAt: p.fired_at,
        ageMs: p.fired_at && isFinite(Date.parse(p.fired_at)) ? Math.max(0, now - Date.parse(p.fired_at)) : null });
    const pings = recent.map(shape).filter(p => p.ageMs !== null && p.ageMs < 60000);

    return json({
        paused: !!(state && state.paused),
        locked: !!(state && state.locked),
        lockedBy: state ? state.locked_by_batch : null,
        announcement: { text: (announcement && announcement.text) || 'Welcome to the LSH Training Interface.' },
        alert: alertPayload,
        ping: ping ? shape(ping) : null,
        pings
    });
}
