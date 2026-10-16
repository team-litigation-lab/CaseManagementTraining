// Client messaging: shared logic for /api/messages (client-messages.js in the page).
//
// A case's text thread with its client, the way a firm's case management system
// keeps one: the client texts the firm's line, the case manager answers, and
// every message stays on the case for whoever picks it up next.
//
// The client's side is scripted (message-packs.js in the page, the same idea as
// the Call Simulator's call packs): a trainee never talks to a real person here.
// The script is sent in by the page when a thread is started or moves on, and
// the server keeps only what was said, so the packs can be rewritten without a
// migration. The trainee's replies are kept with the scripted message they
// answer (`prompt_id`), so a trainer can read a thread the way they read a call.
//
// Each trainee has their own thread on a case: two trainees practising on the
// same Training Library file don't see each other's replies. Admins can read
// any trainee's thread (`user=` on the GET).
//
// Tables are created on first use (CREATE TABLE IF NOT EXISTS), so there is no
// manual migration.

export const MAX_BODY = 1600;          // a text message; the page says so too
export const MAX_THREAD = 400;         // messages kept per trainee per case

const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

// A case is identified the way the timer identifies one: its case number when it
// has one (LSH-… or a Training Library id), otherwise the client's name.
export function cleanCase(b) {
    const caseRef = clip(b && b.caseRef, 40), caseLabel = clip(b && b.caseLabel, 120);
    if (!caseRef && !caseLabel) return { error: 'Open a case first: a message belongs to a case.' };
    return { value: { caseRef, caseLabel } };
}

// What the page sends for one message. `direction` is 'in' (the client) or 'out' (the trainee).
// An inbound message is scripted, so it carries the pack's id and its coaching notes; an outbound
// one is what the trainee typed, with the inbound message it answers.
export function cleanMessage(b) {
    b = b || {};
    const direction = b.direction === 'in' ? 'in' : 'out';
    const body = clip(b.body, MAX_BODY);
    if (!body) return { error: 'Type a message first.' };
    return {
        value: {
            direction, body,
            sender: clip(b.sender, 120),
            promptId: clip(b.promptId, 60),
            packId: clip(b.packId, 60),
            goals: Array.isArray(b.goals) ? JSON.stringify(b.goals.map(g => clip(g, 300)).filter(Boolean).slice(0, 12)) : ''
        }
    };
}

/* ---------- storage (D1) ---------- */
const DDL = [
    `CREATE TABLE IF NOT EXISTS client_messages (
        id TEXT PRIMARY KEY,
        owner_username TEXT NOT NULL,
        owner_name TEXT,
        case_ref TEXT NOT NULL DEFAULT '',
        case_label TEXT NOT NULL DEFAULT '',
        direction TEXT NOT NULL,
        sender TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL,
        pack_id TEXT NOT NULL DEFAULT '',
        prompt_id TEXT NOT NULL DEFAULT '',
        goals TEXT NOT NULL DEFAULT '',
        read_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_client_messages_thread ON client_messages (owner_username, case_ref, case_label, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_client_messages_unread ON client_messages (owner_username, direction, read_at)`
];
export async function ensureMessageTables(db) {
    for (const sql of DDL) await db.prepare(sql).run();
}

// The thread a message belongs to: the case number when there is one, else the client's name.
// (Matched the same way on the way out, so a case saved before it had a number keeps its thread.)
export function threadWhere(c) {
    return {
        sql: `((? != '' AND case_ref = ?) OR (? = '' AND lower(case_label) = lower(?)))`,
        args: [c.caseRef, c.caseRef, c.caseRef, c.caseLabel]
    };
}

export function rowToMessage(r, session) {
    let goals = [];
    try { goals = r.goals ? JSON.parse(r.goals) : []; } catch (e) { goals = []; }
    return {
        id: r.id, direction: r.direction, sender: r.sender || '', body: r.body,
        packId: r.pack_id || '', promptId: r.prompt_id || '', goals,
        read: !!r.read_at, at: r.created_at,
        owner: r.owner_username, ownerName: r.owner_name || r.owner_username,
        mine: !!session && r.owner_username === session.username
    };
}
