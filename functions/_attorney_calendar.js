// The Attorney's Calendar (Firm Calendar → 🗓 Attorney's Calendar): the calendar of the Calendaring activity.
//
// Its schedule is the attorney's week, the same every week (Monday to Friday): it came from the firm's
// Google Calendar export ("Attorney's Calendar", the week of Sep 7, 2026), with the appointments moved
// onto the Training Library's case files (each client's name, callback number, date of loss, case number
// and stage, and a note that fits where the file stands). The daily blocks are kept as they were: no
// schedule before 8 AM or after 5 PM, the daily case and email review, and lunch.
//
// The schedule is kept in D1 (calendar_template, made and filled from SEED on first use) so an Admin can
// change it: an edit changes that appointment every week, for everyone. Trainees add their own
// appointments on this calendar (ordinary events, calendar 'attorney'); they can't change the schedule.
// Each week's events are made from the rows: id tpl-<row id>-<date>.

export const ATTORNEY_CAL = 'attorney';
// [weekday (1 = Monday), start, end, type, title, case (Training Library id), client, where, notes]
export const SEED = [
    [1, "00:00", "08:00", "Blocked Time", "No Schedule Block", "", "", "", ""],
    [1, "08:00", "08:30", "Blocked Time", "Daily Case and Email Review", "", "", "", ""],
    [1, "09:00", "09:45", "Client Meeting", "Deposition Preparation: Niamh Cholmondeley", "MC-48", "Niamh Cholmondeley", "400 Commerce Street, Suite 1200", "Name: Niamh Cholmondeley\nCB Number: (555) 010-6840\nDOL: October 10, 2023\nCase: LSH-2023-MVA-902528 (Deposition, Atty. Elena Brooks)\n\nSpecial Note: Preparation for her deposition: review her recorded statement and the accident timeline."],
    [1, "10:15", "11:00", "Client Meeting", "Post-Settlement Meeting: James Wilson", "MC-06", "James Wilson", "400 Commerce Street, Suite 1200", "Name: James Wilson\nCB Number: (555) 010-4962\nDOL: January 12, 2025\nCase: LSH-2025-MVA-900353 (Disbursement, Atty. Marcus Reyes)\n\nSpecial Note: Ensure the full settlement breakdown is available."],
    [1, "12:00", "13:00", "Blocked Time", "Lunch Break", "", "", "", ""],
    [1, "14:00", "14:45", "Phone Call", "Mediation Preparation Call: Brian O'Neill", "MC-34", "Brian O'Neill", "Phone", "Name: Brian O'Neill\nCB Number: (555) 010-6720\nDOL: January 27, 2025\nCase: LSH-2025-PRL-900393 (Mediation, Atty. Elena Brooks)\n\nSpecial Note: Review expectations and the evidence list before mediation."],
    [1, "15:15", "15:45", "Client Meeting", "Urgent Meeting Request: Carlos Mendoza", "MC-14", "Carlos Mendoza", "400 Commerce Street, Suite 1200", "Name: Carlos Mendoza\nCB Number: (555) 010-5745\nDOL: February 11, 2025\nCase: LSH-2025-MVA-900470 (Litigation Discovery, Atty. Elena Brooks)\n\nSpecial Note: Urgent litigation update: the trucking company produced new driver logs."],
    [1, "17:00", "23:59", "Blocked Time", "No Schedule Block", "", "", "", ""],
    [2, "00:00", "08:00", "Blocked Time", "No Schedule Block", "", "", "", ""],
    [2, "08:00", "08:30", "Blocked Time", "Daily Case and Email Review", "", "", "", ""],
    [2, "10:30", "11:00", "Client Meeting", "Client Consultation: New PI Case: Walter Grant", "MC-36", "Walter Grant", "Zoom", "Name: Walter Grant\nCB Number: (555) 010-6740\nDOL: September 22, 2026\nCase: LSH-2026-PEDE-902235 (Intake, Atty. David Okafor)\n\nSpecial Note: New PI case: client seems upset from the accident."],
    [2, "11:15", "11:45", "Phone Call", "Missed Call Consultation: Hannah Pierce", "MC-16", "Hannah Pierce", "Phone", "Name: Hannah Pierce\nCB Number: (555) 010-5961\nDOL: December 9, 2025\nCase: LSH-2025-MVA-901053 (Pending Demand, Atty. Marcus Reyes)\n\nSpecial Note: Missed call: client says she may change lawyers. Attorney to call back."],
    [2, "12:00", "13:00", "Blocked Time", "Lunch Break", "", "", "", ""],
    [2, "13:00", "13:30", "Phone Call", "Case Status Updates: Aisha Patel", "MC-03", "Aisha Patel", "Phone", "Name: Aisha Patel\nCB Number: (555) 010-4633\nDOL: February 3, 2026\nCase: LSH-2026-DOG-901145 (Pending Demand, Atty. Marcus Reyes)\n\nSpecial Note: Insurance update ready for review (homeowner's carrier)."],
    [2, "14:00", "15:00", "Client Meeting", "New Intake Consultation: William Harris", "MC-12", "William Harris", "Google Meet", "Name: William Harris\nCB Number: (555) 010-5520\nDOL: September 14, 2026\nCase: LSH-2026-MVA-902051 (Intake, Atty. David Okafor)\n\nSpecial Note: New intake consultation: body shop storage charges; client wants a rental."],
    [2, "16:00", "16:45", "Client Meeting", "Post-Settlement Meeting: Harold Jenkins", "MC-30", "Harold Jenkins", "400 Commerce Street, Suite 1200", "Name: Harold Jenkins\nCB Number: (555) 010-6680\nDOL: June 22, 2025\nCase: LSH-2025-BOAT-900771 (Disbursement, Atty. Marcus Reyes)\n\nSpecial Note: Ensure the full settlement breakdown is available (Medicare lien)."],
    [2, "17:00", "23:59", "Blocked Time", "No Schedule Block", "", "", "", ""],
    [3, "00:00", "08:00", "Blocked Time", "No Schedule Block", "", "", "", ""],
    [3, "08:00", "08:30", "Blocked Time", "Daily Case and Email Review", "", "", "", ""],
    [3, "09:30", "10:00", "Internal Meeting", "Medical Records Review: Maria Santos", "MC-01", "Maria Santos", "400 Commerce Street, Suite 1200", "Name: Maria Santos\nCB Number: (555) 010-4417\nDOL: June 9, 2026\nCase: LSH-2026-MVA-901379 (Treating, Atty. Marcus Reyes)\n\nSpecial Note: Review the new PT notes from Motion Physical Therapy."],
    [3, "10:15", "10:45", "Client Meeting", "New Intake Consultation: Derek Thompson", "MC-02", "Derek Thompson", "Zoom", "Name: Derek Thompson\nCB Number: (555) 010-4520\nDOL: September 12, 2026\nCase: LSH-2026-SNF-902099 (Intake, Atty. David Okafor)\n\nSpecial Note: New intake consultation: retainer still out; client seems to be in a hurry."],
    [3, "11:15", "11:30", "Phone Call", "Attorney Phone Consultation: Rhys Beaumont", "MC-45", "Rhys Beaumont", "Phone", "Name: Rhys Beaumont\nCB Number: (555) 010-6890\nDOL: March 11, 2025\nCase: LSH-2025-MVA-902495 (Pending Demand, Atty. Marcus Reyes)\n\nSpecial Note: Demand attorney phone consultation: treatment finished, bills still coming in."],
    [3, "12:00", "13:00", "Blocked Time", "Lunch Break", "", "", "", ""],
    [3, "14:00", "14:45", "Client Meeting", "Deposition Preparation: Mireille Featherstonhaugh", "MC-39", "Mireille Featherstonhaugh", "400 Commerce Street, Suite 1200", "Name: Mireille Featherstonhaugh\nCB Number: (555) 010-6830\nDOL: September 15, 2024\nCase: LSH-2024-MVA-902439 (Litigation Discovery, Atty. Elena Brooks)\n\nSpecial Note: Preparation for her deposition."],
    [3, "15:45", "16:45", "Internal Meeting", "Discovery Conference: Linda Garcia", "MC-05", "Linda Garcia", "400 Commerce Street, Suite 1200", "Name: Linda Garcia\nCB Number: (555) 010-4850\nDOL: August 27, 2024\nCase: LSH-2024-PRL-900171 (Litigation Discovery, Atty. Elena Brooks)\n\nSpecial Note: Review the interrogatories and RFPs before responses are due."],
    [3, "17:00", "23:59", "Blocked Time", "No Schedule Block", "", "", "", ""],
    [4, "00:00", "08:00", "Blocked Time", "No Schedule Block", "", "", "", ""],
    [4, "08:00", "08:30", "Blocked Time", "Daily Case and Email Review", "", "", "", ""],
    [4, "09:30", "10:00", "Client Meeting", "Client Consultation: New PI Case: Nicole Adams", "MC-13", "Nicole Adams", "Phone", "Name: Nicole Adams\nCB Number: (555) 010-5634\nDOL: October 20, 2024\nCase: LSH-2026-PRL-902184 (Intake, Atty. David Okafor)\n\nSpecial Note: New PI case: statute of limitations is weeks away. Client will be driving during the meeting."],
    [4, "10:30", "11:00", "Client Meeting", "Document Review Follow-Up: Ahmed Rahman", "MC-32", "Ahmed Rahman", "Zoom", "Name: Ahmed Rahman\nCB Number: (555) 010-6700\nDOL: May 3, 2025\nCase: LSH-2026-MVA-901203 (BI Demanded, Atty. Marcus Reyes)\n\nSpecial Note: Review the prior firm's lien and file transfer documents: Zoom meeting."],
    [4, "12:00", "13:00", "Blocked Time", "Lunch Break", "", "", "", ""],
    [4, "14:30", "15:00", "Client Meeting", "Client Consultation: New PI Case: Bjorn Courthope", "MC-50", "Bjorn Courthope", "Zoom", "Name: Bjorn Courthope\nCB Number: (555) 010-6870\nDOL: April 11, 2022\nCase: LSH-2022-MVA-902540 (Intake, Atty. David Okafor)\n\nSpecial Note: New PI case: client prefers to have the meeting via Zoom."],
    [4, "15:15", "15:45", "Client Meeting", "Case Review Consultation: Estate of George Hammond", "MC-20", "Estate of George Hammond", "400 Commerce Street, Suite 1200", "Name: Estate of George Hammond (Carol Hammond, administrator)\nCB Number: (555) 010-6307\nDOL: March 28, 2026\nCase: LSH-2026-MVA-901288 (Pending Demand, Atty. Elena Brooks)\n\nSpecial Note: Case review with the estate's administrator (wrongful death)."],
    [4, "17:00", "23:59", "Blocked Time", "No Schedule Block", "", "", "", ""],
    [5, "00:00", "08:00", "Blocked Time", "No Schedule Block", "", "", "", ""],
    [5, "08:00", "08:30", "Blocked Time", "Daily Case and Email Review", "", "", "", ""],
    [5, "09:00", "09:45", "Internal Meeting", "Case Strategy Meeting: Cian Masserene", "MC-52", "Cian Masserene", "400 Commerce Street, Suite 1200", "Name: Cian Masserene\nCB Number: (555) 010-6920\nDOL: October 11, 2024\nCase: LSH-2024-MVA-902562 (Litigation Discovery, Atty. Elena Brooks)\n\nSpecial Note: Litigation planning."],
    [5, "11:00", "11:30", "Phone Call", "Attorney Phone Consultation Meeting: Robert Chen", "MC-04", "Robert Chen", "Phone", "Name: Robert Chen\nCB Number: (555) 010-4741\nDOL: November 18, 2025\nCase: LSH-2025-MVA-900909 (BI Demanded, Atty. Marcus Reyes)\n\nSpecial Note: Needs clarification on the policy-limits demand and the offer deadline."],
    [5, "12:00", "13:00", "Blocked Time", "Lunch Break", "", "", "", ""],
    [5, "13:00", "13:30", "Phone Call", "Follow Up Call: Existing Client: Keisha Brown", "MC-07", "Keisha Brown", "Phone", "Name: Keisha Brown\nCB Number: (555) 010-5073\nDOL: October 4, 2025\nCase: LSH-2025-MVA-900857 (UM or UIM Demanded, Atty. Marcus Reyes)\n\nSpecial Note: Existing PI client. Follow-up on the UM insurance update; confirm her new phone number."],
    [5, "14:30", "15:00", "Phone Call", "Case Status Updates: Emily Nguyen", "MC-09", "Emily Nguyen", "Phone", "Name: Emily Nguyen\nCB Number: (555) 010-5291\nDOL: March 15, 2025\nCase: LSH-2025-SNF-900593 (BI Settlement Negotiations, Atty. Marcus Reyes)\n\nSpecial Note: Insurance update ready for review (settlement negotiations)."],
    [5, "15:30", "16:00", "Client Meeting", "Document Signing: Denise Carter", "MC-29", "Denise Carter", "400 Commerce Street, Suite 1200", "Name: Denise Carter\nCB Number: (555) 010-6670\nDOL: February 17, 2025\nCase: LSH-2025-MVA-900513 (UM or UIM Settled, Atty. Marcus Reyes)\n\nSpecial Note: Settlement documents, in-office meeting."],
    [5, "17:00", "23:59", "Blocked Time", "No Schedule Block", "", "", "", ""],
];

