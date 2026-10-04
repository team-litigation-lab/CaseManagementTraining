/* 🧭 The CMS Blueprint's slides (lsh-blueprint.js draws them and makes the PDFs).
   TRAINEE: what a trainee uses. It never names the Training Library or the trainer tools.
   TRAINER: the trainer side (Admins only).
   ADMIN: running the CMS itself (the Master Account only: canAdmin).
   A slide is { icon, title, points: [...], where, tip, shot, shotAlt }. Change the wording here; the page and the
   PDFs are made from it each time, stamped with the deployed version. README → 🧭 Blueprint.
   shot: a screenshot of the CMS in blueprint/ (node .github/scripts/blueprint-shots.cjs takes them again). */
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
              tip: 'Use the username you registered with, so your trainer can follow your work.',
              shot: 'blueprint/trainee-case-file.jpg', shotAlt: 'A case file open in the CMS: the client\'s name, contact, ID card, the case bar and the tabs' },
            { icon: '🔑', title: 'Signing in and the sidebar', points: [
                'Register once with your full name, Batch ID and a username. Your trainer approves you.',
                'Then sign in with just your username, or straight from your training platform by name.',
                'The sidebar, top to bottom: your training program, My cases, then your work buttons.',
                'Work buttons: 📝 New Intake, 📄 Download Case Summary, ⏱ the timer, 📞 Reception Simulator, 📊 My Dashboard and 🧭 Blueprint.'],
              where: 'The sidebar on the left. Log Out is at the bottom of it.',
              tip: 'Your trainer gives you the Batch ID: B and the day your batch started (DDMMYY), e.g. B300926.',
              shot: 'blueprint/trainee-sign-in.jpg', shotAlt: 'The CMS sign-in screen: Trainee Portal, username, Log In' },
            { icon: '🔍', title: 'Finding a case', points: [
                'My cases lists the cases and drafts you saved yourself, each with Open and 🗑 Delete.',
                'The 🔍 search bar in the case header finds case files by client name, case number, phone, date of birth or date of loss.',
                'Ctrl+K (Cmd+K on a Mac) jumps to the search from anywhere.',
                'Two clients can share a name: check the date of loss and the date of birth before you open one.'],
              where: 'Sidebar → My cases · the 🔍 search bar at the top right of the case.',
              tip: 'Case numbers look like LSH-2026-MVA-901379. Typing just 901379 finds it too.',
              shot: 'blueprint/trainee-search.jpg', shotAlt: 'The search bar showing four Maria Santos files, each with its case number, date of birth and date of loss' },
            { icon: '📇', title: 'Contacts', points: [
                'A card for everyone in the case files: medical providers, adjusters, opposing counsel, clients and others.',
                'Each card has the phone, email or address on file and the cases the contact is on. Click a case to open it.',
                'Search by name, company, phone (any format), email, claim number or client.',
                'Others: emergency contacts, the parties at fault, lien holders, health plans, police agencies and employers.'],
              where: 'Sidebar → 📇 Contacts, under My cases · the small 📇 search bar under Search cases, at the top right of the case.',
              tip: 'A provider or an adjuster on the line? Search their number to see which cases they\'re on, then route the call.',
              shot: 'blueprint/trainee-contacts.jpg', shotAlt: '📇 Contacts: the cards for everyone on Linda Garcia\'s case, from her providers to the defense counsel' },
            { icon: '📝', title: 'New Intake', points: [
                'Pick the case type: MVA, Slip and Fall, Premises Liability, Dog Bite or Medical Malpractice.',
                'Fill in its intake form, which follows the firm\'s intake sheet for that type of case.',
                'Saving grades your intake and creates the new case.',
                'An intake can go to the 📥 Intake folder first and be moved to the case files once it\'s accepted.'],
              where: 'Sidebar → 📝 New Intake.',
              tip: 'Get everything the form asks for before you end the call with a new client.',
              shot: 'blueprint/trainee-new-intake.jpg', shotAlt: 'The MVA intake form: Injured Party, Facts on the Incident and the other sections' },
            { icon: '📁', title: 'The case file: the case bar and the first tabs', points: [
                'The header: the client\'s name, contact, SSN, date of birth and the client\'s ID (click it to see it larger).',
                'The case bar shows the DATE OF LOSS, the STATUTE (SOL) and the LOCATION OF INCIDENT. Check them first.',
                'Profile: the client (with the non-economic damages: how the injury changed their life), the narrative and the primary injury.',
                'Parties Involved · Police Report · Insurance · Liens.',
                'Treatment · Lost Wages · Property Damage · Demand (⬆ Upload Demand attaches the letter).'],
              where: 'The tabs across the top of the open case, in two rows.',
              tip: 'Watch the SOL: it\'s the deadline the whole case runs against.',
              shot: 'blueprint/trainee-insurance.jpg', shotAlt: 'The tabs of a case file, on the Insurance tab' },
            { icon: '📂', title: 'The case file: the rest of the tabs', points: [
                'Settlement (BI / UM) and Litigation: offers, negotiations, the lawsuit, the opposing counsel and court dates.',
                'Finance: the case\'s costs and the settlement breakdown.',
                'Doc Hub: the case\'s documents. Drop files on it to add them.',
                'Notes and Tasks: log every call and action, and set the follow-ups.',
                '📅 Calendar and ⏱ Time: the attorneys\' calendars, and your time on the case.'],
              where: 'The second row of tabs on the open case.',
              tip: 'A note says who, what, when and the next step.',
              shot: 'blueprint/trainee-notes.jpg', shotAlt: 'The Case Notes tab: date, staff member and the note' },
            { icon: '💾', title: 'Saving your work', points: [
                '💾 Save Case saves a new case and gives it its Case ID.',
                '⟳ Update Case saves your changes to a case that\'s already saved.',
                '🗄 Archive keeps it as a draft. 🗑 Discard Case throws it away (it asks first). ✕ Close closes it.',
                'Autosave steps in only when something interrupts you: the network drops, the tab closes, or you\'ve been away for 2 minutes.'],
              where: 'The bar at the bottom of the open case.',
              tip: 'Case files from the firm\'s library are view only, except their Notes and Tasks.',
              shot: 'blueprint/trainee-tasks.jpg', shotAlt: 'A case on the Tasks tab, with Close, Discard Case, Save Case and Update Case at the bottom' },
            { icon: '📅', title: 'Calendar and time', points: [
                '📅 Calendar tab: each attorney\'s calendar and the Firm / Staff calendar, already busy, as at a real firm.',
                'An event scheduled from the case is linked to it and goes on the case\'s attorney\'s calendar.',
                'It shows conflicts and the next free times, and flags weekends and times outside business hours.',
                '⏱ The sidebar timer: start, pause and stop, billable or non-billable. The ⏱ Time tab has your timesheet.'],
              where: 'The case\'s 📅 Calendar and ⏱ Time tabs · the timer in the sidebar.',
              tip: 'Start the timer when you open a case, and say what you did when you stop it.',
              shot: 'blueprint/trainee-calendar.jpg', shotAlt: 'The case\'s Calendar tab: the attorneys\' week, already busy' },
            { icon: '📞', title: 'Reception Simulator', points: [
                'Practice calls: a caller phones in, and you take the whole call in your own words.',
                'Verify the caller before you share anything: full name, date of birth, date of loss and one more identifier.',
                'Find their file by ear: the search understands names spelled the way they sound.',
                'The scored drill: 5, 8, 12 or all the calls, each one scored, with feedback at the end.'],
              where: 'Sidebar → 📞 Reception Simulator.',
              tip: 'Never give advice or a case value on a call. Take a complete message instead.',
              shot: 'blueprint/trainee-reception.jpg', shotAlt: 'The Reception Simulator: Take a practice call, and the scored drill' },
            { icon: '📊', title: 'My Dashboard and the case summary', points: [
                '📊 My Dashboard: automatic reviews of the cases you saved, with what\'s missing and how complete each one is.',
                'Your trends over time, for completeness and for the writing in your notes.',
                '📄 Download Case Summary: a PDF of the case that\'s open.',
                'Your trainer sees the same reviews, so you can go through them together.'],
              where: 'Sidebar → 📊 My Dashboard · 📄 Download Case Summary (PDF).',
              tip: 'Open My Dashboard at the end of each day and fix what it flags.',
              shot: 'blueprint/trainee-dashboard.jpg', shotAlt: 'My Dashboard: the checks on a saved case, what was updated, and a note from the trainer' },
            { icon: '✅', title: 'Good habits', points: [
                'Save as you finish each part: Save once, then Update.',
                'Read the announcements at the top of the screen, and answer your trainer\'s pings.',
                'A Paused screen means your trainer has paused the CMS. Wait: your work is kept.',
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
                'With no name you sign in as the Master Account, the one that runs the system (it has the Admin blueprint).',
                'You land in ⇄ Master Control. The sidebar\'s footer switches between it and the case workspace.'],
              where: 'The sign-in screen → Admin Portal.',
              tip: 'Ask the Master Account\'s owner for the admin password. It is never written in the CMS itself.',
              shot: 'blueprint/trainer-sign-in.jpg', shotAlt: 'The Admin Portal sign-in: your name and the admin password' },
            { icon: '🗓', title: 'Before a batch starts', points: [
                'Set the Batch ID: B and the batch\'s start date (DDMMYY), e.g. B061026 for 6 October 2026. Trainees type it when they register.',
                'Send the class the CMS link with their program on it (next slide).',
                'Approve the registrations in Master Control → Registrations, and check each Batch ID.',
                'Once approved, trainees sign in with just their username.',
                '👁 Trainee view shows the CMS the way they\'ll see it.'],
              where: 'Master Control → Registrations · sidebar footer → 👁 Trainee view.',
              tip: 'Approve the class before the first session, so nobody waits at the sign-in screen.',
              shot: 'blueprint/trainer-registrations.jpg', shotAlt: 'Master Control, Registrations: three trainees waiting, with Approve and Reject' },
            { icon: '🔗', title: 'Program links', points: [
                'A program link is the CMS address with ?program= and a program on the end, e.g. …/?program=intake. The CMS opens in that course\'s role.',
                'The role decides which tabs of a case file a trainee can edit. It shows in the sidebar\'s Training program box.',
                'reception: Front Desk, view only plus Notes and Tasks · intake: the header, Profile, Parties, Police, Insurance · cm: all but Litigation and Finance.',
                'md: Treatment, Lost Wages, Liens, Demand · ea: Doc Hub · pd: Property Damage, Insurance, Parties, Police. All but reception also get Doc Hub, Notes and Tasks.',
                'Straight to a tool: &drill=1 (Reception Simulator), &intake=1 (Intake folder), &mock=MC-04 (one file).'],
              where: 'The end of the CMS address you send the class, e.g. ?program=reception&drill=1.',
              tip: 'No program on the link: case files are view only until the trainee picks one in the sidebar.',
              shot: 'blueprint/trainer-program-link.jpg', shotAlt: 'A case file opened with the Front Desk link: the banner says it is view only for Receptionist / Front Desk' },
            { icon: '👥', title: 'Registrations and users', points: [
                'Registrations: approve the trainees who registered, or decline them.',
                'Users: every account, with trainees grouped by Batch ID, the newest batch first.',
                'Revoke or suspend access. ✎ Batch ID fixes a typo or moves a trainee to another batch.',
                'Batch IDs are B and the batch\'s start date (DDMMYY), e.g. B300926.'],
              where: 'Master Control → Registrations · Users.',
              tip: 'A trainee who can\'t sign in is usually pending, suspended or revoked: check Users.',
              shot: 'blueprint/trainer-users.jpg', shotAlt: 'Master Control, Users: the admins, and the trainees grouped by Batch ID' },
            { icon: '👁', title: 'Monitoring and Watch live', points: [
                'Monitoring: who\'s online now (seen in the last 90 seconds), and the server logs.',
                '👁 Watch live on a trainee: their actual screen, about a second behind: the case, the tab, what they type, the windows they open.',
                'Click a trainee\'s row for their latest saved case, read only.',
                '📊 My Dashboard opens the trainer roster: every trainee\'s case reviews and trends.'],
              where: 'Master Control → Monitoring · sidebar → 📊 My Dashboard.',
              tip: 'Nothing on their screen shows you\'re watching: tell the class trainers may look in. Ask them to keep the CMS in its own window.',
              shot: 'blueprint/trainer-monitoring.jpg', shotAlt: 'Master Control, Monitoring: trainees online, each with Watch live' },
            { icon: '📋', title: 'Case Logs', points: [
                'Every saved case and draft, newest first, with the trainee who saved it.',
                'Search by client name, Case ID or trainee; see a case\'s previous versions.',
                '🗑 Delete one, or tick several (or Select all shown) and delete them together.',
                'Deleting is permanent: it asks first, naming the case and the trainee.'],
              where: 'Master Control → Case Logs.',
              tip: 'Clear a finished batch\'s practice cases before the next class starts.',
              shot: 'blueprint/trainer-case-logs.jpg', shotAlt: 'Master Control, Case Logs: every saved case, newest first' },
            { icon: '📣', title: 'Broadcast and ping', points: [
                'Announcement: a message in the ticker at the top of every screen.',
                'Alert: a full-screen banner that stays up until you stop it.',
                'Ping: a message to one trainee or several, which pops up on their screen. Send as a task puts it in their case\'s Tasks when they accept it.',
                'Open pages check every 15 seconds; a ping more than a minute old isn\'t shown.'],
              where: 'Master Control → Broadcast & Ping.',
              tip: 'Use a ping for one person, an announcement for the class, an alert for something urgent.',
              shot: 'blueprint/trainer-broadcast.jpg', shotAlt: 'Master Control, Broadcast & Ping: the announcement and the alert' },
            { icon: '⏸', title: 'Access control', points: [
                '⏸ Pause: trainees see a paused screen and can\'t work. Their work is kept. Trainers are never paused.',
                '⏵ Resume lifts it for everyone at once; nobody is signed out.',
                'Database Maintenance (🧹 Clear old data) is for the Master Account only.'],
              where: 'Master Control → Access Control.',
              tip: 'Pause for a break or a demo. To keep one trainee out, suspend their account in Users.',
              shot: 'blueprint/trainer-access.jpg', shotAlt: 'Master Control, Access Control: Pause Activity' },
            { icon: '📚', title: 'Training Library', points: [
                '📚 Training Library: 52 fictional case files (MC-01 to MC-52), by training program.',
                'Trainees never see this name: to them these are ordinary case files with case numbers.',
                'Edit a file for everyone with 💾 Save to the library; the list marks it ✎ edited. ↺ Restore the original undoes it.',
                '☎ Caller scenarios and 📜 reception call scripts on each file are for trainers only.',
                '⬇ PDF: a trainer copy, with the answer keys (never hand it out), or the case files only.'],
              where: 'Sidebar → Trainer tools → 📚 Training Library.',
              tip: 'Run a mock call from a file\'s call script before the trainees try the Reception Simulator.',
              shot: 'blueprint/trainer-library.jpg', shotAlt: 'The Training Library: the case files by program, with the PDF buttons' },
            { icon: '🪪', title: 'The case header', points: [
                'The client\'s details at the top of every case: Client\'s Name, Contact, SSN, Target Settlement, Attorney, Case Manager and DOB.',
                'The SSN is the Profile tab\'s too (typing in either changes both). The DOB is typed in the header only.',
                'Client\'s ID: a library client has a mock ID (marked SPECIMEN); any other client gets ⬆ Upload ID.',
                'Click the ID to see it larger. An uploaded ID can be replaced or removed, and is kept with the case once it\'s saved.'],
              where: 'The top of the open case.',
              tip: 'Have trainees check the ID against the file: name, date of birth and address.',
              shot: 'blueprint/trainer-case-header.jpg', shotAlt: 'The case header: Client\'s Name, Contact, SSN, Attorney, Case Manager and the client\'s ID card' },
            { icon: '🎭', title: 'Facilitated mock calls', points: [
                'Prepare: Training Library → the file → ☎ Caller scenarios → 📜 Reception call script: your opening line and every answer.',
                'The trainee opens the CMS with the Front Desk link (?program=reception), so the file is view only, as at a real front desk.',
                'Play the caller over Google Meet: answer only what they ask, as the script says, wrong answers included.',
                'Watch them search, open the file and take notes: Master Control → Monitoring → 👁 Watch live.',
                'Score with the script\'s sheet (file 30, decision 30, identifiers 10, handling 30) or the RECEPTION MOCK CALL scorecard.'],
              where: 'Training Library → ☎ Caller scenarios · Master Control → Monitoring.',
              tip: 'Feedback: two strengths, one thing to fix, and the line they could have said.',
              shot: 'blueprint/trainer-caller-scenarios.jpg', shotAlt: 'A case file\'s Caller scenarios panel, with its reception call scripts' },
            { icon: '📞', title: 'Reception Simulator', points: [
                'Practice call: a caller picked at random; the trainee takes the whole call in their own words, by voice or typing.',
                'Scored drill: a run of calls, step by step, 100 points each: find the file 30, authenticate 40, handle the call 30.',
                'After a practice call the trainee matches the file (the search finds names spelled the way they sound), checks the authentication and gets a debrief.',
                'Authentication is ticked from the call itself: full name, date of birth, date of loss and one more identifier on file.',
                'Its home screen shows you the team table: runs, average and best, seconds per call.'],
              where: 'Sidebar → 📞 Reception Simulator.',
              tip: 'Take one practice call yourself before the class does, to check the caller and the debrief.',
              shot: 'blueprint/trainer-reception.jpg', shotAlt: 'The Reception Simulator\'s team table and saved calls' },
            { icon: '🧾', title: 'The RECEPTION MOCK CALL scorecard', points: [
                'The debrief rates 14 items, 0 to 5 each; the score is the share of points on the items that apply.',
                'Checked from the call: the introduction, authentication, the closing spiel, time (the first ring, about 3 s) and dead air or fillers.',
                'Reviewed against the firm\'s rules: customer service, assertiveness, listening, comprehension, attention to detail, resolution and transfer.',
                'Clarity of speech and tone of voice: spoken calls only, judged from the words. Rate them yourself on facilitated calls.',
                'Case information to an unverified caller, any part of an SSN, or legal advice scores 0 for Authentication and Resolution.'],
              where: 'The trainee\'s debrief after each practice call.',
              tip: 'If the debrief doesn\'t load, Try the review again keeps the items already checked.' },
            { icon: '🎓', title: 'Grading and feedback', points: [
                'New Intake: key information 45%, questions answered 30%, facts of loss 25%; A from 90, B 80, C 70, D 60.',
                'Saved cases: checks on each save, plus an AI review of uploaded documents (writing 1 to 5), in the trainer roster.',
                'Trainer Notes: on each entry of a trainee\'s feed. The trainee reads them on their own 📊 My Dashboard.',
                'Ping → Send as a task, for something they should do on the case.'],
              where: 'Sidebar → 📊 My Dashboard → the trainee · Master Control → Broadcast & Ping.',
              tip: '📞 Reception Simulator → 🎧 Saved calls opens any trainee\'s call: the scorecard, the review and the whole transcript.',
              shot: 'blueprint/trainer-roster.jpg', shotAlt: 'The Trainer Roster: each trainee\'s cases, last day and trends' },
            { icon: '🔍', title: 'Case Library and Latest Updates', points: [
                '🔍 Open Case Library: every file and every trainee\'s saved cases, with filters and the ☎ firm directory.',
                '🕑 Latest Updates: cases by their latest update, with a search of the Case Notes ("Intake grade" finds graded intakes).',
                '📇 Contacts (sidebar, and a Case Library tab): a card for every provider, adjuster, opposing counsel, client and other contact in the case files.',
                'Every trainee\'s saved cases and drafts are also in Master Control → Case Logs.'],
              where: 'Sidebar → Case Library · 🔍 Open Case Library · 🕑 Latest Updates.',
              tip: 'Latest Updates is the quickest way to see who worked on what today.',
              shot: 'blueprint/trainer-case-library.jpg', shotAlt: 'The Case Library: a search finding a library file and a trainee\'s draft with the same name' },
            { icon: '📥', title: 'Intake folder', points: [
                '📥 Intake Folder: intake files, kept apart from the case files.',
                'Typed intakes are graded as they\'re saved. Uploaded intake sheets (PDF or image) wait for review.',
                '📂 Move to case files turns an accepted intake into a case with a Case ID.',
                'Trainees see only their own intake files.'],
              where: 'Sidebar → Trainer tools → 📥 Intake Folder.',
              tip: 'Review the intakes together after an intake exercise.',
              shot: 'blueprint/trainer-intake-folder.jpg', shotAlt: 'The Intake folder: typed intakes with their scores, and an uploaded intake sheet' },
            { icon: '📅', title: 'Firm Calendar, time and drill results', points: [
                '📅 Firm Calendar: the attorneys\' calendars and the Firm / Staff calendar. An attorney\'s Google Calendar can be connected.',
                '⏱ Time tab → 👥 All trainees: everyone\'s time for the week, with totals, and ⬇ Export CSV.',
                '📞 Reception Simulator: every trainee\'s drill results and scores.'],
              where: 'Sidebar → Trainer tools → 📅 Firm Calendar · the case\'s ⏱ Time tab.',
              tip: 'Check the class\'s time sheets at the end of the week.',
              shot: 'blueprint/trainer-firm-calendar.jpg', shotAlt: 'The Firm Calendar: the attorneys\' week' },
            { icon: '☀', title: 'A training day', points: [
                'Before: approve pending registrations; pick the day\'s case files; print the trainer copy or the call scripts; take one practice call yourself.',
                'Opening: post the day\'s announcement; share the program link in the meeting chat; check everyone is online in Monitoring.',
                'Practice: run facilitated calls one trainee at a time while the rest take practice calls; 👁 Watch live; ping anyone stuck.',
                'Wrap-up: read the Reception Simulator team table and the trainer roster; give each trainee two strengths and one thing to work on; clear the announcement and delete test cases.'],
              where: 'Master Control · 📞 Reception Simulator · 📊 My Dashboard.',
              tip: 'Keep the run sheet the same each day, so trainees know what\'s coming.' },
            { icon: '🧭', title: 'Trainee view and presenting', points: [
                '👁 Trainee view shows the CMS exactly as trainees see it. ⇦ Back to trainer view, in the sidebar, returns.',
                '🧭 Blueprint → Trainee blueprint is the deck to share in Google Meet on day one.',
                '⬇ Download PDF gives any blueprint as a handout. A slide\'s screenshot opens full size with a click.',
                'Trainees only ever see the Trainee blueprint.'],
              where: 'Sidebar footer → 👁 Trainee view · sidebar → 🧭 Blueprint.',
              tip: 'Walk the class through the Trainee blueprint, then let them open their first case.' },
            { icon: '🛠', title: 'When something goes wrong', points: [
                'Can\'t sign in: approve them in Registrations, or lift a suspension in Users. Trainees sign in with just their username.',
                'Can\'t find a case: search the last name, the date of loss (MM/DD/YYYY) or the phone; names spelled the way they sound are found too.',
                'Can\'t edit a case file: check their program link. Front Desk files are view only on purpose.',
                '"The line is busy" on a practice call: wait a minute and send again. A screen out of date: Ctrl+Shift+R.',
                'The site says it\'s paused, or it fails for everyone: tell the Master Account\'s owner straight away.'],
              where: 'Master Control → Registrations · Users · Monitoring.',
              tip: 'Most session problems have a one-minute fix; the rest go to the Master Account\'s owner.' }
        ]
    };
    // The Master Account only (canAdmin below): running the CMS itself.
    const ADMIN = {
        sub: 'Running the CMS itself: accounts, health, data and settings',
        slides: [
            { icon: '🏛', title: 'Who does what', points: [
                'Master Account (you): name left blank + the admin password. The only one that can suspend, revoke or reinstate a trainer, and that sees Database Maintenance.',
                'Trainers: their own name + the admin password. Every training tool: registrations, the Training Library, Master Control.',
                'Trainees: their username (or their name, from a course platform). Their own cases and results only.',
                'Pings are signed "System Administrator" from the Master Account and "Admin <first name>" from a trainer.'],
              where: 'The sign-in screen → Admin Portal.',
              tip: 'Your day-to-day training work is the same as a trainer\'s: see the Trainer blueprint.' },
            { icon: '🔑', title: 'Signing in and sessions', points: [
                'One admin password for the Master Account and every trainer: the MASTER_ADMIN_PASSWORD secret (ADMIN_PORTAL_PASSWORD also works).',
                'The Master Account (LSHADMIN123) is made the first time and can never be suspended or revoked.',
                'A trainer\'s first sign-in creates their own account. A permanently revoked name is refused for good.',
                'Sessions last 12 hours. A page unheard from for 2 minutes is signed out, and so is 15 minutes idle. A suspension takes effect on their next click.'],
              where: 'Cloudflare → Workers & Pages → lshcmtraining-trainingcrm → Settings → Variables and Secrets.',
              tip: 'Anyone with the admin password can sign in as the Master Account. When a trainer leaves, revoke them and change the password.' },
            { icon: '👥', title: 'Accounts and batches', points: [
                'Trainees register: full name, Batch ID (B + the start date, DDMMYY) and a username. They start as Pending.',
                'Approve in Master Control → Registrations; ✎ Batch ID corrects a batch.',
                'Once approved, a trainee signs in with just their username. From a course platform they can type their name.',
                'Users: Temporary Revocation (Lift Revocation undoes it) or Permanent Revocation (deletes the account and blocks the name; their cases stay).',
                'Every approval, suspension and revocation is in Server Logs.'],
              where: 'Master Control → Registrations · Users · Monitoring → Server Logs.',
              tip: 'Anyone who knows an approved trainee\'s username can sign in as them: suspend an account the moment it\'s misused.' },
            { icon: '⇄', title: 'Master Control', points: [
                'Overview: saved cases, trainees online, pending registrations, pause, the current alert.',
                'Registrations and Users: approve, revoke, fix Batch IDs. Monitoring: who\'s online, 👁 Watch live, Server Logs.',
                'Case Logs: every saved case and its previous versions; delete one or several.',
                'Broadcast & Ping: the announcement ticker, full-screen alerts, pings (optionally as a task).',
                'Access Control: ⏸ Pause, and Database Maintenance (Master Account only).'],
              where: 'Sidebar footer → ⇄ Master Control.',
              tip: 'Open pages check for messages every 15 seconds (30 in a background tab).' },
            { icon: '⏸', title: 'Pause and Database Maintenance', points: [
                'Pause freezes trainees\' screens under an overlay; Admins are never paused. The server still accepts saves.',
                'There\'s no site lock: to keep someone out, suspend or revoke their account in Users.',
                '🧹 Clear old data (Master Account): removes old pings, online status, live-view copies, sign-in attempt counts, old live-call records and stopped alerts. Cases, results and logs stay.'],
              where: 'Master Control → Access Control.',
              tip: 'Use Pause for breaks and demos; clear old data now and then, outside class hours.' },
            { icon: '📉', title: 'Cloudflare usage and billing', points: [
                'All LSH sites share one Cloudflare account, on the Workers Paid plan: there\'s no daily limit.',
                '10 million requests a month are included; each extra million costs $0.30, and Cloudflare has no spending cap.',
                'An open page asks the server about 8 times a minute; 👁 Watch live adds about one request a second while it\'s open.',
                'Check the month\'s requests in Cloudflare\'s dashboard, and set a billing notification there.'],
              where: 'Cloudflare → Workers & Pages → the account\'s usage · Manage account → Billing.',
              tip: 'Close Watch live when you\'ve finished watching, and keep idle tabs closed on class days.' },
            { icon: '🎙', title: 'The AI keys', points: [
                'Practice calls, debriefs and live voice use the GEMINI_API_KEY secrets: the plain one and any numbered one (GEMINI_API_KEY1, 2, …).',
                'The keys take turns. One at its limit rests a minute (an hour once its daily quota is gone).',
                'Free limits are per Google Cloud project, so each extra key should come from its own project.',
                'A call refused for the region is sent again from the US through the EA-PA Worker\'s relay (GEMINI_RELAY).',
                'The Reception Simulator\'s home shows Admins the live calls now, the last 24 hours and an estimated cost per key.'],
              where: 'Cloudflare → the Pages project → Variables and Secrets.',
              tip: 'Trainees hearing "The line is busy"? Add a key from another Google Cloud project.' },
            { icon: '🔄', title: 'Updates', points: [
                'A change merged on GitHub goes live by itself a minute or two later.',
                'Open pages notice and reload at a quiet moment: never while someone is typing, on a call, or with unsaved library edits.',
                'Nobody needs to tell trainees to refresh; Ctrl+Shift+R gets the new version at once.'],
              where: 'GitHub → team-litigation-lab/CaseManagementTraining.',
              tip: 'Merge changes outside class hours when you can.' },
            { icon: '🗄', title: 'Data and records', points: [
                'One Cloudflare D1 database (lshcasemanagementtraining-trainingcrmlogins-v3): accounts, saved cases and every earlier version, results, library edits, reviews, time, calendar, intakes and the activity log.',
                'One R2 bucket (lshtraining): Doc Hub and intake documents, alert images and clients\' uploaded IDs, 2 MB each.',
                'Deleting a case keeps its earlier versions and its files.',
                'Backups: Cloudflare → D1 → the database → Time Travel restores any minute in the last 30 days.'],
              where: 'Cloudflare → Storage & Databases → D1 · R2.',
              tip: 'An uploaded file opens for whoever uploaded it and Admins (anyone, for one an Admin uploaded), not for anyone with the link.' },
            { icon: '⚠', title: 'Database upkeep', points: [
                'migrate-d1.yml copies the live database into a new one you name, then points the site at it. It refuses the live database\'s name, since it deletes the one it\'s given first.',
                'D1 has no VACUUM: deleted rows\' space is reused, but the file only gets smaller when migrate-d1.yml copies it into a fresh one.',
                'Not needed for normal running; 🧹 Clear old data in Access Control does the routine clearing.',
                'To undo a mistake, use D1 Time Travel.'],
              where: 'GitHub → CaseManagementTraining → Actions.',
              tip: 'Don\'t run a database workflow without a plan and a fresh Time Travel point.' },
            { icon: '⚙', title: 'Settings: secrets', points: [
                'MASTER_ADMIN_PASSWORD (or ADMIN_PORTAL_PASSWORD): the admin password.',
                'SESSION_SECRET: signs everyone\'s sign-in. Changing it signs everyone out and disconnects Google Calendars.',
                'GEMINI_API_KEY and the numbered keys: the practice caller, the debriefs and live voice.',
                'ANTHROPIC_API_KEY: AI reviews of documents and intakes. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET: Google Calendar.'],
              where: 'Cloudflare → Workers & Pages → lshcmtraining-trainingcrm → Settings → Variables and Secrets (Production).',
              tip: 'A change takes effect on the next deploy.' },
            { icon: '🎚', title: 'Settings: limits and bindings', points: [
                'CALL_AI_LIMIT: AI requests per person per 10 minutes (150 if not set).',
                'LIVE_MAX_MINUTES (6), LIVE_CALLS_PER_KEY, LIVE_DAILY_MINUTES and LIVE_MODEL: the live voice limits.',
                'Bindings in wrangler.toml, nothing to set by hand: DB (the D1 database), DOCUMENTS (the R2 bucket), GEMINI_RELAY (EA-PA\'s relay).',
                'CLOUDFLARE_API_TOKEN in the repository\'s GitHub secrets is used only by the Migrate D1 workflow.'],
              where: 'Cloudflare → the Pages project → Variables and Secrets · wrangler.toml.',
              tip: 'Set LIVE_DAILY_MINUTES to cap live voice minutes for the whole site.' },
            { icon: '🗓', title: 'Routine', points: [
                'Before a batch: take one practice call yourself; check the 🎙 Live voice panel lists every key; give trainers the password and the Batch ID.',
                'Every training day: nothing left pending in Registrations; the expected trainees online in Monitoring.',
                'Weekly: Server Logs look right; delete test cases and duplicates in Case Logs.',
                'Monthly: Cloudflare usage and billing; revoke trainers who have left and change the password; Google Cloud billing for the Gemini keys, with a budget alert.'],
              where: 'Master Control · 📞 Reception Simulator · Cloudflare and Google Cloud billing.',
              tip: 'A few minutes a day during a batch keeps the site ready.' },
            { icon: '🛠', title: 'When something breaks', points: [
                '"The CMS server isn\'t answering": the site\'s server part is down; check the Cloudflare dashboard for the project.',
                'Admin sign-in "isn\'t set up yet": set MASTER_ADMIN_PASSWORD.',
                'The practice caller "isn\'t set up": add GEMINI_API_KEY. "The line is busy": wait a minute, or add keys.',
                'Intake reviews "not configured": add ANTHROPIC_API_KEY.',
                'A trainee can\'t sign in: check Registrations and Users (pending, suspended or revoked).'],
              where: 'Cloudflare → the Pages project · Master Control.',
              tip: 'Most problems are a missing setting or a limit reached, not the code.' },
            { icon: '📝', title: 'Known gaps', points: [
                'One admin password for the Master Account and every trainer.',
                'An older copy of a case kept in a browser can still overwrite newer changes made on the server.',
                'The database file can\'t shrink in place (D1 has no VACUUM): Migrate D1 copies it into a fresh one.'],
              where: 'README → 🔒 Security → Known gaps.',
              tip: 'Plan around these until they\'re fixed.' }
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
        logo: 'lsh-mark.png',
        brand: 'Legal Support Help',
        trainee: TRAINEE,
        trainer: TRAINER,
        admin: ADMIN,
        // the Admin blueprint is for the Master Account (who runs the CMS itself), not every trainer
        canAdmin: () => { const s = typeof getSession === 'function' ? getSession() : null; return !!(s && s.userType === 'Admin' && s.username === 'LSHADMIN123'); },
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
