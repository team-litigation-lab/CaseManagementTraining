# CaseManagementTraining

LSH Case Management System (CMS), the practice CRM used by every LSH training program.

## 🔍 Case Library (search-first)

The sidebar no longer lists everyone's cases. Cases trainees save go into the **Case Library** together with the Training Library mock cases, and nothing is listed until you search, the way a front desk looks a caller up on a live call (`case-library.js`).

- **Search bar above the case:** type in the 🔍 search bar at the top of the case workspace (or press **Ctrl/Cmd+K**) and matching files drop down under it; click one (or use the arrow keys and Enter) to open it. Trainees never need to open a library. Search by client name, date of the accident (DOL), date of birth, phone, claim/policy #, plate or case ID. Each result shows its DOL (and DOB for mock cases).
- **Case Library window:** sidebar → **🔍 Open Case Library** for the same search with filters (Training Library, saved cases, **My cases**: your own saved cases and drafts) and the ☎ firm directory.
- **Same name, different file:** when several results share a client name, the Case Library (and the drill's search) says so and asks for the DOL and DOB before you open one.
- **During a Front Desk Drill call**, a mock case opened from the search bar counts as the call's pick, so receptionists never need the Training Library.
- Drafts stay visible only to their owner and Admins (enforced server-side, as before). **Export Case List** is for Admins only, since it lists every trainee's cases. Admins still browse all cases in Master Control → Case Logs.

## Training Library (mock cases)

`mock-cases.js` holds **24 hardcoded, fictional personal-injury cases** (MC-01 … MC-24) built for Receptionist / Front Desk training and reused by the other programs. They are the same for everyone and live in code (not the database), so they can't be deleted and their facts never change.

- **Who sees it:** only **Admins** get the sidebar **📚 Training Library** button (browse every mock case by program). Trainees find mock cases by searching the **Case Library**; every way into the library (the case banner, `?library=1`) takes them there instead.
- **Open one:** from a Case Library result (or, for Admins, **📚 Training Library** → *Open case*). It loads into the normal case editor across every tab (profile, police report, insurance, liens, treatment, property damage, litigation, finance, Doc Hub, notes, tasks), **view only**. Typing, Save, Archive, Update and autosave are all blocked, except on the Notes and Tasks tabs.
- **Notes and Tasks are editable:** trainees can add, edit and delete notes and tasks on a library case (log the call they just took, set a task for the case manager). They save automatically to that trainee's account (`/api/mock-case-updates`, table `mock_case_updates`, created on first use) and come back when the trainee reopens the case. Other trainees don't see them, and the library original never changes. **↺ Reset to the original** on either tab deletes them.
- **Same names on purpose:** MC-21 is a second file for Maria Santos (same client as MC-01, an older pharmacy fall) and MC-22 is a *different* Maria Santos (other DOB). MC-23 and MC-24 do the same for James Wilson (MC-06). Her husband is authorized on MC-21 only, not on MC-01: authorization is per file.
- **Caller scenarios:** the banner's **☎ Caller scenarios** panel shows how to verify the caller on that file and 2–4 realistic calls (the client, an adjuster, defense counsel, a provider, an unauthorized relative, a reporter…). Trainees write what they would say, then reveal the model handling. Admins always see it.
- **Firm directory & front-desk rules:** a tab in the library with the fictional firm's extensions, hours and the rules every call follows (verification, who is authorized, never give advice or values, what counts as urgent, what a complete message contains).
- **Practice copy:** **✍ Work on a practice copy** makes the case editable. Save Case then creates the trainee's own case as usual; the saved content carries `trainingLibraryId` (e.g. `MC-04`) and `program`.

What the cases cover, from starter to advanced: every phase from Intake to Litigation, and a wide spread of case types: car crashes (rear-end, T-bone, rideshare, hit-and-run, commercial truck), a pedestrian hit by a city bus (government-claim notice), motorcycle, bicycle, slip and fall, dog bite (adult and child), premises liability, product liability (evidence that must not be released) and wrongful death (estate administrator). Authorization situations include the client only, an authorized daughter, a son with power of attorney, a guardian parent with the other parent *not* authorized, an estate administrator with other relatives *not* authorized, and a potential client with the statute of limitations weeks away. Call types include offers with deadlines, recorded-statement requests, deposition changes, a process server, check pickup by a third party, collections threats, a media call, a Spanish-speaking caller and a file transfer to new counsel.

## 📞 Front Desk Drill (measures the VA)

Admins: sidebar → **📞 Front Desk Drill · scored**. Trainees don't get the sidebar button (like the Training Library's); they open the drill from their course's link, `?drill=1`. A drill is 5, 8, 12 or all 33 incoming calls, picked at random from `DRILL_CALLS` in `mock-cases.js`. For each call the trainee:

