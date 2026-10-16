/* =========================================================
   LSH CMS — THE TRAINING LIBRARY'S DATES ROLL FORWARD BY THEMSELVES
   ---------------------------------------------------------
   The library files (mock-cases.js) and the Call Simulator's briefs
   (call-packs.js) were written for one particular week. Left alone they
   would age: a trainee opening MC-13 in 2029 would read "STATUTE OF
   LIMITATIONS 10/20/2026" — a deadline that passed years ago — and the
   file would teach the wrong thing, because every case in the library is
   built around dates that are supposed to be live (SOLs, demand clocks,
   next appointments, court dates).

   So the library is not read as it was typed. Every date in it is moved
   forward by the time that has passed since the week it was written for
   (AS_OF below), and the whole file moves by the same amount, so nothing
   inside it starts contradicting anything else. A file that was written
   three weeks old is always three weeks old; an SOL that was two years
   out is always two years out.

   How much it moves:
   - 'weeks' (the library, and the Standard Training briefs that quote it):
     whole weeks, so Tuesday 09/29 is still a Tuesday after the move. The
     library steps forward once a week, on the AS_OF weekday (a Monday),
     and never backwards.
   - 'years': whole years, so a file anchored to a date that means
     something (the John Doe case happened on Valentine's Day) keeps its
     month and day. Weekday names written next to a date are recalculated.

   What never moves:
   - dates of birth — the client's, a relative's, an emergency contact's.
     They are the front desk's verifier, the ID photos are named after the
     birth year, and a client does not get younger because the file moved.
     A date under a `dob` key is kept, and so is any date written after
     "DOB", "born", "birthday" or "date of birth" anywhere in the file.
   - anything that isn't a date: pain scores (7/10), ratios (2x/week),
     money, phone numbers, ext 311.
   - a year on its own: a vehicle's model year ("a 2019 Ford Escape"), a
     prior complaint "(2024)", a diagnosis "in 2021". Write the month and
     day if a reference has to move with the file.

   What else moves with the dates, so the file stays consistent: the year
   inside the firm's case numbers and the carriers' claim, policy and
   court numbers (LSH-2026-MVA-901379, KM-26-118834, 26-CV-01877,
   2026-0214-AX) — those years are the year the file was opened, not a
   deadline, but they would read as wrong next to a 2029 date of loss.

   Date forms it reads: 06/09/2026 and 6/9/2026, "June 9, 2026", 06/2026,
   and a bare 09/29 when the same file writes that day in full somewhere
   else (so "next visit Tuesday 09/29" follows the chronology's
   09/29/2026). A bare day the file never writes in full is left alone.

   Used by: mock-cases.js and call-packs.js (they call it as they load, so
   every reader — the case file, the Training Library, Contacts, the Firm
   Calendar, the drill, the PDFs, the live-voice caller on the server —
   sees the same moved dates). Nothing else needs to call it. The browser
   loads this file before them (index.html); the Pages Functions import it
   (functions/_live.js); CommonJS readers get it through require().

   It only moves the hardcoded library. Cases trainees save, and trainers'
   library edits, are stored with the dates they were written with and are
   left as they are.

   Tests: .github/scripts/case-freshness.cjs (the engine) and
   .github/scripts/case-dates.cjs (the library in a browser).
   ========================================================= */
