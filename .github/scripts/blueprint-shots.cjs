// Takes the screenshots on the 🧭 Blueprint's slides (blueprint/*.jpg) from the CMS itself, in a browser, with the
// API answered by this script (a made-up class: trainees, saved cases, results; the case files are the real
// Training Library). Run it again after a change to a screen the Blueprint shows, then check the pictures.
// Not part of CI. Usage: node .github/scripts/blueprint-shots.cjs [name ...]   (from the repository root;
// needs `npm i playwright`; TAILWIND_JS=<a copy of cdn.tailwindcss.com> makes the pages look as they do live)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = process.cwd(), OUT = path.join(ROOT, 'blueprint');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
const TAILWIND = process.env.TAILWIND_JS ? fs.readFileSync(process.env.TAILWIND_JS) : null;

// ---- the made-up class ----
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const day = (d, hm) => `2026-10-0${d} ${hm}:00`;
const TRAINEE = { username: 'jlopez', fullName: 'Jamie Lopez', batchId: 'B300926', userType: 'Trainee' };
const ADMIN = { username: 'trainer-ana', fullName: 'Ana Reyes', batchId: '', userType: 'Admin' };
const PEOPLE = [['Jamie', 'Lopez', 'jlopez'], ['Marcus', 'Bell', 'mbell'], ['Priya', 'Shah', 'pshah'], ['Noah', 'Kim', 'nkim'], ['Grace', 'Okoye', 'gokoye'], ['Leo', 'Ramos', 'lramos']];
const USERS = [
    { username: 'LSHADMIN123', first_name: 'System', last_name: 'Administrator', user_type: 'Admin', batch_id: '', status: 'Approved', created_at: '2026-09-01' },
    { username: 'trainer-ana', first_name: 'Ana', last_name: 'Reyes', user_type: 'Admin', batch_id: '', status: 'Approved', created_at: '2026-09-02' },
    ...PEOPLE.map(([f, l, u], i) => ({ username: u, first_name: f, last_name: l, user_type: 'Trainee', batch_id: 'B300926', status: 'Approved', created_at: `2026-09-30 0${i}:00` })),
    { username: 'tdavis', first_name: 'Tara', last_name: 'Davis', user_type: 'Trainee', batch_id: 'B061026', status: 'Pending', created_at: '2026-10-04 08:10' },
    { username: 'owright', first_name: 'Omar', last_name: 'Wright', user_type: 'Trainee', batch_id: 'B061026', status: 'Pending', created_at: '2026-10-04 08:25' },
    { username: 'scho', first_name: 'Sun', last_name: 'Cho', user_type: 'Trainee', batch_id: 'B061026', status: 'Pending', created_at: '2026-10-04 08:41' }
];
const ONLINE = PEOPLE.map(([f, l, u], i) => ({ username: u, full_name: `${f} ${l}`, user_type: 'Trainee', batch_id: 'B300926', current_case: i < 4 ? ['Maria Santos', 'Derek Thompson', 'Aisha Patel', 'Linda Garcia'][i] : '', last_seen: i < 5 ? ago(0.2) : ago(95) }));
const CASES = [
    { id: 41, caseId: 'LSH-2026-MVA-000041', clientName: 'Maria Santos', phase: 'Treating', isDraft: false, ownerUsername: 'jlopez', submittedBy: 'Jamie Lopez', dateOfLoss: '06/09/2026', canEdit: true, updatedAt: day(4, '09:42') },
    { id: 40, caseId: 'LSH-2026-SNF-000040', clientName: 'Derek Thompson', phase: 'Intake', isDraft: false, ownerUsername: 'mbell', submittedBy: 'Marcus Bell', dateOfLoss: '09/12/2026', canEdit: false, updatedAt: day(4, '09:31') },
    { id: 39, caseId: 'LSH-2026-DOG-000039', clientName: 'Aisha Patel', phase: 'Pending Demand', isDraft: false, ownerUsername: 'pshah', submittedBy: 'Priya Shah', dateOfLoss: '02/03/2026', canEdit: false, updatedAt: day(4, '09:12') },
    { id: 38, caseId: null, clientName: 'Linda Garcia', phase: 'Litigation', isDraft: true, ownerUsername: 'nkim', submittedBy: 'Noah Kim', dateOfLoss: '08/27/2024', canEdit: false, updatedAt: day(3, '16:55') },
    { id: 37, caseId: 'LSH-2026-MVA-000037', clientName: 'Carlos Mendoza', phase: 'Litigation', isDraft: false, ownerUsername: 'gokoye', submittedBy: 'Grace Okoye', dateOfLoss: '03/14/2025', canEdit: false, updatedAt: day(3, '15:20') }
];
const RESULTS = [];
PEOPLE.forEach(([f, l, u], i) => [0, 1, 2].forEach(k => RESULTS.push({ id: 100 + i * 3 + k, username: u, full_name: `${f} ${l}`, batch_id: 'B300926', mode: k === 2 ? 'practice' : 'drill', calls: k === 2 ? 1 : 8,
    score: 92 - i * 4 - k * 3, find_score: 29 - i, auth_score: 36 - i - k, handle_score: 27 - k, avg_seconds: 74 + i * 9, created_at: day(4 - k, `1${i}:0${k}`) })));
