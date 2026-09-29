/* =========================================================
   LSH CMS — CASE SECTIONS (the newer parts of the case editor)
   ---------------------------------------------------------
     - Parties Involved (passengers, at-fault party, witnesses…)
     - Authorized to Access Case (Profile)
     - Lost Wages, Demand and Settlement tabs, with their math
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
            <div contenteditable="true" data-ph="Records and bills enclosed, wage loss, photos, follow-up dates…" class="multiline-field text-sm italic text-slate-600 min-h-[48px]"></div>`;
        box.appendChild(div);
        placeholders(div);
        div.querySelector('[contenteditable="true"]').focus();
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

    /* ---------- Settlement: BI and UM/UIM, each on its own, then both together ---------- */
    const SETTLEMENTS = [['kx-settlement', 'settlement-calc', 'BI'], ['kx-settlement-um', 'settlement-calc-um', 'UM/UIM']];
    function settlementMath(box) {
        const f = (k) => box.querySelector(`[data-s="${k}"]`);
        const gross = money(f('gross')), pct = parseFloat(f('pct') ? f('pct').value : '0') || 0, costs = money(f('costs')), liens = money(f('liens'));
        const fee = gross * pct / 100;
        return { gross, pct, fee, costs, liens, net: gross - fee - costs - liens };
    }
    window.calcSettlement = function () {
        const sums = { gross: 0, fee: 0, costs: 0, liens: 0, net: 0, n: 0 };
        SETTLEMENTS.forEach(([boxId, outId, label]) => {
            const box = $id(boxId), out = $id(outId); if (!box || !out) return;
            const x = settlementMath(box);
            if (x.gross) { ['gross', 'fee', 'costs', 'liens', 'net'].forEach(k => { sums[k] += x[k]; }); sums.n++; }
            out.innerHTML = x.gross ? `<div class="kx-calc-grid">
                    <div><span>${label} gross</span><b>${fmt$(x.gross)}</b></div><div><span>Attorney fee${x.pct ? ` (${x.pct === 33.33 ? '33⅓' : x.pct}%)` : ''}</span><b>− ${fmt$(x.fee)}</b></div>
                    <div><span>Case costs</span><b>− ${fmt$(x.costs)}</b></div><div><span>Liens / payoffs</span><b>− ${fmt$(x.liens)}</b></div>
                    <div class="net"><span>${label} net to client</span><b>${fmt$(x.net)}</b></div></div>
                    ${x.net < 0 ? '<div class="kx-warn">The fee, costs and liens are more than this settlement: liens may need to be negotiated down.</div>' : ''}`
                : `<span class="kx-hint" style="margin:0;">Enter the ${label} gross settlement to see the fee, costs, liens and the net to the client.</span>`;
        });
        const tot = $id('settlement-total'); if (!tot) return;
        tot.style.display = sums.n ? '' : 'none';
        tot.innerHTML = sums.n ? `<div class="kx-calc-grid"><div><span style="color:#cbd5e1;">Total gross (BI + UM/UIM)</span><b style="color:#fff;">${fmt$(sums.gross)}</b></div>
                <div><span style="color:#cbd5e1;">Attorney fees</span><b style="color:#fff;">− ${fmt$(sums.fee)}</b></div><div><span style="color:#cbd5e1;">Case costs</span><b style="color:#fff;">− ${fmt$(sums.costs)}</b></div>
                <div><span style="color:#cbd5e1;">Liens / payoffs</span><b style="color:#fff;">− ${fmt$(sums.liens)}</b></div>
                <div class="net"><span style="color:#cbd5e1;">Total net to client</span><b style="color:#86efac;">${fmt$(sums.net)}</b></div></div>` : '';
    };

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
        window.applyReportKind(); window.calcWages(); window.calcSettlement(); partiesSummary();
        ['kx-parties', 'kx-authorized', 'kx-demand'].forEach(id => { const b = $id(id); if (b) placeholders(b); });
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
    const PENDING_KEY = 'LSH_PENDING_TASKS_V1';
    const pending = () => { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch (e) { return []; } };
    const savePending = (list) => { try { localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-20))); } catch (e) { /* private mode */ } };
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
        toast('Task added to this case\'s Tasks. Save the case to keep it.', 'success', 4500);
    };
    window.dismissTask = function (id) { savePending(pending().filter(x => String(x.id) !== String(id))); renderTaskCards(); };

    /* ---------- start ---------- */
    function init() {
        initChronoDrag(); initRowDrop(); renderDropCats(); window.afterKeyedApplied(); renderTaskCards();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    // redraw the counts and sums as people type in the new sections
    document.addEventListener('change', (e) => { if (e.target.closest && e.target.closest('#kx-parties')) partiesSummary(); });
})();
