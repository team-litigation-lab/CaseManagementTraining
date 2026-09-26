# CaseManagementTraining

LSH Case Management System (CMS), the practice CRM used by every LSH training program.

## Training Library (mock cases)

`mock-cases.js` holds **20 hardcoded, fictional personal-injury cases** (MC-01 … MC-20) built for Receptionist / Front Desk training and reused by the other programs. They are the same for everyone, live in code (not the database), and can't be edited or deleted.

- **Open one:** sidebar → **📚 Training Library** → *Open case*. It loads into the normal case editor across every tab (profile, police report, insurance, liens, treatment, property damage, litigation, finance, Doc Hub, notes, tasks), **view only**. Typing, Save, Archive, Update and autosave are all blocked.
- **Caller scenarios:** the banner's **☎ Caller scenarios** panel shows how to verify the caller on that file and 2–4 realistic calls (the client, an adjuster, defense counsel, a provider, an unauthorized relative, a reporter…). Trainees write what they would say, then reveal the model handling. Admins always see it.
- **Firm directory & front-desk rules:** a tab in the library with the fictional firm's extensions, hours and the rules every call follows (verification, who is authorized, never give advice or values, what counts as urgent, what a complete message contains).
- **Practice copy:** **✍ Work on a practice copy** makes the case editable. Save Case then creates the trainee's own case as usual; the saved content carries `trainingLibraryId` (e.g. `MC-04`) and `program`.

What the cases cover, from starter to advanced: every phase from Intake to Litigation, and a wide spread of case types: car crashes (rear-end, T-bone, rideshare, hit-and-run, commercial truck), a pedestrian hit by a city bus (government-claim notice), motorcycle, bicycle, slip and fall, dog bite (adult and child), premises liability, product liability (evidence that must not be released) and wrongful death (estate administrator). Authorization situations include the client only, an authorized daughter, a son with power of attorney, a guardian parent with the other parent *not* authorized, an estate administrator with other relatives *not* authorized, and a potential client with the statute of limitations weeks away. Call types include offers with deadlines, recorded-statement requests, deposition changes, a process server, check pickup by a third party, collections threats, a media call, a Spanish-speaking caller and a file transfer to new counsel.

## 📞 Front Desk Drill (measures the VA)

Sidebar → **📞 Front Desk Drill · scored** (or open the CMS with `?drill=1`). A drill is 5, 8, 12 or all 27 incoming calls, picked at random from `DRILL_CALLS` in `mock-cases.js`. For each call the trainee:

1. **Asks the caller** for identifiers (full name, date of birth, address, SSN last 4, callback number, relationship). The caller answers from a script, and some answers are wrong on purpose: a wrong DOB, only two identifiers, a new address that isn't on file, a relative who knows the client's details.
2. **Finds the case** with the search, by whatever the caller gave: name, phone, DOB, claim or policy number, account number, plate, report number or case ID. Some callers only give a claim number or a plate. One is a brand-new caller who isn't in the system. Opening a result loads the file view-only in the editor; **▭ Case** hides the panel to read it.
3. **Authenticates**: the client (or a minor's guardian), an authorized person on file (authorization, POA, estate administrator), not verified, not authorized, a business caller, or a new caller.
4. **Handles the call**: four options, shuffled.

**Scoring per call (100):** find the right case 30 · authentication 40 (the decision 30, plus 10 for asking the right identifiers: name + DOB + address or SSN last 4 for personal callers, name + relationship for relatives, name + callback for businesses) · handling 30. Time per call is recorded. After each call the trainee sees what was right, why, and what the file says.

**Results** are saved to `/api/drill-results` (table `front_desk_drills`, created automatically on first use). Trainees see their history in the drill panel. Admins see a **team table**: each trainee's number of drills, average and best score, find / authenticate / handle percentages, and seconds per call. Nothing to set up on Cloudflare beyond the existing D1 binding.

To add or change a case, edit `mock-cases.js` (the comment at the top explains the fields). Course drills are keyed to these facts (e.g. the CM course's Front Desk Lookup), so update those when you change a fact.

## Using the CMS from any training program

Link to the CMS with a program so it opens in that program's context:

| Link | Effect |
|---|---|
| `…/?program=reception` | Header shows *Receptionist / Front Desk Training*; the Training Library lists that program's cases. Also `intake`, `cm`, `ea` (EA/PA). The choice lasts for the browser tab and can be changed in the sidebar. |
| `…/?mock=MC-04` | Opens that Training Library case right after sign-in (use it in a lesson step). |
| `…/?library=1` | Opens the Training Library after sign-in. |
| `…/?drill=1` | Opens the Front Desk Drill after sign-in. |

Parameters combine, e.g. `?program=reception&mock=MC-06`. Cases a trainee saves are stamped with the program, so trainers can tell which course they came from. Sign-in inside another site's page (an iframe) works through the partitioned session cookie and the cross-site request guard in `functions/_middleware.js`.
