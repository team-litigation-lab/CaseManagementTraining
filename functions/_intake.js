// Intake folder: shared logic for /api/intake-files (not routed: the file name starts with _).
//
// The Case Repository's Intake folder holds two kinds of intake file, kept apart
// from the case files:
//   - 'form': an intake typed in the case editor (Intake mode), stored as the
//     same content payload a saved case has (buildCaseContentPayload in app.js);
//   - 'document': an intake sheet uploaded as a PDF or image (R2, via /api/upload).
// Every save or upload is checked against the intake checklist below and then
// reviewed by Claude (_intake-review.js). The table is created on first use.

const DDL = `CREATE TABLE IF NOT EXISTS intake_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    owner_username TEXT NOT NULL,
    owner_name TEXT,
    owner_batch_id TEXT,
    client_name TEXT,
    date_of_loss TEXT,
    content TEXT,
    content_hash TEXT,
    doc_key TEXT,
    doc_name TEXT,
    doc_mime TEXT,
    doc_size INTEGER,
    note TEXT,
    check_score INTEGER,
    check_findings TEXT,
    ai_status TEXT,
    ai_review TEXT,
    ai_requested_at TEXT,
    ai_reviewed_at TEXT,
    reviewed_hash TEXT,
    moved_case_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;
let ready = false;
export async function ensureIntakeTable(db) {
    if (ready) return;
    await db.batch([
        db.prepare(DDL),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_intake_files_owner ON intake_files(owner_username, updated_at)`),
    ]);
    ready = true;
}

// Files Claude can read directly (Doc Hub's reviewer uses the same list).
export const REVIEWABLE_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/* ---------- text helpers ---------- */
export function stripHtml(html) {
    return String(html || '')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<(br|\/div|\/p|\/tr|\/li)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
        .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}
