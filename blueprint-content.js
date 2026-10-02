/* 🧭 The CMS Blueprint's slides (lsh-blueprint.js draws them and makes the PDFs).
   TRAINEE: what a trainee uses. It never names the Training Library or the trainer tools.
   TRAINER: the trainer side (Admins only).
   A slide is { icon, title, points: [...], where, tip }. Change the wording here; the page and the
   PDFs are made from it each time, stamped with the deployed version. README → 🧭 Blueprint. */
(function () {
    'use strict';
    const TRAINEE = {
        sub: 'How to use the CMS during your training',
        slides: [
            { icon: '🏛', title: 'What the CMS is', points: [
                'A practice case management system: the kind of system a law firm uses to run its personal-injury cases.',
                'Every case and client here is fictional, so practise freely. Nothing you do reaches a real client.',
                'You open case files, take intakes, keep notes and tasks, book the calendar and log your time.',
                'Your trainer sees your saved work and your progress, and can help you as you work.'],
              where: 'Open it from your training platform, or go to the CMS sign-in page.',
              tip: 'Use the username you registered with, so your trainer can follow your work.' },
            { icon: '🔑', title: 'Signing in and the sidebar', points: [
                'Register once with your full name, Batch ID and a username. Your trainer approves you.',
                'Then sign in with just your username, or straight from your training platform by name.',
                'The sidebar, top to bottom: your training program, My cases, then your work buttons.',
                'Work buttons: 📝 New Intake, 📄 Download Case Summary, ⏱ the timer, 📞 Reception Simulator, 📊 My Dashboard and 🧭 Blueprint.'],
              where: 'The sidebar on the left. Log Out is at the bottom of it.',
              tip: 'Your trainer gives you the Batch ID: B and the day your batch started (DDMMYY), e.g. B300926.' },
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
        sub: 'Running training in the CMS',
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
                'Every trainee\'s saved cases and drafts are also in Master Control → Case Logs.'],
              where: 'Sidebar → Case Library · 🔍 Open Case Library · 🕑 Latest Updates.',
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
                '👁 Trainee view shows the CMS exactly as trainees see it. ⇦ Back to trainer view, in the sidebar, returns.',
                '🧭 Blueprint → Trainee blueprint is the deck to share in Google Meet on day one.',
                '⬇ Download PDF gives either blueprint as a handout.',
                'Trainees only ever see the Trainee blueprint.'],
              where: 'Sidebar footer → 👁 Trainee view · sidebar → 🧭 Blueprint.',
              tip: 'Walk the class through the Trainee blueprint, then let them open their first case.' }
        ]
    };


    // The deployed version: the page's ETag (it changes with every deploy), shortened.
    let ver = null;
    function version() {
        if (ver) return ver;
        ver = fetch(location.pathname, { method: 'HEAD', cache: 'no-store' })
            .then(r => { const t = (r.headers.get('etag') || '').replace(/^W\//, '').replace(/[^A-Za-z0-9]/g, ''); return t ? 'deploy ' + t.slice(0, 8) : ''; })
            .catch(() => '');
        return ver;
    }
    window.LSH_BLUEPRINT = {
        product: 'Case Management System',
        site: 'LSH Case Management System',
        file: 'LSH_CMS',
        logo: 'lsh-logo-dark.png',
        trainee: TRAINEE,
        trainer: TRAINER,
        // getSession() answers as a trainee in Trainee view, so an Admin there gets the trainee deck only
        role: () => { const s = typeof getSession === 'function' ? getSession() : null; return !s ? null : s.userType === 'Admin' ? 'trainer' : 'trainee'; },
        version,
        // the sidebar, right after 📊 My Dashboard, styled like it
        mount: (html) => {
            const dash = document.getElementById('dash-open-btn');
            if (!dash) return;
            dash.insertAdjacentHTML('afterend', html);
            document.getElementById('lbp-open-btn').className = dash.className;
        }
    };
})();