1. **Asks the caller** for identifiers (full name, date of birth, address, SSN last 4, callback number, relationship, date of the accident). The caller answers from a script, and some answers are wrong on purpose: a wrong DOB, only two identifiers, a new address that isn't on file, a relative who knows the client's details.
2. **Finds the case** with the drill's search (or the 🔍 search bar above the case), by whatever the caller gave: name, phone, DOB, DOL, claim or policy number, account number, plate, report number or case ID. Some callers only give a claim number or a plate. One is a brand-new caller who isn't in the system. Some names are on two or three files: the DOL and the DOB pick the right one. Opening a result loads the file view-only in the editor; **▭ Case** hides the panel to read it.
3. **Authenticates**: the client (or a minor's guardian), an authorized person on file (authorization, POA, estate administrator), not verified, not authorized, a business caller, or a new caller.
4. **Handles the call**: four options, shuffled.

**Scoring per call (100):** find the right case 30 · authentication 40 (the decision 30, plus 10 for asking the right identifiers: name + DOB + address or SSN last 4 for personal callers, name + relationship for relatives, name + callback for businesses, and also the date of the accident whenever the client's name is on more than one file) · handling 30. Time per call is recorded. After each call the trainee sees what was right, why, and what the file says.

**Results** are saved to `/api/drill-results` (table `front_desk_drills`, created automatically on first use). Trainees see their history in the drill panel. Admins see a **team table**: each trainee's number of drills, average and best score, find / authenticate / handle percentages, and seconds per call. Nothing to set up on Cloudflare beyond the existing D1 binding.

To add or change a case, edit `mock-cases.js` (the comment at the top explains the fields). Course drills are keyed to these facts (e.g. the CM course's Front Desk Lookup), so update those when you change a fact.

## 📅 Training Calendar

Sidebar → **📅 Training Calendar** (or a course link with `?calendar=1`) opens the trainee's own calendar inside the CMS. It sits next to the **📅 Firm Calendar** (the attorneys' calendars, which keeps the two `.ics` downloads). Code: `training-calendar.js`, `functions/_training_calendar.js`, `/api/training-calendar`, `/api/calendar-google`.

- **Views:** Month, Week (an hour grid with 8 AM–6 PM business hours shaded) and Agenda (30 days). ‹ › and **Today** move through them.
- **Layers** (tick to show or hide):
  - **My events:** what the trainee schedules. Each event has a title, a type (meeting, client call, court hearing, deposition, mediation, deadline, travel, other), all-day or start and end times, a location, attendees, a case and notes. Events are saved to the trainee's account.
  - **Training schedule:** the same mock attorney caseload the `.ics` had: 17 events over five weeks, from intake through filing, discovery, a deposition, hearings, mediation and a settlement conference to trial. It's dated from the trainee's training start date (from today when the account has none).
  - **Case deadlines:** the SOL, Litigation-tab SOL, complaint-filed, discovery cut-off and trial dates on the trainee's own saved cases.
  - **Attorney's Google Calendar:** appears once the trainee connects it (see below).
- **Attorney's time zone:** the calendar shows the attorney's time (Eastern by default). Each trainee's choice is saved. Events and the event form also show the trainee's own local time.
- **Checks when scheduling:** the event form warns about double-booking (against every layer, including the attorney's Google events), weekends, times outside 8 AM–6 PM in the attorney's zone, deadlines on that day, and times that have already passed. It warns but doesn't block. The server also refuses dates and times that don't exist (November 31, 25:00).
- **Deleting wrong entries (🗂 Entries in the side panel):**
  - **Trainees:** **🗂 Manage my entries** lists everything they put on their Training Calendar, newest first, with a search box. They tick the wrong entries and delete them together, or use the 🗑 on one row. They can also delete a single event from its details.
  - **Admins:** **🗂 Trainees' entries** lists every trainee with entries, showing name, batch and count. Pick a trainee to see their entries and delete what was entered wrongly, the same way. Each Admin deletion is recorded in the activity log (`training-calendar-delete`: who deleted it, whose entries, and their titles and dates). Trainees can only ever delete their own entries.
  - **Google copies:** if a deleted entry was copied to the attorney's Google Calendar, the copy is removed too, through the entry owner's own Google connection. If Google can't be reached, the copy is removed at that trainee's next **Sync now**.
  - The training schedule and case deadlines aren't entries and can't be deleted here. Fix a wrong deadline date on the case itself.
  - The Firm Calendar has its own delete: Admins switch on **👥 All trainees**, open the event and choose **🗑 Delete**.

### Connecting the attorney's Google Calendar

In the calendar's side panel, **Connect Google Calendar** opens Google's sign-in in a popup. The trainee signs in with the Google account the attorney shared their calendar with, then picks the attorney's calendar from the list. Calendars shared with them come first; ones they can only view are marked. After that:

- The attorney's events show in the calendar (green) and count in the double-booking check.
- **Copy to this calendar** chooses what goes onto the attorney's calendar:
  - **My events** (on by default);
  - **Training schedule** (titles start with `[TRAINING SIM]`);
  - **Case deadlines**.
- Syncing:
  - New and edited events are copied when they're saved, and deleted events are removed.
  - **Sync now** makes the attorney's calendar match the ticked layers. Unticking a layer removes its copies.
  - Each copy keeps a fixed id, so syncing again updates it instead of adding a duplicate. The CMS never changes events it didn't copy.
- Copying needs the calendar shared with **Make changes to events**. With view-only sharing the trainee still sees the attorney's events, but can't copy to the calendar.
- **Disconnect Google** revokes the access. The trainee can choose to remove the copies first.

Until the setup below is done, the panel says so, and every event has an **Add to Google Calendar** link instead. It opens Google's own event form, filled in, where the trainee picks the attorney's calendar.

**Setup (once, by an admin):**

1. console.cloud.google.com → pick or create a project → APIs & Services → Library → enable the **Google Calendar API**.
2. Set up the **OAuth consent screen**:
   - **User type Internal** if trainees sign in with the firm's Google Workspace accounts. No Google review is needed.
   - Otherwise **External**. While it's in *Testing*, only the test users you add can connect, and Google makes them reconnect every 7 days. Opening it to everyone needs Google to verify the calendar scopes.
   - Scopes: `openid`, `email`, `.../auth/calendar.events`, `.../auth/calendar.readonly`.
3. Credentials → Create credentials → **OAuth client ID** → *Web application*. Under **Authorized JavaScript origins** add `https://lshcasemanagementtraining-trainingcrm.pages.dev` (and any custom domain). No redirect URI is needed, because sign-in happens in a popup.
4. Cloudflare → this Pages project → Settings → Variables and Secrets: add `GOOGLE_CLIENT_ID` (text) and `GOOGLE_CLIENT_SECRET` (secret), then redeploy.

**Data** (D1, created on first use):

- `training_calendar_events`: the trainee's events (the Firm Calendar's `calendar_events` is a different table);
- `calendar_prefs`: time zone, shown layers and copied layers;
- `calendar_google_links`: the Google account, the chosen calendar, and its tokens, encrypted with a key derived from `SESSION_SECRET`;
- `calendar_google_sync`: which events were copied to which calendar.

## Using the CMS from any training program

Link to the CMS with a program so it opens in that program's context:

| Link | Effect |
|---|---|
| `…/?program=reception` | Header shows *Receptionist / Front Desk Training*; the Training Library lists that program's cases. Also `intake`, `cm`, `ea` (EA/PA) and `pd` (Property Damage: the vehicle cases MC-01, MC-04, MC-08, MC-12). The choice lasts for the browser tab and can be changed in the sidebar. |
| `…/?mock=MC-04` | Opens that Training Library case right after sign-in (use it in a lesson step). |
| `…/?library=1` | Opens the Training Library after sign-in (Admins); trainees get the Case Library search. |
| `…/?drill=1` | Opens the Front Desk Drill after sign-in. |
| `…/?calendar=1` | Opens the Training Calendar after sign-in. |

Parameters combine, e.g. `?program=reception&mock=MC-06`. Cases a trainee saves are stamped with the program, so trainers can tell which course they came from. Sign-in inside another site's page (an iframe) works through the partitioned session cookie and the cross-site request guard in `functions/_middleware.js`.

## 👤 Name-only access from other training platforms

Trainees who open the CMS from another LSH training platform don't need a CMS account. The sign-in screen asks only for their **name** (and batch, optional), and **Continue** signs them in (`guest-access.js` → `/api/guest-login`).

**Which platforms:**

| Platform | Link sends |
|---|---|
| LSH Training Portal: the Training Directory's **🗂 Case Management System** banner and the Call Simulator's case links | `from=portal` |
| Property Damage Claims Training | `from=pd` |
| Standard Foundational Training | `from=standard` |
| EA/PA Training | `from=ea` |

The links also send `name=` and `batch=`, which fill in the form. A link without `from=` still counts when the page that linked here (the browser's referrer) is one of those sites, including their preview addresses. The platform is remembered for the browser tab. The CM course isn't on the list: its trainees keep their CMS accounts. A direct visit gets the usual username and password sign-in, and **Have a CMS account? Sign in with it** switches to it from the name form.

**What they get:** an ordinary, approved **Trainee** account, created the first time and reused whenever the same name and batch come back, from any of the platforms. So everything the CMS does for trainees works for them:
- saved cases get the automated review and the AI review;
- Front Desk Drill scores are saved;
- Notes and Tasks on library cases are kept;
- trainers see them in the **trainer roster**, labelled *via Property Damage Claims Training* (or the platform they last came from).

**How it's kept safe:**
- Name-only accounts have usernames starting `guest-` (e.g. `guest-jane-doe--b050225`). Registration refuses that prefix, so typing a name can never reach a registered account.
- They have no usable password, so `/api/login` can't open them.
- Admins manage them like any other account: they can suspend or revoke them (a revoked name can't come back).
- At most 10 new names per connection per hour; returning trainees aren't limited.
- Admin access still needs an admin account and password.

This is convenience, not a security boundary: anyone who opens the CMS from one of those platforms (the Training Directory is public) can sign in with a name, the same as the portal's Simulators.

**Data** (D1, created on first use): the `users` row (email `<username>@guest.invalid`, a CMS Batch ID from the usual counter), `guest_accounts` (their name, course batch, the platforms they came from, program, first and last visit) and `guest_login_rate`. Code: `functions/_guest.js`, `functions/api/guest-login.js`, `guest-access.js`.

## 📅 Firm Calendar (attorney calendars)

The CMS keeps the fictional firm's calendars, the way a firm's case management system does: one calendar for each attorney (**Atty. Marcus Reyes**, pre-litigation; **Atty. Elena Brooks**, litigation; **Atty. David Okafor**, intake) and a **Firm / Staff** calendar. Open it from the sidebar (**📅 Firm Calendar**) or from a case (**📅 Schedule**, after the case tabs). All times are the firm's, Eastern.

- **The attorneys are already busy.** Each calendar holds that attorney's standing schedule, week after week: Monday motion calendar in court, deposition days, mediations, settlement and adjuster calls, client meetings, intake reviews, blocked writing time, the firm huddle, and some out-of-office Fridays. It references the Training Library cases each attorney handles (e.g. Brooks: Mendoza MC-14, Garcia MC-05). Trainees schedule around it, the way they would on a real attorney's calendar.
- **Schedule from the case.** From an open case, **📅 Schedule** starts a new event linked to that case (client name and case ID or MC number) on the case's attorney's calendar (from the Attorney field). Pick the type (deposition, mediation, court hearing, trial, client meeting, medical/IME, deadline, call…), whose calendar it goes on, other attorneys to invite, date, time, location and notes.
- **Availability as you type.** The form lists what the chosen attorneys already have that day and says straight away whether the time is free. The week view jumps to that day, fades the other calendars, and outlines the proposed time.
- **Conflicts are caught.** Saving over something already on an attorney's calendar is refused with the conflicts listed and the next free times offered (click one to move the event there). **Book it anyway** double-books on purpose.
- **Live.** The calendar refreshes every 20 seconds while it's open and when you come back to the tab. Other open tabs update as soon as an event is saved or deleted.
- **Case deadlines layer:** the SOL, complaint filed, discovery cut-off, trial date and date of loss on the saved cases you can see, as all-day items. **Open the case** on any linked event loads it (a library case opens view-only).
- **Views:** week (weekend optional), month and a 30-day agenda. Each calendar can be switched off in the left rail. Your upcoming events are listed there too.
- **Who sees what:** a trainee sees the attorneys' standing schedule, events an Admin shared firm-wide, and their own events. Other trainees' events stay private. Trainees change or delete only their own events. Admins get **👥 All trainees** to see everyone's, and a **Share firm-wide** option that puts an event on every trainee's calendar (e.g. a hearing the whole batch must schedule around).
- **Sync to Google / Outlook:** **🔗 Sync to Google / Outlook** gives each person a private subscribe link for the whole firm or one attorney. It has **Add to Google** and **Add to Outlook** buttons. The subscribed calendar shows the same events and follows changes made in the CMS. Google and Outlook re-read subscribed calendars on their own schedule (Outlook about hourly, Google every few hours), so the CMS is where changes appear first. **Reset links** turns the old links off. This is a one-way feed: events are created in the CMS, not in Google or Outlook.
- **Exports** (in the calendar's left rail): **My case deadlines (.ics)** and **Training simulation (.ics)**, the two downloads that used to be sidebar buttons. *My case deadlines* works again: its endpoint had been sitting outside `functions/api/`.

**Data** (D1, created on first use): `calendar_events` (one row per event: owner, calendar, invitees, type, date, start and end, location, linked case, notes, shared flag) and `calendar_feeds` (each person's subscribe token). The standing schedule isn't stored; it's built from a weekly pattern in `functions/_calendar.js`, so it never runs out. Code: `firm-calendar.js`, `functions/api/calendar.js`, `functions/api/calendar-feed.js`, `functions/_calendar.js`. The calendar adds no `<select>` or contenteditable to the page, because the case editor saves those by position.

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
    - every drill call pointing at a real case, with a valid auth code and answer;
    - callers the key marks verified giving details that match the file (and "not verified" callers not matching);
    - files that share a client name having different dates of loss.
- **Smoke test in a browser:** opens every library case (each section filled, no duplicate element ids) and checks that view-only mode blocks saving. It saves a practice copy with its tags and plays every drill call with the answer key, each of which must score 100 (and checks that skipping the DOL costs points only on same-name files). It also checks the Case Library: no Training Library button and no case list for trainees, search by name and DOL, the same-name warning, opening results from the search bar by click and by keyboard, a drill pick from the search bar, and editing, reloading and resetting a library case's notes. Finally it opens the Training Calendar: the month, week and agenda views, the double-booking warning, saving an event, copying events to and removing them from a mocked Google Calendar, disconnecting it, the Add to Google Calendar link, a trainee deleting a wrong entry from Manage my entries, and an Admin deleting a trainee's entry from Trainees' entries.

- **Firm Calendar** (`.github/scripts/calendar.cjs`, in the same job): runs the real calendar API code on an in-memory SQLite database standing in for D1, through the real page. It schedules from a case (the case is linked and its attorney picked), then checks:
  - the live availability warning;
  - a conflicting time is refused with free times offered, and picking one saves it;
  - double-booking happens only when asked;
  - the case deadlines layer, and the month and agenda views;
  - the subscribe feed;
  - editing and deleting;
  - another trainee can't see or delete the event;
  - no select or contenteditable was added to the page.

To run them locally: `node .github/scripts/check-site.mjs`, `node .github/scripts/check-data.mjs`, `node .github/scripts/smoke.cjs` and `node .github/scripts/calendar.cjs` (the last two need Playwright; `calendar.cjs` needs Node 22.13 or later for `node:sqlite`).

`_redirects` keeps `wrangler.toml`, this README, `.github/` and the Functions source off the published site.