const ROSTER = PEOPLE.map(([f, l, u], i) => ({ username: u, fullName: `${f} ${l}`, health: ['green', 'green', 'amber', 'green', 'red', 'amber'][i], distinctCases: 6 - i % 3, lastActiveDay: 4,
    completeness: { earliest: { fails: 3 + i % 2, warnings: 4 }, latest: { fails: i % 3 === 2 ? 2 : 0, warnings: 1 + i % 2 } }, writingQuality: { earliest: 2 + i % 2, latest: 4 - (i === 4 ? 1 : 0) } }));
const ENTRIES = [
    { id: 7, clientName: 'Maria Santos', caseId: 'LSH-2026-MVA-000041', trainingDay: 4, createdAt: ago(35),
        findings: [{ status: 'pass', check: 'Client details', message: 'Name, phone, date of birth and address are filled in.' },
            { status: 'pass', check: 'Insurance', message: 'The BI claim has its carrier, claim number and adjuster.' },
            { status: 'warning', check: 'Treatment', message: 'City Spine & Rehab has no next appointment date.' },
            { status: 'fail', check: 'Notes', message: 'No Case Note since the client\'s call this morning.' }],
        changedSections: [{ label: 'Insurance', wasEmpty: false }, { label: 'Tasks', wasEmpty: true }],
        trainerComment: 'Good work on the insurance tab. Log a Case Note for every call: who, what, when and the next step.', trainerName: 'Ana Reyes', commentUpdatedAt: ago(20) },
    { id: 6, clientName: 'Derek Thompson', caseId: 'LSH-2026-SNF-000036', trainingDay: 3, createdAt: ago(60 * 20),
        findings: [{ status: 'pass', check: 'Client details', message: 'Complete.' }, { status: 'pass', check: 'Notes', message: '3 Case Notes, each with a next step.' }],
        changedSections: [{ label: 'Notes', wasEmpty: false }] }
];
const intake = (id, kind, clientName, owner, ownerName, dateOfLoss, extra) => Object.assign({ id, kind, owner, ownerName, ownerBatchId: 'B300926', mine: false, clientName, dateOfLoss, note: '',
    docName: '', docMime: '', docSize: 0, docUrl: '', checkScore: null, findings: [], fails: 0, warnings: 0, aiStatus: 'none', review: null, aiReviewedAt: null, stale: false, movedCaseId: null,
    createdAt: day(4, '08:00'), updatedAt: day(4, '08:00') }, extra);
const INTAKES = [
    intake(3, 'form', 'Rosa Jimenez', 'jlopez', 'Jamie Lopez', '09/30/2026', { checkScore: 86, findings: [{ status: 'pass', check: 'Key information', message: 'Complete.' }, { status: 'warning', check: 'Facts of loss', message: 'No weather or road conditions.' }], warnings: 1, updatedAt: day(4, '10:12') }),
    intake(2, 'upload', 'Henry Walsh', 'mbell', 'Marcus Bell', '09/27/2026', { docName: 'walsh-intake.pdf', docMime: 'application/pdf', docSize: 182000, docUrl: '#', updatedAt: day(4, '09:40') }),
    intake(1, 'form', 'Dana Brooks', 'pshah', 'Priya Shah', '09/21/2026', { checkScore: 94, findings: [{ status: 'pass', check: 'Key information', message: 'Complete.' }], movedCaseId: 'LSH-2026-DOG-000035', updatedAt: day(3, '15:05') })
];