const clean = (v, n = 4000) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const words = (s) => (clean(s, 100000).match(/[A-Za-z0-9']+/g) || []).length;

// Police tab values: the pane's own markup is saved whole (content.html.police), and its
// four fields are always, in order, agency, report number, officer, narrative.
export function policeFields(html) {
    const vals = [];
    const re = /<div[^>]*contenteditable="true"[^>]*>([\s\S]*?)<\/div>/gi;
    let m;
    while ((m = re.exec(String(html || ''))) && vals.length < 4) vals.push(clean(stripHtml(m[1])));
    return { agency: vals[0] || '', report: vals[1] || '', officer: vals[2] || '', narrative: vals[3] || '' };
}

/* ---------- dates ---------- */
// Accepts MM/DD/YYYY (the editor's format), M/D/YYYY and YYYY-MM-DD; null when unreadable.
export function parseDate(s) {
    const t = clean(s, 40);
    let y, mo, d, m;
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) [, mo, d, y] = m;
    else if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) [, y, mo, d] = m;
    else return null;
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dt = new Date(iso + 'T00:00:00Z');
    return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === iso ? iso : null;
}
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
export const todayIso = () => new Date().toISOString().slice(0, 10);

/* ---------- the intake checklist ----------
   What a complete personal injury intake captures. Essentials fail when missing;
   recommended items only warn. The score is the weighted share that passed
   (essentials count double), so a trainee sees at a glance how complete it is. */
export const CHECKLIST = [
    { key: 'clientName', label: 'Client name', essential: true },
    { key: 'phone', label: 'Phone number', essential: true },
    { key: 'dob', label: 'Date of birth', essential: true },
    { key: 'dateOfLoss', label: 'Date of loss (accident date)', essential: true },
    { key: 'sol', label: 'Statute of limitations (SOL) date', essential: true },
    { key: 'facts', label: 'What happened (facts of loss)', essential: true },
    { key: 'injuries', label: 'Injuries and treatment', essential: true },
    { key: 'insurance', label: 'Insurance (claim, carrier or policy)', essential: true },
    { key: 'address', label: 'Home address', essential: false },
    { key: 'email', label: 'Email address', essential: false },
    { key: 'police', label: 'Police or incident report', essential: false },
    { key: 'emergency', label: 'Emergency contact', essential: false },
    { key: 'notes', label: 'Intake call notes', essential: false },
    { key: 'attorney', label: 'Attorney assigned', essential: false },
];
const INJURY_WORDS = /injur|pain|hurt|fractur|broke|whiplash|sprain|strain|concuss|bruis|laceration|stitches|hospital|\ber\b|emergency room|urgent care|doctor|chiro|physical therapy|\bpt\b|mri|x-ray|surgery|ambulance/i;

// Turns found values into findings: { key, label, essential, status: pass|warning|fail, message }.
function evaluate(v) {
    const today = todayIso();
    const out = [];
    // present: the value was given (a warning on a present value is a caution, not a gap).
    const push = (item, status, message, present = true) => out.push({ key: item.key, label: item.label, essential: item.essential, status, message, present });
    for (const item of CHECKLIST) {
        const val = v[item.key];
        const missing = item.essential ? 'fail' : 'warning';
        if (item.key === 'dateOfLoss') {
            if (!val) { push(item, missing, 'The accident date is missing. Every deadline is counted from it.', false); continue; }
            const iso = parseDate(val);
            if (!iso) push(item, 'warning', `"${clean(val, 40)}" isn't a date in MM/DD/YYYY form. Check it with the client.`);
            else if (iso > today) push(item, 'fail', `The date of loss (${clean(val, 40)}) is in the future.`);
            else push(item, 'pass', `Date of loss: ${clean(val, 40)}.`);
        } else if (item.key === 'sol') {
            if (!val) { push(item, missing, 'The SOL date is missing. It is the most important deadline on an intake.', false); continue; }
            const iso = parseDate(val), dol = parseDate(v.dateOfLoss);
            if (!iso) push(item, 'warning', `"${clean(val, 40)}" isn't a date in MM/DD/YYYY form.`);
            else if (dol && iso <= dol) push(item, 'fail', 'The SOL date is on or before the date of loss. Recalculate it.');
            else if (iso < today) push(item, 'fail', `The SOL (${clean(val, 40)}) has already passed. Flag this to the attorney now.`);
            else if (daysBetween(today, iso) <= 90) push(item, 'warning', `The SOL (${clean(val, 40)}) is ${daysBetween(today, iso)} days away. Flag it as urgent.`);
            else push(item, 'pass', `SOL: ${clean(val, 40)}.`);
        } else if (item.key === 'dob') {
            if (!val) { push(item, missing, 'Date of birth is missing (needed to verify the caller and for minors\' deadlines).', false); continue; }
            const iso = parseDate(val);
            if (!iso) push(item, 'warning', `"${clean(val, 40)}" isn't a date in MM/DD/YYYY form.`);
            else if (iso >= today) push(item, 'fail', 'The date of birth is today or in the future.');
            else {
                const age = Math.floor(daysBetween(iso, today) / 365.25);
                push(item, 'pass', age < 18 ? `Date of birth recorded. The client is a minor (${age}): confirm the parent or guardian.` : 'Date of birth recorded.');
            }
        } else if (item.key === 'facts') {
            const n = words(val);
            if (!n) push(item, missing, 'There is no account of what happened.', false);
            else if (n < 25) push(item, 'warning', `Only ${n} words about what happened. Record how, where and who was at fault.`);
            else push(item, 'pass', `What happened is written up (${n} words).`);
        } else if (val) {
            push(item, 'pass', `${item.label} recorded.`);
        } else {
            const why = {
                clientName: 'The client\'s name is missing.',
                phone: 'No phone number to call the client back.',
                injuries: 'Nothing about injuries or treatment. Ask what hurts and where they were treated.',
                insurance: 'No insurance information. Ask for the other driver\'s or property owner\'s carrier and claim number.',
                address: 'No home address.',
                email: 'No email address.',
                police: 'No police or incident report details. Ask if one was made and get the report number.',
                emergency: 'No emergency contact.',
                notes: 'No notes from the intake call.',
                attorney: 'No attorney assigned yet.',
            }[item.key] || `${item.label} missing.`;
            push(item, missing, why, false);
        }
    }
    return out;
}
export function scoreOf(findings) {
    let total = 0, got = 0;
    findings.forEach(f => {
        const w = f.essential ? 2 : 1;
        total += w;
        if (f.status === 'pass' || (f.status === 'warning' && f.present)) got += w;
    });
    return total ? Math.round(got / total * 100) : 0;
}

// A typed intake: read the checklist values out of the saved content.
export function formValues(content, clientName) {
    const c = content || {}, i = c.intake || {}, html = c.html || {};
    const police = policeFields(html.police);
    const injuries = [stripHtml(html.facs), stripHtml(html.chrono)].join(' ').trim();
    const facts = [i.narrative, police.narrative].filter(Boolean).join(' ');
    return {
        clientName: clean(clientName, 200),
        phone: clean(i.phone, 80), dob: clean(i.dob, 40), dateOfLoss: clean(c.dateOfLoss, 40), sol: clean(c.solBar, 40),
        facts,
        injuries: injuries || (INJURY_WORDS.test(i.narrative || '') ? 'described in the narrative' : ''),
        insurance: [stripHtml(html.bi), stripHtml(html.pipum)].join(' ').trim(),
        address: clean(i.address, 300), email: clean(i.email, 200),
        police: police.agency || police.report,
        emergency: i.emergencyName || i.emergencyPhone ? `${clean(i.emergencyName, 100)} ${clean(i.emergencyPhone, 40)}`.trim() : '',
        notes: stripHtml(html.notes), attorney: clean(c.attorney, 120),
    };
}
export const checkForm = (content, clientName) => {
    const findings = evaluate(formValues(content, clientName));
    return { findings, score: scoreOf(findings) };
};

// An uploaded document: before the review, only what can be known without reading it.
export function checkDocumentUpload({ mime, clientName }) {
    const findings = [];
    if (!REVIEWABLE_MIME.has(mime)) findings.push({ key: 'file', label: 'Readable file', essential: true, status: 'fail', message: 'Only PDF and image files can be read and reviewed. Save the intake as a PDF and upload it again.' });
    else findings.push({ key: 'file', label: 'Readable file', essential: true, status: 'pass', message: 'The file can be read and reviewed.' });
    if (!clean(clientName)) findings.push({ key: 'label', label: 'Client named on upload', essential: false, status: 'warning', message: 'No client name was given with the upload, so the file is harder to find.' });
    return { findings, score: null };
}
// After the review: the checklist, from what the reviewer found in the document.
export function checkDocumentFields(fields, clientName) {
    const f = fields || {};
    const has = (k) => clean(f[k]);
    const findings = evaluate({
        clientName: has('clientName') || clean(clientName), phone: has('phone'), dob: has('dateOfBirth'),
        dateOfLoss: has('dateOfLoss'), sol: has('statuteOfLimitations'),
        facts: has('whatHappened'), injuries: has('injuries') || has('treatment'), insurance: has('insurance'),
        address: has('address'), email: has('email'), police: has('policeReport'), emergency: has('emergencyContact'),
        notes: has('notes'), attorney: has('attorney'),
    });
    return { findings, score: scoreOf(findings) };
}

// What the reviewer reads for a typed intake.
export function formSummary(content, clientName) {
    const c = content || {}, i = c.intake || {}, html = c.html || {};
    const police = policeFields(html.police);
    const section = (label, text) => `## ${label}\n${clean(text, 6000) || '(blank)'}`;
    return [
        `Today's date: ${todayIso()}`,
        section('Client', [`Name: ${clean(clientName, 200) || '(blank)'}`, `Phone: ${clean(i.phone) || '(blank)'}`, `Date of birth: ${clean(i.dob) || '(blank)'}`,
            `Email: ${clean(i.email) || '(blank)'}`, `Address: ${clean(i.address) || '(blank)'}`,
            `Emergency contact: ${clean(`${i.emergencyName || ''} ${i.emergencyPhone || ''}`) || '(blank)'}`].join('\n')),
        section('Case', [`Case type: ${clean(c.caseType === 'Others' ? stripHtml(c.caseTypeOther) : c.caseType) || '(blank)'}`, `Date of loss: ${clean(c.dateOfLoss) || '(blank)'}`,
            `Statute of limitations: ${clean(c.solBar) || '(blank)'}`, `Attorney: ${clean(c.attorney) || '(blank)'}`, `Case manager: ${clean(c.caseManager) || '(blank)'}`].join('\n')),
        section('What happened (case narrative)', i.narrative),
        section('Police report', `Agency: ${police.agency || '(blank)'}\nReport number: ${police.report || '(blank)'}\nOfficer: ${police.officer || '(blank)'}\nNarrative: ${police.narrative || '(blank)'}`),
        section('Insurance (bodily injury)', stripHtml(html.bi)),
        section('Insurance (PIP / UM)', stripHtml(html.pipum)),
        section('Treatment providers', stripHtml(html.facs)),
        section('Treatment chronology', stripHtml(html.chrono)),
        section('Passengers', stripHtml(html.pass)),
        section('Intake call notes', stripHtml(html.notes)),
        section('Tasks', stripHtml(html.tasks)),
    ].join('\n\n');
}

// Row → what the page lists. A review requested more than 3 minutes ago that never came
// back (closed tab, timeout) shows as stalled so it can be run again.
export function rowToItem(r, session) {
    let findings = [], review = null;
    try { findings = JSON.parse(r.check_findings || '[]'); } catch (e) { findings = []; }
    try { review = r.ai_review ? JSON.parse(r.ai_review) : null; } catch (e) { review = null; }
    let aiStatus = r.ai_status || 'none';
    if (aiStatus === 'pending' && r.ai_requested_at && Date.now() - Date.parse(r.ai_requested_at.replace(' ', 'T') + 'Z') > 3 * 60000) aiStatus = 'stalled';
    return {
        id: r.id, kind: r.kind, owner: r.owner_username, ownerName: r.owner_name || r.owner_username, ownerBatchId: r.owner_batch_id || '',
        mine: !!session && r.owner_username === session.username,
        clientName: r.client_name || '', dateOfLoss: r.date_of_loss || '', note: r.note || '',
        docName: r.doc_name || '', docMime: r.doc_mime || '', docSize: r.doc_size || 0, docUrl: r.doc_key ? `/api/file?key=${encodeURIComponent(r.doc_key)}` : '',
        checkScore: r.check_score, findings,
        fails: findings.filter(f => f.status === 'fail').length, warnings: findings.filter(f => f.status === 'warning').length,
        aiStatus, review, aiReviewedAt: r.ai_reviewed_at || null,
        stale: r.kind === 'form' && !!r.reviewed_hash && r.reviewed_hash !== r.content_hash,
        movedCaseId: r.moved_case_id || null, createdAt: r.created_at, updatedAt: r.updated_at,
    };
}
