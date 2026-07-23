/* =========================================================
           LSH CASE MANAGEMENT SYSTEM — CORE SCRIPT
           Consolidated, de-duplicated, and cleaned up.
           ========================================================= */

        /* =========================================================
           ACCESS GATE — single source of truth for whether case
           content is allowed to be rendered right now.

           IMPORTANT / HONEST LIMITATION: this app stores case data in
           the browser's localStorage and runs entirely client-side.
           No amount of JS/CSS here can make content truly inaccessible
           to someone with devtools/console access — they can always
           read localStorage directly. What this gate DOES fix is the
           specific bypass of "hide an overlay via the Elements panel
           and the full page is still sitting in the DOM underneath."
           Now, when locked/logged-out, the sensitive DOM content is
           never populated in the first place — so removing the
           overlay just reveals an empty shell instead of real data.
           ========================================================= */
        let siteIsLocked = false;       // mirrors state.locked from /api/state
        let siteLockedByAdmin = false;  // true if current session is Admin (Admins stay through a lock)
        function hasAuthorizedAccess() {
            const session = getSession();
            if (!session) return false;
            if (siteIsLocked && session.userType !== 'Admin') return false;
            return true;
        }
        function blankCaseEditorContent() {
            // Wipes any case content currently sitting in the DOM so a
            // hidden/removed overlay can't expose it.
            //
            // NOTE: 'pane-police' is intentionally NOT in this list. Unlike
            // the other ids below (which are empty-by-default containers
            // that dynamic add-row/add-card functions populate), pane-police
            // is a static card with its own hardcoded labels/layout baked
            // into the page HTML. Wiping its innerHTML doesn't just clear
            // entered values — it permanently destroys the Police Report
            // Details markup itself, and nothing ever rebuilds it, so the
            // whole section disappears for the rest of the session. The
            // contenteditable-clearing loop just below already blanks the
            // actual field VALUES inside pane-police, which is all that's
            // needed here.
            ['passenger-container','facility-container','chrono-container','fin-body','pip-um-container',
             'bi-container','doc-body','lit-body','lien-container','note-body','task-body'
            ].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
            document.querySelectorAll('[contenteditable="true"]').forEach(el => { el.innerHTML = ''; });
            const nameField = document.getElementById('client-name-field');
            if (nameField) nameField.innerText = '';
            currentCaseId = null;
            currentCaseIsDraft = false;
            currentCaseCanEdit = true;
        }
        /* ---------- Overlay integrity watchdog ----------
           DevTools lets someone disable a single CSS declaration (e.g.
           uncheck "#lock-overlay.open { display:flex }") without
           touching the element's class at all, so a MutationObserver on
           class/attributes won't see it. This polls the *computed*
           style instead and re-asserts it via an inline !important
           style, which devtools' checkbox toggle does not remove. */
        function enforceOverlayVisibility(id, shouldBeOpen) {
            const el = document.getElementById(id);
            if (!el) return;
            const wantDisplay = shouldBeOpen ? 'flex' : 'none';
            const computed = window.getComputedStyle(el).display;
            if (computed !== wantDisplay) {
                el.style.setProperty('display', wantDisplay, 'important');
            }
        }
        function runOverlayIntegrityCheck() {
            const session = getSession();
            const authorized = hasAuthorizedAccess();
            enforceOverlayVisibility('auth-gate', !session);
            enforceOverlayVisibility('lock-overlay', siteIsLocked && !siteLockedByAdmin);
            if (!authorized) {
                blankCaseEditorContent();
                renderRepo(); // re-checks hasAuthorizedAccess() itself and keeps the sidebar blank
            }
        }
        setInterval(runOverlayIntegrityCheck, 750);

        /* ---------- Toast notifications + sound cues ---------- */
        let _audioCtx = null;
        function getAudioCtx() {
            if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            return _audioCtx;
        }
        function playNotificationSound(type) {
            try {
                const ctx = getAudioCtx();
                const now = ctx.currentTime;
                const patterns = {
                    success: [660, 880],
                    error: [300, 210],
                    info: [520, 660],
                    alert: [440, 330, 440],
                    // Ping needs to cut through and actually grab attention, so it's
                    // louder, longer, and uses its own back-and-forth two-tone
                    // pattern (repeated) rather than reusing any other cue.
                    ping: [988, 740, 988, 740, 988, 740]
                };
                const notes = patterns[type] || patterns.info;
                const isPing = type === 'ping';
                const peakGain = isPing ? 0.42 : 0.22;
                const noteSpacing = isPing ? 0.24 : 0.13;
                const noteLength = isPing ? 0.34 : 0.18;
                notes.forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    const t = now + i * noteSpacing;
                    gain.gain.setValueAtTime(0.0001, t);
                    gain.gain.exponentialRampToValueAtTime(peakGain, t + 0.015);
                    gain.gain.exponentialRampToValueAtTime(0.0001, t + noteLength);
                    osc.connect(gain).connect(ctx.destination);
                    osc.start(t);
                    osc.stop(t + noteLength + 0.02);
                });
            } catch (e) { console.warn('Audio playback unavailable:', e); }
        }
        function showToast(message, type, duration, subtitle) {
            type = type || 'info';
            duration = duration || 3500;
            let container = document.getElementById('toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toast-container';
                document.body.appendChild(container);
            }
            const toast = document.createElement('div');
            toast.className = 'toast ' + type;
            if (subtitle) {
                toast.innerHTML = '<div class="toast-main">' + escapeHtmlAttr(message) + '</div>' +
                    '<div class="toast-sub">' + escapeHtmlAttr(subtitle) + '</div>';
            } else {
                toast.textContent = message;
            }
            container.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('show'));
            playNotificationSound(type);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }

        let currentCaseId = null; // server-side case_repository row id (null = never saved)
        let currentCaseIsDraft = false; // true = loaded/created case has NO permanent Case ID yet
        let currentCaseCanEdit = true; // false when viewing a foreign case read-only (not owner/admin)
        let _emptyCaptureAreaTemplate = null; // pristine clone of #capture-area, captured once at load, used to render read-only previews of OTHER users' cases without touching the live editor
        const LOCK_KEY = 'LSH_PAGE_LOCKED';
        const SESSION_KEY = 'LSH_SESSION_V1';
        const HEARTBEAT_INTERVAL_MS = 2000;
        const HEARTBEAT_GRACE_MS = 6000;
        const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes — adjust if needed
        const ANNOUNCE_KEY = 'LSH_ANNOUNCEMENT_V1';
        // Agency logo is hardcoded (no admin-editable/localStorage-backed
        // system anymore) — a corrupted/truncated localStorage value was
        // previously causing the logo to render as blank space; removing
        // that system entirely was the fix, not just patching one instance.
        const AGENCY_LOGO = "data:image/png;base64,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";


        const staffOptions = `
            <option>Lead Attorney</option>
            <option>Associate Attorney</option>
            <option>Paralegal</option>
            <option>Case Manager</option>
            <option>Demand Specialist</option>
            <option>Records Specialist</option>
            <option>PD Specialist</option>
            <option>Lien Negotiator</option>
            <option>Intake Specialist</option>
        `;

        /* ---------- Tabs ---------- */
        function showTab(id) {
            document.querySelectorAll('.tab-pane').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active-tab'));
            const pane = document.getElementById('pane-' + id);
            pane.style.display = 'block';
            void pane.offsetHeight; // force reflow so the fade-in transition actually plays
            requestAnimationFrame(() => pane.classList.add('active'));
            document.getElementById('tab-' + id).classList.add('active-tab');
        }

        function updatePhaseDisplay(val) {
            document.getElementById('display-phase').innerText = val.toUpperCase();
        }

        function handleOtherSystem(selectId, otherInputId, revertId) {
            const sel = document.getElementById(selectId);
            const input = document.getElementById(otherInputId);
            const rev = document.getElementById(revertId);
            if (sel.value === "Others" || sel.value === "Other") {
                sel.classList.add('hidden');
                input.classList.remove('hidden');
                rev.style.display = "inline-block";
                input.focus();
            }
        }

        function revertOther(selectId, otherInputId, revertId) {
            document.getElementById(selectId).classList.remove('hidden');
            document.getElementById(selectId).selectedIndex = 0;
            document.getElementById(otherInputId).classList.add('hidden');
            document.getElementById(revertId).style.display = "none";
        }

        /* ---------- Third Party Vehicle: conditional owner/driver sections ---------- */
        function toggleOwnerExtra() {
            const owner = document.getElementById('tp-owner').innerText.trim().toLowerCase();
            const driver = document.getElementById('tp-driver').innerText.trim().toLowerCase();
            const extra = document.getElementById('tp-owner-extra');
            if (owner && driver && owner !== driver) extra.classList.remove('hidden');
            else extra.classList.add('hidden');
        }
        function toggleDriverInsuredExtra() {
            const val = document.getElementById('tp-driver-insured').value;
            const extra = document.getElementById('tp-driver-extra');
            if (val === 'Yes') extra.classList.remove('hidden');
            else extra.classList.add('hidden');
        }
        document.addEventListener('DOMContentLoaded', () => {
            const owner = document.getElementById('tp-owner');
            const driver = document.getElementById('tp-driver');
            if (owner && driver) {
                owner.addEventListener('input', toggleOwnerExtra);
                driver.addEventListener('input', toggleOwnerExtra);
                owner.addEventListener('focusout', toggleOwnerExtra);
                driver.addEventListener('focusout', toggleOwnerExtra);
            }
        });

        /* ---------- Placeholder auto-labeling (runs once per insertion, no polling) ---------- */
        function applyPlaceholders(scope) {
            const root = scope || document;
            root.querySelectorAll('[contenteditable="true"]').forEach(el => {
                if (el.hasAttribute('data-ph')) return;
                const wrap = el.closest('div');
                const lbl = wrap ? wrap.querySelector('label') : null;
                el.setAttribute('data-ph', lbl ? ('Enter ' + lbl.innerText.trim()) : 'Enter details');
            });
        }

        /* ---------- Dynamic row/card builders ---------- */
        function addRow(id) {
            const tr = document.createElement('tr');
            const today = new Date().toLocaleDateString();
            if (id === 'lit-body') {
                tr.innerHTML = `<td><select class="prof-input text-xs"><option>Service</option><option>Complaint</option><option>Summons</option><option>Interrogatories</option><option>RFP</option><option>RFA</option><option>Deposition Notice</option><option>Subpoena</option><option>Motion</option></select></td><td><div contenteditable="true" class="text-xs" data-ph="Enter party"></div></td><td><div contenteditable="true" class="text-xs" data-ph="MM/DD/YYYY" data-fmt="date"></div></td><td><select class="prof-input text-xs"><option>Pending</option><option>Responded</option><option>Completed</option></select></td><td><button onclick="this.parentElement.parentElement.remove()" class="text-red-500 font-bold">×</button></td>`;
            } else if (id === 'fin-body') {
                tr.innerHTML = `<td><div contenteditable="true" class="text-xs">${today}</div></td><td><select class="prof-input text-xs">${staffOptions}</select></td><td><div contenteditable="true" class="text-xs" data-ph="Enter description"></div></td><td><div contenteditable="true" class="font-black exp-field text-xs text-blue-600" data-ph="$ 0.00" data-fmt="currency"></div></td><td><button onclick="this.parentElement.parentElement.remove(); updateTotals();" class="text-red-500 font-bold">×</button></td>`;
            } else if (id === 'note-body' || id === 'task-body') {
                tr.innerHTML = `<td><div contenteditable="true" class="text-xs font-bold text-slate-400">${today}</div></td><td><select class="prof-input text-xs">${staffOptions}</select></td><td><div contenteditable="true" class="multiline-field text-xs min-h-[40px] italic" data-ph="Enter details"></div></td><td><button onclick="this.parentElement.parentElement.remove()" class="text-red-500 font-bold">×</button></td>`;
            }
            document.getElementById(id).appendChild(tr);
            applyPlaceholders(tr);
        }

        /* ---------- Case ID auto-generation: LSH-<Year>-<Type>-<XXXXXX> ---------- */
        const TYPE_CODES = { 'MVA': 'MVA', 'Slip and Fall': 'SNF', 'Dog Bite': 'DOG', 'Premise Liability': 'PRL' };
        function currentTypeCode() {
            const sel = document.getElementById('main-case-type');
            if (sel.value === 'Others') {
                const other = document.getElementById('main-case-other').innerText.trim();
                return other ? other.replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 4) || 'OTH' : 'OTH';
            }
            return TYPE_CODES[sel.value] || sel.value.replace(/\s+/g, '').toUpperCase().substring(0, 3);
        }
        // NOTE: Case IDs are now minted directly inside /api/case-repository
        // (via finalize:true) at the moment a case is saved/finalized, so a
        // separate client-side requestCaseId()/POST /api/case-id round-trip
        // is no longer needed here. /api/case-id itself is left in place
        // and still works if anything else calls it.
        // Updates the on-screen Case ID field to reflect the current state:
        //  - Already permanently saved case open -> show its real, fixed,
        //    server-issued ID (never regenerated here).
        //  - Draft open (Archive Case (Save as Draft), no ID yet) -> say so.
        //  - Brand-new, never-saved case -> a real ID isn't reserved just for
        //    viewing the form (that's what makes cross-device numbers collide-
        //    free) — say it'll be assigned when you actually save.
        function generateCaseId() {
            const field = document.getElementById('case-id-field');
            field.dataset.series = '';
            if (currentCaseId !== null && !currentCaseIsDraft) {
                return; // finalized case — its ID is fixed, never regenerated here
            }
            field.innerText = currentCaseIsDraft
                ? 'DRAFT \u2014 ID assigned on Save Case'
                : 'Will be assigned by the server on Save Case';
        }


        function addBI() {
            const div = document.createElement('div'); div.className = "pdf-card border-l-4 border-red-500 relative bg-white p-6 mb-4 shadow-sm";
            div.innerHTML = `<button onclick="this.parentElement.remove()" class="absolute top-2 right-4 text-slate-300 no-print">×</button>
                <div class="grid grid-cols-4 gap-6 mb-6">
                    <div><label>Policy Holder</label><div contenteditable="true" data-ph="Enter policy holder" data-fmt="name"></div></div>
                    <div><label>Carrier</label><div contenteditable="true" data-ph="Enter carrier" data-fmt="name"></div></div>
                    <div><label>Policy #</label><div contenteditable="true" data-ph="Enter policy #"></div></div>
                    <div><label>Claim #</label><div contenteditable="true" data-ph="Enter claim #"></div></div>
                </div>
                <div class="grid grid-cols-4 gap-6">
                    <div><label>Adjuster Name</label><div contenteditable="true" data-ph="Enter adjuster name" data-fmt="name"></div></div>
                    <div><label>Adjuster Contact</label><div contenteditable="true" data-ph="Enter adjuster contact"></div></div>
                    <div><label>Liability Accepted?</label><select class="prof-input"><option>Pending</option><option>Yes</option><option>No</option></select></div>
                    <div><label>Policy Limits</label><div contenteditable="true" data-ph="Enter limits"></div></div>
                </div>`;
            document.getElementById('bi-container').appendChild(div);
        }

        function addPIPUM() {
            const div = document.createElement('div'); div.className = "pdf-card border-l-4 border-orange-500 relative bg-white p-6 mb-4 shadow-sm";
            div.innerHTML = `<button onclick="this.parentElement.remove()" class="absolute top-2 right-4 text-slate-300 no-print">×</button>
                <div class="grid grid-cols-4 gap-6 mb-6">
                    <div><label>Coverage Type</label><select class="prof-input"><option>PIP</option><option>UM/UIM</option></select></div>
                    <div><label>Policy Holder</label><div contenteditable="true" data-ph="Enter policy holder" data-fmt="name"></div></div>
                    <div><label>Insurance Carrier</label><div contenteditable="true" data-ph="Enter carrier" data-fmt="name"></div></div>
                    <div><label>Policy #</label><div contenteditable="true" data-ph="Enter policy #"></div></div>
                </div>
                <div class="grid grid-cols-4 gap-6">
                    <div><label>Claim Number</label><div contenteditable="true" data-ph="Enter claim #"></div></div>
                    <div><label>Adjuster Name</label><div contenteditable="true" data-ph="Enter adjuster name" data-fmt="name"></div></div>
                    <div><label>Adjuster Contact</label><div contenteditable="true" data-ph="Enter adjuster contact"></div></div>
                    <div><label>Policy Limits</label><div contenteditable="true" data-ph="Enter limits"></div></div>
                </div>`;
            document.getElementById('pip-um-container').appendChild(div);
        }

        function addLien() {
            const id = Date.now();
            const div = document.createElement('div'); div.className = "pdf-card border-l-4 border-slate-900 relative bg-white p-6 mb-4 shadow-sm";
            div.innerHTML = `<button onclick="this.parentElement.remove()" class="absolute top-2 right-4 text-slate-300 no-print">×</button>
                <div class="grid grid-cols-4 gap-6">
                    <div><label>Type of Lien</label><div class="flex items-center"><select id="l-sel-${id}" onchange="handleOtherSystem(this.id, 'l-oth-${id}', 'l-rev-${id}')" class="prof-input"><option>Prior Atty Lien</option><option>Medical Lien</option><option>HI Subro</option><option>Funding</option><option>Other</option></select><div id="l-oth-${id}" contenteditable="true" data-ph="Specify type" class="hidden text-xs font-bold px-2 py-1 bg-orange-50 border border-orange-200 min-w-[80px]"></div><button id="l-rev-${id}" onclick="revertOther('l-sel-${id}', 'l-oth-${id}', this.id)" class="revert-btn">↺</button></div></div>
                    <div><label>Lienholder Entity</label><div contenteditable="true" data-ph="Enter entity" data-fmt="name"></div></div>
                    <div><label>Claim / File #</label><div contenteditable="true" data-ph="Enter claim / file #"></div></div>
                    <div><label>Lien Amount</label><div contenteditable="true" class="text-red-600 font-bold" data-ph="$ 0.00" data-fmt="currency"></div></div>
                </div>`;
            document.getElementById('lien-container').appendChild(div);
        }

        function addFacility() {
            const id = "fac-" + Date.now();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><div contenteditable="true" class="text-xs" data-ph="Enter facility name"></div></td>
                <td>
                    <div class="flex items-center gap-1">
                        <select id="sel-${id}" onchange="handleOtherSystem(this.id, 'oth-${id}', 'rev-${id}')" class="prof-input text-xs"><option>Chiro</option><option>EMC</option><option>EMS</option><option>Emergency Hospital</option><option>Ortho</option><option>Surgery</option><option>Anesthesia</option><option>Pain Management</option><option value="Other">Other</option></select>
                        <div id="oth-${id}" contenteditable="true" data-ph="Specify" class="hidden text-xs px-2 py-1 bg-orange-50 border border-orange-200 min-w-[70px]"></div>
                        <button id="rev-${id}" onclick="revertOther('sel-${id}', 'oth-${id}', this.id)" class="revert-btn">↺</button>
                    </div>
                </td>
                <td><div contenteditable="true" class="text-xs" data-ph="(000) 000-0000" data-fmt="phone"></div></td>
                <td><div contenteditable="true" class="text-xs" data-ph="name@example.com" data-fmt="email"></div></td>
                <td><div contenteditable="true" class="text-xs" data-ph="MM/DD/YYYY – MM/DD/YYYY"></div></td>
                <td><select class="prof-input text-xs"><option>Ongoing</option><option>Discharged</option><option>Referred Out</option><option>Pending Records</option></select></td>
                <td><div contenteditable="true" class="med-field font-black text-green-700 text-xs" data-ph="$ 0.00" data-fmt="currency"></div></td>
                <td><button onclick="this.parentElement.parentElement.remove(); updateTotals();" class="text-red-500 font-bold">×</button></td>
            `;
            document.getElementById('facility-container').appendChild(tr);
            applyPlaceholders(tr);
        }

        function addChronology() {
            const rowId = "chrono-" + Date.now();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="chrono-dos-list" id="dos-${rowId}">
                        <div class="flex items-center gap-1 mb-1">
                            <div contenteditable="true" class="text-xs" data-ph="MM/DD/YYYY" data-fmt="date"></div>
                        </div>
                    </div>
                    <button onclick="addChronoDate('dos-${rowId}')" class="add-btn no-print" style="margin-top:2px;">+ Add Date</button>
                </td>
                <td><div contenteditable="true" class="text-xs" data-ph="Enter facility name" data-fmt="name"></div></td>
                <td><div contenteditable="true" class="text-xs" data-ph="MM/DD/YYYY" data-fmt="date"></div></td>
                <td><div contenteditable="true" class="multiline-field text-xs italic" data-ph="Enter notes"></div></td>
                <td><button onclick="this.parentElement.parentElement.remove()" class="text-red-500 font-bold">×</button></td>
            `;
            document.getElementById('chrono-container').appendChild(tr);
            applyPlaceholders(tr);
        }
        function addChronoDate(containerId) {
            const container = document.getElementById(containerId);
            const div = document.createElement('div');
            div.className = "flex items-center gap-1 mb-1";
            div.innerHTML = `<div contenteditable="true" class="text-xs" data-ph="MM/DD/YYYY" data-fmt="date"></div><button onclick="this.parentElement.remove()" class="text-red-400 font-bold text-[10px]">×</button>`;
            container.appendChild(div);
            applyPlaceholders(div);
        }

        function addPassenger() {
            const div = document.createElement('div'); div.className = "pdf-card border-l-4 border-orange-500 relative bg-white p-6 mb-4 shadow-sm";
            div.innerHTML = `<button onclick="this.parentElement.remove()" class="absolute top-2 right-4 text-slate-300 no-print">×</button>
                <div class="grid grid-cols-4 gap-6">
                    <div><label>Full Name</label><div contenteditable="true" data-ph="Enter full name" data-fmt="name"></div></div>
                    <div><label>DOB</label><div contenteditable="true" data-ph="MM/DD/YYYY" data-fmt="date"></div></div>
                    <div><label>Contact Info</label><div contenteditable="true" data-ph="Enter contact"></div></div>
                    <div><label>Injury Sustained</label><div contenteditable="true" data-ph="Enter injury"></div></div>
                </div>`;
            document.getElementById('passenger-container').appendChild(div);
        }

        function addDocument(label) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td width="200"><div class="bg-slate-100 p-2 rounded text-[10px] font-black border text-center uppercase">${label}</div></td><td><div contenteditable="true" class="multiline-field text-xs italic text-slate-500" data-ph="Enter summary"></div></td><td width="150" class="no-print"><label class="hub-btn" style="display:inline-block;padding:6px 10px;cursor:pointer;">Upload<input type="file" onchange="handleDocUpload(this)" class="hidden"></label><div style="font-size:8px;color:#94a3b8;margin-top:2px;">Max 2MB</div><div class="doc-attachment" style="margin-top:4px;font-size:9px;"></div></td><td width="40"><button onclick="this.parentElement.parentElement.remove()" class="text-red-300 font-bold">×</button></td>`;
            document.getElementById('doc-body').appendChild(tr);
            applyPlaceholders(tr);
        }
        // Files are attached client-side as data URLs directly inside the row
        // (same as every other Doc Hub field), so they save/load/print along
        // with the rest of the case automatically — no separate storage needed.
        // Per-document cap: 2MB. (There is no separate total-per-case cap —
        // the whole case is no longer budget-limited server-side.)
        const DOC_UPLOAD_MAX_BYTES = 2 * 1024 * 1024; // 2MB per document
        function handleDocUpload(input) {
            const file = input.files && input.files[0];
            if (!file) return;
            if (file.size > DOC_UPLOAD_MAX_BYTES) {
                alert('That file is too large to attach (max 2MB). Try a smaller file or a compressed copy.');
                input.value = '';
                return;
            }
            const row = input.closest('tr');
            const holder = row ? row.querySelector('.doc-attachment') : null;
            const reader = new FileReader();
            reader.onload = () => {
                const safeName = file.name.replace(/"/g, '&quot;');
                if (holder) {
                    holder.innerHTML = `<a href="${reader.result}" download="${safeName}" class="doc-file-link" style="color:#2563eb;font-weight:700;">📎 ${safeName}</a> <button type="button" onclick="this.parentElement.innerHTML=''" class="text-red-300 no-print" style="margin-left:4px;">×</button>`;
                }
                input.value = '';
            };
            reader.onerror = () => { alert('Could not read that file. Please try again.'); input.value = ''; };
            reader.readAsDataURL(file);
        }

        /* ---------- Totals ---------- */
        function updateTotals() {
            let med = 0; document.querySelectorAll('.med-field').forEach(el => med += parseFloat(el.innerText.replace(/[^0-9.-]/g, '')) || 0);
            document.getElementById('med-total').innerText = '$ ' + med.toLocaleString(undefined, { minimumFractionDigits: 2 });
            let exp = 0; document.querySelectorAll('.exp-field').forEach(el => exp += parseFloat(el.innerText.replace(/[^0-9.-]/g, '')) || 0);
            if (document.getElementById('exp-total')) document.getElementById('exp-total').innerText = '$ ' + exp.toLocaleString(undefined, { minimumFractionDigits: 2 });
        }
        // Recalculate on input instead of aggressive polling — avoids flicker/lag.
        document.addEventListener('input', (e) => {
            if (e.target && (e.target.classList.contains('med-field') || e.target.classList.contains('exp-field'))) updateTotals();
        });
        setInterval(updateTotals, 4000); // light safety-net, not a UI repaint loop

        /* ---------- Case repository (server-side, D1-backed) ----------
           Replaces the old localStorage-based repository entirely. Every
           user can VIEW every finalized case; drafts are visible only to
           their owner or an Admin (enforced server-side in
           case-repository.js, not just here). Only the owner or an Admin
           may modify/delete a case — also enforced server-side. */
        // Builds just the FIELD CONTENT of the current case (no metadata —
        // clientName/phase/medTotal/ownership are tracked separately and
        // sent alongside this on save).
        function buildCaseContentPayload() {
            return {
                caseType: document.getElementById('main-case-type') ? document.getElementById('main-case-type').value : null,
                caseTypeOther: document.getElementById('main-case-other') ? document.getElementById('main-case-other').innerHTML : '',
                caseTypeOtherVisible: !!(document.getElementById('main-case-other') && !document.getElementById('main-case-other').classList.contains('hidden')),
                html: {
                    pass: document.getElementById('passenger-container').innerHTML,
                    facs: document.getElementById('facility-container').innerHTML,
                    chrono: document.getElementById('chrono-container').innerHTML,
                    fin: document.getElementById('fin-body').innerHTML,
                    pipum: document.getElementById('pip-um-container').innerHTML,
                    bi: document.getElementById('bi-container').innerHTML,
                    docs: document.getElementById('doc-body').innerHTML,
                    lit: document.getElementById('lit-body').innerHTML,
                    liens: document.getElementById('lien-container').innerHTML,
                    notes: document.getElementById('note-body').innerHTML,
                    tasks: document.getElementById('task-body').innerHTML,
                    police: document.getElementById('pane-police').innerHTML
                },
                inputs: Array.from(document.querySelectorAll('[contenteditable="true"]')).map(el => el.innerHTML),
                sels: Array.from(document.querySelectorAll('select')).map(el => el.value)
            };
        }
        // Applies a content payload (from buildCaseContentPayload / server) into
        // a DOM subtree. root defaults to `document` for loading a case into
        // the real live editor; pass a detached clone of #capture-area to
        // render a READ-ONLY preview of someone else's case without ever
        // touching the current user's own in-progress work (see
        // openMonitorCase() under Monitoring).
        function applyCaseContentToDOM(content, root) {
            root = root || document;
            if (!content) return;
            const $ = (id) => root.querySelector('#' + id);
            $('passenger-container').innerHTML = (content.html && content.html.pass) || '';
            $('facility-container').innerHTML = (content.html && content.html.facs) || '';
            $('chrono-container').innerHTML = (content.html && content.html.chrono) || '';
            $('fin-body').innerHTML = (content.html && content.html.fin) || '';
            $('pip-um-container').innerHTML = (content.html && content.html.pipum) || '';
            $('bi-container').innerHTML = (content.html && content.html.bi) || '';
            $('doc-body').innerHTML = (content.html && content.html.docs) || '';
            $('lit-body').innerHTML = (content.html && content.html.lit) || '';
            $('lien-container').innerHTML = (content.html && content.html.liens) || '';
            $('note-body').innerHTML = (content.html && content.html.notes) || '';
            $('task-body').innerHTML = (content.html && content.html.tasks) || '';
            if (content.html && content.html.police) $('pane-police').innerHTML = content.html.police;

            const edits = root.querySelectorAll('[contenteditable="true"]');
            (content.inputs || []).forEach((v, i) => { if (edits[i]) edits[i].innerHTML = v; });
            const selects = root.querySelectorAll('select');
            (content.sels || []).forEach((v, i) => { if (selects[i]) selects[i].value = v; });

            const mainType = $('main-case-type'), mainOther = $('main-case-other'), mainRevert = $('main-revert');
            if (content.caseTypeOtherVisible && mainType && mainOther) {
                mainType.classList.add('hidden');
                mainOther.classList.remove('hidden');
                mainOther.innerHTML = content.caseTypeOther || '';
                if (mainRevert) mainRevert.style.display = 'inline-block';
            } else if (content.caseType && mainType) {
                mainType.value = content.caseType;
            }
            if (root === document) {
                if (typeof updateTotals === 'function') updateTotals();
                toggleOwnerExtra();
                toggleDriverInsuredExtra();
            }
        }
        // Walks a (possibly detached) capture-area tree and produces a
        // read-only label:value HTML summary — same extraction approach as
        // downloadPDF()'s card walking, reused here for the Monitoring
        // "view latest saved case" preview so nothing needs a second parallel
        // rendering implementation.
        function extractReadableSections(root) {
            let html = '';
            root.querySelectorAll('.pdf-card').forEach(card => {
                const header = card.querySelector('.section-head, h3');
                if (!header) return;
                let sectionContent = '';
                card.querySelectorAll('[contenteditable="true"], select').forEach(input => {
                    const val = input.tagName === 'SELECT' ? input.value : input.innerText.trim();
                    if (val) {
                        let labelText = 'Detail';
                        if (input.previousElementSibling && input.previousElementSibling.tagName === 'LABEL') labelText = input.previousElementSibling.innerText;
                        else if (input.closest('div') && input.closest('div').querySelector('label')) labelText = input.closest('div').querySelector('label').innerText;
                        sectionContent += `<div style="margin-bottom:8px;"><div style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;">${labelText}</div><div style="font-size:12px;font-weight:600;color:#0f2148;">${val}</div></div>`;
                    }
                });
                if (sectionContent) {
                    html += `<div style="margin-bottom:16px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                        <div style="background:#0f2148;color:#f97316;font-size:10px;font-weight:800;padding:7px 12px;text-transform:uppercase;">${header.innerText}</div>
                        <div style="padding:12px 14px;">${sectionContent}</div>
                    </div>`;
                }
            });
            return html || '<p style="font-size:12px;color:#94a3b8;">No fields have been filled in yet.</p>';
        }
        function hasCaseContent() {
            // Only a client name typed by the user counts as "real" case content.
            // case-id-field is auto-generated by the system on every page load/reset,
            // so it's never a reliable signal that the user has actually entered anything.
            const name = document.getElementById('client-name-field').innerText.trim();
            return !!name;
        }

        /* =========================================================
           IN-PROGRESS EDITOR PERSISTENCE (survives a page refresh)

           This is separate from both the server-side Case Repository
           and the autosave-to-draft mechanism (autoSaveProgress, which
           only fires every 60s and only once a client name exists). This
           persists whatever is currently sitting in the editor — typed or
           not yet named, finalized or not — under its own key, so an
           accidental refresh/reload never loses in-progress work. It is
           overwritten continuously while editing and cleared whenever the
           user explicitly starts fresh (Start a New Case), or when a case
           is auto-archived/reassigned via the inactivity prompt.
           ========================================================= */
        const CURRENT_DRAFT_KEY = 'LSH_CURRENT_EDITOR_DRAFT_V1';
        let _draftRestoredThisLoad = false; // ensures restoreCurrentEditorState() only auto-runs once per page load

        function persistCurrentEditorState() {
            if (!hasAuthorizedAccess()) return; // never persist a blanked/unauthorized DOM over a real draft
            try {
                const snapshot = {
                    currentCaseId,
                    currentCaseIsDraft,
                    caseType: document.getElementById('main-case-type') ? document.getElementById('main-case-type').value : null,
                    caseTypeOther: document.getElementById('main-case-other') ? document.getElementById('main-case-other').innerHTML : '',
                    caseTypeOtherVisible: !!(document.getElementById('main-case-other') && !document.getElementById('main-case-other').classList.contains('hidden')),
                    phase: document.getElementById('display-phase') ? document.getElementById('display-phase').innerText : 'INTAKE',
                    html: {
                        pass: document.getElementById('passenger-container').innerHTML,
                        facs: document.getElementById('facility-container').innerHTML,
                        chrono: document.getElementById('chrono-container').innerHTML,
                        fin: document.getElementById('fin-body').innerHTML,
                        pipum: document.getElementById('pip-um-container').innerHTML,
                        bi: document.getElementById('bi-container').innerHTML,
                        docs: document.getElementById('doc-body').innerHTML,
                        lit: document.getElementById('lit-body').innerHTML,
                        liens: document.getElementById('lien-container').innerHTML,
                        notes: document.getElementById('note-body').innerHTML,
                        tasks: document.getElementById('task-body').innerHTML,
                        police: document.getElementById('pane-police').innerHTML
                    },
                    inputs: Array.from(document.querySelectorAll('[contenteditable="true"]')).map(el => el.innerHTML),
                    sels: Array.from(document.querySelectorAll('select')).map(el => el.value),
                    currentCaseCanEdit,
                    caseIdFieldText: document.getElementById('case-id-field') ? document.getElementById('case-id-field').innerText : '',
                    savedAt: new Date().toISOString()
                };
                localStorage.setItem(CURRENT_DRAFT_KEY, JSON.stringify(snapshot));
            } catch (e) { console.warn('Could not persist in-progress case:', e); }
        }

        let _persistDebounceTimer = null;
        function schedulePersistCurrentEditorState() {
            clearTimeout(_persistDebounceTimer);
            _persistDebounceTimer = setTimeout(persistCurrentEditorState, 500);
        }

        function clearPersistedEditorState() {
            try { localStorage.removeItem(CURRENT_DRAFT_KEY); } catch (e) {}
        }

        // Wires up listeners that keep CURRENT_DRAFT_KEY in sync with
        // whatever is currently in the editor. Uses a MutationObserver (in
        // addition to input/change) so dynamically added/removed rows,
        // cards, and document uploads are captured too, not just typing.
        function initEditorPersistence() {
            const root = document.getElementById('capture-area');
            if (!root) return;
            root.addEventListener('input', schedulePersistCurrentEditorState);
            root.addEventListener('change', schedulePersistCurrentEditorState);
            const observer = new MutationObserver(schedulePersistCurrentEditorState);
            observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'value'] });
        }

        // Restores whatever was last persisted. Only called once per page
        // load, right after we've confirmed the session is authorized, so
        // it never fires while the editor is being kept blank for a
        // logged-out/locked-out viewer.
        function restoreCurrentEditorState() {
            if (!hasAuthorizedAccess()) return false;
            let raw;
            try { raw = localStorage.getItem(CURRENT_DRAFT_KEY); } catch (e) { return false; }
            if (!raw) return false;
            let data;
            try { data = JSON.parse(raw); } catch (e) { return false; }
            if (!data) return false;
            try {
                document.getElementById('passenger-container').innerHTML = (data.html && data.html.pass) || '';
                document.getElementById('facility-container').innerHTML = (data.html && data.html.facs) || '';
                document.getElementById('chrono-container').innerHTML = (data.html && data.html.chrono) || '';
                document.getElementById('fin-body').innerHTML = (data.html && data.html.fin) || '';
                document.getElementById('pip-um-container').innerHTML = (data.html && data.html.pipum) || '';
                document.getElementById('bi-container').innerHTML = (data.html && data.html.bi) || '';
                document.getElementById('doc-body').innerHTML = (data.html && data.html.docs) || '';
                document.getElementById('lit-body').innerHTML = (data.html && data.html.lit) || '';
                document.getElementById('lien-container').innerHTML = (data.html && data.html.liens) || '';
                document.getElementById('note-body').innerHTML = (data.html && data.html.notes) || '';
                document.getElementById('task-body').innerHTML = (data.html && data.html.tasks) || '';
                if (data.html && data.html.police) document.getElementById('pane-police').innerHTML = data.html.police;

                const edits = document.querySelectorAll('[contenteditable="true"]');
                (data.inputs || []).forEach((v, i) => { if (edits[i]) edits[i].innerHTML = v; });
                const selects = document.querySelectorAll('select');
                (data.sels || []).forEach((v, i) => { if (selects[i]) selects[i].value = v; });

                if (data.caseTypeOtherVisible && document.getElementById('main-case-type') && document.getElementById('main-case-other')) {
                    document.getElementById('main-case-type').classList.add('hidden');
                    document.getElementById('main-case-other').classList.remove('hidden');
                    document.getElementById('main-case-other').innerHTML = data.caseTypeOther || '';
                    if (document.getElementById('main-revert')) document.getElementById('main-revert').style.display = 'inline-block';
                } else if (data.caseType && document.getElementById('main-case-type')) {
                    document.getElementById('main-case-type').value = data.caseType;
                }

                currentCaseId = (typeof data.currentCaseId === 'number') ? data.currentCaseId : null;
                currentCaseIsDraft = !!data.currentCaseIsDraft;
                currentCaseCanEdit = (typeof data.currentCaseCanEdit === 'boolean') ? data.currentCaseCanEdit : true;

                if (currentCaseId !== null && !currentCaseIsDraft && data.caseIdFieldText) {
                    document.getElementById('case-id-field').innerText = data.caseIdFieldText;
                } else {
                    generateCaseId();
                }
                if (data.phase) updatePhaseDisplay(data.phase);

                if (typeof updateTotals === 'function') updateTotals();
                toggleOwnerExtra();
                toggleDriverInsuredExtra();
                return true;
            } catch (e) {
                console.warn('Could not restore in-progress case:', e);
                return false;
            }
        }

        /* ---------- New Case ---------- */
        function newCase() {
            if (hasCaseContent() && !confirm('Start a new case? Any unsaved progress on this case will be lost.')) return;
            blankCaseEditorContent(); // wipes all case fields and sets currentCaseId = null
            clearPersistedEditorState(); // don't let a refresh bring back the case we just discarded
            currentCaseIsDraft = false;
            revertOther('main-case-type', 'main-case-other', 'main-revert'); // reset case type back to default
            updatePhaseDisplay('INTAKE');
            // Not saved yet, so no permanent number is consumed — this just
            // shows a fresh live preview based on how many cases are actually
            // saved so far.
            generateCaseId();
            showTab('profile');
            renderRepo();
        }

        /* ---------- Save Case (permanent — assigns the real Case ID) ----------
           If this case has never been permanently saved before (a brand-new
           case, or a draft opened via "Archive Case (Save as Draft)"), a real
           Case ID is minted server-side right now. If the case was already
           finalized, its existing Case ID is kept and this just re-saves the
           latest content. Blocked client-side (and enforced server-side) for
           anyone viewing a foreign case who isn't its owner or an Admin. */
        async function saveCase() {
            if (currentCaseId !== null && !currentCaseCanEdit) {
                showToast('You can only view this case — only its owner or an Admin can modify it.', 'error');
                return;
            }
            const content = buildCaseContentPayload();
            const clientName = (document.getElementById('client-name-field').innerText.split('\n')[0] || 'Unnamed Client').trim();
            const phase = document.getElementById('display-phase').innerText;
            const medTotal = document.getElementById('med-total') ? document.getElementById('med-total').innerText : '';
            try {
                const res = await fetch('/api/case-repository', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        id: currentCaseId, content, clientName, phase, medTotal,
                        isDraft: false, finalize: true, typeCode: currentTypeCode()
                    })
                });
                const data = await res.json();
                if (!data || !data.success) { alert('Could not save: ' + ((data && data.error) || 'Unknown error.')); return; }
                const wasAlreadyFinal = (currentCaseId !== null && !currentCaseIsDraft);
                currentCaseId = data.id;
                currentCaseIsDraft = false;
                currentCaseCanEdit = true;
                document.getElementById('case-id-field').innerText = data.caseId;
                persistCurrentEditorState();
                refreshRepoCache();
                alert(wasAlreadyFinal ? 'Case saved.' : `Case saved. Case ID ${data.caseId} has been permanently assigned.`);
            } catch (e) {
                alert('Network error while saving. Check your connection and try again.');
            }
        }

        /* ---------- Archive Case (Save as Draft) ----------
           Saves current progress WITHOUT assigning a permanent Case ID. Open
           this draft later and click "Save Case" to finalize it and get its
           real, permanent Case ID. If the currently loaded case is ALREADY
           finalized, archiving creates a separate NEW draft rather than
           downgrading the finalized case back into a draft. */
        async function archiveCaseAsDraft() {
            if (currentCaseId !== null && !currentCaseCanEdit) {
                showToast('You can only view this case — only its owner or an Admin can modify it.', 'error');
                return;
            }
            const content = buildCaseContentPayload();
            const clientName = (document.getElementById('client-name-field').innerText.split('\n')[0] || 'Unnamed Client').trim();
            const phase = document.getElementById('display-phase').innerText;
            const medTotal = document.getElementById('med-total') ? document.getElementById('med-total').innerText : '';
            const targetId = (currentCaseId !== null && currentCaseIsDraft) ? currentCaseId : null;
            try {
                const res = await fetch('/api/case-repository', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ id: targetId, content, clientName, phase, medTotal, isDraft: true })
                });
                const data = await res.json();
                if (!data || !data.success) { alert('Could not archive: ' + ((data && data.error) || 'Unknown error.')); return; }
                currentCaseId = data.id;
                currentCaseIsDraft = true;
                currentCaseCanEdit = true;
                generateCaseId();
                persistCurrentEditorState();
                refreshRepoCache();
                alert('Case archived as a draft. No Case ID has been assigned yet — open this draft and use "Save Case" whenever you\'re ready to finalize it.');
            } catch (e) {
                alert('Network error while archiving. Check your connection and try again.');
            }
        }
        async function updateCase() {
            if (currentCaseId === null) {
                alert("No saved case is currently open to update. Load a case from the repository first, or use \"Archive Case (Save as Draft)\" / \"Save Case\" to save this as a new one.");
                return;
            }
            if (!currentCaseCanEdit) {
                showToast('You can only view this case — only its owner or an Admin can modify it.', 'error');
                return;
            }
            const content = buildCaseContentPayload();
            const clientName = (document.getElementById('client-name-field').innerText.split('\n')[0] || 'Unnamed Client').trim();
            const phase = document.getElementById('display-phase').innerText;
            const medTotal = document.getElementById('med-total') ? document.getElementById('med-total').innerText : '';
            try {
                const res = await fetch('/api/case-repository', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    // No isDraft/finalize here — the server keeps this case's
                    // existing draft/final status exactly as it was.
                    body: JSON.stringify({ id: currentCaseId, content, clientName, phase, medTotal })
                });
                const data = await res.json();
                if (!data || !data.success) { alert('Could not update: ' + ((data && data.error) || 'Unknown error.')); return; }
                persistCurrentEditorState();
                refreshRepoCache();
                alert("Saved case updated.");
            } catch (e) {
                alert('Network error while updating. Check your connection and try again.');
            }
        }

        /* ---------- Autosave (background, silent) ----------
           Runs on an interval and also right before an inactivity auto-archive.
           Saves to the server repository: creates a new draft if this case has
           never been saved before, or updates the existing row in place
           otherwise — WITHOUT touching its current draft/final status (an
           already-finalized case stays finalized; autosave never downgrades
           it back to a draft). Silent by design — failures don't interrupt
           the user, since this runs in the background. */
        const AUTOSAVE_INTERVAL_MS = 60 * 1000; // every 60 seconds
        async function autoSaveProgress(reason) {
            if (!hasCaseContent()) return false; // nothing meaningful to save yet
            if (currentCaseId !== null && !currentCaseCanEdit) return false; // viewing a foreign case — never autosave over it
            const content = buildCaseContentPayload();
            const clientName = (document.getElementById('client-name-field').innerText.split('\n')[0] || 'Unnamed Client').trim();
            const phase = document.getElementById('display-phase').innerText;
            const medTotal = document.getElementById('med-total') ? document.getElementById('med-total').innerText : '';
            try {
                const res = await fetch('/api/case-repository', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(currentCaseId !== null
                        ? { id: currentCaseId, content, clientName, phase, medTotal }
                        : { content, clientName, phase, medTotal, isDraft: true })
                });
                const data = await res.json();
                if (!data || !data.success) return false;
                currentCaseId = data.id;
                if (typeof data.isDraft === 'boolean') currentCaseIsDraft = data.isDraft;
                persistCurrentEditorState();
                flashAutoSaveIndicator();
                refreshRepoCache();
                return true;
            } catch (e) {
                return false; // silent — autosave failures shouldn't interrupt the user
            }
        }
        function flashAutoSaveIndicator() {
            const el = document.getElementById('autosave-indicator');
            if (!el) return;
            const stamp = new Date().toLocaleTimeString();
            el.innerText = `Autosaved as draft · ${stamp}`;
            el.style.opacity = '1';
            clearTimeout(flashAutoSaveIndicator._t);
            flashAutoSaveIndicator._t = setTimeout(() => { el.style.opacity = '0.55'; }, 4000);
        }
        setInterval(() => autoSaveProgress('interval'), AUTOSAVE_INTERVAL_MS);

        // In-memory cache of the case list (metadata only, no field content —
        // content is fetched separately per-case via loadCase()/openMonitorCase()
        // only when actually needed, since it can be large). Refreshed after
        // every save/update/delete and on a light background poll so users
        // passively see other people's changes to the shared repository.
        let _repoCache = [];
        let _activeUsersCache = []; // last-fetched Approved/Suspended users — feeds the Ping recipient dropdown
        async function refreshRepoCache() {
            if (!hasAuthorizedAccess()) { _repoCache = []; renderRepo(); renderAllCasesModal(); return; }
            try {
                const res = await fetch('/api/case-repository', { credentials: 'include' });
                const data = await res.json();
                if (data && data.success) _repoCache = data.cases || [];
            } catch (e) { /* keep showing the last-known cache on a transient network error */ }
            renderRepo();
            renderAllCasesModal();
            renderCaseLogs();
        }
        setInterval(refreshRepoCache, 15000); // passive background refresh so shared changes show up without a manual reload

        function renderRepo() {
            const list = document.getElementById('repo-list');
            const countNote = document.getElementById('repo-count-note');
            if (!hasAuthorizedAccess()) {
                if (list) { list.innerHTML = ''; list.dataset.blanked = 'true'; }
                if (countNote) countNote.innerText = '';
                return;
            }
            if (list) delete list.dataset.blanked;
            const searchEl = document.getElementById('repo-search');
            const query = (searchEl ? searchEl.value : '').trim().toLowerCase();
            let repo = _repoCache;
            if (query) repo = repo.filter(item => (item.clientName || '').toLowerCase().includes(query));

            const shown = repo.slice(0, 5);
            list.innerHTML = shown.length ? shown.map(item => repoCardHTML(item)).join('') : '<p style="font-size:11px;color:#64748b;">No matching cases.</p>';

            if (repo.length > 5) countNote.innerText = `Showing 5 of ${repo.length} matching cases.`;
            else countNote.innerText = '';
        }
        function repoCardHTML(item) {
            const badges = (!item.isDraft ? '' : ' <span style="font-size:9px;font-weight:800;color:#f97316;border:1px solid #f97316;border-radius:4px;padding:1px 4px;margin-left:4px;vertical-align:middle;">DRAFT</span>')
                + (item.canEdit ? '' : ' <span style="font-size:9px;font-weight:800;color:#94a3b8;border:1px solid #334155;border-radius:4px;padding:1px 4px;margin-left:4px;vertical-align:middle;">VIEW ONLY</span>');
            return `<div onclick="loadCase(${item.id})" class="repo-card group p-3 rounded-lg">
                <span class="repo-name block font-bold text-xs mb-1">${item.clientName || 'Unnamed Client'}${badges}</span>
                <span style="font-size:9px;color:#64748b;">By ${item.submittedBy || item.ownerUsername}</span>
                ${item.canEdit ? `<button onclick="deleteCase(${item.id}, event)" class="absolute top-1 right-2 text-slate-500">×</button>` : ''}
            </div>`;
        }
        async function loadCase(id) {
            if (!hasAuthorizedAccess()) return; // blocked: not logged in, or site is locked
            try {
                const res = await fetch('/api/case-repository?id=' + encodeURIComponent(id), { credentials: 'include' });
                const data = await res.json();
                if (!data || !data.success) { showToast((data && data.error) || 'Could not load that case.', 'error'); return; }
                const c = data.case;
                applyCaseContentToDOM(c.content, document);
                currentCaseId = c.id;
                currentCaseIsDraft = !!c.isDraft;
                currentCaseCanEdit = !!c.canEdit;
                if (!c.isDraft && c.caseId) {
                    document.getElementById('case-id-field').innerText = c.caseId;
                } else {
                    generateCaseId();
                }
                if (c.phase) updatePhaseDisplay(c.phase);
                updateTotals(); toggleOwnerExtra(); toggleDriverInsuredExtra(); showTab('profile');
                closeAllCasesModal();
                if (!c.canEdit) showToast('Viewing ' + c.ownerUsername + '\u2019s case — read-only (not the owner or an Admin).', 'info');
                persistCurrentEditorState();
            } catch (e) {
                showToast('Network error loading that case.', 'error');
            }
        }
        async function deleteCase(id, e) {
            e.stopPropagation();
            if (!confirm('Delete Case?')) return;
            try {
                const res = await fetch('/api/case-repository?id=' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' });
                const data = await res.json();
                if (!data || !data.success) { showToast((data && data.error) || 'Could not delete that case.', 'error'); return; }
                if (currentCaseId === id) { currentCaseId = null; currentCaseIsDraft = false; currentCaseCanEdit = true; }
                refreshRepoCache();
            } catch (e2) {
                showToast('Network error deleting that case.', 'error');
            }
        }

        function openAllCasesModal() {
            document.getElementById('all-cases-search').value = '';
            renderAllCasesModal();
            document.getElementById('all-cases-modal').classList.add('open');
        }
        function closeAllCasesModal() { document.getElementById('all-cases-modal').classList.remove('open'); }
        // Draft/Finalized separator + sort: Finalized cases (visible to everyone)
        // listed first, sorted by most recently updated; Drafts (visible only
        // to their owner or an Admin — already filtered server-side into
        // _repoCache) grouped separately below, also most-recent-first.
        function renderAllCasesModal() {
            const list = document.getElementById('all-cases-list');
            if (!hasAuthorizedAccess()) { if (list) list.innerHTML = ''; return; }
            const query = document.getElementById('all-cases-search').value.trim().toLowerCase();
            let repo = _repoCache;
            if (query) repo = repo.filter(item => (item.clientName || '').toLowerCase().includes(query));
            if (!repo.length) { list.innerHTML = '<p style="font-size:12px;color:#94a3b8;">No matching cases.</p>'; return; }

            const byUpdated = (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt);
            const finalized = repo.filter(i => !i.isDraft).sort(byUpdated);
            const drafts = repo.filter(i => i.isDraft).sort(byUpdated);

            let html = '<div class="group-heading">Finalized Cases &middot; ' + finalized.length + ' &middot; visible to everyone</div>';
            html += finalized.length ? finalized.map(allCasesRowHTML).join('') : '<p style="font-size:11px;color:#94a3b8;margin:4px 0 12px;">No finalized cases yet.</p>';

            html += '<div class="group-heading">Drafts &middot; ' + drafts.length + ' &middot; visible to owner &amp; Admins only</div>';
            html += drafts.length ? drafts.map(allCasesRowHTML).join('') : '<p style="font-size:11px;color:#94a3b8;margin:4px 0 12px;">No drafts visible to you.</p>';

            list.innerHTML = html;
        }
        function allCasesRowHTML(item) {
            const viewOnly = item.canEdit ? '' : ' <span style="font-size:9px;font-weight:800;color:#94a3b8;border:1px solid #334155;border-radius:4px;padding:1px 4px;margin-left:4px;">VIEW ONLY</span>';
            return `<div class="reg-row" style="cursor:pointer;" onclick="loadCase(${item.id})">
                <div class="reg-info">
                    <b>${item.clientName || 'Unnamed Client'}${viewOnly}</b>
                    <div class="reg-meta">${item.caseId || 'DRAFT — no Case ID yet'} ${item.phase ? '&middot; ' + item.phase : ''} &middot; By ${item.submittedBy || item.ownerUsername} &middot; updated ${new Date(item.updatedAt).toLocaleString()}</div>
                </div>
                ${item.canEdit ? `<button class="mini-btn reject" onclick="deleteCase(${item.id}, event)">Delete</button>` : ''}
            </div>`;
        }
        // Export now downloads the currently visible case METADATA (name,
        // Case ID, phase, owner, timestamps) as a JSON reference list — full
        // field content lives server-side per case and is fetched on demand
        // via loadCase(), so a bulk local export/import of full content no
        // longer applies now that the repository itself is the shared source
        // of truth. Import has been removed for the same reason: re-importing
        // raw JSON directly into a shared, permission-checked server
        // repository isn't a meaningful operation anymore.
        function exportRepo() {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([JSON.stringify(_repoCache, null, 2)], { type: 'application/json' }));
            a.download = 'LSH_Case_List.json';
            a.click();
        }

        /* ---------- PDF export ---------- */
        function downloadPDF(info) {
            info = info || {};
            const virtualPage = document.createElement('div');
            Object.assign(virtualPage.style, { padding: '46px', backgroundColor: '#ffffff', color: '#0f2148', fontFamily: "'IBM Plex Sans', Arial, sans-serif", lineHeight: '1.5' });

            const clientName = document.getElementById('client-name-field').innerText.trim() || "UNNAMED CLIENT";
            const phase = document.getElementById('display-phase').innerText;
            const caseId = document.getElementById('case-id-field').innerText.trim() || '—';
            const logoSrc = AGENCY_LOGO;

            // Person who originally submitted / created this case record.
            const subName = info.submittedBy || '—';
            const subBatch = info.submittedByBatch || '—';
            const subDate = info.submittedAt || '—';

            // Person producing THIS particular downloaded copy (may be a different person).
            const copyName = info.producedByName || '—';
            const copyBatch = info.producedByBatch || '—';
            const copyDate = info.producedAt || new Date().toLocaleString();

            // How many times this case's file has been downloaded, per the database record.
            const printSeq = (typeof info.printSequence === 'number') ? info.printSequence : 1;

            virtualPage.innerHTML = `
                <div style="display:flex; align-items:center; gap:14px; margin-bottom:18px;">
                    <img src="${logoSrc}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;border:2px solid #f97316;" />
                    <div>
                        <div style="font-family:'IBM Plex Mono','Courier New',monospace; font-size:9px; font-weight:800; letter-spacing:1.5px; color:#64748b; text-transform:uppercase;">Legal Support Help &middot; Training Interface</div>
                        <div style="font-family:'IBM Plex Mono','Courier New',monospace; font-size:9px; font-weight:900; letter-spacing:1.5px; color:#b91c1c; text-transform:uppercase;">Confidential — LSH Internal Record</div>
                    </div>
                </div>
                <div style="border-bottom: 4px solid #0f2148; margin-bottom: 24px; padding-bottom: 14px;">
                    <h1 style="margin:0; font-size: 26px; font-weight:800; text-transform: uppercase; letter-spacing:0.02em;">${clientName}</h1>
                    <div style="display: flex; justify-content: space-between; margin-top: 10px; font-family:'IBM Plex Mono','Courier New',monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing:0.04em;">
                        <span style="color: #f97316;">Case ID: ${caseId}</span>
                        <span style="color: #f97316;">Phase: ${phase}</span>
                        <span style="color: #64748b;">Printed: ${new Date().toLocaleString()}</span>
                        <span style="color: #b91c1c;">Print Sequence: #${printSeq}</span>
                    </div>
                    <div style="margin-top:14px; display:flex; gap:12px;">
                        <div style="flex:1; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; font-family:'IBM Plex Mono','Courier New',monospace; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:#0f2148;">
                            <div style="color:#94a3b8; font-size:8px; margin-bottom:5px;">Submitted By (Case Originator)</div>
                            <div>Name: ${subName}</div>
                            <div>Batch ID: ${subBatch}</div>
                            <div>Date of Submission: ${subDate}</div>
                        </div>
                        <div style="flex:1; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; font-family:'IBM Plex Mono','Courier New',monospace; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:#0f2148;">
                            <div style="color:#94a3b8; font-size:8px; margin-bottom:5px;">Copy Produced By</div>
                            <div>Name: ${copyName}</div>
                            <div>Batch ID: ${copyBatch}</div>
                            <div>Date &amp; Time Produced: ${copyDate}</div>
                        </div>
                    </div>
                </div>`;

            // Doc Hub is deliberately excluded from this generic per-card walk
            // (its rows are file attachments, not simple label:value fields —
            // see the dedicated Doc Hub section built below instead, which is
            // appended LAST, after every other card, per the requested PDF
            // ordering).
            //
            // Every field is always included, even if blank (shown as
            // "None") — this section used to skip empty fields entirely.
            // findFieldLabel() also fixes table-based sections (Chronology,
            // Treatment Matrix, Litigation, Finance, Notes, Tasks, Liens):
            // those cells have no <label> sibling, so they used to all fall
            // back to a generic "Detail" — now each cell's label comes from
            // its column's real <thead> header instead.
            function findFieldLabel(input) {
                const td = input.closest('td');
                if (td) {
                    const tr = td.closest('tr');
                    const table = td.closest('table');
                    if (tr && table) {
                        const cellIndex = Array.prototype.indexOf.call(tr.children, td);
                        const headRow = table.querySelector('thead tr');
                        if (headRow && headRow.children[cellIndex]) {
                            const label = headRow.children[cellIndex].innerText.trim();
                            if (label) return label;
                        }
                    }
                    return 'Detail';
                }
                if (input.previousElementSibling && input.previousElementSibling.tagName === 'LABEL') {
                    return input.previousElementSibling.innerText;
                }
                if (input.closest('div') && input.closest('div').querySelector('label')) {
                    return input.closest('div').querySelector('label').innerText;
                }
                return 'Detail';
            }
            const cards = document.querySelectorAll('.pdf-card');
            cards.forEach(card => {
                if (card.closest('#pane-docs')) return;
                const header = card.querySelector('.section-head, h3');
                if (!header) return;
                let sectionContent = "";
                const inputs = card.querySelectorAll('[contenteditable="true"], select');
                inputs.forEach(input => {
                    const val = input.tagName === 'SELECT' ? input.value : input.innerText.trim();
                    const labelText = findFieldLabel(input);
                    const displayVal = val || 'None';
                    sectionContent += `<div style="margin-bottom: 11px; padding-bottom: 6px; border-bottom: 1px solid #f1f5f9; break-inside: avoid;">
                        <div style="font-family:'IBM Plex Mono','Courier New',monospace; font-size: 8px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing:0.04em;">${labelText}</div>
                        <div style="font-size: 12px; font-weight: 600; color: ${val ? '#0f2148' : '#94a3b8'}; margin-top:2px;${val ? '' : ' font-style:italic;'}">${displayVal}</div>
                    </div>`;
                });
                if (sectionContent) {
                    virtualPage.innerHTML += `<div style="margin-bottom: 26px; break-inside: avoid; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
                        <div style="background-color: #0f2148; color: #f97316; font-family:'IBM Plex Mono','Courier New',monospace; font-size: 11px; font-weight:800; padding: 9px 16px; text-transform: uppercase; letter-spacing:0.05em;">${header.innerText}</div>
                        <div style="padding: 16px 18px;">${sectionContent}</div>
                    </div>`;
                }
            });

            // Doc Hub — built as its own dedicated section instead of the
            // generic label:value walk above, since its content is category +
            // summary + an attached file, not a simple field list. Appended
            // LAST, after every other case-detail card, per the requested
            // ordering. Image attachments are embedded directly so they're
            // visible in the printed/downloaded PDF; non-image attachments
            // (e.g. PDFs, Word docs) can't be rasterized into a static page,
            // so those are referenced by filename instead.
            const docRows = document.querySelectorAll('#doc-body tr');
            let docHubContent = '';
            docRows.forEach(row => {
                const categoryEl = row.querySelector('td:first-child div');
                const category = categoryEl ? categoryEl.innerText.trim() : '';
                const summaryEl = row.querySelector('[contenteditable="true"]');
                const summary = summaryEl ? summaryEl.innerText.trim() : '';
                const linkEl = row.querySelector('.doc-attachment a');

                let attachmentHtml = '';
                if (linkEl) {
                    const href = linkEl.getAttribute('href') || '';
                    const filename = linkEl.getAttribute('download') || linkEl.innerText.trim();
                    if (/^data:image\//i.test(href)) {
                        attachmentHtml = `<div style="margin-top:8px;"><img src="${href}" style="max-width:100%;max-height:320px;border:1px solid #e2e8f0;border-radius:6px;" /></div>`;
                    } else {
                        attachmentHtml = `<div style="margin-top:6px;font-size:11px;font-weight:700;color:#2563eb;">📎 Attached file: ${filename}</div>`;
                    }
                } else {
                    attachmentHtml = `<div style="margin-top:6px;font-size:11px;font-style:italic;color:#94a3b8;">No attachment</div>`;
                }

                docHubContent += `<div style="margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #f1f5f9; break-inside: avoid;">
                    <div style="font-family:'IBM Plex Mono','Courier New',monospace; font-size: 9px; font-weight: 900; color: #9a3412; text-transform: uppercase; letter-spacing:0.05em;">${category || 'Uncategorized'}</div>
                    <div style="font-size: 12px; font-weight: 600; color: ${summary ? '#0f2148' : '#94a3b8'}; margin-top:4px;${summary ? '' : ' font-style:italic;'}">${summary || 'None'}</div>
                    ${attachmentHtml}
                </div>`;
            });
            if (docHubContent) {
                virtualPage.innerHTML += `<div style="margin-bottom: 26px; break-inside: avoid; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
                    <div style="background-color: #0f2148; color: #f97316; font-family:'IBM Plex Mono','Courier New',monospace; font-size: 11px; font-weight:800; padding: 9px 16px; text-transform: uppercase; letter-spacing:0.05em;">Documents</div>
                    <div style="padding: 16px 18px;">${docHubContent}</div>
                </div>`;
            }

            virtualPage.innerHTML += `
                <div style="margin-top:30px; padding-top:12px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; font-family:'IBM Plex Mono','Courier New',monospace; font-size:8.5px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.04em;">
                    <span>Generated via LSH Training Interface</span>
                    <span>For internal training use only</span>
                </div>`;

            const exportOptions = { margin: [0.5, 0.5], filename: `LSH_SUMMARY_${clientName.replace(/\s+/g, '_')}.pdf`, image: { type: 'jpeg', quality: 1 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } };
            html2pdf().set(exportOptions).from(virtualPage).save().then(() => virtualPage.remove());
        }

        /* =========================================================
           LIVE CLOCK + TIMEZONE
           ========================================================= */
        function populateTimezones() {
            const select = document.getElementById('tz-select');
            let zones = [];
            try {
                if (typeof Intl.supportedValuesOf === 'function') {
                    zones = Intl.supportedValuesOf('timeZone');
                }
            } catch (e) { zones = []; }

            if (!zones.length) return; // keep the built-in fallback list already in the HTML

            const preferred = 'Asia/Manila';
            const groups = {};
            zones.forEach(z => {
                const region = z.includes('/') ? z.split('/')[0] : 'Other';
                if (!groups[region]) groups[region] = [];
                groups[region].push(z);
            });

            select.innerHTML = '';
            select.appendChild(new Option('UTC', 'UTC'));
            Object.keys(groups).sort().forEach(region => {
                const og = document.createElement('optgroup');
                og.label = region.replace(/_/g, ' ');
                groups[region].sort().forEach(z => {
                    const label = z.split('/').slice(1).join(' / ').replace(/_/g, ' ') || z;
                    og.appendChild(new Option(label, z));
                });
                select.appendChild(og);
            });
            select.value = preferred;
        }

        function refreshClock() {
            const tz = document.getElementById('tz-select').value;
            const now = new Date();
            const formatted = new Intl.DateTimeFormat('en-US', {
                year: 'numeric', month: 'short', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                timeZone: tz, hour12: true
            }).format(now);
            document.getElementById('live-clock').innerText = formatted;
        }
        setInterval(refreshClock, 1000);

        /* =========================================================
           AUTHENTICATION — Login / Register / Session

           NOTE: this section previously contained a fully client-side,
           localStorage-backed authentication path (getUsers/saveUsers/
           authenticate(), plus a hardcoded Master Account username AND
           PLAINTEXT PASSWORD shipped straight to the browser) that was
           already dead code — fully superseded by the real /api/login
           and /api/register calls further down this file. It has been
           removed entirely, since shipping the Master Account's
           credentials in client-side JS was a real security exposure
           regardless of whether that code path was ever executed.

           What remains here (getSession/setSession/clearSession, view
           switching, password validation) is genuinely used by the real
           API-backed login/registration flow below.
           ========================================================= */
        function getSession() {
            try {
                let raw = sessionStorage.getItem(SESSION_KEY);
                // One-time migration from the old localStorage session key.
                if (raw === null) {
                    raw = localStorage.getItem(SESSION_KEY);
                    if (raw !== null) {
                        sessionStorage.setItem(SESSION_KEY, raw);
                        localStorage.removeItem(SESSION_KEY);
                    }
                }
                return JSON.parse(raw || 'null');
            } catch (e) { return null; }
        }
        function setSession(user) {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                fullName: user.fullName,
                batchId: user.batchId,
                userType: user.userType,
                username: user.username
            }));
        }
        function clearSession() {
            sessionStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(SESSION_KEY);
        }

        let currentPortalTab = 'Trainee';
        function showLoginView() {
            document.getElementById('auth-login-view').classList.remove('hidden');
            document.getElementById('auth-register-view').classList.add('hidden');
        }
        function showRegisterView() {
            document.getElementById('auth-login-view').classList.add('hidden');
            document.getElementById('auth-register-view').classList.remove('hidden');
            document.getElementById('reg-usertype').value = currentPortalTab;
            onRegUserTypeChange();
        }
        const REG_PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{8,}$/;
        function validateRegPassword(password) {
            if (!password || password.length < 8) {
                return 'Password must be at least 8 characters long.';
            }
            if (!REG_PASSWORD_RE.test(password)) {
                return 'Password must contain only letters and numbers (no symbols or spaces), with at least one letter and one number.';
            }
            return null;
        }

        function onRegUserTypeChange() {
            const type = document.getElementById('reg-usertype').value;
            const batchField = document.getElementById('reg-batchid');
            const trainingWrap = document.getElementById('reg-training-date-wrap');
            if (batchField) {
                batchField.value = '';
                batchField.placeholder = 'Batch ID will be assigned upon the approval of your registration.';
                batchField.disabled = true;
            }
            if (trainingWrap) trainingWrap.style.display = type === 'Trainee' ? '' : 'none';
        }

        function applySessionUI() {
            const session = getSession();
            const gate = document.getElementById('auth-gate');
            const footer = document.getElementById('session-footer');
            const portalTitle = document.getElementById('portal-title');

            if (!session) {
                gate.classList.add('open');
                gate.style.setProperty('display', 'flex', 'important');
                footer.innerHTML = '';
                portalTitle.innerText = 'LEGAL SUPPORT HELP TRAINING INTERFACE';
                blankCaseEditorContent();
                renderRepo();
                return;
            }
            gate.classList.remove('open');
            gate.style.removeProperty('display');
            portalTitle.innerText = `LEGAL SUPPORT HELP TRAINING INTERFACE - ${session.userType.toUpperCase()} PORTAL`;

            // Restore in-progress editor content exactly once per page load
            // (covers both "logged in already, hit refresh" and "just logged
            // back in after being logged out mid-edit"). Guarded so later,
            // unrelated calls to applySessionUI() during the same page life
            // (e.g. after opening/closing Master Control) never stomp on
            // whatever the user has typed since.
            if (!_draftRestoredThisLoad) {
                _draftRestoredThisLoad = true;
                restoreCurrentEditorState();
            }
            refreshRepoCache(); // don't wait for the next background poll — show the shared repository immediately on login

            if (session.userType === 'Admin') {
                footer.innerHTML = `
                    <div class="session-user-tag">Signed in as: <b>${session.fullName || session.username}</b><br>Batch ID: <b>${session.batchId}</b></div>
                    <button class="session-btn active-admin" onclick="openAdminDashboard()">⇄ Master Control</button>
                    <button class="session-btn logout-btn" onclick="logoutSession()">Log Out</button>
                `;
            } else {
                footer.innerHTML = `
                    <div class="session-user-tag">Signed in as: <b>${session.fullName || session.username}</b><br>Batch ID: <b>${session.batchId}</b></div>
                    <button class="session-btn logout-btn" onclick="logoutSession()">Log Out</button>
                `;
            }
        }

        function logoutSession(reason) {
            stopHeartbeat();
            stopIdleTracking();
            fetch('/api/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
            clearSession();
            exitMasterControl();
            applySessionUI();
            if (reason) showToast(reason, 'info');
        }

        function handleSessionExpired(message) {
            stopHeartbeat();
            stopIdleTracking();
            fetch('/api/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
            clearSession();
            exitMasterControl();
            applySessionUI();
            if (message) showToast(message, 'info');
        }

        /* =========================================================
           MASTER CONTROL — full-page admin view + portal toggle
           ========================================================= */
        function openAdminDashboard() {
            const session = getSession();
            if (!session || session.userType !== 'Admin') return;
            document.getElementById('admin-dash-session').innerText = session.fullName + ' \u00B7 Batch ' + session.batchId;
            document.getElementById('admin-stat-cases').innerText = _repoCache.length;
            document.getElementById('admin-stat-name').innerText = (document.getElementById('client-name-field').innerText.trim() || '\u2014');
            document.getElementById('admin-stat-phase').innerText = 'Phase: ' + document.getElementById('display-phase').innerText;
            document.getElementById('master-control-page').classList.add('open');
            document.body.classList.add('mc-active');
            showAdminDashTab('overview');
            refreshUsersAndRegistrations();
            refreshMonitoring();
            refreshSiteState();
        }
        function exitMasterControl() {
            document.getElementById('master-control-page').classList.remove('open');
            document.body.classList.remove('mc-active');
        }
        // Kept for backward compatibility with older markup/links.
        function closeAdminDashboard() { exitMasterControl(); }

        const MC_TABS = ['overview', 'registrations', 'users', 'monitoring', 'case-logs', 'announce', 'access'];
        function showAdminDashTab(tab) {
            document.querySelectorAll('.mc-tab').forEach((t, i) => t.classList.toggle('active', MC_TABS[i] === tab));
            document.querySelectorAll('.mc-pane').forEach(p => p.classList.remove('active'));
            const pane = document.getElementById('admin-dash-' + tab);
            if (pane) pane.classList.add('active');
            if (tab === 'registrations' || tab === 'users' || tab === 'overview' || tab === 'announce') refreshUsersAndRegistrations();
            if (tab === 'monitoring') refreshMonitoring();
            if (tab === 'case-logs') refreshCaseLogs();
        }

        /* =========================================================
           BATCH ID PARSING — B<DDMMYYYY>-LSH<TYPE>-<XXX>
           Used to group/sort the Users tab: Admin/Trainee segregation,
           Trainees further grouped by batch date, both sorted by <XXX>.
           ========================================================= */
        function parseBatchId(batchId) {
            if (!batchId) return null;
            const m = /^B(\d{8})-LSH(ADMIN|TRAINEE)-(\d{3,})$/.exec(batchId);
            if (!m) return null;
            return { dateStr: m[1], type: m[2], seq: parseInt(m[3], 10) };
        }

        /* =========================================================
           USERS + REGISTRATIONS — backed by /api/users (Cloudflare D1)
           Registrations tab: pending only. Users tab: approved only —
           revocation is now a permanent delete (see /api/revoke-user),
           so a 'Revoked' status row should never actually appear here;
           deleted accounts are simply gone from this list entirely.
           Users tab segregates Admin/Trainee, groups Trainees by Batch
           ID, and sorts everything by <XXX> sequence.
           ========================================================= */
        function refreshUsersAndRegistrations() {
            fetch('/api/users', { credentials: 'include' })
                .then(r => r.json())
                .then(users => {
                    users = Array.isArray(users) ? users : [];
                    users.sort((a, b) => new Date(a.created_at || a.createdAt || 0) - new Date(b.created_at || b.createdAt || 0));

                    const pending = users.filter(u => (u.status || 'Pending') === 'Pending');
                    // 'active' here means "shows up in the main Users list",
                    // which includes both fully Approved users and
                    // Temporarily Revoked (Suspended) ones — Suspended
                    // users must still be visible, with a Lift Revocation /
                    // Permanent Revocation choice, not disappear from the UI.
                    const active = users.filter(u => u.status === 'Approved' || u.status === 'Suspended');

                    document.getElementById('admin-stat-pending').innerText = pending.length;
                    const badge = document.getElementById('reg-pending-badge');
                    if (badge) { badge.innerText = pending.length > 0 ? ('(' + pending.length + ')') : ''; badge.style.color = pending.length > 0 ? 'var(--classified-red)' : 'inherit'; }

                    renderGroupedUserList('registrations-list', pending, true, 'No pending registrations.');
                    renderUsersList(active);
                    _activeUsersCache = active;
                    populatePingUserSelect();
                })
                .catch(err => console.error('Failed to load users:', err));
        }
        function renderGroupedUserList(containerId, list, isPending, emptyMsg) {
            const container = document.getElementById(containerId);
            if (!container) return;
            if (!list.length) { container.innerHTML = '<p style="font-size:12px;color:#94a3b8;">' + emptyMsg + '</p>'; return; }
            const byType = {};
            list.forEach(u => { const t = u.user_type || u.userType || 'Trainee'; (byType[t] = byType[t] || []).push(u); });
            let html = '';
            Object.keys(byType).sort().forEach(type => {
                html += '<div class="group-heading">' + type + 's \u00B7 ' + byType[type].length + '</div>';
                byType[type].forEach(u => { html += renderUserRow(u, isPending); });
            });
            container.innerHTML = html;
        }
        // Admin/Trainee segregation -> Trainees grouped by Batch ID -> both
        // sorted by <XXX> sequence number. Admins are a flat list, sorted by
        // <XXX>, with no batch-date grouping (per spec — admins don't have a
        // training start date to group by).
        function renderUsersList(list) {
            const container = document.getElementById('users-list');
            if (!container) return;
            if (!list.length) { container.innerHTML = '<p style="font-size:12px;color:#94a3b8;">No approved users yet.</p>'; return; }

            function seqOf(u) {
                const p = parseBatchId(u.batch_id || u.batchId);
                return p ? p.seq : Number.MAX_SAFE_INTEGER; // unparseable batch ids sort last, never crash
            }

            const admins = list.filter(u => (u.user_type || u.userType) === 'Admin').sort((a, b) => seqOf(a) - seqOf(b));
            const trainees = list.filter(u => (u.user_type || u.userType) === 'Trainee');

            let html = '<div class="group-heading">Admins &middot; ' + admins.length + '</div>';
            html += admins.length
                ? admins.map(u => renderUserRow(u, false)).join('')
                : '<p style="font-size:11px;color:#94a3b8;margin:4px 0 12px;">No approved admins.</p>';

            html += '<div class="group-heading">Trainees &middot; ' + trainees.length + '</div>';
            if (!trainees.length) {
                html += '<p style="font-size:11px;color:#94a3b8;margin:4px 0 12px;">No approved trainees.</p>';
            } else {
                const byBatchDate = {};
                trainees.forEach(u => {
                    const p = parseBatchId(u.batch_id || u.batchId);
                    const key = p ? ('B' + p.dateStr) : 'Unassigned Batch';
                    (byBatchDate[key] = byBatchDate[key] || []).push(u);
                });
                Object.keys(byBatchDate).sort().forEach(batchKey => {
                    const members = byBatchDate[batchKey].sort((a, b) => seqOf(a) - seqOf(b));
                    html += '<div class="group-heading" style="background:#f8fafc;border:1px solid #eef2f7;margin-left:12px;">' + batchKey + ' &middot; ' + members.length + ' trainee(s)</div>';
                    html += members.map(u => renderUserRow(u, false)).join('');
                });
            }
            container.innerHTML = html;
        }
        // Escapes a string so it's safe to embed inside a double-quoted HTML
        // attribute (e.g. onclick="..."). Without this, any value containing
        // a double quote — including anything wrapped by JSON.stringify(),
        // which always adds surrounding quotes — prematurely closes the
        // attribute and truncates the JS that follows, silently breaking the
        // button. This was a real bug: every "Permanent Revocation" button
        // threw Uncaught SyntaxError and did nothing, for every user.
        function escapeHtmlAttr(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }
        function renderUserRow(u, isPending) {
            const status = u.status || 'Pending';
            const pillClass = 'status-' + status.toLowerCase();
            const statusLabel = status === 'Suspended' ? 'Temporarily Revoked' : status;
            const fullName = u.full_name || u.fullName || ((u.first_name || '') + ' ' + (u.last_name || '')).trim();
            const created = u.created_at || u.createdAt;
            const createdLabel = created ? new Date(created).toLocaleDateString() : '\u2014';
            const userType = u.user_type || u.userType;

            let actions = '';
            if (isPending) {
                actions = '<button class="mini-btn approve" onclick="updateUserStatus(' + u.id + ',\'Approved\')">Approve</button>' +
                          '<button class="mini-btn reject" onclick="if(confirm(\'Permanently reject this registration?\'))updateUserStatus(' + u.id + ',\'Rejected\')">Reject</button>';
            } else {
                // Permission gating in the UI, mirroring what the server
                // enforces in revoke-user.js/suspend-user.js: Admins can't
                // revoke/suspend Admins, only the Master Account can, and the
                // Master Account can never be revoked or suspended at all.
                // This is a UI convenience only — the server is the real
                // enforcement point.
                const session = getSession();
                const sessionIsMaster = !!(session && session.username === 'LSHADMIN123');
                const targetIsMaster = u.username === 'LSHADMIN123';
                const isSuspended = status === 'Suspended';
                if (targetIsMaster) {
                    actions = '<span style="font-size:10px;color:#94a3b8;font-weight:800;text-transform:uppercase;">Master Account</span>';
                } else if (userType === 'Admin' && !sessionIsMaster) {
                    actions = '<span style="font-size:10px;color:#94a3b8;font-weight:800;text-transform:uppercase;">Only Master can ' + (isSuspended ? 'reinstate' : 'revoke') + '</span>';
                } else if (isSuspended) {
                    // Suspended (Temporary Revocation) accounts can be
                    // reinstated, or escalated straight to Permanent
                    // Revocation without needing to reinstate first.
                    actions = '<button class="mini-btn reinstate" onclick="confirmReinstateUser(' + u.id + ', ' + escapeHtmlAttr(JSON.stringify(fullName)) + ')">Lift Revocation</button>' +
                              '<button class="mini-btn reject" onclick="confirmRevokeUser(' + u.id + ', ' + escapeHtmlAttr(JSON.stringify(fullName)) + ')">Permanent Revocation</button>';
                } else {
                    actions = '<button class="mini-btn suspend" onclick="confirmSuspendUser(' + u.id + ', ' + escapeHtmlAttr(JSON.stringify(fullName)) + ')">Temporary Revocation</button>' +
                              '<button class="mini-btn reject" onclick="confirmRevokeUser(' + u.id + ', ' + escapeHtmlAttr(JSON.stringify(fullName)) + ')">Permanent Revocation</button>';
                }
            }

            const trainingStart = u.training_start_date || u.trainingStartDate;
            const trainingStartLabel = trainingStart ? (' \u00B7 Training Start ' + new Date(trainingStart + 'T00:00:00').toLocaleDateString()) : '';
            return '<div class="reg-row">' +
                    '<div class="reg-info">' +
                        '<b>' + fullName + ' <span class="status-pill ' + pillClass + '">' + statusLabel + '</span></b>' +
                        '<div class="reg-meta">' + userType + ' \u00B7 Batch ' + (u.batch_id || u.batchId || '\u2014') + ' \u00B7 @' + u.username + ' \u00B7 ' + (u.email || '') + ' \u00B7 Registered ' + createdLabel + (userType === 'Trainee' ? trainingStartLabel : '') + '</div>' +
                    '</div>' +
                    '<div style="display:flex; gap:6px; align-items:center;">' + actions + '</div>' +
                '</div>';
        }
        function updateUserStatus(userId, newStatus) {
            // Only ever called with 'Approved' or 'Rejected' now — permanent
            // revocation of an already-approved user goes through
            // confirmRevokeUser() / /api/revoke-user instead (see below).
            fetch('/api/update-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userId: userId, newStatus: newStatus })
            })
            .then(res => res.json())
            .then(data => {
                const labels = { Approved: 'User approved.', Rejected: 'Registration rejected.' };
                if (data && data.success !== false) {
                    const msg = (newStatus === 'Approved' && data.batchId) ? `User approved. Batch ID: ${data.batchId}` : (labels[newStatus] || `Status updated to ${newStatus}.`);
                    showToast(msg, 'success');
                } else {
                    showToast((data && data.error) || 'Failed to update status.', 'error');
                }
                refreshUsersAndRegistrations();
            })
            .catch(err => { console.error('Status update error:', err); showToast('Network error. Failed to update status.', 'error'); });
        }
        function confirmRevokeUser(userId, fullName) {
            if (!confirm('Permanently revoke access for ' + fullName + '? This deletes their account entirely — their saved cases will remain, but this action itself cannot be undone.')) return;
            fetch('/api/revoke-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userId: userId })
            })
            .then(res => res.json())
            .then(data => {
                if (data && data.success) {
                    showToast('Access permanently revoked.', 'success');
                } else {
                    showToast((data && data.error) || 'Failed to revoke access.', 'error');
                }
                refreshUsersAndRegistrations();
            })
            .catch(() => showToast('Network error. Failed to revoke access.', 'error'));
        }
        function confirmSuspendUser(userId, fullName) {
            if (!confirm('Temporarily revoke access for ' + fullName + '? Their account and saved cases are kept — you can reinstate access later.')) return;
            fetch('/api/suspend-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userId: userId })
            })
            .then(res => res.json())
            .then(data => {
                if (data && data.success) {
                    showToast('Access temporarily revoked.', 'success');
                } else {
                    showToast((data && data.error) || 'Failed to suspend access.', 'error');
                }
                refreshUsersAndRegistrations();
            })
            .catch(() => showToast('Network error. Failed to suspend access.', 'error'));
        }
        function confirmReinstateUser(userId, fullName) {
            if (!confirm('Lift the temporary revocation for ' + fullName + '? They will regain full access immediately.')) return;
            fetch('/api/reinstate-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userId: userId })
            })
            .then(res => res.json())
            .then(data => {
                if (data && data.success) {
                    showToast('Revocation lifted. Access restored.', 'success');
                } else {
                    showToast((data && data.error) || 'Failed to lift revocation.', 'error');
                }
                refreshUsersAndRegistrations();
            })
            .catch(() => showToast('Network error. Failed to reinstate access.', 'error'));
        }

        /* =========================================================
           MONITORING — reset to a single live-sessions view: who's
           online right now, click a name to view their latest saved
           case (read-only). Case Review has moved to its own "Case
           Logs" tab (see below). Backed by /api/heartbeat and
           /api/monitor-case.

           NOTE: deleted (permanently revoked) accounts never appear
           here — revoke-user.js deletes their heartbeat row the
           moment they're revoked, so there's no separate filtering
           needed on this side.
           ========================================================= */
        function refreshMonitoring() {
            fetch('/api/heartbeat', { credentials: 'include' })
                .then(r => r.json())
                .then(list => renderMonitoringOnline(Array.isArray(list) ? list : []))
                .catch(() => renderMonitoringOnline([]));
        }
        // Flat list, no Batch ID grouping — sorted online-first, then by
        // most recently seen.
        function renderMonitoringOnline(list) {
            const now = Date.now();
            list.forEach(u => u._online = (now - new Date(u.last_seen).getTime()) < HEARTBEAT_GRACE_MS * 2);
            const onlineCount = list.filter(u => u._online).length;
            const statTile = document.getElementById('admin-stat-online');
            if (statTile) statTile.innerText = onlineCount;

            const container = document.getElementById('monitoring-online-list');
            if (!container) return;
            if (!list.length) { container.innerHTML = '<p style="font-size:12px;color:#94a3b8;">No sessions recorded yet.</p>'; return; }

            function rowHtml(u) {
                return '<div class="reg-row" style="cursor:pointer;" onclick="openMonitorCase(' + JSON.stringify(u.username) + ')"><div class="reg-info">' +
                    '<b><span class="online-dot ' + (u._online ? 'live' : '') + '"></span>' + (u.full_name || u.username) + '</b>' +
                    '<div class="reg-meta">' + (u.user_type || '') + ' \u00B7 @' + u.username + ' \u00B7 ' + (u._online ? 'Online now' : 'Last seen ' + new Date(u.last_seen).toLocaleString()) + (u.current_case ? (' \u00B7 Working on: ' + u.current_case) : '') + '</div>' +
                    '</div><div style="font-size:11px;color:#64748b;">View Latest Saved \u2192</div></div>';
            }

            const sorted = list.slice().sort((a, b) => (b._online - a._online) || (new Date(b.last_seen) - new Date(a.last_seen)));
            container.innerHTML = sorted.map(rowHtml).join('');
        }

        /* =========================================================
           SERVER LOGS (Monitoring > Server Logs clickable panel) —
           backed by /api/server-logs, which reshapes the existing
           activity_log table (login, logout, pause/resume, lock/
           unlock, ping, and the three revocation actions) with a
           computed duration for the paired event types.
           ========================================================= */
        function openServerLogs() {
            document.getElementById('server-logs-modal').classList.add('open');
            document.getElementById('server-logs-list').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Loading...</p>';
            fetch('/api/server-logs', { credentials: 'include' })
                .then(r => r.json())
                .then(data => renderServerLogs((data && data.success) ? data.logs : []))
                .catch(() => renderServerLogs([]));
        }
        function closeServerLogs() { document.getElementById('server-logs-modal').classList.remove('open'); }
        function formatDuration(seconds) {
            if (seconds == null) return '';
            if (seconds < 60) return seconds + 's';
            const m = Math.floor(seconds / 60), s = seconds % 60;
            if (m < 60) return m + 'm ' + s + 's';
            const h = Math.floor(m / 60), rm = m % 60;
            return h + 'h ' + rm + 'm';
        }
        function renderServerLogs(logs) {
            const container = document.getElementById('server-logs-list');
            if (!container) return;
            if (!logs.length) { container.innerHTML = '<p style="font-size:12px;color:#94a3b8;">No activity recorded yet.</p>'; return; }
            container.innerHTML = logs.map(function (l) {
                return '<div class="reg-row"><div class="reg-info">' +
                    '<b>' + l.label + (l.durationSeconds != null ? ' <span class="status-pill status-approved">' + formatDuration(l.durationSeconds) + '</span>' : '') + '</b>' +
                    '<div class="reg-meta">' + (l.actorUsername ? '@' + l.actorUsername : 'System') + (l.actorBatch ? ' \u00B7 Batch ' + l.actorBatch : '') + ' \u00B7 ' + new Date(l.occurredAt).toLocaleString() + '</div>' +
                    '</div></div>';
            }).join('');
        }

        /* =========================================================
           CASE LOGS (Master Control > Case Logs) — Search Case, all
           cases sorted by most recent modification, See Previous
           Versions (backed by /api/case-versions), and View Full Case
           (the current version, read-only, backed by
           /api/case-repository?id=).
           ========================================================= */
        function refreshCaseLogs() {
            renderCaseLogs(); // reuses the already-fetched shared repo cache (_repoCache)
        }
        function renderCaseLogs() {
            const container = document.getElementById('case-logs-list');
            if (!container) return;
            const searchEl = document.getElementById('case-logs-search');
            const query = (searchEl ? searchEl.value : '').trim().toLowerCase();

            let list = _repoCache.slice();
            if (query) {
                list = list.filter(c =>
                    (c.clientName || '').toLowerCase().includes(query) ||
                    (c.caseId || '').toLowerCase().includes(query)
                );
            }
            list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

            if (!list.length) { container.innerHTML = '<p style="font-size:12px;color:#94a3b8;">No matching cases.</p>'; return; }

            container.innerHTML = list.map(function (c) {
                return '<div class="reg-row"><div class="reg-info">' +
                    '<b>' + (c.clientName || 'Untitled Case') + ' <span class="status-pill ' + (c.isDraft ? 'status-pending' : 'status-approved') + '">' + (c.isDraft ? 'DRAFT' : (c.phase || '')) + '</span></b>' +
                    '<div class="reg-meta">By ' + (c.submittedBy || c.ownerUsername) + ' \u00B7 Case ID ' + (c.caseId || '\u2014') + ' \u00B7 Modified ' + new Date(c.updatedAt).toLocaleString() + '</div>' +
                    '</div><div style="display:flex;gap:8px;">' +
                    '<button class="mini-btn" style="background:var(--navy);color:white;" onclick="openCaseVersions(' + c.id + ', event)">See Previous Versions</button>' +
                    '<button class="mini-btn" style="background:#16a34a;color:white;" onclick="openCaseLogsFullView(' + c.id + ', event)">View Full Case</button>' +
                    '</div></div>';
            }).join('');
        }

        function openCaseVersions(caseRepositoryId, evt) {
            if (evt) evt.stopPropagation();
            document.getElementById('case-versions-modal').classList.add('open');
            document.getElementById('case-versions-list').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Loading...</p>';
            fetch('/api/case-versions?caseRepositoryId=' + encodeURIComponent(caseRepositoryId), { credentials: 'include' })
                .then(r => r.json())
                .then(data => renderCaseVersions(caseRepositoryId, (data && data.success) ? data.versions : []))
                .catch(() => renderCaseVersions(caseRepositoryId, []));
        }
        function renderCaseVersions(caseRepositoryId, versions) {
            const container = document.getElementById('case-versions-list');
            if (!container) return;
            if (!versions.length) { container.innerHTML = '<p style="font-size:12px;color:#94a3b8;">No previous versions recorded for this case yet.</p>'; return; }
            container.innerHTML = versions.map(function (v) {
                return '<div class="reg-row" style="cursor:pointer;" onclick="openCaseVersionView(' + caseRepositoryId + ', ' + v.id + ')"><div class="reg-info">' +
                    '<b>' + (v.clientName || 'Untitled Case') + ' <span class="status-pill ' + (v.isDraft ? 'status-pending' : 'status-approved') + '">' + (v.isDraft ? 'DRAFT' : (v.phase || '')) + '</span></b>' +
                    '<div class="reg-meta">Saved by ' + (v.savedBy || '\u2014') + (v.savedByBatch ? ' \u00B7 Batch ' + v.savedByBatch : '') + ' \u00B7 ' + new Date(v.savedAt).toLocaleString() + '</div>' +
                    '</div><div style="font-size:11px;color:#64748b;">View &rarr;</div></div>';
            }).join('');
        }
        function closeCaseVersions() { document.getElementById('case-versions-modal').classList.remove('open'); }

        // Renders a read-only snapshot (either a past version, or the current
        // full case) into the shared case-logs-view-modal, reusing the same
        // detached-clone technique as openMonitorCase().
        function renderReadOnlyCaseInto(elIds, meta, content) {
            document.getElementById(elIds.title).innerText = meta.title;
            document.getElementById(elIds.sub).innerText = meta.sub;
            document.getElementById(elIds.meta).innerHTML = meta.metaHtml;
            if (_emptyCaptureAreaTemplate) {
                const offscreen = _emptyCaptureAreaTemplate.cloneNode(true);
                applyCaseContentToDOM(content, offscreen);
                document.getElementById(elIds.body).innerHTML = extractReadableSections(offscreen);
            } else {
                document.getElementById(elIds.body).innerHTML = '<p style="font-size:12px;color:#94a3b8;">Preview unavailable.</p>';
            }
        }
        async function openCaseVersionView(caseRepositoryId, versionId) {
            const modal = document.getElementById('case-logs-view-modal');
            document.getElementById('case-logs-view-title').innerText = 'Previous Version';
            document.getElementById('case-logs-view-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Loading...</p>';
            modal.classList.add('open');
            try {
                const res = await fetch('/api/case-versions?caseRepositoryId=' + encodeURIComponent(caseRepositoryId) + '&versionId=' + encodeURIComponent(versionId), { credentials: 'include' });
                const data = await res.json();
                if (!data || !data.success) {
                    document.getElementById('case-logs-view-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">' + ((data && data.error) || 'Could not load this version.') + '</p>';
                    return;
                }
                const v = data.version;
                renderReadOnlyCaseInto(
                    { title: 'case-logs-view-title', sub: 'case-logs-view-sub', meta: 'case-logs-view-meta', body: 'case-logs-view-body' },
                    {
                        title: 'Previous Version \u2014 ' + (v.clientName || 'Unnamed'),
                        sub: 'Saved by ' + (v.savedBy || '\u2014') + ' \u00B7 ' + new Date(v.savedAt).toLocaleString(),
                        metaHtml: '<div class="reg-meta" style="margin-bottom:10px;">' + (v.isDraft ? 'DRAFT (no Case ID yet)' : ('Case ID ' + v.caseId)) + ' \u00B7 Phase: ' + (v.phase || '\u2014') + '</div>'
                    },
                    v.content
                );
            } catch (e) {
                document.getElementById('case-logs-view-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Network error loading this version.</p>';
            }
        }
        async function openCaseLogsFullView(id, evt) {
            if (evt) evt.stopPropagation();
            const modal = document.getElementById('case-logs-view-modal');
            document.getElementById('case-logs-view-title').innerText = 'Current Version';
            document.getElementById('case-logs-view-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Loading...</p>';
            modal.classList.add('open');
            try {
                const res = await fetch('/api/case-repository?id=' + encodeURIComponent(id), { credentials: 'include' });
                const data = await res.json();
                if (!data || !data.success) {
                    document.getElementById('case-logs-view-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">' + ((data && data.error) || 'Could not load this case.') + '</p>';
                    return;
                }
                const c = data.case;
                renderReadOnlyCaseInto(
                    { title: 'case-logs-view-title', sub: 'case-logs-view-sub', meta: 'case-logs-view-meta', body: 'case-logs-view-body' },
                    {
                        title: 'Full Case \u2014 ' + (c.clientName || 'Unnamed'),
                        sub: 'Current version \u00B7 last saved ' + new Date(c.updatedAt).toLocaleString(),
                        metaHtml: '<div class="reg-meta" style="margin-bottom:10px;">' + (c.isDraft ? 'DRAFT (no Case ID yet)' : ('Case ID ' + c.caseId)) + ' \u00B7 Phase: ' + (c.phase || '\u2014') + ' \u00B7 By ' + (c.submittedBy || c.ownerUsername) + '</div>'
                    },
                    c.content
                );
            } catch (e) {
                document.getElementById('case-logs-view-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Network error loading this case.</p>';
            }
        }
        function closeCaseLogsView() { document.getElementById('case-logs-view-modal').classList.remove('open'); }

        // Admin clicks a trainee in the online list -> shows that user's
        // LATEST SAVED (or autosaved) case, read-only, without touching the
        // admin's own in-progress work in the main editor. Renders via a
        // detached clone of the empty capture-area template (see
        // applyCaseContentToDOM/extractReadableSections above).
        async function openMonitorCase(username) {
            const modal = document.getElementById('monitor-case-modal');
            document.getElementById('monitor-case-title').innerText = 'Latest Saved Case \u2014 ' + username;
            document.getElementById('monitor-case-meta').innerHTML = '';
            document.getElementById('monitor-case-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Loading latest saved version...</p>';
            modal.classList.add('open');
            try {
                const res = await fetch('/api/monitor-case?username=' + encodeURIComponent(username), { credentials: 'include' });
                const data = await res.json();
                if (!data || !data.success) {
                    document.getElementById('monitor-case-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">' + ((data && data.error) || 'No saved cases found for this user yet.') + '</p>';
                    return;
                }
                const c = data.case;
                document.getElementById('monitor-case-meta').innerHTML =
                    '<div class="reg-meta" style="margin-bottom:10px;">Client: <b>' + (c.clientName || 'Unnamed') + '</b> &middot; Phase: ' + (c.phase || '\u2014') +
                    ' &middot; ' + (c.isDraft ? 'DRAFT (no Case ID yet)' : ('Case ID ' + c.caseId)) +
                    ' &middot; Last saved ' + new Date(c.updatedAt).toLocaleString() + '</div>';
                if (_emptyCaptureAreaTemplate) {
                    const offscreen = _emptyCaptureAreaTemplate.cloneNode(true);
                    applyCaseContentToDOM(c.content, offscreen);
                    document.getElementById('monitor-case-body').innerHTML = extractReadableSections(offscreen);
                } else {
                    document.getElementById('monitor-case-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Preview unavailable.</p>';
                }
            } catch (e) {
                document.getElementById('monitor-case-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Network error loading this user\u2019s latest case.</p>';
            }
        }
        function closeMonitorCase() { document.getElementById('monitor-case-modal').classList.remove('open'); }
        let heartbeatTimer = null;
        let idleTimer = null;

        function sendHeartbeat() {
            const session = getSession();
            if (!session) return Promise.resolve(false);
            return fetch('/api/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    fullName: session.fullName,
                    currentCase: (document.getElementById('client-name-field') ? document.getElementById('client-name-field').innerText.trim() : '') || null
                })
            })
            .then(r => {
                if (r.status === 401) {
                    handleSessionExpired('Your session has expired. Please log in again.');
                    return false;
                }
                return r.ok;
            })
            .catch(() => false);
        }

        function stopHeartbeat() {
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }
        }

        function startHeartbeat() {
            stopHeartbeat();
            sendHeartbeat();
            heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
        }

        function onUserActivity() {
            if (!getSession()) return;
            resetIdleTimer();
        }

        function resetIdleTimer() {
            if (!getSession()) return;
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(onIdleTimeout, IDLE_TIMEOUT_MS);
        }

        function onIdleTimeout() {
            logoutSession('Logged out due to inactivity.');
        }

        function startIdleTracking() {
            stopIdleTracking();
            ['mousemove', 'keydown', 'click'].forEach(evt => {
                document.addEventListener(evt, onUserActivity, { passive: true });
            });
            resetIdleTimer();
        }

        function stopIdleTracking() {
            if (idleTimer) {
                clearTimeout(idleTimer);
                idleTimer = null;
            }
            ['mousemove', 'keydown', 'click'].forEach(evt => {
                document.removeEventListener(evt, onUserActivity);
            });
        }

        function resumeSession() {
            const session = getSession();
            if (!session) {
                applySessionUI();
                return;
            }
            sendHeartbeat().then(alive => {
                if (alive) {
                    applySessionUI();
                    startHeartbeat();
                    startIdleTracking();
                } else {
                    applySessionUI();
                }
            });
        }
        // NOTE: syncCaseSnapshot() (which POSTed to the old, now-retired
        // /api/cases activity log) has been removed — saveCase()/
        // updateCase()/archiveCaseAsDraft()/autoSaveProgress() now write
        // directly to the server-side Case Repository (/api/case-repository),
        // which is also what Monitoring reads from, so no separate sync step
        // is needed anymore.

        /* =========================================================
           ANNOUNCEMENTS (ticker) & ALERTS (full-screen) — both backed
           by Cloudflare D1 via /api/announcement and /api/alert, and
           kept in sync for every connected user through /api/state.
           ========================================================= */
        const ALERT_SWATCHES = ['#b91c1c', '#c2410c', '#a16207', '#166534', '#1d4ed8', '#4c1d95', '#0f172a'];
        let alertImageDataUrl = null;
        (function buildAlertSwatches() {
            document.addEventListener('DOMContentLoaded', () => {
                const row = document.getElementById('alert-bg-swatches');
                if (!row) return;
                row.innerHTML = ALERT_SWATCHES.map(c => `<div class="swatch" style="background:${c}" onclick="selectAlertSwatch('${c}', this)"></div>`).join('');
            });
        })();
        function selectAlertSwatch(color, el) {
            document.getElementById('alert-bg-color').value = color;
            document.querySelectorAll('#alert-bg-swatches .swatch').forEach(s => s.classList.remove('selected'));
            if (el) el.classList.add('selected');
        }
        function previewAlertImage(input) {
            const file = input.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                alertImageDataUrl = e.target.result;
                const preview = document.getElementById('alert-image-preview');
                preview.src = alertImageDataUrl; preview.style.display = 'inline-block';
            };
            reader.readAsDataURL(file);
        }
        function clearAlertImage() {
            alertImageDataUrl = null;
            document.getElementById('alert-image-input').value = '';
            const preview = document.getElementById('alert-image-preview');
            preview.style.display = 'none'; preview.src = '';
        }
        function makeAnnouncement() {
            const text = document.getElementById('announce-text-input').value.trim();
            if (!text) return;
            fetch('/api/announcement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ text }) })
                .then(r => r.json()).then(() => {
                    document.getElementById('announce-text-input').value = '';
                    showToast('Announcement broadcasted.', 'info');
                    refreshSiteState();
                }).catch(() => showToast('Network error broadcasting announcement.', 'error'));
        }
        function clearAnnouncement() {
            fetch('/api/announcement', { method: 'DELETE', credentials: 'include' }).then(() => { showToast('Ticker cleared.', 'info'); refreshSiteState(); }).catch(() => {});
        }
        function setAlert() {
            const text = document.getElementById('alert-text-input').value.trim();
            if (!text) { showToast('Please enter alert text.', 'error'); return; }
            const bgColor = document.getElementById('alert-bg-color').value;
            const duration = parseInt(document.getElementById('alert-duration-select').value, 10) || 0;
            const scheduleRaw = document.getElementById('alert-schedule-input').value;
            const startAt = scheduleRaw ? new Date(scheduleRaw).toISOString() : new Date().toISOString();
            fetch('/api/alert', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ text, bgColor, image: alertImageDataUrl, durationSeconds: duration, startAt })
            }).then(r => r.json()).then(() => {
                showToast(scheduleRaw ? 'Alert scheduled.' : 'Alert is now live for all users.', 'alert');
                refreshSiteState();
            }).catch(() => showToast('Network error setting alert.', 'error'));
        }
        function stopAlert() {
            fetch('/api/alert', { method: 'DELETE', credentials: 'include' }).then(() => { showToast('Alert stopped.', 'info'); dismissAlertLocally(); refreshSiteState(); }).catch(() => {});
        }
        function dismissAlertLocally() {
            document.getElementById('alert-overlay').classList.remove('open');
        }

        /* =========================================================
           PING — instant one-shot notification (toast + sound), sent to
           a specific user or broadcast to everyone. Unlike the Alert
           overlay it never takes over the screen. It renders with its
           own 'ping' toast style and its own louder, longer alert tone
           (see playNotificationSound's 'ping' pattern) so it stands out
           from ordinary success/info toasts, and always shows who sent
           it via a "By: ..." line — "By: System Administrator" for the
           hardcoded Master Account, otherwise "By: Admin <First Name>".
           Delivered the same way Announcement/Alert are: written
           server-side via /api/ping (including the "by" attribution),
           then picked up by every connected browser on the next
           /api/state poll (see applySiteState -> state.ping).
           ========================================================= */
        let pingMode = 'single'; // 'single' (one-or-more specific users) | 'all'
        let _pingUserListSorted = []; // _activeUsersCache, sorted alphabetically by full name, feeds the search dropdown
        let pingSelectedUsers = []; // usernames currently selected as recipients, in the order they were picked
        function setPingMode(mode) {
            pingMode = mode;
            const singleBtn = document.getElementById('ping-mode-single-btn');
            const allBtn = document.getElementById('ping-mode-all-btn');
            const userRow = document.getElementById('ping-user-row');
            if (singleBtn) singleBtn.style.background = mode === 'single' ? 'var(--navy)' : '#94a3b8';
            if (allBtn) allBtn.style.background = mode === 'all' ? 'var(--navy)' : '#94a3b8';
            if (userRow) userRow.style.display = mode === 'single' ? '' : 'none';
            if (mode !== 'single') closePingUserList();
        }
        // Builds the alphabetized (by full name) recipient list used by the
        // searchable dropdown below. Each row surfaces Full Name, username,
        // Batch ID, and Type, in that order, so admins can search/scan by any
        // of them.
        function populatePingUserSelect() {
            _pingUserListSorted = (_activeUsersCache || []).slice().sort((a, b) =>
                (a.full_name || a.username || '').localeCompare(b.full_name || b.username || '', undefined, { sensitivity: 'base' }));
            // Drop any previously-picked recipients who are no longer in the
            // active list (e.g. suspended since) rather than silently keep
            // targeting them.
            pingSelectedUsers = pingSelectedUsers.filter(uname => _pingUserListSorted.some(u => u.username === uname));
            syncPingHiddenValue();
            renderPingUserChips();
            renderPingUserList(_pingUserListSorted);
        }
        function renderPingUserList(list) {
            const listEl = document.getElementById('ping-user-list');
            if (!listEl) return;
            if (!list.length) {
                listEl.innerHTML = '<div style="padding:10px;font-size:12px;color:#94a3b8;">No matching users found</div>';
                return;
            }
            listEl.innerHTML = list.map(u => {
                const uname = u.username || '';
                const fullName = u.full_name || uname;
                const batchId = u.batch_id || u.batchId || '\u2014';
                const type = u.user_type || u.userType || '\u2014';
                const checked = pingSelectedUsers.includes(uname);
                return '<div class="ping-user-option' + (checked ? ' active' : '') + '" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:9px;" ' +
                    'onclick="togglePingUser(' + escapeHtmlAttr(JSON.stringify(uname)) + ')">' +
                    '<input type="checkbox" tabindex="-1" style="pointer-events:none;flex-shrink:0;" ' + (checked ? 'checked' : '') + '>' +
                    '<div style="flex:1;min-width:0;">' +
                    '<div style="font-weight:700;color:var(--navy);">' + escapeHtmlAttr(fullName) + '</div>' +
                    '<div style="color:#64748b;font-size:10.5px;margin-top:2px;">@' + escapeHtmlAttr(uname) +
                    ' \u00B7 Batch ' + escapeHtmlAttr(String(batchId)) + ' \u00B7 ' + escapeHtmlAttr(type) + '</div>' +
                    '</div></div>';
            }).join('');
        }
        // Filters by Full Name, username, Batch ID, or Type — whichever the
        // admin is searching by — while keeping results alphabetical. Typing
        // to search no longer clears whoever is already selected.
        function filterPingUserList() {
            openPingUserList();
            const q = (document.getElementById('ping-user-search').value || '').trim().toLowerCase();
            if (!q) { renderPingUserList(_pingUserListSorted); return; }
            const filtered = _pingUserListSorted.filter(u => {
                const fullName = (u.full_name || '').toLowerCase();
                const uname = (u.username || '').toLowerCase();
                const batchId = String(u.batch_id || u.batchId || '').toLowerCase();
                const type = (u.user_type || u.userType || '').toLowerCase();
                return fullName.includes(q) || uname.includes(q) || batchId.includes(q) || type.includes(q);
            });
            renderPingUserList(filtered);
        }
        // Adds/removes a user from the recipient set. The list stays open
        // afterwards so the admin can keep picking more people — it only
        // closes via the outside-click/Escape handlers below, or removePingUser
        // is not what closes it either.
        function togglePingUser(username) {
            const idx = pingSelectedUsers.indexOf(username);
            if (idx === -1) pingSelectedUsers.push(username); else pingSelectedUsers.splice(idx, 1);
            syncPingHiddenValue();
            renderPingUserChips();
            filterPingUserList(); // re-render against whatever's currently typed in search, preserving checkmarks
        }
        function removePingUser(username) {
            pingSelectedUsers = pingSelectedUsers.filter(u => u !== username);
            syncPingHiddenValue();
            renderPingUserChips();
            filterPingUserList();
        }
        function syncPingHiddenValue() {
            const hidden = document.getElementById('ping-user-select');
            if (hidden) hidden.value = JSON.stringify(pingSelectedUsers);
        }
        // Renders the selected recipients as removable chips above the search box.
        function renderPingUserChips() {
            const wrap = document.getElementById('ping-user-chips');
            if (!wrap) return;
            if (!pingSelectedUsers.length) { wrap.innerHTML = ''; return; }
            wrap.innerHTML = pingSelectedUsers.map(uname => {
                const u = _pingUserListSorted.find(x => x.username === uname);
                const label = u ? (u.full_name || uname) : uname;
                return '<span style="display:inline-flex;align-items:center;gap:6px;background:#eef2ff;color:var(--navy);border:1px solid #c7d2fe;border-radius:999px;padding:4px 10px 4px 12px;font-size:11px;font-weight:700;">' +
                    escapeHtmlAttr(label) +
                    '<span onclick="removePingUser(' + escapeHtmlAttr(JSON.stringify(uname)) + ')" style="cursor:pointer;font-weight:900;color:#64748b;line-height:1;">\u00D7</span>' +
                    '</span>';
            }).join('');
        }
        function openPingUserList() {
            const listEl = document.getElementById('ping-user-list');
            if (listEl) listEl.style.display = 'block';
        }
        function closePingUserList() {
            const listEl = document.getElementById('ping-user-list');
            if (listEl) listEl.style.display = 'none';
        }
        // Closing no longer depends on picking a user: clicking anywhere
        // outside the recipient widget, or pressing Escape, closes the list
        // regardless of selection state. Uses 'mousedown' + capture so it
        // fires reliably even if something inside the admin dashboard stops
        // click-event propagation.
        document.addEventListener('mousedown', function (e) {
            const wrap = document.getElementById('ping-user-row');
            if (wrap && !wrap.contains(e.target)) closePingUserList();
        }, true);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closePingUserList();
        });
        // First name of the signed-in admin, used to attribute a ping (e.g.
        // "Jane Doe" -> "Jane"). Falls back gracefully if a full name isn't set.
        function firstNameOf(fullName) {
            const trimmed = String(fullName || '').trim();
            if (!trimmed) return 'Administrator';
            return trimmed.split(/\s+/)[0];
        }
        function sendPing() {
            const text = document.getElementById('ping-text-input').value.trim();
            if (!text) { showToast('Please enter a ping message.', 'error'); return; }
            // target is '__all__' for a broadcast, a single username string for
            // one recipient, or an array of usernames when several are picked —
            // the backend's /api/ping needs to accept all three shapes.
            let target = '__all__';
            if (pingMode === 'single') {
                if (!pingSelectedUsers.length) { showToast('Select at least one user to ping.', 'error'); return; }
                target = pingSelectedUsers.length === 1 ? pingSelectedUsers[0] : pingSelectedUsers.slice();
            }
            // Attribute the ping: the hardcoded Master Account always shows as
            // "System Administrator"; any other Admin shows as "Admin <First Name>".
            const pingSession = getSession();
            const isMasterSender = !!(pingSession && pingSession.username === 'LSHADMIN123');
            const sentBy = isMasterSender ? 'System Administrator' : ('Admin ' + firstNameOf(pingSession && pingSession.fullName));
            fetch('/api/ping', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ text, target, by: sentBy })
            })
            .then(r => r.json())
            .then(data => {
                if (!data || !data.success) { showToast((data && data.error) || 'Failed to send ping.', 'error'); return; }
                const recipientLabel = pingMode === 'all' ? 'all users' :
                    (pingSelectedUsers.length === 1 ? pingSelectedUsers[0] : pingSelectedUsers.length + ' users');
                showToast('Ping sent to ' + recipientLabel + '.', 'success');
                document.getElementById('ping-text-input').value = '';
                pingSelectedUsers = [];
                syncPingHiddenValue();
                const search = document.getElementById('ping-user-search');
                if (search) search.value = '';
                renderPingUserChips();
                renderPingUserList(_pingUserListSorted);
                closePingUserList();
                refreshSiteState();
            })
            .catch(() => showToast('Network error sending ping.', 'error'));
        }

        /* =========================================================
           SITE STATE POLLING — pause / lock / announcement / alert,
           shared across every connected browser via /api/state.
           ========================================================= */
        let lastAlertId = null;
        let lastAnnouncementText = null; // null = not yet initialized (first poll after page load)
        let lastPingId = null; // last delivered ping id, so a given ping is never toasted twice
        function refreshSiteState() {
            fetch('/api/state').then(r => r.json()).then(state => applySiteState(state)).catch(() => {});
        }
        function applySiteState(state) {
            if (!state) return;
            // Announcement ticker
            const annText = (state.announcement && state.announcement.text) || 'Welcome to the LSH Training Interface.';
            const tickerText = document.getElementById('ticker-text');
            if (tickerText) tickerText.innerText = annText;
            const announcePreview = document.getElementById('announce-current-preview');
            if (announcePreview) announcePreview.innerText = annText;
            // Notification sound for everyone the moment the broadcast actually
            // changes (skipped on first load, so reopening/refreshing the page
            // doesn't replay a sound for an announcement that's been up a while).
            if (lastAnnouncementText !== null && lastAnnouncementText !== annText) {
                playNotificationSound('info');
            }
            lastAnnouncementText = annText;

            // Alert overlay (full screen, separate from ticker)
            const alertLine = document.getElementById('alert-status-line');
            if (state.alert && state.alert.active) {
                if (alertLine) alertLine.innerHTML = 'Alert is <b>LIVE</b> since ' + new Date(state.alert.startAt).toLocaleTimeString() + (state.alert.durationSeconds ? (' \u00B7 auto-stops after ' + state.alert.durationSeconds + 's') : ' \u00B7 until manually stopped');
                const ovState = document.getElementById('ov-alert-state'); if (ovState) ovState.innerText = 'Active';
                if (lastAlertId !== state.alert.id) {
                    lastAlertId = state.alert.id;
                    const overlay = document.getElementById('alert-overlay');
                    overlay.style.background = hexToRgba(state.alert.bgColor || '#b91c1c', 0.65);
                    document.getElementById('alert-overlay-text').innerText = state.alert.text || '';
                    const img = document.getElementById('alert-overlay-image');
                    if (state.alert.image) { img.src = state.alert.image; img.style.display = 'block'; } else { img.style.display = 'none'; img.src=''; }
                    overlay.classList.add('open');
                    playNotificationSound('alert');
                }
            } else {
                if (alertLine) alertLine.innerText = 'No alert is currently active.';
                const ovState = document.getElementById('ov-alert-state'); if (ovState) ovState.innerText = 'None Active';
                lastAlertId = null;
                document.getElementById('alert-overlay').classList.remove('open');
            }

            // Ping — instant toast+sound notification to a specific user or
            // everyone, styled and sounding exactly like the login-success
            // toast (see showToast). One-shot: each ping fires at most once per
            // browser, and stale pings (fired well before this poll, e.g. one
            // that went out before this browser tab was opened) are skipped so
            // loading/refreshing the page doesn't replay old notifications.
            if (state.ping && state.ping.id && state.ping.id !== lastPingId) {
                const pingSession = getSession();
                const myUsername = pingSession && pingSession.username;
                const isForMe = state.ping.target === '__all__' ||
                    (myUsername && (Array.isArray(state.ping.target)
                        ? state.ping.target.includes(myUsername)
                        : state.ping.target === myUsername));
                const isFresh = !state.ping.firedAt || (Date.now() - new Date(state.ping.firedAt).getTime()) < 10000;
                if (isForMe && isFresh) {
                    const byLine = 'By: ' + (state.ping.by || 'System Administrator');
                    showToast('📣 ' + (state.ping.text || 'You have been pinged by an Administrator.'), 'ping', 6000, byLine);
                }
                lastPingId = state.ping.id;
            }

            // Pause overlay (freezes, no logout) — admins are exempt so they can always resume
            const pauseOverlay = document.getElementById('pause-overlay');
            const pauseLabel = document.getElementById('pause-state-label');
            const pauseBtn = document.getElementById('pause-toggle-btn');
            const ovPause = document.getElementById('ov-pause-state');
            const sessionForPause = getSession();
            const isAdminSession = sessionForPause && sessionForPause.userType === 'Admin';
            if (state.paused) {
                if (isAdminSession) {
                    pauseOverlay.classList.remove('open');
                } else {
                    pauseOverlay.classList.add('open');
                }
                if (pauseLabel) { pauseLabel.innerText = 'Paused'; pauseLabel.style.color = 'var(--classified-red)'; }
                if (pauseBtn) pauseBtn.innerText = '\u25B6 Resume Activity';
                if (ovPause) ovPause.innerText = 'Paused';
            } else {
                pauseOverlay.classList.remove('open');
                if (pauseLabel) { pauseLabel.innerText = 'Active (not paused)'; pauseLabel.style.color = '#166534'; }
                if (pauseBtn) pauseBtn.innerText = '\u23F8 Pause All Activity';
                if (ovPause) ovPause.innerText = 'Active';
            }

            // Lock overlay (forces logout, requires unlock)
            const lockOverlay = document.getElementById('lock-overlay');
            const lockLabel = document.getElementById('lock-state-label');
            const ovLock = document.getElementById('ov-lock-state');
            const session = sessionForPause;
            siteIsLocked = !!state.locked;
            siteLockedByAdmin = !!(session && session.userType === 'Admin');
            if (state.locked) {
                document.getElementById('lock-locked-by').innerText = 'Locked By: Batch ID ' + (state.lockedBy || '\u2014');
                lockOverlay.classList.add('open');
                lockOverlay.style.setProperty('display', 'flex', 'important');
                if (session && session.userType !== 'Admin') { clearSession(); }
                if (lockLabel) { lockLabel.innerText = 'Locked'; lockLabel.style.color = 'var(--classified-red)'; }
                if (ovLock) ovLock.innerText = 'Locked';
                // Actively wipe any case content already sitting in the DOM —
                // don't just rely on the overlay to cover it up.
                if (!siteLockedByAdmin) { blankCaseEditorContent(); renderRepo(); }
            } else {
                lockOverlay.classList.remove('open');
                lockOverlay.style.removeProperty('display');
                if (lockLabel) { lockLabel.innerText = 'Unlocked'; lockLabel.style.color = '#166534'; }
                if (ovLock) ovLock.innerText = 'Unlocked';
                // Site-state fetch is async, so on a fresh page load the very
                // first renderRepo() may have run before we knew the true
                // lock state. Re-render now that it's authoritative.
                renderRepo();
            }
            runOverlayIntegrityCheck();
        }
        function hexToRgba(hex, alpha) {
            hex = (hex || '#b91c1c').replace('#', '');
            if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
            const num = parseInt(hex, 16);
            const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
            return `rgba(${r},${g},${b},${alpha})`;
        }
        setInterval(refreshSiteState, 4000);

        /* =========================================================
           PAUSE — freezes activity site-wide, no logout, resumable
           ========================================================= */
        function togglePause() {
            fetch('/api/pause', { method: 'POST', credentials: 'include' })
                .then(r => r.json())
                .then(data => { showToast(data.paused ? 'Activity paused for all users.' : 'Activity resumed for all users.', 'info'); refreshSiteState(); })
                .catch(() => showToast('Network error toggling pause.', 'error'));
        }

        /* =========================================================
           LOCK — requires Batch ID + password confirmation, forces
           logout for everyone, and stays locked until an admin
           unlocks it again.
           ========================================================= */
        function openLockConfirm() {
            document.getElementById('lock-confirm-batchid').value = '';
            document.getElementById('lock-confirm-password').value = '';
            document.getElementById('lock-confirm-error').style.display = 'none';
            document.getElementById('lock-confirm-modal').classList.add('open');
        }
        function closeLockConfirm() {
            document.getElementById('lock-confirm-modal').classList.remove('open');
        }
        function confirmLock() {
            const batchId = document.getElementById('lock-confirm-batchid').value.trim();
            const password = document.getElementById('lock-confirm-password').value;
            if (!batchId || !password) { document.getElementById('lock-confirm-error').style.display = 'block'; return; }
            fetch('/api/lock', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ action: 'lock', batchId, password })
            }).then(r => r.json()).then(data => {
                if (data.success) {
                    closeLockConfirm();
                    showToast('Site locked. All users will be signed out.', 'alert');
                    refreshSiteState();
                } else {
                    document.getElementById('lock-confirm-error').innerText = data.error || 'Batch ID / password did not match an administrator record.';
                    document.getElementById('lock-confirm-error').style.display = 'block';
                }
            }).catch(() => { document.getElementById('lock-confirm-error').innerText = 'Network error verifying credentials.'; document.getElementById('lock-confirm-error').style.display = 'block'; });
        }
        function attemptUnlock() {
            const u = document.getElementById('unlock-user').value.trim();
            const p = document.getElementById('unlock-pass').value.trim();
            fetch('/api/lock', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ action: 'unlock', username: u, password: p })
            }).then(r => r.json()).then(data => {
                if (data.success) {
                    document.getElementById('unlock-error').style.display = 'none';
                    document.getElementById('unlock-user').value = '';
                    document.getElementById('unlock-pass').value = '';
                    if (data.user) { setSession(data.user); applySessionUI(); startHeartbeat(); startIdleTracking(); }
                    refreshSiteState();
                } else {
                    document.getElementById('unlock-error').innerText = data.error || 'Invalid credentials.';
                    document.getElementById('unlock-error').style.display = 'block';
                }
            }).catch(() => { document.getElementById('unlock-error').innerText = 'Network error.'; document.getElementById('unlock-error').style.display = 'block'; });
        }

        // Replaces the old admin-editable, localStorage-backed logo/background
        // system (changeLogo/resetLogo/applyLogo/setBackgroundImage/
        // resetBackgroundImage/applyBackgroundImage). A corrupted/truncated
        // localStorage value was causing the logo to render as blank space —
        // the fix is a single hardcoded constant, unconditionally applied,
        // with nothing left for localStorage to corrupt.
        function renderAgencyLogo() {
            const seal = document.getElementById('agency-seal');
            if (seal) seal.innerHTML = '<img src="' + AGENCY_LOGO + '" alt="Agency Logo">';
            const authSeal = document.getElementById('auth-seal');
            if (authSeal) authSeal.innerHTML = '<img src="' + AGENCY_LOGO + '" alt="Agency Logo" style="width:100%;height:100%;object-fit:cover;">';
        }

        /* =========================================================
           INACTIVITY REMINDER — triggered by user inactivity on the
           case (never by technical errors/glitches — see the
           TECHNICAL-INTERRUPTION AUTO-ARCHIVE block below for that).
           Threshold is 5 minutes of no detected activity. Once hit,
           the user gets a 30-second window to choose Continue,
           Archive Case (Save as Draft), or Start a New Case — if no
           response, the case is silently auto-archived as a draft.
           This applies to the CASE only — it does not log the user
           out, lock the screen, or affect anything else.
           ========================================================= */
        const INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
        const AUTO_ARCHIVE_COUNTDOWN_SECONDS = 30;
        let inactivityTimer = null;
        let autoArchiveTimer = null;
        let autoArchiveSecondsLeft = AUTO_ARCHIVE_COUNTDOWN_SECONDS;
        let autoArchivePromptOpen = false;

        function resetInactivityTimer() {
            if (autoArchivePromptOpen) return; // don't reset while the user is being asked to respond
            clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(checkInactivityAndPrompt, INACTIVITY_THRESHOLD_MS);
        }
        function checkInactivityAndPrompt() {
            // Only prompt if there's an actual case in progress worth protecting.
            if (!hasCaseContent()) { resetInactivityTimer(); return; }
            scheduleInactivityPrompt();
        }
        // Any real user activity resets the 5-minute inactivity clock.
        ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'input'].forEach(evt => {
            window.addEventListener(evt, resetInactivityTimer, { passive: true });
        });
        resetInactivityTimer();

        function scheduleInactivityPrompt() {
            if (autoArchivePromptOpen) return; // avoid stacking prompts
            autoArchivePromptOpen = true;
            autoArchiveSecondsLeft = AUTO_ARCHIVE_COUNTDOWN_SECONDS;
            const countdownEl = document.getElementById('auto-archive-countdown');
            countdownEl.innerText = autoArchiveSecondsLeft;
            document.getElementById('auto-archive-modal').classList.add('open');

            autoArchiveTimer = setInterval(() => {
                autoArchiveSecondsLeft -= 1;
                countdownEl.innerText = Math.max(autoArchiveSecondsLeft, 0);
                if (autoArchiveSecondsLeft <= 0) {
                    autoArchiveOnNoResponse();
                }
            }, 1000);
        }
        function closeInactivityPrompt() {
            clearInterval(autoArchiveTimer);
            autoArchiveTimer = null;
            autoArchivePromptOpen = false;
            document.getElementById('auto-archive-modal').classList.remove('open');
        }

        // "Continue" — user is still there; resume exactly where they left off.
        function continueEditing() {
            closeInactivityPrompt();
            resetInactivityTimer(); // give the user another full 5 minutes of activity
        }

        // "Archive Case (Save as Draft)" — an explicit user choice, so this
        // reuses the exact same path as the sidebar button (no permanent
        // Case ID is assigned; the usual confirmation is shown).
        function archiveFromInactivityPrompt() {
            closeInactivityPrompt();
            archiveCaseAsDraft();
            resetInactivityTimer();
        }

        // "Start a New Case" — an explicit user choice made via this
        // prompt, so it skips newCase()'s own confirm() dialog (the prompt
        // itself already serves as that confirmation). All progress is
        // wiped and currentCaseId is cleared, freeing that case-id "slot"
        // for the new, blank case — a real ID is only ever minted later,
        // when this new case is actually saved.
        function startNewCaseFromInactivityPrompt() {
            closeInactivityPrompt();
            blankCaseEditorContent();
            clearPersistedEditorState();
            currentCaseIsDraft = false;
            revertOther('main-case-type', 'main-case-other', 'main-revert');
            updatePhaseDisplay('INTAKE');
            generateCaseId();
            showTab('profile');
            renderRepo();
            showToast('Started a new case.', 'info');
            resetInactivityTimer();
        }

        // No response within the countdown — silently archive as a draft
        // so nothing is lost, then give the user a fresh 5-minute window.
        // No alert() here: the user isn't there to dismiss one.
        function autoArchiveOnNoResponse() {
            closeInactivityPrompt();
            autoSaveProgress('inactivity-timeout');
            resetInactivityTimer();
        }

        /* =========================================================
           TECHNICAL-INTERRUPTION AUTO-ARCHIVE — separate from the
           inactivity prompt above. Covers cases where the user didn't
           choose to leave: lost connectivity, the tab/browser closing,
           the app going to the background, or an abrupt shutdown. All
           of those are silently archived as a draft the instant any of
           these signals fire — no modal, no countdown, since there's
           no guarantee the user is present or that the page will stay
           alive long enough to show one.

           HONEST LIMITATION: none of these events can fire during a true
           instantaneous power loss (a brownout that cuts power before the
           browser gets to run any JS at all). The real safety net for
           that scenario is persistCurrentEditorState()'s continuous,
           synchronous localStorage writes (see IN-PROGRESS EDITOR
           PERSISTENCE above) — since those happen the moment the DOM
           changes rather than waiting for an unload-type event, the
           in-progress work is already on disk before the crash and gets
           restored automatically the next time the app loads.
           ========================================================= */
        let _lastTechnicalArchiveAt = 0;
        function silentTechnicalArchive(reason) {
            if (!hasCaseContent()) return; // nothing identifiable to archive yet
            const now = Date.now();
            if (now - _lastTechnicalArchiveAt < 2000) return; // multiple signals often fire together (e.g. pagehide + beforeunload on tab close) — only archive once
            _lastTechnicalArchiveAt = now;
            autoSaveProgress('technical-interruption:' + reason);
        }
        window.addEventListener('beforeunload', () => silentTechnicalArchive('unload'));
        window.addEventListener('pagehide', () => silentTechnicalArchive('pagehide'));
        window.addEventListener('offline', () => silentTechnicalArchive('offline'));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') silentTechnicalArchive('visibility-hidden');
        });

        /* =========================================================
           DOWNLOAD CONFIRMATION
           ========================================================= */
        function requestDownload() {
            if (currentCaseIsDraft || currentCaseId === null) {
                alert('This case doesn\'t have a permanent Case ID yet. Use "Save Case" to finalize it before downloading the summary.');
                return;
            }
            const session = getSession();
            const errorEl = document.getElementById('download-confirm-error');
            errorEl.style.display = 'none';
            if (!session) {
                // No verified session to pull identity from — surface this
                // instead of silently letting an unattributed copy through.
                document.getElementById('dl-fullname').innerText = '\u2014';
                document.getElementById('dl-batchid').innerText = '\u2014';
                errorEl.innerText = 'Your session could not be verified. Please log in again.';
                errorEl.style.display = 'block';
            } else {
                // Auto-filled from the logged-in account — no manual typing,
                // so there's nothing here for the user to get wrong.
                document.getElementById('dl-fullname').innerText = session.fullName;
                document.getElementById('dl-batchid').innerText = session.batchId;
            }
            document.getElementById('dl-date-preview').innerText = new Date().toLocaleString();
            document.getElementById('download-confirm-modal').classList.add('open');
        }
        function closeDownloadConfirm() { document.getElementById('download-confirm-modal').classList.remove('open'); }
        // Print Sequence is now a real, atomic, server-issued counter keyed on
        // this case's permanent Case ID (see /api/print-sequence and
        // nextPrintSequence() in _utils.js) — never a locally-guessed
        // localStorage count, so two people downloading the same case from
        // two different devices at the same moment can never get the same
        // number. This makes confirmDownload async.
        async function confirmDownload() {
            const session = getSession();
            const errorEl = document.getElementById('download-confirm-error');
            if (!session) {
                errorEl.innerText = 'Your session could not be verified. Please log in again.';
                errorEl.style.display = 'block';
                return;
            }
            // Identity is taken straight from the verified session — the same
            // source used everywhere else in the app — so it can't mismatch.
            const fullName = session.fullName;
            const batchId = session.batchId;
            errorEl.style.display = 'none';
            const producedAt = new Date().toLocaleString();

            // Pull the case's original submitter info from the shared repo
            // cache (purely descriptive metadata, already fetched from the
            // server — not itself a uniqueness guarantee, that's what
            // /api/print-sequence below is for).
            const rec = _repoCache.find(i => i.id === currentCaseId);
            const submittedBy = (rec && rec.submittedBy) || session.fullName;
            const submittedByBatch = (rec && rec.submittedByBatch) || session.batchId;
            const submittedAt = (rec && rec.submittedAt) ? new Date(rec.submittedAt).toLocaleString() : producedAt;
            const realCaseId = document.getElementById('case-id-field').innerText.trim();

            let printSequence = 1;
            try {
                const res = await fetch('/api/print-sequence', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ caseId: realCaseId })
                });
                const data = await res.json();
                if (data && data.success) {
                    printSequence = data.printSequence;
                } else {
                    errorEl.innerText = (data && data.error) || 'Could not assign a print sequence number.';
                    errorEl.style.display = 'block';
                    return;
                }
            } catch (e) {
                errorEl.innerText = 'Network error assigning print sequence. Please try again.';
                errorEl.style.display = 'block';
                return;
            }

            closeDownloadConfirm();
            downloadPDF({
                submittedBy: submittedBy,
                submittedByBatch: submittedByBatch,
                submittedAt: submittedAt,
                producedByName: fullName,
                producedByBatch: batchId,
                producedAt: producedAt,
                printSequence: printSequence
            });
        }


        /* =========================================================
           AUTO-FORMAT — masks field values to a consistent,
           professional format live, as the user types.
           ========================================================= */
        function getCaretOffset(el) {
            const sel = window.getSelection();
            if (!sel.rangeCount) return 0;
            const range = sel.getRangeAt(0);
            const pre = range.cloneRange();
            pre.selectNodeContents(el);
            pre.setEnd(range.endContainer, range.endOffset);
            return pre.toString().length;
        }
        function setCaretOffset(el, offset) {
            const sel = window.getSelection();
            const node = el.firstChild;
            if (!node || node.nodeType !== 3) { setCaretToEnd(el); return; }
            const pos = Math.max(0, Math.min(offset, node.length));
            const range = document.createRange();
            range.setStart(node, pos);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }
        function setCaretToEnd(el) {
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }

        // Live mask applied on every keystroke. Length-changing masks (phone/date/ssn/currency)
        // move the caret to the end, which is the standard, predictable behavior for masked inputs.
        // Case-only transforms (name/upper/email) preserve the caret's exact position.
        function liveFormatField(el) {
            const fmt = el.dataset.fmt;
            if (!fmt) return;
            const raw = el.innerText;
            if (!raw) return;
            let val = raw;
            let preserveCaret = false;
            const caretOffset = getCaretOffset(el);

            switch (fmt) {
                case 'phone': {
                    if (raw.includes('@')) { preserveCaret = true; break; } // likely an email in a combined field
                    const d = raw.replace(/\D/g, '').slice(0, 10);
                    if (d.length > 6) val = `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
                    else if (d.length > 3) val = `(${d.slice(0,3)}) ${d.slice(3)}`;
                    else if (d.length > 0) val = `(${d}`;
                    else val = '';
                    break;
                }
                case 'ssn': {
                    const d = raw.replace(/\D/g, '').slice(0, 9);
                    if (d.length > 5) val = `${d.slice(0,3)}-${d.slice(3,5)}-${d.slice(5)}`;
                    else if (d.length > 3) val = `${d.slice(0,3)}-${d.slice(3)}`;
                    else val = d;
                    break;
                }
                case 'date': {
                    const d = raw.replace(/\D/g, '').slice(0, 8);
                    if (d.length > 4) val = `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
                    else if (d.length > 2) val = `${d.slice(0,2)}/${d.slice(2)}`;
                    else val = d;
                    break;
                }
                case 'currency': {
                    let clean = raw.replace(/[^0-9.]/g, '');
                    const firstDot = clean.indexOf('.');
                    if (firstDot !== -1) clean = clean.slice(0, firstDot + 1) + clean.slice(firstDot + 1).replace(/\./g, '');
                    const parts = clean.split('.');
                    let intPart = (parts[0] || '').replace(/^0+(?=\d)/, '');
                    const decPart = parts.length > 1 ? '.' + parts[1].slice(0, 2) : '';
                    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                    val = raw.trim() ? '$ ' + (withCommas || '0') + decPart : '';
                    break;
                }
                case 'email': {
                    val = raw.toLowerCase().replace(/[^a-z0-9@._+\-]/g, '');
                    preserveCaret = true;
                    break;
                }
                case 'upper': {
                    val = raw.toUpperCase().replace(/[^A-Z0-9\- ]/g, '');
                    preserveCaret = true;
                    break;
                }
                case 'name': {
                    val = raw.replace(/[^a-zA-Z\s'\-.]/g, '');
                    val = val.replace(/(^|\s)([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase());
                    preserveCaret = true;
                    break;
                }
                case 'year': {
                    val = raw.replace(/\D/g, '').slice(0, 4);
                    break;
                }
                case 'alnum': {
                    val = raw.replace(/[^a-zA-Z0-9]/g, '');
                    preserveCaret = true;
                    break;
                }
            }

            if (val !== raw) {
                el.innerText = val;
                if (preserveCaret) setCaretOffset(el, caretOffset);
                else setCaretToEnd(el);
            }
        }

        // Final cleanup pass on blur: pads decimals, resolves full dates typed/pasted in other forms, etc.
        function finalizeFormatField(el) {
            const fmt = el.dataset.fmt;
            if (!fmt) return;
            let val = el.innerText.trim();
            if (!val) return;
            if (fmt === 'currency') {
                const n = parseFloat(val.replace(/[^0-9.\-]/g, ''));
                if (!isNaN(n)) val = '$ ' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else if (fmt === 'date' && !/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
                const parsed = new Date(val);
                if (!isNaN(parsed.getTime())) {
                    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
                    const dd = String(parsed.getDate()).padStart(2, '0');
                    val = `${mm}/${dd}/${parsed.getFullYear()}`;
                }
            }
            if (val !== el.innerText.trim()) el.innerText = val;
        }

        // Character-set restriction for plain <input> fields (registration, download confirmation, etc.)
        // Keeps only characters valid for the field's declared type as the user types.
        const ALLOW_PATTERNS = {
            'name': /[^a-zA-Z\s'\-.]/g,
            'alnum': /[^a-zA-Z0-9]/g,
            'alnum-upper': /[^a-zA-Z0-9]/g,
            'alnum-underscore': /[^a-zA-Z0-9_]/g,
            'email': /[^a-zA-Z0-9@._+\-]/g,
            'digits': /[^0-9]/g
        };
        document.addEventListener('input', (e) => {
            const el = e.target;
            if (!el || !el.matches || !el.matches('input[data-allow]')) return;
            const type = el.dataset.allow;
            const pattern = ALLOW_PATTERNS[type];
            if (!pattern) return;
            const start = el.selectionStart, end = el.selectionEnd;
            let val = el.value.replace(pattern, '');
            if (type === 'alnum-upper') val = val.toUpperCase();
            if (val !== el.value) {
                const removedBeforeCaret = el.value.slice(0, start).replace(pattern, '').length;
                el.value = val;
                el.setSelectionRange(removedBeforeCaret, removedBeforeCaret);
            }
        });

        document.addEventListener('input', (e) => {
            if (e.target && e.target.matches && e.target.matches('[contenteditable="true"][data-fmt]')) {
                liveFormatField(e.target);
            }
        });
        // focusout bubbles (unlike blur), so a single delegated listener covers every field, including dynamically added rows.
        document.addEventListener('focusout', (e) => {
            if (e.target && e.target.matches && e.target.matches('[contenteditable="true"][data-fmt]')) {
                finalizeFormatField(e.target);
            }
        });

        // Enter key: single-line fields commit the value instead of indenting/adding a new line.
        // Genuinely multi-line fields (narratives, notes) get a clean line break instead of the
        // browser's default nested <div>, which otherwise causes odd indentation/spacing.
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const el = e.target.closest ? e.target.closest('[contenteditable="true"]') : null;
            if (!el) return;
            e.preventDefault();
            if (el.classList.contains('multiline-field')) {
                document.execCommand('insertLineBreak');
            } else {
                el.blur();
            }
        });

        /* ---------- Init ---------- */
        window.addEventListener('DOMContentLoaded', () => {
            // Captured BEFORE any case content (own or restored draft) is ever
            // loaded into #capture-area, so it stays a clean, empty structural
            // template forever — used to render read-only previews of OTHER
            // users' cases (Monitoring) without ever touching the real editor.
            const captureArea = document.getElementById('capture-area');
            if (captureArea) _emptyCaptureAreaTemplate = captureArea.cloneNode(true);

            refreshRepoCache();
            applyPlaceholders();
            renderAgencyLogo();
            // Shows a live preview of the next Case ID (derived from how many
            // cases are actually saved) — never reserves/consumes a number.
            generateCaseId();
            populateTimezones();
            refreshClock();
            initEditorPersistence(); // start listening for edits to autosave across refreshes
            resumeSession(); // will call restoreCurrentEditorState() once authorized
            refreshSiteState();
        });