function answer(session) {
    const admin = session && session.userType === 'Admin';
    return (u) => {
        const p = u.pathname;
        if (p === '/api/state') return { paused: false, announcement: { text: admin ? '' : 'Day 4: Reception practice calls after lunch. Log every call as a Case Note.' }, alert: { active: false }, ping: null };
        if (p === '/api/case-repository') return { success: true, cases: admin ? CASES : CASES.filter(c => c.ownerUsername === session.username) };
        if (p === '/api/users') return USERS;
        if (p === '/api/heartbeat') return ONLINE;
        if (p === '/api/server-logs') return { success: true, logs: [] };
        if (p === '/api/trainer-roster') return { success: true, roster: ROSTER };
        if (p === '/api/trainee-dashboard') return { success: true, entries: ENTRIES };
        if (p === '/api/drill-results') return { success: true, isAdmin: admin, results: admin ? RESULTS : RESULTS.filter(r => r.username === session.username) };
        if (p === '/api/live-call') return { success: false };
        if (p === '/api/calendar' && u.searchParams.get('from')) {   // the attorneys' standing schedule, as the server sends it
            const from = u.searchParams.get('from'), to = u.searchParams.get('to') || from;
            return { success: true, today: CAL.firmToday(), from, to, calendars: CAL.CALENDARS, types: CAL.EVENT_TYPES, events: CAL.standingEvents(from, to), deadlines: [],
                feedToken: null, google: null, synced: null, me: { username: session.username, name: session.fullName, admin } };
        }
        if (p === '/api/intake-files') return { success: true, reviewConfigured: true, files: admin ? INTAKES : INTAKES.filter(f => f.owner === session.username) };
        return { success: true, results: [], cases: [], files: [], events: [], entries: [], items: [], logs: [] };
    };
}

