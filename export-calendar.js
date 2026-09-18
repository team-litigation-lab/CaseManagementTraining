import { requireSession } from '../_utils.js';

// GET /api/export-calendar
//
// Generates a downloadable .ics (iCalendar) file of every date-bearing
// deadline across the cases the logged-in user can see (same visibility
// rule as the case list: their own cases, plus any finalized case, plus
// everything if they're an Admin) — NOT a live Google Calendar connection.
// The person downloads this file once and imports it into their own
// Google Calendar (Settings > Import & export > Import), which is the
// "generate a mock calendar for import" approach chosen over building a
// full OAuth integration for a training environment.
//
// Pulls from the dedicated date_of_loss / sol_bar / sol_litigation /
// complaint_filed / discovery_cutoff / trial_date columns (populated by
// case-repository.js from buildCaseContentPayload() in app.js) rather than
// parsing dates back out of the saved case HTML.
//
// Known quirk, not introduced here: the summary bar's SOL (sol_bar) and
// the Litigation tab's separate Statute (SOL) field (sol_litigation) are
// two independent, unlinked inputs in the UI. Both are exported as
// distinct, clearly-labeled events rather than silently dropping one.

const FIELDS = [
    { column: 'date_of_loss', label: 'Date of Loss' },
    { column: 'sol_bar', label: 'SOL Deadline (Summary Bar)' },
    { column: 'sol_litigation', label: 'SOL Deadline (Litigation Tab)' },
    { column: 'complaint_filed', label: 'Complaint Filed' },
    { column: 'discovery_cutoff', label: 'Discovery Cut-off' },
    { column: 'trial_date', label: 'Trial Date' },
];

// MM/DD/YYYY -> YYYYMMDD (iCalendar all-day DATE value). Returns null for
// anything that doesn't match — old data or a stray manual edit shouldn't
// crash the whole export, just skip that one event.
function toICSDate(mmddyyyy) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((mmddyyyy || '').trim());
    if (!m) return null;
    const [, mm, dd, yyyy] = m;
    return `${yyyy}${mm}${dd}`;
}

// RFC 5545 §3.3.11 text escaping for SUMMARY/DESCRIPTION values.
function escapeICSText(s) {
    return String(s || '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
}

function foldLine(line) {
    // RFC 5545 §3.1 requires folding lines longer than 75 octets — most
    // calendar apps tolerate long lines fine, but Google Calendar's
    // importer has been known to choke on very long SUMMARY lines, so we
    // fold defensively.
    if (line.length <= 75) return line;
    let out = line.slice(0, 75);
    let rest = line.slice(75);
    while (rest.length > 0) {
        out += '\r\n ' + rest.slice(0, 74);
        rest = rest.slice(74);
    }
    return out;
}

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;

    const { results } = await db.prepare(
        `SELECT case_id, client_name, date_of_loss, sol_bar, sol_litigation,
                complaint_filed, discovery_cutoff, trial_date
         FROM case_repository
         WHERE is_draft = 0 OR owner_username = ? OR ? = 'Admin'
         ORDER BY updated_at DESC`
    ).bind(session.username, session.userType).all();

    const now = new Date();
    const dtstamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Legal Support Help//Case Management Training//EN',
        'CALSCALE:GREGORIAN',
    ];

    let eventCount = 0;
    for (const row of (results || [])) {
        const clientLabel = row.client_name && row.client_name.trim() ? row.client_name.trim() : (row.case_id || 'Unnamed Case');
        for (const { column, label } of FIELDS) {
            const raw = row[column];
            const icsDate = toICSDate(raw);
            if (!icsDate) continue;
            eventCount++;
            const uid = `case-${row.case_id || 'draft'}-${column}@lshcasemanagementtraining-trainingcrm.pages.dev`;
            lines.push('BEGIN:VEVENT');
            lines.push(foldLine(`UID:${uid}`));
            lines.push(`DTSTAMP:${dtstamp}`);
            lines.push(`DTSTART;VALUE=DATE:${icsDate}`);
            lines.push(foldLine(`SUMMARY:${escapeICSText(label)} — ${escapeICSText(clientLabel)}`));
            lines.push(foldLine(`DESCRIPTION:${escapeICSText('Case ID: ' + (row.case_id || '(draft, not yet finalized)'))}`));
            lines.push('END:VEVENT');
        }
    }

    lines.push('END:VCALENDAR');
    const body = lines.join('\r\n') + '\r\n';

    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': `attachment; filename="my-case-calendar.ics"`,
            'X-Event-Count': String(eventCount),
        },
    });
}