const DDL = [
    `CREATE TABLE IF NOT EXISTS calendar_template (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        calendar TEXT NOT NULL DEFAULT 'attorney',
        weekday INTEGER NOT NULL,
        start_time TEXT NOT NULL DEFAULT '',
        end_time TEXT NOT NULL DEFAULT '',
        all_day INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        location TEXT NOT NULL DEFAULT '',
        case_ref TEXT NOT NULL DEFAULT '',
        case_label TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        updated_by TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS calendar_meta (k TEXT PRIMARY KEY, v TEXT)`
];
const seedInsert = (db, r) => db.prepare(
    `INSERT INTO calendar_template (calendar, weekday, start_time, end_time, all_day, title, type, location, case_ref, case_label, notes)
     VALUES ('attorney', ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`).bind(r[0], r[1], r[2], r[4], r[3], r[7], r[5], r[6], r[8]);
let ready = false;
// The table, filled from SEED the first time (once: an Admin who removes rows doesn't get them back by surprise).
export async function ensureTemplate(db) {
    if (ready) return;
    for (const sql of DDL) await db.prepare(sql).run();
    const done = await db.prepare(`SELECT v FROM calendar_meta WHERE k = 'attorney_seeded'`).first();
    // (one batch, one transaction, marker first: if another request seeds it at the same moment, its marker is
    // already there, this batch fails as a whole and nothing is doubled)
    if (!done) {
        try { await db.batch([db.prepare(`INSERT INTO calendar_meta (k, v) VALUES ('attorney_seeded', datetime('now'))`)].concat(SEED.map(r => seedInsert(db, r)))); }
        catch (e) { /* seeded by the other request */ }
    }
    ready = true;
}
// Back to the schedule as it came (Admins: ↺ Restore the original schedule).
export async function resetTemplate(db) {
    await ensureTemplate(db);
    await db.batch([db.prepare(`DELETE FROM calendar_template WHERE calendar = 'attorney'`)].concat(SEED.map(r => seedInsert(db, r))));
}
// An imported appointment (Firm Calendar → ⬆ Import .ics onto the Attorney's Calendar) that is one of the schedule's
// own: its type and case file, from the same title, or the same case number in its notes (Case: LSH-…).
const caseNo = (notes) => (/Case:\s*(LSH-[A-Z0-9-]+)/i.exec(String(notes || '')) || [])[1] || '';
export function seedFor(title, notes) {
    const t = String(title || '').trim().toLowerCase(), n = caseNo(notes).toUpperCase();
    const hit = SEED.find(r => r[4].toLowerCase() === t) || (n ? SEED.find(r => caseNo(r[8]).toUpperCase() === n) : null);
    return hit ? { type: hit[3], caseRef: hit[5], caseLabel: hit[6], sameTitle: hit[4].toLowerCase() === t } : null;
}
// The schedule replaced by these rows (an Admin's import), in batches a Pages Function can run.
export async function replaceTemplate(db, rows, who) {
    await ensureTemplate(db);
    const ins = rows.map(r => db.prepare(
        `INSERT INTO calendar_template (calendar, weekday, start_time, end_time, all_day, title, type, location, case_ref, case_label, notes, updated_by)
         VALUES ('attorney', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(r.weekday, r.allDay ? '' : r.start, r.allDay ? '' : r.end, r.allDay ? 1 : 0, r.title, r.type,
        r.location || '', r.caseRef || '', r.caseLabel || '', r.notes || '', who || null));
    const first = [db.prepare(`DELETE FROM calendar_template WHERE calendar = 'attorney'`)].concat(ins.slice(0, 39));
    await db.batch(first);
    for (let i = 39; i < ins.length; i += 40) await db.batch(ins.slice(i, i + 40));
}
export async function templateRows(db) {
    const { results } = await db.prepare(`SELECT * FROM calendar_template ORDER BY weekday, start_time, id`).all();
    return results || [];
}

const toDay = (s) => new Date(s + 'T00:00:00Z');
const addDay = (s, n) => { const d = toDay(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// The schedule's events for every day from `from` to `to` (inclusive).
export function templateEvents(rows, from, to, session) {
    const admin = !!session && session.userType === 'Admin';
    const out = [];
    const n = Math.min(Math.round((toDay(to) - toDay(from)) / 86400000), 400);
    for (let i = 0; i <= n; i++) {
        const date = addDay(from, i), wd = toDay(date).getUTCDay();
        rows.forEach(r => {
            if (r.weekday !== wd) return;
            out.push({
                id: `tpl-${r.id}-${date}`, calendar: r.calendar || ATTORNEY_CAL, invite: [], title: r.title, type: r.type, date,
                start: r.all_day ? '' : r.start_time, end: r.all_day ? '' : r.end_time, allDay: !!r.all_day, location: r.location || '',
                caseRef: r.case_ref || '', caseLabel: r.case_label || '', notes: r.notes || '',
                source: 'template', templateId: r.id, weekday: r.weekday, readOnly: !admin
            });
        });
    }
    return out;
}
