# CaseManagementTraining

LSH Case Management System (CMS), the practice CRM used by every LSH training program.

## 🔍 Case Library (search-first)

The sidebar no longer lists everyone's cases. Cases trainees save go into the **Case Library** together with the Training Library mock cases, and nothing is listed until you search, the way a front desk looks a caller up on a live call (`case-library.js`).

**Trainees see only the cases they saved themselves.** Their sidebar section is **My cases**: a list of their own saved cases and drafts, each with Open and 🗑 Delete, and no **Open Case Library** button. The search bar finds the case files (the mock cases) and their own saved cases, never another trainee's. The server enforces this too: for a trainee, `/api/case-repository` lists and opens only their own cases, and the Firm Calendar's case deadlines (and its `.ics` export) come only from their own cases. Admins see every case, as before.

- **Search bar in the case header:** type in the 🔍 search bar under the case status, at the right of the case header (or press **Ctrl/Cmd+K**) and matching files drop down under it; click one (or use the arrow keys and Enter) to open it. Trainees never need to open a library. Search by client name, **case number** (typed any way: `LSH-2026-MVA-901379`, `mva 901379` or just `901379`), date of the accident (DOL), date of birth, phone, claim/policy #, plate or library ID. Each result shows its DOL (and, for mock cases, the case number and DOB).
- **Case Library window (Admins):** sidebar → **🔍 Open Case Library** for the same search with filters (Training Library, saved cases, **My cases**) and the ☎ firm directory. Trainees don't get the button. If the search bar is off screen, Ctrl/Cmd+K opens the window for them, with **All files** and **My cases** only. They find the firm directory and front-desk rules in the Front Desk practice panel.
- **Same name, different file:** when several results share a client name, the Case Library (and the drill's search) says so and asks for the DOL and DOB before you open one.
- **During a Front Desk Drill call**, a mock case opened from the search bar counts as the call's pick, so receptionists never need the Training Library.
- A trainee's cases, drafts included, are visible only to them and Admins (enforced server-side). **Export Case List** is for Admins only, since it lists every trainee's cases. Admins still browse all cases in Master Control → Case Logs.

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
  - **💾 Save to the library** (or Save Case) saves it for everyone. From then on, everyone who opens the file gets the edited version; trainees (and a trainer in Trainee view) see it view only.
  - The edit's key facts update the case search and the library list: client name, phone, email, DOB, address, emergency contact, DOL, SOL, phase, attorney, case manager and narrative. The list marks the case **✎ edited**, and the trainer's banner says who edited it and when.
  - **↺ Undo my changes** goes back to the last saved version, and **↺ Restore the original** deletes the edit for everyone.
  - Opening another case, starting a new one, switching to Trainee view or closing the tab with unsaved changes asks first. A reload keeps them.
  - Trainees' own Notes and Tasks stay theirs and sit on top of whichever version they open.
  - The edit is never saved as the trainer's own case, and autosave doesn't make one. **✍ Practice copy** still makes one to save as their own.
  - The Front Desk practice calls on the file keep their own answers, so change a DOB or address there too if a call depends on it.
  - If the library version can't be loaded (offline), the case opens view only, so an edit of an old version can't go over a newer one.
  - Edits are stored by `/api/mock-case-edits` (table `mock_case_edits`, created on first use): anyone signed in can read them, and only Admins can save or delete one.
- **Download as PDF (trainers):** the Training Library window has a download bar above the list, and a **⬇ PDF** button on each case.
  - **PDF · trainer copy:** every tab of each listed case, plus its trainer-only front-desk key: how to verify the caller, the caller scenarios, the Front Desk practice calls, and how to say the hard names.
  - **PDF · case files only:** the same case files without the keys, safe to give trainees.
  - It takes the cases the window lists, so a program filter or a search narrows the file. Each file has a cover page, an index and one section per case, with page numbers.
  - `library-pdf.js` builds the file in the browser with jsPDF and jsPDF-AutoTable, loaded from cdnjs on the first download. It's real text, not a screenshot: about 400 KB for all 52 cases.
  - A case a trainer edited in the CMS carries a note: its key details are the edited ones, and the whole edited file is in the CMS.
- **Practice copy:** **✍ Work on a practice copy** makes the case editable. Save Case then creates the trainee's own case as usual; the saved content carries `trainingLibraryId` (e.g. `MC-04`) and `program`.

What the cases cover, from starter to advanced: every phase from Intake to Litigation, and a wide spread of case types: car crashes (rear-end, T-bone, rideshare, hit-and-run, commercial truck), a pedestrian hit by a city bus (government-claim notice), motorcycle, bicycle, slip and fall, dog bite (adult and child), premises liability, product liability (evidence that must not be released) and wrongful death (estate administrator). MC-25 … MC-36 add an e-scooter, a boating and a pedestrian case, negligent security, an elevator case in litigation (mediation), a trampoline-park injury, the UM settlement phase, and a prior attorney's lien and a pre-settlement funding lien. Authorization situations include the client only, an authorized daughter, a son with power of attorney, a guardian parent with the other parent *not* authorized, divorced parents with joint custody who are *both* authorized, an estate administrator with other relatives *not* authorized, a funding company allowed the case status only, a client with a safety flag (never confirm she's a client), an employer asking about a client, and a potential client with the statute of limitations weeks away. Call types include offers with deadlines, recorded-statement requests, deposition changes, a mediation center, a process server, check pickup by a third party, collections threats, a media call, a Spanish-speaking caller, a file transfer to new counsel, the client's former law firm, and callers who give only our case number.

