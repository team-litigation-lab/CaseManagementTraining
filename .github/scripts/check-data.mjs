// CMS Training Library checks (run by .github/workflows/checks.yml).
// The mock cases and Front Desk Drill calls in mock-cases.js are hand-written
// data that the drill scores against, so a typo silently breaks a trainee's
// score. This fails the build when:
//   - a case id repeats, or a case is missing a required field;
//   - a phase, case type, lien type or facility specialty isn't one the CMS
//     editor offers (it would load blank);
//   - a drill call points at a case that doesn't exist, has an unknown auth
//     code, an answer index outside its options, or no caller voice ('f'/'m');
//   - a caller the key says is verified gave details that don't match the file
//     (or a "not verified" caller's details all match);
//   - two files with the same client name have the same date of loss AND date of
//     birth (the DOL and the DOB are how the front desk tells them apart; a father
//     and son hurt in the same crash share a DOL but not a DOB);
//   - a case number is missing, repeats, or doesn't look like one the CMS issues
//     (LSH-<year>-<type code>-<number>: the type code the editor would give the
//     case type, a year no earlier than the DOL, and a number in the 9xxxxx range
//     the server's counter never reaches), or a drill caller quotes a case number
//     that isn't their file's.
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const ROOT = path.resolve(process.argv[2] || '.');
const problems = [];
const bad = (msg) => problems.push(msg);
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'mock-cases.js'), 'utf8'), ctx);
const { MOCK_CASES = [], DRILL_CALLS = [], MOCK_PROGRAMS = [], MOCK_FIRM = {}, MOCK_NAME_SOUNDS = {} } = ctx.window;

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
// an option's value, or its text when it has none (the status list indents its labels, so the value is what counts)
const optionsIn = (src, id) => { const m = src.match(new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</select>`)); return m ? [...m[1].matchAll(/<option([^>]*)>([^<]*)</g)].map(o => { const v = o[1].match(/value="([^"]*)"/); return v ? v[1] : o[2].trim(); }) : []; };
const PHASES = optionsIn(html, 'phase-selector');
const TYPES = optionsIn(html, 'main-case-type');
const LIEN_TYPES = ['Prior Atty Lien', 'Medical Lien', 'HI Subro', 'Funding', 'Other'];
const SPECIALTIES = ((app.match(/<select id="sel-\$\{id\}"[\s\S]*?<\/select>/) || [''])[0].match(/<option[^>]*>([^<]*)</g) || []).map(o => o.replace(/<option[^>]*>|</g, ''));
const PROGRAMS = new Set(MOCK_PROGRAMS.map(p => p.id));
if (!PHASES.length || !TYPES.length || !SPECIALTIES.length) bad('Could not read the editor\'s phase / case type / specialty options from index.html and app.js; update check-data.mjs');

const ids = new Set();
for (const c of MOCK_CASES) {
    const where = `${c.id || '(no id)'}`;
    if (!/^MC-\d{2}$/.test(c.id || '')) bad(`${where}: id must look like MC-01`);
    if (ids.has(c.id)) bad(`${where}: duplicate id`);
    ids.add(c.id);
    for (const k of ['summary', 'caseType', 'phase', 'dateOfLoss', 'sol', 'narrative']) if (!c[k]) bad(`${where}: missing ${k}`);
    for (const k of ['name', 'phone', 'dob', 'ssn', 'address']) if (!(c.client || {})[k] && !(k === 'email')) bad(`${where}: client.${k} is missing`);
    if (c.client && c.client.ssn && !/^XXX-XX-\d{4}$/.test(c.client.ssn)) bad(`${where}: SSN must stay masked (XXX-XX-1234)`);
    if (!PHASES.includes(c.phase)) bad(`${where}: phase "${c.phase}" isn't an option in the CMS (${PHASES.join(', ')})`);
    if (!TYPES.includes(c.caseType)) bad(`${where}: case type "${c.caseType}" isn't an option in the CMS`);
    if (c.caseType === 'Others' && !c.caseTypeOther) bad(`${where}: caseType Others needs caseTypeOther`);
    for (const p of c.programs || []) if (!PROGRAMS.has(p)) bad(`${where}: unknown program "${p}"`);
    for (const l of c.liens || []) if (!LIEN_TYPES.includes(l.type)) bad(`${where}: lien type "${l.type}" isn't an option`);
    for (const f of c.facilities || []) if (!SPECIALTIES.includes(f.specialty)) bad(`${where}: facility specialty "${f.specialty}" isn't an option`);
    for (const k of ['dateOfLoss', 'sol']) if (c[k] && !/^\d{2}\/\d{2}\/\d{4}$/.test(c[k])) bad(`${where}: ${k} must be MM/DD/YYYY`);
    if (!c.reception || !c.reception.verify || !(c.reception.calls || []).length) bad(`${where}: needs reception.verify and at least one reception call`);
}
const byName = {};
for (const c of MOCK_CASES) {
    const key = String((c.client || {}).name || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const other = (byName[key] = byName[key] || []).find(o => o.dateOfLoss === c.dateOfLoss && o.client.dob === c.client.dob);
    if (other) bad(`${c.id}: same client name, date of loss and date of birth as ${other.id}; files that share a name need a different DOL or DOB`);
    byName[key].push(c);
}
// Case numbers: the Case ID format nextCaseId() issues (functions/_utils.js), with the type code
// currentTypeCode() in app.js gives the case type.
const TYPE_CODES = Object.fromEntries([...((app.match(/const TYPE_CODES = \{([^}]*)\}/) || [])[1] || '').matchAll(/'([^']+)':\s*'([^']+)'/g)].map(m => [m[1], m[2]]));
if (!Object.keys(TYPE_CODES).length) bad('Could not read TYPE_CODES from app.js; update check-data.mjs');
const typeCode = (c) => c.caseType === 'Others' ? (String(c.caseTypeOther || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 4) || 'OTH') : TYPE_CODES[c.caseType];
const numbers = new Map();
for (const c of MOCK_CASES) {
    const m = String(c.caseNumber || '').match(/^LSH-(\d{4})-([A-Z0-9]{3,4})-(9\d{5})$/);
    if (!m) { bad(`${c.id}: caseNumber "${c.caseNumber || ''}" must look like LSH-2026-MVA-901234 (number in the 9xxxxx range)`); continue; }
    if (numbers.has(m[3])) bad(`${c.id}: case number ${c.caseNumber} repeats ${numbers.get(m[3])}'s number`);
    numbers.set(m[3], c.id);
    if (m[2] !== typeCode(c)) bad(`${c.id}: case number type code ${m[2]} should be ${typeCode(c)} for a ${c.caseType === 'Others' ? c.caseTypeOther : c.caseType} case`);
    if (Number(m[1]) < Number(String(c.dateOfLoss).slice(-4))) bad(`${c.id}: case number year ${m[1]} is before the date of loss`);
}

const AUTH = ['client', 'authorized', 'failed', 'unauthorized', 'business', 'newcaller'];
const dids = new Set();
const has = (v) => v != null && String(v).trim() !== '';
for (const d of DRILL_CALLS) {
    const where = `Drill ${d.id || '(no id)'}`;
    if (dids.has(d.id)) bad(`${where}: duplicate id`);
    dids.add(d.id);
    if (d.mock !== null && !ids.has(d.mock)) bad(`${where}: case ${d.mock} doesn't exist`);
    if (!AUTH.includes(d.auth)) bad(`${where}: unknown auth "${d.auth}"`);
    if (d.mock === null && d.auth !== 'newcaller') bad(`${where}: a caller who isn't on file must be auth "newcaller"`);
    if (!Array.isArray(d.actions) || d.actions.length !== 4) bad(`${where}: needs exactly 4 actions`);
    if (!(d.answer >= 0 && d.answer < (d.actions || []).length)) bad(`${where}: answer index ${d.answer} is out of range`);
    if (!d.opening || !d.why) bad(`${where}: needs an opening line and a why`);
    if (!['f', 'm'].includes(d.voice)) bad(`${where}: voice must be 'f' or 'm' (the caller's voice on a live call)`);
    const c = MOCK_CASES.find(x => x.id === d.mock);
    for (const quoted of String(d.opening || '').match(/LSH-\d{4}-[A-Z0-9]{3,4}-\d{6}/g) || []) {
        if (!c || quoted !== c.caseNumber) bad(`${where}: the caller quotes case number ${quoted}, but ${d.mock || 'their (no) file'}'s is ${c ? c.caseNumber : 'none'}`);
    }
    if (c && ['client', 'authorized', 'failed'].includes(d.auth)) {
        const g = d.gives || {};
        const dobOk = has(g.dob) && String(g.dob).includes(c.client.dob);
        const ssnOk = has(g.ssn4) && String(g.ssn4).includes(c.client.ssn.slice(-4));
        const street = has(g.address) ? String(g.address).split(',')[0].trim().toLowerCase() : '';
        const addrOk = /^\d/.test(street) && c.client.address.toLowerCase().startsWith(street);
        const verified = dobOk && (ssnOk || addrOk);
        if (d.auth !== 'failed' && !verified) bad(`${where}: the key says "${d.auth}" but the caller's DOB plus address or SSN last 4 don't match ${c.id}`);
        if (d.auth === 'failed' && verified) bad(`${where}: the key says "failed" but the caller's details match ${c.id}`);
    }
}

// Hard-to-say names: one word each, with how it's said and how it sounds written down
// (different from the real spelling, or the text drill would give the spelling away).
for (const [w, v] of Object.entries(MOCK_NAME_SOUNDS)) {
    if (!/^[A-Z][a-z]+$/.test(w)) bad(`MOCK_NAME_SOUNDS: "${w}" must be one capitalized word`);
    if (!v || !has(v.say) || !has(v.heard)) bad(`MOCK_NAME_SOUNDS.${w}: needs say and heard`);
    else if (v.heard.toLowerCase() === w.toLowerCase()) bad(`MOCK_NAME_SOUNDS.${w}: heard is the same as the spelling`);
}

console.log(`Checked ${MOCK_CASES.length} mock cases and ${DRILL_CALLS.length} drill calls.`);
if (problems.length) { console.log(`\n${problems.length} problem(s):\n`); problems.forEach((p, i) => console.log(`${i + 1}. ${p}`)); process.exit(1); }
console.log('All good.');