(function () {
    'use strict';

    // The Monday of the week the library's dates were written for. Everything
    // in the library is read as that week plus however long ago it was.
    const AS_OF = '10/12/2026';

    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const SHORT = MONTHS.map(m => m.slice(0, 3));
    const MONTH_RE = [...MONTHS, 'Sept', ...SHORT].join('|');
    // the month a name stands for ("Sep", "Sept" and "September" are all September), and the
    // same name written the way the file wrote it
    const monthOf = (name) => { const i = MONTHS.indexOf(name); return i >= 0 ? i + 1 : SHORT.indexOf(name.slice(0, 3)) + 1; };
    const monthAs = (mo, like) => (MONTHS.includes(like) ? MONTHS[mo - 1] : (like === 'Sept' ? 'Sept' : SHORT[mo - 1]));
    const WEEKDAY_RE = WEEKDAYS.join('|');
    const FULL_MONTHS_RE = MONTHS.join('|');

    /* ---------- days ---------- */
    // A calendar date as a day number (days since 1970, UTC); null when it isn't a real date.
    function dayParts(mo, d, y) {
        if (!(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31) || !(y >= 1900 && y <= 2200)) return null;
        const t = Date.UTC(y, mo - 1, d), x = new Date(t);
        return x.getUTCMonth() === mo - 1 && x.getUTCDate() === d ? Math.round(t / 864e5) : null;
    }
    const dayOf = (s) => { const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(String(s || '')); return m ? dayParts(+m[1], +m[2], +m[3]) : null; };
    const parts = (day) => { const x = new Date(day * 864e5); return { mo: x.getUTCMonth() + 1, d: x.getUTCDate(), y: x.getUTCFullYear(), wd: x.getUTCDay() }; };
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (day) => { const p = parts(day); return `${pad(p.mo)}/${pad(p.d)}/${p.y}`; };
    // Today, or the day someone asked to see the library as: ?asof=MM/DD/YYYY in the
    // address (a trainer checking what trainees will read next year), LSH_TODAY on the
    // page or in the environment (the tests). An unreadable value is ignored.
    function today() {
        let asked = typeof globalThis !== 'undefined' ? globalThis.LSH_TODAY : null;
        if (!asked && typeof process !== 'undefined' && process.env) asked = process.env.LSH_TODAY;
        if (!asked && typeof location !== 'undefined' && location.search) {
            const m = /[?&]asof=([^&]+)/.exec(location.search);
            if (m) asked = decodeURIComponent(m[1]);
        }
        const d = asked ? dayOf(asked) : null;
        return d !== null ? d : Math.floor(Date.now() / 864e5);
    }

    /* ---------- how far the library has moved ---------- */
    const asOfDay = dayOf(AS_OF);
    // Whole weeks since the week the library was written for; never negative.
    function days() {
        const w = Math.floor((today() - asOfDay) / 7);
        return w > 0 ? w * 7 : 0;
    }
    // Whole years since then; never negative.
    function years() {
        const a = parts(asOfDay), n = parts(today());
        let y = n.y - a.y;
        if (n.mo < a.mo || (n.mo === a.mo && n.d < a.d)) y--;
        return y > 0 ? y : 0;
    }
    // The date the library now reads as (its AS_OF, moved).
    const freshAsOf = (mode) => fmt(moveDay(asOfDay, mode || 'weeks'));
    const moves = (mode) => (mode === 'years' ? years() : days()) !== 0;

    // One date, moved. 'weeks' adds whole days; 'years' keeps the month and day
    // (29 February on a year that hasn't one lands on the 28th).
    function moveDay(day, mode) {
        if (mode === 'years') {
            const n = years(); if (!n) return day;
            const p = parts(day), y = p.y + n;
            return dayParts(p.mo, p.d, y) !== null ? dayParts(p.mo, p.d, y) : dayParts(p.mo, p.d - 1, y);
        }
        return day + days();
    }
    // A date written as MM/DD/YYYY, moved (anything else comes back as it was).
    function shiftDate(s, mode) { const d = dayOf(s); return d === null ? String(s) : fmt(moveDay(d, mode || 'weeks')); }

    // Dates a file writes on the same month and day are anniversaries of each other — the
    // date of loss and the two-year SOL, a policy that renews, a yearly review. Whole weeks
    // would pull them apart by a day or two (leap years), so the earliest of them sets the
    // new month and day and the rest keep their whole-year distance from it: the SOL stays
    // exactly two years after the date of loss.
    function moveIn(day, mode, anniversaries) {
        const base = anniversaries && anniversaries.get(mdKey(day));
        if (mode === 'years' || base === undefined || base === day) return moveDay(day, mode);
        const b = parts(moveDay(base, mode)), k = parts(day).y - parts(base).y, y = b.y + k;
        const moved = dayParts(b.mo, b.d, y);
        return moved !== null ? moved : dayParts(b.mo, b.d - 1, y);
    }
    const ordinal = (n) => (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
    const mdKey = (day) => { const p = parts(day); return `${pad(p.mo)}/${pad(p.d)}`; };

    /* ---------- the date forms in a text ---------- */
    const FULL = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
    const LONG = new RegExp(`\\b(${MONTH_RE}) (\\d{1,2}), (\\d{4})\\b`, 'g');
    const MONTH_YEAR = /(^|[^\d/])(0[1-9]|1[0-2])\/((?:19|20)\d{2})(?![\d/])/g;
    const MONTH_DAY = new RegExp(`\\b(${MONTH_RE}) (\\d{1,2})(st|nd|rd|th)?\\b(?!,? \\d{4})`, 'g');
    const MONTH_ONLY = new RegExp(`\\b(${FULL_MONTHS_RE})\\b(?![ ,]\\s*\\d)`, 'g');
    const BARE = /(^|[^\d/])(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])(?![\d/])/g;
    const CUE = /(dob|d\.o\.b\.|born|birth ?day|date of birth)\D{0,12}$/i;
    const KEEP_KEY = /dob|birth/i;

    // A text with its dates moved. `ctx`: { keep } day numbers to leave alone,
    // { monthDay } 'MM/DD' → the year the same file writes for that day,
    // { yearMap } the file's old years → moved, for case and claim numbers.
    function shiftText(text, mode, ctx) {
        const keep = (ctx && ctx.keep) || new Set(), monthDay = (ctx && ctx.monthDay) || new Map(), yearMap = (ctx && ctx.yearMap) || new Map();
        const anniversaries = (ctx && ctx.anniversaries) || new Map(), monthFirst = (ctx && ctx.monthFirst) || new Map();
        const move = (day) => moveIn(day, mode, anniversaries);
        const held = [];                                  // dates already moved, parked so a later pass can't re-read them
        const park = (s) => { held.push(s); return `\u0000${held.length - 1}\u0000`; };
        const kept = (day, before) => day === null || keep.has(day) || CUE.test(before);

        let out = String(text);
        // 06/09/2026 · 6/9/2026
        out = out.replace(FULL, (all, mo, d, y, at, whole) => {
            const day = dayParts(+mo, +d, +y);
            return kept(day, whole.slice(0, at)) ? park(all) : park(fmt(move(day)));
        });
        // June 9, 2026
        out = out.replace(LONG, (all, name, d, y, at, whole) => {
            const day = dayParts(monthOf(name), +d, +y);
            if (kept(day, whole.slice(0, at))) return park(all);
            const p = parts(move(day));
            return park(`${monthAs(p.mo, name)} ${p.d}, ${p.y}`);
        });
        // 03/2026 (a month, no day): moved from the middle of that month
        out = out.replace(MONTH_YEAR, (all, pre, mo, y, at, whole) => {
            const day = dayParts(+mo, 15, +y);
            if (kept(day, whole.slice(0, at) + pre)) return all;
            const p = parts(move(day));
            return pre + park(`${pad(p.mo)}/${p.y}`);
        });
        // 09/29 — only a day this file also writes in full, so "next visit Tuesday 09/29" follows the chronology
        out = out.replace(BARE, (all, pre, mo, d, at, whole) => {
            const y = monthDay.get(`${mo}/${d}`);
            if (!y) return all;
            const day = dayParts(+mo, +d, y);
            if (kept(day, whole.slice(0, at) + pre)) return all;
            const p = parts(move(day));
            return pre + park(`${pad(p.mo)}/${pad(p.d)}`);
        });
        // "June 9th" — a day the file also writes in full, said the way a caller says it
        out = out.replace(MONTH_DAY, (all, name, d, ord, at, whole) => {
            const mo = monthOf(name), y = monthDay.get(`${pad(mo)}/${pad(+d)}`);
            if (!y) return all;
            const day = dayParts(mo, +d, y);
            if (kept(day, whole.slice(0, at))) return park(all);
            const p = parts(move(day));
            return park(`${monthAs(p.mo, name)} ${p.d}${ord ? ordinal(p.d) : ''}`);
        });
        // "back in June", "at the end of October" — a month on its own, as the month the
        // file's own dates in it moved to (the earliest one, when it has several)
        out = out.replace(MONTH_ONLY, (all, name, at, whole) => {
            const day = monthFirst.get(monthOf(name));
            if (day === undefined || keep.has(day) || CUE.test(whole.slice(0, at))) return all;
            return MONTHS[parts(move(day)).mo - 1];
        });
        out = out.replace(/\u0000(\d+)\u0000/g, (all, i) => held[+i]);
        out = fixWeekdays(out, mode, monthDay);
        return shiftNumberYears(out, yearMap);
    }

    // "Saturday, February 14, 2029" — the weekday written next to a date is recalculated
    // (whole weeks never change it; whole years do).
    function fixWeekdays(text, mode, monthDay) {
        const re = new RegExp(`\\b(${WEEKDAY_RE})(,?\\s+)((?:${MONTH_RE}) \\d{1,2}, \\d{4}|\\d{1,2}/\\d{1,2}/\\d{4}|\\d{2}/\\d{2}(?![\\d/]))`, 'g');
        return String(text).replace(re, (all, wd, gap, date) => {
            let day = dayOf(date);
            if (day === null) {
                const long = new RegExp(`^(${MONTH_RE}) (\\d{1,2}), (\\d{4})$`).exec(date);
                if (long) day = dayParts(monthOf(long[1]), +long[2], +long[3]);
                else if (mode === 'years') {
                    // a bare 09/29 keeps its month and day, so its weekday follows the year it moved to
                    const bare = /^(\d{2})\/(\d{2})$/.exec(date), y = bare && monthDay.get(`${bare[1]}/${bare[2]}`);
                    if (bare && y) day = moveDay(dayParts(+bare[1], +bare[2], y), 'years');
                }
            }
            return day === null ? all : `${WEEKDAYS[parts(day).wd]}${gap}${date}`;
        });
    }

    // The year inside the firm's case numbers and the carriers' claim, policy and court
    // numbers. Only years this file actually uses as dates are mapped, so a number that
    // happens to look like a year is left alone.
    function shiftNumberYears(text, yearMap) {
        if (!yearMap.size) return String(text);
        const four = (y) => yearMap.get(+y), two = (y) => { const m = yearMap.get(2000 + +y); return m ? pad(m % 100) : null; };
        return String(text)
            // LSH-2026-MVA-901379 · RPD-2026-0042 · RA-2026-88412
            .replace(/\b([A-Z]{2,6})-((?:19|20)\d{2})-/g, (all, p, y) => { const n = four(y); return n ? `${p}-${n}-` : all; })
            // claim 2026-0214-AX
            .replace(/\b((?:19|20)\d{2})-(\d{4})-([A-Z]{2,4})\b/g, (all, y, rest, tail) => { const n = four(y); return n ? `${n}-${rest}-${tail}` : all; })
            // KM-26-118834 · ARC-26-44091 · LC-25-99812
            .replace(/\b([A-Z]{2,6})-(\d{2})-(\d{3,})\b/g, (all, p, y, rest) => { const n = two(y); return n ? `${p}-${n}-${rest}` : all; })
            // No. 26-CV-01877
            .replace(/\b(\d{2})-(CV|CA|CC|SC|CR)-(\d{3,})\b/g, (all, y, court, rest) => { const n = two(y); return n ? `${n}-${court}-${rest}` : all; });
    }

    /* ---------- a whole case file ---------- */
    // Every string in a value, in place.
    function walk(value, each, key) {
        if (Array.isArray(value)) { value.forEach((v, i) => { const r = walk(v, each, key); if (r !== undefined) value[i] = r; }); return undefined; }
        if (value && typeof value === 'object') { Object.keys(value).forEach(k => { const r = walk(value[k], each, k); if (r !== undefined) value[k] = r; }); return undefined; }
        return typeof value === 'string' ? each(value, key || '') : undefined;
    }

    // What a file says about itself before anything moves: the dates of birth to keep, the
    // days it writes in full (so a bare 09/29 can be read), which of those are anniversaries
    // of each other, and the years its case and claim numbers use. One file, or several read
    // together (a drill call and the case it is about, so both move the same way).
    function scan(records) {
        const ctx = { keep: new Set(), monthDay: new Map(), anniversaries: new Map(), firstOfYear: new Map(), monthFirst: new Map(), dol: null };
        (Array.isArray(records) ? records : [records]).forEach(rec => {
            if (!rec) return;
            walk(rec, (s, key) => {
                const held = KEEP_KEY.test(key);
                const add = (day, before) => {
                    if (day === null) return;
                    if (held || CUE.test(before)) { ctx.keep.add(day); return; }
                    const p = parts(day), md = `${pad(p.mo)}/${pad(p.d)}`;
                    if (!ctx.monthDay.has(md)) ctx.monthDay.set(md, p.y);
                    if (!ctx.anniversaries.has(md) || day < ctx.anniversaries.get(md)) ctx.anniversaries.set(md, day);
                    if (!ctx.firstOfYear.has(p.y) || day < ctx.firstOfYear.get(p.y)) ctx.firstOfYear.set(p.y, day);
                    if (!ctx.monthFirst.has(p.mo) || day < ctx.monthFirst.get(p.mo)) ctx.monthFirst.set(p.mo, day);
                };
                s.replace(FULL, (all, mo, d, y, at) => add(dayParts(+mo, +d, +y), s.slice(0, at)));
                if (/^(dateOfLoss|dol)$/i.test(key) && ctx.dol === null) ctx.dol = dayOf(s);
                s.replace(LONG, (all, name, d, y, at) => add(dayParts(monthOf(name), +d, +y), s.slice(0, at)));
                return undefined;
            });
        });
        return ctx;
    }
    // Two readings, read as one (the file's own, and the file it belongs to).
    function merge(a, b) {
        if (!b) return a;
        const out = { keep: new Set([...a.keep, ...b.keep]), monthDay: new Map(b.monthDay), anniversaries: new Map(b.anniversaries), firstOfYear: new Map(b.firstOfYear), monthFirst: new Map(b.monthFirst), dol: null };
        a.monthDay.forEach((y, md) => { if (!out.monthDay.has(md)) out.monthDay.set(md, y); });
        a.anniversaries.forEach((day, md) => { if (!out.anniversaries.has(md) || day < out.anniversaries.get(md)) out.anniversaries.set(md, day); });
        a.firstOfYear.forEach((day, y) => { if (!out.firstOfYear.has(y) || day < out.firstOfYear.get(y)) out.firstOfYear.set(y, day); });
        a.monthFirst.forEach((day, mo) => { if (!out.monthFirst.has(mo) || day < out.monthFirst.get(mo)) out.monthFirst.set(mo, day); });
        out.dol = a.dol !== null && a.dol !== undefined ? a.dol : b.dol;
        // a date of birth is kept even where the other reading saw it as an ordinary date
        out.keep.forEach(day => { const md = mdKey(day); if (out.anniversaries.get(md) === day) out.anniversaries.delete(md); });
        return out;
    }

    // One case file (or any object), moved in place. Returns it.
    // `options`: { mode: 'weeks' | 'years', context: scan() of the file this one belongs to }
    function rebase(rec, options) {
        const mode = (options && options.mode) || 'weeks';
        if (!rec || !moves(mode)) return rec;
        const read = merge(scan(rec), options && options.context);
        const yearMap = new Map();
        read.firstOfYear.forEach((day, y) => { const moved = parts(moveIn(day, mode, read.anniversaries)).y; if (moved !== y) yearMap.set(y, moved); });
        // a case or claim number carries the year the file was opened, so the date of loss maps
        // its own year (an earlier date in the same year can land in a different one)
        if (read.dol !== null && read.dol !== undefined) {
            const was = parts(read.dol).y, now = parts(moveIn(read.dol, mode, read.anniversaries)).y;
            if (was !== now) yearMap.set(was, now); else yearMap.delete(was);
        }
        const ctx = { keep: read.keep, monthDay: read.monthDay, anniversaries: read.anniversaries, monthFirst: read.monthFirst, yearMap };
        walk(rec, (s, key) => (KEEP_KEY.test(key) ? undefined : shiftText(s, mode, ctx)));
        return rec;
    }
    // A list of case files: each one is read and moved on its own, so one file's dates of
    // birth or claim numbers never leak into another's.
    function rebaseEach(list, options) {
        if (Array.isArray(list)) list.forEach(item => rebase(item, options));
        return list;
    }

    const API = { AS_OF, days, years, moves, freshAsOf, shiftDate, shiftText, rebase, rebaseEach, scan, dayOf, fmt };
    if (typeof globalThis !== 'undefined') globalThis.LSH_FRESHNESS = API;   // browser, Worker, CommonJS, vm
    if (typeof window !== 'undefined') window.lshFreshness = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
