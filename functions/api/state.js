import { json } from '../_utils.js';

export async function onRequestGet({ env }) {
    const db = env.DB;

    const [state, announcement, alert, ping] = await Promise.all([
        db.prepare(`SELECT paused, locked, locked_by_batch FROM site_state WHERE id = 1`).first(),
        db.prepare(`SELECT text FROM announcements WHERE id = 1`).first(),
        db.prepare(`SELECT * FROM alerts WHERE stopped = 0 ORDER BY id DESC LIMIT 1`).first(),
        db.prepare(`SELECT id, text, target, by, fired_at FROM pings ORDER BY id DESC LIMIT 1`).first()
    ]);

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

    return json({
        paused: !!(state && state.paused),
        locked: !!(state && state.locked),
        lockedBy: state ? state.locked_by_batch : null,
        announcement: { text: (announcement && announcement.text) || 'Welcome to the LSH Training Interface.' },
        alert: alertPayload,
        ping: ping ? { id: ping.id, text: ping.text, target: ping.target, by: ping.by, firedAt: ping.fired_at } : null
    });
}
