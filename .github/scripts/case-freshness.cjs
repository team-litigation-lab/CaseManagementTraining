// The Training Library's dates roll forward by themselves (case-freshness.js, and the
// rebase mock-cases.js and call-packs.js do as they load).
//
// Checks:
//   - the clock: nothing moves in the week the library was written for, it moves in whole
//     weeks and never backwards, and ?asof= / LSH_TODAY shows the library as another day;
//   - what moves and what doesn't: a date of loss and its SOL, a treatment range, "June 9th",
//     "back in June", 03/2026, a bare 09/29 the file writes in full (and not one it doesn't),
//     the year in case and claim numbers; dates of birth, pain scores (7/10) and 2x/week stay;
//   - the whole file moves together: an SOL stays exactly two years after its date of loss, a
//     file stays as old as it was written, weekdays written next to a date stay true, and the
//     library's own case numbers keep the year of their date of loss;
//   - the Call Simulator's briefs (call-packs.js) move with the file they quote, and the CM /
//     PD / EA case summaries move by whole years so John Doe's crash stays on Valentine's Day;
//   - the library itself, at today and at several dates years from now: no library case is
//     left with an SOL in the past that was in the future when it was written.
// Usage: node .github/scripts/case-freshness.cjs   (from the repository root; no browser)
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const failures = []; const fail = (m) => failures.push(m);
const FILES = ['case-freshness.js', 'mock-cases.js', 'call-packs.js'].map(f => path.join(ROOT, f));

