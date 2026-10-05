/* =========================================================
   LSH CMS — CASE SECTIONS (the newer parts of the case editor)
   ---------------------------------------------------------
     - Parties Involved (passengers, at-fault party, witnesses…)
     - Authorized to Access Case (Profile)
     - Lost Wages, Demand and Settlement tabs, with their math; each
       demand can carry its demand letter (⬆ Upload Demand)
     - Opposing Counsel (Litigation): the defense attorneys
     - ADR: mediations, arbitrations and settlement conferences, with
       the next session and its brief due date worked out above the list
     - Liens: each lien's status, reduction and final payoff (rows saved
       before get the fields), totalled by status above the list
     - Treatment: gaps in care worked out from the chronology's dates
     - Report Type on the Police Report tab (Incident Report for
       premises cases with no police report)
     - Medical Chronology: drag rows to reorder, or sort by date
     - Doc Hub: drag and drop files to attach them
     - Tasks sent by an Admin as a ping: Accept adds them to the
       open case's Tasks list
   These sections are saved by id (data-keyed, see "Keyed sections"
   in app.js), so cases saved before they existed load unchanged.
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t, d) => { if (typeof showToast === 'function') showToast(m, t || 'info', d); };
    const placeholders = (el) => { if (typeof applyPlaceholders === 'function') applyPlaceholders(el); };
    const money = (el) => { const n = parseFloat(String(el ? el.innerText : '').replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : 0; };
    const fmt$ = (n) => '$ ' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const viewOnly = () => !!(window.mockIsViewOnly && window.mockIsViewOnly());
    const removeBtn = `<button onclick="this.closest('.kx-row').remove(); window.afterKeyedApplied && afterKeyedApplied();" class="kx-x no-print" title="Remove">×</button>`;

    /* ---------- Parties Involved ---------- */
    const ROLES = ['Client', 'Passenger', 'Client Vehicle Driver', 'At-Fault Party', 'At-Fault Driver', 'Vehicle Owner', 'Property Owner / Business', 'Witness', 'Other'];
    window.addParty = function (role) {
        const box = $id('kx-parties'); if (!box) return;
        const div = document.createElement('div');
        div.className = 'kx-row pdf-card border-l-4 border-orange-400 relative bg-white p-5 shadow-sm';
        div.innerHTML = `${removeBtn}
            <div class="grid grid-cols-4 gap-5">
                <div><label>Role</label><select class="prof-input" data-role onchange="afterKeyedApplied()">${ROLES.map(r => `<option${r === role ? ' selected' : ''}>${r}</option>`).join('')}</select></div>
                <div><label>Full Name</label><div contenteditable="true" data-ph="Enter full name" data-fmt="name"></div></div>
                <div><label>Phone</label><div contenteditable="true" data-ph="(000) 000-0000" data-fmt="phone"></div></div>
                <div><label>Email / Address</label><div contenteditable="true" data-ph="Email or mailing address"></div></div>
                <div><label>Insurance Carrier / Claim #</label><div contenteditable="true" data-ph="e.g. GEICO · 0456-22-918"></div></div>
                <div><label>Vehicle / Location</label><div contenteditable="true" data-ph="e.g. 2019 Honda Civic, rear seat"></div></div>
                <div><label>Statement</label><select class="prof-input"><option>Not taken</option><option>Taken (recorded)</option><option>Taken (written)</option><option>Refused</option><option>N/A</option></select></div>
                <div><label>Represented By</label><div contenteditable="true" data-ph="Attorney, if any"></div></div>
            </div>
            <label style="margin-top:10px;">Notes</label>
            <div contenteditable="true" data-ph="What they saw or did, injuries, how to reach them…" class="multiline-field text-sm italic text-slate-600 min-h-[48px]"></div>`;
        box.appendChild(div);
        placeholders(div);
        partiesSummary();
        const first = div.querySelectorAll('[contenteditable="true"]')[0]; if (first) first.focus();
    };
    function partiesSummary() {
        const out = $id('parties-summary'), box = $id('kx-parties'); if (!out || !box) return;
        const counts = {};
        box.querySelectorAll('.kx-row select[data-role]').forEach(s => { counts[s.value] = (counts[s.value] || 0) + 1; });
        const keys = Object.keys(counts);
        out.innerHTML = keys.length ? keys.map(k => `<span class="kx-chip">${esc(k)}: <b>${counts[k]}</b></span>`).join('') : '<span class="kx-hint" style="margin:0;">No parties added yet.</span>';
    }

    /* ---------- Authorized to Access Case ---------- */
    window.addAuthorized = function () {
        const box = $id('kx-authorized'); if (!box) return;
        const div = document.createElement('div');
        div.className = 'kx-row relative bg-slate-50 rounded-lg p-4';
        div.innerHTML = `${removeBtn}
            <div class="grid grid-cols-2 gap-4">
                <div><label>Full Name</label><div contenteditable="true" data-ph="Enter full name" data-fmt="name"></div></div>
                <div><label>Relationship</label><div contenteditable="true" data-ph="e.g. Spouse, Parent, Guardian"></div></div>
                <div><label>Phone</label><div contenteditable="true" data-ph="(000) 000-0000" data-fmt="phone"></div></div>
                <div><label>Authorization on File</label><select class="prof-input"><option>Pending</option><option>Signed (HIPAA / authorization)</option><option>Verbal only (not enough)</option><option>Revoked</option></select></div>
            </div>
            <label style="margin-top:8px;">May Discuss</label>
            <div contenteditable="true" data-ph="e.g. Scheduling and case status only; no settlement figures"></div>`;
        box.appendChild(div);
        placeholders(div);
        div.querySelector('[contenteditable="true"]').focus();
    };

    /* ---------- Demand ---------- */
    window.addDemand = function () {
        const box = $id('kx-demand'); if (!box) return;
        const n = box.querySelectorAll('.kx-row').length + 1;
        const div = document.createElement('div');
        div.className = 'kx-row pdf-card border-l-4 border-blue-500 relative bg-white p-5 shadow-sm';
        div.innerHTML = `${removeBtn}
            <div class="kx-row-title">Demand ${n}</div>
            <div class="grid grid-cols-4 gap-5">
                <div><label>Demand Type</label><select class="prof-input"><option>BI (Bodily Injury)</option><option>UM</option><option>UIM</option><option>PIP / Med Pay</option><option>Policy Limits</option><option>Pre-Suit</option><option>Other</option></select></div>
                <div><label>Sent To (Carrier)</label><div contenteditable="true" data-ph="e.g. Progressive"></div></div>
                <div><label>Adjuster</label><div contenteditable="true" data-ph="Name, phone, email"></div></div>
                <div><label>Claim Number</label><div contenteditable="true" data-ph="Enter claim #"></div></div>
                <div><label>Date Sent</label><div contenteditable="true" data-ph="MM/DD/YYYY" data-fmt="date"></div></div>
                <div><label>Sent By</label><select class="prof-input"><option>Email</option><option>Fax</option><option>Certified Mail</option><option>Carrier Portal</option><option>Hand Delivery</option></select></div>
                <div><label>Amount Demanded</label><div contenteditable="true" data-ph="$ 0.00" data-fmt="currency" class="font-black text-blue-700"></div></div>
                <div><label>Response Due</label><div contenteditable="true" data-ph="MM/DD/YYYY" data-fmt="date"></div></div>
                <div><label>Time-Limited Demand</label><select class="prof-input"><option>No</option><option>Yes</option></select></div>
                <div><label>Status</label><select class="prof-input"><option>Drafting</option><option>Sent</option><option>Acknowledged</option><option>Offer received</option><option>Rejected</option><option>Expired</option></select></div>
                <div><label>Response Received</label><div contenteditable="true" data-ph="MM/DD/YYYY" data-fmt="date"></div></div>
                <div><label>Offer / Response</label><div contenteditable="true" data-ph="$ 0.00" data-fmt="currency"></div></div>
            </div>
            <label style="margin-top:10px;">Enclosures &amp; Notes</label>
            <div contenteditable="true" data-ph="Records and bills enclosed, wage loss, photos, follow-up dates…" class="multiline-field text-sm italic text-slate-600 min-h-[48px]"></div>
            ${demandLetterHTML()}`;
        box.appendChild(div);
        placeholders(div);
        div.querySelector('[contenteditable="true"]').focus();
    };

    // The demand letter on a demand: uploaded to the case's file storage (/api/upload, as Doc Hub files are) and linked
    // here, so it's saved with the demand. A demand saved before this has no letter box: it gets one when the case opens.
    function demandLetterHTML() {
        return `<div class="kx-dl"><label>Demand Letter</label>
                <div class="kx-dl-row"><span class="kx-dl-file"></span>
                <label class="kx-dl-btn no-print" title="Attach the demand letter (PDF, Word or a scan, up to 2 MB)">⬆ Upload Demand<input type="file" accept=".pdf,.doc,.docx,image/*" style="display:none" onchange="uploadDemandLetter(this)"></label></div></div>`;
    }
    window.uploadDemandLetter = async function (input) {
        const file = input.files && input.files[0]; if (!file) return;
        const row = input.closest('.kx-row'), holder = row && row.querySelector('.kx-dl-file');
        const max = typeof DOC_UPLOAD_MAX_BYTES === 'number' ? DOC_UPLOAD_MAX_BYTES : 2 * 1024 * 1024;
        if (file.size > max) { toast(`That file is too large to attach (max ${Math.round(max / 1048576)} MB). Try a smaller file or a compressed copy.`, 'error', 6000); input.value = ''; return; }
        if (holder) holder.innerHTML = '<span class="kx-hint" style="margin:0;font-style:italic;">Uploading…</span>';
        try {
            if (typeof uploadFileToR2 !== 'function') throw new Error('Uploads aren\'t available on this page.');
            const named = typeof caseFileName === 'function' ? caseFileName('Demand Letter', file.name) : file.name;
            const up = await uploadFileToR2(file, 'case-doc', named);
            if (holder) holder.innerHTML = `<a href="${esc(up.url)}" download="${esc(named)}" data-r2-key="${esc(up.key)}" data-r2-mime="${esc(up.mime)}" data-orig-name="${esc(file.name)}" title="Original file: ${esc(file.name)}" target="_blank" rel="noopener" class="doc-file-link kx-dl-link">📄 ${esc(named)}</a> <button type="button" onclick="this.parentElement.innerHTML=''" class="kx-dl-x no-print" title="Remove the letter">×</button>`;
            toast('Demand letter attached. Save the case to keep it.', 'info');
        } catch (err) {
            if (holder) holder.innerHTML = '';
            toast('Could not attach that file: ' + (err && err.message ? err.message : 'unknown error'), 'error', 6000);
        }
        input.value = '';
    };
    // demands saved before the letter box existed get one
    window.addDemandLetterBoxes = function () {
        document.querySelectorAll('#kx-demand > .kx-row').forEach(r => { if (!r.querySelector('.kx-dl')) r.insertAdjacentHTML('beforeend', demandLetterHTML()); });
    };

    /* ---------- Opposing Counsel (Litigation) ---------- */
    window.addCounsel = function () {
        const box = $id('kx-counsel'); if (!box) return;
        const div = document.createElement('div');
        div.className = 'kx-row pdf-card border-l-4 border-red-700 relative bg-white p-5 shadow-sm';
        div.innerHTML = `${removeBtn}
            <div class="grid grid-cols-3 gap-5">
                <div><label>Attorney</label><div contenteditable="true" data-ph="Defense attorney's name" data-fmt="name"></div></div>
                <div><label>Law Firm</label><div contenteditable="true" data-ph="e.g. Voss & Tate LLP"></div></div>
                <div><label>Represents</label><div contenteditable="true" data-ph="The defendant they represent"></div></div>
                <div><label>Phone</label><div contenteditable="true" data-ph="(000) 000-0000" data-fmt="phone"></div></div>
                <div><label>Email</label><div contenteditable="true" data-ph="name@firm.com" data-fmt="email"></div></div>
                <div><label>Assistant / Paralegal</label><div contenteditable="true" data-ph="Name and extension"></div></div>
            </div>
            <label style="margin-top:10px;">Address &amp; Notes</label>
            <div contenteditable="true" data-ph="Mailing address, service preferences, deposition and discovery contacts…" class="multiline-field text-sm italic text-slate-600 min-h-[48px]"></div>`;
        box.appendChild(div);
        placeholders(div);
        const first = div.querySelector('[contenteditable="true"]'); if (first) first.focus();
    };

    /* ---------- Lost Wages ---------- */
    window.calcWages = function () {
        const box = $id('kx-wages'), out = $id('wages-estimate'); if (!box || !out) return;
        const f = (w) => box.querySelector(`[data-w="${w}"]`);
        const type = f('type') ? f('type').value : 'N/A', rate = money(f('rate')), hours = money(f('hours')), days = money(f('days'));
        let daily = 0;
        if (type === 'Hourly') daily = rate * (hours || 40) / 5;
        else if (type === 'Salary (annual)') daily = rate / 260;
        if (daily && days) out.innerHTML = `Estimate: ${fmt$(daily)} a day × ${days} day${days === 1 ? '' : 's'} = <b>${fmt$(daily * days)}</b> <span class="kx-hint" style="margin:0;">(${type === 'Hourly' ? `${fmt$(rate)}/hr × ${hours || 40} h/week ÷ 5` : 'annual salary ÷ 260 work days'}). Confirm against the employer's wage verification.</span>`;
        else out.innerHTML = '<span class="kx-hint" style="margin:0;">Enter the pay type, rate and work days missed for an estimate.</span>';
    };

    /* ---------- Additional insurance (Insurance tab): other policies that can pay, each settling on its own ---------- */
    const EXTRA_TYPES = ['Umbrella / excess', 'Second at-fault party (BI)', 'Commercial / business auto', "Homeowner's / renter's", 'Premises / general liability', 'Rideshare (TNC)', "Employer's policy", 'Other'];
    const SETTLE_STATUSES = ['Not settled', 'Negotiating', 'Offer received', 'Accepted', 'Release signed', 'Check received', 'Disbursed'];
    const FEES = [['33.33', '33⅓%'], ['40', '40%'], ['25', '25%'], ['35', '35%'], ['0', 'Other / none']];
    window.addInsurance = function () {
        const box = $id('kx-insurance-extra'); if (!box) return;
        const n = box.querySelectorAll('.kx-row').length + 1;
        const div = document.createElement('div');
        div.className = 'kx-row pdf-card border-l-4 border-emerald-600 relative bg-white p-5 shadow-sm';
        div.innerHTML = `${removeBtn}
            <div class="kx-row-title" style="color:#047857;">Additional Insurance ${n}</div>
            <div class="grid grid-cols-4 gap-5">
                <div><label>Coverage Type</label><select class="prof-input" data-x="type">${EXTRA_TYPES.map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
                <div><label>Carrier</label><div contenteditable="true" data-x="carrier" data-ph="e.g. Summit Casualty (umbrella)"></div></div>
                <div><label>Policy Holder / Insured</label><div contenteditable="true" data-ph="Who the policy covers" data-fmt="name"></div></div>
                <div><label>Policy #</label><div contenteditable="true" data-ph="Enter policy #"></div></div>
                <div><label>Claim #</label><div contenteditable="true" data-ph="Enter claim #"></div></div>
                <div><label>Adjuster Name</label><div contenteditable="true" data-ph="Adjuster's name" data-fmt="name"></div></div>
                <div><label>Adjuster Contact</label><div contenteditable="true" data-ph="Phone, email"></div></div>
                <div><label>Policy Limits</label><div contenteditable="true" data-ph="e.g. $1,000,000"></div></div>
            </div>
            <div class="ins-settle">
                <div class="kx-row-title" style="color:#047857;margin:14px 0 8px;">Settlement on this policy</div>
                <div class="grid grid-cols-3 gap-5">
                    <div><label>Settlement Status</label><select class="prof-input" data-x="status">${SETTLE_STATUSES.map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
                    <div><label>Date Settled</label><div contenteditable="true" data-ph="MM/DD/YYYY" data-fmt="date"></div></div>
                    <div><label>Gross Settlement</label><div contenteditable="true" data-s="gross" data-ph="$ 0.00" data-fmt="currency" class="font-black text-emerald-700"></div></div>
                    <div><label>Attorney Fee %</label><select class="prof-input" data-s="pct">${FEES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
                    <div><label>Case Costs</label><div contenteditable="true" data-s="costs" data-ph="$ 0.00" data-fmt="currency"></div></div>
                    <div><label>Medical Liens / Payoffs</label><div contenteditable="true" data-s="liens" data-ph="$ 0.00" data-fmt="currency"></div></div>
                </div>
                <div class="kx-calc ins-calc"></div>
            </div>
            <label style="margin-top:10px;">Notes</label>
            <div contenteditable="true" data-ph="How this policy came up, the tender or offer history, the release…" class="multiline-field text-sm italic text-slate-600 min-h-[48px]"></div>`;
        box.appendChild(div);
        placeholders(div);
        // on a locked library file, its settlement is open only to a program with the Settlement tab (training-library.js)
        const area = $id('capture-area'), settle = $id('pane-settlement');
        if (area && area.classList.contains('mock-ro') && !(settle && settle.classList.contains('mock-open'))) div.querySelectorAll('.ins-settle select').forEach(s => { s.disabled = true; s.dataset.mockRo = '1'; });
        window.calcSettlement();
        const first = div.querySelector('[contenteditable="true"]'); if (first) first.focus();
    };

    /* ---------- Settlement: BI, UM/UIM and each additional policy, then all together ---------- */
    // The Case Costs tab's total is taken off the settlements automatically, once: each settlement carries its share
    // of the costs by its gross (all of it on BI until something has a gross). With no case costs entered there, the
    // Case Costs boxes are typed as before. The Target Settlement shows what it leaves after the case costs.
    function settlementMath(box) {
        const f = (k) => box.querySelector(`[data-s="${k}"]`);
        const gross = money(f('gross')), pct = parseFloat(f('pct') ? f('pct').value : '0') || 0, costs = money(f('costs')), liens = money(f('liens'));
        const fee = pct === 33.33 ? gross / 3 : gross * pct / 100;   // 33⅓% is a third, not 33.33%
        return { gross, pct, fee, costs, liens, net: gross - fee - costs - liens };
    }
    const caseCostsTotal = () => Array.from(document.querySelectorAll('#fin-body .exp-field')).reduce((s, el) => s + money(el), 0);
    window.caseCostsTotal = caseCostsTotal;
    const extraLabel = (row) => { const t = row.querySelector('[data-x="type"]'), c = row.querySelector('[data-x="carrier"]'); return [t ? t.value : 'Additional insurance', c && c.innerText.trim() ? c.innerText.trim() : ''].filter(Boolean).join(' · '); };
    function settlements() {
        const list = [['kx-settlement', 'settlement-calc', 'BI'], ['kx-settlement-um', 'settlement-calc-um', 'UM/UIM']]
            .map(([b, o, label]) => ({ box: $id(b), out: $id(o), label })).filter(x => x.box);
        document.querySelectorAll('#kx-insurance-extra > .kx-row').forEach(row => list.push({ box: row, out: row.querySelector('.ins-calc'), label: extraLabel(row), extra: true }));
        return list;
    }
    const AUTO_TIP = 'From the Case Costs tab: the case costs are taken off once, shared by each settlement\'s gross.';
    function shareCosts(list) {
        const total = Math.round(caseCostsTotal() * 100) / 100;
        const fields = list.map(x => x.box.querySelector('[data-s="costs"]'));
        if (!(total > 0)) {   // nothing on the Case Costs tab: the boxes are typed again (what was typed there before comes back)
            fields.forEach(f => {
                if (!f || !f.dataset.auto) return;
                const typed = f.dataset.typed || '';
                delete f.dataset.auto; delete f.dataset.typed; f.removeAttribute('title');
                if (f.innerText.trim() !== typed) f.innerText = typed;
            });
            return 0;
        }
        const grosses = list.map(x => { const g = x.box.querySelector('[data-s="gross"]'); return money(g); });
        const sum = grosses.reduce((a, b) => a + b, 0);
        // shares in cents, the remainder to the largest, so they always add up to the total
        let cents = list.map((x, i) => (sum > 0 ? Math.floor(Math.round(total * 100) * grosses[i] / sum) : (i === 0 ? Math.round(total * 100) : 0)));
        const left = Math.round(total * 100) - cents.reduce((a, b) => a + b, 0);
        if (left) { const big = cents.indexOf(Math.max(...cents)); cents[big] += left; }
        fields.forEach((f, i) => {
            if (!f) return;
            if (!f.dataset.auto) f.dataset.typed = f.innerText.trim();   // a figure typed there, kept to give back if the case costs go
            const v = fmt$(cents[i] / 100);
            if (f.innerText.trim() !== v) f.innerText = v;
            f.dataset.auto = '1'; f.title = AUTO_TIP;
        });
        return total;
    }
    function paintTargetNet(costs) {
        const out = $id('target-net'), t = document.querySelector('.target-settlement-display'); if (!out) return;
        const target = money(t);
        const html = target && costs ? `After case costs (${fmt$(costs)}): <b>${fmt$(target - costs)}</b>` : '';
        if (out.innerHTML !== html) out.innerHTML = html;
    }
    window.calcSettlement = function () {
        const sums = { gross: 0, fee: 0, costs: 0, liens: 0, net: 0, n: 0 };
        const unconfirmed = typeof window.lienOpenCount === 'function' ? window.lienOpenCount() : 0;
        const lienWarn = unconfirmed ? `<div class="kx-warn">${unconfirmed} lien${unconfirmed === 1 ? ' on the Liens tab is' : 's on the Liens tab are'} still unconfirmed: the liens figure here may be wrong until the lien letter${unconfirmed === 1 ? '' : 's'} and final amount${unconfirmed === 1 ? '' : 's'} are in.</div>` : '';
        const list = settlements(), costs = shareCosts(list);
        paintTargetNet(costs);
        const extras = [];
        list.forEach(({ box, out, label, extra }) => {
            const x = settlementMath(box);
            if (x.gross) { ['gross', 'fee', 'costs', 'liens', 'net'].forEach(k => { sums[k] += x[k]; }); sums.n++; if (extra) extras.push({ label, x }); }
            if (!out) return;
            const html = x.gross ? `<div class="kx-calc-grid">
                    <div><span>${esc(extra ? 'Gross' : label + ' gross')}</span><b>${fmt$(x.gross)}</b></div><div><span>Attorney fee${x.pct ? ` (${x.pct === 33.33 ? '33⅓' : x.pct}%)` : ''}</span><b>− ${fmt$(x.fee)}</b></div>
                    <div><span>Case costs${costs ? ' (shared)' : ''}</span><b>− ${fmt$(x.costs)}</b></div><div><span>Liens / payoffs</span><b>− ${fmt$(x.liens)}</b></div>
                    <div class="net"><span>${esc(extra ? 'Net to client' : label + ' net to client')}</span><b>${fmt$(x.net)}</b></div></div>
                    ${x.net < 0 ? '<div class="kx-warn">The fee, costs and liens are more than this settlement: liens may need to be negotiated down.</div>' : ''}${extra ? '' : lienWarn}`
                : `<span class="kx-hint" style="margin:0;">Enter the ${esc(extra ? 'gross settlement on this policy' : label + ' gross settlement')} to see the fee, costs, liens and the net to the client.</span>`;
            if (out.innerHTML !== html) out.innerHTML = html;
        });
        // the additional policies' settlements, listed on the Settlement tab (worked out on the Insurance tab)
        const ex = $id('settlement-extra');
        if (ex) {
            const html = extras.length ? `<div class="pdf-card border-l-8 border-emerald-600 se-card"><div class="section-head" style="background:#ecfdf5;color:#047857;">Additional Insurance Settlements (Insurance tab)</div>
                ${extras.map(({ label, x }) => `<div class="se-row"><b>${esc(label)}</b><span>gross ${fmt$(x.gross)} − fee ${fmt$(x.fee)} − costs ${fmt$(x.costs)} − liens ${fmt$(x.liens)} = <b>${fmt$(x.net)}</b> net</span></div>`).join('')}</div>` : '';
            if (ex.innerHTML !== html) ex.innerHTML = html;
        }
        const tot = $id('settlement-total'); if (!tot) return;
        tot.style.display = sums.n ? '' : 'none';
        const html = sums.n ? `<div class="kx-calc-grid"><div><span style="color:#cbd5e1;">Total gross (${extras.length ? 'all settlements' : 'BI + UM/UIM'})</span><b style="color:#fff;">${fmt$(sums.gross)}</b></div>
                <div><span style="color:#cbd5e1;">Attorney fees</span><b style="color:#fff;">− ${fmt$(sums.fee)}</b></div><div><span style="color:#cbd5e1;">Case costs</span><b style="color:#fff;">− ${fmt$(sums.costs)}</b></div>
                <div><span style="color:#cbd5e1;">Liens / payoffs</span><b style="color:#fff;">− ${fmt$(sums.liens)}</b></div>
                <div class="net"><span style="color:#cbd5e1;">Total net to client</span><b style="color:#86efac;">${fmt$(sums.net)}</b></div></div>
                ${costs ? `<div class="kx-hint" style="margin:8px 0 0;color:#cbd5e1;">Case costs from the Case Costs tab: ${fmt$(costs)}, taken off once and shared by each settlement's gross.</div>` : ''}` : '';
        if (tot.innerHTML !== html) tot.innerHTML = html;
    };
    // a Case Costs box filled from the Case Costs tab isn't typed in (change the costs on that tab)
    document.addEventListener('beforeinput', (e) => {
        const f = e.target && e.target.closest && e.target.closest('[data-s="costs"][data-auto]');
        if (!f || e.defaultPrevented) return;
        e.preventDefault();
        toast('Case costs come from the Case Costs tab: add or change them there.', 'info', 4000);
    }, true);

    /* ---------- ADR: mediation, arbitration, settlement conferences ---------- */
    const ADR_TYPES = ['Mediation', 'Arbitration (binding)', 'Arbitration (non-binding)', 'UM / UIM arbitration', 'Settlement conference', 'Other'];
    const ADR_SET_BY = ['Agreed by both sides', 'Court-ordered', 'Required by the policy or contract'];
    const ADR_STATUSES = ['Proposed', 'Scheduled', 'Rescheduled', 'Settled at ADR', 'Impasse (no settlement)', 'Award issued', 'Cancelled'];
    const ADR_ATTEND = ['In person', 'By video', 'Not required'];
    const ADR_OPEN = new Set(['Proposed', 'Scheduled', 'Rescheduled']);
    const opts = (list, pick) => list.map(x => `<option${x === pick ? ' selected' : ''}>${esc(x)}</option>`).join('');
    window.addAdr = function () {
        const box = $id('kx-adr'); if (!box) return;
        const n = box.querySelectorAll('.kx-row').length + 1;
        const div = document.createElement('div');
        div.className = 'kx-row pdf-card border-l-4 border-violet-500 relative bg-white p-5 shadow-sm';
        div.innerHTML = `${removeBtn}
            <div class="kx-row-title">ADR ${n}</div>
            <div class="grid grid-cols-4 gap-5">
                <div><label>ADR Type</label><select class="prof-input" data-adr="type">${opts(ADR_TYPES)}</select></div>
                <div><label>How It Was Set</label><select class="prof-input">${opts(ADR_SET_BY)}</select></div>
                <div><label>Status</label><select class="prof-input" data-adr="status">${opts(ADR_STATUSES, 'Scheduled')}</select></div>
                <div><label>Client Must Attend</label><select class="prof-input">${opts(ADR_ATTEND)}</select></div>
                <div><label>Mediator / Arbitrator</label><div contenteditable="true" data-ph="e.g. Hon. Carla Meade (ret.)"></div></div>
                <div><label>ADR Provider</label><div contenteditable="true" data-ph="e.g. JAMS, AAA, a dispute resolution center"></div></div>
                <div><label>Date</label><div contenteditable="true" data-ph="MM/DD/YYYY" data-fmt="date" data-adr="date"></div></div>
                <div><label>Time</label><div contenteditable="true" data-ph="e.g. 9:00 AM" data-adr="time"></div></div>
                <div><label>Location / Video Link</label><div contenteditable="true" data-ph="Address, or the video link" data-adr="where"></div></div>
                <div><label>Brief / Summary Due</label><div contenteditable="true" data-ph="MM/DD/YYYY" data-fmt="date" data-adr="brief"></div></div>
                <div><label>Prep Session With Client</label><div contenteditable="true" data-ph="e.g. 10/14/2026, 3:00 PM"></div></div>
                <div><label>Carrier Rep With Authority</label><div contenteditable="true" data-ph="Adjuster attending, and their authority"></div></div>
                <div><label>Fee &amp; Split</label><div contenteditable="true" data-ph="e.g. $2,400, split 50/50"></div></div>
                <div><label>Last Demand</label><div contenteditable="true" data-ph="$ 0.00" data-fmt="currency"></div></div>
                <div><label>Last Offer</label><div contenteditable="true" data-ph="$ 0.00" data-fmt="currency"></div></div>
                <div><label>Settlement / Award</label><div contenteditable="true" data-ph="$ 0.00" data-fmt="currency" class="font-black text-violet-700"></div></div>
            </div>
            <label style="margin-top:10px;">Notes &amp; Outcome</label>
            <div contenteditable="true" data-ph="Who attends, what to bring, the result and what comes next (release, award appeal deadline)…" class="multiline-field text-sm italic text-slate-600 min-h-[48px]"></div>`;
        box.appendChild(div);
        placeholders(div);
        adrSummary();
        const first = div.querySelector('[contenteditable="true"]'); if (first) first.focus();
    };
    // MM/DD/YYYY (or M/D/YYYY) as a day number, for counting days between dates
    const dayOf = (s) => {
        const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || ''));
        if (!m) return null;
        const t = Date.UTC(+m[3], +m[1] - 1, +m[2]);
        return isFinite(t) && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31 ? Math.round(t / 864e5) : null;
    };
    const today = () => { const d = new Date(); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); };
    const inDays = (n) => n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 0 ? `in ${n} days` : `${-n} days ago`;
    const textIn = (row, sel) => { const el = row.querySelector(sel); return el ? (el.tagName === 'SELECT' ? el.value : el.innerText.trim()) : ''; };
    function adrSummary() {
        const out = $id('adr-summary'), box = $id('kx-adr'); if (!out || !box) return;
        const rows = Array.from(box.querySelectorAll(':scope > .kx-row'));
        if (!rows.length) { out.innerHTML = '<span class="kx-hint" style="margin:0;">No ADR on this case yet.</span>'; return; }
        const now = today(), items = rows.map(r => ({ type: textIn(r, '[data-adr="type"]'), status: textIn(r, '[data-adr="status"]'), date: textIn(r, '[data-adr="date"]'), day: dayOf(textIn(r, '[data-adr="date"]')),
            time: textIn(r, '[data-adr="time"]'), where: textIn(r, '[data-adr="where"]'), brief: textIn(r, '[data-adr="brief"]'), briefDay: dayOf(textIn(r, '[data-adr="brief"]')) }));
        const counts = {}; items.forEach(x => { counts[x.status] = (counts[x.status] || 0) + 1; });
        const next = items.filter(x => ADR_OPEN.has(x.status) && x.day !== null && x.day >= now).sort((a, b) => a.day - b.day)[0];
        const lines = [];
        if (next) {
            lines.push(`<div class="adr-next">📅 Next: <b>${esc(next.type)}</b> on <b>${esc(next.date)}</b>${next.time ? ' at ' + esc(next.time) : ''}${next.where ? ' · ' + esc(next.where) : ''} <span>(${inDays(next.day - now)})</span></div>`);
            if (next.briefDay !== null) lines.push(next.briefDay < now ? `<div class="kx-warn">The ${esc(next.type.toLowerCase())} brief was due ${esc(next.brief)} (${inDays(next.briefDay - now)}).</div>`
                : `<div class="adr-brief">📝 Brief / summary due <b>${esc(next.brief)}</b> (${inDays(next.briefDay - now)})</div>`);
        }
        // (a view-only file is a snapshot: nobody there can record the outcome)
        if (!viewOnly()) items.filter(x => ADR_OPEN.has(x.status) && x.day !== null && x.day < now).forEach(x => lines.push(`<div class="kx-warn">${esc(x.type)} on ${esc(x.date)} has passed but is still "${esc(x.status)}": record how it ended.</div>`));
        out.innerHTML = `<div class="kx-chips">${Object.keys(counts).map(k => `<span class="kx-chip">${esc(k)}: <b>${counts[k]}</b></span>`).join('')}</div>${lines.join('')}`;
    }

    /* ---------- Liens: status, totals, older rows ---------- */
    const LIEN_UNSETTLED = new Set(['Unconfirmed', 'Confirmed (lien letter received)', 'Reduction requested']);
    function labelled(card, text) {
        const l = Array.from(card.querySelectorAll('label')).find(x => x.textContent.trim().toLowerCase() === text.toLowerCase());
        if (!l) return null;
        const sib = l.nextElementSibling;
        if (sib && sib.matches('[contenteditable], select')) return sib;
        return l.parentElement ? l.parentElement.querySelector('[contenteditable], select') : null;
    }
    // Discovery & Filing Tracker rows saved before the Document column get it (Upload / 🔗 Link) and the newer task types
    window.upgradeLitRows = function () {
        if (typeof window.litDocCell !== 'function') return;
        document.querySelectorAll('#lit-body > tr').forEach(tr => {
            const typeSel = tr.querySelector('select');
            if (typeSel && Array.isArray(window.LIT_TYPES)) {
                const have = new Set(Array.from(typeSel.options).map(o => o.value));
                window.LIT_TYPES.forEach(t => { if (!have.has(t)) { const o = document.createElement('option'); o.textContent = t; typeSel.appendChild(o); } });
            }
            if (tr.querySelector('.lit-doc')) return;
            const last = tr.lastElementChild; if (!last) return;
            last.insertAdjacentHTML('beforebegin', window.litDocCell());
        });
    };
    const lienCards = () => Array.from(document.querySelectorAll('#lien-container > .pdf-card'));
    // Rows saved before the lien status get its fields (and the newer lien types) when the case opens.
    window.upgradeLienRows = function () {
        const area = $id('capture-area');
        lienCards().forEach(card => {
            const typeSel = card.querySelector('select');
            if (typeSel && Array.isArray(window.LIEN_TYPES)) {
                const have = new Set(Array.from(typeSel.options).map(o => o.value));
                const other = Array.from(typeSel.options).find(o => o.value === 'Other');
                window.LIEN_TYPES.forEach(t => { if (!have.has(t)) { const o = document.createElement('option'); o.textContent = t; typeSel.insertBefore(o, other || null); } });
            }
            if (card.querySelector('.lien-more') || typeof window.lienDetailsHTML !== 'function') return;
            card.insertAdjacentHTML('beforeend', window.lienDetailsHTML(true));
            // on a locked Training Library file, the new dropdowns are locked like the rest (training-library.js)
            if (area && area.classList.contains('mock-ro') && !(card.closest('.mock-open') && area.classList.contains('mock-areas-ready'))) {
                card.querySelectorAll('.lien-more select').forEach(s => { s.disabled = true; s.dataset.mockRo = '1'; });
            }
        });
    };
    function lienRows() {
        return lienCards().map(card => {
            const typeSel = card.querySelector('select'), other = typeSel && typeSel.parentElement.querySelector('[contenteditable]');
            const type = typeSel ? (typeSel.classList.contains('hidden') && other && other.innerText.trim() ? other.innerText.trim() : typeSel.value) : '';
            const status = card.querySelector('[data-lien="status"]') || labelled(card, 'Lien Status');
            return {
                type, holder: (labelled(card, 'Lienholder Entity') || {}).innerText || '',
                status: status ? status.value : '',
                amount: money(card.querySelector('[data-lien="amount"]') || labelled(card, 'Lien Amount')),
                requested: money(card.querySelector('[data-lien="requested"]') || labelled(card, 'Reduction Requested')),
                final: money(card.querySelector('[data-lien="final"]') || labelled(card, 'Final Payoff'))
            };
        });
    }
    // the liens still open (not negotiated, final, waived or paid): the Settlement tab warns about them
    window.lienOpenCount = () => lienRows().filter(l => l.status === 'Unconfirmed').length;
    window.updateLienSummary = function () {
        const out = $id('lien-summary'); if (!out) return;
        const rows = lienRows();
        if (!rows.length) { out.innerHTML = ''; window.calcSettlement(); return; }
        const by = {};
        rows.forEach(l => { const b = by[l.status] = by[l.status] || { n: 0, amt: 0 }; b.n++; b.amt += l.status === 'Waived' ? 0 : (l.final || l.amount); });
        const asserted = rows.reduce((s, l) => s + l.amount, 0);
        // what the liens will cost the client now: waived ones nothing; a final payoff where there is one; otherwise the amount claimed
        const owed = rows.reduce((s, l) => s + (l.status === 'Waived' || l.status === 'Paid' ? 0 : (l.final || l.amount)), 0);
        const saved = rows.reduce((s, l) => s + (l.status === 'Waived' ? l.amount : (l.final && l.amount > l.final ? l.amount - l.final : 0)), 0);
        const unconfirmed = rows.filter(l => l.status === 'Unconfirmed').length, open = rows.filter(l => LIEN_UNSETTLED.has(l.status)).length;
        out.innerHTML = `<div class="lien-sum">
                <div><span>Liens</span><b>${rows.length}</b></div>
                <div><span>Amount claimed</span><b>${fmt$(asserted)}</b></div>
                <div><span>Still to pay</span><b>${fmt$(owed)}</b></div>
                <div class="good"><span>Saved by reductions / waivers</span><b>${fmt$(saved)}</b></div>
            </div>
            <div class="kx-chips">${Object.keys(by).map(k => `<span class="kx-chip lien-st" data-st="${esc(k)}">${esc(k || 'Status not recorded')}: <b>${by[k].n}</b> · ${fmt$(by[k].amt)}</span>`).join('')}</div>
            ${unconfirmed ? `<div class="kx-warn">${unconfirmed} lien${unconfirmed === 1 ? ' is' : 's are'} still unconfirmed: get the lien letter (and the final amount) before the settlement statement.</div>`
                : open ? `<div class="kx-hint" style="margin:6px 0 0;">${open} lien${open === 1 ? '' : 's'} not final yet: ask for the final amount (and a reduction) before disbursing.</div>` : ''}`;
        window.calcSettlement();
    };

    /* ---------- Treatment: gaps in care ---------- */
    // Worked out from the Medical Chronology's dates of service and the Provider Treatment Matrix (never saved):
    // a gap of more than 30 days between visits, a first visit more than 7 days after the accident, a visit dated
    // before it, and a provider in the matrix with no visit in the chronology. Adjusters attack all of these.
    const GAP_DAYS = 30, FIRST_VISIT_DAYS = 7;
    const facKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    window.checkTreatmentGaps = function () {
        const out = $id('chrono-gaps'), body = $id('chrono-container'); if (!out || !body) return;
        const visits = [];
        Array.from(body.children).forEach(tr => {
            const td = tr.children, fac = td[1] && td[1].querySelector('[contenteditable]');
            const facility = fac ? fac.innerText.trim() : '';
            tr.querySelectorAll('.chrono-dos-list [contenteditable]').forEach(d => { const day = dayOf(d.innerText); if (day !== null) visits.push({ day, date: d.innerText.trim(), facility }); });
        });
        visits.sort((a, b) => a.day - b.day);
        const dolEl = $id('date-of-loss-field'), dol = dayOf(dolEl ? dolEl.innerText : '');
        const flags = [];
        if (visits.length && dol !== null) {
            const first = visits[0];
            if (first.day < dol) flags.push(`A visit is dated <b>${esc(first.date)}</b>${first.facility ? ` (${esc(first.facility)})` : ''}, before the accident (${esc(dolEl.innerText.trim())}). Check the date, or whether it's prior treatment.`);
            const firstAfter = visits.find(v => v.day >= dol);
            if (firstAfter && firstAfter.day - dol > FIRST_VISIT_DAYS) flags.push(`First treatment <b>${firstAfter.day - dol} days</b> after the accident (${esc(dolEl.innerText.trim())} → ${esc(firstAfter.date)}${firstAfter.facility ? `, ${esc(firstAfter.facility)}` : ''}). Note why the client waited.`);
        }
        for (let i = 1; i < visits.length; i++) {
            const a = visits[i - 1], b = visits[i], gap = b.day - a.day;
            if (gap > GAP_DAYS) flags.push(`<b>${gap}-day gap</b> in treatment: ${esc(a.date)}${a.facility ? ` (${esc(a.facility)})` : ''} → ${esc(b.date)}${b.facility ? ` (${esc(b.facility)})` : ''}. Find out why and note it.`);
        }
        const seen = new Set(visits.map(v => facKey(v.facility)).filter(Boolean));
        const providers = Array.from(document.querySelectorAll('#facility-container > tr')).map(tr => { const c = tr.children[0] && tr.children[0].querySelector('[contenteditable]'); return c ? c.innerText.trim() : ''; }).filter(Boolean);
        const missing = providers.filter(p => { const k = facKey(p); return ![...seen].some(s => s.includes(k) || k.includes(s)); });
        if (missing.length) flags.push(`No visits in the chronology for: <b>${missing.map(esc).join('</b>, <b>')}</b>. Add their dates of service (or remove the provider).`);
        if (!visits.length) { out.innerHTML = missing.length ? `<div class="gap-box warn"><div class="gap-head">⚠ Treatment check</div><ul><li>${flags.join('</li><li>')}</li></ul></div>` : ''; return; }
        const span = `${visits.length} visit${visits.length === 1 ? '' : 's'}, ${esc(visits[0].date)} – ${esc(visits[visits.length - 1].date)}`;
        out.innerHTML = flags.length
            ? `<div class="gap-box warn"><div class="gap-head">⚠ Treatment check <span>(${span})</span></div><ul><li>${flags.join('</li><li>')}</li></ul></div>`
            : `<div class="gap-box ok"><div class="gap-head">✓ No gaps over ${GAP_DAYS} days <span>(${span})</span></div></div>`;
    };

    // Redraw the worked-out lines (ADR, liens, treatment gaps) a moment after the fields they come from change.
    let checksTimer = null;
    function scheduleChecks() { clearTimeout(checksTimer); checksTimer = setTimeout(runChecks, 250); }
    function runChecks() { adrSummary(); window.updateLienSummary(); window.checkTreatmentGaps(); }
    function initChecks() {
        const watch = ['kx-adr', 'lien-container', 'chrono-container', 'facility-container', 'date-of-loss-field', 'fin-body', 'kx-insurance-extra'];
        const target = document.querySelector('.target-settlement-display');
        if (target) new MutationObserver(scheduleChecks).observe(target, { childList: true, subtree: true, characterData: true });
        const mo = new MutationObserver(scheduleChecks);
        watch.forEach(id => { const el = $id(id); if (el) mo.observe(el, { childList: true, subtree: true, characterData: true }); });
        document.addEventListener('change', (e) => { if (e.target.closest && watch.some(id => e.target.closest('#' + id))) scheduleChecks(); });
    }

    /* ---------- Police Report tab: report type ---------- */
    const REPORT_LABELS = {
        'Police Report': { tab: 'Police Report', head: 'Police Report Details', labels: ['Responding Agency', 'Report Number', 'Reporting Officer', "Officer's Narrative Summary"] },
        'Incident Report': { tab: 'Incident Report', head: 'Incident Report Details (Premises)', labels: ['Property / Business', 'Incident Report Number', 'Prepared By (Manager / Employee)', 'Incident Report Summary'] },
        'No Report': { tab: 'No Report', head: 'No Report Available', labels: ['Where It Was Reported (if anywhere)', 'Reference Number', 'Person Notified', 'Client\'s Account of the Incident'] }
    };
    window.applyReportKind = function () {
        const sel = document.querySelector('#kx-report-kind select'); if (!sel) return;
        const k = REPORT_LABELS[sel.value] || REPORT_LABELS['Police Report'];
        const tab = $id('tab-police'); if (tab) tab.textContent = k.tab;
        const body = $id('police-body'); if (!body) return;
        const head = body.querySelector('.section-head'); if (head) head.textContent = k.head;
        body.querySelectorAll('label').forEach((l, i) => { if (k.labels[i]) l.textContent = k.labels[i]; });
    };

    // After a case loads (or the editor is cleared): redraw what depends on the saved sections.
    window.afterKeyedApplied = function () {
        // a case opened (or the editor cleared): with case costs, its Case Costs boxes hold their shares (it was saved that
        // way); with none, what's in them was typed. (Not what the last case's boxes were.)
        const hasCosts = caseCostsTotal() > 0;
        document.querySelectorAll('[data-s="costs"]').forEach(f => { delete f.dataset.typed; if (hasCosts) f.dataset.auto = '1'; else { delete f.dataset.auto; f.removeAttribute('title'); } });
        window.applyReportKind(); window.calcWages(); window.upgradeLienRows(); window.upgradeLitRows(); runChecks(); partiesSummary(); window.addDemandLetterBoxes(); window.addDocLinkButtons();
        ['kx-parties', 'kx-authorized', 'kx-demand', 'kx-counsel', 'kx-adr', 'kx-insurance-extra'].forEach(id => { const b = $id(id); if (b) placeholders(b); });
    };

    /* ---------- Medical Chronology: reorder ---------- */
    const firstDate = (tr) => {
        const d = tr.querySelector('.chrono-dos-list [contenteditable]');
        const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(d ? d.innerText : '');
        return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '9999';
    };
    window.sortChronology = function () {
        if (viewOnly()) return;
        const body = $id('chrono-container'); if (!body) return;
        const rows = Array.from(body.children);
        if (rows.length < 2) { toast('Add at least two entries to sort them.', 'info'); return; }
        rows.sort((a, b) => firstDate(a).localeCompare(firstDate(b))).forEach(r => body.appendChild(r));
        toast('Medical chronology sorted by date of service.', 'success');
    };
    // Drag a row by its left edge (the ⠿ strip): works on rows saved before this too.
    function initChronoDrag() {
        const body = $id('chrono-container'); if (!body || body.dataset.dragReady) return;
        body.dataset.dragReady = '1';
        let dragging = null;
        body.addEventListener('mousedown', (e) => {
            const tr = e.target.closest('tr'); if (!tr || viewOnly()) return;
            const td = e.target.closest('td');
            const onHandle = td && td === tr.firstElementChild && (e.clientX - td.getBoundingClientRect().left) < 22;
            tr.draggable = !!onHandle;
        });
        body.addEventListener('dragstart', (e) => {
            const tr = e.target.closest && e.target.closest('tr'); if (!tr || !tr.draggable) { e.preventDefault(); return; }
            dragging = tr; tr.classList.add('kx-dragging');
            try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'row'); } catch (err) { /* old browsers */ }
        });
        body.addEventListener('dragover', (e) => {
            if (!dragging) return;
            e.preventDefault();
            const over = e.target.closest && e.target.closest('tr');
            if (!over || over === dragging || over.parentElement !== body) return;
            const r = over.getBoundingClientRect();
            body.insertBefore(dragging, e.clientY < r.top + r.height / 2 ? over : over.nextSibling);
        });
        const end = () => { if (dragging) { dragging.classList.remove('kx-dragging'); dragging.draggable = false; dragging = null; } };
        body.addEventListener('dragend', end);
        body.addEventListener('drop', (e) => { if (dragging) { e.preventDefault(); end(); } });
    }

    /* ---------- Doc Hub: drag and drop ---------- */
    const DROP_CATS = ['Intake Documents', 'Medical Records', 'Police Report', 'Case Files', 'Invoices', 'Bills', 'Property Damage', 'Litigation Documents', 'Others'];
    let dropCat = 'Case Files';
    function renderDropCats() {
        const box = $id('doc-drop-cats'); if (!box) return;
        box.innerHTML = DROP_CATS.map(c => `<button type="button" class="kx-pill ${c === dropCat ? 'on' : ''}" onclick="event.stopPropagation(); docDropCat(this.dataset.c)" data-c="${esc(c)}">${esc(c)}</button>`).join('');
    }
    window.docDropCat = function (c) { dropCat = c; renderDropCats(); };
    const hasFiles = (e) => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'));
    window.docDragOver = function (e) { if (!hasFiles(e) || viewOnly()) return; e.preventDefault(); e.currentTarget.classList.add('over'); };
    window.docDragLeave = function (e) { e.currentTarget.classList.remove('over'); };
    async function attach(row, file) {
        if (typeof handleDocUpload !== 'function') return;
        // reuse the row's own upload path (size check, R2 upload, link)
        const input = row.querySelector('input[type="file"]'); if (!input) return;
        const dt = new DataTransfer(); dt.items.add(file);
        input.files = dt.files;
        await handleDocUpload(input);
    }
    window.docDrop = async function (e) {
        e.preventDefault(); e.currentTarget.classList.remove('over');
        if (viewOnly()) return;
        const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
        if (!files.length) return;
        for (const file of files) {
            if (typeof addDocument !== 'function') return;
            addDocument(dropCat);
            const row = $id('doc-body').lastElementChild;
            const summary = row && row.querySelector('[contenteditable="true"]');
            if (summary && !summary.innerText.trim()) summary.innerText = file.name.replace(/\.[^.]+$/, '');
            await attach(row, file);
        }
        toast(`${files.length} file${files.length === 1 ? '' : 's'} added under ${dropCat}.`, 'success');
    };
    // a file dropped on a row attaches to that row
    function initRowDrop() {
        const body = $id('doc-body'); if (!body || body.dataset.dropReady) return;
        body.dataset.dropReady = '1';
        body.addEventListener('dragover', (e) => { if (!hasFiles(e) || viewOnly()) return; const tr = e.target.closest('tr'); if (!tr) return; e.preventDefault(); tr.classList.add('kx-drop-row'); });
        body.addEventListener('dragleave', (e) => { const tr = e.target.closest('tr'); if (tr) tr.classList.remove('kx-drop-row'); });
        body.addEventListener('drop', async (e) => {
            const tr = e.target.closest('tr'); if (!tr || !hasFiles(e) || viewOnly()) return;
            e.preventDefault(); tr.classList.remove('kx-drop-row');
            const file = e.dataTransfer.files[0]; if (file) await attach(tr, file);
        });
    }

    /* ---------- Tasks sent by an Admin (a ping sent "as a task") ---------- */
    // Kept per person on this computer (a shared one): the next person to sign in never sees them, and nobody
    // signed out does. (The old shared list, LSH_PENDING_TASKS_V1 with no name, isn't anyone's: it's dropped.)
    const me = () => { const s = typeof getRealSession === 'function' ? getRealSession() : (typeof getSession === 'function' ? getSession() : null); return s && s.username; };
    const PENDING_KEY = () => 'LSH_PENDING_TASKS_V2:' + me();
    try { localStorage.removeItem('LSH_PENDING_TASKS_V1'); } catch (e) { /* private mode */ }
    const pending = () => { if (!me()) return []; try { return JSON.parse(localStorage.getItem(PENDING_KEY()) || '[]'); } catch (e) { return []; } };
    const savePending = (list) => { if (!me()) return; try { localStorage.setItem(PENDING_KEY(), JSON.stringify(list.slice(-20))); } catch (e) { /* private mode */ } };
    function caseOpen() {
        const name = $id('client-name-field');
        return !!((window.mockCurrentId && window.mockCurrentId()) || (name && name.innerText.trim()));
    }
    function renderTaskCards() {
        let box = $id('task-inbox');
        const list = pending();
        if (!list.length) { if (box) box.remove(); return; }
        if (!box) { box = document.createElement('div'); box.id = 'task-inbox'; document.body.appendChild(box); }
        box.innerHTML = list.map(t => `<div class="task-card" data-id="${esc(t.id)}">
            <div class="task-card-head">📋 New task assigned</div>
            <div class="task-card-text">${esc(t.text)}</div>
            <div class="task-card-by">From ${esc(t.by)}${t.at ? ' · ' + esc(new Date(t.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })) : ''}</div>
            <div class="task-card-actions"><button class="accept" onclick="acceptTask(this.closest('.task-card').dataset.id)">✓ Accept</button><button onclick="dismissTask(this.closest('.task-card').dataset.id)">Dismiss</button></div></div>`).join('');
    }
    window.showTaskAssignment = function (t) {
        if (!me()) return;
        const list = pending();
        if (!list.some(x => String(x.id) === String(t.id))) list.push({ id: String(t.id), text: t.text, by: t.by, at: Date.now() });
        savePending(list);
        renderTaskCards();
        if (typeof playNotificationSound === 'function') playNotificationSound('ping');
    };
    window.acceptTask = function (id) {
        const list = pending(), t = list.find(x => String(x.id) === String(id)); if (!t) return;
        if (!caseOpen()) { toast('Open the case this task is for, then press Accept to add it to its Tasks.', 'info', 5000); return; }
        if (typeof addRow !== 'function' || !$id('task-body')) return;
        addRow('task-body');
        const tr = $id('task-body').lastElementChild;
        const cells = tr ? tr.querySelectorAll('[contenteditable="true"]') : [];
        if (cells[1]) cells[1].innerText = `${t.text} — assigned by ${t.by}`;
        savePending(list.filter(x => String(x.id) !== String(id)));
        renderTaskCards();
        if (typeof showTab === 'function') showTab('tasks');
        // A Training Library case saves its Notes and Tasks by itself (training-library.js); a saved case needs Save / Update.
        toast(viewOnly() ? 'Task added to this case\'s Tasks and saved. You can edit it and change who it\'s assigned to.' : 'Task added to this case\'s Tasks. Save the case to keep it.', 'success', 4500);
    };
    window.dismissTask = function (id) { savePending(pending().filter(x => String(x.id) !== String(id))); renderTaskCards(); };

    /* ---------- Hyperlinks ----------
       - Doc Hub: a row's 🔗 Link attaches a web address instead of a file (a shared folder, a provider portal, a website).
       - Case fields: a web address pasted into a text field becomes a link; select some words and paste an address
         over them and the words become the link.
       - A click on a link in a field shows where it goes, with Open ↗ (a new tab) and, where the field can be
         edited, Remove link. (A plain click in an editable field only puts the cursor there.)
       Only http(s) addresses are linked; cleanCaseHtml (app.js) keeps links safe when a case opens. */
    const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;
    const webHref = (u) => (/^www\./i.test(u) ? 'https://' + u : u);
    const safeWeb = (u) => { try { const x = new URL(webHref(String(u || '').trim())); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; } };
    const linkTag = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;
    function linkedHtml(text, multiline) {
        const line = (t) => esc(t).replace(/\r?\n/g, multiline ? '<br>' : ' ');
        let out = '', last = 0;
        text.replace(URL_RE, (m, off) => { const h = safeWeb(m); out += line(text.slice(last, off)) + (h ? linkTag(h, m) : esc(m)); last = off + m.length; return m; });
        return out + line(text.slice(last));
    }
    // The web addresses in an element's text become links (text kept as text, e.g. a library case's Notes and Tasks,
    // which are saved as text: training-library.js keeps a link there as its address).
    window.lshLinkify = function (el) {
        if (!el) return;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && n.parentElement.closest('a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
        const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach(n => {
            URL_RE.lastIndex = 0;
            if (!URL_RE.test(n.nodeValue)) return;
            URL_RE.lastIndex = 0;
            const tpl = document.createElement('template');
            tpl.innerHTML = linkedHtml(n.nodeValue, false);
            n.replaceWith(tpl.content);
        });
    };
    window.addDocLink = function (btn) {
        const row = btn && btn.closest('tr'), holder = row && row.querySelector('.doc-attachment'); if (!holder || viewOnly()) return;
        const typed = (prompt('Paste the web address (link) for this document:', 'https://') || '').trim();
        if (!typed || typed === 'https://') return;
        const href = safeWeb(typed);
        if (!href) { toast('That isn\'t a web address. It should start with https:// (or www.).', 'error', 5000); return; }
        const u = new URL(href);
        const name = (prompt('A name for the link (optional):', '') || '').trim() || (u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname : '')).slice(0, 80);
        holder.innerHTML = `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" class="doc-file-link doc-web-link" title="${esc(href)}" style="color:#2563eb;font-weight:700;">🔗 ${esc(name)}</a> <button type="button" onclick="this.parentElement.innerHTML=''" class="text-red-300 no-print" style="margin-left:4px;">×</button>`;
        holder.dispatchEvent(new Event('input', { bubbles: true }));
        toast('Link added. Save the case to keep it.', 'info');
    };
    // Doc Hub rows saved before the 🔗 Link button get one
    window.addDocLinkButtons = function () {
        document.querySelectorAll('#doc-body tr').forEach(tr => {
            if (tr.querySelector('.doc-link-btn')) return;
            const up = tr.querySelector('label.hub-btn'); if (!up) return;
            up.insertAdjacentHTML('afterend', ' <button type="button" class="hub-btn doc-link-btn" style="padding:6px 8px;" onclick="addDocLink(this)" title="Attach a web link instead (a shared folder, a provider portal, a website)">🔗 Link</button>');
        });
    };
    // (bubbling: a field's own paste handler, and the view-only guard, come first and can stop it)
    document.addEventListener('paste', (e) => {
        if (e.defaultPrevented) return;
        const el = e.target && e.target.closest && e.target.closest('#capture-area [contenteditable="true"]');
        if (!el || el.hasAttribute('data-fmt') || el.closest('[data-free-edit]')) return;
        const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
        URL_RE.lastIndex = 0;
        if (!text || !URL_RE.test(text)) return;
        URL_RE.lastIndex = 0;
        e.preventDefault();
        const one = text.trim(), sel = window.getSelection();
        const h = /^\S+$/.test(one) ? safeWeb(one) : '';
        if (h && sel && !sel.isCollapsed && el.contains(sel.anchorNode) && sel.toString().trim()) {
            document.execCommand('insertHTML', false, linkTag(h, sel.toString()));   // the selected words become the link
            return;
        }
        document.execCommand('insertHTML', false, linkedHtml(text, el.classList.contains('multiline-field')));
    });
    // a click on a link in a field: where it goes, Open ↗, Remove link
    function linkPop() {
        let p = $id('lnk-pop');
        if (!p) {
            document.body.insertAdjacentHTML('beforeend', '<div id="lnk-pop" class="no-print" role="dialog" aria-label="Link"></div>');
            p = $id('lnk-pop');
            const st = document.createElement('style');
            st.textContent = `#lnk-pop{position:fixed;z-index:2980;display:none;align-items:center;gap:8px;max-width:min(460px,92vw);background:#fff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 10px 26px rgba(15,33,72,.2);padding:6px 8px;font-size:12px}
                #lnk-pop.open{display:flex}
                #lnk-pop .lp-url{flex:1;min-width:0;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
                #lnk-pop a.lp-open,#lnk-pop button{flex-shrink:0;border:1px solid #cbd5e1;background:#fff;color:#0f2148;border-radius:6px;padding:3px 8px;font-weight:700;font-size:11px;cursor:pointer;text-decoration:none}
                #lnk-pop a.lp-open{background:#2563eb;border-color:#2563eb;color:#fff}
                #lnk-pop button:hover{border-color:#f97316;color:#c2410c}
                #capture-area [contenteditable] a[href]{color:#2563eb;text-decoration:underline;cursor:pointer}`;
            document.head.appendChild(st);
        }
        return p;
    }
    let popFor = null;   // the link the pop-up is showing
    const hideLinkPop = () => { const p = $id('lnk-pop'); if (p) p.classList.remove('open'); popFor = null; };
    function placeLinkPop() {
        const pop = $id('lnk-pop'); if (!pop || !popFor) return;
        if (!document.contains(popFor)) { hideLinkPop(); return; }
        const r = popFor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
        if (r.bottom < 0 || r.top > innerHeight) { hideLinkPop(); return; }   // scrolled out of sight
        pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
        pop.style.top = (r.bottom + 6 + h > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
    }
    function canEditLink(a) {
        const area = $id('capture-area'); if (!area || !area.classList.contains('mock-ro')) return true;
        return !!((a.closest('.mock-open') && area.classList.contains('mock-areas-ready')) || (a.closest('.mock-upd') && area.classList.contains('mock-upd-ready')));
    }
    document.addEventListener('click', (e) => {
        const p = $id('lnk-pop');
        if (p && p.contains(e.target)) return;
        const a = e.target && e.target.closest && e.target.closest('#capture-area [contenteditable] a[href]');
        if (!a) { hideLinkPop(); return; }
        e.preventDefault();
        const href = safeWeb(a.getAttribute('href'));
        const pop = linkPop();
        pop.innerHTML = `<span class="lp-url" title="${esc(href || a.getAttribute('href'))}">🔗 ${esc(href || 'not a web address')}</span>`
            + (href ? `<a class="lp-open" href="${esc(href)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : '')
            + (canEditLink(a) ? '<button type="button" data-lp="unlink">Remove link</button>' : '');
        const b = pop.querySelector('[data-lp="unlink"]');
        if (b) b.addEventListener('click', () => { const field = a.closest('[contenteditable]'); a.replaceWith(document.createTextNode(a.textContent)); hideLinkPop(); if (field) field.dispatchEvent(new Event('input', { bubbles: true })); });
        const o = pop.querySelector('.lp-open'); if (o) o.addEventListener('click', () => setTimeout(hideLinkPop, 0));
        pop.classList.add('open');
        popFor = a; placeLinkPop();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideLinkPop(); });
    document.addEventListener('scroll', placeLinkPop, true);   // the pop-up stays by its link
    window.addEventListener('resize', placeLinkPop);

    /* ---------- Location of Incident: one line ---------- */
    // Enter already finishes the field (app.js); a pasted address comes in as one line of plain text.
    function initLocationLine() {
        const el = $id('kf-incident-location'); if (!el) return;
        el.addEventListener('paste', e => {
            e.preventDefault();
            const text = (e.clipboardData ? e.clipboardData.getData('text/plain') : '').replace(/\s*[\r\n]+\s*/g, ', ');
            document.execCommand('insertText', false, text);
        });
    }

    // Signing in shows that person's waiting tasks; signing out takes them off the screen.
    const baseApply = window.applySessionUI;
    if (typeof baseApply === 'function') {
        window.applySessionUI = function () { const r = baseApply.apply(this, arguments); renderTaskCards(); return r; };
    }

    /* ---------- start ---------- */
    function init() {
        initChronoDrag(); initRowDrop(); renderDropCats(); initChecks(); window.afterKeyedApplied(); renderTaskCards(); initLocationLine();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    // redraw the counts and sums as people type in the new sections
    document.addEventListener('change', (e) => { if (e.target.closest && e.target.closest('#kx-parties')) partiesSummary(); });
})();
