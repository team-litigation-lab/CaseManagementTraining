import { requireSession } from '../_utils.js';

// GET /api/export-training-calendar
//
// Generates a downloadable .ics file of a CURATED, MOCK attorney schedule —
// not real case data (see export-calendar.js for that). This is a training
// simulation aid: a realistic-looking litigation caseload (intake, filing,
// discovery, depositions, mediation, trial) spread across ~5 weeks, so a
// trainee who imports it into their own Google Calendar experiences
// deadline pressure and scheduling conflicts in real time during training,
// the same way a working attorney would.
//
// Dated relative to the LOGGED-IN USER's OWN users.training_start_date
// (captured at registration — see register.js), not a fixed calendar
// range, specifically so this same template keeps working correctly for
// every future batch without ever needing to be regenerated or re-dated by
// hand. Falls back to today's date if the account has none set (e.g. an
// Admin downloading it to preview what trainees see).
//
// Every event is prefixed "[TRAINING SIM]" so it's never mistaken for a
// real client matter if it ends up in the same calendar as personal or
// real-case events (see export-calendar.js's "Export My Calendar").

function escapeICSText(s) {
    return String(s || '')
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
}

function foldLine(line) {
    if (line.length <= 75) return line;
    let out = line.slice(0, 75);
    let rest = line.slice(75);
    while (rest.length > 0) {
        out += '\r\n ' + rest.slice(0, 74);
        rest = rest.slice(74);
    }
    return out;
}

// Advances `date` forward to the next weekday (Mon-Fri) if it lands on a
// weekend — used so "Day 1" of the simulation never opens on a Saturday.
function nextWeekday(date) {
    const d = new Date(date);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return d;
}

// Returns the date `businessDays` business days after `startDate` (0 = the
// start date itself, already normalized to a weekday by the caller).
function addBusinessDays(startDate, businessDays) {
    const d = new Date(startDate);
    let remaining = businessDays;
    while (remaining > 0) {
        d.setUTCDate(d.getUTCDate() + 1);
        if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) remaining--;
    }
    return d;
}

function icsDateTime(date, hour, minute) {
    const d = new Date(date);
    d.setUTCHours(hour, minute, 0, 0);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(hour)}${pad(minute)}00`;
}

// The curated template: { businessDayOffset, startHour, startMin, durationMin, summary, description }
// ~5 weeks, modeled on a realistic litigation caseload arc from intake
// through trial. All-fictional matter names.
const TEMPLATE = [
    { day: 0, h: 9, m: 0, dur: 60, summary: 'Client Intake Meeting — New Case Review', desc: 'Initial consultation and case intake for a newly assigned matter.' },
    { day: 0, h: 14, m: 0, dur: 30, summary: 'Team Case Assignment Briefing', desc: 'Weekly briefing on new and ongoing case assignments.' },
    { day: 1, h: 10, m: 0, dur: 90, summary: 'Draft Initial Complaint — Doe v. Smith', desc: 'Draft and review the initial complaint prior to filing.' },
    { day: 2, h: 13, m: 0, dur: 30, summary: 'File Complaint with Court — Doe v. Smith', desc: 'Deadline to file the complaint with the court clerk.' },
    { day: 4, h: 9, m: 30, dur: 60, summary: 'Discovery Requests Due — Johnson Matter', desc: 'Respond to outstanding discovery requests.' },
    { day: 6, h: 11, m: 0, dur: 30, summary: 'Client Status Call — Martinez Case', desc: 'Scheduled update call with client on case progress.' },
    { day: 7, h: 14, m: 0, dur: 60, summary: 'Deposition Prep — Garcia', desc: 'Prepare questions and exhibits ahead of the Garcia deposition.' },
    { day: 9, h: 9, m: 0, dur: 180, summary: 'Deposition — Garcia v. State Farm', desc: 'Deposition of the defendant\'s witness.' },
    { day: 11, h: 15, m: 0, dur: 60, summary: 'Motion Hearing — Discovery Dispute', desc: 'Court hearing on a motion to compel discovery.' },
    { day: 13, h: 10, m: 0, dur: 120, summary: 'Mediation Session — Thompson Claim', desc: 'Mediation session with opposing counsel.' },
    { day: 14, h: 16, m: 0, dur: 30, summary: 'Discovery Cut-off — Johnson Matter', desc: 'Deadline: all discovery must be complete.' },
    { day: 16, h: 13, m: 0, dur: 30, summary: 'Expert Witness Disclosure Deadline', desc: 'Deadline to disclose expert witnesses and reports.' },
    { day: 17, h: 11, m: 0, dur: 90, summary: 'Settlement Conference — Doe v. Smith', desc: 'Settlement conference before the assigned judge.' },
    { day: 19, h: 9, m: 0, dur: 60, summary: 'Trial Prep Meeting', desc: 'Internal trial preparation and strategy meeting.' },
    { day: 20, h: 14, m: 0, dur: 60, summary: 'Pretrial Conference', desc: 'Final pretrial conference with the court.' },
    { day: 21, h: 13, m: 0, dur: 120, summary: 'CLE Seminar — Ethics in Litigation', desc: 'Continuing legal education seminar.' },
    { day: 24, h: 9, m: 0, dur: 360, summary: 'Trial — Garcia v. State Farm (Mock)', desc: 'Simulated trial date for training purposes.' },
];

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;

    const userRow = await db.prepare(`SELECT training_start_date FROM users WHERE username = ?`).bind(session.username).first();
    let anchor;
    let usedFallback = false;
    if (userRow && userRow.training_start_date && /^\d{4}-\d{2}-\d{2}$/.test(userRow.training_start_date)) {
        anchor = nextWeekday(new Date(userRow.training_start_date + 'T00:00:00Z'));
    } else {
        anchor = nextWeekday(new Date());
        usedFallback = true;
    }

    const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Legal Support Help//Case Management Training//EN',
        'CALSCALE:GREGORIAN',
    ];

    for (const ev of TEMPLATE) {
        const eventDate = addBusinessDays(anchor, ev.day);
        const dtstart = icsDateTime(eventDate, ev.h, ev.m);
        const endDate = new Date(eventDate);
        endDate.setUTCHours(ev.h, ev.m + ev.dur, 0, 0);
        const dtend = icsDateTime(endDate, endDate.getUTCHours(), endDate.getUTCMinutes());
        const uid = `training-sim-day${ev.day}-${ev.h}${ev.m}@lshcasemanagementtraining-trainingcrm.pages.dev`;
        lines.push('BEGIN:VEVENT');
        lines.push(foldLine(`UID:${uid}`));
        lines.push(`DTSTAMP:${dtstamp}`);
        lines.push(`DTSTART:${dtstart}`);
        lines.push(`DTEND:${dtend}`);
        lines.push(foldLine(`SUMMARY:${escapeICSText('[TRAINING SIM] ' + ev.summary)}`));
        lines.push(foldLine(`DESCRIPTION:${escapeICSText(ev.desc + ' (Simulated training event — not a real case.)')}`));
        lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    const body = lines.join('\r\n') + '\r\n';

    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': `attachment; filename="training-simulation-calendar.ics"`,
            'X-Used-Fallback-Date': String(usedFallback),
        },
    });
}
