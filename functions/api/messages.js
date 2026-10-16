import { json, requireSession } from '../_utils.js';
import { MAX_THREAD, cleanCase, cleanMessage, ensureMessageTables, threadWhere, rowToMessage } from '../_messages.js';

// Client messaging (client-messages.js): the case's text thread with its client.
//
//   GET    /api/messages?caseRef=…&caseLabel=…[&user=<username>]
//          the caller's thread on that case, oldest first, with the unread count
//          (Admins: user= reads a trainee's thread).
//   POST   /api/messages {action: 'deliver', caseRef, caseLabel, message}
//          the client's next scripted text arrives (message-packs.js). Delivering the
//          same scripted message twice is ignored: the thread is returned as it stands.
//   POST   /api/messages {action: 'send', caseRef, caseLabel, message}   the trainee's reply
//   POST   /api/messages {action: 'read', caseRef, caseLabel}   the client's texts are read
//   POST   /api/messages {action: 'reset', caseRef, caseLabel}   clear the thread and start the script over
//   DELETE /api/messages?id=<id>   one message (the trainee's own, or an Admin's any)
//
// Tables and the shape of a message: functions/_messages.js.

async function readThread(db, owner, c) {
    const w = threadWhere(c);
    const { results } = await db.prepare(
        `SELECT * FROM client_messages WHERE owner_username = ? AND ${w.sql} ORDER BY created_at ASC, rowid ASC LIMIT ${MAX_THREAD}`
    ).bind(owner, ...w.args).all();
    return results || [];
}
const respond = (rows, session, extra) => json(Object.assign({
    success: true,
    messages: rows.map(r => rowToMessage(r, session)),
    unread: rows.filter(r => r.direction === 'in' && !r.read_at).length
}, extra || {}));

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const admin = session.userType === 'Admin';
    const url = new URL(request.url);
    const c = cleanCase({ caseRef: url.searchParams.get('caseRef'), caseLabel: url.searchParams.get('caseLabel') });
    if (c.error) return json({ success: false, error: c.error }, 400);

    // Admins can read a trainee's thread; everyone else reads their own.
    const asked = String(url.searchParams.get('user') || '').slice(0, 80);
    const owner = admin && asked ? asked : session.username;

    await ensureMessageTables(env.DB);
    const rows = await readThread(env.DB, owner, c.value);
    return respond(rows, session, { me: { username: session.username, name: session.fullName || session.username, admin }, owner });
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }

    const c = cleanCase(body);
    if (c.error) return json({ success: false, error: c.error }, 400);
    const action = String(body.action || '');
    await ensureMessageTables(env.DB);
    const w = threadWhere(c.value);

    if (action === 'read') {
        await env.DB.prepare(
            `UPDATE client_messages SET read_at = datetime('now')
             WHERE owner_username = ? AND direction = 'in' AND read_at IS NULL AND ${w.sql}`
        ).bind(session.username, ...w.args).run();
        return respond(await readThread(env.DB, session.username, c.value), session);
    }
    if (action === 'reset') {
        await env.DB.prepare(`DELETE FROM client_messages WHERE owner_username = ? AND ${w.sql}`).bind(session.username, ...w.args).run();
        return respond([], session);
    }
    if (action !== 'deliver' && action !== 'send') return json({ success: false, error: 'Unknown action.' }, 400);

    const m = cleanMessage(Object.assign({}, body.message, { direction: action === 'deliver' ? 'in' : 'out' }));
    if (m.error) return json({ success: false, error: m.error }, 400);
    const msg = m.value;

    const existing = await readThread(env.DB, session.username, c.value);
    // The same scripted text is never delivered twice (two tabs open, or the tab reloaded mid-thread).
    if (action === 'deliver' && msg.promptId && existing.some(r => r.direction === 'in' && r.prompt_id === msg.promptId)) {
        return respond(existing, session);
    }
    if (existing.length >= MAX_THREAD) {
        return json({ success: false, error: 'This thread is full. Reset it to practise again.' }, 409);
    }

    await env.DB.prepare(
        `INSERT INTO client_messages (id, owner_username, owner_name, case_ref, case_label, direction, sender, body, pack_id, prompt_id, goals, read_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), session.username, session.fullName || session.username, c.value.caseRef, c.value.caseLabel,
        msg.direction, msg.sender, msg.body, msg.packId, msg.promptId, msg.goals,
        msg.direction === 'out' ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null).run();

    return respond(await readThread(env.DB, session.username, c.value), session);
}

export async function onRequestDelete({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const admin = session.userType === 'Admin';
    const id = String(new URL(request.url).searchParams.get('id') || '').slice(0, 60);
    if (!id) return json({ success: false, error: 'Which message?' }, 400);
    await ensureMessageTables(env.DB);
    const row = await env.DB.prepare(`SELECT * FROM client_messages WHERE id = ?`).bind(id).first();
    if (!row) return json({ success: false, error: 'That message is already gone.' }, 404);
    if (!admin && row.owner_username !== session.username) return json({ success: false, error: 'That is not your message.' }, 403);
    await env.DB.prepare(`DELETE FROM client_messages WHERE id = ?`).bind(id).run();
    return respond(await readThread(env.DB, row.owner_username, { caseRef: row.case_ref, caseLabel: row.case_label }), session);
}