async function open(browser, session, query) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    page.on('pageerror', e => console.warn(`  page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    if (TAILWIND) await page.route(/cdn\.tailwindcss\.com/, r => r.fulfill({ contentType: 'text/javascript', body: TAILWIND }));
    const reply = answer(session);
    await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply(new URL(r.request().url()))) }));
    if (session) await page.addInitScript((s) => { if (window.top === window) sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(s)); }, session);
    await page.goto(base + (query || ''), { waitUntil: 'load' }); await page.waitForTimeout(1200);
    return page;
}
// a case file on a tab; any tab but the Profile is scrolled up to the row of tabs, so its contents show
const caseTab = (id, tab, opts) => async (p) => {
    await p.evaluate(([id, tab, opts]) => { openMockCase(id, Object.assign({ silent: true }, opts || {})); if (tab) showTab(tab); }, [id, tab, opts]);
    if (tab && tab !== 'profile') {
        await p.waitForTimeout(500);
        await p.evaluate(() => { const area = document.getElementById('capture-area'), row = document.getElementById('tab-profile');
            area.scrollTop += row.getBoundingClientRect().top - area.getBoundingClientRect().top - 16; });
    }
};
const mc = (tab) => async (p) => { await p.evaluate((tab) => { openAdminDashboard(); showAdminDashTab(tab); }, tab); };

// file name → who, the program link, what to open (and an optional part of the screen)
const SHOTS = {
    // the Trainee blueprint
    'trainee-case-file': { who: TRAINEE, q: '?program=cm', go: caseTab('MC-01', 'profile') },
    'trainee-sign-in': { who: null, go: async (p) => { await p.evaluate(() => { if (window.showLoginView) showLoginView(); }); } },
    'trainee-search': { who: TRAINEE, q: '?program=cm', go: async (p) => { await caseTab('MC-01', 'profile')(p); await p.fill('#cl-bar-input', 'santos'); await p.waitForTimeout(500); } },
    'trainee-contacts': { who: TRAINEE, q: '?program=cm', go: async (p) => { await caseTab('MC-05', 'profile')(p); await p.click('#ct-bar-input'); await p.keyboard.type('voss'); await p.waitForTimeout(200); await p.keyboard.press('Enter'); } },
    'trainee-new-intake': { who: TRAINEE, q: '?program=intake', go: async (p) => { await p.evaluate(() => openNewIntake()); await p.click('.nm-card[data-form]'); } },
    'trainee-insurance': { who: TRAINEE, q: '?program=cm', go: caseTab('MC-01', 'matrix') },
    'trainee-notes': { who: TRAINEE, q: '?program=cm', go: caseTab('MC-01', 'notes') },
    'trainee-tasks': { who: TRAINEE, q: '?program=cm', go: caseTab('MC-01', 'tasks') },
    'trainee-calendar': { who: TRAINEE, q: '?program=cm', go: caseTab('MC-01', 'calendar') },
    'trainee-reception': { who: TRAINEE, q: '?program=reception', go: async (p) => { await p.evaluate(() => openFrontDeskDrill()); } },
    'trainee-dashboard': { who: TRAINEE, q: '?program=cm', go: async (p) => { await p.evaluate(() => openTraineeDashboard()); } },
    // the Trainer blueprint
    'trainer-sign-in': { who: null, go: async (p) => { await p.evaluate(() => { if (window.showLoginView) showLoginView(); switchPortalTab('Admin'); }); } },
    'trainer-registrations': { who: ADMIN, go: mc('registrations') },
    'trainer-program-link': { who: TRAINEE, q: '?program=reception', go: caseTab('MC-01', 'profile') },
    'trainer-users': { who: ADMIN, go: mc('users') },
    'trainer-monitoring': { who: ADMIN, go: mc('monitoring') },
    'trainer-case-logs': { who: ADMIN, go: mc('case-logs') },
    'trainer-broadcast': { who: ADMIN, go: mc('announce') },
    'trainer-access': { who: ADMIN, go: mc('access') },
    'trainer-library': { who: ADMIN, go: async (p) => { await p.evaluate(() => openTrainingLibrary()); } },
    'trainer-case-header': { who: ADMIN, go: caseTab('MC-01', 'profile'), clip: { x: 280, y: 0, width: 1000, height: 560 } },
    'trainer-caller-scenarios': { who: ADMIN, go: async (p) => { await caseTab('MC-01', 'profile')(p); await p.evaluate(() => openCallsPanel()); } },
    'trainer-reception': { who: ADMIN, go: async (p) => { await p.evaluate(() => openFrontDeskDrill()); await p.waitForTimeout(600); await p.evaluate(() => fddOpenLine('FT', 'Reception Mock Calls', true)); } },
    'trainer-roster': { who: ADMIN, go: async (p) => { await p.evaluate(() => openTraineeDashboard()); } },
    'trainer-case-library': { who: ADMIN, go: async (p) => { await p.evaluate(() => openCaseLibrary()); await p.fill('#cl-search', 'garcia'); } },
    'trainer-intake-folder': { who: ADMIN, go: async (p) => { await p.evaluate(() => openIntakeFolder()); } },
    'trainer-firm-calendar': { who: ADMIN, go: async (p) => { await p.evaluate(() => openFirmCalendar()); } }
};

let base, CAL;
(async () => {
    CAL = await import(require('url').pathToFileURL(path.join(ROOT, 'functions/_calendar.js')).href);
    await new Promise(r => server.listen(0, r));
    base = `http://localhost:${server.address().port}/`;
    fs.mkdirSync(OUT, { recursive: true });
    const only = process.argv.slice(2);
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    for (const [name, s] of Object.entries(SHOTS)) {
        if (only.length && !only.includes(name)) continue;
        const page = await open(browser, s.who, s.q);
        await s.go(page); await page.waitForTimeout(900);
        const file = path.join(OUT, name + '.jpg');
        await page.screenshot({ path: file, type: 'jpeg', quality: 80, clip: s.clip });
        console.log(`${name}.jpg  ${Math.round(fs.statSync(file).size / 1024)} KB`);
        await page.context().close();
    }
    await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