// The library as it reads on a given day (every file loaded again, as a page would).
function libraryOn(day) {
    FILES.forEach(f => delete require.cache[require.resolve(f)]);
    if (day) process.env.LSH_TODAY = day; else delete process.env.LSH_TODAY;
    const fresh = require(FILES[0]), mock = require(FILES[1]), packs = require(FILES[2]);
    return { fresh, mock, packs, cases: mock.MOCK_CASES, calls: mock.DRILL_CALLS };
}
const DAY = 864e5;
const dayOf = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '')); return m ? Math.round(Date.UTC(+m[3], +m[1] - 1, +m[2]) / DAY) : null; };
const weekday = (s) => new Date(dayOf(s) * DAY).getUTCDay();
const plus = (s, days) => { const d = new Date((dayOf(s) + days) * DAY); return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`; };

/* ---------- 1. the clock ---------- */
const base = libraryOn(null).fresh;
const AS_OF = base.AS_OF;
if (dayOf(AS_OF) === null) fail(`AS_OF isn't a date: ${AS_OF}`);
const clock = [
    [AS_OF, 0], [plus(AS_OF, -400), 0], [plus(AS_OF, -1), 0],      // the week it was written for, and before it
    [plus(AS_OF, 6), 0], [plus(AS_OF, 7), 7], [plus(AS_OF, 13), 7], [plus(AS_OF, 14), 14],
    [plus(AS_OF, 364), 364], [plus(AS_OF, 3650), 3647]
];
clock.forEach(([day, want]) => {
    const got = libraryOn(day).fresh.days();
    if (got !== want) fail(`on ${day} the library should have moved ${want} days, not ${got}`);
    if (got % 7) fail(`the library moved ${got} days — not whole weeks`);
});
if (libraryOn(plus(AS_OF, 1100)).fresh.years() !== 3) fail('three years on, years() should be 3');

/* ---------- 2. one file, moved ---------- */
{
    const { fresh } = libraryOn(plus(AS_OF, 840));          // 840 days = 120 weeks
    const rec = {
        caseNumber: 'LSH-2026-MVA-901379', dateOfLoss: '06/09/2026', sol: '06/09/2028',
        client: { dob: '03/22/1988' },
        bi: [{ claim: 'KM-26-118834', policy: 'Period 06/01/2026 – 06/01/2027' }],
        lit: { court: 'No. 26-CV-01877', claim: '2026-0214-AX' },
        facilities: [{ dates: '06/16/2026 – present' }],
        chrono: [{ dos: ['06/16/2026', '09/22/2026'], next: '09/29/2026 10:30 AM',
            notes: 'Chiropractic 2x/week. Pain down from 7/10 to 4/10. Next visit Tuesday 09/29 at 10:30 AM. Nothing on 03/14.' }],
        narrative: 'Surgery 03/2026. Hurt again on June 9th. Started treatment back in June. Dad was born 12/05/1949.',
        notes: [{ date: '09/22/2026', text: 'DOB on the chart reads 03/22/1988. Mediation Friday, June 12, 2026.' }]
    };
    fresh.rebase(rec);
    const moved = plus('06/09/2026', 840);
    const want = {
        dateOfLoss: moved,
        sol: `${moved.slice(0, 6)}${+moved.slice(6) + 2}`,                       // exactly two years on
        dob: '03/22/1988',
        caseNumber: `LSH-${moved.slice(6)}-MVA-901379`,
        claim: `KM-${moved.slice(8)}-118834`,
        court: `No. ${moved.slice(8)}-CV-01877`,
        claim2: `${moved.slice(6)}-0214-AX`,
        firstVisit: plus('06/16/2026', 840),
        next: `${plus('09/29/2026', 840)} 10:30 AM`
    };
    if (rec.dateOfLoss !== want.dateOfLoss) fail(`the date of loss: ${rec.dateOfLoss}, wanted ${want.dateOfLoss}`);
    if (rec.sol !== want.sol) fail(`the SOL should stay exactly two years after the date of loss (${want.sol}), not ${rec.sol}`);
    if (rec.client.dob !== want.dob) fail(`a date of birth moved: ${rec.client.dob}`);
    if (rec.caseNumber !== want.caseNumber) fail(`the case number's year: ${rec.caseNumber}, wanted ${want.caseNumber}`);
    if (rec.bi[0].claim !== want.claim) fail(`the claim number's year: ${rec.bi[0].claim}, wanted ${want.claim}`);
    if (rec.lit.court !== want.court || rec.lit.claim !== want.claim2) fail(`the court and claim numbers: ${JSON.stringify(rec.lit)}`);
    if (rec.chrono[0].dos[0] !== want.firstVisit || rec.chrono[0].next !== want.next) fail(`the chronology: ${JSON.stringify(rec.chrono[0])}`);
    if (rec.facilities[0].dates !== `${want.firstVisit} – present`) fail(`the treatment period: ${rec.facilities[0].dates}`);
    if (!/Pain down from 7\/10 to 4\/10/.test(rec.chrono[0].notes)) fail(`a pain score was read as a date: ${rec.chrono[0].notes}`);
    if (!/2x\/week/.test(rec.chrono[0].notes)) fail(`"2x/week" was read as a date: ${rec.chrono[0].notes}`);
    if (!/Nothing on 03\/14\./.test(rec.chrono[0].notes)) fail(`a bare day the file never writes in full moved: ${rec.chrono[0].notes}`);
    const bare = want.next.slice(0, 5);
    if (!rec.chrono[0].notes.includes(`Next visit ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday(plus('09/29/2026', 840))]} ${bare} at 10:30 AM`))
        fail(`the bare date in the note didn't follow the next visit (${bare}): ${rec.chrono[0].notes}`);
    if (!/Hurt again on /.test(rec.narrative) || /June 9th/.test(rec.narrative)) fail(`"June 9th" didn't follow the date of loss: ${rec.narrative}`);
    if (/back in June/.test(rec.narrative)) fail(`"back in June" didn't follow the date of loss: ${rec.narrative}`);
    if (/Surgery 03\/2026/.test(rec.narrative)) fail(`a month and year (03/2026) didn't move: ${rec.narrative}`);
    if (!/Dad was born 12\/05\/1949/.test(rec.narrative)) fail(`a birth date written in a sentence moved: ${rec.narrative}`);
    if (!/DOB on the chart reads 03\/22\/1988/.test(rec.notes[0].text)) fail(`a date of birth written after "DOB" moved: ${rec.notes[0].text}`);
    const mediation = /Mediation (\w+), (\w+ \d{1,2}, \d{4})/.exec(rec.notes[0].text);
    if (!mediation || mediation[1] !== 'Friday') fail(`a weekday written next to a date is no longer true: ${rec.notes[0].text}`);
    // whole weeks keep the weekday
    if (weekday(rec.dateOfLoss) !== weekday('06/09/2026')) fail('the date of loss changed weekday');

    // whole years: the month and day stay, the weekday is recalculated
    const anniversary = { text: 'Date of loss: Saturday, February 14, 2026 (Valentine\'s Day) · SOL 02/14/2028 · DOB 08/14/1980' };
    fresh.rebase(anniversary, { mode: 'years' });
    const n = fresh.years();
    if (!anniversary.text.includes(`February 14, ${2026 + n}`) || !anniversary.text.includes(`02/14/${2028 + n}`)) fail(`whole years should keep February 14: ${anniversary.text}`);
    if (!anniversary.text.includes('DOB 08/14/1980')) fail(`a date of birth moved in years mode: ${anniversary.text}`);
    const wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday(`02/14/${2026 + n}`)];
    if (!anniversary.text.includes(`${wd}, February 14, ${2026 + n}`)) fail(`the weekday wasn't recalculated (wanted ${wd}): ${anniversary.text}`);
}

