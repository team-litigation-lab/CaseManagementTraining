# CaseManagementTraining

LSH Case Management System (CMS), the practice CRM used by every LSH training program.

## 🔍 Case Library (search-first)

The sidebar no longer lists everyone's cases. Cases trainees save go into the **Case Library** together with the Training Library mock cases, and nothing is listed until you search, the way a front desk looks a caller up on a live call (`case-library.js`).

- **Search from anywhere:** the **🔍 Search cases** button in the top bar (or **Ctrl/Cmd+K**), the sidebar search, or **🔍 Open Case Library** in the sidebar. Search by client name, date of the accident (DOL), date of birth, phone, claim/policy #, plate or case ID. Each result shows its DOL (and DOB for mock cases); **My cases** lists your own saved cases and drafts.
- **Same name, different file:** when several results share a client name, the Case Library (and the drill's search) says so and asks for the DOL and DOB before you open one.
- **During a Front Desk Drill call**, a mock case opened from the top-bar search counts as the call's pick, so receptionists never need the Training Library.
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

Sidebar → **📞 Front Desk Drill · scored** (or open the CMS with `?drill=1`). A drill is 5, 8, 12 or all 33 incoming calls, picked at random from `DRILL_CALLS` in `mock-cases.js`. For each call the trainee:

1. **Asks the caller** for identifiers (full name, date of birth, address, SSN last 4, callback number, relationship, date of the accident). The caller answers from a script, and some answers are wrong on purpose: a wrong DOB, only two identifiers, a new address that isn't on file, a relative who knows the client's details.
2. **Finds the case** with the search (or the 🔍 top-bar search), by whatever the caller gave: name, phone, DOB, DOL, claim or policy number, account number, plate, report number or case ID. Some callers only give a claim number or a plate. One is a brand-new caller who isn't in the system. Some names are on two or three files: the DOL and the DOB pick the right one. Opening a result loads the file view-only in the editor; **▭ Case** hides the panel to read it.
3. **Authenticates**: the client (or a minor's guardian), an authorized person on file (authorization, POA, estate administrator), not verified, not authorized, a business caller, or a new caller.
4. **Handles the call**: four options, shuffled.

**Scoring per call (100):** find the right case 30 · authentication 40 (the decision 30, plus 10 for asking the right identifiers: name + DOB + address or SSN last 4 for personal callers, name + relationship for relatives, name + callback for businesses, and also the date of the accident whenever the client's name is on more than one file) · handling 30. Time per call is recorded. After each call the trainee sees what was right, why, and what the file says.

**Results** are saved to `/api/drill-results` (table `front_desk_drills`, created automatically on first use). Trainees see their history in the drill panel. Admins see a **team table**: each trainee's number of drills, average and best score, find / authenticate / handle percentages, and seconds per call. Nothing to set up on Cloudflare beyond the existing D1 binding.

To add or change a case, edit `mock-cases.js` (the comment at the top explains the fields). Course drills are keyed to these facts (e.g. the CM course's Front Desk Lookup), so update those when you change a fact.

## Using the CMS from any training program

Link to the CMS with a program so it opens in that program's context:

| Link | Effect |
|---|---|
| `…/?program=reception` | Header shows *Receptionist / Front Desk Training*; the Training Library lists that program's cases. Also `intake`, `cm`, `ea` (EA/PA). The choice lasts for the browser tab and can be changed in the sidebar. |
| `…/?mock=MC-04` | Opens that Training Library case right after sign-in (use it in a lesson step). |
| `…/?library=1` | Opens the Training Library after sign-in (Admins); trainees get the Case Library search. |
| `…/?drill=1` | Opens the Front Desk Drill after sign-in. |

Parameters combine, e.g. `?program=reception&mock=MC-06`. Cases a trainee saves are stamped with the program, so trainers can tell which course they came from. Sign-in inside another site's page (an iframe) works through the partitioned session cookie and the cross-site request guard in `functions/_middleware.js`.

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
- **Smoke test in a browser:** opens every library case (each section filled, no duplicate element ids) and checks that view-only mode blocks saving. It saves a practice copy with its tags and plays every drill call with the answer key, each of which must score 100 (and checks that skipping the DOL costs points only on same-name files). It also checks the Case Library: no Training Library button and no case list for trainees, search by name and DOL, the same-name warning, a drill pick from the top-bar search, and editing, reloading and resetting a library case's notes.

To run them locally: `node .github/scripts/check-site.mjs`, `node .github/scripts/check-data.mjs`, `node .github/scripts/smoke.cjs` (needs Playwright).

`_redirects` keeps `wrangler.toml`, this README, `.github/` and the Functions source off the published site.