## 📞 Front Desk calls: practice calls and the scored drill (measures the VA)

Admins: sidebar → **📞 Front Desk · practice calls**. Trainees don't get the sidebar button (like the Training Library's); they open the panel from their course's link, `?drill=1`. The panel offers two things: a **practice call** (below), taken in the trainee's own words, and the **scored drill**, a run of calls taken step by step.

### 📞 Practice calls (no script)

Like the Training Portal's Call Simulator. A random caller from `DRILL_CALLS` phones in (the level buttons pick warm-up, harder or tricky callers), and the trainee takes the whole call in their own words. There are no answer choices and no identifier buttons, and the caller's lines aren't shown before they're said.

- **The call:** the phone rings with the caller ID. The trainee presses **📞 Answer** and greets the caller, who then says why they're calling in their own words and answers what they're asked from what their `gives` says (wrong answers included). They react to what the trainee says and hang up when the call is done. The trainee talks (live voice, or **🎙 Talk** on the standard voice in Chrome and Edge) or types. They find the file with the panel's search or the 🔍 search bar above the case (the file they open counts as the call's file), and the ☎ firm directory and rules are one tap away.
- **After hanging up:** the trainee confirms which file the call was about (or "not in the system"), picks who the caller was (the same six authentication choices as the drill) and can write a call note.
- **Debrief and score (100):** find the right file 30 and authentication 30, checked against the key; asked the right identifiers 10 and handled the call 30, from a review of the transcript and the note against the key and the firm's rules. Disclosing case information to a caller who isn't verified or authorized, reading an identifier out, or giving legal advice scores 0 for handling. The debrief says what went well, what to work on, a better line to say, the key and what the file says, with the transcript.
- **Saved** with the drill results (as a practice call, with the transcript and the review), so trainers see practice calls in the team table.

**Two voices.** With **🎙 Live voice calls** on (the default in Chrome and Edge), a practice call runs on live voice (Gemini Live, below): the caller hears the trainee and talks back naturally. **🎙 Mute** and **🔈 Speakerphone** work as in the drill (the speakerphone setting is shared), so a practice call can be shown in Google Meet too. When live voice is off, isn't set up, has no microphone, is busy or drops mid-call, the call goes on with the **standard voice**: the caller's next line comes from `/api/call-ai`, the browser reads it out (a female or male voice per caller; 🔊 Voice on/off, ↻ Replay), and the trainee types or talks (🎙 Talk, 🔁 Hands-free). A call that drops keeps its transcript, and the caller carries on from there. After live voice is found not set up, without a microphone, out of the day's minutes or refused in this region, practice calls use the standard voice for the rest of the visit; after a busy line, the next call tries live voice again. A live practice call ends at the live voice time limit (a warning comes 30 seconds before) and goes to the wrap-up.

