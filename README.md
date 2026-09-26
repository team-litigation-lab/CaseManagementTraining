# CaseManagementTraining

LSH Case Management System (CMS), the practice CRM used by every LSH training program.

## Training Library (mock cases)

`mock-cases.js` holds **16 hardcoded, fictional personal-injury cases** (MC-01 … MC-16) built for Receptionist / Front Desk training and reused by the other programs. They are the same for everyone, live in code (not the database), and can't be edited or deleted.

- **Open one:** sidebar → **📚 Training Library** → *Open case*. It loads into the normal case editor across every tab (profile, police report, insurance, liens, treatment, property damage, litigation, finance, Doc Hub, notes, tasks), **view only**. Typing, Save, Archive, Update and autosave are all blocked.
- **Caller scenarios:** the banner's **☎ Caller scenarios** panel shows how to verify the caller on that file and 2–4 realistic calls (the client, an adjuster, defense counsel, a provider, an unauthorized relative, a reporter…). Trainees write what they would say, then reveal the model handling. Admins always see it.
- **Firm directory & front-desk rules:** a tab in the library with the fictional firm's extensions, hours and the rules every call follows (verification, who is authorized, never give advice or values, what counts as urgent, what a complete message contains).
- **Practice copy:** **✍ Work on a practice copy** makes the case editable. Save Case then creates the trainee's own case as usual; the saved content carries `trainingLibraryId` (e.g. `MC-04`) and `program`.

What the cases cover, from starter to advanced: every phase from Intake to Litigation, and every case type (MVA, slip and fall, dog bite, premises liability, motorcycle). Authorization situations include the client only, an authorized daughter, a son with power of attorney, a guardian parent with the other parent *not* authorized, and a potential client with the statute of limitations weeks away. Call types include offers with deadlines, recorded-statement requests, deposition changes, a process server, check pickup by a third party, collections threats, a media call, a Spanish-speaking caller and a file transfer to new counsel.

To add or change a case, edit `mock-cases.js` (the comment at the top explains the fields). Course drills are keyed to these facts (e.g. the CM course's Front Desk Lookup), so update those when you change a fact.

## Using the CMS from any training program

Link to the CMS with a program so it opens in that program's context:

| Link | Effect |
|---|---|
| `…/?program=reception` | Header shows *Receptionist / Front Desk Training*; the Training Library lists that program's cases. Also `intake`, `cm`, `ea` (EA/PA). The choice lasts for the browser tab and can be changed in the sidebar. |
| `…/?mock=MC-04` | Opens that Training Library case right after sign-in (use it in a lesson step). |
| `…/?library=1` | Opens the Training Library after sign-in. |

Parameters combine, e.g. `?program=reception&mock=MC-06`. Cases a trainee saves are stamped with the program, so trainers can tell which course they came from. Sign-in inside another site's page (an iframe) works through the partitioned session cookie and the cross-site request guard in `functions/_middleware.js`.
