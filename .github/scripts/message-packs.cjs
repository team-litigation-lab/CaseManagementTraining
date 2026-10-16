// The clients' scripted texts (message-packs.js) are consistent: unique pack ids,
// a `start` that exists, every `next` reachable, no text without goals, and every
// pack keyed to a Training Library case id or a client name that exists.
// Usage: node .github/scripts/message-packs.cjs   (from the repository root)
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const ROOT = process.cwd();
const load = (file) => {
    const sandbox = { window: {}, document: { addEventListener() {} } };
    sandbox.window.window = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
    return sandbox.window;
};

const failures = []; const fail = (m) => failures.push(m);
const { MESSAGE_PACKS } = load('message-packs.js');
const { MOCK_CASES } = load('mock-cases.js');

if (!MESSAGE_PACKS) { console.error('message-packs.js did not set window.MESSAGE_PACKS'); process.exit(1); }
const all = MESSAGE_PACKS.packs.concat([MESSAGE_PACKS.generic]);
const libraryIds = new Set((MOCK_CASES || []).map(c => c.id));
// (client names aren't checked against the library: a trainee's own case carries its own client)

const seen = new Set();
for (const p of all) {
    const where = `pack "${p.id}"`;
    if (!p.id) fail('a pack has no id');
    if (seen.has(p.id)) fail(`two packs share the id "${p.id}"`);
    seen.add(p.id);
    if (!p.messages || !Object.keys(p.messages).length) { fail(`${where} has no messages`); continue; }
    if (!p.messages[p.start]) { fail(`${where} starts at "${p.start}", which it doesn't have`); continue; }

    for (const [id, m] of Object.entries(p.messages)) {
        if (!m.body || !String(m.body).trim()) fail(`${where}: text "${id}" is empty`);
        if (!Array.isArray(m.goals) || !m.goals.length) fail(`${where}: text "${id}" has no goals (what a good reply does)`);
        if (m.next && !p.messages[m.next]) fail(`${where}: text "${id}" points at "${m.next}", which it doesn't have`);
    }
    // Every text is reachable by following `next` from the start: a text nobody ever sees is a mistake.
    const reached = new Set(); let at = p.start;
    while (at && !reached.has(at)) { reached.add(at); at = p.messages[at].next; }
    for (const id of Object.keys(p.messages)) if (!reached.has(id)) fail(`${where}: text "${id}" is never reached from "${p.start}"`);

    // A pack is picked by a Training Library case id or a client's name. A library id has to exist
    // (a typo would never match); a name need not, because a trainee's own case carries its own client
    // (the Case Management program's John Doe v. Apex, for one).
    for (const c of (p.cases || [])) {
        if (/^MC-\d+$/i.test(c) && !libraryIds.has(c)) fail(`${where}: "${c}" is not a Training Library case id`);
        else if (!/^MC-\d+$/i.test(c) && !/^[A-Z][a-z]+(['\- ][A-Za-z.]+)+$/.test(c)) fail(`${where}: "${c}" is neither a Training Library case id nor a client's name`);
    }
}
// The generic pack works on any file, so it names no case and fills the client in itself.
if ((MESSAGE_PACKS.generic.cases || []).length) fail('the generic pack should name no case: it is the one used when no other matches');
if (!/\{client\}/.test(MESSAGE_PACKS.generic.messages[MESSAGE_PACKS.generic.start].body)) fail('the generic pack\'s first text should name the client with {client}');

if (failures.length) { console.error('Client message packs:\n - ' + failures.join('\n - ')); process.exit(1); }
console.log(`Checked ${all.length} message packs, ${all.reduce((n, p) => n + Object.keys(p.messages).length, 0)} scripted texts. All good.`);
