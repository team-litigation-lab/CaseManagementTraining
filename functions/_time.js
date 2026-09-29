// Time tracking: shared logic for /api/time (time-tracker.js in the page).
//
// Each person has at most one running timer (time_timers). It lives on the
// server, so it keeps counting across page reloads, browser tabs and sign-ins,
// and pausing, resuming or stopping it anywhere works everywhere. Stopping it
// saves a time entry (time_entries); entries can also be added by hand.
//
// Billing rule, as at most firms: billable time is billed in tenths of an hour
// (6 minutes), each entry rounded up, at least 0.1. Billable time must be on a
// case and say what was done (it's what the client reads on the invoice).
// Non-billable time (intake, scheduling, filing, admin, training…) is tracked
// the same way, so a timesheet shows both and the billable share.
//
// Tables are created on first use (CREATE TABLE IF NOT EXISTS), so there is no
// manual migration.

// [activity, billable by default]. Clerical work (scheduling, filing, admin) isn't billable to a client.
export const ACTIVITIES = [
    ['Case review & strategy', true],
    ['Client communication', true],
    ['Medical records & bills review', true],
    ['Drafting & correspondence', true],
    ['Demand & negotiation', true],
    ['Discovery', true],
    ['Legal research', true],
    ['Court, hearing or deposition', true],
    ['Intake (before retainer)', false],
    ['Scheduling & calendaring', false],
    ['Filing & administrative', false],
    ['Internal meeting', false],
    ['Training', false],
    ['Other', false]
];
const ACTIVITY_NAMES = ACTIVITIES.map(a => a[0]);

export const MAX_SECONDS = 24 * 3600;
// Billed hours: tenths of an hour, rounded up, at least 0.1 for any time at all.
export function billedHours(seconds) {
    const s = Math.max(0, Math.round(Number(seconds) || 0));
    return s ? Math.max(1, Math.ceil(s / 360)) / 10 : 0;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (s) => DATE.test(String(s || '')) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

// What the browser sends for an entry or a timer's details, checked.
// needComplete: a saved entry (billable time needs a case and a description); a running timer may be filled in later.
export function cleanDetails(b, needComplete) {
    b = b || {};
    const activity = ACTIVITY_NAMES.includes(b.activity) ? b.activity : 'Other';
    const out = {
        caseRef: clip(b.caseRef, 40), caseLabel: clip(b.caseLabel, 120), billable: !!b.billable,
        activity, description: clip(b.description, 1000)
    };
    if (needComplete && out.billable) {
        if (!out.caseLabel && !out.caseRef) return { error: 'Billable time has to be on a case. Link the case, or mark the time non-billable.' };
        if (!out.description) return { error: 'Say what you did: billable time needs a description (the client reads it on the invoice).' };
    }
    return { value: out };
}

/* ---------- storage (D1) ---------- */
const DDL = [
    `CREATE TABLE IF NOT EXISTS time_entries (
        id TEXT PRIMARY KEY,
        owner_username TEXT NOT NULL,
        owner_name TEXT,
        case_ref TEXT NOT NULL DEFAULT '',
        case_label TEXT NOT NULL DEFAULT '',
        billable INTEGER NOT NULL DEFAULT 0,
        activity TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        work_date TEXT NOT NULL,
        seconds INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_time_entries_owner_date ON time_entries (owner_username, work_date)`,
    `CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries (work_date)`,
    `CREATE TABLE IF NOT EXISTS time_timers (
        username TEXT PRIMARY KEY,
        owner_name TEXT,
        case_ref TEXT NOT NULL DEFAULT '',
        case_label TEXT NOT NULL DEFAULT '',
        billable INTEGER NOT NULL DEFAULT 0,
        activity TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        work_date TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        resumed_at INTEGER,
        accumulated INTEGER NOT NULL DEFAULT 0
    )`
];
export async function ensureTimeTables(db) {
    for (const sql of DDL) await db.prepare(sql).run();
}

// Milliseconds on the timer at `now` (resumed_at is null while paused).
export const timerMs = (t, now) => Math.min(MAX_SECONDS * 1000, Number(t.accumulated || 0) + (t.resumed_at ? Math.max(0, now - Number(t.resumed_at)) : 0));

export function rowToTimer(t, now) {
    if (!t) return null;
    return {
        caseRef: t.case_ref || '', caseLabel: t.case_label || '', billable: !!t.billable, activity: t.activity, description: t.description || '',
        date: t.work_date, startedAt: Number(t.started_at), running: !!t.resumed_at, resumedAt: t.resumed_at ? Number(t.resumed_at) : null,
        accumulated: Number(t.accumulated || 0), elapsedMs: timerMs(t, now)
    };
}
export function rowToEntry(r, session) {
    return {
        id: r.id, caseRef: r.case_ref || '', caseLabel: r.case_label || '', billable: !!r.billable, activity: r.activity,
        description: r.description || '', date: r.work_date, seconds: Number(r.seconds), hours: billedHours(r.seconds), source: r.source,
        owner: r.owner_username, ownerName: r.owner_name || r.owner_username,
        mine: !!session && r.owner_username === session.username, createdAt: r.created_at, updatedAt: r.updated_at
    };
}