/* ---------- 3. the library itself, now and years from now ---------- */
const authored = libraryOn(AS_OF);                     // the library as it was written
const authoredById = new Map(authored.cases.map(c => [c.id, JSON.parse(JSON.stringify(c))]));
[null, plus(AS_OF, 7), plus(AS_OF, 400), plus(AS_OF, 1200), plus(AS_OF, 4000)].forEach(day => {
    const on = libraryOn(day), moved = on.fresh.days(), when = day || 'today';
    if (on.cases.length !== authored.cases.length) return fail(`${when}: the library lost cases`);
    on.cases.forEach(c => {
        const was = authoredById.get(c.id); if (!was) return fail(`${when}: ${c.id} is not in the library as written`);
        const dol = dayOf(c.dateOfLoss), wasDol = dayOf(was.dateOfLoss);
        if (dol === null || wasDol === null) return;
        // the file stays exactly as old as it was written
        if (dol - wasDol !== moved) fail(`${when}: ${c.id}'s date of loss moved ${dol - wasDol} days, not ${moved}`);
        if (c.client.dob !== was.client.dob) fail(`${when}: ${c.id}'s date of birth moved (${was.client.dob} → ${c.client.dob})`);
        // an SOL that was ahead of the date of loss is still exactly as far ahead
        if (was.sol && dayOf(was.sol) !== null) {
            // an SOL written as an anniversary of the date of loss stays that anniversary
            const sameDay = c.sol.slice(0, 5) === c.dateOfLoss.slice(0, 5), wasSameDay = was.sol.slice(0, 5) === was.dateOfLoss.slice(0, 5);
            if (wasSameDay && !sameDay) fail(`${when}: ${c.id}'s SOL (${c.sol}) is no longer the anniversary of its date of loss (${c.dateOfLoss})`);
            if (wasSameDay && +c.sol.slice(6) - +c.dateOfLoss.slice(6) !== +was.sol.slice(6) - +was.dateOfLoss.slice(6))
                fail(`${when}: ${c.id}'s SOL is ${+c.sol.slice(6) - +c.dateOfLoss.slice(6)} years after its date of loss, not ${+was.sol.slice(6) - +was.dateOfLoss.slice(6)}`);
            if (!wasSameDay && Math.abs((dayOf(c.sol) - dol) - (dayOf(was.sol) - wasDol)) > 1)
                fail(`${when}: ${c.id}'s SOL is ${dayOf(c.sol) - dol} days after its date of loss, not ${dayOf(was.sol) - wasDol}`);
            // an SOL that was ahead of the library's own week is still ahead of the day it is read on
            const readOn = dayOf(day || on.fresh.freshAsOf());
            if (dayOf(was.sol) > dayOf(AS_OF) && dayOf(c.sol) < readOn)
                fail(`${when}: ${c.id}'s SOL (${c.sol}) has passed, though it was ahead when the file was written`);
        }
        // the case number carries the year the file was opened: a file opened the year of the
        // accident still reads that way, and one opened later keeps its distance from it
        const year = /^LSH-(\d{4})-/.exec(c.caseNumber), wasYear = /^LSH-(\d{4})-/.exec(was.caseNumber);
        if (year && wasYear) {
            const gap = +year[1] - +c.dateOfLoss.slice(6), gapWas = +wasYear[1] - +was.dateOfLoss.slice(6);
            if (gap !== gapWas) fail(`${when}: ${c.id}'s case number ${c.caseNumber} is ${gap} year(s) off its date of loss (${c.dateOfLoss}), not ${gapWas} as written (${was.caseNumber}, ${was.dateOfLoss})`);
        }
    });
    // the Call Simulator's brief for a file says the same date of loss as the file
    const mc01 = on.cases.find(c => c.id === 'MC-01'), doc = on.packs.DOCS['MC-01'];
    if (doc && mc01 && !doc.text.includes(`Date of loss ${mc01.dateOfLoss}`)) fail(`${when}: MC-01's call brief doesn't carry the file's date of loss (${mc01.dateOfLoss})`);
    // a drill caller gives the file's own date of loss
    const d01 = on.calls.find(c => c.id === 'D01');
    if (d01 && mc01) {
        const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+mc01.dateOfLoss.slice(0, 2) - 1];
        if (!d01.gives.dol.includes(month)) fail(`${when}: D01's caller says "${d01.gives.dol}" but the file's date of loss is ${mc01.dateOfLoss}`);
        if (d01.gives.dob !== authoredById.get('MC-01').client.dob) fail(`${when}: D01's caller's date of birth moved: ${d01.gives.dob}`);
    }
    // the CM case summary keeps Valentine's Day
    const cm = on.packs.CASES.cm;
    if (cm && !/Date of loss: \w+, February 14, \d{4} \(Valentine's Day\)/.test(cm.text)) fail(`${when}: the CM case summary no longer reads as Valentine's Day`);
    if (cm && !/DOB 08\/14\/1980/.test(cm.text)) fail(`${when}: John Doe's date of birth moved`);
});

/* ---------- 4. nothing moves in the week it was written for ---------- */
{
    const now = libraryOn(AS_OF);
    now.cases.forEach(c => {
        const was = authoredById.get(c.id);
        if (JSON.stringify(c) !== JSON.stringify(was)) fail(`in its own week, ${c.id} should read exactly as it was written`);
    });
}

/* ---------- 5. nothing but the dates changes ---------- */
// Every string in the library keeps its shape at any date: only date-shaped tokens move, and
// nothing turns into NaN, undefined or a left-over marker. This catches a new case whose
// wording trips the reader up (a pain score read as a date, a claim number half-moved).
{
    const strings = (v, out = []) => { if (Array.isArray(v)) v.forEach(x => strings(x, out)); else if (v && typeof v === 'object') Object.values(v).forEach(x => strings(x, out)); else if (typeof v === 'string') out.push(v); return out; };
    const all = (lib) => [...strings(lib.cases), ...strings(lib.calls), ...strings(lib.packs.DOCS), ...strings(lib.packs.CASES), ...strings(lib.packs.CALLS)];
    const MONTH_WORDS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec';
    const shape = (s) => s
        .replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, '<date>')
        .replace(new RegExp(`\\b(${MONTH_WORDS})\\b ?\\d{0,2}(st|nd|rd|th)?,? ?\\d{0,4}`, 'g'), '<month>')
        .replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/g, '<weekday>')
        .replace(/(^|[^\d/])\d{2}\/\d{2}(?![\d/])/g, '$1<day>')
        .replace(/(^|[^\d/])(0[1-9]|1[0-2])\/(19|20)\d{2}(?![\d/])/g, '$1<monthyear>')
        .replace(/\b([A-Z]{2,6})-\d{2,4}-/g, '$1-<year>-')
        .replace(/\b(19|20)\d{2}-\d{4}-([A-Z]{2,4})\b/g, '<year>-$2')
        .replace(/\b\d{2}-(CV|CA|CC|SC|CR)-/g, '<year>-$1-');
    const written = all(libraryOn(AS_OF)).map(shape);
    [plus(AS_OF, 7), plus(AS_OF, 500), plus(AS_OF, 1500), plus(AS_OF, 5000)].forEach(day => {
        const now = all(libraryOn(day));
        if (now.length !== written.length) return fail(`${day}: the library has ${now.length} strings, not ${written.length}`);
        let said = 0;
        now.forEach((s, i) => {
            if (/NaN|undefined|Invalid Date|\u0000/.test(s)) { if (said++ < 3) fail(`${day}: a string came out broken: ${s.slice(0, 160)}`); return; }
            if (shape(s) !== written[i] && said++ < 3) fail(`${day}: a string changed in more than its dates:\n   as written: ${written[i].slice(0, 180)}\n   now:        ${shape(s).slice(0, 180)}`);
        });
    });
}

delete process.env.LSH_TODAY;
if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
console.log(`Case freshness test passed (the clock in whole weeks, what moves and what stays, and all ${authored.cases.length} library cases read as old as they were written — now, next week and years from now).`);