**Heavy use (a whole class at once).** Live voice spreads its calls over the keys itself (below). On the standard voice, every Gemini key on the project is used and the keys take turns (`functions/_ai.js`): each caller line and review starts on the next key, so the load is spread across all of them. A key that hits its limit rests (a minute, or an hour when its daily quota is used up; a rejected key 10 minutes) and the request moves to the next key at once, so later requests don't pay for a failed try. Caller lines start on Flash-Lite, which has the biggest free quota; reviews start on Flash. When every key is busy, the page retries the line three times (after 1.5, 3 and 6 seconds) and then puts the trainee's line back in the box to send again. Each user gets up to `CALL_AI_LIMIT` caller lines and reviews per 10 minutes (default 150; a call uses about 10 to 30), so one runaway page can't use up the class's quota. The more keys from separate Google Cloud projects, the more trainees can call at once. Admins can see how many keys are set up and which are resting at `/api/call-ai` (GET).

### 📋 The scored drill

A drill is 5, 8, 12 or all 61 incoming calls, picked at random from `DRILL_CALLS` in `mock-cases.js`. For each call the trainee:

1. **Asks the caller** for identifiers (full name, date of birth, address, SSN last 4, callback number, relationship, date of the accident). The caller answers from a script, and some answers are wrong on purpose: a wrong DOB, only two identifiers, a new address that isn't on file, a relative who knows the client's details.
2. **Finds the case** with the drill's search (or the 🔍 search bar in the case header), by whatever the caller gave: name, case number, phone, DOB, DOL, claim or policy number, account number, plate, report number or library ID. Some callers only give a claim number, a plate or our case number. One is a brand-new caller who isn't in the system. Some names are on two or three files: the DOL and the DOB pick the right one. Opening a result loads the file view-only in the editor; **▭ Case** hides the panel to read it.
3. **Authenticates**: the client (or a minor's guardian), an authorized person on file (authorization, POA, estate administrator), not verified, not authorized, a business caller, or a new caller.
4. **Handles the call**: four options, shuffled.

**Hard-to-say names (the Recep2 callers, D45 … D61):** the caller's words show each hard name the way it sounds ("Chumley", not "Cholmondeley"), so searching by ear finds nothing. The trainee has to **ask them to spell it** (the caller spells it letter by letter) and **read it back with the NATO alphabet** (two extra asks on these calls), then search with the real spelling. On a live call, asking to spell it is heard in what the trainee says, and the read-back counts once they say three or more NATO words (Charlie, Hotel, Oscar…). The live caller says the names as they're pronounced and spells them only when asked. A typed practice call writes them the way they sound.

**Scoring per call (100):** find the right case 30 · authentication 40 (the decision 30, plus 10 for asking the right identifiers: name + DOB + address or SSN last 4 for personal callers, name + relationship for relatives, name + callback for businesses, and also the date of the accident whenever the client's name is on more than one file, and the spelling and NATO read-back when the call has a hard-to-say name) · handling 30. Time per call is recorded. After each call the trainee sees what was right, why, and what the file says.

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
- **Time limit:** every call hangs up at a time limit (6 minutes by default), with a warning 30 seconds before. A forgotten open call can't keep running.
- **Optional caps:** set these Cloudflare variables (plain text):
  - `LIVE_MAX_MINUTES`: the time limit per call (1–15; default 6).
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
- **Region:** Google refuses some regions. If this site's server runs in one of them for a trainee, that trainee's calls run as text.

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

Parameters combine, e.g. `?program=reception&mock=MC-06`. Cases a trainee saves are stamped with the program, so trainers can tell which course they came from. Sign-in inside another site's page (an iframe) works through the partitioned session cookie and the cross-site request guard in `functions/_middleware.js`.

## 🔑 Admin Portal (trainer's name + admin password)

The sign-in screen's **Admin Portal** tab asks for the trainer's **name** and the **admin password**, with no username and no registration. It works on a direct visit and from the training platforms (their sign-in screen has a **Trainer sign-in** link).

- **With a name** (first and last), each trainer signs in as **their own Admin account**, made the first time they sign in (username `trainer-<name>`, e.g. `trainer-maria-lopez`). The same name always gets the same account. Pings show "Admin <first name>", and the server logs show who did what. Trainer accounts have every Admin power except the Master Account's: only the Master Account can suspend or revoke another Admin. A revoked trainer's name isn't made again.
- **With no name**, it signs in as the **Master Account** (`LSHADMIN123`), which keeps all of its powers, including being the only account that can revoke another Admin.
- New registrations are for trainees only, and `trainer-` usernames can't be registered. Admin accounts made earlier can't sign in from the Admin tab any more.

**Setting or changing the admin password** (it is never in the code):
1. Cloudflare → Workers & Pages → the CMS Pages project → **Settings → Variables and Secrets**.
2. Add a secret, for both Production and Preview:
   - **Variable name:** `MASTER_ADMIN_PASSWORD` (the older name, `ADMIN_PORTAL_PASSWORD`, also works; if both are set, either password signs in)
   - **Value:** the admin password
3. Redeploy, or wait for the next deploy. The new password works right away.

Until the secret is set, the Admin tab says the admin password isn't set up yet. Trainee sign-in doesn't change.

### 👁 Trainee view (see the site the way trainees do)

A signed-in trainer clicks **👁 Trainee view** at the bottom of the sidebar. The page reloads showing exactly what a trainee sees:
- no Training Library, Front Desk or Caller scenarios buttons, and no Master Control;
- mock cases shown as ordinary case files, by case number;
- a trainee's Case Library, time sheet and calendar, with no "All trainees" views and no other trainees' drafts.

A bar at the bottom of the screen (and a button in the sidebar) says **⇦ Back to trainer view**. The server still knows the trainer as an Admin, so Pause and Lock never stop them. Saving works as usual. The view lasts for the browser tab and ends at sign-out.

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
- **It matches the registered trainee's own account** (their first and last name, with or without the middle initial or suffix; capitalisation doesn't matter), and signs them in exactly as their username and password would.
- **Two registered trainees with the same name:** the form asks for the **CMS Batch ID** to pick the right one.
- **A registration still waiting for approval** is told to wait. Declined, suspended and revoked accounts get their usual message.
- **Not registered yet:** they're told to register, and **Register now** opens the registration form with their name filled in.
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

## 🗂 Case editor: newer sections

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

**Primary Injury** (Profile, beside the Case Narrative)
- The client's primary injury, the body parts involved, the injury type (soft tissue, fracture, head injury / concussion, spine / disc, joint / ligament / tendon tear, laceration / bite / scarring, burn, multiple injuries, wrongful death, other), and surgery (no, recommended, scheduled, completed).
- Also any prior injury to the same area, and the diagnosis and details (imaging, restrictions, future care).

**Passenger Records** (bottom of Profile) are retired: passengers go in **Parties Involved** (+ Passenger). The block shows only when an older case has passenger rows, with a note pointing to Parties Involved. Its container stays in the page because saved fields are restored by position.

**Location of Incident**: in the case's top bar, next to Date of Loss and SOL.

**Report Type** (Police Report tab)
- The choices are **Police Report**, **Incident Report** (premises cases with no police report), or **No report available**.
- The choice relabels the tab and the report's fields. For example, *Property / Business* and *Incident Report Number* replace *Responding Agency* and *Report Number*.

**Lost Wages** (tab after Treatment)
- Employer and job, pay type and rate, hours, time off work, days missed, the doctor's off-work note, and wage verification.
- It shows an estimate: hourly rate × hours ÷ 5 per day, or salary ÷ 260 work days, times the days missed.

**Demand** (tab)
- One entry per demand sent (BI, UM, UIM, PIP, policy limits, pre-suit).
- Each entry has the carrier, adjuster, claim number, date sent and how, amount, response due date, whether it's time-limited, status, the response received, and enclosures.

**Settlement (BI / UM)** (tab)
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
- **Treatment tab:** its notes are now **Other Treatment Notes**, so they aren't confused with the Notes tab.
- **Notes tab:** the card is **Case Notes** (it was "Case Chronology", easy to confuse with the Treatment tab's Medical Chronology), and its button is **+ Add Case Note**.
- **Staff roles** (the dropdown on Notes, Tasks and Expenses rows): adds **Litigation Assistant** (after Paralegal) and **Accounting Department** (after Closer).
- **Medical Chronology:**
  - Drag a row by its left edge (⠿) to move it.
  - **⇅ Sort by Date** orders the rows by their first date of service.
- **Doc Hub:**
  - Drag files onto the drop area to attach them. Each file becomes a document row, under the category picked there.
  - A file dropped on a row attaches to that row.
- **Tasks from an Admin:**
  - In Master Control → Ping, **Send as a task** makes the ping stay on the trainee's screen with an **Accept** button, until they accept or dismiss it.
  - **Accept** adds the task, with who assigned it, to the open case's **Tasks** list and opens that tab. On a Training Library case it's saved right away, and the trainee can edit it and change who it's assigned to like any task; on their own case, Save or Update keeps it.
  - Pending tasks are kept in that browser until the trainee acts on them.
  - **Delivery:** `/api/state` lists the last minute's pings with each one's age measured on the server, so tasks sent a moment apart to different trainees all arrive, and a trainee whose computer clock is off still gets theirs. Each ping shows once per browser (a reload doesn't offer an accepted task again). The task card sits beside the Front Desk panel, not over its buttons.
- **Monitoring:** *View Latest Saved* works again. The username was placed inside the click handler in a way that broke it. Names are now shown as text, not HTML.

**How they're saved:**
- The case's older fields are saved by their position on the page. A field inserted among them would shift every case saved before it.
- The new sections are saved by id instead (`[data-keyed]`, stored in `content.keyed`), and they're left out of the positional lists.
- A case saved before these sections existed loads unchanged, with the new sections empty. `sections.cjs` checks this with a case saved by the previous version (`.github/scripts/fixtures/case-before-keyed.json`), and it fails if the page's positional fields change.
- Code: `case-sections.js`, and "Keyed sections" in `app.js`.

## 📝 New Matter: the client intake form

**＋ New Matter** (the top of the sidebar) opens the client intake form. The intaker picks the kind of matter, and the form follows the firm's intake sheet for it:

| Matter | Follows | The new case's type |
|---|---|---|
| 🚗 **Personal Injury** | Personal Injury – Client Intake Form (auto accident or general) | MVA for an auto accident, otherwise Others: Personal Injury |
| ⚠️ **Slip and Fall** | Client Intake Form – Slip and Fall | Slip and Fall |
| 🏢 **Premises Liability** | Client Intake and Case Information Questionnaire (Premise Liability) | Premise Liability |
| 🐕 **Dog Bite** | Client Intake Form – Dog Bite | Dog Bite |
| 🩺 **Medical Malpractice** | Client Questionnaire (Medical Malpractice) | Others: Medical Malpractice |

- **Filling it in:**
  - Every question on the sheet is there, section by section, with a list of sections and how much of each is answered.
  - Questions that follow a Yes / No ("If yes…") show once it's Yes.
  - Witnesses, providers, children and other lists take as many rows as the sheet has room for.
  - Dates, phone numbers, SSNs and amounts format themselves as they're typed. Personal Injury fills in the day of the week from the date of injury.
  - The paper forms' diagram of the scene is a box to describe the layout.
  - Two questions are added because the case file needs them: the date of birth on the Personal Injury form, and the date of loss on the Medical Malpractice form. They're marked "for the case file".
- **To complete it,** the form needs the client's name, a phone number, the date of loss and what happened. It lists anything missing and takes you to it.
- **Completed,** a new case opens in the editor at the Intake stage, filled in from the answers:
  - the client (name, phone, DOB, SSN, email, address), the emergency contact, employment;
  - the date of loss, the location, the case type, and the narrative (the client's account plus the details of the scene);
  - the Primary Injury card (for Premises Liability, the injured body parts);
  - the police report or the store's incident report;
  - the parties: the at-fault party or driver, the property owner or business, witnesses, another injured party;
  - the health insurance, the at-fault side's policy (BI), and the client's own auto policy (PIP);
  - the hospital, the ambulance and the other providers, each with a specialty from its name (Chiro, Ortho, PT…), plus Other Treatment Notes;
  - Lost Wages, and for an auto accident both vehicles.
- **A Case Note** records who did the intake. It also lists every answer that has no case field of its own (marital status, spouse, bankruptcy, child support, another attorney, how they heard about us, vehicle damage…), so nothing is lost.
- **If the editor has a case open,** the form asks before replacing it.
- **The intake stays with the case.** It is saved with the case, as a keyed section. The Profile tab shows **📋 Intake form** with the form and who completed it, and two buttons:
  - **View intake form** opens the answers, which can be corrected. That changes the intake on file, not the case's fields.
  - **🖨 Print** prints the whole intake.
- **An unfinished intake** is kept in the browser for that user (**Save and close**, or just close it). ＋ New Matter offers to **Resume** or **Discard** it.
- **From the Intake folder,** **📝 New intake** opens the same form. The case then opens in Intake mode, so it saves to the Intake folder.
- The form adds no dropdowns or typed boxes to the page that the case editor would save by position.
- Code: `intake-form.js`. The fill helpers are shared with the Training Library (`window.caseFill` in `training-library.js`).

## 📥 Intake folder (automatically checked and reviewed)

A separate folder in the Case Repository for **intake files**, kept apart from the case files. Open it from the sidebar (**📥 Intake Folder**), from the Case Library window's **📥 Intake folder** tab, or with a course link ending `?intake=1`. Trainees see only their own intake files; Admins see every trainee's, with the trainee's name on each. Code: `intake-folder.js`, `functions/_intake.js` (checklist), `functions/_intake-review.js` (review), `/api/intake-files`.

**Two kinds of intake file:**
- **Typed intakes.** **📝 New intake** opens the client intake form (see **New Matter** above). When it's complete, the case editor opens in **Intake mode**, filled in from it, with the orange bar above the case.
  - **💾 Save to Intake folder** files it in the folder. **Save Case**, **Archive** and the one-minute autosave also save the intake while the bar shows, so an intake never lands in the case files by accident.
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

The CMS keeps the fictional firm's calendars, the way a firm's case management system does: one calendar for each attorney (**Atty. Marcus Reyes**, pre-litigation; **Atty. Elena Brooks**, litigation; **Atty. David Okafor**, intake) and a **Firm / Staff** calendar. It's a tab of the case, **📅 Calendar**, right after **Tasks**. The sidebar's **📅 Firm Calendar** button, and a course link with `?calendar=1`, open the same tab. All times are the firm's, Eastern; when the trainee's computer is on another time zone, events and the event form also show the trainee's own time (e.g. *9:00 PM – 10:00 PM GMT+8 your time*).

This is the CMS's only calendar. It replaced the separate Training Calendar (and its `.ics` downloads): the attorney's Google Calendar connection moved here, and events trainees had saved in the Training Calendar are copied onto the **Firm / Staff** calendar, at the same moments in firm time, the first time they open this one. The Training Calendar's dated training schedule was dropped; the attorneys' standing schedule below plays that part.

- **The attorneys are already busy.** Each calendar holds that attorney's standing schedule, week after week: Monday motion calendar in court, deposition days, mediations, settlement and adjuster calls, client meetings, intake reviews, blocked writing time, the firm huddle, and some out-of-office Fridays. It references the Training Library cases each attorney handles (e.g. Brooks: Mendoza MC-14, Garcia MC-05). Trainees schedule around it, the way they would on a real attorney's calendar.
- **Schedule from the case.** In the Calendar tab, a new event (**+ New event**, **📅 Schedule for this case**, or a click on an empty time) is linked to the open case (client name and case ID or MC number) and goes on the case's attorney's calendar (from the Attorney field); **Unlink** removes the link. The tab's left rail lists the case's own events. Pick the type (deposition, mediation, court hearing, trial, client meeting, medical/IME, deadline, call…), whose calendar it goes on, other attorneys to invite, date, time, location and notes.
- **Availability as you type.** The form lists what the chosen attorneys already have that day and says straight away whether the time is free, including on the attorney's Google Calendar when it's connected. It also flags weekends and times outside business hours (8 AM–6 PM Eastern). The week view jumps to that day, fades the other calendars, and outlines the proposed time.
- **Conflicts are caught.** Saving over something already on an attorney's calendar is refused with the conflicts listed and the next free times offered (click one to move the event there). **Book it anyway** double-books on purpose.
- **Live.** The calendar refreshes every 20 seconds while its tab is showing, and when you come back to the browser tab. Other open browser tabs update as soon as an event is saved or deleted. The calendar isn't part of the saved case: typing in it doesn't count as a case edit, and it stays typeable on view-only Training Library cases.
- **Case deadlines layer:** the SOL, complaint filed, discovery cut-off, trial date and date of loss on the saved cases you can see, as all-day items. **Open the case** on any linked event loads it (a library case opens view-only).
- **Views:** week (weekend optional), month and a 30-day agenda. Each calendar can be switched off in the left rail. Your upcoming events are listed there too.
- **Who sees what:** a trainee sees the attorneys' standing schedule, events an Admin shared firm-wide, and their own events. Other trainees' events stay private. Trainees change or delete only their own events. Admins get **👥 All trainees** to see everyone's, and a **Share firm-wide** option that puts an event on every trainee's calendar (e.g. a hearing the whole batch must schedule around).
- **The attorney's Google Calendar** (left rail → **Google Calendar**): see *Connecting the attorney's Google Calendar* below.
- **Sync to Google / Outlook:** **🔗 Sync to Google / Outlook** gives each person a private subscribe link for the whole firm or one attorney. It has **Add to Google** and **Add to Outlook** buttons. The subscribed calendar shows the same events and follows changes made in the CMS. Google and Outlook re-read subscribed calendars on their own schedule (Outlook about hourly, Google every few hours), so the CMS is where changes appear first. **Reset links** turns the old links off. This is a one-way feed: events are created in the CMS, not in Google or Outlook.
- **Add to Google Calendar:** every event also has this link. It opens Google's own event form, filled in (at firm time), for a one-off copy.

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

- **Sidebar timer** (under **📅 Firm Calendar**): **▶ Start timer** starts on the open case, billable, as *Case review & strategy*. With no case open, it starts non-billable, as *Filing & administrative*. The running time shows on every screen, with **⏸ Pause** / **▶ Resume**, **■ Stop**, and a **$ Billable / Non-billable** switch.
- **⏱ Time tab** (right after **📅 Calendar**):
  - **The timer's details:** the case (**Link to the open case**, **Unlink**, or type a client name), **$ Billable / Non-billable**, the activity and **What you did**. They can be changed while it runs. **Stop & save** saves it, and **Discard** throws it away.
  - **Add time by hand:** date, hours (e.g. `0.5`), and the same details. Use it for work done away from the timer.
  - **This case:** the time on the open case, with totals.
  - **My timesheet:** one week at a time, with a bar for each day and totals for billable hours, non-billable hours, billable share and time worked.
  - **👥 All trainees** (Admins): everyone's time for the week, with a total for each trainee.
  - Entries can be edited (✎) and deleted (🗑). **⬇ Export CSV** downloads the list shown.
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
    - a rate-limited or rejected key rests and the request moves to the next key at once; a busy key hands over; a missing model falls through; a refused region is explained;
    - `/api/call-ai`: sign-in required, bad and oversized bodies refused, the review's JSON mode, the per-user limit (and it doesn't limit anyone else), "busy" when every key is at its limit, the Admin-only status;
    - results are saved as `practice` or `drill`, including in a table made before the `mode` column.
- **Smoke test in a browser:** opens every library case (each section filled, no duplicate element ids) and checks that view-only mode blocks saving. It saves a practice copy with its tags and plays every drill call with the answer key, each of which must score 100 (and checks that skipping the DOL costs points only on same-name files). On every call with a hard-to-say name it checks that the name is shown only the way it sounds until it's spelled, that the spelling and the NATO read-back appear, and that skipping them costs the identifier points. It also checks the Case Library: no Training Library button and no case list for trainees, search by name, DOL and case number (typed four different ways, with the case number in the Case ID field), the same-name warning, opening results from the search bar by click and by keyboard, a drill pick from the search bar, and editing, reloading and resetting a library case's notes. It takes a **practice call on the standard voice**: it rings with an Answer button and no script; the greeting gets the caller's reply after one busy line is retried; the caller's instructions say who they are and never include the answer key; a file opened from the search bar counts as the call's file; the caller hangs up; the debrief needs a file and an authentication decision, scores 97 from the review, and the result is saved as a practice call with its transcript. It also checks the sidebar has no separate Training Calendar and no `.ics` downloads. It checks that trainees never see the Training Library: search results carry case numbers, not Training Library tags; the Case Library window has no Training Library filter; nothing on screen says "Training Library" on a library case or a practice copy; and `openTrainingLibrary()` doesn't open it. It checks the **Trainee view**: a trainer's screen switches to a trainee's (no Training Library, Master Control or Caller scenarios buttons, nothing saying "Training Library"), and **Back to trainer view** restores it. It checks the **Intake folder**: a typed intake (from the intake form) saved from Intake mode (autosave and Save Case file it there, never as a case), reviewed, moved to the case files, and an uploaded intake document filed and reviewed. Finally, it checks that Caller scenarios are for trainers only: a trainee gets no Caller scenarios button and no panel, on a library case or a practice copy. For an Admin, the button opens the panel, which has one for every caller scenario on every file, and one for each of the file's simulator callers, with the caller's name, number and the right handling. Printing all of them renders every simulator caller.

- **Training Library edits** (`.github/scripts/library-edit.cjs`, in the same job): the real `mock-case-edits.js` on SQLite, with a trainer and a trainee in the browser. It checks that:
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

- **New Matter intake form** (`.github/scripts/new-matter.cjs`, in the same job): the form in a browser, as a trainee. It checks that:
  - ＋ New Matter offers the five intake forms, and the form adds no positional field to the page;
  - an empty intake can't open a case, and the form lists what's needed;
  - a completed Slip and Fall intake fills the case field by field:
    - the client and the incident;
    - the incident report, the property owner and the witnesses, the BI policy, the providers and their specialties;
    - Lost Wages, and the Case Note with the answers that have no field of their own (and none that do);
  - the intake is saved with the case and comes back with it, and correcting it on file leaves the case alone;
  - an unfinished intake can be resumed;
  - a Personal Injury auto accident fills both vehicles, both insurers and the police report, after asking before replacing the open case;
  - Premises Liability (body parts, GL and Med Pay limits, salary), Dog Bite and Medical Malpractice set their case types and parties;
  - the Intake folder's New intake opens the form, and the case opens in Intake mode.

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
    - a **practice call on live voice**: Answer connects, both sides are transcribed, a typed line goes to the caller; when the live line drops (busy), the call goes on with the standard voice and the caller gets the transcript so far; the debrief scores it and the result is saved with the whole transcript; the next practice call tries live voice again and ends at the time limit, going to the wrap-up; and on a visit where live voice isn't set up, the practice call says so, carries on with the standard voice, and the next one doesn't ask for live voice again.
- **Name sign-in** (`.github/scripts/guest.cjs`, in the same job): the real `guest-login.js` on SQLite. It checks that:
  - a registered trainee's name signs in to their account, with or without the M.I.;
  - duplicate names need the Batch ID;
  - pending accounts wait for approval;
  - Admins are never reached by name;
  - older name-only accounts still work;
  - an unknown name is sent to Register, with the name filled in;
  - name sign-in is refused without a platform;
  - a direct visit shows Register on a new browser, and the sign-in screen on a browser that signed in before.
- **Sign-in** (`.github/scripts/login.cjs`, in the same job): the real login code on SQLite. It checks:
  - the Admin tab asks for the trainer's name and the admin password (Enter signs in); with no name it signs in as the Master Account;
  - with a name, each trainer gets their own Admin account on first sign-in (the same name, the same account; suspended and revoked trainers are refused, and a revoked one isn't made again), and `trainer-` usernames can't be registered;
  - `MASTER_ADMIN_PASSWORD` and the older `ADMIN_PORTAL_PASSWORD` both work;
  - a wrong or unset admin password, and a name without a last name, are refused;
  - trainees still sign in with username and password;
  - a session stays alive with a heartbeat up to 2 minutes old (a background tab, e.g. while on a Google Meet tab) and ends after that;
  - `/api/state` lists the last minute's pings with their age measured on the server;
  - registration is for trainees only and scrolls on a small screen;
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
- **Time & Billing** (`.github/scripts/time.cjs`, in the same job): runs the real time API on an in-memory SQLite database, through the real page. It checks:
  - the tab's place and the sidebar timer;
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
  - the sidebar button opens the tab, and typing in it isn't saved as a case edit;
  - no select or contenteditable was added to the page.

To run them locally: `node .github/scripts/check-site.mjs`, `node .github/scripts/check-data.mjs`, `node .github/scripts/call-ai.mjs`, `node .github/scripts/smoke.cjs` and `node .github/scripts/calendar.cjs` (the last two need Playwright; `calendar.cjs` needs Node 22.13 or later for `node:sqlite`).

`_redirects` keeps `wrangler.toml`, this README, `.github/` and the Functions source off the published site.
