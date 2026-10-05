/* =========================================================
   TRAINING LIBRARY PDF (Admins)
   Downloads the library's mock cases as a PDF, built in the browser with jsPDF and
   jsPDF-AutoTable (loaded from cdnjs the first time someone downloads). Real text,
   not a screenshot, so a 100-page file stays small and searchable.
   - libraryPdf({ ids, trainer, title }): the cases to include (in library order),
     whether to add each file's trainer-only front-desk key (how to verify the caller,
     the caller scenarios and the Front Desk practice calls), and a subtitle.
   - The Training Library window's "PDF" buttons (training-library.js) call it with
     the cases it lists (program filter and search), or with one case.
   A case an Admin edited in the CMS carries a note: its key details (name, phone,
   DOB, DOL, phase…) are the edited ones; the rest is the library original.
   ========================================================= */
(function () {
    'use strict';
    const LIBS = {
        jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js',
        autotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/5.0.8/jspdf.plugin.autotable.min.js'
    };
    let JsPDF = null, autoTable = null;
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load the PDF maker. Check your connection and try again.'));
            document.head.appendChild(s);
        });
    }
    // Our own jsPDF, whatever else the page has on window.jspdf (html2pdf bundles its own).
    async function loadLibs() {
        if (JsPDF && autoTable) return;
        const before = window.jspdf;
        await loadScript(LIBS.jspdf);
        JsPDF = window.jspdf && window.jspdf.jsPDF;
        if (before !== undefined) window.jspdf = before;
        if (typeof window.autoTable !== 'function') await loadScript(LIBS.autotable);
        autoTable = window.autoTable;
        if (!JsPDF || typeof autoTable !== 'function') throw new Error('The PDF maker did not load. Try again.');
    }

    // The built-in PDF fonts cover Windows-1252 only.
    const clean = (s) => String(s == null ? '' : s).replace(/→/g, '->').replace(/[^\x00-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '');
    const has = (v) => v != null && String(v).trim() !== '';
    const unq = (s) => String(s || '').trim().replace(/^["“]+|["”]+$/g, '');
    const typeOf = (c) => c.caseType === 'Others' ? (c.caseTypeOther || 'Other') : c.caseType;
    const AUTH = { client: 'Verified: the client (or a minor client’s guardian)', authorized: 'Verified: authorized person on file', failed: 'Not verified',
        unauthorized: 'Not authorized', business: 'Business caller: route only', newcaller: 'Not in the system: potential new client' };
    const NAVY = [15, 33, 72], ORANGE = [249, 115, 22], INK = [30, 41, 59], MUTED = [100, 116, 139], LINE = [226, 232, 240];

    async function logoData() {
        try {
            const blob = await (await fetch('lsh-mark.png')).blob();
            return await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.onerror = () => r(null); f.readAsDataURL(blob); });
        } catch (e) { return null; }
    }

    function build(cases, opts, logo) {
        const doc = new JsPDF({ unit: 'pt', format: 'letter', compress: true });
        const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
        const M = 40, CW = W - 2 * M, BOTTOM = H - 46;
        const calls = window.DRILL_CALLS || [], sounds = window.MOCK_NAME_SOUNDS || {};
        const progLabel = (id) => ((window.MOCK_PROGRAMS || []).find(p => p.id === id) || {}).label || id;
        let y = M;
        const font = (size, style, color) => { doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size); doc.setTextColor(...(color || INK)); };
        const room = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = M; } };
        const table = (o) => { autoTable(doc, Object.assign({ startY: y, margin: { left: M, right: M, bottom: 50 } }, o)); y = doc.lastAutoTable.finalY + 6; };
        const grid = (head, rows, extra) => {
            if (!rows.length) return;
            table(Object.assign({
                head: [head.map(clean)], body: rows.map(r => r.map(v => clean(v))), theme: 'grid',
                styles: { fontSize: 7.8, cellPadding: 3.2, textColor: INK, lineColor: LINE, lineWidth: 0.4, overflow: 'linebreak' },
                headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontSize: 6.8, fontStyle: 'bold' }
            }, extra || {}));
        };
        // label / value pairs, three (or four) to a row: a small grey label above each value
        const pairs = (list, per) => {
            per = per || 3;
            const items = list.filter(([, v]) => has(v));
            if (!items.length) return;
            const rows = [];
            for (let i = 0; i < items.length; i += per) {
                const chunk = items.slice(i, i + per), pad = (r) => { while (r.length < per) r.push(''); return r; };
                rows.push(pad(chunk.map(([k]) => clean(k).toUpperCase())), pad(chunk.map(([, v]) => clean(v))));
            }
            table({ body: rows, theme: 'plain', styles: { fontSize: 8.8, cellPadding: { top: 0.5, bottom: 1, left: 0, right: 8 }, overflow: 'linebreak', cellWidth: CW / per },
                didParseCell: (d) => { if (d.row.index % 2 === 0) Object.assign(d.cell.styles, { fontSize: 6.4, textColor: MUTED, fontStyle: 'bold', cellPadding: { top: 4, bottom: 0.5, left: 0, right: 8 } }); else Object.assign(d.cell.styles, { fontStyle: 'bold', textColor: [15, 23, 42] }); } });
        };
        const heading = (t, color) => {
            room(44);
            y += 12; font(8.2, 'bold', color || NAVY); doc.text(clean(t).toUpperCase(), M, y);
            doc.setDrawColor(...(color || NAVY)); doc.setLineWidth(1); doc.line(M, y + 3, M + CW, y + 3); y += 12;
        };
        const sub = (t) => { room(28); font(7.8, 'bold', [51, 65, 85]); doc.text(clean(t), M, y + 6); y += 10; };
        const para = (t, size) => {
            if (!has(t)) return;
            font(size || 8.8, 'normal', INK);
            doc.splitTextToSize(clean(t), CW).forEach(line => { room(12); doc.text(line, M, y + 8); y += 11.5; });
            y += 3;
        };

        // cover
        const count = (k) => cases.filter(c => c.level === k).length;
        if (logo) { try { doc.addImage(logo, 'PNG', M + 10, 170, 80, 80); } catch (e) { /* no logo */ } }
        font(9, 'bold', [234, 88, 12]); doc.text('LEGAL SUPPORT HELP  ·  CASE MANAGEMENT SYSTEM', M + 10, 285);
        font(30, 'bold', NAVY); doc.text('Training Library', M + 10, 322); doc.text('Mock Cases', M + 10, 356);
        font(11, 'normal', [71, 85, 105]);
        const blurb = `${opts.title ? opts.title + ': ' : ''}${cases.length} fictional personal-injury case file${cases.length === 1 ? '' : 's'} from the CMS Training Library, with every tab of the case: profile, narrative, police report, insurance, liens, treatment, property damage, litigation, ADR, case costs, documents, notes and tasks.${opts.trainer ? ' Each file ends with its trainer-only front-desk key: how to verify the caller, the caller scenarios and the Front Desk practice calls.' : ''}`;
        doc.text(doc.splitTextToSize(clean(blurb), CW - 40), M + 10, 382);
        let fx = M + 10;
        [[cases.length, 'CASE FILES'], [count('Starter'), 'STARTER'], [count('Intermediate'), 'INTERMEDIATE'], [count('Advanced'), 'ADVANCED']]
            .concat(opts.trainer ? [[calls.filter(d => cases.some(c => c.id === d.mock)).length, 'PRACTICE CALLS']] : [])
            .forEach(([n, l]) => { doc.setFillColor(...ORANGE); doc.rect(fx, 468, 2.5, 30, 'F'); font(18, 'bold', NAVY); doc.text(String(n), fx + 9, 485); font(6.8, 'normal', MUTED); doc.text(l, fx + 9, 496); fx += 92; });
        doc.setDrawColor(...LINE); doc.setLineWidth(0.6); doc.line(M + 10, 530, M + CW - 20, 530);
        font(8.2, 'normal', MUTED);
        doc.text(doc.splitTextToSize(clean(`${opts.trainer ? 'Trainer copy: contains the answer keys. Not for trainees.' : 'Case files only: no answer keys.'} All names, numbers and facts are fictional. Downloaded ${new Date().toLocaleString()} from the CMS Training Library.`), CW - 40), M + 10, 546);

        // index
        doc.addPage(); y = M;
        font(15, 'bold', NAVY); doc.text('Index', M, y + 10); y += 22;
        grid(['ID', 'Case number', 'Client', 'Type', 'Phase', 'DOL', 'Level'], cases.map(c => [c.id, c.caseNumber, c.client.name, typeOf(c), c.phase, c.dateOfLoss, c.level]),
            { columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 104 } } });

        cases.forEach(c => {
            const cl = c.client || {}, em = cl.emergency || {}, emp = cl.employment || {}, pol = c.police || {}, hl = c.health || {};
            doc.addPage(); y = M;
            // title band
            font(15, 'bold', [255, 255, 255]);
            const nameLines = doc.splitTextToSize(clean(cl.name), CW - 200);
            const bandH = 36 + nameLines.length * 17;
            doc.setFillColor(...NAVY); doc.roundedRect(M, y, CW, bandH, 4, 4, 'F'); doc.setFillColor(...ORANGE); doc.rect(M, y + bandH - 3, CW, 3, 'F');
            font(8, 'bold', [253, 186, 116]); doc.text(clean(`${c.id}  ·  ${c.caseNumber || ''}`), M + 12, y + 17);
            font(15, 'bold', [255, 255, 255]); doc.text(nameLines, M + 12, y + 36);
            font(7.2, 'bold', [255, 255, 255]);
            doc.text(doc.splitTextToSize(clean([c.level].concat((c.programs || []).map(progLabel)).join('  ·  ')), 180), M + CW - 12, y + 17, { align: 'right' });
            y += bandH + 8;
            pairs([['Case type', typeOf(c)], ['Phase', c.phase], ['Date of loss', c.dateOfLoss], ['Statute (SOL)', c.sol], ['Attorney', c.attorney], ['Case manager', c.caseManager], ['Target settlement', c.target]], 4);
            if (has(c.critical)) table({ body: [[clean('CRITICAL: ' + c.critical)]], theme: 'plain', styles: { fontSize: 9, fontStyle: 'bold', textColor: [153, 27, 27], fillColor: [254, 242, 242], cellPadding: 6 } });
            const ed = typeof window.mockEditInfo === 'function' ? window.mockEditInfo(c.id) : null;
            if (has(c.summary) || ed) {
                table({ body: [[clean((c.summary || '') + (ed ? `${c.summary ? '\n' : ''}Edited in the CMS by ${ed.updatedBy || 'an Admin'}${ed.updatedAt ? ' (' + ed.updatedAt + ' UTC)' : ''}: the key details here (name, phone, DOB, DOL, phase…) are the edited ones; open the case in the CMS for the whole edited file.` : ''))]],
                    theme: 'plain', styles: { fontSize: 8.6, textColor: [124, 45, 18], fillColor: [255, 247, 237], cellPadding: 6 } });
            }
            heading('Client profile');
            pairs([['Phone', cl.phone], ['Email', cl.email], ['Date of birth', cl.dob], ['SSN', cl.ssn], ['Address', cl.address], ['Emergency contact', em.name], ['Relationship', em.relationship], ['Emergency phone', em.phone],
                ['Employment', emp.status], ['Employer', emp.employer], ['Job title', emp.title]]);
            if (has(c.narrative)) { heading('Case narrative'); para(c.narrative); }
            const inj = c.injury || {};
            if (has(inj.primary)) {
                heading('Primary injury');
                pairs([['Primary injury', inj.primary], ['Body part(s)', inj.parts], ['Injury type', inj.type], ['Surgery', inj.surgery], ['Prior injury to same area', inj.prior]]);
                if (has(inj.details)) para(inj.details);
            }
            if (has(pol.agency) || has(pol.narrative)) { heading('Police report'); pairs([['Agency', pol.agency], ['Report #', pol.number], ['Officer', pol.officer]]); para(pol.narrative); }
            heading('Insurance');
            pairs([['Health insurance', hl.carrier], ['Member ID', hl.memberId], ['Group', hl.group]]);
            if ((c.bi || []).length) { sub('Bodily injury (third party)'); grid(['Policyholder', 'Carrier', 'Policy', 'Claim', 'Adjuster', 'Contact', 'Liability', 'Limits'], c.bi.map(b => [b.holder, b.carrier, b.policy, b.claim, b.adjuster, b.contact, b.liability, b.limits])); }
            if ((c.pipum || []).length) { sub('PIP / UM'); grid(['Type', 'Policyholder', 'Carrier', 'Policy', 'Claim', 'Adjuster', 'Contact', 'Limits'], c.pipum.map(b => [b.type, b.holder, b.carrier, b.policy, b.claim, b.adjuster, b.contact, b.limits])); }
            if ((c.liens || []).length) { heading('Liens'); grid(['Type', 'Lienholder', 'File #', 'Amount', 'Status', 'Final payoff'], c.liens.map(l => [l.type === 'Other' && l.typeOther ? l.typeOther : l.type, l.entity, l.file, l.amount, l.status || 'Unconfirmed', l.final || ''])); }
            if ((c.facilities || []).length || (c.chrono || []).length || has(c.treatmentNotes)) {
                heading('Treatment');
                grid(['Facility', 'Specialty', 'Phone', 'Email', 'Dates', 'Status', 'Charges'], (c.facilities || []).map(f => [f.name, f.specialty === 'Other' && f.specialtyOther ? f.specialtyOther : f.specialty, f.phone, f.email, f.dates, f.status, f.charges]));
                if ((c.chrono || []).length) { sub('Treatment chronology'); grid(['Date(s) of service', 'Facility', 'Next visit', 'Notes'], c.chrono.map(r => [(r.dos || []).join(' – '), r.facility, r.next, r.notes])); }
                if (has(c.treatmentNotes)) { sub('Treatment notes'); para(c.treatmentNotes); }
            }
            if (c.pd || c.pdClaim) {
                heading('Property damage');
                if (c.pd) {
                    const v = (x) => x ? [[x.year, x.make, x.model].filter(Boolean).join(' '), x.plate, x.owner, x.driver] : null;
                    grid(['', 'Vehicle', 'Plate', 'Owner', 'Driver'], [['Client vehicle', ...(v(c.pd.client) || [])], ['Other vehicle', ...(v(c.pd.tp) || [])]].filter(r => r.length > 1));
                    const tp = c.pd.tp || {};
                    pairs([['Other driver insured', tp.insured], ['Other carrier / policy', tp.carrierPolicy], ['Other driver phone', tp.driverPhone], ['Other driver insurer', tp.driverInsurer]], 2);
                }
                const pc = c.pdClaim;
                if (pc) {
                    sub('Property damage claim (adjuster and coverage)');
                    pairs([['Claim with', pc.against], ['Carrier', pc.carrier], ['PD claim #', pc.claim], ['Liability', pc.liability], ['PD adjuster', pc.adjuster], ['Phone', pc.phone], ['Email', pc.email], ['Status', pc.status],
                        ['PD limit', pc.limit], ['Deductible', pc.deductible], ['Rental / loss of use', pc.rental], ['Repair or total loss', pc.outcome], ['Estimate / ACV', pc.estimate], ['Body shop', pc.shop]], 4);
                    if (has(pc.notes)) para(pc.notes);
                }
                if ((c.pdPhotos || []).length) para(`Photos in the CMS (mock, for training): ${c.pdPhotos.map(p => `${p.vehicle === 'other' ? 'other vehicle' : 'client vehicle'}, ${p.area}: ${p.caption || ''}`).join('; ')}.`);
            }
            if (c.lit) {
                heading('Litigation');
                pairs([['Statute (SOL)', c.lit.sol], ['Complaint filed', c.lit.filed], ['Discovery cutoff', c.lit.cutoff], ['Trial date', c.lit.trial]], 4);
                if ((c.counsel || []).length) { sub('Opposing counsel'); grid(['Attorney', 'Law firm', 'Represents', 'Phone', 'Email'], c.counsel.map(o => [o.name, o.firm, o.represents, o.phone, o.email])); }
                grid(['Type', 'Party / detail', 'Due', 'Status'], (c.lit.rows || []).map(r => [r.type, r.party, r.due, r.status]));
            }
            if ((c.adr || []).length) {
                heading('ADR (mediation / arbitration)');
                grid(['Type', 'Set by', 'Status', 'Neutral / provider', 'Date and time', 'Brief due', 'Notes'], c.adr.map(a => [a.type, a.setBy, a.status, [a.neutral, a.provider].filter(Boolean).join(' · '), [a.date, a.time].filter(Boolean).join(' '), a.brief, a.notes]));
            }
            if ((c.finance || []).length) { heading('Case costs'); grid(['Date', 'Staff', 'Description', 'Amount'], c.finance.map(f => [f.date, f.staff, f.desc, f.amount])); }
            if ((c.docs || []).length) { heading('Doc Hub'); grid(['Category', 'Summary'], c.docs.map(d => [d.cat, d.summary]), { columnStyles: { 0: { cellWidth: 120 } } }); }
            if ((c.notes || []).length) { heading('Notes'); grid(['Date', 'Staff', 'Note'], c.notes.map(n => [n.date, n.staff, n.text]), { columnStyles: { 0: { cellWidth: 58 }, 1: { cellWidth: 90 } } }); }
            if ((c.tasks || []).length) { heading('Tasks'); grid(['Date', 'Staff', 'Task'], c.tasks.map(n => [n.date, n.staff, n.text]), { columnStyles: { 0: { cellWidth: 58 }, 1: { cellWidth: 90 } } }); }
            if (opts.trainer) {
                const r = c.reception || {}, green = [22, 101, 52], head = { fillColor: [220, 252, 231], textColor: green };
                heading('Trainer only · front desk', green);
                if (has(r.verify)) para('Verify: ' + r.verify);
                const hard = [...new Set(String(cl.name || '').match(/[A-Za-z]+/g) || [])].filter(w => sounds[w]);
                if (hard.length) para('Say the names: ' + hard.map(w => `${w} = “${sounds[w].say}”`).join('  ·  '));
                if ((r.calls || []).length) { sub('Caller scenarios'); grid(['Caller', 'Asks', 'Model handling'], r.calls.map(s => [unq(s.from), unq(s.ask), s.handle]), { headStyles: head, columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 140 } } }); }
                const mine = calls.filter(d => d.mock === c.id);
                if (mine.length) { sub('Front Desk practice calls on this file'); grid(['Call', 'Caller', 'Opening', 'Decision', 'Right handling'], mine.map(d => [d.id, (d.gives || {}).name || '', unq(d.opening), AUTH[d.auth] || d.auth, d.actions[d.answer]]), { headStyles: head, columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 82 }, 3: { cellWidth: 70 } } }); }
            }
        });

        // footers (not on the cover)
        const n = doc.getNumberOfPages();
        for (let i = 2; i <= n; i++) {
            doc.setPage(i); font(6.6, 'normal', [148, 163, 184]);
            doc.text(clean(`LSH Training Library · Mock Cases${opts.trainer ? ' · Trainer copy' : ''}${opts.title ? ' · ' + opts.title : ''}`), M, H - 22);
            doc.text(`${i} / ${n}`, W - M, H - 22, { align: 'right' });
        }
        doc.setProperties({ title: 'LSH Training Library · Mock Cases', subject: opts.trainer ? 'Trainer copy' : 'Case files only', creator: 'LSH Case Management System' });
        return doc;
    }

    window.libraryPdf = async function (opts) {
        opts = opts || {};
        const all = window.MOCK_CASES || [];
        const cases = opts.ids ? all.filter(c => opts.ids.includes(c.id)) : all;
        if (!cases.length) throw new Error('No cases to put in the PDF.');
        await loadLibs();
        const doc = build(cases, opts, await logoData());
        const slug = (s) => String(s || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const name = (cases.length === 1 ? `${cases[0].id}-${slug(cases[0].client.name)}` : `LSH-Training-Library-Mock-Cases${opts.title ? '-' + slug(opts.title) : ''}`)
            + (opts.trainer ? '-Trainer-Copy' : '-Case-Files-Only') + '.pdf';
        doc.save(name);
        return { name, pages: doc.getNumberOfPages(), cases: cases.length };
    };
})();
