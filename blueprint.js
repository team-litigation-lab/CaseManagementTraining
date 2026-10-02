/* =========================================================
   🧭 CMS BLUEPRINT (everyone signed in)
   A slide deck that explains the CMS, in two versions:
   - the Trainee blueprint: the screens a trainee uses (cases, intake, the case's tabs, saving,
     calendar and time, the Reception Simulator, My Dashboard);
   - the Trainer blueprint (Admins only): Master Control, users, monitoring and live view, Case
     Logs, broadcast, pause and lock, the Training Library, the Intake folder and Trainee view.
   Sidebar → 🧭 Blueprint (in #sb-work, after 📊 My Dashboard) opens it full screen. Trainees, and
   Admins in 👁 Trainee view (getSession() answers as a trainee there), get the trainee deck only;
   Admins get both, as tabs, so they can share the Trainee blueprint in Meet.
   ◀ ▶, the ← → keys or the contents strip move through it; Esc closes it.
   ⬇ Download PDF saves the deck that's showing, built in the browser with jsPDF (loaded from
   cdnjs the first time, as library-pdf.js does): real text, one landscape page per slide.
   The trainee deck never names the Training Library or the trainer-only tools.
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const session = () => (typeof getSession === 'function' ? getSession() : null);
    const isAdmin = () => { const s = session(); return !!(s && s.userType === 'Admin'); };

    /* ---------- the decks: { icon, title, points[], where, tip } ---------- */
    const TRAINEE = {
        key: 'trainee', name: 'Trainee blueprint', file: 'LSH_CMS_Blueprint_Trainee.pdf',
        cover: { title: 'Case Management System', sub: 'Trainee blueprint: how to use the CMS during your training' },
        slides: [
            { icon: '🏛', title: 'What the CMS is', points: [
                'A practice case management system: the kind of system a law firm uses to run its personal-injury cases.',
                'Every case and client here is fictional, so practise freely. Nothing you do reaches a real client.',
                'You open case files, take intakes, keep notes and tasks, book the calendar and log your time.',
                'Your trainer sees your saved work and your progress, and can help you as you work.'],
              where: 'Open it from your training platform, or go to the CMS sign-in page.',
              tip: 'Sign in with the name you registered with, so your trainer can follow your work.' },
            { icon: '🔑', title: 'Signing in and the sidebar', points: [
                'Register once with your full name, Batch ID and a username. Your trainer approves you.',
                'Then sign in with your username and Batch ID, or straight from your training platform by name.',
                'The sidebar, top to bottom: your training program, My cases, then your work buttons.',
                'Work buttons: 📝 New Intake, 📄 Download Case Summary, ⏱ the timer, 📞 Reception Simulator, 📊 My Dashboard and 🧭 Blueprint.'],
              where: 'The sidebar on the left. Log Out is at the bottom of it.',
              tip: 'A Batch ID is B and the day your batch started (DDMMYY), e.g. B300926.' },
            { icon: '🔍', title: 'Finding a case', points: [
                'My cases lists the cases and drafts you saved yourself, each with Open and 🗑 Delete.',
                'The 🔍 search bar in the case header finds case files by client name, case number, phone, date of birth or date of loss.',
                'Ctrl+K (Cmd+K on a Mac) jumps to the search from anywhere.',
                'Two clients can share a name: check the date of loss and the date of birth before you open one.'],
              where: 'Sidebar → My cases · the 🔍 search bar at the top right of the case.',
              tip: 'Case numbers look like LSH-2026-MVA-901379. Typing just 901379 finds it too.' },
            { icon: '📝', title: 'New Intake', points: [
                'Pick the case type: MVA, Slip and Fall, Premises Liability, Dog Bite or Medical Malpractice.',
                'Fill in its intake form, which follows the firm\'s intake sheet for that type of case.',
                'Saving grades your intake and creates the new case.',
                'An intake can go to the 📥 Intake folder first and be moved to the case files once it\'s accepted.'],
              where: 'Sidebar → 📝 New Intake.',
              tip: 'Get everything the form asks for before you end the call with a new client.' },
            { icon: '📁', title: 'The case file: the case bar and the first tabs', points: [
                'The case bar at the top shows the DATE OF LOSS, the STATUTE (SOL) and the LOCATION OF INCIDENT. Check them first.',
                'Profile: the client, the case narrative and the primary injury.',
                'Parties Involved · Police Report · Insurance · Liens.',
                'Treatment · Lost Wages · Property Damage · Demand.'],
              where: 'The tabs across the top of the open case, in two rows.',
              tip: 'Watch the SOL: it\'s the deadline the whole case runs against.' },
            { icon: '📂', title: 'The case file: the rest of the tabs', points: [
                'Settlement (BI / UM) and Litigation: offers, negotiations, the lawsuit and court dates.',
                'Finance: the case\'s costs and the settlement breakdown.',
                'Doc Hub: the case\'s documents. Drop files on it to add them.',
                'Notes and Tasks: log every call and action, and set the follow-ups.',
                '📅 Calendar and ⏱ Time: the attorneys\' calendars, and your time on the case.'],
              where: 'The second row of tabs on the open case.',
              tip: 'A note says who, what, when and the next step.' },
            { icon: '💾', title: 'Saving your work', points: [
                '💾 Save Case saves a new case and gives it its Case ID.',
                '⟳ Update Case saves your changes to a case that\'s already saved.',
                '🗄 Archive keeps it as a draft. 🗑 Discard Case throws it away (it asks first). ✕ Close closes it.',
                'Autosave steps in only when something interrupts you: the network drops, the tab closes, or you\'ve been away for 2 minutes.'],
              where: 'The bar at the bottom of the open case.',
              tip: 'Case files from the firm\'s library are view only, except their Notes and Tasks.' },
            { icon: '📅', title: 'Calendar and time', points: [
                '📅 Calendar tab: each attorney\'s calendar and the Firm / Staff calendar, already busy, as at a real firm.',
                'An event scheduled from the case is linked to it and goes on the case\'s attorney\'s calendar.',
                'It shows conflicts and the next free times, and flags weekends and times outside business hours.',
                '⏱ The sidebar timer: start, pause and stop, billable or non-billable. The ⏱ Time tab has your timesheet.'],
              where: 'The case\'s 📅 Calendar and ⏱ Time tabs · the timer in the sidebar.',
              tip: 'Start the timer when you open a case, and say what you did when you stop it.' },
            { icon: '📞', title: 'Reception Simulator', points: [
                'Practice calls: a caller phones in, and you take the whole call in your own words.',
                'Verify the caller before you share anything: full name, date of birth, date of loss and one more identifier.',
                'Find their file by ear: the search understands names spelled the way they sound.',
                'The scored drill: 5, 8, 12 or all the calls, each one scored, with feedback at the end.'],
              where: 'Sidebar → 📞 Reception Simulator.',
              tip: 'Never give advice or a case value on a call. Take a complete message instead.' },
            { icon: '📊', title: 'My Dashboard and the case summary', points: [
                '📊 My Dashboard: automatic reviews of the cases you saved, with what\'s missing and how complete each one is.',
                'Your trends over time, for completeness and for the writing in your notes.',
                '📄 Download Case Summary: a PDF of the case that\'s open.',
                'Your trainer sees the same reviews, so you can go through them together.'],
              where: 'Sidebar → 📊 My Dashboard · 📄 Download Case Summary (PDF).',
              tip: 'Open My Dashboard at the end of each day and fix what it flags.' },
            { icon: '✅', title: 'Good habits', points: [
                'Save as you finish each part: Save once, then Update.',
                'Read the announcements at the top of the screen, and answer your trainer\'s pings.',
                'A Paused or Locked screen means your trainer has paused the CMS. Wait: your work is kept.',
                'Use only the fictional details in the case files, never real client information.'],
              where: 'Announcements: the ticker at the top · pings pop up on your screen.',
              tip: 'Stuck? Ask your trainer. That\'s what the training is for.' }
        ]
    };
    const TRAINER = {
        key: 'trainer', name: 'Trainer blueprint', file: 'LSH_CMS_Blueprint_Trainer.pdf',
        cover: { title: 'Case Management System', sub: 'Trainer blueprint: running training in the CMS' },
        slides: [
            { icon: '🔑', title: 'Signing in as a trainer', points: [
                'Admin Portal tab: your first and last name, and the admin password.',
                'Each name is its own trainer account, so pings and the server logs show who did what.',
                'With no name you sign in as the Master Account, the only one that can revoke another Admin.',
                'You land in ⇄ Master Control. The sidebar\'s footer switches between it and the case workspace.'],
              where: 'The sign-in screen → Admin Portal.',
              tip: 'Ask the account owner for the admin password. It is never written in the CMS itself.' },
            { icon: '👥', title: 'Registrations and users', points: [
                'Registrations: approve the trainees who registered, or decline them.',
                'Users: every account, with trainees grouped by Batch ID, the newest batch first.',
                'Revoke or suspend access. ✎ Batch ID fixes a typo or moves a trainee to another batch.',
                'Batch IDs are B and the batch\'s start date (DDMMYY), e.g. B300926.'],
              where: 'Master Control → Registrations · Users.',
              tip: 'Approve the class before the first session, so nobody waits at the sign-in screen.' },
            { icon: '👁', title: 'Monitoring and live view', points: [
                'Monitoring: who\'s online now, and the server logs.',
                '👁 Watch live on a trainee: where they are, the case and tab, and a trail of what they did.',
                'Their case shows as they type it, refreshed every few seconds.',
                '📊 My Dashboard opens the trainer roster: every trainee\'s case reviews and trends.'],
              where: 'Master Control → Monitoring · sidebar → 📊 My Dashboard.',
              tip: 'Trainees see a notice while you watch them, so tell the class you may look in.' },
            { icon: '📋', title: 'Case Logs', points: [
                'Every saved case and draft, newest first, with the trainee who saved it.',
                'Search by client name, Case ID or trainee.',
                '🗑 Delete one, or tick several (or Select all shown) and delete them together.',
                'Deleting is permanent: it asks first, naming the case and the trainee.'],
              where: 'Master Control → Case Logs.',
              tip: 'Clear a finished batch\'s practice cases before the next class starts.' },
            { icon: '📣', title: 'Broadcast and ping', points: [
                'Announcement: a message in the ticker at the top of every screen.',
                'Alert: a banner that stays up until you stop it.',
                'Ping: a message to one trainee or several, which pops up on their screen.'],
              where: 'Master Control → Broadcast & Ping.',
              tip: 'Use a ping for one person, an announcement for the class, an alert for something urgent.' },
            { icon: '⏸', title: 'Access control', points: [
                '⏸ Pause: trainees see a paused screen and can\'t work. Their work is kept. Trainers are never paused.',
                '🔒 Lock: closes the CMS to trainees. It asks you to confirm.',
                'Database clean-up, for when the CMS needs maintenance.'],
              where: 'Master Control → Access Control.',
              tip: 'Pause for a break or a demo; Lock outside class hours.' },
            { icon: '📚', title: 'Training Library', points: [
                '📚 Training Library: the fictional mock case files, by training program.',
                'Trainees never see this name: to them these are ordinary case files with case numbers.',
                'Edit a file for everyone. The original stays in the code.',
                '☎ Caller scenarios and 📜 reception call scripts on each file are for trainers only.',
                '⬇ PDF: a trainer copy, with the keys, or the case files only.'],
              where: 'Sidebar → Trainer tools → 📚 Training Library.',
              tip: 'Run a mock call from a file\'s call script before the trainees try the Reception Simulator.' },
            { icon: '🔍', title: 'Case Library and Latest Updates', points: [
                '🔍 Open Case Library: every file and every trainee\'s saved cases, with filters and the ☎ firm directory.',
                '🕑 Latest Updates: cases by their latest update, with a search of the Case Notes.',
                'Export Case List downloads every trainee\'s cases as a list.'],
              where: 'Sidebar → Case Library · Trainer tools → Export Case List.',
              tip: 'Latest Updates is the quickest way to see who worked on what today.' },
            { icon: '📥', title: 'Intake folder', points: [
                '📥 Intake Folder: intake files, kept apart from the case files.',
                'Typed intakes are graded as they\'re saved. Uploaded intake sheets (PDF or image) wait for review.',
                '📂 Move to case files turns an accepted intake into a case with a Case ID.',
                'Trainees see only their own intake files.'],
              where: 'Sidebar → Trainer tools → 📥 Intake Folder.',
              tip: 'Review the intakes together after an intake exercise.' },
            { icon: '📅', title: 'Firm Calendar, time and drill results', points: [
                '📅 Firm Calendar: the attorneys\' calendars and the Firm / Staff calendar. An attorney\'s Google Calendar can be connected.',
                '⏱ Time tab → 👥 All trainees: everyone\'s time for the week, with totals, and ⬇ Export CSV.',
                '📞 Reception Simulator: every trainee\'s drill results and scores.'],
              where: 'Sidebar → Trainer tools → 📅 Firm Calendar · the case\'s ⏱ Time tab.',
              tip: 'Check the class\'s time sheets at the end of the week.' },
            { icon: '🧭', title: 'Trainee view and presenting', points: [
                '👁 Trainee view shows the CMS exactly as trainees see it. ⇦ Back to trainer view returns.',
                '🧭 Blueprint → Trainee blueprint is the deck to share in Google Meet on day one.',
                '⬇ Download PDF gives either blueprint as a handout.',
                'Trainees only ever see the Trainee blueprint.'],
              where: 'Sidebar footer → 👁 Trainee view · sidebar → 🧭 Blueprint.',
              tip: 'Walk the class through the Trainee blueprint, then let them open their first case.' }
        ]
    };

    let deck = TRAINEE, at = 0, ro = null;

    /* ---------- the page ---------- */
    function buildUI() {
        const dash = $id('dash-open-btn');
        if (dash && !$id('bp-open-btn')) {
            dash.insertAdjacentHTML('afterend', `<button id="bp-open-btn" onclick="openBlueprint()" class="w-full border border-slate-700 text-slate-400 py-2 rounded-lg text-[10px] font-bold uppercase hover:bg-slate-900">🧭 Blueprint</button>`);
        }
        if (!$id('blueprint-page')) {
            document.body.insertAdjacentHTML('beforeend', `
            <div id="blueprint-page" class="no-print" role="dialog" aria-label="CMS Blueprint">
                <div class="mc-header">
                    <div><h2 id="bp-title">CMS Blueprint</h2><div class="sub" id="bp-sub"></div></div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <button id="bp-pdf-btn" class="portal-toggle-btn" onclick="blueprintPdf()">⬇ Download PDF</button>
                        <button class="portal-toggle-btn" onclick="closeBlueprint()">✕ Close</button>
                    </div>
                </div>
                <div class="mc-tabs" id="bp-tabs">
                    <button class="mc-tab" data-deck="trainer" onclick="blueprintDeck('trainer')">Trainer blueprint</button>
                    <button class="mc-tab" data-deck="trainee" onclick="blueprintDeck('trainee')">Trainee blueprint</button>
                </div>
                <div id="bp-body">
                    <div id="bp-stage"><div id="bp-slide"></div></div>
                    <div id="bp-nav">
                        <button id="bp-prev" onclick="blueprintGo(-1)" aria-label="Previous slide">◀</button>
                        <div id="bp-toc"></div>
                        <span id="bp-count"></span>
                        <button id="bp-next" onclick="blueprintGo(1)" aria-label="Next slide">▶</button>
                    </div>
                </div>
            </div>`);
            const stage = $id('bp-stage');
            if (window.ResizeObserver) { ro = new ResizeObserver(() => fit()); ro.observe(stage); }
            window.addEventListener('resize', fit);
        }
    }

    function slideHtml(d, i) {
        const total = d.slides.length + 1;
        if (i === 0) {
            return `<div class="bp-cover">
                <div class="bp-cover-top">
                    <img src="lsh-logo-dark.png" alt="Legal Support Help" class="bp-cover-logo">
                    <div><div class="bp-kicker">${esc(d.name)}</div><h1>${esc(d.cover.title)}</h1></div>
                </div>
                <div class="bp-cover-body">
                    <p class="bp-cover-sub">${esc(d.cover.sub)}</p>
                    <ol class="bp-contents">${d.slides.map((s, k) => `<li><span>${k + 1}</span>${esc(s.title)}</li>`).join('')}</ol>
                </div>
            </div>`;
        }
        const s = d.slides[i - 1];
        return `<div class="bp-card">
            <div class="bp-head">
                <div class="bp-icon">${s.icon}</div>
                <div><div class="bp-kicker">${esc(d.name)} · ${i} of ${total - 1}</div><h1>${esc(s.title)}</h1></div>
            </div>
            <div class="bp-main">
                <ul class="bp-points">${s.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
                <div class="bp-side">
                    <div class="bp-where"><div class="bp-label">Where to find it</div>${esc(s.where)}</div>
                    <div class="bp-tip"><div class="bp-label">Tip</div>${esc(s.tip)}</div>
                </div>
            </div>
            <div class="bp-foot"><span>LSH Case Management System</span><span>${i + 1} / ${total}</span></div>
        </div>`;
    }

    // The slide is laid out at a fixed size (landscape, or portrait on a narrow screen) and scaled to fit.
    function fit() {
        const stage = $id('bp-stage'), slide = $id('bp-slide');
        if (!stage || !slide || !$id('blueprint-page').classList.contains('open')) return;
        const W = stage.clientWidth, H = stage.clientHeight;
        const portrait = W < 760;
        const BW = portrait ? 620 : 1280, BH = portrait ? 1000 : 720;
        slide.classList.toggle('portrait', portrait);
        slide.style.width = BW + 'px'; slide.style.height = BH + 'px';
        const k = Math.max(0.1, Math.min(W / BW, H / BH));
        slide.style.transform = `translate(-50%, -50%) scale(${k})`;
    }

    function paint() {
        const total = deck.slides.length + 1;
        at = Math.max(0, Math.min(total - 1, at));
        $id('bp-slide').innerHTML = slideHtml(deck, at);
        $id('bp-slide').dataset.deck = deck.key;
        $id('bp-count').textContent = `${at + 1} / ${total}`;
        $id('bp-prev').disabled = at === 0; $id('bp-next').disabled = at === total - 1;
        $id('bp-toc').innerHTML = ['Cover'].concat(deck.slides.map(s => s.title)).map((t, k) =>
            `<button class="${k === at ? 'on' : ''}" title="${esc(t)}" onclick="blueprintGo(${k}, true)">${k === 0 ? '★' : k}</button>`).join('');
        $id('bp-sub').textContent = deck.name;
        const admin = isAdmin();
        $id('bp-tabs').style.display = admin ? '' : 'none';
        document.querySelectorAll('#bp-tabs .mc-tab').forEach(b => b.classList.toggle('active', b.dataset.deck === deck.key));
        fit();
    }

    window.openBlueprint = function (which) {
        if (!session()) return;
        buildUI();
        deck = isAdmin() && which !== 'trainee' ? TRAINER : TRAINEE; at = 0;
        $id('blueprint-page').classList.add('open');
        document.body.classList.add('mc-active');
        paint();
    };
    window.closeBlueprint = function () {
        const p = $id('blueprint-page'); if (!p) return;
        p.classList.remove('open');
        if (!document.querySelector('#master-control-page.open, #trainee-dashboard-page.open')) document.body.classList.remove('mc-active');
    };
    // Admins only: a trainee (or Trainee view) always gets the trainee deck.
    window.blueprintDeck = function (which) { deck = which === 'trainer' && isAdmin() ? TRAINER : TRAINEE; at = 0; paint(); };
    window.blueprintGo = function (n, absolute) { at = absolute ? n : at + n; paint(); };

    document.addEventListener('keydown', (e) => {
        const p = $id('blueprint-page');
        if (!p || !p.classList.contains('open')) return;
        const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
        if (typing) return;
        if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); blueprintGo(1); }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); blueprintGo(-1); }
        else if (e.key === 'Escape') closeBlueprint();
    });

    /* ---------- the PDF (jsPDF, real text; loaded the first time, like library-pdf.js) ---------- */
    const JSPDF_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js';
    let JsPDF = null;
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load the PDF maker. Check your connection and try again.'));
            document.head.appendChild(s);
        });
    }
    // Our own jsPDF, whatever else the page has on window.jspdf (html2pdf bundles its own).
    async function loadJsPdf() {
        if (JsPDF) return JsPDF;
        const before = window.jspdf;
        await loadScript(JSPDF_SRC);
        JsPDF = window.jspdf && window.jspdf.jsPDF;
        if (before !== undefined) window.jspdf = before;
        if (!JsPDF) throw new Error('The PDF maker did not load. Try again.');
        return JsPDF;
    }
    // The built-in PDF fonts cover Windows-1252 only: drop the emoji, keep the words.
    const clean = (s) => String(s == null ? '' : s).replace(/→/g, '->').replace(/⇄/g, '<->').replace(/⇦/g, '<-')
        .replace(/[^\x00-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, '').replace(/\(\s+/g, '(').replace(/ {2,}/g, ' ').trim();
    const NAVY = [15, 33, 72], ORANGE = [249, 115, 22], INK = [30, 41, 59], MUTED = [100, 116, 139], SOFT = [241, 245, 249], LINE = [226, 232, 240];

    async function imageData(src) {
        try {
            const blob = await (await fetch(src)).blob();
            return await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.onerror = () => r(null); f.readAsDataURL(blob); });
        } catch (e) { return null; }
    }

    function buildPdf(d, logo) {
        const doc = new JsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape', compress: true });
        const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 46;
        const total = d.slides.length + 1;
        const font = (size, style, color) => { doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size); doc.setTextColor(...(color || INK)); };
        const footer = (i) => {
            doc.setDrawColor(...LINE); doc.setLineWidth(0.6); doc.line(M, H - 34, W - M, H - 34);
            font(8, 'normal', MUTED);
            doc.text(clean(`LSH Case Management System · ${d.name}`), M, H - 20);
            doc.text(`${i + 1} / ${total}`, W - M, H - 20, { align: 'right' });
        };

        // the cover
        doc.setFillColor(...NAVY); doc.rect(0, 0, W, 150, 'F');
        doc.setFillColor(...ORANGE); doc.rect(0, 150, W, 5, 'F');
        if (logo) { try { doc.addImage(logo, 'PNG', M, 32, 136, 85); } catch (e) { /* the cover works without it */ } }
        font(11, 'bold', ORANGE); doc.text(clean(d.name).toUpperCase(), logo ? M + 156 : M, 70, { charSpace: 1.2 });
        font(26, 'bold', [255, 255, 255]); doc.text(clean(d.cover.title), logo ? M + 156 : M, 102);
        font(13, 'normal', INK); doc.text(doc.splitTextToSize(clean(d.cover.sub), W - 2 * M), M, 190);
        font(10, 'bold', MUTED); doc.text('CONTENTS', M, 228, { charSpace: 1 });
        const half = Math.ceil(d.slides.length / 2), colW = (W - 2 * M - 30) / 2;
        d.slides.forEach((s, k) => {
            const x = k < half ? M : M + colW + 30, y = 254 + (k % half) * 26;
            doc.setFillColor(...ORANGE); doc.roundedRect(x, y - 12, 18, 16, 3, 3, 'F');
            font(9, 'bold', [255, 255, 255]); doc.text(String(k + 1), x + 9, y - 1, { align: 'center' });
            font(12, 'normal', INK); doc.text(clean(s.title), x + 28, y);
        });
        footer(0);

        // one page a slide
        d.slides.forEach((s, k) => {
            doc.addPage();
            doc.setFillColor(...NAVY); doc.rect(0, 0, W, 92, 'F');
            doc.setFillColor(...ORANGE); doc.rect(0, 92, W, 4, 'F');
            font(9.5, 'bold', ORANGE); doc.text(clean(`${d.name} · ${k + 1} of ${d.slides.length}`).toUpperCase(), M, 38, { charSpace: 1 });
            font(23, 'bold', [255, 255, 255]); doc.text(clean(s.title), M, 70);
            // the points, left
            const sideX = W - M - 230, textW = sideX - M - 40;
            let y = 142;
            s.points.forEach(p => {
                font(15.5, 'normal', INK);
                const lines = doc.splitTextToSize(clean(p), textW - 22);
                doc.setFillColor(...ORANGE); doc.rect(M, y - 9.5, 7.5, 7.5, 'F');
                doc.text(lines, M + 22, y, { lineHeightFactor: 1.3 });
                y += lines.length * 20 + 16;
            });
            // where to find it and the tip, right
            const box = (label, text, top, fill, stripe) => {
                font(12, 'normal', INK);
                const lines = doc.splitTextToSize(clean(text), 230 - 28);
                const h = 42 + lines.length * 16;
                doc.setFillColor(...fill); doc.roundedRect(sideX, top, 230, h, 6, 6, 'F');
                if (stripe) { doc.setFillColor(...stripe); doc.rect(sideX, top, 4, h, 'F'); }
                font(8.5, 'bold', stripe ? ORANGE : NAVY); doc.text(label.toUpperCase(), sideX + 14, top + 20, { charSpace: 1 });
                font(12, 'normal', INK); doc.text(lines, sideX + 14, top + 39, { lineHeightFactor: 1.3 });
                return top + h;
            };
            const after = box('Where to find it', s.where, 128, SOFT, null);
            box('Tip', s.tip, after + 16, [255, 247, 237], ORANGE);
            footer(k + 1);
        });
        doc.setProperties({ title: clean(`LSH CMS ${d.name}`), subject: 'How the LSH Case Management System works', creator: 'LSH Case Management System' });
        return doc;
    }

    window.blueprintPdf = async function () {
        const btn = $id('bp-pdf-btn');
        const d = isAdmin() ? deck : TRAINEE;
        try {
            if (btn) { btn.disabled = true; btn.textContent = '⏳ Making the PDF…'; }
            await loadJsPdf();
            const doc = buildPdf(d, await imageData('lsh-logo-dark.png'));
            doc.save(d.file);
            if (typeof showToast === 'function') showToast(`${d.name} downloaded (PDF).`, 'success');
            return { name: d.file, pages: doc.getNumberOfPages() };
        } catch (e) {
            if (typeof showToast === 'function') showToast(e.message || 'The PDF could not be made.', 'error');
            else alert(e.message || 'The PDF could not be made.');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '⬇ Download PDF'; }
        }
    };

    // for the test: the decks' text
    window.CMS_BLUEPRINT = { trainee: TRAINEE, trainer: TRAINER };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUI); else buildUI();
})();
