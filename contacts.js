/* =========================================================
   📇 CONTACTS — a card for everyone in the case files
   ---------------------------------------------------------
   Built in the browser from the library case files (mock-cases.js, MOCK_CASES), so it's the same for
   everyone and always matches the files:
     🩺 Medical providers   the files' treating facilities (facilities)
     🛡 Adjusters           the BI and PIP / UM / MedPay adjusters (bi, pipum) and the property damage adjusters
                            (pdClaim); a carrier with no adjuster
                            assigned yet gets a card of its own
     ⚖ Opposing counsel    the defense counsel on the files in litigation (counsel)
     👤 Clients             the firm's clients (the same person on two files: one card, both files)
     👥 Others              emergency contacts, the parties at fault, lien holders, health plans, police
                            agencies and employers
   There's no directory to browse: the small 📇 Search contacts bar under the case header's Search cases (everyone
   signed in) finds them. Matching contacts drop down as you type (whose name matches first); Enter (the top one,
   or the one picked with ↓ ↑) or a click pops up that contact's card, with the others that matched beside it.
   Search by name, company, phone (any format), email, claim, report or file number, or a client's name or case
   number. A card has the contact details on file and the cases the contact is on (client, case number and what
   they are on that case); a case opens the file. Esc, ✕ or a click outside closes the card.
   Trainees never see the Training Library: a case is shown by its client and case number only.
   ========================================================= */
