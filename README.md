# CaseManagementTraining

LSH Case Management System (CMS), the practice CRM used by every LSH training program.

## 🔍 Case Library (search-first)

The sidebar no longer lists everyone's cases. Cases trainees save go into the **Case Library** together with the Training Library mock cases, and nothing is listed until you search, the way a front desk looks a caller up on a live call (`case-library.js`).

**Trainees see only the cases they saved themselves.** Their sidebar section is **My cases**: a list of their own saved cases and drafts, each with Open and 🗑 Delete, and no **Open Case Library** button. The search bar finds the case files (the mock cases) and their own saved cases, never another trainee's. The server enforces this too: for a trainee, `/api/case-repository` lists and opens only their own cases, and the Firm Calendar's case deadlines (and its `.ics` export) come only from their own cases. Admins see every case, as before.

- **Search bar in the case header:** type in the 🔍 search bar under the case status, at the right of the case header (or press **Ctrl/Cmd+K**) and matching files drop down under it; click one (or use the arrow keys and Enter) to open it. Trainees never need to open a library. Search by client name, **case number** (typed any way: `LSH-2026-MVA-901379`, `mva 901379` or just `901379`), date of the accident (DOL), date of birth, phone, claim/policy #, plate or library ID. Each result shows its DOL (and, for mock cases, the case number and DOB).
- **The search bar starts empty.** Chrome used to put the trainer's own name into the search bar, shaded pale blue. Its autofill copied the name picked on the sign-in screen, and its password manager took the search bar for the username box of a saved sign-in. Now the sign-in views, every box with a password (the lock and unlock boxes too) and the search bar are forms of their own, and the search bar's hint no longer says "name". Any search box the browser still fills in by itself, while you aren't typing in it, is emptied at once, even when Chrome hides what it filled in from the page (`case-library.js`).
- **Case Library window (Admins):** sidebar → **🔍 Open Case Library** for the same search with filters (Training Library, saved cases, **My cases**) and the ☎ firm directory. Trainees don't get the button. If the search bar is off screen, Ctrl/Cmd+K opens the window for them, with **All files** and **My cases** only. They find the firm directory and front-desk rules in the Front Desk practice panel.
- **Same name, different file:** when several results share a client name, the Case Library (and the drill's search) says so and asks for the DOL and DOB before you open one.
- **During a Front Desk Drill call**, a mock case opened from the search bar counts as the call's pick, so receptionists never need the Training Library.
- A trainee's cases, drafts included, are visible only to them and Admins (enforced server-side). Admins browse all cases in Master Control → Case Logs.

## Training Library (mock cases)

`mock-cases.js` holds **52 hardcoded, fictional personal-injury cases** (MC-01 … MC-52) built for Receptionist / Front Desk training and reused by the other programs. They are the same for everyone and live in code (not the database), so they can't be deleted. Trainers can edit them (below); the code keeps the originals.

- **Who sees it:** only **Admins**. They get the sidebar **📚 Training Library** button (browse every mock case by program). Trainees can't open the Training Library and never see its name. To them a mock case is an ordinary **case file**, tagged and bannered with its case number (e.g. `LSH-2026-MVA-901379`, not `MC-01`). They find it by searching the **Case Library**, and every way into the library (the case banner, `?library=1`) takes them there instead. Their Case Library has only the **All files** and **My cases** filters.
- **Open one:** from a Case Library result (or, for Admins, **📚 Training Library** → *Open case*). It loads into the normal case editor across every tab (profile, police report, insurance, liens, treatment, property damage, litigation, finance, Doc Hub, notes, tasks), **view only**. Typing, Save, Archive, Update and autosave are all blocked, except on the Notes and Tasks tabs.
- **Notes and Tasks are editable:** trainees can add, edit and delete notes and tasks on a library case (log the call they just took, set a task for the case manager). They save automatically to that trainee's account (`/api/mock-case-updates`, table `mock_case_updates`, created on first use) and come back when the trainee reopens the case. Other trainees don't see them, and the library original never changes. **↺ Reset to the original** on either tab deletes them.
- **Primary Injury:** each library case fills the Profile tab's **Primary Injury** card (beside the Case Narrative), from `injury` in `mock-cases.js`: primary injury, body parts, injury type, surgery, prior injury to the same area, and diagnosis / details. Only what the file says is filled in; the rest stays blank.
- **Case numbers:** every file has a firm case number in the CMS's own Case ID format, `LSH-<year opened>-<type code>-<number>` (e.g. `LSH-2026-MVA-901379`), shown in the Case ID field when the file opens and in search results. The numbers are in the 900000+ range, which the server's counter (it issues saved cases' IDs from 000001) won't reach for a long time, and follow the order the files were opened. Some callers give only the case number.
- **Same names on purpose:** MC-21 is a second file for Maria Santos (same client as MC-01, an older pharmacy fall) and MC-22 is a *different* Maria Santos (other DOB). MC-23 and MC-24 do the same for James Wilson (MC-06). Her husband is authorized on MC-21 only, not on MC-01: authorization is per file. MC-25 and MC-26 are a father and son, both named Jose Hernandez, hurt in the same crash: same name, address and DOL, so only the DOB or the case number tells the files apart (his mother is authorized on the father's file only).
- **Recep2 batch, hard-to-say names (MC-37 … MC-52):** 16 files built from the Recep2 reception sheet (each file keeps the sheet's DOL, DOB, status, the attorney's availability and the notes), plus a 17th caller who has no file. The clients have names that are hard to say and hard to spell (first names Niamh, Saoirse, Mireille, Schuyler, Cian, Rhys, Bjorn, Brittany, Siobhan, Mstislav; surnames Cholmondeley, Witwicky, Featherstonhaugh, Beauchamp, Acheson, Beaumont, Courthope, Kirkcudbright, Masserene, Shaughnessy). They test the NATO phonetic alphabet, attention, active listening and verification. Four clients have two files each, told apart by the DOL (Schuyler Beauchamp, Niamh Cholmondeley, Mstislav Shaughnessy, Bjorn Courthope). Some surnames and first names come back on unrelated files (two Masserenes, two Shaughnessys, a Brittany Beauchamp who isn't on file), so the date of birth decides. `MOCK_NAME_SOUNDS` says how each name is pronounced (`say`, e.g. Cholmondeley = "CHUM-lee") and how it might be written down by ear (`heard`, e.g. "Chumley").
- **Caller scenarios (trainers only):** for Admins, the banner's **☎ Caller scenarios** panel shows how to verify the caller on that file and 2–4 realistic calls (the client, an adjuster, defense counsel, a provider, an unauthorized relative, a reporter…), each with the model handling. Trainees don't get the button or the panel, so the answers stay with the trainer for mock calls.
- **Reception call scripts (trainers only):** in the same panel, each caller scenario has a **📜 Reception call script** a trainer can run as a mock call. The trainer plays the caller, with the opening line and the file's details to verify with when the caller is the client. The script also gives the lines a ready receptionist says: the greeting, name and callback number, verification before sharing anything (plus the date of the accident, or the date of birth, when another file has the same name), the model handling, and the read-back and close. When a call has a hard-to-say name, the script tells the role-player how to say it (and to spell it only when asked), and the receptionist's lines add “Could you spell that for me, please?” and the NATO read-back (“C as in Charlie, H as in Hotel…”). Below the scenarios, **🎭 Mock-call scripts** covers the Front Desk simulator's callers on that file. Each has the caller's answer to every identifier the trainee may ask for (wrong and missing ones included), how to stay in character, the right decision and handling, the key and a 100-point score sheet. **🖨 Print this file's scripts** prints both kinds for the file; **🖨 Print all** prints every simulator caller (allow pop-ups). Trainees never see the scripts.
- **Firm directory & front-desk rules:** a tab in the library with the fictional firm's extensions, hours and the rules every call follows (verification, who is authorized, never give advice or values, what counts as urgent, what a complete message contains).
- **Trainers can edit library cases:** an Admin's library case opens **editable**. The banner says *TRAINING LIBRARY · EDITABLE*; click any field and type, on any tab.
  - **💾 Save to the library** (or Save Case) saves it for everyone. From then on, everyone who opens the file gets the edited version; trainees (and a trainer in Trainee view) work on it in their program's role (below).
  - The edit's key facts update the case search and the library list: client name, phone, email, DOB, address, emergency contact, DOL, SOL, phase, attorney, case manager and narrative. The list marks the case **✎ edited**, and the trainer's banner says who edited it and when.
  - **↺ Undo my changes** goes back to the last saved version, and **↺ Restore the original** deletes the edit for everyone.
  - Opening another case, starting a new one, switching to Trainee view or closing the tab with unsaved changes asks first. A reload keeps them.
  - Trainees' own Notes and Tasks stay theirs and sit on top of whichever version they open.
  - The edit is never saved as the trainer's own case, and autosave doesn't make one. There's no draft of a library case either: 🗄 Archive is hidden while one is open.
  - The Front Desk practice calls on the file keep their own answers, so change a DOB or address there too if a call depends on it.
  - If the library version can't be loaded (offline), the case opens view only, so an edit of an old version can't go over a newer one.
  - Edits are stored by `/api/mock-case-edits` (table `mock_case_edits`, created on first use): anyone signed in can read them, and only Admins can save or delete one.
- **Download as PDF (trainers):** the Training Library window has a download bar above the list, and a **⬇ PDF** button on each case.
  - **PDF · trainer copy:** every tab of each listed case, plus its trainer-only front-desk key: how to verify the caller, the caller scenarios, the Front Desk practice calls, and how to say the hard names.
  - **PDF · case files only:** the same case files without the keys, safe to give trainees.
  - It takes the cases the window lists, so a program filter or a search narrows the file. Each file has a cover page, an index and one section per case, with page numbers.
  - `library-pdf.js` builds the file in the browser with jsPDF and jsPDF-AutoTable, loaded from cdnjs on the first download. It's real text, not a screenshot: about 400 KB for all 52 cases.
  - A case a trainer edited in the CMS carries a note: its key details are the edited ones, and the whole edited file is in the CMS.
- **Trainees edit a case file in place, by program (no practice copy, no drafts):** a trainee works on a case file in the role of the program they chose. The parts of the case their program handles are editable (their tabs get a ✎); the rest is view only.
  - **Choosing the program:** the bar above a case file has a program picker. A course link can set it too (`?program=intake`). It's remembered for the next visit, shown in the header, and stamped on the cases they save (`content.program`). Changing it reopens the file in the new role.
  - **Who edits what** (`PROGRAM_AREAS` in `training-library.js`; the header is the client name and contacts, attorney, case manager, phase, dates and case type):

    | Program | Editable on a case file |
    |---|---|
    | Receptionist / Front Desk | Notes, Tasks (the file stays view only: they log the calls they take, saved for them) |
    | Intake | Header, Profile, Parties Involved, Police Report, Insurance, Doc Hub, Notes, Tasks |
    | Case Management | Header, Profile, Parties Involved, Police Report, Insurance, Treatment, Lost Wages, Demand, Settlement, ADR, Doc Hub, Notes, Tasks, Liens, Property Damage |
    | Medical Summary & Demand | Treatment, Lost Wages, Demand, Doc Hub, Notes, Tasks, Liens |
    | EA / PA | Doc Hub, Notes, Tasks |
    | Property Damage | Parties Involved, Police Report, Insurance, Doc Hub, Notes, Tasks, Property Damage |

    No program yet: view only, with Notes and Tasks. Litigation and Case Costs are view only for every program. Trainers (Admins) edit the whole library case, as above.
  - **Save Case** saves the trainee's work on the file as **their own case for it**, with a Case ID: one case per trainee per file (`content.trainingLibraryId`, e.g. `MC-04`). Reopening the file shows their saved work; later saves update the same case. It's never a draft: 🗄 Archive is hidden, and archiving or autosave saves the same case. The server keeps it to one (`/api/case-repository?library=MC-04` finds it, and a new case for a file they already have a case for updates that case), so a second tab can't make a second copy.
  - **Autosave** works as for any case (only when something interrupts the work), including when the page closes on a file they haven't saved yet. Opening another case or closing the file saves unsaved changes first: it's their own case.
  - **↺ Start over** brings the file back as it is in the library; Save Case then replaces their saved work on it.
  - Trainers see trainees' work on case files in Case Logs like any case, with the program it was done in.
  - A **Front Desk Drill** always opens files view only, whatever the program.

What the cases cover, from starter to advanced: every phase from Intake to Litigation, and a wide spread of case types: car crashes (rear-end, T-bone, rideshare, hit-and-run, commercial truck), a pedestrian hit by a city bus (government-claim notice), motorcycle, bicycle, slip and fall, dog bite (adult and child), premises liability, product liability (evidence that must not be released) and wrongful death (estate administrator). MC-25 … MC-36 add an e-scooter, a boating and a pedestrian case, negligent security, an elevator case in litigation (mediation), a trampoline-park injury, the UM settlement phase, and a prior attorney's lien and a pre-settlement funding lien. Authorization situations include the client only, an authorized daughter, a son with power of attorney, a guardian parent with the other parent *not* authorized, divorced parents with joint custody who are *both* authorized, an estate administrator with other relatives *not* authorized, a funding company allowed the case status only, a client with a safety flag (never confirm she's a client), an employer asking about a client, and a potential client with the statute of limitations weeks away. Call types include offers with deadlines, recorded-statement requests, deposition changes, a mediation center, a process server, check pickup by a third party, collections threats, a media call, a Spanish-speaking caller, a file transfer to new counsel, the client's former law firm, and callers who give only our case number.

## 📞 Call Simulator: the call lines, the Core callers' practice calls and the scored drill

Sidebar → **📞 Call Simulator** (after 📝 New Intake), for trainees and Admins alike. This is the main Call Simulator: every platform's Call Simulator link opens it (below). The panel offers the **call lines** (every program's mock calls, Practice and Graded), the **Core callers' practice call** (the front desk's own callers, taken in the trainee's own words) and the **scored drill**, a run of front-desk calls taken step by step.

### 📞 Call lines (`call-packs.js`)

Every program's mock calls, by line, on the same phone as the practice calls below (live voice, or the standard voice):

| Program | Lines |
|---|---|
| 📘 Standard Training (FT) | ☎ Reception Mock Calls · 🗓 Calendar Management Mock Calls · 📋 Intake Mock Calls (played on the Training Library files: the caller's file is one of MC-01 …) |
| 🗂 Case Management | Nguyen Case Calls · Reception & Front Desk · Intake Calls · Client Communication · Attorney Reporting · Adjusters & Carriers · Providers & Records (John Doe v. Apex) |
| 🚗 Property Damage | Claim Setup · Coverage & Liability · Rental, Tow & Shop · Negotiation & Total Loss · Settlement & Close (Angela Carter's PD claim) |
| 🧑‍💼 EA / PA | Executive Calls · Gatekeeping & Stakeholders · Legal Operations · Lifestyle & Estate · Intake Calls · Revenue & Outreach (Elias Thorne's world, from the EA-PA program's client profile, Live Roleplay topics and intake callers) |

The FT, CM and PD calls came from the Training Portal's Call Simulator and now live here; the EA / PA lines were written from the EA-PA program. The ☎ Reception, 🗓 Calendar Management and 📋 Intake Mock Calls buttons sit with the Core callers' practice call. **📞 Call lines** has a **Calls** dropdown that keeps the calls apart: by program (Standard Training, Case Management, Property Damage, EA / PA) or across them (☎ Reception, 📋 Intake, 🗓 Calendaring, which also opens the 🗓 Attorney's Calendar and the Portal's calendar simulators).
- **Results, kept apart for grading:** above My results and the team results, a **Show** dropdown picks the calls (all, the Core callers, a program's calls, or one line) and a second one Practice and graded / 🎯 Graded only / Practice only. The team table's averages, and 🎧 Saved calls, follow them, so a trainer can grade one line's graded calls for the whole team.

- **Practice** (per line): pick a caller, or a random one. The brief above the phone has your role, what you know, the file (FT: **Open MC-05**) or the case summary / client profile you work from, what you're scored on, the line's tips and the note you'll write.
- **Graded** (per line): a random caller you don't know until the debrief (an incoming call shows **Unknown caller**, and an FT brief doesn't name the file: you get the name, verify and find the file). The goals aren't shown before the call, and the note is required. It counts in the course: FT by lesson (Reception 4, Calendar Management 5, Intake 6), the other programs in their own course (`courseOf`).
- **The call:** an incoming call rings: **📞 Answer**, greet them, and they open with their own words (`opening`). A call you place (*You call*): **📞 Call**, it rings on the other end, and they pick up and speak first. Their next lines come from their script (`hidden`) by the standard voice (`/api/call-ai`) or live voice (`/api/live-call` builds the same caller: `livePrompt`). Each call's AI use counts under its line in the Portal's shared budget (reception, intake, calendaring, standard, cms, pd, ea-pa).
- **After the call:** FT calls match the file; every line has its note (a message slip, a calendar entry, an intake sheet, a BLUF recap…, from its template). **The debrief** is graded on the call's goals (plus the documentation, and the line's rubric) by `/api/call-ai`: a score out of 100, each goal ✓ or not yet with a note, what worked, what's next and a better line, with the transcript. It's saved with the results as a line call (mode `line`, or `graded`), with its program, line, course, goals, note and transcript; 🎧 Saved calls opens it again.
- **Links from other platforms:** `?calls=1` opens the Call Simulator; `&program=` (FT, CM, PD, EA, or standard, cms, pd, ea-pa) or `&flow=` (reception, intake, calendaring) picks the tab; `&line=` opens a line (`&mode=graded` marks its graded call). The Training Portal's Call Simulator, the course platforms and the EA-PA platform link here through the Portal's sign-in (`/api/launch?tool=cms&to=calls`), so nobody signs in again.
- Add a call by adding it to `CALLS` in `call-packs.js` (a new line to `LINES`); `.github/scripts/call-lines.cjs` checks every call has what the phone, the caller and the grader need.

### 📞 Core callers: practice calls (no script)

A random caller from `DRILL_CALLS` phones in (the level buttons pick warm-up, harder or tricky callers), and the trainee takes the whole call in their own words. There are no answer choices and no identifier buttons, and the caller's lines aren't shown before they're said.

- **The call:** the phone rings with the caller ID. The trainee presses **📞 Answer** and greets the caller, who then says why they're calling in their own words and answers what they're asked from what their `gives` says (wrong answers included). They react to what the trainee says and hang up when the call is done. The trainee talks (live voice, or the **🎙** button on the standard voice in Chrome and Edge) or types. They find the file with the panel's search or the 🔍 search bar above the case (the file they open counts as the call's file), and the ☎ firm directory and rules are one tap away.
- **Finding the file by ear:** the search finds names spelled the way they sound. "Brittani" or "Britney" finds Brittany Kirkcudbright, "Garsia" finds Linda Garcia, and the way a hard-to-say name is heard ("Kirkoobree", "Chumley") finds it too. Exact matches come first; the others are tagged **Sounds like**. Only the client's and their contact's names are compared this way, and numbers (case #, phone, DOB) still have to match exactly. The panel's search, the 🔍 search bar in the case header and the Case Library all use it.
- **The case stays in view:** on a wide screen (1100 px and up) the case moves over while the panel is open, so the file and the search bar in its header are never under the panel. When there isn't room beside it, the sidebar steps aside for the call and the case is shown a little smaller (`case-fit.js`). **▭ Case** hides the panel and gives the case the whole width, the sidebar and its size back; on a narrower screen the panel goes over the case as before.
- **After hanging up (the wrap-up):** the trainee confirms which file the call was about (or "not in the system") and can write a call note. **Authentication is checked automatically from the call:** a caller asking about a case has to give their full name, date of birth, the date of the accident (DOL) and one more identifier on file (claim number, case number, address or SSN last 4); an authorized caller also says who they are to the client; a relative who isn't on the file needs their name and relationship; a business or new caller their name and callback number. An identifier counts when the trainee asked for it in their own words (heard in the transcript) or the caller gave it without being asked. The wrap-up shows each one ✓ or ✗ and says **Fully authenticated** or what's missing. There's nothing to choose, so **Get my debrief** works straight away (a file not matched counts as not found).
- **Debrief: the RECEPTION MOCK CALL scorecard.** 14 items, each rated 0 to 5; the score is the share of the points on the items that apply:
  1. Introduction of Law Firm and Name · 2. Authentication (Name, DOL, DOB, Claim No, Case No.) · 3. Customer Service · 4. Assertiveness · 5. Listening Skills · 6. Comprehension · 7. Attention to Details · 8. Resolution · 9. Transfer Procedure · 10. Closing Spiel · 11. Time Management · 12. Dead Air/Fillers · 13. Clarity of Speech (Articulation, Volume, Enunciation) · 14. Tone of Voice.
  - **Checked from the call itself** (the same every time, and shown at once): the opening spiel (thanks, the firm's name, your name: "Thank you for calling Legal Support Help. This is …"), authentication (above), the closing spiel (more help offered, thanks, goodbye), time management (answered on the first ring, about 3 s, per the one-ring policy; the call's length; a hold over a minute) and dead air and fillers (silences over 10 s after the caller's line, 8 s on live voice, and before the greeting; a hold the caller was told about, "One moment while I pull up your file", doesn't count; um, uh and the like).
  - **From a review of the transcript** (`/api/call-ai`) against the key, the firm's front-desk rules and the **reception SOP** (`MOCK_FIRM.sop` in mock-cases.js, from the Job Description & SOPs: one-ring policy, the opening spiel, telling the person taking a transfer the caller's name and reason, cold transfers, no part of an SSN, status updates by caller type, prelit@legalsupporthelp.com, the closing): customer service, assertiveness, listening, comprehension, attention to details (at most 2 when the wrong file was matched), resolution and transfer procedure (N/A when no transfer was needed). Clarity of speech and tone of voice are rated only on spoken calls (live voice or the 🎙), from what was said; a typed call has them N/A.
  - Disclosing case information to a caller who isn't verified or authorized, reading an identifier out, giving out any part of an SSN, or giving legal advice scores 0 for Authentication and Resolution.
  - The debrief also says what went well, what to work on, a better line to say, the key and what the file says, with the transcript.
  - **If the review can't be had** (Google busy or refused), the debrief still shows the five items checked from the call, says the rest didn't load, and offers **Try the review again** (or back to the wrap-up). The call is saved once the review comes through.
- **Saved** with the drill results (as a practice call, with the scorecard, the transcript and the review), so trainers see practice calls in the team table: Score is the scorecard's, Find is the file, Auth is the Authentication item and Handle is the Resolution item.

**Two voices.** With **🎙 Live voice calls** on (the default in Chrome and Edge), a practice call runs on live voice (Gemini Live, below): the caller hears the trainee and talks back naturally. **🎙 Mute** and **🔈 Speakerphone** work as in the drill (the speakerphone setting is shared), so a practice call can be shown in Google Meet too. When live voice is off, isn't set up, has no microphone, is busy or drops mid-call, the call goes on with the **standard voice**: the caller's next line comes from `/api/call-ai`, the browser reads it out (a female or male voice per caller; 🔊 Voice on/off, ↻ Replay), and the trainee talks or types:
- **🎙 next to the reply box:** press it and talk; the reply goes when they pause (press ■ to send it at once).
- **🔁 Hands-free** is on unless they turn it off (the choice is remembered). The microphone listens from the greeting on, after each of the caller's lines, so the whole call can be taken by voice without typing. It waits while the caller talks, so it never picks up the caller's voice. After a silence it listens twice more, then asks them to press 🎙 or type.
- Typing always works, and typing takes over from the microphone.
- A blocked microphone says so, and the call goes on typed.
- Answering by voice needs Chrome or Edge; other browsers say so and type. A call that drops keeps its transcript, and the caller carries on from there. After live voice is found not set up, without a microphone, out of the day's minutes or refused in this region, practice calls use the standard voice for the rest of the visit; after a busy line, the next call tries live voice again. A live practice call ends at the live voice time limit (a warning comes 30 seconds before) and goes to the wrap-up.

**Heavy use (a whole class at once).** Live voice spreads its calls over the keys itself (below). On the standard voice, every Gemini key on the project is used and the keys take turns (`functions/_ai.js`): each caller line and review starts on the next key, so the load is spread across all of them. A key that hits its limit rests (a minute, or an hour when its daily quota is used up; a rejected key 10 minutes) and the request moves to the next key at once, so later requests don't pay for a failed try. Caller lines start on Flash-Lite, which has the biggest free quota; reviews start on Flash. When every key is busy, the page retries the line three times (after 1.5, 3 and 6 seconds) and then puts the trainee's line back in the box to send again. Each user gets up to `CALL_AI_LIMIT` caller lines and reviews per 10 minutes (default 150; a call uses about 10 to 30), so one runaway page can't use up the class's quota. The more keys from separate Google Cloud projects, the more trainees can call at once. Admins can see how many keys are set up and which are resting at `/api/call-ai` (GET).

**🎧 Saved calls.** Every saved practice call can be opened again from the Call Simulator's results: an Admin's list has every trainee's calls, and a trainee's has their own. **View** shows the call's score, the 14-item scorecard with its notes, the review (what went well, what to work on, a better line), the receptionist's note and the whole transcript (`/api/drill-results?id=`, an Admin any call, a trainee only their own).

### 📋 The scored drill

A drill is 5, 8, 12 or all 61 incoming calls, picked at random from `DRILL_CALLS` in `mock-cases.js`. For each call the trainee:

1. **Asks the caller** for identifiers (full name, date of birth, address, SSN last 4, callback number, relationship, date of the accident). The caller answers from a script, and some answers are wrong on purpose: a wrong DOB, only two identifiers, a new address that isn't on file, a relative who knows the client's details.
2. **Finds the case** with the drill's search (or the 🔍 search bar in the case header), by whatever the caller gave: name, case number, phone, DOB, DOL, claim or policy number, account number, plate, report number or library ID. Some callers only give a claim number, a plate or our case number. One is a brand-new caller who isn't in the system. Some names are on two or three files: the DOL and the DOB pick the right one. Opening a result loads the file view-only in the editor; **▭ Case** hides the panel to read it.
3. **Authenticates**: the client (or a minor's guardian), an authorized person on file (authorization, POA, estate administrator), not verified, not authorized, a business caller, or a new caller.
4. **Handles the call**: four options, shuffled.

**Hard-to-say names (the Recep2 callers, D45 … D61):** the caller's words show each hard name the way it sounds ("Chumley", not "Cholmondeley"), so searching by ear finds nothing. The trainee has to **ask them to spell it** (the caller spells it letter by letter) and **read it back with the NATO alphabet** (two extra asks on these calls), then search with the real spelling. On a live call, asking to spell it is heard in what the trainee says, and the read-back counts once they say three or more NATO words (Charlie, Hotel, Oscar…). The live caller says the names as they're pronounced and spells them only when asked. A typed practice call writes them the way they sound.

**Scoring per call (100):** find the right case 30 · authentication 40 (the decision 30, plus 10 for asking the right identifiers: name + DOB + the date of the accident + address or SSN last 4 for personal callers, name + relationship for relatives, name + callback for businesses, and also the date of the accident for anyone else whenever the client's name is on more than one file, and the spelling and NATO read-back when the call has a hard-to-say name) · handling 30. Time per call is recorded. After each call the trainee sees what was right, why, and what the file says.

**Results** are saved to `/api/drill-results` (table `front_desk_drills`, created automatically on first use; its `mode` column, `drill` or `practice`, is added to an older table automatically). Trainees see their history in the panel. Admins see a **team table**: each trainee's number of drills and practice calls, average and best score, find / authenticate / handle percentages, and seconds per call. Nothing to set up on Cloudflare beyond the existing D1 binding and the Gemini key below.

To add or change a case, edit `mock-cases.js` (the comment at the top explains the fields). Course drills are keyed to these facts (e.g. the CM course's Front Desk Lookup), so update those when you change a fact.

### 🎙 Live voice calls

With **🎙 Live voice calls** ticked on the drill's start screen (the default in Chrome and Edge), each call is a real phone call instead of text.

- **Answering:** the phone rings. The trainee presses **📞 Answer** and greets the caller the way they answer the firm's phone.
- **The caller** talks back out loud in a natural voice (Gemini Live, one voice per caller, female or male as the call's `voice` in `mock-cases.js` says). Either one can talk over the other, as on a real call.
- **What the caller knows:** the caller only knows their script. That is why they're calling (`opening`) and what they answer when asked for each identifier (`gives`), wrong answers included. They don't volunteer details, don't invent case facts, and never say they're a simulation.
- **Asking for identifiers:** the trainee just asks out loud. Each identifier is ticked on screen as they ask for it (from the live transcript), and that is what the "asked the right identifiers" points use. Tapping an identifier asks it in writing instead.
- **Transcript:** both sides are transcribed as they speak. **Mute** and **Hang up** work as on a phone.
- **🔈 Speaker (speakerphone):** for a room, or to show a call in **Google Meet**. The caller plays louder, and the setting is remembered for the next calls.
  - **In Meet:** Present now → A tab (or Share screen → Chrome tab), pick the CMS tab, and turn on **Also share tab audio**. The class hears the caller, and hears the trainee through their Meet microphone. The phone panel shows these steps when Speaker is on.
  - **No echo:** on speakerphone the microphone sends silence while the caller talks, so the caller can't hear its own voice from the speakers and cut in. The trainee lets the caller finish, then answers.
- **Scoring:** "End the call and score it" hangs up. The call's transcript is saved with the drill result, for the trainer.
- **Headset:** a headset works best. Speakers can echo the caller back into the microphone.

**Falling back to text.** Without a microphone, in another browser, or while live voice isn't set up, the call runs as text as before, with a note saying why.

**Setup:** add the Gemini key to this Pages project. The same keys serve live voice, the practice calls' standard voice and the debriefs.
1. Cloudflare → Workers & Pages → the CMS Pages project → **Settings → Variables and Secrets**.
2. Add a secret named `GEMINI_API_KEY` or any numbered name (`GEMINI_API_KEY1`, `GEMINI_API_KEY13`, …), for Production and Preview. It can be the same key the courses use. Each extra numbered key shares the load; free-tier limits are per Google Cloud project, so keys from separate projects add capacity.
3. Optional: `CALL_AI_LIMIT` (plain text), the caller lines and reviews each user may request per 10 minutes (default 150).
4. Redeploy.

Optional: `LIVE_MODEL` (plain text) puts a different Gemini Live model first. The default order is `gemini-3.8-live`, then `gemini-3.1-flash-live-preview`, then `gemini-2.5-flash-native-audio-preview-12-2025`. The drill moves to the next model on its own if one doesn't accept the call.

**Capacity and cost (a whole class at once):**
- **Limits are per Google Cloud project, not per key.** Google caps how many live calls run at once, and how much audio is used per minute and per day, for each project. Keys from **different projects** add capacity; two keys from the same project share one allowance. Your current limits are on the [AI Studio rate-limit page](https://aistudio.google.com/rate-limit). Free-tier limits are low; turning on billing for a project (paid tier) raises them a lot.
- **Spreading the load:** each new call goes to the key with the fewest calls in progress. When a call ends (or the page closes), its place is freed.
- **When a key is busy:** if Google refuses a call (busy, out of quota, model unavailable), the drill tries the next key, then the next model. Only when none takes the call does that one call run as text. The next call tries live again, so a trainee is never stuck.
- **Paid price:** Gemini Live costs about $0.005 per minute of the trainee's audio and $0.018 per minute of the caller's. That is about $0.023 per minute of call when the caller talks the whole time, so a 3-minute call costs a few cents. Ten trainees each doing an 8-call drill is roughly 80 calls, about 240 minutes, **roughly $5–6**. Google's billing page has the exact amounts.
- **Time limit:** every call hangs up at 4 minutes, with a warning 30 seconds before. A forgotten open call can't keep running.
- **Optional caps:** set these Cloudflare variables (plain text):
  - `LIVE_MAX_MINUTES`: a shorter time limit per call (1–4; the default, and the most, is 4).
  - `LIVE_CALLS_PER_KEY`: the most calls at once on one key. Calls past it run as text. Use it to stay under a free-tier limit on concurrent calls.
  - `LIVE_DAILY_MINUTES`: the whole site's live minutes in any 24 hours. Past it, the drill runs as text until minutes free up. This is a spending cap.
- **Usage for Admins:** the drill panel shows **🎙 Live voice calls**:
  - calls in progress now;
  - calls, minutes and estimated cost over the last 24 hours;
  - each key's calls in progress;
  - how many tries Google refused.
- **Budget alert:** for extra safety, set one on the Google Cloud billing account (Billing → Budgets & alerts).

**How it works:**
- **The key stays on the server.** `functions/api/live-call.js` makes a single-use token that expires quickly, with the caller's script locked in (`functions/_live.js`). The browser (`live-call.js`) then talks straight to Google with that token. The key never reaches the browser, and the token can't be used for anything but that one call.
- **Log:** 60 live calls per trainee per hour. Each call is logged in `live_call_log` (created on first use, kept 3 days) with its key, model, start and end, which is what the balancing, the caps and the usage panel read.
- **Region:** Google refuses some regions, and this site's server runs near the trainee. A refused request (a live voice token, a caller line or a debrief) is sent again from **GeminiRelay**, the EA-PA-TRAINING Worker's Durable Object pinned to the US (the `GEMINI_RELAY` binding in `wrangler.toml`, `script_name = "ea-pa-training"`), and that server instance uses the relay from then on. Without the binding, live voice calls run as text and the practice caller says it isn't available from this region.

## The case fits the window

The case editor is laid out for a wide window (the case itself needs about 1,030 px). `case-fit.js` fits it to the browser window whenever the window is resized, the Call Simulator panel opens or closes, or a case is opened or closed, and for a few seconds after, if the case grows as it fills in (never while a mouse button is down or something is being dragged, so the case doesn't change size under the mouse): in a narrower window the case is shown smaller so all of it is in view (never below 70%; past that it scrolls sideways), and in a wide one it's full size. In a window under 1,100 px (a browser beside a Google Meet, say) the sidebar is narrower, to leave the case more room. Only the case is scaled; the sidebar, the top bars, the windows and the case's action bar keep their size. With the Call Simulator panel open, the case sits beside it (above).

## Using the CMS from any training program

Link to the CMS with a program so it opens in that program's context:

| Link | Effect |
|---|---|
| `…/?program=reception` | Header shows *Receptionist / Front Desk Training*; the Training Library lists that program's cases. Also `intake`, `cm`, `ea` (EA/PA) and `pd` (Property Damage: the vehicle cases MC-01, MC-04, MC-08, MC-12). The choice lasts for the browser tab and can be changed in the sidebar. |
| `…/?mock=MC-04` | Opens that Training Library case right after sign-in (use it in a lesson step). |
| `…/?library=1` | Opens the Training Library after sign-in (Admins); trainees get the Case Library search. |
| `…/?intake=1` | Opens the Intake folder after sign-in. |
| `…/?drill=1` | Opens the Front Desk Drill after sign-in. |
| `…/?from=ea` (or `portal`, `pd`, `standard`, `cm`) | Opened from that platform: trainees sign in with just their name (see Name sign-in). |
| `…/?calendar=1` | Opens the 📅 Calendar tab (Firm Calendar) after sign-in. |
| `…/?calendar=attorney` | Opens the 🗓 Attorney's Calendar (the Calendaring activity) after sign-in. |

Parameters combine, e.g. `?program=reception&mock=MC-06`. Cases a trainee saves are stamped with the program, so trainers can tell which course they came from. Sign-in inside another site's page (an iframe) works through the partitioned session cookie and the cross-site request guard in `functions/_middleware.js`.

## 🔑 Admin Portal (trainer's name + admin password)

The sign-in screen's **Admin Portal** tab asks for the trainer's **name** and the **admin password**, with no username and no registration. It works on a direct visit and from the training platforms (their sign-in screen has a **Trainer sign-in** link).

- **With a name** (first and last), each trainer signs in as **their own Admin account**, made the first time they sign in (username `trainer-<name>`, e.g. `trainer-maria-lopez`). The same name always gets the same account. Pings show "Admin <first name>", and the server logs show who did what. Trainer accounts have every Admin power except the Master Account's: only the Master Account can suspend or revoke another Admin. A revoked trainer's name isn't made again.
- **With no name**, it signs in as the **Master Account** (`LSHADMIN123`), which keeps all of its powers, including being the only account that can revoke another Admin.
- New registrations are for trainees only, and `trainer-` usernames can't be registered. Admin accounts made earlier can't sign in from the Admin tab any more.

**Setting or changing the admin password** (it is never in the code):
1. Cloudflare → Workers & Pages → the CMS Pages project → **Settings → Variables and Secrets**.
2. Add a secret, for both Production and Preview:
   - **Variable name:** `MASTER_ADMIN_PASSWORD` (the only admin password)
   - **Value:** the admin password
3. Redeploy, or wait for the next deploy. The new password works right away.

Until the secret is set, the Admin tab says the admin password isn't set up yet. Trainee sign-in doesn't change.

### 👁 Trainee view (see the site the way trainees do)

A signed-in trainer clicks **👁 Trainee view** at the bottom of the sidebar. The page reloads showing exactly what a trainee sees:
- no Training Library or Caller scenarios buttons, and no Master Control (the 📞 Call Simulator is there, as for trainees);
- mock cases shown as ordinary case files, by case number;
- a trainee's Case Library, time sheet and calendar, with no "All trainees" views and no other trainees' drafts.

To go back, click **⇦ Back to trainer view** at the bottom of the sidebar (there's no bar over the page). The server still knows the trainer as an Admin, so Pause never stops them. Saving works as usual. The view lasts for the browser tab and ends at sign-out.

## 📝 Registering and signing in (trainees)

**Registering** asks for three things only (`functions/api/register.js`):
- **Full Name**: first and last name, with the middle initial and suffix if they like (e.g. `Juan P. Dela Cruz`, `Ana Reyes Jr.`). The CMS splits it into its name columns itself.
- **Batch ID**: `B` and the date their batch started, as MMDDYY, e.g. `B100526` for 5 October 2026. Their trainer gives it to them. It must be a real date. Capitals, spaces and dashes don't matter, the B can be left off and a four-digit year is shortened. Batch IDs given out before October 2026 as DDMMYY (`B300926` for 30 September 2026) still work as they are. The longer form the CMS used before (`B30092026`, `B30092026-LSHTRAINEE-001`) is read as the short one, without the trainee number.
- **Username**: 3 to 30 letters, numbers or underscores.

There is no email, start date or password. The day they register counts as Day 1 of training. The registration waits for an Admin's approval; approving keeps the Batch ID the trainee typed.

**Signing in** on the Trainee Portal tab: **just the username**, once an Admin has approved the registration. The Batch ID was typed at registration and stays on the account, so it isn't asked for again (`functions/api/login.js`). Other capitals are fine (a phone capitalising the first letter) when only one trainee has that username; if two do, it has to be typed exactly. Trainees who registered earlier with a password sign in the same way. Only a Trainee account signs in by username: an Admin account never does (trainers use the Admin Portal tab and the admin password). A registration still waiting for approval, and a declined, suspended or revoked account, are refused as before. A browser tab opened before this change that still sends a Batch ID or password signs in too.

**Changing a Batch ID** (Admins): in Master Control's **Registrations** or **Users** tab, each trainee has **✎ Batch ID**. Type the new one and press **Save** (or Enter; Esc cancels). It fixes a typo before approving, or moves a trainee to another batch. The trainee's next sign-in carries the new Batch ID (`functions/api/update-batch.js`). Admins' own Batch IDs can't be changed this way.

In the **Users** tab, trainees are grouped by Batch ID, the newest batch first.

**One Batch ID format, B + MMDDYY** (since October 2026; it was B + DDMMYY). That's what trainees type, what an Admin's edit saves, and what the CMS issues itself: a trainer's account gets the day it was made, and a registration approved without one gets its start date (`nextBatchId` in `functions/_utils.js`). The batch the training platforms send is read the same way. Batch IDs saved in the old long form, with a trainee number (`B30092026-LSHADMIN-003`, `B05022026-LSHTRAINEE-001`, `B300926-LSHTRAINEE-004`, `B30092026`), are shortened to `B300926` / `B050226`, without the trainee number, the first time anyone signs in (`shortenOldBatchIds`); their dates keep the order they were given in. A Batch ID is shared by everyone in the batch, so it isn't unique.

**The trade-off:** anyone who knows a trainee's username can sign in as them. That's the same convenience the name sign-in below already gives on the training platforms, and an Admin approves every registration first (an Admin can suspend or revoke an account at any time). Admin access still needs the admin password.

## 👤 Name sign-in from our other training platforms

Trainees **register in the CMS once**, so their trainer can follow their work. After an Admin approves them, opening the CMS **from one of our training platforms** signs them in with **just their name** (`guest-access.js` → `/api/guest-login`).

**Which platforms:**

| Platform | Link sends |
|---|---|
| LSH Training Portal: the Training Directory's **🗂 Case Management System** banner and the Call Simulator's case links | `from=portal` |
| Property Damage Claims Training | `from=pd` |
| Standard Foundational Training | `from=standard` |
| EA/PA Training | `from=ea` |
| Case Management Training | `from=cm` |
| Medsum & Demand Training | `from=md` |

- The links also send `name=` and `batch=`, which fill in the form.
- A link without `from=` still counts when the page that linked here (the browser's referrer) is one of those sites, including their preview addresses.
- The platform is remembered for the browser tab.

**What typing a name does:**
- **It matches the registered trainee's own account** (their first and last name, with or without the middle initial or suffix; capitalisation doesn't matter), and signs them in exactly as their username would.
- **Two registered trainees with the same name:** the form asks for the **CMS Batch ID** to pick the right one.
- **A registration still waiting for approval** is told to wait. Declined, suspended and revoked accounts get their usual message.
- **Not registered yet:** they're told to register, and **Register now** opens the registration form with their name (and batch, if the link sent one) filled in.
- **Name-only accounts** made before registration was required (usernames starting `guest-`) keep working.
- **Admin accounts are never reached by name.** Only Trainee accounts are.

**Opened directly** (not from a platform):
- The **Register** form comes first. **Back to log in** switches to the usual sign-in.
- Once a browser has signed in, it gets the sign-in screen from then on.
- Name-only sign-in never works outside a platform.

**The trade-off:**
- On a platform page, anyone who types a registered trainee's name signs in as that trainee. That's the point of it: quick access, and the trainee's work still lands in their monitored account.
- Failed name look-ups are limited to 120 per connection per hour (a class often shares one office connection).
- Admin access still needs the admin password.

**Data** (D1):
- the trainee's own `users` row;
- `guest_accounts`, for the older name-only accounts;
- `guest_login_rate`, which counts failed look-ups.

Code: `functions/_guest.js`, `functions/api/guest-login.js`, `guest-access.js`.

## 🔐 Signing in from the LSH Training Portal

With the admin password set (and `PORTAL_ONLY` not `off`), trainees sign in only on the LSH Training Portal and open the CMS from there. The Portal's signed ticket says who they are (first and last name, and their Batch ID). Administrators type the admin password (`functions/api/portal-login.js`, `functions/_portal.js`, `guest-access.js`).

**Finding the trainee's account** (by first and last name; capitalisation, accents and a middle initial or suffix don't matter):
- **One account has the name:** that one. A registration still waiting is approved by the Portal; declined, suspended and revoked accounts get their usual message.
- **No account:** one is made, already approved.
- **Several accounts have the name** (often the same person registered twice), narrowed down in this order:
  1. the Portal's Batch ID;
  2. declined registrations are left out;
  3. one approved account beside ones still waiting (never signed in, so empty): the approved one.
- **Still more than one** (two approved accounts in the same batch, or one beside a suspended or revoked one): refused, never guessed. The trainee is asked to tell their trainer, who removes the extra account or gives each one its own Batch ID in Master Control → Users. A suspended account never lets its owner in through another account with the same name.

## 🪪 The case header: Client's Name, SSN and the Client's ID

The top of the case is the client's demographics. Each box has its label above it and a border you can see, empty or filled:
- **Client's Name**;
- **Contact**, **SSN** and **DOB**;
- **Attorney**, **Case Manager** and **Target Settlement**.

The **SSN** and the **DOB** are typed in the header. Once there is one, the header's SSN shows only its **last 4** (`•••-••-1234`), as the front desk verifies a caller: with the last 4, never reading the whole number out. **👁** shows the whole number for 30 seconds (**🙈 Hide** hides it sooner), and each look is logged: Master Control → Monitoring → **Server Logs** lists it as **SSN Viewed**, with who, when and the case (`case-alerts.js`, `/api/case-activity`). An empty SSN box stays open for typing; after typing, it hides when you leave it. Only the view is masked: the saved SSN keeps every digit. The Profile tab no longer shows them: its SSN and DOB boxes are kept, hidden, and they're the ones that are saved (the header's are second views of them, `data-mirror` in `app.js`), so cases saved before keep every field where it was.

**Client's ID** is the card in the middle of the header (`client-id.js`). In a narrower window the right side (case number, status, search) gives up room first, then the ID card, and the client's boxes least; if the header still doesn't fit, the case is shown smaller (`case-fit.js` counts the header too).
- **A Training Library client** has a **mock ID** made from their file: name, date of birth, address, and an ID number of its own. It's marked *SPECIMEN · for training only · not a government ID*, follows no real state's design, and has a drawn silhouette, not a photo. A trainee's saved work on a library file shows that client's mock ID too.
- **Any other client:** **⬆ Upload ID** takes a photo or scan of their ID (JPG, PNG or WebP).
  - The photo is redrawn at most 1,600 px on its long side as a JPG before it's sent. That keeps it under the 2 MB upload limit and leaves the photo's location data behind.
  - It's kept in the site's file storage (R2, through `/api/upload`, like Doc Hub files) and saved with the case by its key.
  - Save the case to keep it.
- **Click the card** to see it larger. For an uploaded ID, the larger view has **Replace** and **Remove**.

## ⚠ Case alerts: the critical note and the conflict check

Both sit under the case's top bar, above the tabs, so they're seen on every tab (`case-alerts.js`).

**⚠ Critical note.** One short note that everyone must see before talking about the case: *Spanish only*, *a minor: speak only to her mother*, *time-limited demand expires 11/01*.
- **⚠ Add critical note** opens it; Enter finishes it. It's a red strip, 500 characters at most (the details go in a Case Note).
- It's saved with the case by id (`#kx-critical`, data-keyed), and it's on the first page of the case summary PDF and at the top of Monitoring's and Case Logs' views of a case. At the limit, what's typed or pasted is cut, never the end of the note.
- The Training Library files with something everyone must know have one (MC-04, MC-10, MC-15, MC-20, MC-27, MC-33, MC-34: who is or isn't authorized, a minor, a safety flag, a hard-of-hearing client, a mediation the client must attend). It's part of the case header, so the programs that edit the header (Intake, Case Management) can change it; on a view-only file it shows but can't be added to.

**⚖ Conflict check.** A firm can't act for someone against its own client. As people are added to a case, the CMS compares their names with the other case files and warns about a **possible conflict of interest**:
- the **client** here has the same name as someone **on the other side** of another file (the party at fault: the BI policy holder, the other vehicle's driver or owner);
- someone **on the other side** here (Parties Involved: At-Fault Party, At-Fault Driver, Vehicle Owner, Property Owner / Business; the other vehicle's driver and owner on Property Damage; a BI policy holder) is a **client** on another file.
- The other files are the Training Library's (everyone on them) and your own saved cases (their clients: the list of cases doesn't carry the parties). Never another trainee's. A client on two files is the same client, not a conflict; witnesses and passengers aren't checked; a file is never compared with itself.
- Names match as people write them: "Coleman, Andre" is Andre Coleman, "Sofia Morales (minor), by her father …" is Sofia Morales; nicknames in quotes, middle names, accents, curly apostrophes and Jr./Sr. don't matter; either half of a hyphenated surname matches; a business isn't a person.
- Each warning names the other file (client, case number, date of loss) with **Open that file**, **Not the same person** and **Escalate to attorney**. Each decision is logged as a **Case Note** (who decided, and which file). *Not the same person* ends the warning; an escalated one stays up, marked as waiting for the attorney, until **Cleared by the attorney**. Only a note that records a decision on that person and that file counts. Save the case to keep the note.
- The decision buttons show where the Case Notes can be added to (on a library file: when the program has the Notes tab, or the Front Desk's view-only file).
- To practice it: start a New Intake for a library file's at-fault party (Kyle Brandt hit Maria Santos, MC-01).

## 🗂 Case editor: newer sections

**The tabs, in order** (two rows of 9): Profile · Parties Involved · Police Report · Insurance · Treatment · Lost Wages · **Case Costs** · Demand · Settlement (BI/UM), then ADR · Litigation · Doc Hub · Notes · Tasks · 📅 Calendar · ⏱ Time · Liens · Property Damage. **Case Costs** is the tab that was called Finance (the case's costs, with their total). Only the tab buttons moved: the tabs' contents stay where they were on the page, so cases saved before load exactly as they did.

**Parties Involved** (tab after Profile)
- Everyone involved in the incident, each with a role: client, passenger, client vehicle driver, at-fault party, at-fault driver, vehicle owner, property owner / business, witness, or other.
- Each person has contact details, insurance and claim number, vehicle or location, whether a statement was taken, who represents them, and notes.
- The **+ Passenger / + At-Fault Party / + Witness / + Other** buttons add a person, and a count of each role shows at the top.

**Authorized to Access Case** (Profile)
- The people the client authorized to discuss the case.
- For each: their relationship, a phone number, whether the authorization is on file, and what they may discuss.

**Case status** (the dropdown under Case ID, shown large in the case header)
- The firm's statuses, with sub-statuses indented under their stage:
  - Intake · Treating · Pending Demand (Demand Writing; BI Demanded, with Settlement Negotiations and Settled; UM or UIM Demanded, with Settlement Negotiations and Settled)
  - Disbursement · Closed · Storage
  - Pending Litigation/ Lit (Litigation Initiated, Service, Pending Response, Litigation Discovery, Deposition, Mediation, Arbitration, Trial Prep, Trial)
  - Litigation review (Litigation Initiated, Service, Pending Response, Litigation Discovery, Deposition, Pre-trial, Trial, Litigation Settled)
  - Drop Review (Pending Drop, Dropped, Dropped Lien, Referral)
- A name that appears under two stages is saved with its stage, so the header says which one: BI Settlement Negotiations / UM or UIM Settled, and Litigation review – Service.
- **Older cases:** a case saved with an older phase name opens on the matching status: Investigation and Treatment → Treating, Demand Review → Pending Demand, Bi Demand → BI Demanded, BI Settlement Nego → BI Settlement Negotiations, UM Demand → UM or UIM Demanded, UM settlement → UM or UIM Settlement Negotiations, Lien Negotiations and Settled → BI Settled, Litigation → Litigation Initiated, Discovery → Litigation Discovery, Post Trial → Trial, Dropped Case → Dropped, Referred Out → Referral.
- **Automated review:** the case review's stage checks group the statuses by stage (`PHASE_STAGES` in `functions/_utils.js`):
  - Treating on: the date of loss is expected.
  - Any demand status on: the attorney, case manager and documents are expected.
  - Litigation statuses: the litigation dates are expected.
  - The saved phase is matched regardless of case (it's stored in capitals), which the earlier list's check didn't do.
- **Trainer Notes:** a trainer writes them on each entry of a trainee's review feed (📊 My Dashboard → the trainee). The trainee sees each note, read only, as **📝 Note from your trainer** with the trainer's name on their own My Dashboard (`functions/api/trainee-dashboard.js`). Only an Admin can write one (`review-comment.js`).

**DOB in the case header** (beside the SSN)
- The header's rows: Contact, SSN, DOB; then Attorney, Case Manager, Target Settlement. The client's date of birth is typed in the header; the Profile tab's Identity card no longer shows it.
- Target Settlement is still the third field cases are saved by (the SSN and DOB between aren't positional), so moving it beside Case Manager doesn't change where a saved settlement goes.
- The header's DOB is a second view of the DOB the case has always saved (`data-mirror`, kept the same by `client-id.js`, like the header's SSN). The positional fields don't move, so every case saved before opens with its DOB in the header.

**Other Pertinent Info · Non-Economic Damages** (Profile → Identity)
- A box for how the injury changed the client's life: pain and suffering, emotional distress, loss of enjoyment, scarring, family and relationships, help needed at home. It's saved by id (`kx-noneconomic`).

**Opposing Counsel** (Litigation)
- **+ Add Opposing Counsel**: the defense attorney, their law firm, who they represent, phone, email, assistant or paralegal, and address and notes. Saved by id (`kx-counsel`).
- A library file in litigation shows its defense counsel there (`counsel` in `mock-cases.js`), and so does the Training Library PDF. The 📇 Search contacts bar finds them too.

**⬆ Upload Demand** (Demand → each demand)
- Attaches the demand letter (PDF, Word or a scan, up to 2 MB) to that demand. It's uploaded to the case's file storage, as Doc Hub files are, and linked on the demand (📄 name, × to remove). It's saved with the case.
- A demand saved before this gets the upload box when the case opens. On a view-only file, the upload and remove buttons are hidden.

**Primary Injury** (Profile, beside the Case Narrative)
- The client's primary injury, the body parts involved, the injury type (soft tissue, fracture, head injury / concussion, spine / disc, joint / ligament / tendon tear, laceration / bite / scarring, burn, multiple injuries, wrongful death, other), and surgery (no, recommended, scheduled, completed).
- Also any prior injury to the same area, and the diagnosis and details (imaging, restrictions, future care).

**Passenger Records** (bottom of Profile) are retired: passengers go in **Parties Involved** (+ Passenger). The block shows only when an older case has passenger rows, with a note pointing to Parties Involved. Its container stays in the page because saved fields are restored by position.

**Location of Incident**: in the case's top bar, next to Date of Loss and SOL.

**Report Type** (Police Report tab)
- The choices are **Police Report**, **Incident Report** (premises cases with no police report), or **No report available**.
- The choice relabels the tab and the report's fields. For example, *Property / Business* and *Incident Report Number* replace *Responding Agency* and *Report Number*.

**ADR: Mediation & Arbitration** (tab, first on the second row, before Litigation)
- **ADR** is Alternative Dispute Resolution: mediations, arbitrations (binding, non-binding, UM/UIM) and settlement conferences, before a lawsuit or in one.
- **+ Add ADR** adds one: its type, how it was set (agreed, court-ordered, required by the policy), status, whether the client must attend, the mediator or arbitrator and the provider, date, time, place or video link, brief due date, prep session, the carrier's rep with authority, the fee and its split, the last demand and offer, the settlement or award, and notes.
- Above the list: how many there are by status, the **next session** with how many days away, and when its **brief is due**. A brief past due, or a session that has passed but is still Scheduled, is flagged (not on a view-only file, which nobody there can update).
- Saved by id (`#kx-adr`). The library files in mediation or arbitration have theirs (MC-34, MC-39, MC-40, MC-47). The Case Management program edits it.

**Lost Wages** (tab after Treatment)
- Employer and job, pay type and rate, hours, time off work, days missed, the doctor's off-work note, and wage verification.
- It shows an estimate: hourly rate × hours ÷ 5 per day, or salary ÷ 260 work days, times the days missed.

**Demand** (tab)
- One entry per demand sent (BI, UM, UIM, PIP, policy limits, pre-suit).
- Each entry has the carrier, adjuster, claim number, date sent and how, amount, response due date, whether it's time-limited, status, the response received, and enclosures.

**Liens** (tab)
- Each lien has its **status**: Unconfirmed, Confirmed (lien letter received), Final lien received, Reduction requested, Negotiated, Waived or Paid; the **date notified** or of the letter; the **reduction requested**; the **final payoff**; and lien notes.
- More lien types: **Medicare**, **Medicaid / State**, **ERISA Plan**, **Workers' Comp** and **Child Support**.
- Above the list: how many liens, the amount claimed, what's **still to pay** (the final payoff where there is one, nothing for waived or paid ones) and what reductions and waivers **saved**, then the count and amount by status. Unconfirmed liens are flagged there and on the Settlement tab, whose liens figure may be wrong until the lien letters are in.
- A lien saved before these fields gets them when the case opens, keeping what it had, with the status **Not recorded** (nobody said where it stands, so it isn't counted as unconfirmed). The library files' liens carry their status from their notes (MC-11's hospital lien: reduction requested to $9,000).
- A trainer's edit of a library file, or a trainee's saved work on one, from before the critical note, ADR and lien status existed opens with the file's own critical note, ADR and lien statuses (matched by the lien's file number), so an older save never hides them or saves them away.

**Treatment: gaps in care** (under the Medical Chronology)
- Worked out from the chronology's dates of service and the Provider Treatment Matrix, and never saved: a **gap of more than 30 days** between visits, a **first visit more than 7 days** after the date of loss, a visit dated before the accident, and a provider in the matrix with **no visits** in the chronology. Adjusters attack these, so each one needs a reason in the notes.
- With none, it says so (✓ No gaps over 30 days, with the number of visits and their dates).

**Case Costs** (tab, was Finance)
- The case's costs (filing fees, records charges, postage…), each with its date, who and the amount, and their total.
- The total is **taken off the settlements automatically**, once: each settlement (BI, UM/UIM and every additional policy below) carries its share of the costs by its gross, and the shares always add up to the total (all of it sits on BI until something has a gross). Those Case Costs boxes can't be typed in while there are case costs; change the costs on this tab. With no case costs entered, they're typed as before: a figure typed there comes back if the case costs are removed again, and a case's own typed costs are kept when it opens.
- The **Target Settlement** in the case header shows what's left after the case costs: *After case costs ($ 500.00): $ 49,500.00*.

**Additional insurance** (Insurance tab, **+ Add Insurance**)
- Another policy that can pay: umbrella or excess, a second at-fault party, commercial or business auto, homeowner's or renter's, premises / general liability, rideshare, an employer's policy, or other. Carrier, policy holder, policy and claim numbers, adjuster and limits.
- Each one has its own **settlement** (status, date, gross, attorney fee %, its share of the case costs, liens) worked out on its card: gross − fee − costs − liens = net to the client. The Settlement tab lists them under *Additional Insurance Settlements* and adds them to the totals.
- On a Training Library file, a policy's settlement is open to the programs that have the Settlement tab; the rest of the card goes with the Insurance tab. A second at-fault party's policy holder is in the ⚖ conflict check.
- The attorney fee of 33⅓% is a third of the gross (on every settlement), not 33.33%.
- Saved by id (`#kx-insurance-extra`).

**Property Damage Claim: Adjuster & Coverage** (Insurance tab)
- The vehicle claim, separate from the injury claim: who it's with (the at-fault party's carrier, the client's collision or UMPD, not opened yet), the carrier and PD claim number, liability, the **PD adjuster** (name, phone, email), the status, the **coverage** (property damage limit, deductible, rental / loss of use), repair or total loss, the estimate or ACV, the body shop and notes.
- Saved by id (`#kx-pd-claim`). The Training Library's car-accident files have theirs, and their PD adjusters are in 📇 Contacts.

**Property Damage Photos** (Property Damage tab, `pd-photos.js`)
- **⬆ Add Photos** adds photos of the vehicles, the damage and the scene (several at once, 20 a case). Each is made smaller before it's sent (a JPG at most 1,600 px, its location data left behind), kept in the site's file storage and named by the convention: `<Case ID>_<Last-First>_PD-Photo_<date>.jpg` (the second that day …-2; renamed with the Case ID on Save like other files). ✎ gives a photo a caption, ✕ removes it, a click shows it larger. They're in Doc Hub's ☁ Google Drive backup.
- The list is saved with the case by id (`#kx-pd-photos`).
- The Training Library's car-accident files show **mock photos** drawn from the file: each vehicle (its year, make, model and plate) with the damage where it was hit, marked *SPECIMEN · mock training photo*. Nothing to add, caption or remove on a view-only file.

**Settlement (BI/UM)** (tab)
- **BI** and **UM/UIM** are separate claims, so each has its own card. BI is the at-fault party's carrier; UM/UIM is the client's own policy, and its card says which coverage.
- Each card has its status, carrier or party, date, gross amount, attorney fee %, case costs, liens and payoffs, release, check and disbursement dates, the offer and counter history, and notes.
- Each card shows gross − fee − costs − liens = **net to client**, and warns when the net is below zero.
- A total line adds both: total gross, fees, costs, liens and **total net to client**.
- Cases saved before the split keep their settlement as the BI settlement.

**Smaller additions**
- **Options:**
  - Treatment specialties now include **MRI / Imaging** and **Physical Therapy (PT)**.
  - The Doc Hub has an **Intake** category.
  - The new phases are Discovery, Mediation, Trial Prep, Trial, Post Trial, Settled, Dropped Case, Referred Out and Closed.
  - Employment Status now defaults to **N/A**, and has Self-Employed and Student.
  - Clearing the editor for a new case resets every dropdown to its default.
- **Field labels** (EMAIL ADDRESS, PHONE…) on the case file's tabs are dark navy, like the header's, and larger (12 px), so they read at a glance. Labels with their own colour (the red BI, the orange PIP) keep it; the sign-in screen and Master Control's forms are unchanged.
- **Treatment tab:** its notes are now **Other Treatment Notes**, so they aren't confused with the Notes tab.
- **Notes tab:** the card is **Case Notes** (it was "Case Chronology", easy to confuse with the Treatment tab's Medical Chronology), and its button is **+ Add Case Note**.
- **Staff roles** (the dropdown on Notes, Tasks and Expenses rows): adds **Litigation Assistant** (after Paralegal) and **Accounting Department** (after Closer).
- **Medical Chronology:**
  - Drag a row by its left edge (⠿) to move it.
  - **⇅ Sort by Date** orders the rows by their first date of service.
- **Doc Hub:**
  - Drag files onto the drop area to attach them. Each file becomes a document row, under the category picked there.
  - A file dropped on a row attaches to that row.
  - Uploads are named by the firm's convention (below), and a row can hold a web link instead of a file (**🔗 Link**).
  - **☁ Google Drive backup** copies the case's files to the person's own Google Drive (below).
- **Tasks from an Admin:**
  - In Master Control → Ping, **Send as a task** makes the ping stay on the trainee's screen with an **Accept** button, until they accept or dismiss it.
  - **Accept** adds the task, with who assigned it, to the open case's **Tasks** list and opens that tab. On a Training Library case it's saved right away, and the trainee can edit it and change who it's assigned to like any task; on their own case, Save or Update keeps it.
  - Pending tasks are kept in that browser until the trainee acts on them.
  - **Delivery:** `/api/state` lists the last minute's pings for the signed-in person (their own and the ones to everyone) with each one's age measured on the server, so tasks sent a moment apart to different trainees all arrive, and a trainee whose computer clock is off still gets theirs. Each ping shows once per browser (a reload doesn't offer an accepted task again). The task card sits beside the Front Desk panel, not over its buttons.
- **Monitoring:** *View Latest Saved* works again. The username was placed inside the click handler in a way that broke it. Names are now shown as text, not HTML.

**How they're saved:**
- The case's older fields are saved by their position on the page. A field inserted among them would shift every case saved before it.
- The new sections are saved by id instead (`[data-keyed]`, stored in `content.keyed`), and they're left out of the positional lists.
- A case saved before these sections existed loads unchanged, with the new sections empty. `sections.cjs` checks this with a case saved by the previous version (`.github/scripts/fixtures/case-before-keyed.json`), and it fails if the page's positional fields change.
- Code: `case-sections.js`, and "Keyed sections" in `app.js`.

## 📝 New Intake (graded, and it creates the case)

1. **📝 New Intake** (in the sidebar, under the cases, or **📝 New intake** in the Intake folder).
2. **Pick the case type:** MVA, Slip and Fall, Premises Liability, Dog Bite or Medical Malpractice. That type's intake form opens. It follows the firm's intake sheet:

   | Case type | Follows | The case's type |
   |---|---|---|
   | 🚗 **MVA** | Personal Injury – Client Intake Form | MVA |
   | ⚠️ **Slip and Fall** | Client Intake Form – Slip and Fall | Slip and Fall |
   | 🏢 **Premises Liability** | Client Intake and Case Information Questionnaire (Premise Liability) | Premise Liability |
   | 🐕 **Dog Bite** | Client Intake Form – Dog Bite | Dog Bite |
   | 🩺 **Medical Malpractice** | Client Questionnaire (Medical Malpractice) | Others: Medical Malpractice |

3. **Gather the information and the Facts of loss.** Only the client's name is needed to save; everything else counts toward the grade.
   - Questions that follow a Yes / No show once it's Yes.
   - Dates, phones, SSNs and amounts format themselves as they're typed.
   - The MVA form fills in the day of the week from the date of injury.
   - The paper diagram of the scene is a box to describe the layout.
   - Two questions are added because the case file needs them: the date of birth on the MVA form and the date of loss on the Medical Malpractice form.
4. **💾 Save Intake.** It does three things:
   - **Grades the intake** on how much was gathered:
     - **Key information**, 45%: the essentials the form asks for, such as name, phone, DOB, address, date of loss, where it happened, facts of loss, injuries, treatment, insurance, the report, who is at fault, emergency contact and employment.
     - **Questions answered**, 30%: a follow-up counts only once its Yes is given.
     - **Facts of loss**, 25%: the detail in the client's account. 60+ words is full marks.
     - The letter: A 90+, B 80+, C 70+, D 60+, otherwise F.
   - **Creates the case:** the editor is filled in from the answers, and the case is saved with its Case ID. The answers fill:
     - the client, the emergency contact and employment;
     - the date of loss, the location and the case type;
     - the narrative and the Primary Injury card;
     - the police or incident report;
     - the parties and witnesses;
     - health, BI and PIP insurance;
     - the providers, with a specialty from each name;
     - Lost Wages, and both vehicles for an MVA.
   - **Shows "New case created"** with the Case ID, the grade, and what to ask next time.

**What's kept with the case:**
- **A Case Note** records the grade. It also lists every answer that has no case field of its own (marital status, spouse, bankruptcy, another attorney, vehicle damage…).
- **The Profile tab** shows **📋 Intake form** with the grade, plus **View intake form** (read only) and **🖨 Print**.

**Other details:**
- If the editor has a case open, saving asks before closing it.
- If the save fails, the result says so, and the filled-in case stays in the editor to save with **Save Case**.
- An unfinished intake is kept in the browser for that user. **📝 New Intake** offers to **Resume** or **Discard** it.
- The form adds no dropdowns or typed boxes to the page that the case editor would save by position.
- Code: `intake-form.js`. The fill helpers are shared with the Training Library (`window.caseFill`), and the save is `saveCase({ quiet: true })` in `app.js`.

## 🕑 Latest updates (search the Case Notes)

**🕑 Latest Updates** in an Admin's sidebar (or the Case Library window's **🕑 Latest updates** tab) lists the saved cases, the most recently updated first. Admins see everyone's cases. Trainees don't get the sidebar button; in the Case Library window (Ctrl/Cmd+K) the tab shows them only their own cases.
- Each case shows its **latest Case Note** (the latest by date), how many notes it has, and when it was last updated.
- **The search box searches the Case Notes:** a note's text or date, for example "adjuster", "demand sent" or "10/01/2026". It shows the cases whose notes match, with the matching notes highlighted.
- **Open** opens the case.
- The server reads the notes only when this view asks (`/api/case-repository?updates=1&q=…`), never in the 15-second background refresh of the case list.
- Code: "Latest updates" in `case-library.js` and in `functions/api/case-repository.js`.

## 📇 Contacts (a card for everyone in the case files)

There's no list to browse: the small **📇 Search contacts** bar right under the case header's Search cases (everyone signed in) finds a contact and **pops up their card**.
- As you type, matching contacts drop down: whose name matches first, then by company or role, then the rest (a client, a case number, a phone). Up to 6 show, with "+N more: keep typing".
- **Enter** pops up the top one's card (↓ ↑ pick another first); **a click** pops up that one. The card shows the others that matched (**Also matching**) to switch to.
- **Esc**, **✕** or a click outside closes the card. In the bar, the first Esc closes its list and the second clears it.
- Typing in the bar is never an edit to the case, on a view-only file too.

The cards, built in the browser from `mock-cases.js`:
- **🩺 Medical providers:** the files' treating facilities, with their specialty, phone and email.
- **🛡 Adjusters:** the BI and PIP / UM / MedPay adjusters, with their carrier; a carrier with no adjuster assigned yet gets its own card. Each case shows the claim number and the insured.
- **⚖ Opposing counsel:** the defense counsel on every file in litigation (`counsel` on the file: name, firm, who they represent, phone, email). Three files already named them in their notes (Richard Voss, Paul Hendricks, Voss & Tate and Lang & Ortiz); the other litigated files were given fictional counsel in the same style. `check-data.mjs` checks every litigated file has one.
- **👤 Clients:** phone, email and address. The same person on two files (same name and date of birth) is one card with both files; two people who share a name are two cards.
- **👥 Others:** emergency contacts, the parties at fault (with their phone when the file has it), lien holders, health plans, police and other reporting agencies, and employers.

A card lists the cases the contact is on: the client, the case number and what they are on that case (dates and status, the claim, who they represent). The first 4 show; **Show all** shows the rest. **A click on a case opens that file** (as the trainee's program allows) and closes the card.
- **Search** by name, company, phone in any format (`5550103345`, `555.010.3345`), email, claim, report or lien file number, a client's name or a case number. A search by client puts that client's case first on the card.
- Trainees never see the Training Library's name or its MC- numbers here: a case is its client and case number.
- It's built from the library files as they ship. A trainer's edit to a library file (💾 Save to the library) doesn't change the cards.
- Code: `contacts.js`; the data is `mock-cases.js`.

## 📎 Doc Hub: file names, links and Google Drive backup

**File names.** Every file uploaded to a case is named by the firm's convention, so it reads the same in the case, in a download and in a Drive backup:

`<Case ID>_<Last-First>_<Type>_<YYYY-MM-DD>.<ext>`, e.g. `LSH-2024-PRL-900171_Garcia-Linda_Medical-Records_2026-10-04.pdf`

- **Type** is the Doc Hub category of the row (Medical Records, Bills, Police Report…), **Demand-Letter** for ⬆ Upload Demand, **Client-ID** for ⬆ Upload ID. The date is the day it was uploaded.
- The client's name is last name first (typed as "Garcia, Linda" too); an all-capitals name is written normally, accents are dropped, and Jr./Sr./II/III are left off.
- Two files of the same type uploaded the same day are told apart: the second is `…-2`, the third `…-3`.
- A case with no Case ID yet (a new case, a draft) names its files `NO-CASE-ID_…`. When **Save Case** gives it its Case ID, those files take it (the links, the downloads and the client's ID), and the case is saved once more with the new names. A case saved before this takes it when it's opened. A download asks `/api/file` for the name the case shows (`?name=`, letters, digits and `- _ .` only), so a renamed file downloads under its new name.
- Only letters, digits and `- _ .` are used, so the name survives every system it passes through. The file's own name is kept on the link (hover over it: *Original file: …*).
- Files uploaded before this keep their names. Code: `caseFileName` in `app.js`.

**Links.**
- **🔗 Link** on a Doc Hub row attaches a web address instead of a file (a shared folder, a provider's portal, a website), with a name. `www.` is made `https://`; anything that isn't an `http(s)` address (`javascript:`, `data:`…) is refused.
- **In any text field of the case** (notes, tasks, summaries…), a pasted web address becomes a link. Select some words and paste an address over them and the words become the link. Phone, date, email and money fields aren't linked.
- A click on a link in a field shows where it goes, with **Open ↗** (a new tab) and **Remove link** (where the field can be edited); a plain click in an editable field only puts the cursor there.
- A library case's Notes and Tasks are saved as text (per trainee), so a link there is kept as its address ("the words (https://…)", or just the address) and becomes a link again when the case opens (`lshLinkify`). Links that open a new tab always get `rel="noopener noreferrer"`, also on cases saved before (`cleanCaseHtml`).
- The case summary PDF lists a Doc Hub link as 🔗 with its address. Code: `case-sections.js` (Hyperlinks).

**Litigation paperwork** (Litigation → Discovery & Filing Tracker):
- Each row (a filing, a discovery request or response, a hearing…) has a **Document** column: **Upload** the filed copy or the paper served, or **🔗 Link** a web address (a court's e-filing page, a shared folder). Uploads are named by the convention above, with the row's Task Type: `LSH-2026-MVA-000041_Santos-Maria_Complaint_2026-10-05.pdf`.
- Task types now also include Answer, Discovery Responses, Proof of Service, Notice of Hearing, Court Order, Stipulation and Other.
- The Litigation tab has the same **☁ Google Drive backup** bar as Doc Hub. A backup from either tab copies all of the case's files; the litigation documents go in the case folder's own **Litigation** folder: **LSH CMS Backups / <Case ID> <Client> / Litigation**.
- The case summary PDF lists them under *Litigation Documents*.
- Rows saved before the Document column get it (and the newer task types) when the case opens. The column holds no field that's saved by position, only the link inside it, so older cases open as they were.

**☁ Google Drive backup** (`drive-backup.js`, `/api/drive-backup`, `functions/_google_drive.js`):
- In **Doc Hub**, the bar at the top: **Connect Google Drive** once (any Google account, a Gmail address included), then **☁ Back up this case's files**.
- It copies the open case's uploaded files (the Doc Hub attachments, the Litigation documents, the demand letters, the client's ID, the property damage photos) into the person's own Drive, under **LSH CMS Backups / <Case ID> <Client>** (the Litigation documents in its **Litigation** folder), with the names above. **Open in Drive ↗** goes to the case's folder. The bar is on the Doc Hub and Litigation tabs.
- Backing up again sends only what's new. A case folder (or its Litigation folder) deleted in Drive is made again, with its files. Links aren't copied. Files kept inside a case from before uploads went to storage can't be copied: the bar says how many, and uploading them again fixes it.
- The CMS asks Google only for **drive.file**: it can see and change only the folders and files it made, nothing else in the person's Drive. The tokens are stored encrypted, like Google Calendar's. Only files the person may open themselves are copied (the same rule as opening them, `functions/_file_access.js`). **Disconnect** gives the access back; the copies stay in Drive. Google Calendar (the Firm Calendar) and Drive backup use one Google sign-in, so on the same Google account they share Google's permission: disconnecting one never takes back what the other still uses, and connecting the second one uses the first one's long-term access when Google doesn't send a new one (`otherGoogleLink`, `sharedRefresh` in `functions/_google_calendar.js`).
- The status is asked for the first time Doc Hub is opened, not on every page load. The bar isn't part of the case (it's `data-free-edit` and isn't printed).
- **Setup (an admin, once):** it uses the same Google sign-in as the Firm Calendar's Google Calendar (`GOOGLE_CLIENT_ID`, plain variable; `GOOGLE_CLIENT_SECRET`, encrypted secret, on the Pages project). In that Google Cloud project: turn on the **Google Drive API**, add the `…/auth/drive.file` scope to the OAuth consent screen, and make sure the site's address is an **Authorized JavaScript origin** of the OAuth client. Until `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, the bar says backing up isn't switched on.
- **Data** (D1, created on first use): `drive_links` (the Google account and its tokens, encrypted with a key derived from `SESSION_SECRET`; the "LSH CMS Backups" folder), `drive_case_folders` (each case's folder) and `drive_backups` (each file copied).

## 🧭 The sidebar, the top of the page and the case's actions

**The sidebar** runs from the top of the page (the LSH logo is at its top), top to bottom (`index.html`, `#sidebar-actions`):
1. **Training program** (All programs, or one program).
2. **The cases:** a trainee's **My cases**, or an Admin's **Case Library** with **🔍 Open Case Library** and **🕑 Latest Updates**.
3. **📝 New Intake**, **📞 Call Simulator** (the Front Desk practice calls and drill) and **🗓 Attorney's Calendar** (the Calendaring activity).
4. **Trainer tools** (Admins only): 📚 Training Library, 📥 Intake Folder, 📅 Firm Calendar.

**The strip at the top** (over the case, not the sidebar): the announcements, and at its right **📄 Download Case Summary**, **📊 My Dashboard** and **🧭 Blueprint** (`#top-actions`; in a narrow window they show just their icons). It no longer says "LEGAL SUPPORT HELP TRAINING INTERFACE - … PORTAL".

**The date and time** (with the time zone picker) are right above the case's Case ID, outside the case (`#case-clock-row`). They stay outside `#capture-area` on purpose: a case's dropdowns are saved by position, counted from the top of the page, so the picker keeps its place in front of the case's.

**The timer** is in the case header, under the search bars: ⏱ **▶ Start timer** and a **Billable / Non-billable** dropdown (the timesheet is on the case's ⏱ Time tab; below).

Trainees see only the first three sidebar groups, so their sidebar is the program, their cases and their work. They still reach the Firm Calendar through the case's **📅 Calendar** tab (the Attorney's Calendar is in their sidebar), and the Intake folder through a course link (`?intake=1`). **👁 Trainee view** shows a trainer the same.

**The open case's actions** are in the bar at the bottom of the screen, under the case:
- **✕ Close** closes the case and leaves the editor blank. **✕** at the top right of the case does the same.
  - A saved case stays saved.
  - Anything not saved yet is lost, so it asks first when the case has a client name.
  - With nothing open, it says so.
  - It also leaves a Training Library case and Intake mode.
- **🗄 Archive** saves the case as a draft, with no Case ID yet.
- **🗑 Discard Case** throws the case away, after asking:
  - a case that was never saved is just cleared;
  - a saved case or draft is deleted from the saved cases (the same as its 🗑 in My cases), and only its owner or an Admin can do that;
  - a case file from the library can't be discarded (Close it instead).
- **💾 Save Case** saves it (and gives it its Case ID).
- **⟳ Update Case** saves the changes to a saved case that's open.
- The autosave note sits between them.

Code: `closeCase()` and `discardCase()` in `app.js`. The bar is outside `#capture-area`, so it's never part of a saved case.

## 🧭 Blueprint (how the CMS works, for trainees, trainers and the Admin)

Top right → **🧭 Blueprint** (after 📊 My Dashboard) opens a full-screen slide deck that explains the CMS, like the Orientation in EA / PA. There are three versions:
- **Trainee blueprint** (12 slides and a cover): what the CMS is, signing in and finding your way (the sidebar and the top right), finding a case, 📇 Contacts, New Intake, the case bar and the 17 tabs, saving and autosave, the calendar and the timer, the Call Simulator, My Dashboard and the case summary, and good habits. It never names the Training Library or the trainer tools.
- **Trainer blueprint** (Admins only; 20 slides and a cover): signing in, before a batch starts, the program links, registrations and users, Monitoring and 👁 Watch live, Case Logs, Broadcast & Ping, access control, the Training Library, the case header (Client's Name, SSN, Client's ID), facilitated mock calls, the Call Simulator and its RECEPTION MOCK CALL scorecard, grading and feedback, the Case Library and Latest Updates, the Intake folder, the Firm Calendar, time and drill results, a training day, Trainee view, and when something goes wrong.
- **Admin blueprint** (the Master Account only; 15 slides and a cover): who does what, signing in and sessions, accounts and batches, Master Control, Pause and Database Maintenance, Cloudflare usage and billing (Workers Paid), the AI keys, updates, data and records, database upkeep, the settings (secrets; limits and bindings), the routine, when something breaks, and the known gaps.

Trainees, and Admins in 👁 Trainee view, get the Trainee blueprint only. Trainers get the Trainer and Trainee blueprints as tabs, so they can share the Trainee blueprint in Google Meet on day one. The Master Account gets all three, opening on the Admin blueprint (`canAdmin` in `blueprint-content.js`).

- **Moving around:** ◀ ▶, the ← → keys, or the numbered contents strip under the slide. **Esc** or **✕ Close** closes it.
- **Numbering:** the cover is ★ (the counter says *Cover · 12 slides*); the slides are 1 to 12 (1 to 20 for trainers), the same on the buttons, the counter, the slide's heading and footer, and the PDF's page footers.
- **Screenshots, for visual learners:** most trainee and trainer slides show the CMS screen they describe, beside the points, with *Where to find it* under it. A click shows it full size (a click or **Esc** closes it). On a phone it's a **🖼 See the screen** button. The PDFs carry them too. They're the `.jpg` files in `blueprint/`, taken from the CMS itself by `node .github/scripts/blueprint-shots.cjs` (a made-up class: trainees, saved cases, results; the case files are the real Training Library). Take them again after changing a screen a slide shows, and look at them before committing.
- **The cover:** the LSH mark (`lsh-mark.png`) with *Legal Support Help* as real text under it, as in the sidebar, so it stays sharp at any size.
- **Fits the screen:** the slide is laid out at 1280×720 (620×1000 in portrait on a phone) and scaled to the window.
- **⬇ Download PDF:** the deck that's showing, as a landscape PDF with one page per slide (`LSH_CMS_Blueprint_Trainee.pdf`, `LSH_CMS_Blueprint_Trainer.pdf` or `LSH_CMS_Blueprint_Admin.pdf`). It's made in the browser with jsPDF, loaded from cdnjs the first time, as real text.
- **Always up to date with the deploy:** the PDF is made from the deployed site each time it's downloaded. Its cover, its footers and the header carry the deployed version (`deploy` and the start of the page's ETag, which changes with every deploy) and the date it was made.
- **Changing it:** the slides are the `TRAINEE`, `TRAINER` and `ADMIN` lists in `blueprint-content.js` (`icon`, `title`, `points`, `where`, `tip`, and optionally `shot` and `shotAlt`, its description). The page and the PDFs are drawn by `lsh-blueprint.js`, **the same file on every LSH platform** (change it in one, copy it to all); each platform has its own `blueprint-content.js`. The Admin deck is optional: a platform without `admin` and `canAdmin` in its content shows the two decks as before. So are `brand` (the name under the logo) and `shot`: without them a platform's cover and slides look as before.

## 👁 Live view (watch a trainee's screen as they work)

**Master Control → Monitoring → 👁 Watch live** on any trainee who is online opens their live view. It's close to real time, for facilitated mock calls (a trainer plays the caller over Google Meet and watches the trainee work the call in the CMS): it starts within a second or two, and what the trainee does shows about a second later. At the top:
- **Now:** where they are: the screen (case workspace, My Dashboard, sign-in), the case (client and Case ID) and the tab, plus anything open over it (📝 New Intake and the step they're on, 📞 Call Simulator and the call, 🔍 Case Library, another window). It also says when the CMS tab is in the background.

Below it, two tabs:
- **🖥 Screen** (shown first): their CMS tab exactly as it looks on their screen right now. The same layout, any panel or window open over the case (📞 Call Simulator, the Training Library, 🔍 Case Library, 📝 New Intake…), what they've typed in every box and field, the options they've chosen, where each part is scrolled, the field they're in (outlined in orange) and their mouse pointer (a red dot). It's shown at the size of their browser window, scaled down to fit, with the window's size and how long ago it was updated. **● Live** shows while it's less than 2 seconds behind; **○ Not live** when it isn't (their page stopped answering, or their tab is in the background). It mirrors their CMS tab only, not other tabs, windows or programs on their computer.
- **📋 Summary, trail and case:**
  - **Where they've been:** a trail of each change, newest first, with the time (the last 40 steps).
  - **Their case, as on their screen:** the case header (client, Case ID, status, type, DOL, SOL, attorney, case manager, the tab they're on) and every filled-in section, as text, refreshed as they type (within a few seconds).

How it works:
- **Starting.** The trainee's page sends its heartbeat every 30 seconds, as always. While nobody watches the trainee, that heartbeat waits at the server (up to 29 seconds) and answers as soon as a trainer opens 👁 Watch live. So the trainee's page hears of it within about a second, at no extra request. (While heartbeats wait, the server looks about once a second at who is being watched: one look, shared by all the heartbeats waiting there, that reads nothing while nobody is watched.)
- **While watched**, the trainee's page sends (`/api/live-screen`) right after each change: a quarter of a second after the page changes, they type, scroll or move the mouse, and at most once a second; otherwise a short "still here" every 1.5 seconds. One request at a time. Nothing at all while their CMS tab is in the background: it says so once, and the live view keeps their last screen.
- **The screen** isn't a screen share: there's no permission prompt for the trainee. The page makes a copy of itself (in an idle moment between keystrokes, so typing doesn't stutter), writes in what's typed in each field and the options chosen, takes out every script, `on…` handler and `javascript:` link, and blanks passwords. The copy is zipped and sent only when it changed (a screen is usually 50 to 100 KB zipped; copying it takes the page about 10 ms). Scrolling, the mouse pointer and the clocks go separately, in a few bytes, so they aren't a new copy.
- **The live view** reads about once a second while it's open and its tab is in view, and gets the screen only when it changed. Nothing while the trainer's tab is in the background: the watch then ends by itself after 6 seconds, and starts again within a second or two when they come back. Closing the window ends it the same way.
- **Requests.** Nobody watching: nothing extra, just the heartbeat every 30 seconds. While watched: about 40 a minute from the trainee's page (up to 60 while they're busy) and 60 a minute from the live view. A 30-minute mock call is about 3,000 to 3,600 requests in all.
- A zipped screen over 700 KB isn't sent (D1 keeps a row under 1 MB): the live view says it's too big and shows the summary. The screen is kept in its own table (`live_screen`), and only while someone watches: the first request from the trainee's page after the watch ends deletes it. Only the trainee's own page writes their screen, and only Admins can read it.
- Safe to show: the Admin's page cleans the copy again (a trainee could send one by hand) and shows it in a sandboxed frame, a separate origin that can't reach the Admin's page or cookies. A Content Security Policy lets only the live view's own small script run in it (it scrolls the copy and draws the pointer), and nothing loads from anywhere but this site and Google Fonts. The frame can't be clicked: it's for watching.
- A trainee page opened before this update can't send its screen: the live view says so and shows the summary until their page loads the new version (it does by itself, see **🔄 New versions load by themselves**, or they can reload). Until then it learns it's watched at its next heartbeat (up to 30 seconds).
- Nothing on the trainee's page says they're being watched (no notice; the trainer decides whether to tell them).
- In the summary, what trainees type is shown as text, never run as HTML. The same now holds for Monitoring's "View Latest Saved" and the Case Logs views.
- Trainers' own screens aren't watched.

What the screen can't show: anything drawn on a `<canvas>` (the CMS has none), pictures from other websites, the name of a file picked in a file box, the text cursor and selected text, and anything outside the CMS tab. Small differences can come from the trainer's own browser (fonts, scrollbars).

Code: `live-view.js`, `functions/_liveview.js` (the `live_view` and `live_screen` tables, made on first use), `/api/live-view`, `/api/live-screen`, and the heartbeat (`app.js`, `functions/api/heartbeat.js`).

## 🔄 New versions load by themselves

When a new version of the site goes live, every open page loads it by itself, so nobody keeps working on old files.
- Once a minute (every 5 minutes in a background tab, and right away when the tab comes back into view), the page looks at its own files (the page and every local script and stylesheet) and compares them with what it loaded. A change is confirmed by a second look.
- A note at the bottom says **🔄 A new version of the CMS is ready**, with **Update now**.
- It reloads at a quiet moment: right away in a background tab, otherwise after a minute with no typing, clicking or scrolling. It waits while a window, the Call Simulator or a call is open, while a Training Library case has unsaved edits, and while there's typing in a field that isn't part of the case (sign-in, a calendar entry).
- The case in the editor is kept, and the page comes back on the same tab (or Master Control tab, or My Dashboard), with "Updated to the latest version of the CMS."
- Pages opened before this feature went live don't have it: they need one manual refresh (Ctrl+Shift+R). After that they update themselves.

These checks fetch static files, which Cloudflare serves free; they don't count toward the daily Functions requests.

Code: `cms-update.js`.

## 📉 Keeping Cloudflare requests down

The account is on the **Workers Paid** plan: Pages Functions (everything under `/api/`) count toward **10 million requests a month** for the whole account, then $0.30 per extra million, with no daily limit (and no spending cap: set a billing notification in Cloudflare). Usage is under **Workers & Pages** in the Cloudflare dashboard.

On the free plan, which the account used before, Pages Functions got **100,000 requests a day for the whole account**, previews included. When they ran out, Cloudflare served the site as static files only until 00:00 UTC: pages loaded, but nothing that needed the server worked. Signing in fails (`/api/login` answers 405 with an empty body; the sign-in screen says "The CMS server isn't answering right now"; before, it said "Network error. Failed to hit validation server."), and `/api/state` returns the page's HTML instead of JSON. Every way of signing in needs the server, so none works until it's back.

To keep requests (and the bill) down:
- `_routes.json` sends only `/api/*` to Functions. The page, scripts, stylesheets and images are served as static files, which are free and don't count. Before this, the root `_middleware.js` made every file request run a Function.
- An open page asks the server only as often as it needs to:

  | What | How often (tab in view) | Tab in the background |
  |---|---|---|
  | Heartbeat (keeps the session alive; the server allows 120 s between them; a trainee's waits at the server for a trainer to start watching) | every 30 s | every 45 s |
  | 👁 Live view, only while a trainer watches (see **👁 Live view**) | the trainee's page: right after each change, at most once a second, else every 1.5 s; the live view: every second | nothing |
  | Site state (announcements, alerts, pings and pause) | every 15 s | every 30 s (a ping stays up for a minute) |
  | The case list | every minute, and after each save | paused; refreshed when the tab comes back |
  | Timer | every minute | paused |
  | Autosave | never while you work: only when something interrupts it (see **💾 Autosave** below) | the same |

  These used to be every 2 s (heartbeat), 4 s (site state) and 15 s (case list), about 50 requests a minute for each open page. Now it's about 8.
- Monitoring's **Online now** counts anyone with a heartbeat in the last 90 seconds.

## 💾 Autosave (only when something interrupts the work)

Nothing is sent to the server while you work: no timer, and no save when you look at another tab. Every request counts toward the account's monthly requests. Your work is kept in this browser as you type, and autosave sends it to the server (as a draft; a finalized case stays final) only when something interrupts it:

| What happens | What autosave does |
|---|---|
| **The network drops** | Nothing can be sent; the note in the case's action bar (empty until something happens) says *Offline: your work is kept on this computer…*. The moment the connection is back, it's sent (*Saved when the connection came back*). A save that failed is sent then too. |
| **The tab or browser closes by accident** | Sent as the page closes, in a way that outlives the page. A case that was never saved waits in this browser instead (sending it then would make a second draft on the next visit). |
| **The device** puts the page to sleep, or the tab has been away for 2 minutes | Sent. |
| **A crash or power cut** (the page gets no warning) | The work comes back from this browser on the next visit and is sent then (*Unsaved work from your last visit saved*). |
| **5 minutes idle** | The *Still working?* prompt; with no answer in 30 seconds the case is archived as a draft. |
| **Log Out** (or signed out for inactivity) | Sent first, then this computer forgets the case. If it can't be sent (offline), it stays in this browser for that person only. |

Only work the server doesn't have yet is sent: a fingerprint of the case is taken each time it's saved to or opened from the server, and an interruption with nothing new sends nothing. The fingerprint covers the case's own fields only, so changing the clock's time zone or the program picker isn't an edit. **Save Case**, **Archive** and **Update Case** save right away, as before.

**A refresh** puts back exactly what a save sends, Attorney and Case Manager included, and sends nothing when the server already has it. A draft kept before drafts held those two takes them from the server's copy before any recovered work is sent.

**A shared computer:** the case kept in the browser belongs to whoever was signed in (its owner). It comes back only for that person, whoever signs in next starts with an empty editor, and waiting tasks are kept per person too (none show signed out). Signing out also closes the live view, the Client's ID view and the Blueprint.

**Opening a case** starts from an empty editor, so no field or "Other" box from the last case stays under the new one's name. It asks first when the case in the editor has unsaved changes, and when two cases are clicked quickly only the last one opens. The dropdowns outside the case (the clock's time zone, the program picker) are never changed by opening a case. **Deleting the open case** (🗑 or Case Logs) clears the editor, so autosave can't bring it back. A save still on its way when New, Close or another case is chosen stays with the case it was sent for.

Code: `saveOnInterruption()`, `autoSaveProgress()`, `caseSig()`, `persistCurrentEditorState()`, `restoreCurrentEditorState()`, `savedSelects()` and `loadCase()` in `app.js`. Tests: `.github/scripts/autosave.cjs`, `.github/scripts/data-loss.cjs`.

## 🗑 Deleting trainees' cases (Master Control → Case Logs)

**Master Control → Case Logs** lists every case in the repository, drafts included, newest first.
- **🗑 Delete** on a case removes it for good. It first asks, naming the case and the trainee who saved it.
- **To delete several at once,** tick them, or search for a trainee (the search matches the client name, the Case ID and the trainee) and use **Select all shown**. Then click **🗑 Delete selected (N)**.
- Ticked cases stay ticked when the list refreshes.
- The server allows the delete for an Admin or the case's owner (`/api/case-repository` DELETE). A case it refuses stays in the list, with the reason.
- Code: "Case Logs" in `app.js`.

## 📥 Intake folder (automatically checked and reviewed)

A separate folder in the Case Repository for **intake files**, kept apart from the case files. Admins open it from the sidebar's Trainer tools (**📥 Intake Folder**). Anyone can open it from the Case Library window's **📥 Intake folder** tab, or with a course link ending `?intake=1`. Trainees see only their own intake files; Admins see every trainee's, with the trainee's name on each. Code: `intake-folder.js`, `functions/_intake.js` (checklist), `functions/_intake-review.js` (review), `/api/intake-files`.

**Two kinds of intake file:**
- **Typed intakes.** **📝 New intake** opens the intake form (see **New Intake** above): saving it grades it and creates the case. Typed intakes saved in the folder earlier open in **Intake mode**, with the orange bar above the case.
  - **💾 Save to Intake folder** files it in the folder. **Save Case**, **Archive** and autosave also save the intake while the bar shows, so an intake never lands in the case files by accident.
  - **📂 Move to case files** saves an accepted intake as a regular case (it gets a Case ID). The intake file stays in the folder, marked as moved.
  - **✕ Close intake** leaves Intake mode.
  - **Open** on a typed intake loads it back into the editor.
- **Intake documents.** **⬆ Upload intake document** files a PDF or image (PNG, JPG, GIF, WEBP) of an intake sheet, up to 2 MB, with the client's name, the date of loss and a note if known. Save Word files as PDF first.

**Checked automatically.** Every save or upload is scored against the intake checklist (the % badge on each file):
- **Essentials** (missing = fail): client name, phone, date of birth, date of loss, SOL date, what happened, injuries and treatment, insurance.
- **Recommended** (missing = warning): home address, email, police or incident report, emergency contact, intake call notes, attorney assigned.
- **Also flagged:** an SOL that has passed, falls on or before the date of loss, or is within 90 days; a date of loss in the future; a minor client; an account of what happened under 25 words.

**Reviewed automatically.** Right after each save or upload, Claude reviews the intake and the file shows:
- a 1–5 score and a short summary;
- red flags (deadlines, liability, coverage gaps, treatment gaps, prior injuries, inconsistencies);
- what's missing;
- questions to ask the client next;
- what was done well and what to improve.

For an uploaded document, the reviewer reads the file itself and reports which checklist details it contains, so the document's checklist score is filled in after the review. A typed intake is reviewed again only when it has changed. **↻ Review again** re-runs a review, and a review that never finished (for example, the page was closed) shows as *didn't finish* after 3 minutes. The **Needs attention** filter lists files with a missing essential, a red flag or a failed review.

**Setup.** The review uses the `ANTHROPIC_API_KEY` secret on the Pages project, the same one the Doc Hub review uses. Without it, the checklist still runs and the folder says the review isn't set up. The review asks Claude Opus 5.5 for structured JSON output and opts into Anthropic's server-side fallback, so a request declined by a safety classifier is retried on Anthropic's recommended fallback model.

**Data** (D1, created on first use): `intake_files`, one row per file:
- whose it is and its kind;
- the client name and date of loss;
- the typed intake's content (the same shape a saved case has), or the uploaded file's R2 key, name and type;
- the checklist findings and score;
- the review and its status;
- the case it was moved to.

Deleting an intake document also deletes its file from storage.

## 📅 Firm Calendar (attorney calendars)

The CMS keeps the fictional firm's calendars, the way a firm's case management system does: one calendar for each attorney (**Atty. Marcus Reyes**, pre-litigation; **Atty. Elena Brooks**, litigation; **Atty. David Okafor**, intake) and a **Firm / Staff** calendar. It's a tab of the case, **📅 Calendar**, right after **Tasks**. The **📅 Firm Calendar** button in an Admin's sidebar (Trainer tools), and a course link with `?calendar=1`, open the same tab. All times are the firm's, Eastern; when the trainee's computer is on another time zone, events and the event form also show the trainee's own time (e.g. *9:00 PM – 10:00 PM GMT+8 your time*).

This is the CMS's only calendar. It replaced the separate Training Calendar (and its `.ics` downloads): the attorney's Google Calendar connection moved here, and events trainees had saved in the Training Calendar are copied onto the **Firm / Staff** calendar, at the same moments in firm time, the first time they open this one. The Training Calendar's dated training schedule was dropped; the attorneys' standing schedule below plays that part.

- **The attorneys are already busy.** Each calendar holds that attorney's standing schedule, week after week: Monday motion calendar in court, deposition days, mediations, settlement and adjuster calls, client meetings, intake reviews, blocked writing time, the firm huddle, and some out-of-office Fridays. It references the Training Library cases each attorney handles (e.g. Brooks: Mendoza MC-14, Garcia MC-05). Trainees schedule around it, the way they would on a real attorney's calendar.
- **Schedule from the case.** In the Calendar tab, a new event (**+ New event**, **📅 Schedule for this case**, or a click on an empty time) is linked to the open case (client name and case ID or MC number) and goes on the case's attorney's calendar (from the Attorney field); **Unlink** removes the link. The tab's left rail lists the case's own events. Pick the type (deposition, mediation, court hearing, trial, client meeting, medical/IME, deadline, call…), whose calendar it goes on, other attorneys to invite, date, time, location and notes.
- **Availability as you type.** The form lists what the chosen attorneys already have that day and says straight away whether the time is free, including on the attorney's Google Calendar when it's connected. It also flags weekends and times outside business hours (8 AM–6 PM Eastern). The week view jumps to that day, fades the other calendars, and outlines the proposed time.
- **Conflicts are caught.** Saving over something already on an attorney's calendar is refused with the conflicts listed and the next free times offered (click one to move the event there). **Book it anyway** double-books on purpose.
- **Live.** The calendar refreshes every 20 seconds while its tab is showing, and when you come back to the browser tab. Other open browser tabs update as soon as an event is saved or deleted. The calendar isn't part of the saved case: typing in it doesn't count as a case edit, and it stays typeable on view-only Training Library cases.
- **Case deadlines layer:** the SOL, complaint filed, discovery cut-off, trial date and date of loss on the saved cases you can see, as all-day items. **Open the case** on any linked event loads it (a library case opens view-only).
- **Views:** week (weekend optional), month and a 30-day agenda. Each calendar can be switched off in the left rail. Your upcoming events are listed there too.
- **Who sees what:** a trainee sees the attorneys' standing schedule, events an Admin shared firm-wide, and their own events. Other trainees' events stay private. Trainees change or delete only their own events. Admins get **👥 All trainees** to see everyone's, and a **Share firm-wide** option that puts an event on every trainee's calendar (e.g. a hearing the whole batch must schedule around).
- **✎ Edit any event you see:** your own events change in place. An event you can't change itself (on the attorney's standing schedule, or one someone else shared firm-wide) is saved as **your version**: it shows instead of the original on your calendar (and in your Sync links), everyone else still sees the original, and deleting your version brings the original back. Editing it again changes the same version, even after it's moved to another day. An Admin's version with **Share firm-wide** ticked changes it for everyone. (Saved by id: `calendar_events.replaces`; the column is added on first use.)
- **No .ics import.** ⬆ Import .ics was taken out (`POST /api/calendar {action: 'import'}` answers 410). What imports had added was undone once, on the first request after the change (`undoImports` in `functions/_calendar.js`): every imported event was removed (they carried the file's UID, `ext_uid`), and the Attorney's Calendar's weekly schedule was put back as it came where an import had replaced it (many rows by one person in the same minute; an Admin's own edits stay).
- **The attorney's Google Calendar** (left rail → **Google Calendar**): see *Connecting the attorney's Google Calendar* below.
- **Sync to Google / Outlook:** **🔗 Sync to Google / Outlook** gives each person a private subscribe link for the calendars they tick: the whole firm, one attorney, or any set (e.g. Reyes + Brooks: `cal=reyes,brooks`). It has **Add to Google** and **Add to Outlook** buttons. The subscribed calendar shows the same events and follows changes made in the CMS. Google and Outlook re-read subscribed calendars on their own schedule (Outlook about hourly, Google every few hours), so the CMS is where changes appear first. **Reset links** turns the old links off. This is a one-way feed: events are created in the CMS, not in Google or Outlook.
- **Add to Google Calendar:** every event also has this link. It opens Google's own event form, filled in (at firm time), for a one-off copy.

### 🗓 Attorney's Calendar (the Calendaring activity)

A calendar of its own for the Calendaring activity: **the attorney's week, the same every week**. Trainees open it from the sidebar (**🗓 Attorney's Calendar**, under New Intake and the Call Simulator) or with `?calendar=attorney`; it shows that calendar only, not the Firm Calendar's attorneys, deadlines or Google Calendar. The case's 📅 Calendar tab stays the Firm Calendar, without it.

- **The weekly schedule** came from the firm's Google Calendar export ("Attorney's Calendar", the week of Sep 7, 2026), with the appointments moved onto the Training Library's case files: each note has the client's name, callback number, date of loss, case number, stage and attorney, and the appointment opens its case (📂 Open the case). The daily blocks are kept: no schedule before 8 AM or after 5 PM, the daily case and email review, and lunch. It repeats every week, Monday to Friday, with no end date: the same appointments on the same days, whatever week is shown. It's kept in D1 (`calendar_template`, filled from `SEED` in `functions/_attorney_calendar.js` the first time it's used); each week's appointments are made from it (`tpl-<row>-<date>`).
- **Admins change the schedule:** ✎ Edit the weekly schedule (title, type, time, day, place, case, notes) and 🗑 Remove from the schedule on an appointment, **+ New event → Add to the weekly schedule**, and **↺ Restore the original schedule**. A change is every week, for everyone. 📅 Firm Calendar / 🗓 Attorney's Calendar in the header switches between the two.
- **Trainees add their own appointments** on it (+ New event; their own, like any event they schedule): booking over the schedule is a double-booking with free times offered. They can't change the schedule (the server refuses: `POST /api/calendar {action: 'template'}`, `{action: 'template-reset'}` and `DELETE ?template=` are Admin only) and can't make their own version of its appointments.
- **Its own link:** Sync to Google / Outlook on the Attorney's Calendar gives `…/api/calendar-feed?…&cal=attorney` ("Attorney's Calendar (LSH training)"); the Firm Calendar's link (`cal=all`) leaves it out. It can't be invited to a Firm Calendar event, nor they to it.

### Connecting the attorney's Google Calendar

In the Calendar tab's left rail, **Connect Google Calendar** opens Google's sign-in in a popup. The trainee signs in with the Google account the attorney shared their calendar with, then picks the attorney's calendar from the list. Calendars they can add events to come first; view-only ones are marked. After that:

- The attorney's real events show in the calendar (green, 📆), next to the firm's calendars. They can be switched off like any calendar, and the event form flags a time the attorney is busy there.
- Everything the trainee schedules in the Calendar tab is copied into that calendar when it's saved, updated when it's edited, and removed when it's deleted. **Sync now** makes the attorney's calendar match (it also removes copies of the old Training Calendar's training schedule). Each copy keeps a fixed id, so syncing again updates it instead of adding a duplicate. The CMS never changes events it didn't copy.
- Copying needs the calendar shared with **Make changes to events**. With view-only sharing the trainee still sees the attorney's events.
- **Change** picks another calendar (offering to remove the copies from the old one). **Disconnect** revokes the access, and can remove the copies first.

Until the setup below is done, the rail says so, and the subscribe links and **Add to Google Calendar** links still work.

**Setup (once, by an admin):**

1. console.cloud.google.com → pick or create a project → APIs & Services → Library → enable the **Google Calendar API**.
2. Set up the **OAuth consent screen**:
   - **User type Internal** if trainees sign in with the firm's Google Workspace accounts. No Google review is needed.
   - Otherwise **External**. While it's in *Testing*, only the test users you add can connect, and Google makes them reconnect every 7 days. Opening it to everyone needs Google to verify the calendar scopes.
   - Scopes: `openid`, `email`, `.../auth/calendar.events`, `.../auth/calendar.readonly`.
3. Credentials → Create credentials → **OAuth client ID** → *Web application*. Under **Authorized JavaScript origins** add `https://lshcasemanagementtraining-trainingcrm.pages.dev` (and any custom domain). No redirect URI is needed, because sign-in happens in a popup.
4. Cloudflare → this Pages project → Settings → Variables and Secrets: add `GOOGLE_CLIENT_ID` (text) and `GOOGLE_CLIENT_SECRET` (secret), then redeploy. `SESSION_SECRET` must be set too (it already is for sign-in).

**Data** (D1, created on first use): `calendar_events` (one row per event: owner, calendar, invitees, type, date, start and end, location, linked case, notes, shared flag), `calendar_feeds` (each person's subscribe token), `calendar_imports` (whose Training Calendar events were copied over), `calendar_google_links` (the Google account, the chosen calendar, and its tokens, encrypted with a key derived from `SESSION_SECRET`) and `calendar_google_sync` (which events were copied to which Google calendar). The old `training_calendar_events` table is only read, for that one-time copy. The standing schedule isn't stored; it's built from a weekly pattern in `functions/_calendar.js`, so it never runs out. Code: `firm-calendar.js`, `functions/api/calendar.js`, `functions/api/calendar-feed.js`, `functions/api/calendar-google.js`, `functions/_calendar.js`, `functions/_google_calendar.js`. The calendar adds no `<select>` or contenteditable to the page, because the case editor saves those by position.

## ⏱ Time & Billing (billable and non-billable time)

A timer for billable and non-billable hours, the way a firm's case management system tracks time.

- **The timer** (in the case header, under the search bars): just **⏱ ▶ Start timer** and a **Billable / Non-billable** dropdown. **▶ Start timer** starts on the open case, billable, as *Case review & strategy*; with no case open, non-billable, as *Filing & administrative*. The dropdown chooses before starting (opening another case goes back to that case's default) or switches the running timer. While it runs: the time, **⏸** / **▶**, **■ Stop** and the dropdown; the case and activity are on the clock's tooltip. The timesheet, the details and adding time by hand are on the **⏱ Time** tab only. The widget adds no `<select>`: the dropdown is a button and a menu, because the case header's dropdowns are saved by position. It works by keyboard (Enter opens it, ↑ ↓ move, Enter picks, Esc closes; the focus goes back to the button). It and the ⏱ Time tab show and change the same choice (the next timer's draft), so they always agree.
- **⏱ Time tab** (right after **📅 Calendar**):
  - **The timer's details:** the case (**Link to the open case**, **Unlink**, or type a client name), **$ Billable / Non-billable**, the activity and **What you did**. They can be changed while it runs. **Stop & save** saves it, and **Discard** throws it away.
  - **Add time by hand:** date, hours (e.g. `0.5`), and the same details. Use it for work done away from the timer.
  - **This case:** the time on the open case, with totals.
  - **My timesheet:** one week at a time, with a bar for each day and totals for billable hours, non-billable hours, billable share and time worked.
  - **👥 All trainees** (Admins): everyone's time for the week, with a total for each trainee.
  - Entries can be edited (✎) and deleted (🗑). Editing without touching the hours keeps the entry's time to the second (the box shows it rounded to 0.1 h), so changing only the description never changes what's billed. **⬇ Export CSV** downloads the list shown.
- **Activities:**
  - Usually billable: case review & strategy, client communication, medical records & bills review, drafting & correspondence, demand & negotiation, discovery, legal research, and court, hearing or deposition.
  - Usually not billable: intake (before retainer), scheduling & calendaring, filing & administrative, internal meeting, and training. They show with a dashed outline.
  - Picking an activity sets the billable switch. Marking clerical work billable shows a reminder that it usually isn't billable to the client.
- **Billing rules** (the usual ones):
  - Billable time is billed in tenths of an hour (6 minutes), each entry rounded up, with at least 0.1. For example, 7 minutes bills as 0.2 h.
  - Billable time must be on a case and say what was done, because the client reads it on the invoice. Stopping without a description opens the Time tab on the description.
  - Non-billable time is tracked the same way.
- **The timer lives on the server:**
  - It keeps counting across page reloads, browser tabs and sign-ins, and the other open tabs update when it changes.
  - One timer per person. Starting another while one runs asks first, then stops and saves the first.
- **Who sees what:** trainees see and change only their own time. Admins see everyone's.
- **Not part of the case:** the Time tab isn't part of the saved case or the PDF. Typing in it doesn't count as a case edit, and it stays usable on view-only Training Library cases.

**Data** (D1, created on first use):
- `time_entries`: one row per entry, with the owner, case, billable flag, activity, description, work date, seconds, and whether it came from the timer or was added by hand.
- `time_timers`: each person's running timer.

Code: `time-tracker.js`, `functions/api/time.js`, `functions/_time.js`. Like the calendar, it adds no `<select>` or contenteditable to the page.

## 🔒 Security

- **Uploaded files** (Doc Hub, Intake folder, Client's ID, alert pictures) are served from this site, so a file a browser would run could run as whoever opened it. Only a PDF, a photo (PNG, JPG, GIF, WebP) or plain text opens in the browser. Anything else, an HTML page or an SVG included, is kept and sent as a download, and so is any older file stored as one of those (`fileTypeIsInline` in `functions/_utils.js`; `upload.js`, `file.js`). `/api/file` serves only keys under `documents/`, and only to someone who may see the file: whoever uploaded it and Admins, and anyone for a file an Admin uploaded (alert pictures, Training Library attachments). A file from before uploads recorded who sent them opens for whoever has a saved case it's attached to. Having the link isn't enough.
- **Opening someone else's case.** An Admin opens trainees' cases, and every trainee opens an Admin's library edits. Saved case content is markup (table rows, line breaks, the rows' × buttons), so before it goes back on the page it's cleaned (`cleanCaseHtml` in `app.js`). It's read in an inert template, then scripts, frames, `javascript:` and `data:` links and every `on…` handler are dropped, except the app's own row buttons, which only call the case editor's helpers with plain values. The case summary (Download Case Summary), Case Versions, the drill feedback and the intake grade show typed text as text.
- **Pings** (`/api/state`) go only to the person they were sent to: the page gets its own and the ones to everyone, never who else a ping went to, and none signed out. It reads who's asking from the signed session cookie, with no extra database read.
- **Who can change whom:** only the Master Account changes another Admin's status (approve, reject, suspend, reinstate, revoke), and nobody can change the Master Account's.
- **Admin password:** after 20 wrong passwords from one network in an hour, sign-ins with a password from there wait until the next hour (`login.js`). Trainees signing in with the username aren't affected.
- **Logging out ends that session:** the session can't be brought back by a heartbeat from the old cookie (`logout.js` records which sign-in ended; `heartbeat.js`).
- **No site lock:** Lock / Unlock is gone, and nothing on the server refuses anyone because of a lock left set in the database (`/api/cases`, `/api/case-id` no longer read it). It needed a password today's Admin accounts don't have, so it never worked. To keep someone out, suspend or revoke their account in Users. ⏸ Pause stays.
- **Migrate D1** (the workflow) copies the live database (the one in `wrangler.toml`) into a new one, then points the site at it. It deletes the database it's given first, so it refuses the live database's name and a blank one.
- **Time & Billing CSV:** a typed cell starting with `=`, `+`, `-` or `@` gets a leading `'` so Excel shows it as text instead of running it.
- **Links in cases** are only `http(s)` addresses; a link (`<a>`, `<area>`) that opens a new tab always gets `rel="noopener noreferrer"`, so the page it opens can't reach back into the CMS, and saved forms or form buttons lose any new-tab target.
- **Google Drive backup** asks only for `drive.file` (the app's own files), checks every file against the same rule as `/api/file` before copying it, and keeps Google's tokens encrypted.
- **The SSN in the case header** shows its last 4 only; each look at the whole number is logged (`/api/case-activity`, signed-in people only, one known action, plain text cut short) and listed in Server Logs as **SSN Viewed**. It's a training habit, not a lock: the saved case still holds the number, and anyone who can open the case can show it.

### Known gaps

- One admin password for the Master Account and every trainer.
- An older copy of a case kept in a browser can still overwrite newer changes made on the server.
- The database file can't shrink in place: D1 has no VACUUM (see 🗄 Database maintenance).

### 🗄 Database maintenance

Master Control → Access Control → **🧹 Clear old data** (Master Account only; `functions/api/db-cleanup.js`) removes data that's only needed for a while: pings over 7 days old, the online status of people not seen for 30 days, live-view screen copies over a day old and snapshots untouched for 7 days, sign-in attempt counts of earlier hours, live-call records over 90 days old and stopped alerts over 30 days old. Cases, versions, results, intakes, time, the calendar and the server logs are kept. It says how many rows it cleared from each.

D1 has no VACUUM (neither the Workers binding nor `wrangler` can run one), so the old **Run Database Vacuum** button and `vacuum-d1.yml` never worked and are gone. D1 reuses the space rows leave behind. The file itself only gets smaller by copying the database into a fresh one: the **Migrate D1** workflow.

## Checks (GitHub Actions)

`.github/workflows/checks.yml` runs on every pull request and every push to `main`. A red **Checks** status means something is broken, and the log says what:

- **Syntax, files and build:**
  - every JavaScript file and inline `<script>` must parse;
  - every local file `index.html` loads must exist;
  - the Pages Functions must build (nothing is deployed);
  - **the Training Library data must be consistent** (`.github/scripts/check-data.mjs`):
    - unique case ids;
    - required fields present;
    - phases, case types, lien types and facility specialties the editor actually offers;
    - SSNs masked;
    - every drill call pointing at a real case, with a valid auth code and answer, and a caller voice (`'f'` or `'m'`);
    - callers the key marks verified giving details that match the file (and "not verified" callers not matching);
    - files that share a client name having a different date of loss or date of birth;
    - case numbers in the CMS format, unique, with the type code the editor would give the case type, and matching any case number a drill caller quotes.
  - **the Gemini key pool** (`.github/scripts/call-ai.mjs`, with Google answered by the test):
    - the keys take turns (any numbered `GEMINI_API_KEY`, a duplicate used once);
    - a rate-limited or rejected key rests and the request moves to the next key at once; a busy key hands over; a missing model falls through; a refused region is explained, or, with the EA-PA relay bound, sent again from the US (and later requests go straight there);
    - `/api/call-ai`: sign-in required, bad and oversized bodies refused, the review's JSON mode, the per-user limit (and it doesn't limit anyone else), "busy" when every key is at its limit, the Admin-only status;
    - results are saved as `practice` or `drill`, including in a table made before the `mode` column.
- **Smoke test in a browser:** opens every library case (each section filled, no duplicate element ids) and checks that view-only mode blocks saving. It saves a practice copy with its tags and plays every drill call with the answer key, each of which must score 100 (and checks that skipping the DOL costs points on calls about a case and on same-name files, not on the others). On every call with a hard-to-say name it checks that the name is shown only the way it sounds until it's spelled, that the spelling and the NATO read-back appear, and that skipping them costs the identifier points. It also checks the Case Library: no Training Library button and no case list for trainees, search by name, DOL and case number (typed four different ways, with the case number in the Case ID field), the same-name warning, opening results from the search bar by click and by keyboard, a drill pick from the search bar, and editing, reloading and resetting a library case's notes. It takes a **practice call on the standard voice**: it rings with an Answer button and no script; the greeting gets the caller's reply after one busy line is retried; the caller's instructions say who they are and never include the answer key; a file opened from the search bar counts as the call's file; the caller hangs up; the wrap-up checks the authentication from the call with nothing to choose; the debrief is the 14-item scorecard, scored from the call and the review, and the result is saved as a practice call with its transcript. It also checks the sidebar has no separate Training Calendar and no `.ics` downloads, and that a trainee's sidebar is the program, their cases, then New Intake, the Call Simulator and the Attorney's Calendar (no Latest Updates, Intake Folder, Firm Calendar or other trainer tools), with Close, Archive, Discard Case, Save Case and Update Case in the bar at the bottom of the case and ✕ at its top right. It checks the frame of the page: the sidebar and its logo run to the top; the strip is over the main area only, with no portal label, and Download Case Summary, My Dashboard and the Blueprint at its right (an Admin's too); the date and time are right above the Case ID, outside the case; the timer is in the case header under the search bars, just Start and the Billable dropdown; the action bar has no standing note; and the Profile tab shows no SSN or DOB. An Admin's sidebar has Latest Updates and the Trainer tools; Trainee view hides them. It checks that trainees never see the Training Library: search results carry case numbers, not Training Library tags; the Case Library window has no Training Library filter; nothing on screen says "Training Library" on a library case or a practice copy; and `openTrainingLibrary()` doesn't open it. It checks the **Trainee view**: a trainer's screen switches to a trainee's (no Training Library, Master Control or Caller scenarios buttons, nothing saying "Training Library", no floating bar), and **Back to trainer view** in the sidebar restores it. It checks the **Intake folder**: a typed intake (from the intake form) saved from Intake mode (autosave and Save Case file it there, never as a case), reviewed, moved to the case files, and an uploaded intake document filed and reviewed. Finally, it checks that Caller scenarios are for trainers only: a trainee gets no Caller scenarios button and no panel, on a library case or a practice copy. For an Admin, the button opens the panel, which has one for every caller scenario on every file, and one for each of the file's simulator callers, with the caller's name, number and the right handling. Printing all of them renders every simulator caller.

- **Training Library edits** (`.github/scripts/library-edit.cjs`, in the same job): the real `mock-case-edits.js` on SQLite, with a trainer and a trainee in the browser. It checks that:
- **Training Library by program** (`.github/scripts/library-rbac.cjs`, the real `/api/case-repository` on SQLite): one case per trainee per file, never a draft (a second save or tab updates the same case; an old draft is finalized); without a program and for the Front Desk the file is view only; Intake and Medical Summary & Demand can type only in their areas (locked tabs block typing and hide their buttons); Save Case, Archive, reopening, leaving with unsaved changes, ↺ Start over and closing the page all keep to that one case; a drill opens files view only; Admins still edit the library case itself.
  - a trainer's library case opens editable and they type straight into it; a trainee's, and a trainer's in Trainee view, is view only;
  - Save Case saves to the library, credited to the trainer, as a clean case payload, and never as the trainer's own case (autosave included);
  - the trainee then opens the edited version (view only, with their own Notes on top), and the search finds the edited phone;
  - the library list marks it edited, and the case fields are unchanged in number;
  - a trainee can't save or delete an edit, and an edit for a case that isn't in the library is refused;
  - opening another case with unsaved changes asks first (and with none, doesn't); Undo my changes drops them; a reload keeps them;
  - Restore the original deletes the edit, and both the trainer and the trainee get the original back, in the case and in the search.

- **Training Library PDF** (`.github/scripts/library-pdf.cjs`, in the same job): the download buttons in a browser as a trainer, with jsPDF served from `node_modules`. It checks that:
  - the trainer copy has every case, in order, in the index and its own section, each with its trainer-only key; the case-files copy has none and is shorter;
  - the Property Damage filter narrows the file to exactly the cases listed, and a case's own **⬇ PDF** button gives just that case;
  - the file names, the "Downloaded … (N pages)" message, and that the page's own `window.jspdf` (html2pdf's) is left alone.

- **New Intake** (`.github/scripts/new-matter.cjs`, in the same job): the form in a browser, as a trainee. It checks that:
  - 📝 New Intake offers the five case types (icon and title only), and the form adds no positional field to the page;
  - only the client's name is needed to save. A name-only intake still creates the case, graded F, with what to ask next time;
  - a full Slip and Fall intake gathers every key item, grades higher, and is saved as a final case with a Case ID. It fills the case field by field:
    - the client and the incident;
    - the incident report, the property owner and the witnesses, the BI policy, the providers and their specialties;
    - Lost Wages;
    - the Case Note with the grade and the answers that have no field of their own;
  - the intake and its grade are saved with the case, come back with it, and can be viewed read only;
  - an unfinished intake can be resumed;
  - an MVA fills both vehicles, both insurers and the police report;
  - Premises Liability, Dog Bite and Medical Malpractice set their case types and parties;
  - a failed save says so and leaves the case in the editor;
  - the Intake folder's New intake creates the case the same way;
  - ✕ (top right of the case) and Close (the bar at the bottom) ask first and leave the editor blank, and with nothing open they say so;
  - 🗑 Discard Case: with nothing open it says so; a case never saved is cleared without deleting anything; a saved case is deleted after asking, and one the server refuses to delete stays open.

- **Case Logs delete** (`.github/scripts/case-logs.cjs`, in the same job): Master Control as an Admin. It checks that:
  - every case has a Delete button;
  - the search finds a trainee's cases by the trainee's name;
  - Delete asks first, and Cancel deletes nothing;
  - ticked cases survive the list's refresh, and Delete selected deletes them all;
  - Select all shown ticks only what the search shows;
  - a refused delete leaves the case, with a message.

- **Latest updates** (`.github/scripts/latest-updates.cjs`, in the same job): the real `/api/case-repository` on SQLite, and the view in a browser. It checks that:
  - a trainee gets their own cases and an Admin gets everyone's, newest first, each with its latest Case Note (by date, not by row);
  - the search finds notes by text (across `&nbsp;` and tags) or date, only in cases the user may see. SQL wildcards are searched as text, and a damaged saved case doesn't break the list;
  - the regular case list still carries no notes;
  - in the browser: a trainee gets no sidebar button; the view lists their cases, typing searches and highlights the match, and Open opens the case.

- **Live voice calls** (`.github/scripts/livecall.cjs`, in the same job): the real token endpoint, with Google answered by the test, and the drill in a browser with a fake microphone and a fake Gemini Live connection.
  - **Endpoint:** "not set up" without a key. The token is single-use and locks in the right caller: their answers, a matching voice, and transcripts on both sides. It also checks:
    - calls spread over the keys (least busy first), and an ended call frees its key;
    - a try Google refused moves to the other key, then the next model, then text;
    - `LIVE_CALLS_PER_KEY`, `LIVE_DAILY_MINUTES` and `LIVE_MAX_MINUTES`;
    - the Admin usage report;
    - a rate-limited key hands over to the next;
    - unknown calls and signed-out users are refused, and the hourly cap applies.
  - **Browser:**
    - the call rings and Answer connects;
    - the microphone streams as PCM;
    - the caller's voice plays and is transcribed;
    - identifiers asked out loud are ticked, and a tapped one is asked in writing;
    - Mute stops the microphone;
    - Speaker turns the caller up, is remembered, and silences the microphone while the caller talks (the test's microphone is a steady tone, so any unsilenced frame shows);
    - a refused line is retried on another;
    - the time limit warns, then hangs up;
    - scoring hangs up, frees the line and keeps the transcript;
    - without live voice set up, the call and the rest of the drill run as text;
    - a **practice call on live voice**: Answer connects, both sides are transcribed, a typed line goes to the caller; when the live line drops (busy), the call goes on with the standard voice and the caller gets the transcript so far; the debrief scores it (clarity of speech and tone of voice are rated: it was a spoken call) and the result is saved with the whole transcript; the next practice call tries live voice again and ends at the time limit, going to the wrap-up; and on a visit where live voice isn't set up, the practice call says so, carries on with the standard voice, and the next one doesn't ask for live voice again.
- **Name sign-in** (`.github/scripts/guest.cjs`, in the same job): the real `guest-login.js` on SQLite. It checks that:
  - a registered trainee's name signs in to their account, with or without the M.I.;
  - duplicate names need the Batch ID;
  - pending accounts wait for approval;
  - Admins are never reached by name;
  - older name-only accounts still work;
  - an unknown name is sent to Register, with the name and batch filled in;
  - name sign-in is refused without a platform;
  - a direct visit shows Register on a new browser, and the sign-in screen on a browser that signed in before.
- **Live view** (`.github/scripts/live-view.cjs`, in the same job): the real heartbeat, `/api/live-view` and `/api/live-screen` code on SQLite, with a trainee's page and an Admin's page in a browser. It checks:
  - where a trainee is, and a new step on the trail only when it changes;
  - a snapshot is kept only while an Admin watches, and an oversized one is skipped;
  - only Admins can read the live view, and reading it marks the trainee as watched;
  - Admins aren't recorded, and a watch ends when it isn't renewed;
  - their screen: kept only while watched and deleted when the watch ends; the live view gets the copy only when it doesn't have it yet; scrolling and the pointer alone update it; an oversized screen isn't kept and the Admin is told; a page that can't mirror is flagged as an older version; a trainee writes only their own screen and can't read anyone's;
  - a trainee's heartbeat waits while nobody watches and answers within about a second when a watch starts; an Admin's never waits; `/api/live-screen` keeps a screen only while watched, only the sender's own, and needs a session;
  - in the browser: 👁 Watch live in Monitoring shows the case and tab, what the trainee typed (as plain text, never run), the New Intake form and the trail;
  - real time: their screen shows within a couple of seconds of 👁 Watch live with no heartbeat sent by hand; a change reaches the Admin's screen in about a second; while watched the trainee's page sends about once a second (a "still here" every 1.5 s when idle, at most one a second while typing, the copy only when it changed, never for a mouse move, and no copy at all while nothing changes, even when the page sets an attribute and puts it back the way `case-fit.js` measures) and the live view reads about once a second, and not at all while its tab is hidden; "● Live" stays on while watching, goes off when the trainee's page stops; a hidden trainee tab says so once and then sends nothing; with nobody watching, only the heartbeat (which waits at the server), counted over 34 s;
  - 🖥 Screen comes first and shows their page in a sandboxed frame at their window's size: what they typed in boxes and fields, the option they chose, the Call Simulator open over the case, how far a box is scrolled, the mouse pointer and the New Intake form with what they typed and chose in it, with passwords blank;
  - markup put on the trainee's page (an `onerror` image, a script, a `javascript:` link, a frame) is taken out before it's sent, and never runs on the Admin's page or in the frame; a crafted screen sent straight to the API (scripts, handlers, `<noscript>` and `<svg>`/`<math>` tricks, a declarative shadow root, `javascript:` links and forms) is cleaned again on the Admin's page;
  - a screen too big to mirror, and an older trainee page that can't mirror, are explained and show the summary, and the screen comes back when it can;
  - nothing on the trainee's page says they're watched; their page sends only while watched, and stops after.
  - It prints what it measured: how long the watch took to start, how long changes took to reach the Admin, the requests a minute on each side, and the time spent copying the page.
- **Autosave** (`.github/scripts/autosave.cjs`): nothing is sent while the trainee types or glances at another tab; the tab away for a while sends the case once, and nothing again when nothing changed; offline sends nothing and says the work is kept here, and the connection back sends it; a suspended page (`freeze`) and a closing page send it; a case never saved isn't sent while the page closes; a save that never got through is sent on the next visit (and a visit with nothing unsaved sends nothing); the idle archive sends only unsaved work.
- **CMS Blueprint** (`.github/scripts/blueprint.cjs`): a trainee's 🧭 Blueprint (after 📊 My Dashboard) opens the Trainee blueprint only, which never names the Training Library or the trainer tools; ◀ ▶, ← → and the contents strip go through every slide and Esc closes it; its PDF has a page for every slide and the deployed version. An Admin gets both decks as tabs and a PDF of each; in 👁 Trainee view, the trainee deck only. Every slide fits on a laptop and on a phone. The numbers match everywhere (Cover, then 1 to n; never n + 1); the cover shows the LSH mark with its name as text; each slide's screenshot loads, has a description, opens full size and closes with Esc, and the PDFs carry the screenshots.
- **New versions** (`.github/scripts/cms-update.cjs`, in the same job): a test server that answers like Cloudflare Pages (scripts and stylesheets with an ETag, the page without one), with "deploying" a new file. It checks that:
  - the page watches its own scripts, stylesheets and page, and nothing from a CDN; with nothing new deployed, nothing happens;
  - a new `app.js`, `styles.css` or `index.html` is noticed, and the note says a new version is ready;
  - it doesn't reload while a window is open or while the trainee is typing, then reloads by itself at a quiet moment;
  - after the reload the trainee's case and tab are still there, the note is gone, and they're told the page was updated;
  - **Update now** reloads right away, even over an open window;
  - an Admin comes back to Master Control → Monitoring.
- **Call Simulator lines** (`.github/scripts/call-lines.cjs`, in the same job; `/api/` answered by the test): every call in `call-packs.js` has what the phone, the caller and the grader need (FT calls on Training Library files that exist, a grading request that fits `/api/call-ai`), and the tabs list the right lines; a `?calls=1&…&line=…&mode=graded` link opens that line; the Calls dropdown lists the programs and Reception, Intake and Calendaring; the results' dropdowns keep the calls apart (graded only, one line, a program, the Core callers); the Core callers have the ☎ Reception, 🗓 Calendar Management and 📋 Intake Mock Calls buttons and every line has Practice and Graded; a practice call (Karen Holt, MC-05) has its brief, opens with the caller's own words, sends their script under the line's AI budget, wraps up with the file and the line's note, is graded on its goals and saved as a line call with its course; a graded call you place (Elias, Friday 4:00 PM) is picked up by him, hides the goals, needs the note and is saved as graded; a graded call you answer shows an unknown caller and no file; the results list line calls and a saved one opens with its goals and transcript.
- **Reception wrap-up and debrief** (`.github/scripts/reception-wrapup.cjs`, in the same job; the clock is moved on by the test for the silences and the slow answer; the case is held at least 1100 px wide, as the site's styles lay it out). It checks that:
  - the search finds names spelled the way they sound ("Brittani", "Britney Kirkoobree", "Garsia", "Shivon"), exact matches first, nothing extra for "Maria", and a number one digit off doesn't match; the wrap-up's results tag them **Sounds like**;
  - on a wide screen the case moves over while the panel is open, with the sidebar stepping aside and the case a little smaller when there isn't room, so nothing on it (the search bar in its header included) runs under the panel; ▭ Case gives the whole width, the sidebar and the size back; on a narrow screen the panel goes over the case;
  - resizing the browser fits the case to the window again: smaller in a narrow window (not below 70%), full size in a wide one;
  - a good call (spiel, name + DOB + DOL + SSN last 4, a hold the caller was told about, the closing): the wrap-up says **Fully authenticated** with no choice to make; the debrief has the 14 items, the five checked from the call at 5/5, transfer, clarity and tone N/A on a typed call, 100/100; the review request carries the SOP and the items already scored and fits `/api/call-ai`; saved with the scorecard;
  - a poor call (answered after 8 s, "Hello?", 14 s of silence, fillers, nothing verified, no file): the wrap-up says what's missing; the review fails once and the debrief still shows the five items (0, 0, 2, 3, 2) with their notes and Try again; nothing is saved until the review comes through, then it's saved once.
- **Case header** (`.github/scripts/client-id.cjs`, in the same job). It checks that:
  - the header's boxes can be seen on an empty case, with Client's Name labelled;
  - the SSN beside Contact and the Profile tab's stay the same, typed in either, and a case saved before shows its SSN in both;
  - it isn't saved twice, so the saved fields keep their positions;
  - every Training Library client has a well-formed mock ID with their name and date of birth, each with its own number, and it opens larger and closes with Escape;
  - a saved case on a library file shows that client's mock ID;
  - Upload ID refuses a file that isn't a picture and sends a large photo as a JPG under 2 MB;
  - the card shows the uploaded ID, it's saved with the case, comes back when the case is opened again, and Remove takes it off;
  - with the site's styles, at 1440 px the header fits its card with the ID card in the middle, at least 180 px wide; at 1280 px everything stays inside the card and "CASE ID:" stays on one line; resizing the window from 1600 px down to 960 px and back, nothing in the header sticks out of the card or runs into its neighbour. Without the styles, run it with `TAILWIND_JS` set to a copy of Tailwind.
- **Data loss** (`.github/scripts/data-loss.cjs`, in the same job): the case editor in a browser with an in-memory case store, then the drill and time server code on SQLite. It checks that:
  - a refresh keeps Attorney and Case Manager and sends nothing; recovered work from an older draft gets them from the server's copy first;
  - on a shared computer the next person gets neither the last one's case nor their tasks (none show signed out), and an Admin's live view closes when they sign out; Log Out sends unsaved work, then forgets the case;
  - opening a case never changes the clock's time zone, and a preview shows the right status;
  - opening a case starts empty, asks before losing unsaved work, and a slow load overtaken by a newer click doesn't land; deleting the open case clears the editor and nothing is sent; a save that comes back after New doesn't attach to the new case;
  - opening a Training Library case file as a trainee isn't an edit (leaving it sends nothing, and the library's locked dropdowns aren't saved); leaving one while it loads doesn't leave the editor shut;
  - a whole live drill (61 calls with transcripts) saves; editing a time entry's description keeps its time to the second (a 150 s entry, in the browser and on the server).
- **Case file fields** (`.github/scripts/case-fields.cjs`, in the same job): the case editor in a browser. It checks that the DOB is in the header beside the SSN and Target Settlement beside Case Manager, the DOB isn't on the Profile tab, both are saved where they always were (no positional field moves; Target Settlement is still the third), and that a case saved before shows its DOB and its Target Settlement; that the Non-Economic Damages box on Identity is saved by id and loads back; that Opposing Counsel rows save and load back, and a library file in litigation shows its counsel; and that ⬆ Upload Demand uploads the letter and links it on the demand, saves it, lets it be removed, refuses files over 2 MB, adds the box to older demands, and is hidden on view-only files.
- **Contacts** (`.github/scripts/contacts.cjs`, in the same job): 📇 Contacts in a browser. It checks that there's no Contacts button or Case Library tab, only the small search bar under Search cases; that every medical provider, adjuster (or carrier with none yet), opposing counsel, client, emergency contact and lien holder in the files has a card with its case on it, one card per contact (6 opposing counsel), the same client on two files is one card and two people who share a name are two; that typing lists matches (name matches first, 6 and "+N more"), Enter, ↓ Enter and a click pop up the card, Also matching switches it, a case on it opens the file, and Esc, ✕ and a click outside close it; search by name, company, phone in any format, email, claim number, client or case number; the bar's two Escs; typing in it isn't an edit (an editable file, with a real edit as the control, and a view-only one); a trainee never sees the Training Library; and the card fits a phone.
- **Known gaps** (`.github/scripts/known-gaps.cjs`, in the same job): the server code on SQLite, then the page in a browser. It checks that:
  - Lock / Unlock is gone (no `/api/lock`, lock screen, confirm box or Lock button; `/api/state` reports no lock) and ⏸ Pause stays;
  - 🧹 Clear old data is for the Master Account only, clears old pings, online status, live-view copies, sign-in attempt counts, old live-call records and stopped alerts, keeps everything recent, counts what it cleared and is in the server logs; the vacuum endpoint and `vacuum-d1.yml` are gone;
  - a trainee's dashboard gets their trainer's note with the trainer's name and shows it read only (no box to type in), and another trainee can't read it;
  - `/api/drill-results?id=` gives a saved practice call to its trainee and to Admins, not to another trainee; 🎧 Saved calls lists them (an Admin's with every trainee's) and View shows the score, the scorecard, the review, the note and the whole transcript, with ← Back to the results.
- **Security** (`.github/scripts/security.cjs`, in the same job): the real server code on SQLite with a stand-in for R2, then the case editor in a browser. It checks that:
  - an uploaded PDF or photo opens in the browser, while an HTML page, an SVG, XML or a file with no type is stored and sent as a download, an old HTML file too; a key outside `documents/` or with `..` isn't looked up;
  - a trainee's file doesn't open for another trainee who has the link, but does for an Admin; a file an Admin uploaded opens for trainees; an older file (no uploader recorded) opens for the trainee whose case it's in, not another;
  - a trainer approves a trainee but can't change the Master Account or another Admin; the Master Account can change an Admin but not itself;
  - after 20 wrong admin passwords from one network, even the right one waits there; another network and a trainee's username sign-in aren't affected;
  - a heartbeat takes the signed-in name, not the page's; after logging out, a heartbeat with the old cookie doesn't bring the session back; signing in again works;
  - a case with markup that would run (an `<img onerror>`, a script, a frame, an SVG animation, `javascript:` and `data:` links, a `fetch()` button) runs nothing when opened, keeps its table row, its × button and its file links; every row the editor makes itself, and every handler in them, goes through the cleaner unchanged;
  - Download Case Summary and Case Versions show typed markup as text.
- **Call Simulator** (`.github/scripts/reception-mic.cjs`, in the same job): a practice call answered by microphone, with the browser's speech recognition and voice stood in by the test. It checks that:
  - 📞 Call Simulator is in the sidebar after 📝 New Intake and opens the panel, and Trainee view shows it too (trainees have it);
  - hands-free is on by default: the microphone listens from the greeting, what's said is sent when the trainee pauses, and it listens again after each of the caller's lines, never while the caller talks;
  - a silence is tried twice more, then it asks for 🎙 or typing; 🎙 listens and sends; typing takes over; hands-free off stops listening and is remembered;
  - a blocked microphone says so and the call goes on typed;
  - Trainee view has no floating bar over the case, and the case's action bar stays at the bottom of the screen.
- **Sign-in** (`.github/scripts/login.cjs`, in the same job): the real login code on SQLite. It checks:
  - the Admin tab asks for the trainer's name and the admin password (Enter signs in); with no name it signs in as the Master Account;
  - with a name, each trainer gets their own Admin account on first sign-in (the same name, the same account; suspended and revoked trainers are refused, and a revoked one isn't made again), and `trainer-` usernames can't be registered;
  - `MASTER_ADMIN_PASSWORD` is the only admin password (changing it refuses the old one);
  - a wrong or unset admin password, and a name without a last name, are refused;
  - when the server's Functions aren't running (`/api/login` answers an empty 405), the sign-in screen says the server isn't answering, not "Network error";
  - an approved trainee signs in with just the username (other capitals too, when only one trainee has it; exactly, when two do); no username or an unknown one is refused plainly; a tab still sending a Batch ID or password signs in too; an Admin account (a trainer's or the Master Account) is never signed in by username, Batch ID or other capitals; a pending, suspended, revoked or declined account is still refused; the Trainee tab shows the username box only and sends the username only;
  - the sign-in views are forms of their own, never submitted, so signing in never reloads the page; no box with a password is loose on the page, and the case search bar is a form of its own with no password in it and no "name" in its hint; a search box the browser autofills by itself is emptied, but not one being typed in, nor a name box;
  - a session stays alive with a heartbeat up to 2 minutes old (a background tab, e.g. while on a Google Meet tab) and ends after that;
  - `/api/state` lists the last minute's pings sent to whoever asks (the one sent to two trainees shows only the asker), with their age measured on the server, and none to someone signed out;
  - registration asks for just the Full Name, Batch ID and Username (nothing grayed out), refuses a bad name, Batch ID or username, saves the name split into its columns, keeps the typed Batch ID through approval, then opens sign-in with the username filled in; it scrolls on a small screen;
  - Batch IDs are `B` + MMDDYY: any typed form is read as that (the date must be real, so 31 Feb is refused; the older DDMMYY ones still read as they are), the CMS issues them that way, the old long forms saved before are shortened at the first sign-in, and the Users tab groups trainees by Batch ID, the newest batch first;
  - an Admin changes a trainee's Batch ID with ✎ Batch ID in the Registrations and Users tabs (an empty one isn't sent; Esc cancels); trainees can't, an Admin's own can't be, and it's logged;
  - a tab still running the old Training Calendar is told to reload.
- **Case editor sections** (`.github/scripts/sections.cjs`, in the same job). It checks that:
  - the page's positional fields are unchanged, and a case saved by the previous version loads field for field;
  - the new sections save and load back;
  - the lost wages and settlement math;
  - the new options;
  - Medical Chronology sorting and dragging;
  - dropping files on the Doc Hub;
  - a task ping waits for Accept and lands in Tasks;
  - tasks arrive reliably: two sent a moment apart both arrive, a wrong computer clock doesn't hide them, others' and old ones don't show, a reload doesn't offer an accepted one again, and the card stays clear of the Front Desk panel;
  - a request refused only because the session's heartbeat lapsed (a background tab, a computer that slept) is sent again once after a heartbeat, and one refused for a revoked account isn't;
  - *View Latest Saved* opens the case.
- **Doc Hub** (`.github/scripts/docs-drive.cjs`, in the same job): the file naming, links and the Google Drive backup. The server part runs the real `/api/drive-backup` on an in-memory SQLite database, a stand-in R2 bucket and Google's token and Drive endpoints answered by the test. It checks:
  - not set up: the bar and the API say so;
  - a sign-in without the Drive permission is refused and given back; connecting stores Google's tokens sealed, never as typed;
  - a backup makes LSH CMS Backups / <case> once and copies the files with their names and bytes; another trainee's file, keys outside the uploads (even ones in the bucket), more than 5 at once and a backup with no case are refused; a file Drive refuses fails alone;
  - backing up again skips what's there; a case folder deleted in Drive is made again; an expired token is refreshed; access removed on Google's side asks to connect again; connections are per person; the same Google account connected again keeps its folders; a different one starts clean; Disconnect revokes and forgets;
  - Google Calendar on the same account: neither side gives back the grant the other uses, and a sign-in with no refresh token uses the other side's when it covers Drive;
  - `/api/file?name=` serves the file under the name the case shows, ignores bad names and opens nothing it wouldn't otherwise;
  - in the page: uploads on Doc Hub rows, demand letters and the client's ID are named `<Case ID>_<Last-First>_<Type>_<date>.<ext>` (the name sent to `/api/upload`, the original on the tooltip), with the naming rules (capitals, accents, Jr., "Last, First", no Case ID yet); a second file of a type the same day is `…-2`; Save Case gives files named `NO-CASE-ID_…` the new Case ID and saves them once more, leaving nothing unsaved;
  - 🔗 Link attaches a web address and refuses `javascript:`; old rows get the button; links survive saving and loading and get `rel="noopener noreferrer"`; `javascript:` links are dropped;
  - a pasted address becomes a link, words selected with an address pasted over them become the link, the phone field isn't linked and pasted markup stays text; a click on a link shows Open ↗ and Remove link; a library case's note keeps its links' addresses when saved and shows them as links again;
  - the Drive bar: not set up, Connect, then the case's files (the client's ID too) listed and backed up in batches of 5 with the case's ID and name, Open in Drive going to the case's folder; the status is asked for only when Doc Hub opens; drawing the bar isn't an edit, and neither it nor the timer adds a select or contenteditable (both are data-free-edit).
  - Litigation: the server puts a litigation document in LSH CMS Backups / <case> / Litigation (made once), refuses any other folder, skips it the next time, and makes the Litigation folder again with its files when it's deleted, on its own or with the case folder; in the page, a tracker row adds only its own fields to the positional lists, its upload is named with its Task Type and attaching it changes nothing positional, 🔗 Link works on a row, the Litigation tab has the Drive bar (its file, not its link, sent for the Litigation folder), the case summary PDF lists the litigation documents, and a row saved before the Document column gets it and the newer task types with its values kept.
- **Case alerts, liens, treatment gaps and ADR** (`.github/scripts/case-alerts.cjs`, in the same job). The server part runs the real `/api/case-activity` and `/api/server-logs` on an in-memory SQLite database. It checks:
  - a look at the SSN is logged with who and which case (control characters out, long values cut); an unknown action and no session are refused; Server Logs calls it SSN Viewed;
  - in the page: none of the new parts moves the case's positional fields;
  - the critical note: added, finished with Enter, shown on another tab, saved by id and loaded back, cleared with the editor, 500 characters at most (typing in the middle at the limit keeps the end), on the case summary PDF; a library file's note shows, and a view-only file can't add one;
  - the SSN: an empty box is open for typing; typed, it shows only its last 4 while the saved SSN keeps every digit; 👁 shows it and logs the look (with no case number before Save gives one), Hide hides it, and a library file's SSN shows its last 4;
  - liens: the new fields and types; the totals by status, still to pay and saved; unconfirmed liens warned about here and on the Settlement tab; a lien row saved before the status opens with the new fields, its values and the status Not recorded (not warned about), and the case's later fields load where they were before and after saving again; MC-11's statuses fill in;
  - a trainee's work on MC-34 and MC-11 saved before these parts existed opens with the files' critical note, ADR and lien statuses; opening it or looking at its SSN isn't an edit;
  - treatment gaps: a late first visit, a 55-day gap and a provider with no visits are flagged, a provider with visits isn't; fixed, it says no gaps; nothing of it is saved;
  - ADR: the next session and its brief worked out, saved by id and loaded back with its dropdowns, a past session still Scheduled flagged (not on a view-only file); MC-34's mediation fills in and the tab is the CM program's;
  - the conflict check: a new client who is a library file's party at fault, a party at fault who is a library client ("Coleman, Andre") or the client on your own saved case are flagged once, with the other file; another trainee's case and a witness aren't; Escalate to attorney logs a Case Note and keeps the warning up as waiting, Cleared by the attorney and Not the same person log one and end it; notes that don't record a decision on that match don't hide it; a library file's party at fault who is your own client is flagged there with the decision buttons; name matching ("Last, First", minors, nicknames, accents, curly apostrophes, hyphenated surnames, Jr., businesses); no library file is flagged against itself or opens with a conflict.
- **Case Costs, additional insurance, the PD claim and photos** (`.github/scripts/case-costs.cjs`, in the same job). In the page:
  - none of the new parts moves the case's positional fields; Finance is Case Costs;
  - the case costs all on BI with no gross yet, then shared 30,000 / 10,000 → $375 / $125, an uneven split still adding up to the total; the BI net and the total take them once; those boxes can't be typed in; with the costs gone they're handed back; a case's typed costs survive opening it after a case with case costs; the Target Settlement shows what's left after the costs;
  - + Add Insurance: an umbrella policy's settlement worked out on its card (40% fee), its share of the costs, listed on the Settlement tab and in the total gross; saved by id and loaded back with its dropdowns;
  - the additional policy and the PD claim in the case summary PDF; a second at-fault party's policy holder who is another client flagged by the ⚖ conflict check;
  - the PD claim card saved by id and loaded back, and in the case summary PDF;
  - photos: two uploaded as JPGs with their original names kept, named `NO-CASE-ID_Santos-Maria_PD-Photo_<date>.jpg` and `…-2`, captioned, one removed, saved by id and loaded back, renamed with the Case ID, in the Drive backup's list, shown larger; an upload still going when another case is opened stops and adds nothing to it;
  - a library file's PD claim and mock photos (larger, SPECIMEN; opening one isn't an edit), its PD adjuster in Contacts, its claim back on work saved before the card existed; an intake program can't change a policy's settlement but can fill in the rest of the card; nothing to add or change on the Front Desk's view-only file.
- **Time & Billing** (`.github/scripts/time.cjs`, in the same job): runs the real time API on an in-memory SQLite database, through the real page. It checks:
  - the tab's place and the header timer: just Start and the Billable / Non-billable dropdown; the dropdown and the Time tab show and change the same choice, a timer started with Non-billable picked is non-billable, another case opened goes back to its default, it works by keyboard, and it switches the running timer;
  - starting, counting, pausing, resuming, and surviving a reload;
  - billable time refused without a description;
  - 7 minutes billed as 0.2 h;
  - changing the activity while the timer runs;
  - time added by hand;
  - billable time without a case refused;
  - totals, the weekly timesheet, editing and the CSV;
  - switching cases while a timer runs;
  - discarding;
  - privacy between trainees and the Admin view;
  - deleting;
  - that the tab adds no select or contenteditable and isn't saved as a case edit.
- **Firm Calendar** (`.github/scripts/calendar.cjs`, in the same job): runs the real calendar API code on an in-memory SQLite database standing in for D1, through the real page. It opens the Calendar tab next to Tasks and schedules from a view-only library case (the case is linked, its attorney picked, typing works), then checks:
  - the live availability warning;
  - a conflicting time is refused with free times offered, and picking one saves it;
  - double-booking happens only when asked;
  - the case deadlines layer, and the month and agenda views;
  - the subscribe feed;
  - editing and deleting;
  - another trainee can't see or delete the event;
  - trainees get no sidebar button (it's in the Admins' Trainer tools); `openFirmCalendar()` opens the tab, and typing in it isn't saved as a case edit;
  - no select or contenteditable was added to the page.
- **Attorney's Calendar** (`.github/scripts/attorney-calendar.cjs`, in the same job): the real calendar API on SQLite, then the page. The weekly schedule comes from the seed, every appointment on its case file (client, case number and callback match `mock-cases.js`), the daily blocks every weekday, nothing on weekends, the same in another week and in a range that starts midweek. A trainee can't change it (403), restore it, remove from it or make a version of it; a trainee's appointment on it over the schedule is a double-booking with free times that don't clash, then theirs alone, and nothing from the Firm Calendar is invited. An Admin's edit and a move to Thursday change every week for everyone; an added appointment shows every Friday; removed ones go; ↺ Restore brings it back as it came and keeps what trainees booked. The `cal=attorney` link carries it, `cal=all` leaves it out. In the page: the sidebar button opens it for a trainee (only that calendar, the same next week, no edit buttons on the schedule, a new event goes on it with the clash shown and a free time picked), the case's Calendar tab is the Firm Calendar without it (its events not in the rail either); an Admin opens it with `?calendar=attorney` and no case open, edits an appointment (it doesn't clash with itself), adds a weekly one, removes it, restores the schedule and switches back to the Firm Calendar; no select or contenteditable is added.
- **Firm Calendar edits, Sync picks, no .ics import** (`.github/scripts/calendar-more.cjs`, in the same job): the real calendar API on SQLite, then the page. Your version of a standing event shows only on your calendar (a second edit changes it, moved to another day it still hides the original, it isn't a conflict with what it replaces, deleting it brings the original back, the feed follows); an Admin's firm-wide version shows for everyone; a private or made-up event can't be replaced. A Sync link for Reyes + Brooks carries only theirs and is named for them; an unknown calendar is refused. Importing an `.ics` file is refused (410). Starting from a database an import left behind (imported events, one shared, an ordinary one, and a weekly schedule an import replaced), the first request removes every imported event, keeps the ordinary one and puts the schedule back as it came; on its own, the undo keeps an Admin's one-row edits to the schedule and runs only once. In the page: ✎ Edit on a standing event saves your version, the Sync picks change the link, there's no ⬆ Import .ics; no select or contenteditable is added.

To run them locally: `node .github/scripts/check-site.mjs`, `node .github/scripts/check-data.mjs`, `node .github/scripts/call-ai.mjs`, `node .github/scripts/smoke.cjs` and `node .github/scripts/calendar.cjs` (the last two need Playwright; `calendar.cjs` needs Node 22.13 or later for `node:sqlite`).

`_redirects` keeps `wrangler.toml`, this README, `.github/` and the Functions source off the published site.
