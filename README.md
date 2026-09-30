# CaseManagementTraining

LSH Case Management System (CMS), the practice CRM used by every LSH training program.

## 🔍 Case Library (search-first)

The sidebar no longer lists everyone's cases. Cases trainees save go into the **Case Library** together with the Training Library mock cases, and nothing is listed until you search, the way a front desk looks a caller up on a live call (`case-library.js`).

- **Search bar above the case:** type in the 🔍 search bar at the top of the case workspace (or press **Ctrl/Cmd+K**) and matching files drop down under it; click one (or use the arrow keys and Enter) to open it. Trainees never need to open a library. Search by client name, **case number** (typed any way: `LSH-2026-MVA-901379`, `mva 901379` or just `901379`), date of the accident (DOL), date of birth, phone, claim/policy #, plate or library ID. Each result shows its DOL (and, for mock cases, the case number and DOB).
- **Case Library window:** sidebar → **🔍 Open Case Library** for the same search with filters (Training Library, saved cases, **My cases**: your own saved cases and drafts) and the ☎ firm directory.
- **Same name, different file:** when several results share a client name, the Case Library (and the drill's search) says so and asks for the DOL and DOB before you open one.
- **During a Front Desk Drill call**, a mock case opened from the search bar counts as the call's pick, so receptionists never need the Training Library.
- Drafts stay visible only to their owner and Admins (enforced server-side, as before). **Export Case List** is for Admins only, since it lists every trainee's cases. Admins still browse all cases in Master Control → Case Logs.

## Training Library (mock cases)

`mock-cases.js` holds **36 hardcoded, fictional personal-injury cases** (MC-01 … MC-36) built for Receptionist / Front Desk training and reused by the other programs. They are the same for everyone and live in code (not the database), so they can't be deleted and their facts never change.

- **Who sees it:** only **Admins** get the sidebar **📚 Training Library** button (browse every mock case by program). Trainees find mock cases by searching the **Case Library**; every way into the library (the case banner, `?library=1`) takes them there instead.
- **Open one:** from a Case Library result (or, for Admins, **📚 Training Library** → *Open case*). It loads into the normal case editor across every tab (profile, police report, insurance, liens, treatment, property damage, litigation, finance, Doc Hub, notes, tasks), **view only**. Typing, Save, Archive, Update and autosave are all blocked, except on the Notes and Tasks tabs.
- **Notes and Tasks are editable:** trainees can add, edit and delete notes and tasks on a library case (log the call they just took, set a task for the case manager). They save automatically to that trainee's account (`/api/mock-case-updates`, table `mock_case_updates`, created on first use) and come back when the trainee reopens the case. Other trainees don't see them, and the library original never changes. **↺ Reset to the original** on either tab deletes them.
- **Case numbers:** every file has a firm case number in the CMS's own Case ID format, `LSH-<year opened>-<type code>-<number>` (e.g. `LSH-2026-MVA-901379`), shown in the Case ID field when the file opens and in search results. The numbers are in the 900000+ range, which the server's counter (it issues saved cases' IDs from 000001) won't reach for a long time, and follow the order the files were opened. Some callers give only the case number.
- **Same names on purpose:** MC-21 is a second file for Maria Santos (same client as MC-01, an older pharmacy fall) and MC-22 is a *different* Maria Santos (other DOB). MC-23 and MC-24 do the same for James Wilson (MC-06). Her husband is authorized on MC-21 only, not on MC-01: authorization is per file. MC-25 and MC-26 are a father and son, both named Jose Hernandez, hurt in the same crash: same name, address and DOL, so only the DOB or the case number tells the files apart (his mother is authorized on the father's file only).
- **Caller scenarios:** the banner's **☎ Caller scenarios** panel shows how to verify the caller on that file and 2–4 realistic calls (the client, an adjuster, defense counsel, a provider, an unauthorized relative, a reporter…). Trainees write what they would say, then reveal the model handling. Admins always see it.
- **Firm directory & front-desk rules:** a tab in the library with the fictional firm's extensions, hours and the rules every call follows (verification, who is authorized, never give advice or values, what counts as urgent, what a complete message contains).
- **Practice copy:** **✍ Work on a practice copy** makes the case editable. Save Case then creates the trainee's own case as usual; the saved content carries `trainingLibraryId` (e.g. `MC-04`) and `program`.

What the cases cover, from starter to advanced: every phase from Intake to Litigation, and a wide spread of case types: car crashes (rear-end, T-bone, rideshare, hit-and-run, commercial truck), a pedestrian hit by a city bus (government-claim notice), motorcycle, bicycle, slip and fall, dog bite (adult and child), premises liability, product liability (evidence that must not be released) and wrongful death (estate administrator). MC-25 … MC-36 add an e-scooter, a boating and a pedestrian case, negligent security, an elevator case in litigation (mediation), a trampoline-park injury, the UM settlement phase, and a prior attorney's lien and a pre-settlement funding lien. Authorization situations include the client only, an authorized daughter, a son with power of attorney, a guardian parent with the other parent *not* authorized, divorced parents with joint custody who are *both* authorized, an estate administrator with other relatives *not* authorized, a funding company allowed the case status only, a client with a safety flag (never confirm she's a client), an employer asking about a client, and a potential client with the statute of limitations weeks away. Call types include offers with deadlines, recorded-statement requests, deposition changes, a mediation center, a process server, check pickup by a third party, collections threats, a media call, a Spanish-speaking caller, a file transfer to new counsel, the client's former law firm, and callers who give only our case number.

## 📞 Front Desk Drill (measures the VA)

Admins: sidebar → **📞 Front Desk Drill · scored**. Trainees don't get the sidebar button (like the Training Library's); they open the drill from their course's link, `?drill=1`. A drill is 5, 8, 12 or all 44 incoming calls, picked at random from `DRILL_CALLS` in `mock-cases.js`. For each call the trainee:

1. **Asks the caller** for identifiers (full name, date of birth, address, SSN last 4, callback number, relationship, date of the accident). The caller answers from a script, and some answers are wrong on purpose: a wrong DOB, only two identifiers, a new address that isn't on file, a relative who knows the client's details.
2. **Finds the case** with the drill's search (or the 🔍 search bar above the case), by whatever the caller gave: name, case number, phone, DOB, DOL, claim or policy number, account number, plate, report number or library ID. Some callers only give a claim number, a plate or our case number. One is a brand-new caller who isn't in the system. Some names are on two or three files: the DOL and the DOB pick the right one. Opening a result loads the file view-only in the editor; **▭ Case** hides the panel to read it.
3. **Authenticates**: the client (or a minor's guardian), an authorized person on file (authorization, POA, estate administrator), not verified, not authorized, a business caller, or a new caller.
4. **Handles the call**: four options, shuffled.

**Scoring per call (100):** find the right case 30 · authentication 40 (the decision 30, plus 10 for asking the right identifiers: name + DOB + address or SSN last 4 for personal callers, name + relationship for relatives, name + callback for businesses, and also the date of the accident whenever the client's name is on more than one file) · handling 30. Time per call is recorded. After each call the trainee sees what was right, why, and what the file says.

**Results** are saved to `/api/drill-results` (table `front_desk_drills`, created automatically on first use). Trainees see their history in the drill panel. Admins see a **team table**: each trainee's number of drills, average and best score, find / authenticate / handle percentages, and seconds per call. Nothing to set up on Cloudflare beyond the existing D1 binding.

To add or change a case, edit `mock-cases.js` (the comment at the top explains the fields). Course drills are keyed to these facts (e.g. the CM course's Front Desk Lookup), so update those when you change a fact.

### 🎙 Live voice calls

With **🎙 Live voice calls** ticked on the drill's start screen (the default in Chrome and Edge), each call is a real phone call instead of text.

- **Answering:** the phone rings. The trainee presses **📞 Answer** and greets the caller the way they answer the firm's phone.
- **The caller** talks back out loud in a natural voice (Gemini Live, one voice per caller, female or male as the call's `voice` in `mock-cases.js` says). Either one can talk over the other, as on a real call.
- **What the caller knows:** the caller only knows their script. That is why they're calling (`opening`) and what they answer when asked for each identifier (`gives`), wrong answers included. They don't volunteer details, don't invent case facts, and never say they're a simulation.
- **Asking for identifiers:** the trainee just asks out loud. Each identifier is ticked on screen as they ask for it (from the live transcript), and that is what the "asked the right identifiers" points use. Tapping an identifier asks it in writing instead.
- **Transcript:** both sides are transcribed as they speak. **Mute** and **Hang up** work as on a phone.
- **Scoring:** "End the call and score it" hangs up. The call's transcript is saved with the drill result, for the trainer.
- **Headset:** a headset works best. Speakers can echo the caller back into the microphone.

**Falling back to text.** Without a microphone, in another browser, or while live voice isn't set up, the call runs as text as before, with a note saying why.

**Setup:** add the Gemini key to this Pages project.
1. Cloudflare → Workers & Pages → the CMS Pages project → **Settings → Variables and Secrets**.
2. Add a secret named `GEMINI_API_KEY` or any numbered name (`GEMINI_API_KEY1`, `GEMINI_API_KEY13`, …), for Production and Preview. It can be the same key the courses use. Each extra numbered key shares the load.
3. Redeploy.

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
| `…/?drill=1` | Opens the Front Desk Drill after sign-in. |
| `…/?from=ea` (or `portal`, `pd`, `standard`, `cm`) | Opened from that platform: trainees sign in with just their name (see Name sign-in). |
| `…/?calendar=1` | Opens the 📅 Calendar tab (Firm Calendar) after sign-in. |

Parameters combine, e.g. `?program=reception&mock=MC-06`. Cases a trainee saves are stamped with the program, so trainers can tell which course they came from. Sign-in inside another site's page (an iframe) works through the partitioned session cookie and the cross-site request guard in `functions/_middleware.js`.

## 🔑 Admin Portal (admin password only)

The sign-in screen's **Admin Portal** tab asks only for the **admin password**, with no username. It signs in as the **Master Account** (`LSHADMIN123`), which keeps all of its powers, including being the only account that can revoke another Admin. New registrations are for trainees only. Admin accounts made earlier can't sign in from the Admin tab any more.

**Setting or changing the admin password** (it is never in the code):
1. Cloudflare → Workers & Pages → the CMS Pages project → **Settings → Variables and Secrets**.
2. Add a secret, for both Production and Preview:
   - **Variable name:** `ADMIN_PORTAL_PASSWORD`
   - **Value:** the admin password
3. Redeploy, or wait for the next deploy. The new password works right away.

Until the secret is set, the Admin tab says the admin password isn't set up yet. Trainee sign-in doesn't change.

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
- Failed name look-ups are limited to 30 per connection per hour.
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
- **Medical Chronology:**
  - Drag a row by its left edge (⠿) to move it.
  - **⇅ Sort by Date** orders the rows by their first date of service.
- **Doc Hub:**
  - Drag files onto the drop area to attach them. Each file becomes a document row, under the category picked there.
  - A file dropped on a row attaches to that row.
- **Tasks from an Admin:**
  - In Master Control → Ping, **Send as a task** makes the ping stay on the trainee's screen with an **Accept** button, until they accept or dismiss it.
  - **Accept** adds the task, with who assigned it, to the open case's **Tasks** list and opens that tab.
  - Pending tasks are kept in that browser until the trainee acts on them.
- **Monitoring:** *View Latest Saved* works again. The username was placed inside the click handler in a way that broke it. Names are now shown as text, not HTML.

**How they're saved:**
- The case's older fields are saved by their position on the page. A field inserted among them would shift every case saved before it.
- The new sections are saved by id instead (`[data-keyed]`, stored in `content.keyed`), and they're left out of the positional lists.
- A case saved before these sections existed loads unchanged, with the new sections empty. `sections.cjs` checks this with a case saved by the previous version (`.github/scripts/fixtures/case-before-keyed.json`), and it fails if the page's positional fields change.
- Code: `case-sections.js`, and "Keyed sections" in `app.js`.

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
- **Smoke test in a browser:** opens every library case (each section filled, no duplicate element ids) and checks that view-only mode blocks saving. It saves a practice copy with its tags and plays every drill call with the answer key, each of which must score 100 (and checks that skipping the DOL costs points only on same-name files). It also checks the Case Library: no Training Library button and no case list for trainees, search by name, DOL and case number (typed four different ways, with the case number in the Case ID field), the same-name warning, opening results from the search bar by click and by keyboard, a drill pick from the search bar, and editing, reloading and resetting a library case's notes. It also checks the sidebar has no separate Training Calendar and no `.ics` downloads.

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
    - a refused line is retried on another;
    - the time limit warns, then hangs up;
    - scoring hangs up, frees the line and keeps the transcript;
    - without live voice set up, the call and the rest of the drill run as text.
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
  - the Admin tab asks for the admin password only and signs in as the Master Account;
  - a wrong or unset admin password is refused;
  - trainees still sign in with username and password;
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

To run them locally: `node .github/scripts/check-site.mjs`, `node .github/scripts/check-data.mjs`, `node .github/scripts/smoke.cjs` and `node .github/scripts/calendar.cjs` (the last two need Playwright; `calendar.cjs` needs Node 22.13 or later for `node:sqlite`).

`_redirects` keeps `wrangler.toml`, this README, `.github/` and the Functions source off the published site.