(function () {
    'use strict';
    if (window.LSHContacts) return;
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const KINDS = [
        ['provider', '🩺', 'Medical providers'], ['adjuster', '🛡', 'Adjusters'], ['counsel', '⚖', 'Opposing counsel'],
        ['client', '👤', 'Clients'], ['other', '👥', 'Others']
    ];
    const ICON = Object.fromEntries(KINDS.map(([k, i]) => [k, i]));
    const ONE = { provider: '🩺 Medical provider', adjuster: '🛡 Adjuster', counsel: '⚖ Opposing counsel', client: '👤 Client', other: '👥 Other contact' };
    const SPECIALTY = { EMC: 'Urgent care', Chiro: 'Chiropractor', Ortho: 'Orthopedics', 'Emergency Hospital': 'Emergency hospital', Surgery: 'Surgery',
        'Pain Management': 'Pain management', 'Physical Therapy (PT)': 'Physical therapy', 'MRI / Imaging': 'MRI / imaging' };
    let BOOK = null;

    /* ---------- ✎ Contact Cards: edits and new cards ----------
       Every card can be edited (✎ Edit) and given an identifier (its role on a case); + New Contact Card adds one.
       The files stay as they are: what is changed is kept per person signed in (this browser, under their username)
       and laid over the files' cards, so a trainee's edits never change another trainee's directory. */
    const ROLES = ['Client', 'BI Adjuster', 'PIP / UM / MedPay Adjuster', 'PD Adjuster', 'Medical Provider', 'Opposing Counsel', 'Lien Holder',
        'Health Insurance (HI)', 'Court Clerk', 'Judge', 'Arbitrator', 'Mediator', 'Emergency Contact of…', 'Authorized Representative of…',
        'Party at Fault', 'Witness', 'Employer', 'Police / Reporting Agency', 'Interpreter', 'Vendor', 'Other'];
    const OF_CASE = /…$/;   // a role that names a case: "Emergency Contact of [case]"
    function ROLE_OF(e) {
        const t = String(e.title || '');
        if (e.kind === 'client') return 'Client';
        if (e.kind === 'provider') return 'Medical Provider';
        if (e.kind === 'counsel') return 'Opposing Counsel';
        if (e.kind === 'adjuster') return /^PD /.test(t) ? 'PD Adjuster' : e.links.some(l => /^(PIP|UM|UIM|Med)/i.test(l.note)) ? 'PIP / UM / MedPay Adjuster' : 'BI Adjuster';
        if (/^Emergency contact/i.test(t)) return 'Emergency Contact of…';
        if (/^Lien holder/i.test(t)) return 'Lien Holder';
        if (/^Health insurance/i.test(t)) return 'Health Insurance (HI)';
        if (/^Party at fault/i.test(t)) return 'Party at Fault';
        if (/^Police/i.test(t)) return 'Police / Reporting Agency';
        if (/^Employer/i.test(t)) return 'Employer';
        return 'Other';
    }
    const KIND_OF = { 'Client': 'client', 'Medical Provider': 'provider', 'Opposing Counsel': 'counsel', 'BI Adjuster': 'adjuster', 'PIP / UM / MedPay Adjuster': 'adjuster', 'PD Adjuster': 'adjuster' };
    const storeKey = () => { const u = (typeof getSession === 'function' && getSession()) || {}; return 'lsh_contact_cards:' + (u.username || 'me'); };
    function loadStore() { try { const v = JSON.parse(localStorage.getItem(storeKey()) || 'null'); return v && typeof v === 'object' ? { edits: v.edits || {}, added: v.added || [] } : { edits: {}, added: [] }; } catch (e) { return { edits: {}, added: [] }; } }
    function saveStore(st) { try { localStorage.setItem(storeKey(), JSON.stringify(st)); } catch (e) { /* storage full or off: the edit lasts this visit */ } }
    const FIELDS = ['name', 'role', 'roleCase', 'title', 'phone', 'email', 'address', 'notes'];
    function applyEdits(map) {
        const st = loadStore();
        Object.keys(st.edits).forEach(k => { const e = map.get(k); if (e) { FIELDS.forEach(f => { if (st.edits[k][f] != null) e[f] = st.edits[k][f]; }); e.edited = true; if (KIND_OF[e.role]) e.kind = KIND_OF[e.role]; } });
        st.added.forEach(a => { const e = Object.assign({ kind: KIND_OF[a.role] || 'other', refs: [], links: [], mine: true }, a); map.set(a.id, e); });
    }

    const PHONE = /\(\d{3}\) \d{3}-\d{4}/;
    const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
    const digits = (s) => String(s || '').replace(/\D/g, '');
    const keyOf = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const real = (s) => { const t = String(s || '').trim(); return t && !/^(none|n\/a|unknown|not yet assigned)\b/i.test(t) ? t : ''; };

    /* ---------- the directory, from the case files ---------- */
    function build() {
        const cases = typeof MOCK_CASES !== 'undefined' && Array.isArray(MOCK_CASES) ? MOCK_CASES : [];
        const map = new Map();
        // one card per contact (kind + key); the details fill in from whichever file has them; each file once
        function add(kind, key, base, c, note) {
            const k = kind + '|' + keyOf(key);
            let e = map.get(k);
            if (!e) { e = { kind, name: base.name, title: base.title || '', phone: '', email: '', address: '', refs: [], links: [] }; map.set(k, e); }
            ['phone', 'email', 'address'].forEach(f => { if (!e[f] && real(base[f])) e[f] = real(base[f]); });
            if (c && !e.links.some(l => l.id === c.id && l.note === note)) e.links.push({ id: c.id, client: c.client.name, number: c.caseNumber || '', note: note || '' });
            return e;
        }
        cases.forEach(c => {
            const cl = c.client || {}, who = cl.name || 'the client';
            // 🩺 medical providers
            (c.facilities || []).forEach(f => {
                if (!real(f.name)) return;
                const spec = f.specialty === 'Other' ? (f.specialtyOther || 'Medical provider') : (SPECIALTY[f.specialty] || f.specialty || 'Medical provider');
                add('provider', f.name, { name: f.name, title: spec, phone: f.phone, email: f.email }, c, [f.dates, f.status].filter(Boolean).join(' · '));
            });
            // 🛡 adjusters (or the carrier, until one is assigned)
            const claims = (c.bi || []).map(b => Object.assign({ cover: 'BI' }, b)).concat((c.pipum || []).map(b => Object.assign({ cover: b.type || 'PIP / UM' }, b)));
            claims.forEach(b => {
                const contact = String(b.contact || ''), phone = (contact.match(PHONE) || [''])[0], email = (contact.match(EMAIL) || [''])[0];
                const note = [`${b.cover} claim ${b.claim || '(no number yet)'}`, b.holder ? `insured: ${b.holder}` : ''].filter(Boolean).join(' · ');
                if (real(b.adjuster)) add('adjuster', b.adjuster + '|' + b.carrier, { name: b.adjuster, title: `Adjuster · ${b.carrier || 'insurance carrier'}`, phone, email }, c, note);
                else if (real(b.carrier)) add('adjuster', 'carrier|' + b.carrier, { name: b.carrier, title: 'Insurance carrier · no adjuster assigned yet', phone, email }, c, note);
            });
            // 🛡 the property damage adjuster (the vehicle claim, pdClaim)
            const pc = c.pdClaim || {};
            if (real(pc.adjuster)) add('adjuster', pc.adjuster + '|' + (pc.carrier || ''), { name: pc.adjuster, title: `PD adjuster · ${pc.carrier || 'insurance carrier'}`, phone: pc.phone, email: pc.email }, c,
                `PD claim ${pc.claim || '(no number yet)'}${pc.against ? ' · ' + pc.against : ''}`);
            // ⚖ opposing counsel
            (c.counsel || []).forEach(o => {
                if (!real(o.name)) return;
                add('counsel', o.name + '|' + o.firm, { name: o.name, title: `Defense counsel · ${o.firm || ''}`.replace(/ · $/, ''), phone: o.phone, email: o.email }, c,
                    `for ${o.represents || 'the defense'}${o.assistant ? ` · assistant: ${o.assistant}` : ''}`);
            });
            // 👤 clients (the same person, by name and date of birth, on more than one file: one card)
            if (real(cl.name)) add('client', cl.name + '|' + (cl.dob || ''), { name: cl.name, title: 'Client', phone: cl.phone, email: cl.email, address: cl.address }, c,
                [c.caseType === 'Other' ? c.caseTypeOther : c.caseType, c.dateOfLoss ? 'DOL ' + c.dateOfLoss : '', c.phase].filter(Boolean).join(' · '));
            // 👥 others
            const em = cl.emergency || {};
            if (real(em.name)) add('other', 'em|' + em.name + '|' + digits(em.phone), { name: em.name, title: `Emergency contact${em.relationship ? ' · ' + em.relationship : ''}`, phone: em.phone }, c, `for ${who}`);
            const tp = c.pd && c.pd.tp;
            (c.bi || []).forEach(b => {
                if (!real(b.holder)) return;
                const phone = tp && keyOf(tp.driver) === keyOf(b.holder) ? tp.driverPhone : '';
                add('other', 'party|' + b.holder, { name: b.holder, title: 'Party at fault (the other side)', phone }, c, real(b.carrier) ? `insured by ${b.carrier}` : 'uninsured');
            });
            (c.liens || []).forEach(l => {
                if (!real(l.entity)) return;
                add('other', 'lien|' + l.entity, { name: l.entity, title: 'Lien holder' }, c, [`${l.type || 'Lien'}`, l.file ? 'file ' + l.file : '', l.amount].filter(Boolean).join(' · '));
            });
            const h = c.health || {};
            if (real(h.carrier)) add('other', 'health|' + h.carrier, { name: h.carrier, title: 'Health insurance' }, c, `${who}'s health plan`);
            const p = c.police || {};
            if (real(p.agency)) add('other', 'police|' + p.agency, { name: p.agency, title: 'Police / reporting agency' }, c, [p.number ? 'report ' + p.number : '', real(p.officer)].filter(Boolean).join(' · '));
            const job = cl.employment || {};
            if (real(job.employer)) add('other', 'employer|' + job.employer, { name: job.employer, title: 'Employer' }, c, `employs ${who}${job.title ? ' (' + job.title + ')' : ''}`);
        });
        map.forEach((e, k) => { e.id = k; e.role = e.role || ROLE_OF(e); });
        applyEdits(map);
        const order = Object.fromEntries(KINDS.map(([k], i) => [k, i]));
        const all = [...map.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
        all.forEach(e => {
            e.text = [e.name, e.title, e.role, e.roleCase, e.phone, e.email, e.address, e.notes, ...e.links.map(l => `${l.client} ${l.number} ${l.note}`)].join(' ').toLowerCase();
            e.digits = [e.phone, ...e.links.map(l => l.number + ' ' + l.note)].map(digits).join(' ');
        });
        return all;
    }
    const book = () => (BOOK = BOOK || build());

    function matches(e, q) {
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length) return true;
        return words.every(w => e.text.includes(w) || (digits(w).length >= 3 && digits(w).length === w.replace(/[\s().-]/g, '').length && e.digits.includes(digits(w))));
    }
    // the contacts that match, best first: whose name matches, then company / role, then the rest (a case, a phone…)
    function find(q) {
        const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
        if (!words.length) return [];
        const rank = (e) => words.every(w => e.name.toLowerCase().includes(w)) ? 0 : words.every(w => (e.name + ' ' + e.title).toLowerCase().includes(w)) ? 1 : 2;
        return book().map((e, i) => ({ e, i, r: rank(e) })).filter(x => matches(x.e, q)).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.e);
    }

    /* ---------- the cards ---------- */
    const SHOW = 4;   // cases shown on a card before "Show all"
    function cardHTML(e, q) {
        const lines = [
            e.phone ? `<a href="tel:${esc(digits(e.phone))}">📞 ${esc(e.phone)}</a>` : '',
            e.email ? `<a href="mailto:${esc(e.email)}">✉ ${esc(e.email)}</a>` : '',
            e.address ? `<span>📍 ${esc(e.address)}</span>` : ''
        ].filter(Boolean).join('');
        // the cases that match the search first
        const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
        const hit = (l) => words.length && words.every(w => `${l.client} ${l.number} ${l.note}`.toLowerCase().includes(w));
        const links = words.length ? e.links.filter(hit).concat(e.links.filter(l => !hit(l))) : e.links;
        const role = e.role ? `${e.role.replace(OF_CASE, '')}${OF_CASE.test(e.role) ? ' ' + (e.roleCase || '…') : ''}` : '';
        return `<div class="ct-card ct-${e.kind}">
            <div class="ct-top"><span class="ct-ico" aria-hidden="true">${ICON[e.kind]}</span><div class="ct-who"><b>${esc(e.name)}</b><span>${esc(e.title)}</span>
                ${role ? `<em class="ct-role">${esc(role)}</em>` : ''}${e.edited || e.mine ? '<small class="ct-mine">✎ edited by you</small>' : ''}</div>
                <button type="button" class="ct-edit" onclick="LSHContacts.edit()" title="Edit this contact card">✎ Edit</button></div>
            ${lines ? `<div class="ct-lines">${lines}</div>` : `<div class="ct-lines ct-none">No phone or email on file</div>`}
            ${e.notes ? `<div class="ct-notes">${esc(e.notes)}</div>` : ''}
            <div class="ct-cases"><div class="ct-lbl">${e.links.length === 1 ? 'On 1 case' : e.links.length ? `On ${e.links.length} cases` : 'Not on a library case'}</div>
                ${links.slice(0, SHOW).map(caseBtn).join('')}
                ${links.length > SHOW ? `<div class="ct-more" hidden>${links.slice(SHOW).map(caseBtn).join('')}</div>
                    <button type="button" class="ct-all" onclick="this.previousElementSibling.hidden = false; this.remove()">Show all ${links.length} cases</button>` : ''}
            </div>
        </div>`;
    }
    const caseBtn = (l) => `<button type="button" data-case="${esc(l.id)}" onclick="LSHContacts.openCase('${esc(l.id)}')" title="Open this case file"><b>${esc(l.client)}</b>${l.number ? ` <code>${esc(l.number)}</code>` : ''}${l.note ? `<span>${esc(l.note)}</span>` : ''}</button>`;
    function formHTML(e) {
        const v = (f) => esc(e ? (e[f] || '') : '');
        const cases = e && e.links.length ? e.links.map(l => `${l.client}${l.number ? ' · ' + l.number : ''}`) : [];
        return `<form class="ct-form" onsubmit="event.preventDefault(); LSHContacts.saveEdit(this)">
            <div class="ct-form-grid">
                <label class="ct-wide">Name<input name="name" required value="${v('name')}" placeholder="Full name or company"></label>
                <label>Identifier<select name="role" onchange="this.form.querySelector('.ct-of').hidden = !/…$/.test(this.value)">${ROLES.map(r => `<option${e && e.role === r ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
                <label class="ct-of" ${e && OF_CASE.test(e.role || '') ? '' : 'hidden'}>Of case<input name="roleCase" list="ct-cases-list" value="${v('roleCase')}" placeholder="Client name or case number"><datalist id="ct-cases-list">${cases.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
                <label class="ct-wide">Title / company<input name="title" value="${v('title')}" placeholder="e.g. Adjuster · Allstate, Riverton Orthopedics"></label>
                <label>Phone<input name="phone" value="${v('phone')}" placeholder="(000) 000-0000"></label>
                <label>Email<input name="email" type="email" value="${v('email')}" placeholder="name@example.com"></label>
                <label class="ct-wide">Address<input name="address" value="${v('address')}" placeholder="Street, city, state ZIP"></label>
                <label class="ct-wide">Notes<textarea name="notes" rows="3" placeholder="Best time to call, assistant, fax, where their letters are filed…">${v('notes')}</textarea></label>
            </div>
            <div class="ct-form-acts">
                ${e && (e.edited || e.mine) ? `<button type="button" class="ct-btn ct-ghost" onclick="LSHContacts.resetEdit()">${e.mine ? '🗑 Delete card' : '↺ Back to the file’s card'}</button>` : ''}
                <span style="flex:1"></span>
                <button type="button" class="ct-btn ct-ghost" onclick="LSHContacts.cancelEdit()">Cancel</button>
                <button type="submit" class="ct-btn">💾 Save card</button>
            </div>
        </form>`;
    }
    /* ---------- the card that pops up ---------- */
    const CSS = `
    #ct-pop{z-index:2995}
    #ct-pop .ct-pop-box{position:relative;width:min(680px,95vw);max-height:88vh;overflow-y:auto;background:#fff;border-radius:14px;box-shadow:0 24px 60px rgba(15,33,72,.35);padding:16px 16px 14px;text-align:left}
    #ct-pop .ct-pop-x{position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#475569;font-weight:900;cursor:pointer}
    #ct-pop .ct-pop-x:hover{border-color:#f97316;color:#c2410c}
    #ct-pop .ct-pop-kicker{font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8;margin:0 40px 8px 2px}
    #ct-pop .ct-card{border-left-width:6px;padding:14px 16px}
    #ct-pop .ct-who b{font-size:16px}
    .ct-pop-also{margin-top:10px;font-size:11.5px;color:#64748b;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    .ct-pop-also button{border:1px solid #e2e8f0;background:#f8fafc;border-radius:999px;padding:3px 10px;font-size:11.5px;font-weight:700;color:#0f2148;cursor:pointer}
    .ct-pop-also button:hover{border-color:#f97316;background:#fff7ed}
    .ct-card{border:1px solid #e2e8f0;border-left:5px solid #94a3b8;border-radius:10px;background:#fff;padding:12px 14px;display:flex;flex-direction:column;gap:8px;min-width:0}
    .ct-card.ct-provider{border-left-color:#16a34a}.ct-card.ct-adjuster{border-left-color:#2563eb}.ct-card.ct-counsel{border-left-color:#b91c1c}
    .ct-card.ct-client{border-left-color:#f97316}.ct-card.ct-other{border-left-color:#64748b}
    .ct-top{display:flex;gap:10px;align-items:flex-start}
    .ct-ico{flex:0 0 auto;width:34px;height:34px;border-radius:9px;background:#f1f5f9;display:flex;align-items:center;justify-content:center;font-size:18px}
    .ct-who{min-width:0}.ct-who b{display:block;font-size:14px;color:#0f172a;line-height:1.25}
    .ct-who span{display:block;font-size:11.5px;color:#64748b;margin-top:2px}
    .ct-lines{display:flex;flex-direction:column;gap:3px;font-size:12.5px;color:#1e293b}
    .ct-lines a{color:#1d4ed8;text-decoration:none;overflow-wrap:anywhere}.ct-lines a:hover{text-decoration:underline}
    .ct-lines span{overflow-wrap:anywhere}.ct-none{color:#94a3b8;font-style:italic}
    .ct-cases{border-top:1px dashed #e2e8f0;padding-top:7px;display:flex;flex-direction:column;gap:4px}
    .ct-lbl{font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8}
    .ct-cases button{text-align:left;background:#f8fafc;border:1px solid #e2e8f0;border-radius:7px;padding:6px 9px;cursor:pointer;font-size:12px;color:#0f172a;line-height:1.35}
    .ct-cases button:hover{border-color:#f97316;background:#fff7ed}
    .ct-cases code{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10.5px;color:#475569;background:#e2e8f0;border-radius:4px;padding:0 4px}
    .ct-cases button span{display:block;font-size:11px;color:#64748b}
    .ct-more{display:flex;flex-direction:column;gap:4px}.ct-more[hidden]{display:none}
    .ct-cases .ct-all{background:none;border:1px dashed #cbd5e1;color:#1d4ed8;font-weight:700;text-align:center}
    #ct-bar{position:relative;margin-top:6px}
    #cl-bar.in-header #ct-bar{width:min(460px,100%);margin-left:auto}
    .ctb-field{display:flex;align-items:center;gap:6px;border:1px solid #cbd5e1;border-radius:8px;padding:0 8px;background:#f8fafc}
    .ctb-field:focus-within{border-color:#f97316;background:#fff;box-shadow:0 0 0 3px rgba(249,115,22,.12)}
    .ctb-field span{font-size:12px}
    #ct-bar-input{flex:1;min-width:0;border:none;outline:none;padding:5px 2px;font-size:12px;color:#0f2148;background:transparent}
    .ctb-results{display:none;position:absolute;right:0;top:calc(100% + 5px);width:min(440px,78vw);z-index:2986;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 14px 34px rgba(15,33,72,.22);max-height:min(56vh,440px);overflow-y:auto;padding:6px;text-align:left}
    .ctb-results.open{display:block}
    .ctb-results button{display:flex;gap:9px;align-items:flex-start;width:100%;text-align:left;background:none;border:0;border-radius:7px;padding:7px 8px;cursor:pointer;font-family:inherit}
    .ctb-results button:hover,.ctb-results button.on{background:#fff7ed}
    .ctb-results b{display:block;font-size:12.5px;color:#0f172a}
    .ctb-results small{display:block;font-size:11px;color:#64748b;line-height:1.35}
    .ctb-note,.ctb-empty{font-size:11.5px;color:#64748b;padding:7px 8px}
    .ctb-note{border-top:1px dashed #e2e8f0;margin-top:4px}
    /* ✎ Contact Cards: wider, bigger type with strong contrast, blue-to-gold lines */
    #ct-pop .ct-pop-box{padding:20px 22px 18px;border:3px solid transparent;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,#1e3a8a 0%,#2b4fa8 45%,#c9973f 85%,#DB8437 100%) border-box}
    #ct-pop .ct-pop-kicker{font-size:12px;color:#1E2340;letter-spacing:.12em}
    #ct-pop .ct-card{border:2px solid transparent;border-left-width:8px;border-radius:14px;padding:18px 20px;gap:12px;
        background:linear-gradient(160deg,#fffaf0 0%,#fff 55%,#f6f8fc 100%) padding-box,linear-gradient(135deg,#1e3a8a 0%,#2b4fa8 45%,#c9973f 100%) border-box}
    #ct-pop .ct-card.ct-provider{border-left-color:#16a34a}#ct-pop .ct-card.ct-adjuster{border-left-color:#2563eb}#ct-pop .ct-card.ct-counsel{border-left-color:#b91c1c}#ct-pop .ct-card.ct-client{border-left-color:#f97316}
    #ct-pop .ct-top{align-items:center;gap:14px}
    #ct-pop .ct-ico{width:48px;height:48px;font-size:24px;border-radius:12px;background:linear-gradient(135deg,#1E2340,#1d3f86);box-shadow:inset 0 0 0 2px #c9973f}
    #ct-pop .ct-who{flex:1}#ct-pop .ct-who b{font-size:22px;color:#0b1430;font-weight:900}#ct-pop .ct-who span{font-size:14px;color:#334155;font-weight:700}
    .ct-role{display:inline-block;margin-top:6px;font-style:normal;font-size:12px;font-weight:900;letter-spacing:.04em;color:#fde68a;background:linear-gradient(135deg,#1E2340,#1d3f86);border:1.5px solid #c9973f;border-radius:999px;padding:3px 12px}
    .ct-mine{display:block;margin-top:4px;font-size:11px;font-weight:800;color:#b45309}
    #ct-pop .ct-lines{font-size:16px;font-weight:700;gap:6px;color:#0f172a}#ct-pop .ct-lines a{color:#1d4ed8}
    .ct-notes{font-size:14px;font-weight:600;color:#1e293b;background:#f8fafc;border:1.5px solid #dbe3f0;border-radius:10px;padding:8px 12px;white-space:pre-wrap}
    #ct-pop .ct-lbl{font-size:12px;color:#1E2340}
    #ct-pop .ct-cases button{font-size:14px;padding:9px 12px;border:2px solid transparent;border-radius:10px;background:linear-gradient(#f8fafc,#f8fafc) padding-box,linear-gradient(120deg,#1e3a8a,#c9973f) border-box}
    #ct-pop .ct-cases button span{font-size:12.5px;color:#334155}
    .ct-edit,.ct-btn{flex:0 0 auto;border:0;border-radius:999px;padding:8px 16px;font-size:13px;font-weight:900;letter-spacing:.03em;color:#fff;cursor:pointer;background:linear-gradient(135deg,#1e3a8a 0%,#2b4fa8 50%,#c9973f 100%);box-shadow:0 4px 12px -6px rgba(30,35,64,.6)}
    .ct-edit{margin-right:34px}.ct-btn.ct-ghost{background:#fff;color:#1E2340;box-shadow:inset 0 0 0 2px #c9973f}
    .ct-edit:hover,.ct-btn:hover{filter:brightness(1.12)}
    .ct-form{display:flex;flex-direction:column;gap:14px}
    .ct-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px}.ct-form-grid .ct-wide{grid-column:1/-1}.ct-form-grid [hidden]{display:none}
    .ct-form label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#1E2340}
    .ct-form input,.ct-form select,.ct-form textarea{font:inherit;text-transform:none;letter-spacing:0;font-size:15px;font-weight:700;color:#0f172a;padding:9px 12px;border-radius:10px;border:2px solid transparent;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(120deg,#1e3a8a,#2b4fa8 45%,#c9973f) border-box;outline:none}
    .ct-form input:focus,.ct-form select:focus,.ct-form textarea:focus{background:linear-gradient(#fff,#fff) padding-box,linear-gradient(120deg,#DB8437,#f59e0b) border-box}
    .ct-form-acts{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    @media (max-width:560px){.ct-form-grid{grid-template-columns:1fr}}
    /* the bar: 📇 Contact Cards, a labelled key with its search box, and + New */
    .ctb-field{border:2px solid transparent;border-radius:10px;padding:0 4px 0 0;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(120deg,#1e3a8a,#2b4fa8 45%,#c9973f) border-box;overflow:hidden}
    .ctb-key{flex:0 0 auto;align-self:stretch;display:flex;align-items:center;gap:5px;padding:0 10px;font-size:11px !important;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:#fde68a;background:linear-gradient(135deg,#1E2340,#1d3f86)}
    .ctb-new{flex:0 0 auto;border:0;border-radius:7px;padding:3px 8px;font-size:11px;font-weight:900;color:#1E2340;background:#fdf3e1;box-shadow:inset 0 0 0 1.5px #c9973f;cursor:pointer}
    .ctb-new:hover{background:#c9973f;color:#fff}`;
    function addCss() { if (!$id('ct-css')) { const st = document.createElement('style'); st.id = 'ct-css'; st.textContent = CSS; document.head.appendChild(st); } }
    function buildPop() {
        if ($id('ct-pop')) return;
        addCss();
        document.body.insertAdjacentHTML('beforeend', `
        <div class="modal-overlay no-print" id="ct-pop" role="dialog" aria-modal="true" aria-label="Contact Cards">
            <div class="ct-pop-box">
                <button type="button" class="ct-pop-x" onclick="closeContacts()" title="Close (Esc)" aria-label="Close">✕</button>
                <div class="ct-pop-kicker" id="ct-pop-kicker">📇 Contact Card</div>
                <div id="ct-pop-card"></div>
                <div class="ct-pop-also" id="ct-pop-also"></div>
            </div>
        </div>`);
        // close on a click on the backdrop, but not when a text selection started on the card ends there
        let downOnBackdrop = false;
        $id('ct-pop').addEventListener('mousedown', (e) => { downOnBackdrop = e.target.id === 'ct-pop'; });
        $id('ct-pop').addEventListener('click', (e) => { if (e.target.id === 'ct-pop' && downOnBackdrop) window.closeContacts(); downOnBackdrop = false; });
        // Tab stays on the card while it is open
        $id('ct-pop').addEventListener('keydown', (e) => {
            if (e.key !== 'Tab') return;
            const f = [...$id('ct-pop').querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent);
            if (!f.length) return;
            const first = f[0], last = f[f.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        });
    }
    // pop up one contact's card; `others` are the rest of what the search matched (to switch to)
    let shown = null, back = null, focusBar = null;   // back: where the focus goes when the card closes
    function show(e, q, others) {
        if (!e) return false;
        buildPop();
        if (!shown) { const a = document.activeElement; back = a && a !== document.body && !$id('ct-pop').contains(a) ? a : null; }
        shown = { e, q: q || '', others: (others || []).filter(x => x !== e) };
        $id('ct-pop-kicker').textContent = ONE[e.kind] || '📇 Contact';
        $id('ct-pop-card').innerHTML = cardHTML(e, q);
        const more = shown.others.slice(0, 8);
        $id('ct-pop-also').innerHTML = more.length
            ? `<span>Also matching “${esc(shown.q)}”:</span>${more.map((x, i) => `<button type="button" data-o="${i}">${ICON[x.kind]} ${esc(x.name)}</button>`).join('')}${shown.others.length > more.length ? `<span>+${shown.others.length - more.length} more</span>` : ''}`
            : '';
        $id('ct-pop-also').querySelectorAll('button[data-o]').forEach(b => b.addEventListener('click', () => {
            const pick = more[+b.dataset.o], rest = [e].concat(shown.others.filter(x => x !== pick));
            show(pick, shown.q, rest);
        }));
        $id('ct-pop').classList.add('open');
        const x = $id('ct-pop').querySelector('.ct-pop-x'); if (x) x.focus();
        return true;
    }
    const signedIn = () => typeof getSession === 'function' && !!getSession();
    // openContacts('Richard Voss'): pop up the best match's card (no query: go to the search bar)
    window.openContacts = function (query) {
        if (!signedIn()) return false;
        const q = String(query || '').trim();
        if (!q) { const i = $id('ct-bar-input'); if (i) i.focus(); return false; }
        const hits = find(q);
        if (!hits.length) { if (typeof showToast === 'function') showToast(`No contact matches “${q}”.`, 'info'); return false; }
        return show(hits[0], q, hits);
    };
    // closeContacts(): the focus goes back to where it was (or the search bar); closeContacts(false) leaves it
    window.closeContacts = function (refocus) {
        const m = $id('ct-pop'), wasOpen = !!(m && m.classList.contains('open'));
        if (m) m.classList.remove('open');
        shown = null;
        const to = back; back = null;
        if (!wasOpen || refocus === false) return;
        if (to && document.contains(to) && to.offsetParent && to.id !== 'ct-bar-input') to.focus();
        else if (focusBar) focusBar();
    };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $id('ct-pop') && $id('ct-pop').classList.contains('open')) { e.preventDefault(); window.closeContacts(); } });

    // the small search bar under the case header's Search cases (case-library.js's #cl-bar)
    const LIST = 6;   // contacts listed under the bar
    function mountBar() {
        const bar = $id('cl-bar'), field = bar && bar.querySelector('.clb-wrap > .clb-field');
        if (!field || $id('ct-bar')) return;
        addCss();
        // inside .clb-wrap, right under the Search cases box: the cases dropdown opens below this bar, not over it
        field.insertAdjacentHTML('afterend', `<div id="ct-bar">
            <div class="ctb-field"><span class="ctb-key">📇 Contact Cards</span><input type="search" id="ct-bar-input" name="ct-bar-q" placeholder="Search: provider, adjuster, counsel, client…" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-form-type="other" aria-label="Search the Contact Cards" aria-controls="ct-bar-results" aria-expanded="false"><button type="button" class="ctb-new" onclick="LSHContacts.create()" title="Add a contact card">+ New</button></div>
            <div id="ct-bar-results" class="ctb-results" role="listbox" aria-label="Matching contacts"></div>
        </div>`);
        // On a wide screen (the four-column header) the bar sits under the Client's ID instead, beside #kx-client-id (not
        // inside it: that tile is saved by its id). Only a search box moves: nothing saved by position.
        const wide = window.matchMedia ? window.matchMedia('(min-width: 1500px)') : null;
        const place = () => {
            const ct = $id('ct-bar'), id = $id('kx-client-id');
            if (!ct) return;
            if (wide && wide.matches && id) { if (ct.previousElementSibling !== id) id.insertAdjacentElement('afterend', ct); }
            else if (ct.previousElementSibling !== field) field.insertAdjacentElement('afterend', ct);
        };
        place();
        if (wide) { if (wide.addEventListener) wide.addEventListener('change', place); else if (wide.addListener) wide.addListener(place); }
        const input = $id('ct-bar-input'), box = $id('ct-bar-results');
        let hits = [], sel = 0, quiet = false;
        const close = () => { box.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); };
        focusBar = () => { quiet = true; input.focus(); quiet = false; };   // back from a card: no list until typing or ↓
        const pop = (i) => { const q = input.value.trim(); close(); input.blur(); show(hits[i], q, hits); };
        function paint() {
            const q = input.value.trim();
            if (q.length < 2) { close(); hits = []; return; }
            hits = find(q);
            sel = Math.max(0, Math.min(sel, Math.min(hits.length, LIST) - 1));
            box.innerHTML = hits.length
                ? hits.slice(0, LIST).map((e, i) => `<button type="button" role="option" tabindex="-1" data-i="${i}" class="${i === sel ? 'on' : ''}" aria-selected="${i === sel}"><span aria-hidden="true">${ICON[e.kind]}</span><span><b>${esc(e.name)}</b><small>${esc(e.title)}${e.phone ? ' · ' + esc(e.phone) : ''}</small><small>${e.links.length === 1 ? esc(e.links[0].client) : e.links.length + ' cases'}</small></span></button>`).join('')
                  + (hits.length > LIST ? `<div class="ctb-note">+${hits.length - LIST} more: keep typing to narrow it down.</div>` : '')
                : `<div class="ctb-empty">No contact matches “${esc(q)}”.</div>`;
            box.classList.add('open'); input.setAttribute('aria-expanded', 'true');
        }
        input.addEventListener('input', () => { sel = 0; paint(); });
        input.addEventListener('focus', () => { if (!quiet) paint(); });
        input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) close(); }, 120));
        input.addEventListener('keydown', (e) => {
            const n = Math.min(hits.length, LIST);
            if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) {
                e.preventDefault();
                if (!box.classList.contains('open')) paint();
                else { sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; paint(); }
                const on = box.querySelector('button.on'); if (on) on.scrollIntoView({ block: 'nearest' });
            }
            else if (e.key === 'Enter') { e.preventDefault(); if (input.value.trim().length >= 2 && !hits.length) paint(); if (hits[sel]) pop(sel); }
            // (a search box clears itself on Esc: the first Esc only closes the list, the second clears it)
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (box.classList.contains('open')) close(); else { input.value = ''; hits = []; input.blur(); } }
        });
        box.addEventListener('mousedown', (e) => e.preventDefault());   // keep the focus in the input while clicking the list
        box.addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b && hits[+b.dataset.i]) pop(+b.dataset.i); });
    }

    // ✎ edit the card that's open, or start a new one
    function openForm(e) {
        buildPop();
        if (!shown) { const a = document.activeElement; back = a && a !== document.body && !$id('ct-pop').contains(a) ? a : null; }
        shown = { e: e || null, q: shown ? shown.q : '', others: shown ? shown.others : [], editing: true };
        $id('ct-pop-kicker').textContent = e ? '📇 Contact Card · ✎ Edit' : '📇 New Contact Card';
        $id('ct-pop-card').innerHTML = formHTML(e);
        $id('ct-pop-also').innerHTML = '';
        $id('ct-pop').classList.add('open');
        const f = $id('ct-pop-card').querySelector('input[name="name"]'); if (f) f.focus();
    }
    function refreshed(id) { BOOK = null; return book().find(x => x.id === id); }

    window.LSHContacts = {
        all: () => book(),
        roles: ROLES,
        edit() { if (shown && shown.e) openForm(shown.e); },
        create() { if (signedIn()) openForm(null); },
        cancelEdit() { if (shown && shown.e) show(shown.e, shown.q, shown.others); else window.closeContacts(); },
        saveEdit(form) {
            const d = Object.fromEntries(FIELDS.map(f => [f, String((form.elements[f] || {}).value || '').trim()]));
            if (!OF_CASE.test(d.role)) d.roleCase = '';
            if (!d.name) return;
            const st = loadStore(), cur = shown && shown.e;
            let id;
            if (cur && !cur.mine) { id = cur.id; st.edits[id] = d; }
            else if (cur && cur.mine) { id = cur.id; st.added = st.added.map(a => a.id === id ? Object.assign({ id }, d) : a); }
            else { id = 'mine|' + Date.now().toString(36); st.added.push(Object.assign({ id }, d)); }
            saveStore(st);
            const e = refreshed(id);
            if (typeof showToast === 'function') showToast('Contact card saved.', 'success');
            show(e, shown ? shown.q : '', shown ? shown.others : []);
        },
        resetEdit() {
            const cur = shown && shown.e; if (!cur) return;
            const st = loadStore();
            if (cur.mine) { if (!confirm(`Delete the contact card for ${cur.name}?`)) return; st.added = st.added.filter(a => a.id !== cur.id); saveStore(st); BOOK = null; window.closeContacts(); return; }
            delete st.edits[cur.id]; saveStore(st);
            show(refreshed(cur.id), shown.q, shown.others);
        },
        find,
        show: (name) => window.openContacts(name),
        // a case on a card: the card closes and the file opens the way Search cases opens it
        // (on a Front Desk Drill call that is the call's pick, view only)
        openCase(id) {
            window.closeContacts(false);
            if (typeof window.caseLibraryOpen === 'function') return window.caseLibraryOpen('mock', id);
            if (typeof window.closeCaseLibrary === 'function') window.closeCaseLibrary();
            if (window.fddOnCall && window.fddOnCall() && window.fddPick) return window.fddPick(id);
            if (typeof window.openMockCase === 'function') window.openMockCase(id);
        }
    };
    function start() { mountBar(); setInterval(mountBar, 2000); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
