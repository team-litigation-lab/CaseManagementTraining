/* =========================================================
   LSH CMS — TRAINING LIBRARY: HARDCODED MOCK CASES
   ---------------------------------------------------------
   Fictional personal-injury files every training program can open
   (Receptionist / Front Desk, Intake, Case Management, EA/PA, …).
   They live in this file, not in the database, so they are identical
   for every trainee and can't be deleted (trainers' edits are saved on top,
   /api/mock-case-edits). A trainee works on one in the role of the program
   they chose (training-library.js: who edits what): the parts their program
   handles are editable, and Save Case keeps their work as their own case for
   that file. The Front Desk (and a drill) gets it view only except its Notes
   and Tasks, saved for them only (/api/mock-case-updates).

   Some client names are on more than one file on purpose (the same
   client with a second accident, or a different person with the same
   name) so the front desk practices telling files apart by the date
   of the accident and the date of birth. Files that share a name must
   have different DOLs (.github/scripts/check-data.mjs checks it).

   All people, phone numbers (555-01xx), addresses, claim and policy
   numbers here are invented for training. SSNs are masked on purpose:
   the front desk never needs, reads out or keys a full SSN.

   `caseNumber` is the file's firm case number, in the CMS's Case ID format
   (LSH-<year opened>-<type code>-<number>; functions/_utils.js nextCaseId).
   Mock numbers use the 900000+ range, which the server's counter (saved
   cases get 000001 and up) won't reach for a long time, and follow the order the files
   were opened. It's searchable and shows in the Case ID field.

   `injury` fills the Profile tab's Primary Injury card: primary, parts, type and
   surgery (each one of the card's options), prior and details. Only what the
   file says is filled in.

   Each case carries a `reception` block: how to verify the caller and
   the calls the front desk is likely to get on that file, with the
   model handling. Other programs use the same cases for their own
   drills; `programs` says which libraries list the case.

   Course drills (e.g. the CM course's Front Desk Lookup) are keyed to
   the facts below. If you change a fact, update those drills too.
   ========================================================= */

const MOCK_FIRM = {
    name: 'LSH Training Law Group (fictional)',
    mainLine: '(555) 010-2000',
    fax: '(555) 010-2099',
    hours: 'Monday–Friday, 8:30 AM – 5:30 PM (Eastern). After hours: voicemail is checked at 8:30 AM.',
    address: '400 Commerce Street, Suite 1200, Riverton',
    directory: [
        { name: 'Atty. Marcus Reyes', role: 'Lead Attorney (Pre-Litigation)', ext: '201' },
        { name: 'Atty. Elena Brooks', role: 'Lead Attorney (Litigation)', ext: '202' },
        { name: 'Atty. David Okafor', role: 'Associate Attorney / Intake Attorney', ext: '203' },
        { name: 'Janelle Price', role: 'Litigation Paralegal', ext: '221' },
        { name: 'Priya Natarajan', role: 'Case Manager', ext: '311' },
        { name: 'Tom Alvarez', role: 'Case Manager', ext: '312' },
        { name: 'Grace Kim', role: 'Case Manager', ext: '313' },
        { name: 'Luis Ortega', role: 'Case Manager (bilingual English/Spanish)', ext: '314' },
        { name: 'Sam Whitaker', role: 'Demand Specialist', ext: '331' },
        { name: 'Rosa Delgado', role: 'Lien Negotiator', ext: '341' },
        { name: 'Kevin Lam', role: 'Property Damage Specialist', ext: '351' },
        { name: 'Intake Team', role: 'New cases and potential clients', ext: '100' },
        { name: 'Records Team', role: 'Medical records and bills', ext: '400' },
        { name: 'Accounting / Disbursements', role: 'Settlement checks and trust account', ext: '500' }
    ],
    rules: [
        'Verify every caller who asks about a case: full name, date of birth, the date of the accident (DOL), and one more identifier on file (the claim number, our case number, the home address, or the last 4 of the SSN). Never read an identifier out to the caller; ask them to give it to you.',
        'Only the client, or a person the file lists as authorized (a guardian, a power of attorney, or someone on a signed communication authorization), gets case information. Everyone else gets "I can take a message" and nothing more, not even whether the firm represents that person.',
        'The front desk never gives legal advice, case values, settlement opinions or deadlines to act on. Take a complete message and route it.',
        'Insurance adjusters and opposing counsel go to the attorney or case manager on the file. Never agree to a recorded statement, confirm facts, or accept a settlement offer.',
        'Media calls: "We have no comment. I can take your name and number for the attorney." Nothing else.',
        'A complete message: date and time, caller name and role, callback number, best time to call, case name, what they need, how urgent, and your initials. Log it as a Note on the case and route it to the person on the file.',
        'Urgent (route now, not by message): a client in danger or in crisis, a deadline or court date in the next 7 days, a settlement offer with a time limit, a statute of limitations close, a subpoena or a process server, or anyone threatening legal action against the firm.'
    ],
    // The reception SOP (Job Description & SOPs: Receptionist). The practice calls' debrief grades by it,
    // and the Reception Simulator lists it with the rules.
    sop: [
        'Answer at once: the one-ring policy.',
        'Open every call with the spiel: "Thank you for calling Legal Support Help. This is (your name)." (In these practice calls the firm is also called LSH Training Law Group.)',
        'Before you transfer a call, tell the person who takes it the caller\'s name and why they are calling. Always a cold transfer unless you are told otherwise. Tell the caller who you are putting them through to.',
        'Never give out a Social Security number or any part of it. A provider or an adjuster who asks for it sends the request in writing to prelit@legalsupporthelp.com.',
        'Case updates follow the case status and who is calling (the client, a medical provider or an adjuster): say only what the file supports. Adjusters put their requests and offers in writing to prelit@legalsupporthelp.com. Litigation matters go to the litigation team, or a paralegal follows up.',
        'Close every call: offer more help ("Is there anything else I can help you with?"), thank the caller, and say goodbye.'
    ]
};

const MOCK_PROGRAMS = [
    { id: 'reception', label: 'Receptionist / Front Desk' },
    { id: 'intake', label: 'Intake' },
    { id: 'cm', label: 'Case Management' },
    { id: 'md', label: 'Medical Summary & Demand' },
    { id: 'ea', label: 'EA / PA' },
    { id: 'pd', label: 'Property Damage' }
];

const MOCK_CASES = [
{
    id: 'MC-01', caseNumber: 'LSH-2026-MVA-901379', level: 'Starter', programs: ['reception', 'cm', 'ea', 'pd', 'md'],
    summary: 'Rear-end collision, in treatment. Client calls about her next appointment; a "cousin" asks about the settlement.',
    client: { name: 'Maria Santos', phone: '(555) 010-4417', email: 'maria.santos@example.com', dob: '03/22/1988', ssn: 'XXX-XX-4821',
        address: '1187 Willow Bend Dr, Riverton, GA 30301',
        emergency: { name: 'Eduardo Santos', phone: '(555) 010-4418', relationship: 'Husband' },
        employment: { status: 'Employed', employer: 'Brightside Dental Group', title: 'Dental Hygienist' } },
    caseType: 'MVA', phase: 'Treating', attorney: 'Atty. Marcus Reyes', caseManager: 'Priya Natarajan',
    dateOfLoss: '06/09/2026', sol: '06/09/2028', target: '',
    narrative: 'Client was stopped at a red light on Peachtree Ave when a 2019 Ford Escape driven by Kyle Brandt rear-ended her at about 30 mph. Neck and low-back pain the same evening; went to urgent care the next morning. No prior neck injuries. Liability is clear (Brandt admitted he was looking at his phone; cited for following too closely).',
    injury: { primary: 'Neck and low-back strain', parts: 'Neck, lower back', type: 'Soft tissue (sprain / strain)', surgery: 'No', prior: 'No prior neck injuries', details: 'Cervical and lumbar strain; X-rays negative. Chiropractic and physical therapy.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-26-061902', officer: 'Ofc. T. Hale #2231',
        narrative: 'Unit 1 (Santos, Honda Civic) stopped for red signal. Unit 2 (Brandt, Ford Escape) failed to stop and struck Unit 1 in the rear. Driver 2 stated he "looked down for a second." Driver 2 cited: following too closely. No transports; Driver 1 complained of neck pain.' },
    health: { carrier: 'Peach State Health Plan', memberId: 'PSH-88213340', group: 'GRP-55120' },
    bi: [{ holder: 'Kyle Brandt', carrier: 'Keystone Mutual Insurance', policy: 'KM-4471902', claim: 'KM-26-118834', adjuster: 'Dana Whitfield', contact: '(555) 010-7702 · dwhitfield@example.com', liability: 'Yes', limits: '$50,000 / $100,000' }],
    pipum: [{ type: 'UM/UIM', holder: 'Maria Santos', carrier: 'Harbor Point Insurance', policy: 'HP-2290017', claim: 'HP-26-5530', adjuster: 'Not yet assigned', contact: '(555) 010-7810', limits: '$25,000 / $50,000' }],
    liens: [],
    facilities: [
        { name: 'QuickCare Urgent Care', specialty: 'EMC', phone: '(555) 010-3301', email: 'records@quickcare.example.com', dates: '06/10/2026 – 06/10/2026', status: 'Discharged', charges: '$ 385.00' },
        { name: 'City Spine & Rehab', specialty: 'Chiro', phone: '(555) 010-3345', email: 'frontdesk@cityspine.example.com', dates: '06/16/2026 – present', status: 'Ongoing', charges: '$ 3,420.00' },
        { name: 'Motion Physical Therapy', specialty: 'Other', specialtyOther: 'Physical Therapy', phone: '(555) 010-3390', email: 'billing@motionpt.example.com', dates: '08/04/2026 – present', status: 'Ongoing', charges: '$ 1,760.00' }
    ],
    chrono: [
        { dos: ['06/10/2026'], facility: 'QuickCare Urgent Care', next: '', notes: 'Cervical and lumbar strain. Referred to chiropractic care. X-rays negative.' },
        { dos: ['06/16/2026', '09/22/2026'], facility: 'City Spine & Rehab', next: '09/29/2026 10:30 AM', notes: 'Chiropractic 2x/week. Pain down from 7/10 to 4/10. Next visit Tuesday 09/29 at 10:30 AM.' },
        { dos: ['08/04/2026', '09/24/2026'], facility: 'Motion Physical Therapy', next: '10/01/2026 4:00 PM', notes: 'PT 1x/week for 8 weeks. Next session Thursday 10/01 at 4:00 PM.' }
    ],
    treatmentNotes: 'Treating consistently, no gaps. Client asked about mileage: mileage to and from treatment is tracked for the demand (client keeps her log; firm does not reimburse mileage now).',
    pd: { client: { year: '2021', make: 'Honda', model: 'Civic', plate: 'GA-RKT4412', owner: 'Maria Santos', driver: 'Maria Santos' },
        tp: { year: '2019', make: 'Ford', model: 'Escape', plate: 'GA-BDX2290', owner: 'Kyle Brandt', driver: 'Kyle Brandt', insured: 'Yes', carrierPolicy: 'Keystone Mutual · KM-4471902', driverPhone: '(555) 010-7715', driverInsurer: 'Keystone Mutual Insurance' } },
    lit: null,
    finance: [{ date: '06/20/2026', staff: 'Records Specialist', desc: 'Police report fee (RPD-26-061902)', amount: '$ 15.00' }],
    docs: [
        { cat: 'Case Files', summary: 'Signed retainer and HIPAA authorization (06/12/2026). No communication authorization for anyone other than the client.' },
        { cat: 'Police Report', summary: 'RPD-26-061902. Brandt cited for following too closely.' },
        { cat: 'Medical Records', summary: 'QuickCare urgent care visit 06/10/2026.' }
    ],
    notes: [
        { date: '06/12/2026', staff: 'Intake Specialist', text: 'Retainer signed. Client prefers text or calls after 5 PM (works chairside). Only the client is authorized to receive case information.' },
        { date: '07/15/2026', staff: 'Case Manager', text: 'Monthly check-in. Chiro helping. Reminded client to keep a mileage log and to tell us before missing any appointment.' },
        { date: '09/22/2026', staff: 'Case Manager', text: 'Client doing better. PT added 08/04. Will reassess at the end of October whether treatment is winding down.' }
    ],
    tasks: [
        { date: '09/22/2026', staff: 'Case Manager', text: 'Next client check-in 10/20/2026.' },
        { date: '09/22/2026', staff: 'Records Specialist', text: 'Request updated City Spine & Rehab records and ledger after 10/31/2026.' }
    ],
    reception: {
        verify: 'Maria Santos · DOB 03/22/1988 · address 1187 Willow Bend Dr or SSN last 4 (4821). Only the client is authorized.',
        calls: [
            { from: 'Maria Santos (client)', ask: '"I lost my appointment card. When is my next chiropractor visit?"', handle: 'Verify her first (name, DOB, address). Then: City Spine & Rehab, Tuesday 09/29/2026 at 10:30 AM; PT is Thursday 10/01 at 4:00 PM. Suggest she confirm with the clinic at (555) 010-3345. Log a Note.' },
            { from: 'Maria Santos (client)', ask: '"Will you pay me back for gas to my appointments?"', handle: 'Do not promise money. Say mileage is tracked for her claim and ask her to keep her mileage log, as the file notes say. Offer a message to Priya Natarajan (ext 311) if she wants more detail.' },
            { from: '"Rosa, Maria\'s cousin"', ask: '"Has Maria\'s case settled yet? How much is she getting?"', handle: 'Not authorized: only the client is on file. Do not confirm the firm represents Maria. "I\'m not able to share any information, but I can take a message." Note the call for the CM.' },
            { from: 'City Spine & Rehab billing', ask: 'Asks for Maria\'s auto claim number to bill it.', handle: 'Providers are routed to the CM, who decides what to send and where. Take the message for Priya Natarajan (ext 311). Do not read out claim numbers over the phone.' }
        ]
    }
},
{
    id: 'MC-02', caseNumber: 'LSH-2026-SNF-902099', level: 'Starter', programs: ['reception', 'intake', 'cm', 'md'],
    summary: 'Grocery-store slip and fall, retainer still out. The store\'s insurer wants a recorded statement.',
    client: { name: 'Derek Thompson', phone: '(555) 010-4520', email: 'd.thompson@example.com', dob: '11/05/1975', ssn: 'XXX-XX-1934',
        address: '52 Harbor View Rd, Apt 3B, Riverton, GA 30303',
        emergency: { name: 'Carla Thompson', phone: '(555) 010-4521', relationship: 'Sister' },
        employment: { status: 'Employed', employer: 'Metro Transit Authority', title: 'Bus Operator' } },
    caseType: 'Slip and Fall', phase: 'Intake', attorney: 'Atty. David Okafor', caseManager: '',
    dateOfLoss: '09/12/2026', sol: '09/12/2028', target: '',
    narrative: 'Potential client slipped on spilled liquid detergent in aisle 7 of FreshWay Market (Route 9 store) at about 6:15 PM. No warning cone. Fell on his right side; right wrist fracture (cast) and hip bruising. Store manager (Alan Pruitt) took an incident report; client photographed the spill. Two witnesses gave names to the store. Intake completed 09/18; retainer sent by e-sign 09/21, NOT yet signed.',
    injury: { primary: 'Right wrist fracture', parts: 'Right wrist, right hip', type: 'Fracture', details: 'Wrist in a cast; hip bruising. Off work (bus operator cannot drive in a cast).' },
    police: { agency: 'None (store incident report only)', number: 'FreshWay IR-0912-117', officer: 'Store manager Alan Pruitt', narrative: 'Store incident report: customer fell in aisle 7; liquid on floor; cleanup requested 6:25 PM. (Copy requested; store says it needs a subpoena or a request from counsel.)' },
    health: { carrier: 'Metro Transit Employee Health (self-funded)', memberId: 'MTA-0047712', group: 'MTA-UNION-4' },
    bi: [{ holder: 'FreshWay Market LLC', carrier: 'Allied Retail Casualty', policy: 'ARC-GL-775120', claim: 'ARC-26-44091', adjuster: 'Brent Kowalski', contact: '(555) 010-7931', liability: 'Pending', limits: 'Unknown' }],
    pipum: [],
    liens: [],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '09/12/2026 – 09/12/2026', status: 'Discharged', charges: '$ 4,210.00' },
        { name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '09/16/2026 – present', status: 'Ongoing', charges: '$ 650.00' }
    ],
    chrono: [
        { dos: ['09/12/2026'], facility: 'St. Mary\'s Hospital', next: '', notes: 'ER: right distal radius fracture, splinted. Hip contusion.' },
        { dos: ['09/16/2026'], facility: 'Riverton Orthopedic Associates', next: '10/07/2026 9:15 AM', notes: 'Cast applied. Off work 6 weeks. Recheck 10/07 at 9:15 AM.' }
    ],
    treatmentNotes: 'Client is off work (bus operator cannot drive in a cast).',
    pd: null, lit: null, finance: [],
    docs: [
        { cat: 'Case Files', summary: 'Intake questionnaire (09/18/2026). Retainer and HIPAA sent by e-sign 09/21/2026, not yet signed.' },
        { cat: 'Others', summary: 'Client\'s photos of the spill and the aisle (no warning cone visible).' }
    ],
    notes: [
        { date: '09/18/2026', staff: 'Intake Specialist', text: 'Intake call done. Conflict check clear (FreshWay Market LLC, Alan Pruitt). Sent to Atty. Okafor for review.' },
        { date: '09/21/2026', staff: 'Associate Attorney', text: 'Case accepted pending signed retainer. E-sign retainer and HIPAA sent. Told the client NOT to talk to the store or its insurer.' },
        { date: '09/24/2026', staff: 'Intake Specialist', text: 'Reminder text sent: retainer still unsigned. Client said he would sign this weekend.' }
    ],
    tasks: [
        { date: '09/24/2026', staff: 'Intake Specialist', text: 'Follow up on the unsigned retainer by 09/28/2026. Once signed: assign a CM and send the letter of representation to Allied Retail Casualty.' },
        { date: '09/21/2026', staff: 'Paralegal', text: 'Preservation letter to FreshWay (surveillance video for 09/12/2026, 5:45–6:45 PM) as soon as the retainer is signed.' }
    ],
    reception: {
        verify: 'Derek Thompson · DOB 11/05/1975 · 52 Harbor View Rd Apt 3B or SSN last 4 (1934).',
        calls: [
            { from: 'Derek Thompson', ask: '"Did you guys take my case? Who is my lawyer?"', handle: 'Verify. The attorney accepted it pending his signature: the retainer sent by e-sign on 09/21 is still unsigned. Offer to resend the link and route him to Intake (ext 100). Do not say he "has a case" or what it\'s worth.' },
            { from: 'Brent Kowalski, Allied Retail Casualty (store\'s insurer)', ask: '"I\'d like to take a quick recorded statement from Mr. Thompson about the fall. Can you set that up?"', handle: 'Never schedule or agree to a recorded statement. Take his name, number and claim number (ARC-26-44091) for Atty. David Okafor (ext 203). Don\'t confirm facts or injuries. Log a Note.' },
            { from: 'Derek Thompson', ask: '"The store manager called me and wants me to come in and sign something."', handle: 'Urgent: transfer to Atty. Okafor (ext 203) or Intake now; if no one is available, a priority message. You may repeat the file note: the attorney asked him not to talk to the store or its insurer. No legal advice beyond that.' }
        ]
    }
},
{
    id: 'MC-03', caseNumber: 'LSH-2026-DOG-901145', level: 'Starter', programs: ['reception', 'cm', 'md'],
    summary: 'Dog bite at a neighbor\'s home, demand in review. Homeowner\'s insurer calls about the demand.',
    client: { name: 'Aisha Patel', phone: '(555) 010-4633', email: 'aisha.patel@example.com', dob: '07/14/1992', ssn: 'XXX-XX-6610',
        address: '309 Maple Court, Riverton, GA 30305',
        emergency: { name: 'Raj Patel', phone: '(555) 010-4634', relationship: 'Brother' },
        employment: { status: 'Employed', employer: 'Riverton Public Library', title: 'Children\'s Librarian' } },
    caseType: 'Dog Bite', phase: 'Pending Demand', attorney: 'Atty. Marcus Reyes', caseManager: 'Tom Alvarez',
    dateOfLoss: '02/03/2026', sol: '02/03/2028', target: '$ 65,000.00',
    narrative: 'Client was walking on the public sidewalk when a German Shepherd ("Max") owned by Gerald Finch ran through an open gate and bit her left forearm and calf. 14 stitches; later scar revision consult. Animal Control confirmed a prior bite complaint on the same dog (2024).',
    injury: { primary: 'Dog-bite lacerations to the left forearm and calf', parts: 'Left forearm, left calf', type: 'Laceration / bite / scarring', surgery: 'Recommended', details: '14 stitches. Scar revision consult; future scar revision estimate in the file.' },
    police: { agency: 'Riverton County Animal Control', number: 'AC-26-00318', officer: 'Officer Linda Moss #88', narrative: 'Dog "Max" (German Shepherd, owner Gerald Finch) quarantined 10 days. Prior bite complaint on file 05/2024. Owner cited for dog at large.' },
    health: { carrier: 'Georgia Educators Health', memberId: 'GEH-7730215', group: 'LIB-2020' },
    bi: [{ holder: 'Gerald Finch', carrier: 'Homestead Fire & Casualty', policy: 'HFC-HO-3319054', claim: 'HFC-26-02117', adjuster: 'Monica Reyes-Hart', contact: '(555) 010-7640 · mreyeshart@example.com', liability: 'Yes', limits: '$300,000' }],
    pipum: [],
    liens: [{ type: 'HI Subro', entity: 'Georgia Educators Health', file: 'SUB-GEH-26-1180', amount: '$ 3,940.00' }],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '02/03/2026 – 02/03/2026', status: 'Discharged', charges: '$ 5,880.00' },
        { name: 'Lakeside Plastic Surgery', specialty: 'Other', specialtyOther: 'Plastic Surgery', phone: '(555) 010-3220', email: 'office@lakesideplastics.example.com', dates: '03/10/2026 – 07/21/2026', status: 'Discharged', charges: '$ 2,450.00' },
        { name: 'Harmony Counseling', specialty: 'Other', specialtyOther: 'Counseling', phone: '(555) 010-3250', email: 'intake@harmony.example.com', dates: '03/02/2026 – 08/31/2026', status: 'Discharged', charges: '$ 2,160.00' }
    ],
    chrono: [
        { dos: ['02/03/2026'], facility: 'St. Mary\'s Hospital', next: '', notes: 'Wound irrigation, 14 sutures, rabies protocol started.' },
        { dos: ['03/10/2026', '07/21/2026'], facility: 'Lakeside Plastic Surgery', next: '', notes: 'Scar assessment; future scar revision estimated at $6,500.' },
        { dos: ['03/02/2026', '08/31/2026'], facility: 'Harmony Counseling', next: '', notes: 'Anxiety around dogs; 12 sessions; discharged.' }
    ],
    treatmentNotes: 'Treatment complete 08/31/2026. Future scar revision estimate in file.',
    pd: null, lit: null,
    finance: [{ date: '08/10/2026', staff: 'Records Specialist', desc: 'Medical records fees (3 providers)', amount: '$ 96.00' }],
    docs: [
        { cat: 'Police Report', summary: 'Animal Control report AC-26-00318 with the prior 2024 bite complaint.' },
        { cat: 'Medical Records', summary: 'All records and bills received 09/02/2026.' },
        { cat: 'Case Files', summary: 'Draft demand with Sam Whitaker for attorney review.' }
    ],
    notes: [
        { date: '09/02/2026', staff: 'Case Manager', text: 'All records and bills in. Sent file to Demand Specialist.' },
        { date: '09/21/2026', staff: 'Demand Specialist', text: 'Draft demand to Atty. Reyes for review. Target to send by 10/02/2026.' }
    ],
    tasks: [{ date: '09/21/2026', staff: 'Lead Attorney', text: 'Review and approve the draft demand by 09/30/2026.' }],
    reception: {
        verify: 'Aisha Patel · DOB 07/14/1992 · 309 Maple Court or SSN last 4 (6610).',
        calls: [
            { from: 'Monica Reyes-Hart, Homestead Fire & Casualty', ask: '"When am I getting the demand on the Patel claim?"', handle: 'Don\'t give dates or details. Take a message for Tom Alvarez (CM, ext 312) with her claim number (HFC-26-02117) and callback number.' },
            { from: 'Aisha Patel (client)', ask: '"What is my case worth? My friend got $100,000 for a dog bite."', handle: 'Verify. No values or opinions from the front desk. Status you can share: the demand is being prepared for the attorney\'s review. Offer a callback from Tom Alvarez (ext 312).' }
        ]
    }
},
{
    id: 'MC-04', caseNumber: 'LSH-2025-MVA-900909', level: 'Intermediate', programs: ['reception', 'cm', 'pd', 'md'],
    summary: 'Policy-limits demand is out. The adjuster calls with an offer that has a deadline.',
    client: { name: 'Robert Chen', phone: '(555) 010-4741', email: 'bobby.chen@example.com', dob: '01/30/1969', ssn: 'XXX-XX-2208',
        address: '88 Lantern Hill Rd, Riverton, GA 30307',
        emergency: { name: 'Susan Chen', phone: '(555) 010-4742', relationship: 'Wife' },
        employment: { status: 'Employed', employer: 'Chen & Sons Hardware', title: 'Owner' } },
    caseType: 'MVA', phase: 'BI Demanded', attorney: 'Atty. Marcus Reyes', caseManager: 'Grace Kim',
    dateOfLoss: '11/18/2025', sol: '11/18/2027', target: '$ 100,000.00',
    narrative: 'Client (goes by "Bobby") was broadsided at Oak St and 5th Ave by a driver who ran a stop sign (Tanya Mills). Left shoulder rotator-cuff tear, surgery 03/2026. Policy-limits demand ($100,000) sent 09/08/2026 with a 30-day time limit: response due 10/08/2026.',
    injury: { primary: 'Left rotator-cuff tear', parts: 'Left shoulder', type: 'Joint / ligament / tendon tear', surgery: 'Completed', details: 'Surgery 03/2026. Permanent restriction documented.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-25-111807', officer: 'Ofc. J. Park #1904', narrative: 'Unit 2 (Mills) failed to stop at the posted stop sign and struck Unit 1 (Chen) on the passenger side. Unit 2 cited.' },
    health: { carrier: 'Small Business Health Alliance', memberId: 'SBHA-5510922', group: 'SBHA-CHEN' },
    bi: [{ holder: 'Tanya Mills', carrier: 'Liberty Crest Insurance', policy: 'LC-8810456', claim: 'LC-25-99812', adjuster: 'Greg Hollis', contact: '(555) 010-7755 · ghollis@example.com', liability: 'Yes', limits: '$100,000 / $300,000' }],
    pipum: [{ type: 'UM/UIM', holder: 'Robert Chen', carrier: 'Harbor Point Insurance', policy: 'HP-7720981', claim: 'HP-25-1142', adjuster: 'Irene Shaw', contact: '(555) 010-7811', limits: '$100,000 / $300,000' }],
    liens: [{ type: 'HI Subro', entity: 'Small Business Health Alliance', file: 'SBHA-SUB-3321', amount: '$ 18,760.00' }],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '11/18/2025 – 11/18/2025', status: 'Discharged', charges: '$ 3,950.00' },
        { name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '12/02/2025 – 07/30/2026', status: 'Discharged', charges: '$ 9,800.00' },
        { name: 'Northside Surgery Center', specialty: 'Surgery', phone: '(555) 010-3180', email: 'billing@northsidesc.example.com', dates: '03/11/2026 – 03/11/2026', status: 'Discharged', charges: '$ 24,300.00' },
        { name: 'Motion Physical Therapy', specialty: 'Other', specialtyOther: 'Physical Therapy', phone: '(555) 010-3390', email: 'billing@motionpt.example.com', dates: '03/25/2026 – 07/15/2026', status: 'Discharged', charges: '$ 6,120.00' }
    ],
    chrono: [
        { dos: ['03/11/2026'], facility: 'Northside Surgery Center', next: '', notes: 'Arthroscopic rotator cuff repair, left shoulder.' },
        { dos: ['07/30/2026'], facility: 'Riverton Orthopedic Associates', next: '', notes: 'Released at MMI; permanent lifting restriction 25 lbs.' }
    ],
    treatmentNotes: 'Total medical specials $44,170. Permanent restriction documented.',
    pd: { client: { year: '2020', make: 'Toyota', model: 'Tacoma', plate: 'GA-CHN1969', owner: 'Chen & Sons Hardware', driver: 'Robert Chen' },
        tp: { year: '2016', make: 'Nissan', model: 'Altima', plate: 'GA-MLS5521', owner: 'Tanya Mills', driver: 'Tanya Mills', insured: 'Yes', carrierPolicy: 'Liberty Crest · LC-8810456', driverPhone: '(555) 010-7760', driverInsurer: 'Liberty Crest Insurance' } },
    lit: null,
    finance: [{ date: '09/08/2026', staff: 'Demand Specialist', desc: 'Certified mail, demand package', amount: '$ 18.40' }],
    docs: [
        { cat: 'Case Files', summary: 'Policy-limits demand sent 09/08/2026 (certified mail + email). 30-day deadline: 10/08/2026.' },
        { cat: 'Bills', summary: 'All bills; specials $44,170.' }
    ],
    notes: [
        { date: '09/08/2026', staff: 'Demand Specialist', text: 'Demand sent to Greg Hollis, Liberty Crest. Response due 10/08/2026. Calendared 14/7/3-day reminders.' },
        { date: '09/25/2026', staff: 'Case Manager', text: 'Client called about the demand; told him the carrier has until 10/08. Client prefers calls to his cell before 9 AM.' }
    ],
    tasks: [{ date: '09/08/2026', staff: 'Case Manager', text: 'Follow up with Greg Hollis on 10/01/2026 if no response.' }],
    reception: {
        verify: 'Robert "Bobby" Chen · DOB 01/30/1969 · 88 Lantern Hill Rd or SSN last 4 (2208). Wife Susan is the emergency contact only, not authorized.',
        calls: [
            { from: 'Greg Hollis, Liberty Crest Insurance', ask: '"I have an offer on Chen: $65,000, and it\'s only open until Friday at 5."', handle: 'Urgent: an offer with a time limit. Try Atty. Reyes (ext 201) or Grace Kim (ext 313) live; if unavailable, a priority message with the exact amount, the deadline, the claim number (LC-25-99812) and his direct number. Do not react to the offer or pass it to the client yourself. Log a Note.' },
            { from: 'Susan Chen (wife)', ask: '"Did the insurance company answer Bobby\'s demand yet?"', handle: 'Not authorized. She\'s only the emergency contact. Take a message; suggest Bobby call in himself.' }
        ]
    }
},
{
    id: 'MC-05', caseNumber: 'LSH-2024-PRL-900171', level: 'Advanced', programs: ['reception', 'cm', 'md'],
    summary: 'Apartment stairway fall in litigation. Defense counsel calls to move a deposition.',
    client: { name: 'Linda Garcia', phone: '(555) 010-4850', email: 'lgarcia61@example.com', dob: '05/09/1961', ssn: 'XXX-XX-7702',
        address: '2200 Pine Ridge Blvd, Unit 14, Riverton, GA 30309',
        emergency: { name: 'Marco Garcia', phone: '(555) 010-4851', relationship: 'Son' },
        employment: { status: 'Retired', employer: '', title: 'Retired school secretary' } },
    caseType: 'Premise Liability', phase: 'Litigation Discovery', attorney: 'Atty. Elena Brooks', caseManager: 'Tom Alvarez',
    dateOfLoss: '08/27/2024', sol: '08/27/2026', target: '$ 175,000.00',
    narrative: 'Client fell on a broken stair tread (reported twice to management in writing) at Pine Ridge Apartments. Fractured left ankle (ORIF) and a later hip bursitis. Suit filed 04/15/2026 (Garcia v. Pine Ridge Property Management LLC, Riverton County State Court, No. 26-CV-01877).',
    injury: { primary: 'Fractured left ankle', parts: 'Left ankle, hip', type: 'Fracture', surgery: 'Completed', details: 'Ankle ORIF; later hip bursitis.' },
    police: { agency: 'None', number: '—', officer: '—', narrative: 'Two prior written maintenance requests (06/2024, 07/2024) about the broken stair tread are in the file.' },
    health: { carrier: 'Medicare (Part A & B)', memberId: 'MBI 1EG4-TE5-MK72', group: '—' },
    bi: [{ holder: 'Pine Ridge Property Management LLC', carrier: 'Keystone Commercial', policy: 'KC-CGL-993014', claim: 'KC-24-66310', adjuster: 'Paul Dreyer', contact: '(555) 010-7870', liability: 'No', limits: '$1,000,000' }],
    pipum: [],
    liens: [{ type: 'Medical Lien', entity: 'Medicare (BCRC)', file: 'Case ID 24-0931-7781', amount: '$ 21,344.00' }],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '08/27/2024 – 08/30/2024', status: 'Discharged', charges: '$ 38,400.00' },
        { name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '09/10/2024 – 06/05/2025', status: 'Discharged', charges: '$ 7,900.00' }
    ],
    chrono: [{ dos: ['08/28/2024'], facility: 'St. Mary\'s Hospital', next: '', notes: 'ORIF left ankle.' }],
    treatmentNotes: 'Medicare is primary; conditional-payment letter requested.',
    pd: null,
    lit: { sol: '08/27/2026', filed: '04/15/2026', cutoff: '01/15/2027', trial: '05/10/2027',
        rows: [
            { type: 'Deposition Notice', party: 'Plaintiff Linda Garcia: 10/06/2026, 10:00 AM, at defense counsel\'s office', due: '10/06/2026', status: 'Pending' },
            { type: 'Interrogatories', party: 'Defendant\'s responses to our first interrogatories', due: '10/14/2026', status: 'Pending' },
            { type: 'RFP', party: 'Our responses to Defendant\'s request for production', due: '09/30/2026', status: 'Pending' }
        ] },
    finance: [
        { date: '04/15/2026', staff: 'Paralegal', desc: 'Filing fee and summons', amount: '$ 238.00' },
        { date: '04/22/2026', staff: 'Paralegal', desc: 'Process server', amount: '$ 85.00' }
    ],
    docs: [{ cat: 'Litigation Documents', summary: 'Complaint (filed 04/15/2026), Answer, Notice of Deposition for 10/06/2026 at 10:00 AM. Defense counsel: Richard Voss, Voss & Tate LLP, (555) 010-7990.' }],
    notes: [
        { date: '09/15/2026', staff: 'Paralegal', text: 'Deposition of client noticed for 10/06/2026 at 10:00 AM. Prep session with Atty. Brooks set for 10/02/2026 at 2:00 PM.' },
        { date: '09/23/2026', staff: 'Case Manager', text: 'Client nervous about the deposition. Her son Marco is authorized (signed communication authorization 05/2026) and will drive her.' }
    ],
    tasks: [
        { date: '09/15/2026', staff: 'Paralegal', text: 'Serve responses to Defendant\'s RFP by 09/30/2026.' },
        { date: '09/15/2026', staff: 'Lead Attorney', text: 'Deposition prep with client 10/02/2026, 2:00 PM.' }
    ],
    reception: {
        verify: 'Linda Garcia · DOB 05/09/1961 · 2200 Pine Ridge Blvd Unit 14 or SSN last 4 (7702). Son Marco Garcia IS authorized (signed communication authorization 05/2026).',
        calls: [
            { from: 'Assistant to Richard Voss, Voss & Tate LLP (defense counsel)', ask: '"We need to move Ms. Garcia\'s deposition on the 6th. Can we do the 13th?"', handle: 'Court dates and depositions are never agreed at the front desk. Transfer to Janelle Price (paralegal, ext 221) or Atty. Brooks (ext 202); if unavailable, a priority message (the deposition is in 10 days). Log a Note.' },
            { from: 'Marco Garcia (son)', ask: '"What time do I need to bring my mom in on the 2nd?"', handle: 'Verify Marco (he is authorized). Deposition prep with Atty. Brooks: 10/02/2026 at 2:00 PM at our office. The deposition itself is 10/06 at 10:00 AM at defense counsel\'s office.' },
            { from: 'A process server', ask: '"I have papers for Atty. Brooks."', handle: 'Follow the office procedure for service: call the attorney or paralegal to the front desk; do not refuse or sign for anything you aren\'t authorized to accept. Log the time received.' }
        ]
    }
},
{
    id: 'MC-06', caseNumber: 'LSH-2025-MVA-900353', level: 'Intermediate', programs: ['reception', 'cm', 'ea', 'md'],
    summary: 'Settled and in disbursement. Client asks when his check is ready and wants his friend to pick it up.',
    client: { name: 'James Wilson', phone: '(555) 010-4962', email: 'jwilson.rvt@example.com', dob: '09/17/1983', ssn: 'XXX-XX-3390',
        address: '17 Birchwood Lane, Riverton, GA 30311',
        emergency: { name: 'Nadia Wilson', phone: '(555) 010-4963', relationship: 'Wife' },
        employment: { status: 'Employed', employer: 'Riverton Distribution Center', title: 'Forklift Operator' } },
    caseType: 'MVA', phase: 'Disbursement', attorney: 'Atty. Marcus Reyes', caseManager: 'Priya Natarajan',
    dateOfLoss: '01/12/2025', sol: '01/12/2027', target: '$ 42,000.00',
    narrative: 'Side-swipe on I-85 by a box truck changing lanes. Neck and shoulder soft-tissue injuries, 5 months of care. Settled 08/28/2026 for $42,000 (policy tender accepted by the client in writing).',
    injury: { primary: 'Neck and shoulder soft-tissue injuries', parts: 'Neck, shoulder', type: 'Soft tissue (sprain / strain)', details: 'Five months of chiropractic care; treatment complete.' },
    police: { agency: 'Georgia State Patrol', number: 'GSP-25-004471', officer: 'Tpr. A. Blake #611', narrative: 'Unit 2 (box truck, Quickline Logistics) changed lanes into Unit 1. Unit 2 cited: improper lane change.' },
    health: { carrier: 'Distribution Workers Health Fund', memberId: 'DWHF-221907', group: 'DWHF-09' },
    bi: [{ holder: 'Quickline Logistics Inc.', carrier: 'TransAmerica Freight Insurance', policy: 'TFI-AU-554019', claim: 'TFI-25-18820', adjuster: 'Carol Benning', contact: '(555) 010-7702', liability: 'Yes', limits: '$1,000,000' }],
    pipum: [],
    liens: [
        { type: 'HI Subro', entity: 'Distribution Workers Health Fund', file: 'DWHF-R-5520', amount: '$ 6,480.00' },
        { type: 'Medical Lien', entity: 'Align Chiropractic (LOP)', file: 'ALN-2291', amount: '$ 4,200.00' }
    ],
    facilities: [
        { name: 'Align Chiropractic', specialty: 'Chiro', phone: '(555) 010-3355', email: 'billing@alignchiro.example.com', dates: '01/20/2025 – 06/10/2025', status: 'Discharged', charges: '$ 5,600.00' }
    ],
    chrono: [],
    treatmentNotes: 'Treatment complete 06/10/2025.',
    pd: null, lit: null,
    finance: [
        { date: '09/03/2026', staff: 'Lien Negotiator', desc: 'Settlement check $42,000 deposited to trust (cleared 09/10/2026)', amount: '$ 0.00' },
        { date: '09/22/2026', staff: 'Lien Negotiator', desc: 'DWHF reduced to $4,320 (letter in file). Align Chiropractic reduction still pending.', amount: '$ 0.00' }
    ],
    docs: [
        { cat: 'Case Files', summary: 'Signed release (08/28/2026). Settlement statement DRAFT (not yet signed by client).' },
        { cat: 'Invoices', summary: 'DWHF reduction letter 09/22/2026 ($6,480 → $4,320).' }
    ],
    notes: [
        { date: '09/22/2026', staff: 'Lien Negotiator', text: 'Waiting on Align Chiropractic\'s written reduction. Once in, final settlement statement goes to the client to sign; check ready about 3 business days after he signs.' },
        { date: '09/24/2026', staff: 'Case Manager', text: 'Told client the check is NOT ready yet; we are waiting on one provider\'s reduction. Client prefers pickup at the office.' }
    ],
    tasks: [{ date: '09/22/2026', staff: 'Lien Negotiator', text: 'Follow up with Align Chiropractic billing (Dr. Sato) by 09/29/2026.' }],
    reception: {
        verify: 'James Wilson · DOB 09/17/1983 · 17 Birchwood Lane or SSN last 4 (3390).',
        calls: [
            { from: 'James Wilson (client)', ask: '"Is my check ready? I need it this week."', handle: 'Verify. Not yet: the firm is waiting on one provider\'s written lien reduction; then he signs the final settlement statement, and the check is ready about 3 business days later. Don\'t promise a date. Message Priya Natarajan (ext 311).' },
            { from: 'James Wilson (client)', ask: '"Can my buddy Troy pick up my check for me?"', handle: 'Not on the front desk\'s say-so. Checks are released only to the client with photo ID, unless the attorney approves a signed written authorization. Route to Accounting (ext 500) / Priya.' },
            { from: 'Align Chiropractic billing', ask: '"We\'re sending our reduction today. Who gets it?"', handle: 'Rosa Delgado, Lien Negotiator (ext 341). Give the firm fax/email for liens per office procedure and log a Note.' }
        ]
    }
},
{
    id: 'MC-07', caseNumber: 'LSH-2025-MVA-900857', level: 'Intermediate', programs: ['reception', 'cm', 'md'],
    summary: 'Rideshare passenger, UM demand. Client moved, changed numbers and is upset nobody calls back.',
    client: { name: 'Keisha Brown', phone: '(555) 010-5073', email: 'keisha.brown@example.com', dob: '12/01/1995', ssn: 'XXX-XX-5149',
        address: '640 Crescent Ave, Apt 22, Riverton, GA 30312',
        emergency: { name: 'Denise Brown', phone: '(555) 010-5074', relationship: 'Mother' },
        employment: { status: 'Employed', employer: 'Sunrise Senior Living', title: 'Certified Nursing Assistant' } },
    caseType: 'MVA', phase: 'UM or UIM Demanded', attorney: 'Atty. Marcus Reyes', caseManager: 'Luis Ortega',
    dateOfLoss: '10/04/2025', sol: '10/04/2027', target: '$ 85,000.00',
    narrative: 'Client was a rideshare passenger (RideNow) when a hit-and-run driver struck the car. Concussion and lumbar disc bulge. At-fault driver never identified; the claim is against RideNow\'s UM coverage and the client\'s own UM.',
    injury: { primary: 'Concussion and lumbar disc bulge', parts: 'Head, lower back', type: 'Head injury / concussion', details: 'Pain management; treated on a letter of protection (no health insurance).' },
    police: { agency: 'Riverton Police Department', number: 'RPD-25-100488', officer: 'Ofc. M. Ruiz #2098', narrative: 'Hit and run; suspect vehicle dark SUV, no plate obtained.' },
    health: { carrier: 'None', memberId: '', group: '' },
    bi: [],
    pipum: [
        { type: 'UM/UIM', holder: 'RideNow Technologies (rideshare policy)', carrier: 'Pinnacle Commercial Auto', policy: 'PCA-TNC-100227', claim: 'PCA-25-70142', adjuster: 'Howard Linn', contact: '(555) 010-7801', limits: '$1,000,000' },
        { type: 'UM/UIM', holder: 'Keisha Brown', carrier: 'Harbor Point Insurance', policy: 'HP-6612084', claim: 'HP-25-2213', adjuster: 'Irene Shaw', contact: '(555) 010-7811', limits: '$25,000 / $50,000' }
    ],
    liens: [{ type: 'Medical Lien', entity: 'Peak Spine Center (LOP)', file: 'PSC-7713', amount: '$ 11,450.00' }],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '10/04/2025 – 10/04/2025', status: 'Discharged', charges: '$ 6,200.00' },
        { name: 'Peak Spine Center', specialty: 'Pain Management', phone: '(555) 010-3270', email: 'lop@peakspine.example.com', dates: '11/01/2025 – 07/14/2026', status: 'Discharged', charges: '$ 11,450.00' }
    ],
    chrono: [],
    treatmentNotes: 'No health insurance; treated on a Letter of Protection.',
    pd: null, lit: null, finance: [],
    docs: [{ cat: 'Case Files', summary: 'UM demand to Pinnacle Commercial Auto sent 09/10/2026.' }],
    notes: [
        { date: '09/10/2026', staff: 'Case Manager', text: 'UM demand sent to Pinnacle. Follow-up in 30 days.' },
        { date: '09/18/2026', staff: 'Case Manager', text: 'Left voicemail for client at the number on file; mailbox full. Letter sent to the address on file.' }
    ],
    tasks: [{ date: '09/18/2026', staff: 'Case Manager', text: 'Reach client re: UM demand status and to confirm contact info.' }],
    reception: {
        verify: 'Keisha Brown · DOB 12/01/1995 · the address ON FILE (640 Crescent Ave Apt 22) or SSN last 4 (5149). If she says she moved, verify with the old address first, then take the new one.',
        calls: [
            { from: 'Keisha Brown (client)', ask: '"Nobody ever calls me back! I have a new phone number and I moved."', handle: 'Acknowledge the frustration without blaming the team. Verify with the address on file, then take the new phone and address, read them back, and send them to Luis Ortega (ext 314) as a priority message so the CMS is updated. The file shows Luis tried her old number on 09/18 (mailbox full).' },
            { from: 'Howard Linn, Pinnacle Commercial Auto', ask: '"I need Ms. Brown\'s new address for a check."', handle: 'Never give out client contact information. Route to Luis Ortega (ext 314) / Atty. Reyes (ext 201); settlement funds are always sent to the firm.' }
        ]
    }
},
{
    id: 'MC-08', caseNumber: 'LSH-2026-MOTO-901579', level: 'Intermediate', programs: ['reception', 'cm', 'pd', 'md'],
    summary: 'Motorcycle crash, surgery scheduled. Spanish-speaking client; his daughter is authorized.',
    client: { name: 'Tomás Rivera', phone: '(555) 010-5188', email: '', dob: '04/18/1964', ssn: 'XXX-XX-8043',
        address: '905 Mission Road, Riverton, GA 30314',
        emergency: { name: 'Daniela Rivera', phone: '(555) 010-5189', relationship: 'Daughter (authorized)' },
        employment: { status: 'Employed', employer: 'Rivera Landscaping', title: 'Landscaper' } },
    caseType: 'Others', caseTypeOther: 'Motorcycle', phase: 'Treating', attorney: 'Atty. Marcus Reyes', caseManager: 'Luis Ortega',
    dateOfLoss: '07/19/2026', sol: '07/19/2028', target: '',
    narrative: 'Client was riding his motorcycle when an SUV turned left in front of him (driver Brian Keller). Right tibia fracture; knee surgery scheduled. Client speaks Spanish; prefers Spanish. Daughter Daniela signed as authorized contact (communication authorization 07/24/2026).',
    injury: { primary: 'Right tibia fracture', parts: 'Right leg, knee', type: 'Fracture', surgery: 'Scheduled', details: 'Knee surgery scheduled 10/14/2026.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-26-071955', officer: 'Ofc. S. Grant #2310', narrative: 'Unit 2 (Keller) failed to yield while turning left. Cited.' },
    health: { carrier: 'None', memberId: '', group: '' },
    bi: [{ holder: 'Brian Keller', carrier: 'Keystone Mutual Insurance', policy: 'KM-9901442', claim: 'KM-26-121150', adjuster: 'Dana Whitfield', contact: '(555) 010-7702', liability: 'Yes', limits: '$100,000 / $300,000' }],
    pipum: [],
    liens: [],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '07/19/2026 – 07/22/2026', status: 'Discharged', charges: '$ 29,700.00' },
        { name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '08/05/2026 – present', status: 'Ongoing', charges: '$ 2,300.00' }
    ],
    chrono: [{ dos: ['09/16/2026'], facility: 'Riverton Orthopedic Associates', next: '10/14/2026 7:00 AM (surgery, Northside Surgery Center)', notes: 'Knee surgery scheduled 10/14/2026, arrive 7:00 AM. Pre-op labs 10/07.' }],
    treatmentNotes: 'Surgery 10/14/2026. Needs a ride; daughter is driving.',
    pd: { client: { year: '2018', make: 'Harley-Davidson', model: 'Street Glide', plate: 'GA-MC4471', owner: 'Tomás Rivera', driver: 'Tomás Rivera' },
        tp: { year: '2022', make: 'Chevrolet', model: 'Tahoe', plate: 'GA-KLR8820', owner: 'Brian Keller', driver: 'Brian Keller', insured: 'Yes', carrierPolicy: 'Keystone Mutual · KM-9901442', driverPhone: '(555) 010-7719', driverInsurer: 'Keystone Mutual Insurance' } },
    lit: null, finance: [],
    docs: [{ cat: 'Case Files', summary: 'Retainer (Spanish version) and communication authorization naming Daniela Rivera (07/24/2026).' }],
    notes: [
        { date: '07/24/2026', staff: 'Case Manager', text: 'Met client with daughter Daniela, who is authorized to discuss the case. Client prefers Spanish (Luis Ortega handles calls).' },
        { date: '09/16/2026', staff: 'Case Manager', text: 'Surgery set for 10/14/2026. Pre-op labs 10/07.' }
    ],
    tasks: [{ date: '09/16/2026', staff: 'Case Manager', text: 'Call client after surgery (10/15/2026).' }],
    reception: {
        verify: 'Tomás Rivera · DOB 04/18/1964 · 905 Mission Road or SSN last 4 (8043). Daughter Daniela Rivera IS authorized (communication authorization 07/24/2026).',
        calls: [
            { from: 'Caller speaking Spanish', ask: '"Hola, llamo por mi caso… Tomás Rivera."', handle: 'Transfer to Luis Ortega (bilingual CM, ext 314). If he\'s unavailable, use the firm\'s interpreter line or take a message with a callback number. Don\'t guess through a language barrier.' },
            { from: 'Daniela Rivera (daughter)', ask: '"When is my dad\'s surgery and what time do we need to be there?"', handle: 'Verify Daniela (authorized). Surgery 10/14/2026 at Northside Surgery Center, arrive 7:00 AM; pre-op labs 10/07. Suggest she confirm with the surgeon\'s office.' }
        ]
    }
},
{
    id: 'MC-09', caseNumber: 'LSH-2025-SNF-900593', level: 'Intermediate', programs: ['reception', 'cm', 'md'],
    summary: 'Restaurant slip and fall in negotiation. A provider threatens to send the bill to collections.',
    client: { name: 'Emily Nguyen', phone: '(555) 010-5291', email: 'emily.nguyen@example.com', dob: '02/26/1990', ssn: 'XXX-XX-0415',
        address: '71 Grove Street, Riverton, GA 30316',
        emergency: { name: 'Long Nguyen', phone: '(555) 010-5292', relationship: 'Father' },
        employment: { status: 'Employed', employer: 'Riverton Credit Union', title: 'Loan Officer' } },
    caseType: 'Slip and Fall', phase: 'BI Settlement Negotiations', attorney: 'Atty. Marcus Reyes', caseManager: 'Grace Kim',
    dateOfLoss: '03/15/2025', sol: '03/15/2027', target: '$ 55,000.00',
    narrative: 'Slipped on a wet floor near the kitchen doors at Bella Cucina (no mat, no sign). Knee injury (meniscus tear), treated conservatively and with an injection. Demand sent 07/2026; carrier offered $22,000 on 09/15; counter at $48,000 sent 09/19.',
    injury: { primary: 'Knee meniscus tear', parts: 'Knee', type: 'Joint / ligament / tendon tear', surgery: 'No', details: 'Treated conservatively and with an injection.' },
    police: { agency: 'None', number: 'Restaurant incident log 03/15/2025', officer: 'Manager Paolo Ricci', narrative: 'Manager noted the floor had just been mopped.' },
    health: { carrier: 'Credit Union Employees Health', memberId: 'CUEH-661043', group: 'CUEH-A' },
    bi: [{ holder: 'Bella Cucina LLC', carrier: 'Allied Retail Casualty', policy: 'ARC-GL-661178', claim: 'ARC-25-30551', adjuster: 'Brent Kowalski', contact: '(555) 010-7931', liability: 'Yes', limits: '$500,000' }],
    pipum: [],
    liens: [{ type: 'Medical Lien', entity: 'Premier Knee & Sports Medicine (LOP)', file: 'PKS-5530', amount: '$ 7,850.00' }],
    facilities: [{ name: 'Premier Knee & Sports Medicine', specialty: 'Ortho', phone: '(555) 010-3288', email: 'billing@premierknee.example.com', dates: '03/20/2025 – 01/10/2026', status: 'Discharged', charges: '$ 7,850.00' }],
    chrono: [],
    treatmentNotes: 'Treated under a Letter of Protection signed 03/18/2025; provider agreed to wait for settlement.',
    pd: null, lit: null, finance: [],
    docs: [{ cat: 'Case Files', summary: 'Letter of Protection to Premier Knee & Sports Medicine (03/18/2025). Offer $22,000 (09/15/2026); counter $48,000 (09/19/2026).' }],
    notes: [
        { date: '09/19/2026', staff: 'Case Manager', text: 'Counter at $48,000 sent with attorney approval. Client informed.' },
        { date: '09/24/2026', staff: 'Case Manager', text: 'Client received a statement from Premier Knee with "final notice" wording. Called their billing office to remind them of the LOP.' }
    ],
    tasks: [{ date: '09/24/2026', staff: 'Lien Negotiator', text: 'Send Premier Knee a copy of the LOP and a case status letter.' }],
    reception: {
        verify: 'Emily Nguyen · DOB 02/26/1990 · 71 Grove Street or SSN last 4 (0415).',
        calls: [
            { from: 'Premier Knee & Sports Medicine billing', ask: '"If we don\'t get paid by the 30th this goes to collections."', handle: 'Stay calm; don\'t argue or promise payment. There is a Letter of Protection on file. Route to Rosa Delgado (Lien Negotiator, ext 341) or Grace Kim (ext 313) as a priority message, and log it.' },
            { from: 'Emily Nguyen (client)', ask: '"Did they accept our counteroffer?"', handle: 'Verify. Status: the counter was sent 09/19 and no response is noted yet. Message to Grace Kim (ext 313) for an update. No opinions on the numbers.' }
        ]
    }
},
{
    id: 'MC-10', caseNumber: 'LSH-2026-DOG-901315', level: 'Advanced', programs: ['reception', 'cm', 'md'],
    summary: 'Child dog-bite victim. The parent on file is the guardian; the other parent and the school are not.',
    client: { name: 'Sofia Morales (minor), by her father Frank Morales', phone: '(555) 010-5305', email: 'frank.morales@example.com', dob: '06/02/2018', ssn: 'XXX-XX-2718',
        address: '14 Orchard Lane, Riverton, GA 30318',
        emergency: { name: 'Frank Morales', phone: '(555) 010-5305', relationship: 'Father / legal guardian (client contact)' },
        employment: { status: 'Unemployed', employer: '', title: 'Student (age 8)' } },
    caseType: 'Dog Bite', phase: 'Treating', attorney: 'Atty. Marcus Reyes', caseManager: 'Priya Natarajan',
    dateOfLoss: '05/30/2026', sol: '06/02/2038', target: '',
    narrative: 'Sofia (8) was bitten on the face by a neighbor\'s dog at a birthday party. Facial lacerations; plastic surgery follow-up. Retainer signed by her father Frank Morales, who has primary custody. The file says: do not share information with the mother (Angela Ruiz) unless Frank authorizes it in writing. SOL for a minor runs from her 18th birthday (confirm the state rule with the attorney).',
    injury: { primary: 'Facial lacerations from a dog bite', parts: 'Face', type: 'Laceration / bite / scarring', details: 'Plastic surgery follow-up. Child counseling referral pending (nightmares).' },
    police: { agency: 'Riverton County Animal Control', number: 'AC-26-01140', officer: 'Officer Linda Moss #88', narrative: 'Dog quarantined; owner Paula Stevens.' },
    health: { carrier: 'PeachCare for Kids (CHIP)', memberId: 'PCK-00931442', group: '—' },
    bi: [{ holder: 'Paula Stevens', carrier: 'Homestead Fire & Casualty', policy: 'HFC-HO-5520931', claim: 'HFC-26-05512', adjuster: 'Monica Reyes-Hart', contact: '(555) 010-7640', liability: 'Pending', limits: '$500,000' }],
    pipum: [],
    liens: [{ type: 'HI Subro', entity: 'PeachCare for Kids (Medicaid/CHIP)', file: 'PCK-TPL-2291', amount: '$ 2,980.00' }],
    facilities: [
        { name: 'Children\'s Hospital of Riverton', specialty: 'Emergency Hospital', phone: '(555) 010-3120', email: 'him@childrensriverton.example.com', dates: '05/30/2026 – 05/30/2026', status: 'Discharged', charges: '$ 6,940.00' },
        { name: 'Lakeside Plastic Surgery', specialty: 'Other', specialtyOther: 'Plastic Surgery', phone: '(555) 010-3220', email: 'office@lakesideplastics.example.com', dates: '06/15/2026 – present', status: 'Ongoing', charges: '$ 1,200.00' }
    ],
    chrono: [{ dos: ['09/08/2026'], facility: 'Lakeside Plastic Surgery', next: '11/10/2026 3:30 PM', notes: 'Scar healing; laser treatment to be discussed in November.' }],
    treatmentNotes: 'Child counseling referral pending (nightmares).',
    pd: null, lit: null, finance: [],
    docs: [{ cat: 'Case Files', summary: 'Retainer signed by Frank Morales as parent/guardian. Custody order copy (father primary custody). Instruction: no disclosure to Angela Ruiz without Frank\'s written authorization.' }],
    notes: [
        { date: '06/05/2026', staff: 'Intake Specialist', text: 'Retainer signed by father. Mother Angela Ruiz NOT authorized per client instruction and custody order.' },
        { date: '09/08/2026', staff: 'Case Manager', text: 'Plastic surgeon follow-up 11/10/2026 at 3:30 PM.' }
    ],
    tasks: [{ date: '09/08/2026', staff: 'Case Manager', text: 'Confirm counseling referral with Frank by 10/05/2026.' }],
    reception: {
        verify: 'Client contact is Frank Morales (father/guardian). Verify with Sofia\'s name and DOB (06/02/2018) plus Frank\'s address (14 Orchard Lane). Angela Ruiz (mother) and anyone else are NOT authorized.',
        calls: [
            { from: 'Angela Ruiz (Sofia\'s mother)', ask: '"I\'m her mother, I have a right to know what\'s happening with my daughter\'s case."', handle: 'Be respectful and don\'t argue custody. Per the file, you cannot share information. Offer to take a message for Atty. Reyes (ext 201). Don\'t confirm or deny details. Log the call.' },
            { from: 'School counselor', ask: '"We\'re worried about Sofia. Can you tell us what happened with the lawsuit?"', handle: 'No disclosure; not even that the firm represents her. Take a message and pass it to Priya Natarajan (ext 311).' },
            { from: 'Frank Morales (father)', ask: '"When is Sofia\'s next plastic surgeon appointment?"', handle: 'Verify. Lakeside Plastic Surgery, 11/10/2026 at 3:30 PM.' }
        ]
    }
},
{
    id: 'MC-11', caseNumber: 'LSH-2025-MVA-900639', level: 'Intermediate', programs: ['reception', 'cm', 'md'],
    summary: 'MVA in lien negotiations. The hospital lien department calls about a reduction.',
    client: { name: 'Ngozi Okonkwo', phone: '(555) 010-5412', email: 'ngozi.o@example.com', dob: '10/10/1979', ssn: 'XXX-XX-6254',
        address: '480 Summit Terrace, Riverton, GA 30320',
        emergency: { name: 'Chidi Okonkwo', phone: '(555) 010-5413', relationship: 'Husband' },
        employment: { status: 'Employed', employer: 'Riverton General Hospital', title: 'Registered Nurse' } },
    caseType: 'MVA', phase: 'BI Settled', attorney: 'Atty. Marcus Reyes', caseManager: 'Tom Alvarez',
    dateOfLoss: '04/02/2025', sol: '04/02/2027', target: '$ 90,000.00',
    narrative: 'T-bone collision at Summit and 3rd; other driver ran a red light. Wrist fracture and a concussion. Settled 09/05/2026 for $90,000. Liens being negotiated before disbursement.',
    injury: { primary: 'Wrist fracture and a concussion', parts: 'Wrist, head', type: 'Fracture' },
    police: { agency: 'Riverton Police Department', number: 'RPD-25-040211', officer: 'Ofc. D. Lowe #1777', narrative: 'Unit 2 ran the red light (two witnesses). Cited.' },
    health: { carrier: 'Anthem Blue Shield (ERISA plan)', memberId: 'ABS-99210044', group: 'RGH-EMP' },
    bi: [{ holder: 'Victor Lang', carrier: 'Liberty Crest Insurance', policy: 'LC-4410988', claim: 'LC-25-66019', adjuster: 'Greg Hollis', contact: '(555) 010-7755', liability: 'Yes', limits: '$100,000 / $300,000' }],
    pipum: [],
    liens: [
        { type: 'Medical Lien', entity: 'Riverton General Hospital (hospital lien)', file: 'RGH-HL-26-118', amount: '$ 14,600.00' },
        { type: 'HI Subro', entity: 'Anthem Blue Shield (ERISA)', file: 'ABS-SUB-77120', amount: '$ 9,215.00' }
    ],
    facilities: [{ name: 'Riverton General Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3130', email: 'liens@rgh.example.com', dates: '04/02/2025 – 04/04/2025', status: 'Discharged', charges: '$ 14,600.00' }],
    chrono: [],
    treatmentNotes: '',
    pd: null, lit: null,
    finance: [{ date: '09/12/2026', staff: 'Lien Negotiator', desc: 'Settlement check $90,000 deposited to trust', amount: '$ 0.00' }],
    docs: [{ cat: 'Case Files', summary: 'Release signed 09/05/2026. Reduction request to Riverton General sent 09/15/2026 (asked for $9,000).' }],
    notes: [{ date: '09/15/2026', staff: 'Lien Negotiator', text: 'Requested hospital lien reduction to $9,000 (from $14,600). Awaiting response. ERISA plan documents requested.' }],
    tasks: [{ date: '09/15/2026', staff: 'Lien Negotiator', text: 'Follow up with RGH lien dept by 10/01/2026.' }],
    reception: {
        verify: 'Ngozi Okonkwo · DOB 10/10/1979 · 480 Summit Terrace or SSN last 4 (6254).',
        calls: [
            { from: 'Riverton General Hospital lien department', ask: '"We can do $11,000 on the Okonkwo lien. Can you confirm that works?"', handle: 'Don\'t confirm or negotiate. Transfer to Rosa Delgado (Lien Negotiator, ext 341) or take a detailed message: the amount offered, their file number (RGH-HL-26-118) and a direct number.' },
            { from: 'Ngozi Okonkwo (client)', ask: '"I work at that hospital, can I just go talk to the billing office myself?"', handle: 'No legal advice. Tell her you\'ll have Rosa Delgado or Tom Alvarez call her back before she does anything; mark the message priority.' }
        ]
    }
},
{
    id: 'MC-12', caseNumber: 'LSH-2026-MVA-902051', level: 'Starter', programs: ['reception', 'cm', 'intake', 'pd', 'md'],
    summary: 'Early investigation. The body shop is charging storage and the client wants a rental car.',
    client: { name: 'William Harris', phone: '(555) 010-5520', email: 'will.harris@example.com', dob: '08/08/1958', ssn: 'XXX-XX-9136',
        address: '3 Colonial Drive, Riverton, GA 30322',
        emergency: { name: 'Beverly Harris', phone: '(555) 010-5521', relationship: 'Wife' },
        employment: { status: 'Retired', employer: '', title: 'Retired postal carrier' } },
    caseType: 'MVA', phase: 'Intake', attorney: 'Atty. David Okafor', caseManager: 'Grace Kim',
    dateOfLoss: '09/14/2026', sol: '09/14/2028', target: '',
    narrative: 'Client\'s parked car was hit, and he was clipped while loading groceries, by a driver backing out (Stacy Owens). Hip and hand bruising. The police report is pending. The car was towed to Parkway Collision; storage is $45/day starting 09/21.',
    injury: { primary: 'Hip and hand bruising', parts: 'Hip, hand', type: 'Soft tissue (sprain / strain)' },
    police: { agency: 'Riverton Police Department', number: 'RPD-26-091488 (report pending)', officer: 'Ofc. K. Dunn #2402', narrative: 'Report not yet available (requested 09/16/2026).' },
    health: { carrier: 'Medicare Advantage (Humana Gold Plus)', memberId: 'HUM-H5216-4471', group: '—' },
    bi: [{ holder: 'Stacy Owens', carrier: 'Keystone Mutual Insurance', policy: 'KM-5520881', claim: 'KM-26-133002', adjuster: 'Not yet assigned', contact: '(555) 010-7700 (claims line)', liability: 'Pending', limits: 'Unknown' }],
    pipum: [],
    liens: [],
    facilities: [{ name: 'QuickCare Urgent Care', specialty: 'EMC', phone: '(555) 010-3301', email: 'records@quickcare.example.com', dates: '09/15/2026 – 09/15/2026', status: 'Discharged', charges: '$ 410.00' }],
    chrono: [],
    treatmentNotes: '',
    pd: { client: { year: '2017', make: 'Buick', model: 'LaCrosse', plate: 'GA-HRS0808', owner: 'William Harris', driver: 'William Harris' },
        tp: { year: '2023', make: 'Kia', model: 'Sorento', plate: 'GA-OWN3321', owner: 'Stacy Owens', driver: 'Stacy Owens', insured: 'Yes', carrierPolicy: 'Keystone Mutual · KM-5520881', driverPhone: '(555) 010-7725', driverInsurer: 'Keystone Mutual Insurance' } },
    lit: null, finance: [],
    docs: [{ cat: 'Property Damage', summary: 'Tow receipt: Parkway Collision, (555) 010-6610. Storage $45/day from 09/21/2026.' }],
    notes: [
        { date: '09/16/2026', staff: 'Case Manager', text: 'Police report requested. PD claim opened with Keystone (KM-26-133002); waiting on a PD adjuster. Kevin Lam (PD) is handling the car.' },
        { date: '09/16/2026', staff: 'Case Manager', text: 'Client asked about a rental car; told him Kevin Lam will follow up once the PD adjuster accepts liability.' }
    ],
    tasks: [{ date: '09/16/2026', staff: 'PD Specialist', text: 'Get the PD adjuster assigned; move the car out of storage.' }],
    reception: {
        verify: 'William Harris · DOB 08/08/1958 · 3 Colonial Drive or SSN last 4 (9136).',
        calls: [
            { from: 'Parkway Collision', ask: '"Mr. Harris\'s car has been here a week at $45 a day. Who\'s paying?"', handle: 'Route to Kevin Lam (PD Specialist, ext 351) as a priority message: storage keeps adding up. Don\'t promise payment.' },
            { from: 'William Harris (client)', ask: '"When do I get a rental car?"', handle: 'Verify. Status: waiting for the at-fault carrier to assign a PD adjuster; Kevin Lam (ext 351) is handling it. Message Kevin.' }
        ]
    }
},
{
    id: 'MC-13', caseNumber: 'LSH-2026-PRL-902184', level: 'Advanced', programs: ['reception', 'intake', 'cm', 'md'],
    summary: 'Potential client with the statute of limitations weeks away. Urgent routing, no advice.',
    client: { name: 'Nicole Adams', phone: '(555) 010-5634', email: 'nicole.adams@example.com', dob: '03/03/1984', ssn: 'XXX-XX-4470',
        address: '1520 Lakeshore Blvd, Riverton, GA 30324',
        emergency: { name: 'Jordan Adams', phone: '(555) 010-5635', relationship: 'Spouse' },
        employment: { status: 'Employed', employer: 'Lakeshore Realty', title: 'Real Estate Agent' } },
    caseType: 'Premise Liability', phase: 'Intake', attorney: 'Atty. David Okafor', caseManager: '',
    dateOfLoss: '10/20/2024', sol: '10/20/2026', target: '',
    narrative: 'Boxed patio heaters fell from a top shelf at HomeMax (Route 12) onto the client\'s shoulder and head. Rotator cuff strain and concussion symptoms. She handled it herself with the store\'s insurer for a year and it stalled. Called the firm 09/24/2026. STATUTE OF LIMITATIONS 10/20/2026: flagged URGENT for attorney review.',
    injury: { primary: 'Rotator cuff strain and concussion symptoms', parts: 'Shoulder, head', type: 'Soft tissue (sprain / strain)' },
    police: { agency: 'None', number: 'HomeMax incident report HM-12-1020', officer: 'Asst. manager Rick Tully', narrative: 'Merchandise fell from an overhead shelf.' },
    health: { carrier: 'Blue Horizon PPO', memberId: 'BHP-3301928', group: 'LKR-11' },
    bi: [{ holder: 'HomeMax Stores Inc.', carrier: 'National Claims Services (TPA)', policy: 'Self-insured', claim: 'NCS-24-889120', adjuster: 'Pam Ortiz', contact: '(555) 010-7955', liability: 'Pending', limits: 'Unknown' }],
    pipum: [], liens: [],
    facilities: [{ name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '10/28/2024 – 04/15/2025', status: 'Discharged', charges: '$ 5,300.00' }],
    chrono: [], treatmentNotes: '',
    pd: null, lit: null, finance: [],
    docs: [{ cat: 'Case Files', summary: 'Intake questionnaire 09/24/2026. Conflict check pending. Store adjuster emails (client forwarded).' }],
    notes: [{ date: '09/24/2026', staff: 'Intake Specialist', text: 'URGENT: SOL 10/20/2026. Sent to Atty. Okafor same day. Conflict check on HomeMax Stores Inc. in progress. Client told a decision is coming; no promise of representation.' }],
    tasks: [{ date: '09/24/2026', staff: 'Associate Attorney', text: 'Accept/decline decision by 09/30/2026 (SOL 10/20/2026). If declined, send a non-engagement letter that states the SOL date.' }],
    reception: {
        verify: 'Nicole Adams · DOB 03/03/1984 · 1520 Lakeshore Blvd or SSN last 4 (4470).',
        calls: [
            { from: 'Nicole Adams (potential client)', ask: '"Is it too late for me to sue? The store\'s adjuster says I have plenty of time."', handle: 'Never answer deadline or SOL questions. Treat as urgent: transfer to Atty. David Okafor (ext 203) or Intake (ext 100) now; if no one is available, a priority message with her best number. Log it.' },
            { from: 'Pam Ortiz, National Claims Services', ask: '"Is Ms. Adams represented by your firm?"', handle: 'She is not a client yet (retainer not signed). Don\'t confirm or deny; take a message for Atty. Okafor.' }
        ]
    }
},
{
    id: 'MC-14', caseNumber: 'LSH-2025-MVA-900470', level: 'Advanced', programs: ['reception', 'cm', 'ea', 'md'],
    summary: 'Commercial-truck case in litigation. A reporter calls; the workers\' comp carrier asserts a lien.',
    client: { name: 'Carlos Mendoza', phone: '(555) 010-5745', email: 'cmendoza@example.com', dob: '12/19/1977', ssn: 'XXX-XX-3862',
        address: '250 Ironwood Street, Riverton, GA 30326',
        emergency: { name: 'Lucia Mendoza', phone: '(555) 010-5746', relationship: 'Wife' },
        employment: { status: 'Unemployed', employer: 'Formerly Summit Electrical Contractors', title: 'Electrician (on disability)' } },
    caseType: 'MVA', phase: 'Litigation Discovery', attorney: 'Atty. Elena Brooks', caseManager: 'Luis Ortega',
    dateOfLoss: '02/11/2025', sol: '02/11/2027', target: '$ 750,000.00',
    narrative: 'Client was driving his work van when a tractor-trailer (Redline Freight, driver Mark Toller) rear-ended him in stopped traffic on I-75. Cervical fusion (C5-C6). Workers\' compensation paid benefits (client was on the job). Suit filed 01/06/2026 (Mendoza v. Redline Freight LLC and Toller, Riverton County Superior Court, No. 26-CV-00412). Local news covered the crash.',
    injury: { primary: 'Cervical disc injury (C5-C6)', parts: 'Neck', type: 'Spine / disc', surgery: 'Completed', details: 'Cervical fusion C5-C6. Permanent restrictions; cannot return to electrical work.' },
    police: { agency: 'Georgia State Patrol', number: 'GSP-25-001109', officer: 'Tpr. R. Coombs #402', narrative: 'Commercial vehicle failed to slow for stopped traffic. Driver log violations noted.' },
    health: { carrier: 'Workers\' comp primary (see lien)', memberId: '', group: '' },
    bi: [{ holder: 'Redline Freight LLC', carrier: 'TransAmerica Freight Insurance', policy: 'TFI-AU-771020', claim: 'TFI-25-20911', adjuster: 'Carol Benning', contact: '(555) 010-7702', liability: 'No', limits: '$2,000,000' }],
    pipum: [],
    liens: [{ type: 'Other', typeOther: 'Workers\' Comp Lien', entity: 'Granite State Workers\' Comp', file: 'GSWC-25-4412', amount: '$ 96,870.00' }],
    facilities: [
        { name: 'Riverton Neurosurgery', specialty: 'Surgery', phone: '(555) 010-3199', email: 'office@riverneuro.example.com', dates: '03/2025 – present', status: 'Ongoing', charges: '$ 88,400.00' }
    ],
    chrono: [],
    treatmentNotes: 'Permanent restrictions; cannot return to electrical work.',
    pd: null,
    lit: { sol: '02/11/2027', filed: '01/06/2026', cutoff: '11/30/2026', trial: '03/08/2027',
        rows: [
            { type: 'Deposition Notice', party: 'Defendant driver Mark Toller: 10/09/2026, 9:30 AM', due: '10/09/2026', status: 'Pending' },
            { type: 'Subpoena', party: 'Redline Freight driver logs and ELD data', due: '10/20/2026', status: 'Pending' }
        ] },
    finance: [{ date: '01/06/2026', staff: 'Paralegal', desc: 'Filing fee', amount: '$ 214.00' }],
    docs: [{ cat: 'Litigation Documents', summary: 'Complaint, Answer, scheduling order (discovery cut-off 11/30/2026; trial 03/08/2027).' }],
    notes: [
        { date: '09/10/2026', staff: 'Lead Attorney', text: 'No media comment on this case. All press inquiries to Atty. Brooks only.' },
        { date: '09/20/2026', staff: 'Case Manager', text: 'Workers\' comp carrier asked for a case status; referred to Atty. Brooks.' }
    ],
    tasks: [{ date: '09/20/2026', staff: 'Paralegal', text: 'Prepare the Toller deposition outline by 10/05/2026.' }],
    reception: {
        verify: 'Carlos Mendoza · DOB 12/19/1977 · 250 Ironwood Street or SSN last 4 (3862).',
        calls: [
            { from: 'Reporter, Channel 8 News', ask: '"We\'re following up on the Redline Freight crash. Can you confirm the firm represents Mr. Mendoza and the trial date?"', handle: '"We have no comment. I can take your name and number for the attorney." Message Atty. Brooks (ext 202) per the 09/10 file note. Confirm nothing, not even representation or dates.' },
            { from: 'Granite State Workers\' Comp', ask: '"We need to confirm our lien will be protected in any settlement."', handle: 'Route to Atty. Brooks (ext 202) / Luis Ortega (ext 314) with the lien file number (GSWC-25-4412). No comment on settlement.' }
        ]
    }
},
{
    id: 'MC-15', caseNumber: 'LSH-2026-MVA-901688', level: 'Intermediate', programs: ['reception', 'cm', 'ea', 'md'],
    summary: 'Elderly pedestrian in treatment. Her son holds a power of attorney; she is worried about "a lawyer bill".',
    client: { name: 'Patricia Lewis', phone: '(555) 010-5850', email: '', dob: '01/14/1946', ssn: 'XXX-XX-1507',
        address: '12 Heritage Way, Riverton, GA 30328',
        emergency: { name: 'Michael Lewis', phone: '(555) 010-5851', relationship: 'Son (durable power of attorney)' },
        employment: { status: 'Retired', employer: '', title: 'Retired' } },
    caseType: 'MVA', phase: 'Treating', attorney: 'Atty. Marcus Reyes', caseManager: 'Priya Natarajan',
    dateOfLoss: '08/03/2026', sol: '08/03/2028', target: '',
    narrative: 'Client (80) was hit by a reversing SUV in the Riverton Plaza parking lot while walking to her car. Pelvic fracture; rehab facility stay, now home with home-health visits. Hard of hearing: speak slowly and clearly. Son Michael holds a durable power of attorney (copy in file) and is authorized.',
    injury: { primary: 'Pelvic fracture', parts: 'Pelvis', type: 'Fracture', details: 'Rehab facility stay; now home with home-health visits.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-26-080331', officer: 'Ofc. P. Nair #2255', narrative: 'Driver (Heather Coyle) reversing, did not see pedestrian. Cited for unsafe backing.' },
    health: { carrier: 'Medicare (Part A & B) + AARP Medigap Plan G', memberId: 'MBI 5TR2-QW1-LK38', group: '—' },
    bi: [{ holder: 'Heather Coyle', carrier: 'Harbor Point Insurance', policy: 'HP-3308812', claim: 'HP-26-8810', adjuster: 'Irene Shaw', contact: '(555) 010-7811', liability: 'Yes', limits: '$250,000 / $500,000' }],
    pipum: [],
    liens: [{ type: 'Medical Lien', entity: 'Medicare (BCRC)', file: 'Case ID 26-0803-5521 (conditional payment amount pending)', amount: '' }],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '08/03/2026 – 08/07/2026', status: 'Discharged', charges: '$ 31,200.00' },
        { name: 'Heritage Rehabilitation Center', specialty: 'Other', specialtyOther: 'Inpatient Rehab', phone: '(555) 010-3410', email: 'admissions@heritagerehab.example.com', dates: '08/07/2026 – 08/28/2026', status: 'Discharged', charges: '$ 18,900.00' },
        { name: 'CareFirst Home Health', specialty: 'Other', specialtyOther: 'Home Health', phone: '(555) 010-3450', email: 'scheduling@carefirsthh.example.com', dates: '08/29/2026 – present', status: 'Ongoing', charges: '$ 2,400.00' }
    ],
    chrono: [{ dos: ['09/23/2026'], facility: 'CareFirst Home Health', next: '09/30/2026 (PT home visit, morning)', notes: 'Home PT 2x/week; walker.' }],
    treatmentNotes: 'Medicare conditional payment amount not yet received (letter requested 09/01/2026).',
    pd: null, lit: null, finance: [],
    docs: [{ cat: 'Case Files', summary: 'Contingency-fee retainer (no fee unless recovery). Durable POA naming Michael Lewis.' }],
    notes: [
        { date: '08/10/2026', staff: 'Case Manager', text: 'Met client and son Michael (POA, authorized). Client is hard of hearing: speak slowly; she prefers calls in the afternoon.' },
        { date: '09/23/2026', staff: 'Case Manager', text: 'Home PT continuing. Son asked about extra home-health aide hours; checking with the provider and the attorney.' }
    ],
    tasks: [{ date: '09/23/2026', staff: 'Case Manager', text: 'Call Michael Lewis re: home-health aide hours by 09/30/2026.' }],
    reception: {
        verify: 'Patricia Lewis · DOB 01/14/1946 · 12 Heritage Way or SSN last 4 (1507). Son Michael Lewis IS authorized (durable POA).',
        calls: [
            { from: 'Patricia Lewis (client)', ask: '"I got a letter… am I supposed to pay the lawyer now? I can\'t afford it."', handle: 'Verify gently; speak slowly and clearly. Reassure without advising: the file shows a contingency retainer (no fee unless there is a recovery). If the letter is from someone else (e.g. Medicare or a provider), ask her to send a copy or have Michael bring it; message Priya Natarajan (ext 311).' },
            { from: 'Michael Lewis (son, POA)', ask: '"Any update on getting Mom more home-health hours?"', handle: 'Verify Michael (authorized). The CM is checking with the provider and the attorney; follow-up is due by 09/30. Message Priya (ext 311).' }
        ]
    }
},
{
    id: 'MC-16', caseNumber: 'LSH-2025-MVA-901053', level: 'Advanced', programs: ['reception', 'cm', 'ea', 'md'],
    summary: 'Client says she is changing lawyers. Her new firm calls for the file.',
    client: { name: 'Hannah Pierce', phone: '(555) 010-5961', email: 'hannah.pierce@example.com', dob: '06/25/1987', ssn: 'XXX-XX-8820',
        address: '77 Cedar Hollow Rd, Riverton, GA 30330',
        emergency: { name: 'Owen Pierce', phone: '(555) 010-5962', relationship: 'Husband' },
        employment: { status: 'Employed', employer: 'Riverton Fitness Club', title: 'Personal Trainer' } },
    caseType: 'MVA', phase: 'Pending Demand', attorney: 'Atty. Marcus Reyes', caseManager: 'Tom Alvarez',
    dateOfLoss: '12/09/2025', sol: '12/09/2027', target: '$ 60,000.00',
    narrative: 'Rear-end collision on Highway 20. Lumbar strain and a torn labrum (hip). Treatment finished 08/2026; demand in preparation. Client emailed 09/23 unhappy with communication and said she "might go elsewhere."',
    injury: { primary: 'Torn hip labrum and lumbar strain', parts: 'Hip, lower back', type: 'Joint / ligament / tendon tear', details: 'Treatment finished 08/2026.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-25-120933', officer: 'Ofc. B. Ames #2140', narrative: 'Unit 2 (Jared Fox) failed to stop; cited.' },
    health: { carrier: 'Fitness Industry Health Plan', memberId: 'FIHP-448120', group: 'RFC-2' },
    bi: [{ holder: 'Jared Fox', carrier: 'Keystone Mutual Insurance', policy: 'KM-7710340', claim: 'KM-25-140882', adjuster: 'Dana Whitfield', contact: '(555) 010-7702', liability: 'Yes', limits: '$100,000 / $300,000' }],
    pipum: [],
    liens: [{ type: 'HI Subro', entity: 'Fitness Industry Health Plan', file: 'FIHP-S-2210', amount: '$ 12,330.00' }],
    facilities: [{ name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '12/15/2025 – 08/20/2026', status: 'Discharged', charges: '$ 16,780.00' }],
    chrono: [], treatmentNotes: '',
    pd: null, lit: null,
    finance: [{ date: '03/02/2026', staff: 'Records Specialist', desc: 'Records fees', amount: '$ 64.00' }],
    docs: [{ cat: 'Case Files', summary: 'Client email 09/23/2026 (unhappy with communication). Attorney called her back 09/24; no decision yet.' }],
    notes: [
        { date: '09/23/2026', staff: 'Case Manager', text: 'Client unhappy: says she waited 2 weeks for a callback. Escalated to Atty. Reyes.' },
        { date: '09/24/2026', staff: 'Lead Attorney', text: 'Spoke with client. She is thinking about it. Any substitution or file request: route to me directly.' }
    ],
    tasks: [{ date: '09/24/2026', staff: 'Case Manager', text: 'Weekly check-in call with client every Friday until the demand goes out.' }],
    reception: {
        verify: 'Hannah Pierce · DOB 06/25/1987 · 77 Cedar Hollow Rd or SSN last 4 (8820).',
        calls: [
            { from: 'Office of Atty. Sarah Klein (another firm)', ask: '"We now represent Hannah Pierce. Please send us her complete file today."', handle: 'Polite and neutral. Never release a file on a phone call. Ask them to send the signed client authorization / substitution in writing, and route to Atty. Reyes (ext 201) per the 09/24 file note. Log the call.' },
            { from: 'Hannah Pierce (client)', ask: '"I want my file. And honestly nobody here ever calls me back."', handle: 'Verify. Listen, acknowledge, don\'t argue or defend. Don\'t promise the file. Transfer to Atty. Reyes (ext 201) or take a priority message. Log it.' }
        ]
    }
},
{
    id: 'MC-17', caseNumber: 'LSH-2026-BICY-901803', level: 'Starter', programs: ['reception', 'cm', 'md'],
    summary: 'Cyclist "doored" by a parked car. Client wants to know about replacing his bike.',
    client: { name: 'Andre Coleman', phone: '(555) 010-6071', email: 'andre.coleman@example.com', dob: '09/03/1991', ssn: 'XXX-XX-5582',
        address: '19 Riverside Walk, Apt 7, Riverton, GA 30332',
        emergency: { name: 'Tasha Coleman', phone: '(555) 010-6072', relationship: 'Sister' },
        employment: { status: 'Employed', employer: 'Quickbite Couriers', title: 'Bike Courier' } },
    caseType: 'Others', caseTypeOther: 'Bicycle', phase: 'Treating', attorney: 'Atty. David Okafor', caseManager: 'Grace Kim',
    dateOfLoss: '08/21/2026', sol: '08/21/2028', target: '',
    narrative: 'Client was riding in the bike lane on Main St when a parked driver (Leslie Tran) opened her door into his path. Broken collarbone and road rash. His $2,400 bicycle was destroyed; it is his work bike.',
    injury: { primary: 'Broken collarbone', parts: 'Collarbone, skin', type: 'Fracture', details: 'Road rash. Off work (courier) until cleared.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-26-082110', officer: 'Ofc. H. Moreno #2366', narrative: 'Driver opened door into bicycle lane without looking. Driver cited.' },
    health: { carrier: 'None', memberId: '', group: '' },
    bi: [{ holder: 'Leslie Tran', carrier: 'Harbor Point Insurance', policy: 'HP-9910233', claim: 'HP-26-9021', adjuster: 'Irene Shaw', contact: '(555) 010-7811', liability: 'Yes', limits: '$50,000 / $100,000' }],
    pipum: [], liens: [],
    facilities: [{ name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '08/22/2026 – present', status: 'Ongoing', charges: '$ 3,150.00' }],
    chrono: [{ dos: ['09/18/2026'], facility: 'Riverton Orthopedic Associates', next: '10/16/2026 11:00 AM', notes: 'Collarbone healing; no riding for 4 more weeks.' }],
    treatmentNotes: 'Off work (courier) until cleared.',
    pd: null, lit: null, finance: [],
    docs: [{ cat: 'Property Damage', summary: 'Receipt for the destroyed bicycle ($2,400) and photos. PD claim with Harbor Point opened 09/02/2026 (Kevin Lam).' }],
    notes: [{ date: '09/02/2026', staff: 'PD Specialist', text: 'Bike PD claim submitted to Harbor Point with the receipt. Waiting on the PD adjuster\'s valuation.' }],
    tasks: [{ date: '09/02/2026', staff: 'PD Specialist', text: 'Follow up on the bicycle valuation by 10/02/2026.' }],
    reception: {
        verify: 'Andre Coleman · DOB 09/03/1991 · 19 Riverside Walk Apt 7 or SSN last 4 (5582).',
        calls: [{ from: 'Andre Coleman (client)', ask: '"When do I get money for my bike? I can\'t work without it."', handle: 'Verify. The bike claim is with the at-fault carrier; Kevin Lam (PD, ext 351) is waiting on their valuation. Priority message to Kevin (he can\'t work). No promises on amount or date.' }]
    }
},
{
    id: 'MC-18', caseNumber: 'LSH-2026-PROD-901476', level: 'Advanced', programs: ['reception', 'cm', 'md'],
    summary: 'Pressure-cooker burn (product liability). The manufacturer\'s insurer wants to pick up the cooker.',
    client: { name: 'Rachel Donovan', phone: '(555) 010-6183', email: 'rachel.donovan@example.com', dob: '11/27/1986', ssn: 'XXX-XX-7340',
        address: '63 Magnolia Circle, Riverton, GA 30334',
        emergency: { name: 'Sean Donovan', phone: '(555) 010-6184', relationship: 'Husband' },
        employment: { status: 'Employed', employer: 'Riverton Middle School', title: 'Teacher' } },
    caseType: 'Others', caseTypeOther: 'Product Liability', phase: 'Treating', attorney: 'Atty. Elena Brooks', caseManager: 'Tom Alvarez',
    dateOfLoss: '07/04/2026', sol: '07/04/2028', target: '',
    narrative: 'The lid of a Hearthline QuickPot 8-qt pressure cooker blew off while locked and pressurized, causing second-degree burns to the client\'s chest and arms. The cooker is EVIDENCE: it is stored at the firm\'s evidence vendor (SecureHold Storage, tag SH-2291) and must not be released, tested or altered without the attorney.',
    injury: { primary: 'Second-degree burns', parts: 'Chest, arms', type: 'Burn', details: 'Scar management ongoing.' },
    police: { agency: 'Riverton Fire Department', number: 'RFD-26-0704-33', officer: 'Capt. L. Benson', narrative: 'EMS response for burn injury; appliance lid separated.' },
    health: { carrier: 'State Educators Health Plan', memberId: 'SEHP-3302871', group: 'RMS-09' },
    bi: [{ holder: 'Hearthline Appliances Inc.', carrier: 'Continental Product Liability Group', policy: 'CPLG-PL-2026-118', claim: 'CPLG-26-7719', adjuster: 'Martin Blake', contact: '(555) 010-7988', liability: 'Pending', limits: 'Unknown' }],
    pipum: [],
    liens: [{ type: 'HI Subro', entity: 'State Educators Health Plan', file: 'SEHP-R-4410', amount: '$ 14,220.00' }],
    facilities: [{ name: 'Riverton Burn Center', specialty: 'Emergency Hospital', phone: '(555) 010-3140', email: 'burn@riverton.example.com', dates: '07/04/2026 – 07/09/2026', status: 'Discharged', charges: '$ 26,800.00' }],
    chrono: [], treatmentNotes: 'Scar management ongoing.',
    pd: null, lit: null, finance: [{ date: '07/08/2026', staff: 'Paralegal', desc: 'Evidence storage, SecureHold (monthly)', amount: '$ 45.00' }],
    docs: [{ cat: 'Others', summary: 'Chain-of-custody form: cooker, lid and gasket, SecureHold tag SH-2291. Preservation letter sent to Hearthline 07/10/2026.' }],
    notes: [{ date: '07/10/2026', staff: 'Lead Attorney', text: 'Evidence stays at SecureHold. Any request to inspect, test or pick up the cooker goes to me. Joint inspection protocol only.' }],
    tasks: [{ date: '09/15/2026', staff: 'Paralegal', text: 'Retain engineering expert; propose joint inspection protocol.' }],
    reception: {
        verify: 'Rachel Donovan · DOB 11/27/1986 · 63 Magnolia Circle or SSN last 4 (7340).',
        calls: [{ from: 'Martin Blake, Continental Product Liability Group', ask: '"We\'d like to send someone to pick up the pressure cooker for testing this week."', handle: 'Never release or agree to anything about evidence. Per the 07/10 note, route to Atty. Elena Brooks (ext 202) as a priority message with his claim number (CPLG-26-7719).' }]
    }
},
{
    id: 'MC-19', caseNumber: 'LSH-2026-MVA-901409', level: 'Advanced', programs: ['reception', 'cm', 'intake', 'md'],
    summary: 'Pedestrian hit by a city bus. Government-claim notice deadline; the city\'s risk office calls.',
    client: { name: 'Samuel Boateng', phone: '(555) 010-6295', email: 'sam.boateng@example.com', dob: '02/14/1970', ssn: 'XXX-XX-0921',
        address: '301 Station Road, Riverton, GA 30336',
        emergency: { name: 'Ama Boateng', phone: '(555) 010-6296', relationship: 'Wife' },
        employment: { status: 'Employed', employer: 'Riverton Water Utility', title: 'Meter Technician' } },
    caseType: 'MVA', phase: 'Treating', attorney: 'Atty. Marcus Reyes', caseManager: 'Luis Ortega',
    dateOfLoss: '06/30/2026', sol: '06/30/2028', target: '',
    narrative: 'Client was in a marked crosswalk when a Riverton Transit bus (Route 4) turned right and struck him. Fractured pelvis. Claim against a government entity: written ante litem notice to the City must be served within 6 months of the incident (by 12/30/2026). Notice was served 08/14/2026.',
    injury: { primary: 'Fractured pelvis', parts: 'Pelvis', type: 'Fracture', details: 'Walker; home physical therapy.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-26-063077', officer: 'Ofc. A. Fisher #2419', narrative: 'Bus operator turning right failed to yield to pedestrian in crosswalk.' },
    health: { carrier: 'City Employees Health (self-funded)', memberId: 'CEH-114502', group: 'RWU-3' },
    bi: [{ holder: 'City of Riverton (Riverton Transit)', carrier: 'City of Riverton Risk Management (self-insured)', policy: 'Self-insured', claim: 'RM-26-0415', adjuster: 'Deborah Kline', contact: '(555) 010-7999', liability: 'Pending', limits: 'Statutory cap' }],
    pipum: [], liens: [],
    facilities: [{ name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '06/30/2026 – 07/06/2026', status: 'Discharged', charges: '$ 47,300.00' }],
    chrono: [], treatmentNotes: 'Walker; home PT.',
    pd: null, lit: null, finance: [{ date: '08/14/2026', staff: 'Paralegal', desc: 'Certified mail, ante litem notice to the City', amount: '$ 9.85' }],
    docs: [{ cat: 'Case Files', summary: 'Ante litem notice to the City of Riverton served 08/14/2026 (green card on file).' }],
    notes: [{ date: '08/14/2026', staff: 'Paralegal', text: 'Ante litem notice served on the City. All contact from the City goes to Atty. Reyes.' }],
    tasks: [{ date: '08/14/2026', staff: 'Lead Attorney', text: 'Calendar the City\'s response window; request bus video and operator records.' }],
    reception: {
        verify: 'Samuel Boateng · DOB 02/14/1970 · 301 Station Road or SSN last 4 (0921).',
        calls: [{ from: 'Deborah Kline, City of Riverton Risk Management', ask: '"We received the notice of claim for Mr. Boateng. Can we get his recorded statement next week?"', handle: 'No statements, no scheduling. Route to Atty. Marcus Reyes (ext 201) per the 08/14 note, with her claim number (RM-26-0415).' }]
    }
},
{
    id: 'MC-20', caseNumber: 'LSH-2026-MVA-901288', level: 'Advanced', programs: ['reception', 'cm', 'ea', 'md'],
    summary: 'Wrongful death. Only the estate\'s administrator is authorized; grieving relatives call.',
    client: { name: 'Estate of George Hammond (Carol Hammond, administrator)', phone: '(555) 010-6307', email: 'carol.hammond@example.com', dob: '12/05/1949', ssn: 'XXX-XX-6678',
        address: '8 Willow Creek Lane, Riverton, GA 30338',
        emergency: { name: 'Carol Hammond', phone: '(555) 010-6307', relationship: 'Daughter · court-appointed administrator (authorized)' },
        employment: { status: 'Retired', employer: '', title: 'Decedent: retired machinist' } },
    caseType: 'MVA', phase: 'Pending Demand', attorney: 'Atty. Elena Brooks', caseManager: 'Priya Natarajan',
    dateOfLoss: '03/28/2026', sol: '03/28/2028', target: '',
    narrative: 'George Hammond (76) died after a wrong-way driver (Travis Keene) struck his car on Route 9. His daughter Carol Hammond was appointed administrator of the estate (letters of administration 05/20/2026) and signed the retainer. DOB and address above are George\'s (verify with them plus the administrator\'s name). Other family members are NOT authorized; be compassionate and take messages.',
    injury: { primary: 'Fatal injuries (wrongful death)', type: 'Wrongful death', details: 'George Hammond died after the crash.' },
    police: { agency: 'Georgia State Patrol', number: 'GSP-26-003281', officer: 'Tpr. N. Ellis #588', narrative: 'Wrong-way vehicle (Keene) struck Unit 1 head-on. Driver 2 charged with DUI.' },
    health: { carrier: 'Medicare', memberId: 'MBI 3HD7-KL2-PQ91', group: '—' },
    bi: [{ holder: 'Travis Keene', carrier: 'Liberty Crest Insurance', policy: 'LC-2231887', claim: 'LC-26-10277', adjuster: 'Greg Hollis', contact: '(555) 010-7755', liability: 'Yes', limits: '$250,000 / $500,000' }],
    pipum: [{ type: 'UM/UIM', holder: 'George Hammond', carrier: 'Keystone Mutual Insurance', policy: 'KM-1203348', claim: 'KM-26-104455', adjuster: 'Dana Whitfield', contact: '(555) 010-7702', limits: '$100,000 / $300,000' }],
    liens: [{ type: 'Medical Lien', entity: 'Medicare (BCRC)', file: 'Case ID 26-0328-9920', amount: '$ 18,406.00' }],
    facilities: [{ name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '03/28/2026 – 03/29/2026', status: 'Discharged', charges: '$ 64,200.00' }],
    chrono: [], treatmentNotes: '',
    pd: null, lit: null, finance: [{ date: '05/20/2026', staff: 'Paralegal', desc: 'Probate filing fee (letters of administration)', amount: '$ 145.00' }],
    docs: [{ cat: 'Case Files', summary: 'Letters of administration naming Carol Hammond (05/20/2026). Death certificate. Retainer signed by Carol as administrator.' }],
    notes: [
        { date: '05/21/2026', staff: 'Case Manager', text: 'Only Carol Hammond (administrator) may receive case information. Her brother Daniel Hammond has called twice; told him to speak with Carol.' },
        { date: '09/20/2026', staff: 'Demand Specialist', text: 'Wrongful-death demand in attorney review.' }
    ],
    tasks: [{ date: '09/20/2026', staff: 'Lead Attorney', text: 'Review wrongful-death demand by 10/05/2026.' }],
    reception: {
        verify: 'Administrator Carol Hammond only: her name, George Hammond\'s DOB (12/05/1949) and the address on file (8 Willow Creek Lane). Daniel Hammond and other relatives are NOT authorized.',
        calls: [{ from: 'Daniel Hammond (George\'s son)', ask: '"When does the family get the money from Dad\'s case?"', handle: 'Offer condolences. Not authorized (only the administrator, Carol). Don\'t discuss the case; take a message for Atty. Brooks (ext 202) / Priya Natarajan (ext 311) and suggest he speak with Carol.' }]
    }
},
/* ---------- Same name, different file: practice finding the right DOL ----------
   MC-21 is Maria Santos's second file (same person as MC-01, older incident);
   MC-22 is a different Maria Santos (different DOB). MC-23 and MC-24 do the
   same for James Wilson (MC-06). A name search returns three files for each:
   the caller's date of the accident (DOL) and date of birth pick the right one. */
{
    id: 'MC-21', caseNumber: 'LSH-2025-SNF-900279', level: 'Intermediate', programs: ['reception', 'cm', 'md'],
    summary: 'Maria Santos\'s SECOND file (same client as MC-01): an older pharmacy slip and fall, settled, liens being negotiated. Her husband is authorized on this file only.',
    client: { name: 'Maria Santos', phone: '(555) 010-4417', email: 'maria.santos@example.com', dob: '03/22/1988', ssn: 'XXX-XX-4821',
        address: '1187 Willow Bend Dr, Riverton, GA 30301',
        emergency: { name: 'Eduardo Santos', phone: '(555) 010-4418', relationship: 'Husband' },
        employment: { status: 'Employed', employer: 'Brightside Dental Group', title: 'Dental Hygienist' } },
    caseType: 'Slip and Fall', phase: 'BI Settled', attorney: 'Atty. David Okafor', caseManager: 'Grace Kim',
    dateOfLoss: '01/14/2025', sol: '01/14/2027', target: '$ 38,500.00',
    narrative: 'Client slipped on a freshly mopped floor with no wet-floor sign at CareWay Pharmacy (Main St store) while picking up a prescription. Fell on her left knee and wrist. Torn meniscus treated with injections; no surgery. Settled 07/30/2026 for $38,500 (client accepted in writing). This is a different, older file from her 06/09/2026 car accident (MC-01).',
    injury: { primary: 'Torn meniscus (left knee)', parts: 'Left knee, left wrist', type: 'Joint / ligament / tendon tear', surgery: 'No', details: 'Treated with injections; no surgery. Treatment complete.' },
    police: { agency: 'None (store incident report only)', number: 'CareWay IR-2025-0114-03', officer: 'Store manager Dana Kirk', narrative: 'Store incident report: customer fell near the pharmacy counter after the floor was mopped; no sign posted. Store took photos.' },
    health: { carrier: 'Peach State Health Plan', memberId: 'PSH-88213340', group: 'GRP-55120' },
    bi: [{ holder: 'CareWay Pharmacy Inc.', carrier: 'Summit Commercial Casualty', policy: 'SCC-GL-310477', claim: 'SCC-25-02281', adjuster: 'Owen Price', contact: '(555) 010-7722', liability: 'Yes', limits: '$1,000,000' }],
    pipum: [],
    liens: [
        { type: 'HI Subro', entity: 'Peach State Health Plan', file: 'PSH-SUB-77120', amount: '$ 6,940.00' },
        { type: 'Medical Lien', entity: 'Riverton Orthopedic Associates (LOP)', file: 'ROA-LOP-4417', amount: '$ 5,300.00' }
    ],
    facilities: [
        { name: 'QuickCare Urgent Care', specialty: 'EMC', phone: '(555) 010-3301', email: 'records@quickcare.example.com', dates: '01/14/2025 – 01/14/2025', status: 'Discharged', charges: '$ 410.00' },
        { name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '01/28/2025 – 11/20/2025', status: 'Discharged', charges: '$ 8,900.00' },
        { name: 'Motion Physical Therapy', specialty: 'Other', specialtyOther: 'Physical Therapy', phone: '(555) 010-3390', email: 'billing@motionpt.example.com', dates: '02/10/2025 – 06/30/2025', status: 'Discharged', charges: '$ 4,480.00' }
    ],
    chrono: [
        { dos: ['01/14/2025'], facility: 'QuickCare Urgent Care', next: '', notes: 'Left knee and wrist pain after a fall. X-rays negative. Referred to orthopedics.' },
        { dos: ['01/28/2025', '11/20/2025'], facility: 'Riverton Orthopedic Associates', next: '', notes: 'MRI: torn medial meniscus, left knee. Two injections. Released 11/20/2025; no surgery recommended.' }
    ],
    treatmentNotes: 'Treatment complete 11/20/2025. Specials $13,790.',
    pd: null, lit: null,
    finance: [{ date: '08/12/2026', staff: 'Lien Negotiator', desc: 'Settlement check $38,500 deposited to trust (cleared 08/19/2026)', amount: '$ 0.00' }],
    docs: [
        { cat: 'Case Files', summary: 'Retainer (01/20/2025). Communication authorization for husband Eduardo Santos, THIS FILE ONLY (02/03/2025). Signed release (07/30/2026).' },
        { cat: 'Invoices', summary: 'Lien reduction requests sent 08/20/2026 to Peach State Health Plan and Riverton Orthopedic.' }
    ],
    notes: [
        { date: '02/03/2025', staff: 'Intake Specialist', text: 'Client signed a communication authorization for her husband Eduardo Santos on this slip-and-fall file only.' },
        { date: '08/20/2026', staff: 'Lien Negotiator', text: 'Reduction requests out to Peach State ($6,940) and the Riverton Ortho LOP ($5,300). Disbursement once both answer; no date promised to the client.' },
        { date: '09/21/2026', staff: 'Case Manager', text: 'Client asked when she gets her money from the fall. Explained we are waiting on two lien reductions (Rosa Delgado). She knows her car-accident case is a separate file.' }
    ],
    tasks: [{ date: '09/21/2026', staff: 'Lien Negotiator', text: 'Follow up with Peach State subrogation on 10/05/2026 if no reply.' }],
    reception: {
        verify: 'Maria Santos · DOB 03/22/1988 · 1187 Willow Bend Dr or SSN last 4 (4821). SAME client as MC-01: ask for the date of the accident to open the right file. Husband Eduardo Santos is authorized on THIS file only, not on MC-01.',
        calls: [
            { from: 'Maria Santos (client)', ask: '"When do I get my money from my fall at the pharmacy?"', handle: 'Verify, then confirm the file by the date of the fall (01/14/2025), not the 2026 car accident. Settled; the firm is waiting on two lien reductions, so no date. Message Rosa Delgado (ext 341) / Grace Kim (ext 313). Log a Note on this file.' },
            { from: 'Eduardo Santos (husband)', ask: '"I\'m calling about Maria\'s pharmacy fall. Did the health plan agree to lower its bill yet?"', handle: 'Verify him against this file (he is authorized here). Not yet: the reduction request went out 08/20; follow-up 10/05. Offer a callback from Rosa Delgado (ext 341). If he asks about her car-accident case, he is NOT authorized on that one.' }
        ]
    }
},
{
    id: 'MC-22', caseNumber: 'LSH-2026-DOG-901615', level: 'Intermediate', programs: ['reception', 'cm', 'md'],
    summary: 'A DIFFERENT Maria Santos (not MC-01 or MC-21): a neighbor\'s dog bit her while she was gardening. Check the DOB before you share anything.',
    client: { name: 'Maria Santos', phone: '(555) 010-6412', email: 'msantos.garden@example.com', dob: '08/30/1971', ssn: 'XXX-XX-5307',
        address: '402 Magnolia Court, Riverton, GA 30318',
        emergency: { name: 'Lucia Santos', phone: '(555) 010-6413', relationship: 'Daughter' },
        employment: { status: 'Employed', employer: 'Riverton Unified School District', title: 'Cafeteria Manager' } },
    caseType: 'Dog Bite', phase: 'Treating', attorney: 'Atty. David Okafor', caseManager: 'Luis Ortega',
    dateOfLoss: '07/28/2026', sol: '07/28/2028', target: '',
    narrative: 'Client was gardening in her front yard when her neighbor\'s German shepherd (owner Dale Fenton, 406 Magnolia Court) got through a broken fence and bit her right forearm and calf. ER stitches, then wound care. Client says the same dog bit a mail carrier in 2025. Speaks Spanish and English; Luis Ortega is her case manager.',
    injury: { primary: 'Dog-bite wounds to the right forearm and calf', parts: 'Right forearm, right calf', type: 'Laceration / bite / scarring', details: 'ER stitches, then wound care.' },
    police: { agency: 'Riverton County Animal Control', number: 'RCAC-26-3318', officer: 'Officer M. Duran', narrative: 'Bite reported 07/28/2026. Dog quarantined 10 days at the owner\'s home. A prior bite report for the same dog is on file (2025).' },
    health: { carrier: 'Georgia Educators Health Plan', memberId: 'GEHP-4471093', group: 'RUSD-02' },
    bi: [{ holder: 'Dale Fenton', carrier: 'Homestead Fire & Casualty', policy: 'HFC-HO-551902', claim: 'HFC-26-03390', adjuster: 'Monica Reyes-Hart', contact: '(555) 010-7640', liability: 'Pending', limits: '$300,000' }],
    pipum: [], liens: [],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '07/28/2026 – 07/28/2026', status: 'Discharged', charges: '$ 2,860.00' },
        { name: 'Riverton Wound Care Clinic', specialty: 'Other', specialtyOther: 'Wound Care', phone: '(555) 010-3420', email: 'records@rivertonwound.example.com', dates: '08/04/2026 – present', status: 'Ongoing', charges: '$ 1,150.00' }
    ],
    chrono: [
        { dos: ['07/28/2026'], facility: 'St. Mary\'s Hospital', next: '', notes: 'Dog bite, right forearm (12 stitches) and right calf. Tetanus booster, antibiotics.' },
        { dos: ['08/04/2026', '09/15/2026'], facility: 'Riverton Wound Care Clinic', next: '10/06/2026 9:00 AM', notes: 'Healing well; scarring on the forearm. Next visit Tuesday 10/06 at 9:00 AM.' }
    ],
    treatmentNotes: 'Client photographs the wounds weekly and sends them to Luis Ortega.',
    pd: null, lit: null,
    finance: [{ date: '08/06/2026', staff: 'Records Specialist', desc: 'Animal control bite report request fee', amount: '$ 10.00' }],
    docs: [
        { cat: 'Case Files', summary: 'Retainer and HIPAA authorization (08/01/2026). Only the client is authorized.' },
        { cat: 'Medical Records', summary: 'St. Mary\'s ER record 07/28/2026.' }
    ],
    notes: [
        { date: '08/01/2026', staff: 'Intake Specialist', text: 'Retainer signed. NOT the same client as the other Maria Santos files (DOB 03/22/1988): this client\'s DOB is 08/30/1971. Only the client is authorized.' },
        { date: '08/06/2026', staff: 'Records Specialist', text: 'Requested the animal control bite report and the 2025 prior-bite report. Not received yet.' },
        { date: '09/15/2026', staff: 'Case Manager', text: 'Spoke with client in Spanish. Wound care going well. Homestead has not accepted liability yet.' }
    ],
    tasks: [{ date: '09/15/2026', staff: 'Records Specialist', text: 'Follow up with Riverton County Animal Control on the bite reports by 10/02/2026.' }],
    reception: {
        verify: 'Maria Santos · DOB 08/30/1971 · 402 Magnolia Court or SSN last 4 (5307). Three files carry the name Maria Santos: this one is the dog bite (DOL 07/28/2026). Only the client is authorized.',
        calls: [
            { from: 'Maria Santos (client)', ask: '"Did you get the report from animal control yet?"', handle: 'A name search finds three Maria Santos files. Her DOB (08/30/1971) and the dog bite (07/28/2026) put her on MC-22. Not received yet: requested 08/06, follow-up by 10/02. Message Luis Ortega (ext 314). Log a Note.' },
            { from: 'Monica Reyes-Hart, Homestead Fire & Casualty', ask: '"Claim HFC-26-03390, Maria Santos. Can you send me her medical records?"', handle: 'Business caller. The claim number puts the call on MC-22, not the other Maria Santos files. Never send records from the front desk: message Luis Ortega (ext 314) / Atty. Okafor (ext 203).' }
        ]
    }
},
{
    id: 'MC-23', caseNumber: 'LSH-2026-PRL-901227', level: 'Intermediate', programs: ['reception', 'cm', 'md'],
    summary: 'James Wilson\'s SECOND file (same client as MC-06): a garage handrail gave way. In treatment while his truck-crash case is being paid out.',
    client: { name: 'James Wilson', phone: '(555) 010-4962', email: 'jwilson.rvt@example.com', dob: '09/17/1983', ssn: 'XXX-XX-3390',
        address: '17 Birchwood Lane, Riverton, GA 30311',
        emergency: { name: 'Nadia Wilson', phone: '(555) 010-4963', relationship: 'Wife' },
        employment: { status: 'Employed', employer: 'Riverton Distribution Center', title: 'Forklift Operator' } },
    caseType: 'Premise Liability', phase: 'Treating', attorney: 'Atty. Marcus Reyes', caseManager: 'Tom Alvarez',
    dateOfLoss: '05/16/2026', sol: '05/16/2028', target: '',
    narrative: 'Client leaned on a stairwell handrail on level 3 of the Riverton Plaza parking garage; the rail was loose, gave way, and he fell about six steps. Lower-back injury and a right-wrist sprain. Garage management had an open work order on that rail since April. This is a different file from his 01/12/2025 truck crash (MC-06), which is in disbursement.',
    injury: { primary: 'Lower-back injury', parts: 'Lower back, right wrist', type: 'Soft tissue (sprain / strain)', details: 'Right-wrist sprain. The 10/07 injection decides whether more care is needed.' },
    police: { agency: 'Riverton Plaza Security', number: 'RPS-26-0516-2', officer: 'Guard K. Mensah', narrative: 'Security report: patron fell in stairwell C after the handrail detached. Maintenance ticket on the rail open since 04/22/2026.' },
    health: { carrier: 'Distribution Workers Health Fund', memberId: 'DWHF-221907', group: 'DWHF-09' },
    bi: [{ holder: 'Riverton Plaza Parking LLC', carrier: 'Keystone Commercial', policy: 'KC-CGL-448120', claim: 'KC-26-71540', adjuster: 'Paul Dreyer', contact: '(555) 010-7870', liability: 'Pending', limits: '$2,000,000' }],
    pipum: [], liens: [],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '05/16/2026 – 05/16/2026', status: 'Discharged', charges: '$ 3,120.00' },
        { name: 'Align Chiropractic', specialty: 'Chiro', phone: '(555) 010-3355', email: 'billing@alignchiro.example.com', dates: '05/26/2026 – present', status: 'Ongoing', charges: '$ 2,940.00' },
        { name: 'Riverton Pain Institute', specialty: 'Pain Management', phone: '(555) 010-3450', email: 'intake@rivertonpain.example.com', dates: '08/19/2026 – present', status: 'Ongoing', charges: '$ 1,850.00' }
    ],
    chrono: [
        { dos: ['05/16/2026'], facility: 'St. Mary\'s Hospital', next: '', notes: 'Lumbar strain, right wrist sprain. X-rays negative.' },
        { dos: ['05/26/2026', '09/23/2026'], facility: 'Align Chiropractic', next: '09/30/2026 5:30 PM', notes: 'Chiropractic 2x/week. Next visit Wednesday 09/30 at 5:30 PM.' },
        { dos: ['08/19/2026'], facility: 'Riverton Pain Institute', next: '10/07/2026 1:15 PM', notes: 'MRI: L4-L5 disc bulge. First lumbar injection Wednesday 10/07 at 1:15 PM.' }
    ],
    treatmentNotes: 'Treating consistently. The 10/07 injection decides whether more care is needed.',
    pd: null, lit: null, finance: [],
    docs: [
        { cat: 'Case Files', summary: 'Retainer (05/20/2026). Only the client is authorized on this file.' },
        { cat: 'Others', summary: 'Garage security report and the 04/22/2026 maintenance ticket on the handrail.' }
    ],
    notes: [
        { date: '05/20/2026', staff: 'Intake Specialist', text: 'Retainer signed. Existing client (truck crash, DOL 01/12/2025). Keep the two files separate: always confirm the date of the accident.' },
        { date: '09/23/2026', staff: 'Case Manager', text: 'Client doing chiropractic 2x/week; pain injection 10/07. Reminded him not to miss appointments.' }
    ],
    tasks: [{ date: '09/23/2026', staff: 'Case Manager', text: 'Call client after the 10/07 injection (by 10/09/2026).' }],
    reception: {
        verify: 'James Wilson · DOB 09/17/1983 · 17 Birchwood Lane or SSN last 4 (3390). SAME client as MC-06: ask for the date of the accident to open the right file. Only the client is authorized.',
        calls: [
            { from: 'James Wilson (client)', ask: '"When\'s my back injection? The one for the garage fall."', handle: 'Verify, then open the garage fall (DOL 05/16/2026), not the truck crash. Riverton Pain Institute, Wednesday 10/07/2026 at 1:15 PM (09/30 at 5:30 PM is chiropractic). Log a Note.' },
            { from: 'Paul Dreyer, Keystone Commercial', ask: '"Claim KC-26-71540, James Wilson. Can he give us a recorded statement?"', handle: 'Business caller. No recorded statements. The claim number puts the call on MC-23. Message Tom Alvarez (ext 312) / Atty. Reyes (ext 201).' }
        ]
    }
},
{
    id: 'MC-24', caseNumber: 'LSH-2026-SNF-901727', level: 'Advanced', programs: ['reception', 'cm', 'intake', 'md'],
    summary: 'A DIFFERENT James Wilson (not MC-06 or MC-23): a retiree who fell on a hotel pool deck. His son is authorized. Check the DOB before you share anything.',
    client: { name: 'James Wilson', phone: '(555) 010-6520', email: '', dob: '04/02/1956', ssn: 'XXX-XX-7718',
        address: '5 Quarry Road, Riverton, GA 30325',
        emergency: { name: 'Kevin Wilson', phone: '(555) 010-6521', relationship: 'Son' },
        employment: { status: 'Retired', employer: '', title: 'Retired bus mechanic' } },
    caseType: 'Slip and Fall', phase: 'Treating', attorney: 'Atty. David Okafor', caseManager: 'Priya Natarajan',
    dateOfLoss: '08/08/2026', sol: '08/08/2028', target: '',
    narrative: 'Client slipped on algae-slick tiles at the edge of the pool at the Grandview Hotel (Lakeshore Blvd) while visiting his grandchildren. Fractured right hip; partial hip replacement 08/09/2026, then inpatient rehab. The hotel says the deck was cleaned that morning; his son photographed the tiles the same day.',
    injury: { primary: 'Fractured right hip', parts: 'Right hip', type: 'Fracture', surgery: 'Completed', details: 'Partial hip replacement 08/09/2026, then inpatient rehab.' },
    police: { agency: 'None (hotel incident report only)', number: 'Grandview IR-0808-21', officer: 'Night manager Alicia Grant', narrative: 'Hotel report: guest fell on the pool deck at about 4:40 PM; ambulance called. Copy requested; the hotel referred us to its insurer.' },
    health: { carrier: 'Medicare (Part A & B)', memberId: 'MBI 7HX2-QP4-RT55', group: '—' },
    bi: [{ holder: 'Grandview Hotel Group LLC', carrier: 'Allied Retail Casualty', policy: 'ARC-GL-902215', claim: 'ARC-26-51177', adjuster: 'Brent Kowalski', contact: '(555) 010-7931', liability: 'Pending', limits: '$1,000,000' }],
    pipum: [], liens: [],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '08/08/2026 – 08/13/2026', status: 'Discharged', charges: '$ 52,700.00' },
        { name: 'Riverton Rehabilitation Center', specialty: 'Other', specialtyOther: 'Inpatient Rehab', phone: '(555) 010-3470', email: 'records@rivertonrehab.example.com', dates: '08/13/2026 – 09/03/2026', status: 'Discharged', charges: '$ 18,300.00' },
        { name: 'Motion Physical Therapy', specialty: 'Other', specialtyOther: 'Physical Therapy', phone: '(555) 010-3390', email: 'billing@motionpt.example.com', dates: '09/08/2026 – present', status: 'Ongoing', charges: '$ 960.00' }
    ],
    chrono: [
        { dos: ['08/09/2026'], facility: 'St. Mary\'s Hospital', next: '', notes: 'Right hip hemiarthroplasty (partial hip replacement).' },
        { dos: ['09/08/2026', '09/24/2026'], facility: 'Motion Physical Therapy', next: '10/01/2026 11:00 AM', notes: 'Outpatient PT 2x/week, walking with a cane. Next session Thursday 10/01 at 11:00 AM.' }
    ],
    treatmentNotes: 'Medicare is primary; conditional-payment letter requested 08/20/2026.',
    pd: null, lit: null, finance: [],
    docs: [
        { cat: 'Case Files', summary: 'Retainer (08/18/2026, signed at the rehab center). Communication authorization for son Kevin Wilson (08/18/2026).' },
        { cat: 'Others', summary: 'Kevin Wilson\'s photos of the pool-deck tiles (08/08/2026).' }
    ],
    notes: [
        { date: '08/18/2026', staff: 'Intake Specialist', text: 'Retainer signed at the rehab center. Son Kevin Wilson is authorized. NOT the same client as the other James Wilson files (DOB 09/17/1983): this client\'s DOB is 04/02/1956. No email; call the home number.' },
        { date: '09/24/2026', staff: 'Case Manager', text: 'Kevin called: his dad is home, walking with a cane, PT twice a week. The hotel\'s insurer (Allied Retail) hasn\'t answered about the pool-deck video.' }
    ],
    tasks: [{ date: '09/24/2026', staff: 'Paralegal', text: 'Send a preservation letter for the hotel pool-deck video to Allied Retail by 09/30/2026.' }],
    reception: {
        verify: 'James Wilson · DOB 04/02/1956 · 5 Quarry Road or SSN last 4 (7718). Three files carry the name James Wilson: this one is the hotel pool fall (DOL 08/08/2026). Son Kevin Wilson is authorized.',
        calls: [
            { from: 'Kevin Wilson (son, authorized)', ask: '"I\'m calling for my dad, James Wilson. When is his next physical therapy?"', handle: 'Three James Wilson files. His dad\'s DOB (04/02/1956) and the pool fall (08/08/2026) put the call on MC-24, where Kevin is authorized. Motion Physical Therapy, Thursday 10/01/2026 at 11:00 AM. Log a Note.' },
            { from: 'Brent Kowalski, Allied Retail Casualty', ask: '"About James Wilson, the hotel pool fall. Can I talk to him directly?"', handle: 'Business caller. Never give out a client\'s number or put an adjuster in touch with a client. Message Priya Natarajan (ext 311) / Atty. Okafor (ext 203) with claim ARC-26-51177.' }
        ]
    }
},
/* ---------- More files (MC-25 … MC-36): new phases, liens and situations ----------
   MC-25/26: a father and son with the SAME name, address and DOL (one crash): only the DOB or
   the case number tells them apart. MC-29, MC-33, MC-34: callers who give only our case number.
   Also: a safety flag (MC-27), a prior attorney's lien (MC-32), pre-settlement funding (MC-33),
   joint custody with both parents authorized (MC-35), and a brand-new file (MC-36). */
{
    id: 'MC-25', caseNumber: 'LSH-2026-MVA-901845', level: 'Advanced', programs: ['reception', 'cm', 'pd', 'md'],
    summary: 'Jose Hernandez (the father, born 1962) and his son of the same name were hurt in the same crash, so the two files share a name, an address and a DOL. Only the DOB or the case number tells them apart. His wife is authorized on HIS file only.',
    client: { name: 'Jose Hernandez', phone: '(555) 010-6630', email: '', dob: '03/14/1962', ssn: 'XXX-XX-2741',
        address: '2210 Brookside Ave, Riverton, GA 30327',
        emergency: { name: 'Carmen Hernandez', phone: '(555) 010-6631', relationship: 'Wife' },
        employment: { status: 'Employed', employer: 'Riverton Parks Department', title: 'Groundskeeper' } },
    caseType: 'MVA', phase: 'Treating', attorney: 'Atty. Marcus Reyes', caseManager: 'Luis Ortega',
    dateOfLoss: '08/30/2026', sol: '08/30/2028', target: '',
    narrative: 'Client was driving his 2015 Toyota Camry through Brookside Ave and 12th St on a green light, with his son Jose Hernandez Jr. (also a client, separate file MC-26) in the passenger seat, when a delivery van ran the red light and hit the driver side. Client: three broken ribs, neck strain and a left shoulder injury. Prefers Spanish; Luis Ortega handles the file.',
    injury: { primary: 'Three broken ribs', parts: 'Ribs, neck, left shoulder', type: 'Fracture', details: 'Neck strain and a left shoulder injury.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-26-083044', officer: 'Ofc. L. Grant #2410', narrative: 'Unit 2 (Swift Parcel Co. van, driver Dwayne Pratt) entered the intersection against a red signal and struck Unit 1 (Hernandez) on the driver side. Both occupants of Unit 1 transported. Driver 2 cited.' },
    health: { carrier: 'Georgia Municipal Employees Health Plan', memberId: 'GMEHP-3308124', group: 'RIV-PARKS' },
    bi: [{ holder: 'Swift Parcel Co.', carrier: 'TransAmerica Freight Insurance', policy: 'TFI-AU-771240', claim: 'TFI-26-40219-01', adjuster: 'Carol Benning', contact: '(555) 010-7702', liability: 'Yes', limits: '$1,000,000' }],
    pipum: [{ type: 'UM/UIM', holder: 'Jose Hernandez', carrier: 'Harbor Point Insurance', policy: 'HP-5582019', claim: 'HP-26-7710', adjuster: 'Not yet assigned', contact: '(555) 010-7810', limits: '$50,000 / $100,000' }],
    liens: [],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '08/30/2026 – 09/01/2026', status: 'Discharged', charges: '$ 18,450.00' },
        { name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '09/10/2026 – present', status: 'Ongoing', charges: '$ 1,240.00' }
    ],
    chrono: [
        { dos: ['08/30/2026'], facility: 'St. Mary\'s Hospital', next: '', notes: 'Admitted overnight: three fractured ribs (left), neck strain, left shoulder contusion.' },
        { dos: ['09/10/2026', '09/24/2026'], facility: 'Riverton Orthopedic Associates', next: '10/08/2026 9:30 AM', notes: 'Shoulder MRI ordered. Next visit Thursday 10/08 at 9:30 AM (Dr. Feld).' }
    ],
    treatmentNotes: 'Father and son see the same orthopedic office on different days. Don\'t mix up their appointments.',
    pd: { client: { year: '2015', make: 'Toyota', model: 'Camry', plate: 'GA-HRN6230', owner: 'Jose Hernandez', driver: 'Jose Hernandez' },
        tp: { year: '2022', make: 'Ford', model: 'Transit', plate: 'GA-SWF4410', owner: 'Swift Parcel Co.', driver: 'Dwayne Pratt', insured: 'Yes', carrierPolicy: 'TransAmerica Freight · TFI-AU-771240', driverPhone: '(555) 010-7728', driverInsurer: 'TransAmerica Freight Insurance', ownerPhone: '(555) 010-7729', ownerPolicy: 'TransAmerica Freight · TFI-AU-771240' } },
    lit: null,
    finance: [{ date: '09/03/2026', staff: 'Records Specialist', desc: 'Police report fee (RPD-26-083044)', amount: '$ 15.00' }],
    docs: [
        { cat: 'Case Files', summary: 'Retainer (09/02/2026, in Spanish). Communication authorization for wife Carmen Hernandez on THIS file only (09/02/2026).' },
        { cat: 'Police Report', summary: 'RPD-26-083044. Van driver cited for running the red light.' }
    ],
    notes: [
        { date: '09/02/2026', staff: 'Intake Specialist', text: 'Retainer signed in Spanish with Luis Ortega. Wife Carmen Hernandez is authorized on this file. The son, Jose Hernandez Jr. (DOB 11/02/1994), has his own file from the same crash, and Carmen is NOT authorized on it.' },
        { date: '09/24/2026', staff: 'Case Manager', text: 'Spoke with Carmen in Spanish. Client sleeping poorly because of the ribs. Ortho follow-up 10/08. Asked her to keep a log of his mileage and missed work.' }
    ],
    tasks: [{ date: '09/24/2026', staff: 'Case Manager', text: 'Request the shoulder MRI report after 10/08/2026.' }],
    reception: {
        verify: 'Jose Hernandez (the father) · DOB 03/14/1962 · 2210 Brookside Ave or SSN last 4 (2741). His son has his own file with the same name, address and DOL (MC-26): the DOB or the case number decides. Wife Carmen Hernandez is authorized on this file only.',
        calls: [
            { from: 'Carmen Hernandez (wife, authorized on this file)', ask: '"¿Cuándo es la próxima cita de mi esposo con el ortopedista?" (When is my husband\'s next orthopedic appointment?)', handle: 'Transfer to Luis Ortega (ext 314) for Spanish, or verify her yourself: she is authorized on this file. Riverton Orthopedic, Thursday 10/08/2026 at 9:30 AM. Log a Note.' },
            { from: 'Carol Benning, TransAmerica Freight', ask: '"Claim TFI-26-40219. I have two Jose Hernandez claimants from this crash. Which one is your client?"', handle: 'Business caller. Both are clients (separate files). Don\'t read out anyone\'s DOB: ask her for the claimant number (-01 is the father, -02 the son) or our case number, and take a message for Luis Ortega (ext 314).' }
        ]
    }
},
{
    id: 'MC-26', caseNumber: 'LSH-2026-MVA-901924', level: 'Advanced', programs: ['reception', 'cm', 'md'],
    summary: 'Jose Hernandez Jr. (the son, born 1994): passenger in his father\'s car in the same crash as MC-25. Same name, same address, same DOL. Only he is authorized on his file, not his parents.',
    client: { name: 'Jose Hernandez', phone: '(555) 010-6640', email: 'jhernandez94@example.com', dob: '11/02/1994', ssn: 'XXX-XX-8156',
        address: '2210 Brookside Ave, Riverton, GA 30327',
        emergency: { name: 'Carmen Hernandez', phone: '(555) 010-6631', relationship: 'Mother' },
        employment: { status: 'Employed', employer: 'Peach State Logistics', title: 'Warehouse Supervisor' } },
    caseType: 'MVA', phase: 'Treating', attorney: 'Atty. Marcus Reyes', caseManager: 'Luis Ortega',
    dateOfLoss: '08/30/2026', sol: '08/30/2028', target: '',
    narrative: 'Client was the front-seat passenger in his father\'s 2015 Toyota Camry (father: Jose Hernandez Sr., separate file MC-25) when a delivery van ran a red light at Brookside Ave and 12th St. Client: concussion and a right wrist fracture (cast). Out of work since the crash. Speaks English; his parents prefer Spanish.',
    injury: { primary: 'Concussion and a right wrist fracture', parts: 'Head, right wrist', type: 'Head injury / concussion', details: 'Wrist in a cast. Out of work since the crash.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-26-083044', officer: 'Ofc. L. Grant #2410', narrative: 'Same report as the father\'s file: Unit 2 (Swift Parcel Co. van) ran the red signal and struck Unit 1 (Hernandez). Passenger (Jose Hernandez Jr.) transported with a wrist injury and a head strike.' },
    health: { carrier: 'Peach State Logistics Employee Plan', memberId: 'PSL-7719230', group: 'PSL-WH-3' },
    bi: [{ holder: 'Swift Parcel Co.', carrier: 'TransAmerica Freight Insurance', policy: 'TFI-AU-771240', claim: 'TFI-26-40219-02', adjuster: 'Carol Benning', contact: '(555) 010-7702', liability: 'Yes', limits: '$1,000,000' }],
    pipum: [], liens: [],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '08/30/2026 – 08/30/2026', status: 'Discharged', charges: '$ 6,980.00' },
        { name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '09/03/2026 – present', status: 'Ongoing', charges: '$ 980.00' },
        { name: 'Riverton Neurology Group', specialty: 'Other', specialtyOther: 'Neurology', phone: '(555) 010-3480', email: 'intake@rivneuro.example.com', dates: '10/13/2026 – ', status: 'Ongoing', charges: '$ 0.00' }
    ],
    chrono: [
        { dos: ['08/30/2026'], facility: 'St. Mary\'s Hospital', next: '', notes: 'Concussion (CT negative). Right distal radius fracture, splinted.' },
        { dos: ['09/03/2026', '09/22/2026'], facility: 'Riverton Orthopedic Associates', next: '10/06/2026 2:00 PM', notes: 'Cast placed 09/03. Cast check and new X-rays Tuesday 10/06 at 2:00 PM.' },
        { dos: [], facility: 'Riverton Neurology Group', next: '10/13/2026 11:15 AM', notes: 'Referral for ongoing headaches. First visit Tuesday 10/13 at 11:15 AM.' }
    ],
    treatmentNotes: 'Same orthopedic office as his father (MC-25), different days.',
    pd: null, lit: null, finance: [],
    docs: [
        { cat: 'Case Files', summary: 'Retainer (09/02/2026). Only the client is authorized (he is an adult).' },
        { cat: 'Medical Records', summary: 'St. Mary\'s ER record and CT report requested 09/22/2026.' }
    ],
    notes: [
        { date: '09/02/2026', staff: 'Intake Specialist', text: 'Retainer signed. Client is Jose Hernandez JR. (DOB 11/02/1994): same name and address as his father (MC-25, DOB 03/14/1962). Only the client is authorized on this file; his parents are not.' },
        { date: '09/22/2026', staff: 'Case Manager', text: 'Client still getting headaches: neurology referral 10/13. His employer needs a work note; told him to ask the orthopedic office for it.' }
    ],
    tasks: [{ date: '09/22/2026', staff: 'Records Specialist', text: 'Follow up on the St. Mary\'s ER record and CT report by 10/06/2026.' }],
    reception: {
        verify: 'Jose Hernandez (the son) · DOB 11/02/1994 · 2210 Brookside Ave or SSN last 4 (8156). Same name, address and DOL as his father\'s file (MC-25): the DOB or the case number decides. Only the client is authorized; his mother Carmen is NOT authorized on this file.',
        calls: [
            { from: 'Carmen Hernandez (mother)', ask: '"When does Jose get his cast off?"', handle: 'Ask which Jose, and for his date of birth. If it\'s the son (DOB 11/02/1994), she is NOT authorized on his file: take a message and share nothing. (She is authorized only on her husband\'s file, MC-25.)' },
            { from: 'Jose Hernandez Jr. (client)', ask: '"I need a note for work saying when I can go back."', handle: 'Verify. The firm doesn\'t write work notes; his doctor does (Riverton Orthopedic, (555) 010-3160). Offer a message to Luis Ortega (ext 314). Log a Note.' }
        ]
    }
},
{
    id: 'MC-27', caseNumber: 'LSH-2025-PRL-900998', level: 'Advanced', programs: ['reception', 'cm', 'md'],
    summary: 'Negligent security: client was assaulted in a dark apartment parking garage and has moved for her safety. Never confirm she is a client, or give out her address or phone.',
    client: { name: 'Olivia Bennett', phone: '(555) 010-6650', email: 'o.bennett.safe@example.com', dob: '07/07/1993', ssn: 'XXX-XX-3094',
        address: '415 Laurel Park Way, Apt 12, Riverton, GA 30330',
        emergency: { name: 'Janine Bennett', phone: '(555) 010-6651', relationship: 'Sister' },
        employment: { status: 'Employed', employer: 'Riverton Public Library', title: 'Library Assistant' } },
    caseType: 'Premise Liability', phase: 'Pending Demand', attorney: 'Atty. Elena Brooks', caseManager: 'Grace Kim',
    dateOfLoss: '11/21/2025', sol: '11/21/2027', target: '$ 250,000.00',
    narrative: 'Client was assaulted and robbed in the parking garage of Stonegate Apartments, where she lived, at about 10:40 PM. Half the garage lights had been out for three weeks and the security gate was broken; both were reported to management in writing. Orbital (eye socket) fracture, a broken wrist, and ongoing anxiety. The assailant was arrested (criminal case pending). Client has since moved; her new address is confidential.',
    injury: { primary: 'Orbital (eye socket) fracture', parts: 'Eye socket, wrist', type: 'Fracture', details: 'Broken wrist; ongoing anxiety (weekly counseling).' },
    police: { agency: 'Riverton Police Department', number: 'RPD-25-112188', officer: 'Det. S. Moreno #1702', narrative: 'Robbery and aggravated assault in the Stonegate Apartments parking garage. Suspect Kyle Dorsey arrested 11/29/2025. Victim referred to victim services.' },
    health: { carrier: 'State Health Benefit Plan', memberId: 'SHBP-2290471', group: 'CITY-LIB' },
    bi: [{ holder: 'Stonegate Residential LLC', carrier: 'Keystone Commercial', policy: 'KC-CGL-660318', claim: 'KC-25-78804', adjuster: 'Monique Tate', contact: '(555) 010-7876', liability: 'Pending', limits: '$2,000,000' }],
    pipum: [],
    liens: [{ type: 'HI Subro', entity: 'State Health Benefit Plan', file: 'SHBP-SUB-44102', amount: '$ 31,205.00' }],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '11/21/2025 – 11/23/2025', status: 'Discharged', charges: '$ 27,400.00' },
        { name: 'Riverton Oral & Facial Surgery', specialty: 'Surgery', phone: '(555) 010-3490', email: 'billing@rivfacial.example.com', dates: '12/02/2025 – 12/02/2025', status: 'Discharged', charges: '$ 14,800.00' },
        { name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '12/08/2025 – 04/15/2026', status: 'Discharged', charges: '$ 6,300.00' },
        { name: 'Mindful Path Counseling', specialty: 'Other', specialtyOther: 'Counseling', phone: '(555) 010-3495', email: 'office@mindfulpath.example.com', dates: '01/12/2026 – present', status: 'Ongoing', charges: '$ 3,900.00' }
    ],
    chrono: [
        { dos: ['12/02/2025'], facility: 'Riverton Oral & Facial Surgery', next: '', notes: 'Orbital floor repair, right eye.' },
        { dos: ['01/12/2026', '09/24/2026'], facility: 'Mindful Path Counseling', next: '10/01/2026 5:00 PM', notes: 'Weekly counseling (anxiety, sleep). Next session Thursday 10/01 at 5:00 PM.' }
    ],
    treatmentNotes: 'Counseling continues weekly. The demand is waiting on the counselor\'s narrative report.',
    pd: null, lit: null,
    finance: [{ date: '06/15/2026', staff: 'Records Specialist', desc: 'Records request fee (Stonegate maintenance logs)', amount: '$ 45.00' }],
    docs: [
        { cat: 'Case Files', summary: 'Retainer (12/05/2025). SAFETY FLAG: client\'s new address and phone are confidential; never give out, confirm or update them from a phone call.' },
        { cat: 'Others', summary: 'Written complaints to management about the garage lights (10/30 and 11/06/2025) and the broken gate.' }
    ],
    notes: [
        { date: '12/05/2025', staff: 'Intake Specialist', text: 'Only the client is authorized. SAFETY FLAG: the assailant\'s family has tried to find her. Never confirm she is a client, and never give out her address or phone. Any caller asking for her: take a message and alert Grace Kim and Atty. Brooks right away.' },
        { date: '09/18/2026', staff: 'Demand Specialist', text: 'Demand in review with Atty. Brooks; waiting on the counselor\'s narrative (requested 09/10).' }
    ],
    tasks: [{ date: '09/18/2026', staff: 'Demand Specialist', text: 'Follow up with Mindful Path Counseling for the narrative report by 10/02/2026.' }],
    reception: {
        verify: 'Olivia Bennett · DOB 07/07/1993 · 415 Laurel Park Way or SSN last 4 (3094). SAFETY FLAG: never confirm she is a client, and never give out her address or phone to anyone.',
        calls: [
            { from: 'A man who says he is Olivia\'s cousin', ask: '"I need to get a card to Olivia. What\'s her new address?"', handle: 'Not authorized, and the file carries a safety flag. Don\'t confirm she is a client: "I\'m not able to help with that, but I can take a message." Log the call (name, number, time) and alert Grace Kim (ext 313) and Atty. Brooks (ext 202) right away.' },
            { from: 'Olivia Bennett (client)', ask: '"Did my demand go out yet?"', handle: 'Verify. Not yet: it\'s in attorney review, waiting on the counselor\'s report (follow-up 10/02). Offer a callback from Grace Kim (ext 313).' }
        ]
    }
},
{
    id: 'MC-28', caseNumber: 'LSH-2026-ESCO-901969', level: 'Intermediate', programs: ['reception', 'cm', 'intake', 'md'],
    summary: 'Rental e-scooter crash: the front brake failed on a hill. Early investigation; no health insurance. The client wants to post his crash video online.',
    client: { name: 'Marcus Lee', phone: '(555) 010-6660', email: 'marcus.lee@example.com', dob: '05/19/2000', ssn: 'XXX-XX-6619',
        address: '77 Canal Street, Apt 5C, Riverton, GA 30305',
        emergency: { name: 'Helen Lee', phone: '(555) 010-6661', relationship: 'Mother' },
        employment: { status: 'Employed', employer: 'Riverton Coffee Roasters', title: 'Barista' } },
    caseType: 'Others', caseTypeOther: 'E-Scooter', phase: 'Treating', attorney: 'Atty. David Okafor', caseManager: 'Tom Alvarez',
    dateOfLoss: '09/05/2026', sol: '09/05/2028', target: '',
    narrative: 'Client rented a ZipRide e-scooter downtown. Going down the Market Street hill, the front brake lever went slack and he crashed at Market and 3rd. Broken collarbone and road rash. He kept the ride receipt (ride ID ZR-8841-2207) and photographed the scooter. ZipRide says the scooter was inspected the day before.',
    injury: { primary: 'Broken collarbone', parts: 'Collarbone, skin', type: 'Fracture', details: 'Road rash. Treated under a letter of protection (no health insurance).' },
    police: { agency: 'Riverton Police Department', number: 'RPD-26-090517', officer: 'Ofc. D. Shah #2288', narrative: 'Single-rider scooter crash. Rider stated the brakes failed. Scooter (ZipRide unit 4471) left at the scene for the company to collect.' },
    health: { carrier: 'None (uninsured)', memberId: '—', group: '—' },
    bi: [{ holder: 'ZipRide Mobility Inc.', carrier: 'Continental Product Liability Group', policy: 'CPLG-GL-2026-118', claim: 'CPLG-26-9044', adjuster: 'Martin Blake', contact: '(555) 010-7988', liability: 'Pending', limits: '$5,000,000' }],
    pipum: [],
    liens: [{ type: 'Medical Lien', entity: 'St. Mary\'s Hospital (hospital lien filed)', file: 'SMH-HL-26-3390', amount: '$ 9,860.00' }],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '09/05/2026 – 09/05/2026', status: 'Discharged', charges: '$ 9,860.00' },
        { name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '09/12/2026 – present', status: 'Ongoing', charges: '$ 760.00' }
    ],
    chrono: [
        { dos: ['09/05/2026'], facility: 'St. Mary\'s Hospital', next: '', notes: 'Right clavicle fracture; road rash on the arm and hip. Sling.' },
        { dos: ['09/12/2026'], facility: 'Riverton Orthopedic Associates', next: '10/02/2026 1:30 PM', notes: 'Healing; no surgery for now. Next visit Friday 10/02 at 1:30 PM.' }
    ],
    treatmentNotes: 'No health insurance: Riverton Orthopedic is treating under a letter of protection (09/12/2026).',
    pd: null, lit: null, finance: [],
    docs: [
        { cat: 'Case Files', summary: 'Retainer (09/09/2026). Ride receipt ZR-8841-2207. Client\'s photos of the brake lever.' },
        { cat: 'Others', summary: 'Preservation letter to ZipRide for scooter unit 4471 and its maintenance records (09/10/2026).' }
    ],
    notes: [
        { date: '09/09/2026', staff: 'Intake Specialist', text: 'Retainer signed. Told the client not to post about the crash or the case on social media, and not to talk to ZipRide or its insurer.' },
        { date: '09/21/2026', staff: 'Case Manager', text: 'ZipRide\'s insurer (CPLG) acknowledged the preservation letter. The scooter is in their warehouse; Atty. Okafor will schedule our expert\'s inspection.' }
    ],
    tasks: [{ date: '09/21/2026', staff: 'Paralegal', text: 'Schedule the joint scooter inspection with CPLG (Atty. Okafor to attend).' }],
    reception: {
        verify: 'Marcus Lee · DOB 05/19/2000 · 77 Canal Street or SSN last 4 (6619). Only the client is authorized.',
        calls: [
            { from: 'Marcus Lee (client)', ask: '"Can I post my crash video on TikTok? People should know these scooters are dangerous."', handle: 'That\'s a legal question: no opinion from the front desk. Remind him the file says not to post about the case, and take a message for Atty. Okafor (ext 203) / Tom Alvarez (ext 312).' },
            { from: 'Martin Blake, Continental Product Liability Group', ask: '"Claim CPLG-26-9044. Can your client come to our warehouse and look at the scooter with us?"', handle: 'Business caller. No scheduling or agreements about the evidence at the front desk, and never set up contact with the client: message Atty. Okafor (ext 203).' }
        ]
    }
},
{
    id: 'MC-29', caseNumber: 'LSH-2025-MVA-900513', level: 'Intermediate', programs: ['reception', 'cm', 'ea', 'md'],
    summary: 'Underinsured driver: the at-fault driver\'s $25,000 was paid; the client\'s own UM carrier agreed to $60,000. Her UM adjuster calls with only our case number.',
    client: { name: 'Denise Carter', phone: '(555) 010-6670', email: 'denise.carter@example.com', dob: '09/28/1981', ssn: 'XXX-XX-4307',
        address: '1450 Magnolia Heights Blvd, Riverton, GA 30319',
        emergency: { name: 'Ron Carter', phone: '(555) 010-6671', relationship: 'Husband' },
        employment: { status: 'Employed', employer: 'Riverton Unified School District', title: '4th Grade Teacher' } },
    caseType: 'MVA', phase: 'UM or UIM Settled', attorney: 'Atty. Marcus Reyes', caseManager: 'Priya Natarajan',
    dateOfLoss: '02/17/2025', sol: '02/17/2027', target: '$ 85,000.00',
    narrative: 'Client was hit head-on on Old Mill Road by a driver who crossed the center line (Brandon Voss, cited). Right knee ACL tear (surgery 05/2025) and a fractured left wrist. The other driver carried only $25,000 in liability coverage, which was tendered and accepted with the UM carrier\'s consent (06/2026). Her own UM/UIM carrier agreed to settle for $60,000 on 09/15/2026; the release is not signed yet.',
    injury: { primary: 'Right knee ACL tear', parts: 'Right knee, left wrist', type: 'Joint / ligament / tendon tear', surgery: 'Completed', details: 'Surgery 05/2025; fractured left wrist. Treatment complete.' },
    police: { agency: 'Georgia State Patrol', number: 'GSP-25-001937', officer: 'Tpr. R. Nance #588', narrative: 'Unit 2 (Voss) crossed the center line and struck Unit 1 (Carter) head-on. Driver 2 cited: failure to maintain lane.' },
    health: { carrier: 'Georgia Educators Health Plan', memberId: 'GEHP-3319027', group: 'RUSD-01' },
    bi: [{ holder: 'Brandon Voss', carrier: 'Budget Auto Insurance', policy: 'BAI-6632190', claim: 'BAI-25-22019', adjuster: 'Leah Morgan', contact: '(555) 010-7742', liability: 'Yes', limits: '$25,000 / $50,000 (tendered 06/2026)' }],
    pipum: [{ type: 'UM/UIM', holder: 'Denise Carter', carrier: 'Keystone Mutual Insurance', policy: 'KM-6620418', claim: 'KM-25-100872', adjuster: 'Dana Whitfield', contact: '(555) 010-7702', limits: '$100,000 / $300,000' }],
    liens: [{ type: 'HI Subro', entity: 'Georgia Educators Health Plan', file: 'GEHP-SUB-10277', amount: '$ 22,140.00' }],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '02/17/2025 – 02/17/2025', status: 'Discharged', charges: '$ 5,900.00' },
        { name: 'Northside Surgery Center', specialty: 'Surgery', phone: '(555) 010-3180', email: 'billing@northsidesc.example.com', dates: '05/06/2025 – 05/06/2025', status: 'Discharged', charges: '$ 31,200.00' },
        { name: 'Motion Physical Therapy', specialty: 'Physical Therapy (PT)', phone: '(555) 010-3390', email: 'billing@motionpt.example.com', dates: '05/20/2025 – 10/30/2025', status: 'Discharged', charges: '$ 7,450.00' }
    ],
    chrono: [
        { dos: ['05/06/2025'], facility: 'Northside Surgery Center', next: '', notes: 'ACL reconstruction, right knee.' },
        { dos: ['10/30/2025'], facility: 'Motion Physical Therapy', next: '', notes: 'Discharged from PT; full duty.' }
    ],
    treatmentNotes: 'Treatment complete 10/30/2025. Specials $44,550.',
    pd: null, lit: null,
    finance: [{ date: '07/02/2026', staff: 'Lien Negotiator', desc: 'BI tender $25,000 (Budget Auto) deposited to trust', amount: '$ 0.00' }],
    docs: [
        { cat: 'Case Files', summary: 'UM carrier\'s consent to settle with the BI carrier (06/12/2026). UM settlement agreed at $60,000 (09/15/2026); release not signed yet.' }
    ],
    notes: [
        { date: '09/15/2026', staff: 'Lead Attorney', text: 'UM settled for $60,000 with Dana Whitfield (Keystone Mutual). She will send the release to us; the client signs it with Priya. Nothing is paid out until the release is signed and the health plan lien is resolved.' },
        { date: '09/23/2026', staff: 'Case Manager', text: 'Client asked when she will be paid. Told her: the release first, then the lien, then the settlement statement. No date promised.' }
    ],
    tasks: [{ date: '09/23/2026', staff: 'Case Manager', text: 'Watch for the UM release from Keystone Mutual; schedule the client\'s signing.' }],
    reception: {
        verify: 'Denise Carter · DOB 09/28/1981 · 1450 Magnolia Heights Blvd or SSN last 4 (4307). Only the client is authorized (her husband is the emergency contact only).',
        calls: [
            { from: 'Dana Whitfield, Keystone Mutual (the client\'s UM carrier)', ask: '"I\'m calling on your case number LSH-2025-MVA-900513. Where do I send the release, and who does the check go to?"', handle: 'Business caller: find the file by the case number (Denise Carter). No payment or release instructions from the front desk: route to Priya Natarajan (ext 311) or Atty. Reyes (ext 201), and log a Note.' },
            { from: 'Denise Carter (client)', ask: '"When do I get my money from my own insurance?"', handle: 'Verify. The release comes first, then the health plan lien, then the settlement statement. No date or amount promises; offer a callback from Priya Natarajan (ext 311).' }
        ]
    }
},
{
    id: 'MC-30', caseNumber: 'LSH-2025-BOAT-900771', level: 'Intermediate', programs: ['reception', 'cm', 'ea', 'md'],
    summary: 'A rental pontoon boat\'s railing gave way. Settled and in disbursement; Medicare is being paid first. His daughter holds a power of attorney.',
    client: { name: 'Harold Jenkins', phone: '(555) 010-6680', email: '', dob: '12/12/1948', ssn: 'XXX-XX-7265',
        address: '31 Lakeview Terrace, Riverton, GA 30331',
        emergency: { name: 'Sharon Jenkins-Wade', phone: '(555) 010-6681', relationship: 'Daughter (POA)' },
        employment: { status: 'Retired', employer: '', title: 'Retired postal carrier' } },
    caseType: 'Others', caseTypeOther: 'Boating', phase: 'Disbursement', attorney: 'Atty. Marcus Reyes', caseManager: 'Tom Alvarez',
    dateOfLoss: '06/22/2025', sol: '06/22/2027', target: '$ 120,000.00',
    narrative: 'Client rented a pontoon boat from Lake Riverton Marina with his family. While he leaned on the side railing to help his grandson aboard, a railing post gave way and he fell onto the dock. Hip fracture (surgery) and a torn rotator cuff. The marina\'s own log shows the loose post was reported the week before. Settled 08/20/2026 for $120,000.',
    injury: { primary: 'Hip fracture', parts: 'Hip, shoulder', type: 'Fracture', surgery: 'Completed', details: 'Torn rotator cuff. Treatment complete.' },
    police: { agency: 'Riverton County Sheriff (Marine Unit)', number: 'RCSO-M-25-0622', officer: 'Dep. K. Oyelaran #319', narrative: 'Injury at the Lake Riverton Marina fuel dock. Railing post found detached from the rental pontoon. Photos taken.' },
    health: { carrier: 'Medicare (Part A & B)', memberId: 'MBI 3TR8-KJ2-WQ61', group: '—' },
    bi: [{ holder: 'Lake Riverton Marina LLC', carrier: 'Seaboard Marine Insurance', policy: 'SMI-MAR-44120', claim: 'SMI-25-0918', adjuster: 'Gordon Welch', contact: '(555) 010-7746', liability: 'Yes', limits: '$1,000,000' }],
    pipum: [],
    liens: [{ type: 'Medical Lien', entity: 'Medicare (BCRC)', file: 'Case ID 25-0622-1187', amount: '$ 26,880.00' }],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '06/22/2025 – 06/27/2025', status: 'Discharged', charges: '$ 61,300.00' },
        { name: 'Riverton Rehabilitation Center', specialty: 'Other', specialtyOther: 'Inpatient Rehab', phone: '(555) 010-3470', email: 'records@rivertonrehab.example.com', dates: '06/27/2025 – 07/18/2025', status: 'Discharged', charges: '$ 22,500.00' },
        { name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '08/05/2025 – 03/10/2026', status: 'Discharged', charges: '$ 8,700.00' }
    ],
    chrono: [
        { dos: ['06/23/2025'], facility: 'St. Mary\'s Hospital', next: '', notes: 'Left hip fracture, pinned.' },
        { dos: ['03/10/2026'], facility: 'Riverton Orthopedic Associates', next: '', notes: 'Released from care; walks with a cane for distances.' }
    ],
    treatmentNotes: 'Treatment complete 03/10/2026.',
    pd: null, lit: null,
    finance: [{ date: '09/02/2026', staff: 'Lien Negotiator', desc: 'Settlement check $120,000 deposited to trust (cleared 09/09/2026)', amount: '$ 0.00' }],
    docs: [
        { cat: 'Case Files', summary: 'Durable power of attorney naming daughter Sharon Jenkins-Wade (2023). Release signed 08/27/2026 by the client with Sharon present.' },
        { cat: 'Invoices', summary: 'Medicare final demand $26,880 (09/18/2026), due within 60 days.' }
    ],
    notes: [
        { date: '09/18/2026', staff: 'Lien Negotiator', text: 'Medicare final demand $26,880 received. Paying it from trust; then the settlement statement goes to the client and Sharon.' },
        { date: '09/25/2026', staff: 'Case Manager', text: 'Sharon asked if the check can be mailed to her address instead of her father\'s. Told her Accounting and Atty. Reyes decide, on a written request from the client or the POA.' }
    ],
    tasks: [{ date: '09/25/2026', staff: 'Lien Negotiator', text: 'Pay the Medicare final demand by 11/17/2026 and confirm with the BCRC.' }],
    reception: {
        verify: 'Harold Jenkins · DOB 12/12/1948 · 31 Lakeview Terrace or SSN last 4 (7265). Daughter Sharon Jenkins-Wade holds a durable POA (authorized).',
        calls: [
            { from: 'Sharon Jenkins-Wade (daughter, POA)', ask: '"Is Dad\'s check ready? Can you mail it to my house?"', handle: 'Verify her (POA on file) with her father\'s DOB and address. Not ready: Medicare is paid first, then the settlement statement. Where the check goes is for Accounting (ext 500) and Atty. Reyes, on a written request; take a message. Log a Note.' },
            { from: 'Caller from "Settlement Funding Partners"', ask: '"We buy settlement payments. Is Mr. Jenkins getting a lump sum?"', handle: 'Not authorized. Don\'t confirm he is a client: "I can take a message." Nothing else.' }
        ]
    }
},
{
    id: 'MC-31', caseNumber: 'LSH-2025-DOG-900722', level: 'Starter', programs: ['reception', 'cm', 'md'],
    summary: 'Dog bite at a friend\'s barbecue. The insurer offered $30,000 and the client wants the front desk to tell her whether to take it.',
    client: { name: 'Tanya Reed', phone: '(555) 010-6690', email: 'tanya.reed@example.com', dob: '04/25/1990', ssn: 'XXX-XX-9582',
        address: '608 Dogwood Circle, Riverton, GA 30312',
        emergency: { name: 'Calvin Reed', phone: '(555) 010-6691', relationship: 'Brother' },
        employment: { status: 'Employed', employer: 'Riverton Dental Arts', title: 'Office Manager' } },
    caseType: 'Dog Bite', phase: 'BI Settlement Negotiations', attorney: 'Atty. David Okafor', caseManager: 'Grace Kim',
    dateOfLoss: '04/12/2025', sol: '04/12/2027', target: '$ 75,000.00',
    narrative: 'At a friend\'s backyard barbecue (host Gary Whitlock, 19 Hawthorn Lane), the host\'s pit-bull mix bit the client on the left hand and forearm. Two surgeries to repair tendons; permanent scarring and reduced grip. Homeowner\'s policy with Homestead Fire & Casualty. Demand $75,000 (07/2026); first offer $30,000 on 09/21/2026, open until 10/21/2026.',
    injury: { primary: 'Dog-bite injuries to the left hand and forearm (tendons)', parts: 'Left hand, left forearm', type: 'Laceration / bite / scarring', surgery: 'Completed', details: 'Two surgeries to repair tendons; permanent scarring and reduced grip.' },
    police: { agency: 'Riverton County Animal Control', number: 'RCAC-25-1204', officer: 'Officer M. Duran', narrative: 'Bite reported 04/12/2025. Dog vaccinated; 10-day home quarantine.' },
    health: { carrier: 'Blue Horizon PPO', memberId: 'BHP-7721045', group: 'RDA-OFFICE' },
    bi: [{ holder: 'Gary Whitlock', carrier: 'Homestead Fire & Casualty', policy: 'HFC-HO-339021', claim: 'HFC-25-01877', adjuster: 'Paul Irving', contact: '(555) 010-7644', liability: 'Yes', limits: '$300,000' }],
    pipum: [],
    liens: [{ type: 'HI Subro', entity: 'Blue Horizon PPO', file: 'BHP-SUB-55610', amount: '$ 18,230.00' }],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '04/12/2025 – 04/12/2025', status: 'Discharged', charges: '$ 3,100.00' },
        { name: 'Riverton Hand & Upper Extremity', specialty: 'Surgery', phone: '(555) 010-3230', email: 'billing@rivhand.example.com', dates: '04/20/2025 – 11/14/2025', status: 'Discharged', charges: '$ 24,600.00' },
        { name: 'Motion Physical Therapy', specialty: 'Physical Therapy (PT)', phone: '(555) 010-3390', email: 'billing@motionpt.example.com', dates: '05/05/2025 – 12/19/2025', status: 'Discharged', charges: '$ 5,880.00' }
    ],
    chrono: [
        { dos: ['04/20/2025', '08/11/2025'], facility: 'Riverton Hand & Upper Extremity', next: '', notes: 'Two tendon repair surgeries, left hand.' },
        { dos: ['12/19/2025'], facility: 'Motion Physical Therapy', next: '', notes: 'Discharged from hand therapy; permanent grip loss documented.' }
    ],
    treatmentNotes: 'Treatment complete 12/19/2025. Specials $33,580.',
    pd: null, lit: null,
    finance: [{ date: '07/14/2026', staff: 'Demand Specialist', desc: 'Certified mail, demand package', amount: '$ 18.40' }],
    docs: [{ cat: 'Case Files', summary: 'Demand $75,000 sent 07/14/2026. Offer $30,000 received 09/21/2026, open until 10/21/2026.' }],
    notes: [
        { date: '09/21/2026', staff: 'Associate Attorney', text: 'Offer $30,000 from Homestead, open until 10/21/2026. Meeting with the client 09/30 at 2:00 PM to go over it. Only the attorney discusses offers with the client.' },
        { date: '09/24/2026', staff: 'Case Manager', text: 'Client called asking if she should accept. Told her Atty. Okafor will go over it with her at the 09/30 meeting (2:00 PM, our office).' }
    ],
    tasks: [{ date: '09/21/2026', staff: 'Associate Attorney', text: 'Client meeting about the offer: 09/30/2026, 2:00 PM.' }],
    reception: {
        verify: 'Tanya Reed · DOB 04/25/1990 · 608 Dogwood Circle or SSN last 4 (9582). Only the client is authorized.',
        calls: [
            { from: 'Tanya Reed (client)', ask: '"They offered me thirty thousand. Should I take it? What would you do?"', handle: 'Verify. Never give an opinion on an offer. Remind her of her meeting with Atty. Okafor on 09/30 at 2:00 PM, or take a message for him (ext 203). Log a Note.' },
            { from: 'Paul Irving, Homestead Fire & Casualty', ask: '"Has Ms. Reed decided on our offer? It expires on the 21st."', handle: 'Business caller. No answer from the front desk: message Atty. Okafor (ext 203) with the claim number and the 10/21 deadline.' }
        ]
    }
},
{
    id: 'MC-32', caseNumber: 'LSH-2026-MVA-901203', level: 'Advanced', programs: ['reception', 'cm', 'md'],
    summary: 'The client fired his first lawyers and moved his case here. The old firm has a lien for its costs and fees, and its office calls about it.',
    client: { name: 'Ahmed Rahman', phone: '(555) 010-6700', email: 'ahmed.rahman@example.com', dob: '08/15/1985', ssn: 'XXX-XX-1147',
        address: '92 Cedar Ridge Lane, Riverton, GA 30323',
        emergency: { name: 'Samira Rahman', phone: '(555) 010-6701', relationship: 'Wife' },
        employment: { status: 'Employed', employer: 'Delta Freight Services', title: 'Diesel Mechanic' } },
    caseType: 'MVA', phase: 'BI Demanded', attorney: 'Atty. Marcus Reyes', caseManager: 'Tom Alvarez',
    dateOfLoss: '05/03/2025', sol: '05/03/2027', target: '$ 150,000.00',
    narrative: 'Client was rear-ended at highway speed on I-85 by a pickup (driver Scott Kerr) and pushed into the car ahead. L5-S1 disc herniation treated with injections, and a concussion. He first hired Hartley & Moss Law (06/2025), then signed with us on 04/10/2026 after they stopped returning his calls. Hartley & Moss asserted a lien for costs and fees. Policy-limits demand sent 09/01/2026.',
    injury: { primary: 'L5-S1 disc herniation', parts: 'Lower back, head', type: 'Spine / disc', surgery: 'No', details: 'Treated with injections; concussion.' },
    police: { agency: 'Georgia State Patrol', number: 'GSP-25-003318', officer: 'Tpr. A. Blake #611', narrative: 'Unit 3 (Kerr) failed to slow and struck Unit 2 (Rahman), which struck Unit 1. Driver 3 cited: following too closely.' },
    health: { carrier: 'Delta Freight Employee Health', memberId: 'DFE-2209187', group: 'DFS-MECH' },
    bi: [{ holder: 'Scott Kerr', carrier: 'Liberty Crest Insurance', policy: 'LC-7700315', claim: 'LC-25-60418', adjuster: 'Greg Hollis', contact: '(555) 010-7755 · ghollis@example.com', liability: 'Yes', limits: '$100,000 / $300,000' }],
    pipum: [{ type: 'UM/UIM', holder: 'Ahmed Rahman', carrier: 'Harbor Point Insurance', policy: 'HP-3301847', claim: 'HP-25-2290', adjuster: 'Irene Shaw', contact: '(555) 010-7811', limits: '$100,000 / $300,000' }],
    liens: [
        { type: 'Prior Atty Lien', entity: 'Hartley & Moss Law', file: 'HM-2025-0441', amount: '$ 3,850.00' },
        { type: 'HI Subro', entity: 'Delta Freight Employee Health', file: 'DFE-SUB-7710', amount: '$ 14,960.00' }
    ],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '05/03/2025 – 05/03/2025', status: 'Discharged', charges: '$ 4,400.00' },
        { name: 'Riverton Imaging Center', specialty: 'MRI / Imaging', phone: '(555) 010-3260', email: 'records@rivimaging.example.com', dates: '06/12/2025 – 06/12/2025', status: 'Discharged', charges: '$ 2,450.00' },
        { name: 'Riverton Pain Institute', specialty: 'Pain Management', phone: '(555) 010-3450', email: 'intake@rivertonpain.example.com', dates: '07/15/2025 – 06/02/2026', status: 'Discharged', charges: '$ 19,800.00' }
    ],
    chrono: [
        { dos: ['06/12/2025'], facility: 'Riverton Imaging Center', next: '', notes: 'Lumbar MRI: L5-S1 herniation.' },
        { dos: ['08/19/2025', '11/18/2025', '02/24/2026'], facility: 'Riverton Pain Institute', next: '', notes: 'Three epidural steroid injections. Released 06/02/2026.' }
    ],
    treatmentNotes: 'Treatment complete 06/2026. The prior firm\'s file was missing bills; all bills were requested again (05/2026).',
    pd: null, lit: null,
    finance: [{ date: '09/01/2026', staff: 'Demand Specialist', desc: 'Certified mail, demand package', amount: '$ 18.40' }],
    docs: [
        { cat: 'Case Files', summary: 'Substitution of counsel and the client\'s letter ending Hartley & Moss\'s representation (04/10/2026). Hartley & Moss lien letter (04/22/2026): costs $3,850 plus a claim for fees for their work.' },
        { cat: 'Case Files', summary: 'Policy-limits demand sent 09/01/2026; response due 10/01/2026.' }
    ],
    notes: [
        { date: '04/22/2026', staff: 'Lead Attorney', text: 'Hartley & Moss lien letter received. Atty. Reyes handles all contact with the prior firm; the front desk takes messages only and confirms nothing about the case.' },
        { date: '09/01/2026', staff: 'Demand Specialist', text: 'Demand sent to Greg Hollis (Liberty Crest). Response due 10/01/2026.' }
    ],
    tasks: [{ date: '09/01/2026', staff: 'Case Manager', text: 'Follow up with Greg Hollis on 09/28/2026 if no response.' }],
    reception: {
        verify: 'Ahmed Rahman · DOB 08/15/1985 · 92 Cedar Ridge Lane or SSN last 4 (1147). Only the client is authorized.',
        calls: [
            { from: 'Paralegal at Hartley & Moss Law (the client\'s former firm)', ask: '"We have a lien on Rahman. Has the case settled? We need to be paid out of it."', handle: 'Business caller, but the file says the front desk confirms nothing about the case to the prior firm. Take a message for Atty. Reyes (ext 201) with their file number (HM-2025-0441). Log a Note.' },
            { from: 'Ahmed Rahman (client)', ask: '"Did my old lawyers get a copy of the demand? I don\'t want them involved."', handle: 'Verify. Don\'t discuss the lien or strategy: message Atty. Reyes (ext 201) / Tom Alvarez (ext 312).' }
        ]
    }
},
{
    id: 'MC-33', caseNumber: 'LSH-2024-MVA-900242', level: 'Advanced', programs: ['reception', 'cm', 'ea', 'md'],
    summary: 'Settled; liens being negotiated, including a pre-settlement funding advance. The funding company calls with our case number, asking for amounts.',
    client: { name: 'Latoya Jackson', phone: '(555) 010-6710', email: 'latoya.jackson@example.com', dob: '01/09/1987', ssn: 'XXX-XX-6023',
        address: '240 Peachtree Commons, Unit 9, Riverton, GA 30306',
        emergency: { name: 'Darnell Jackson', phone: '(555) 010-6711', relationship: 'Husband' },
        employment: { status: 'Unemployed', employer: '', title: 'Former home health aide (unable to return)' } },
    caseType: 'MVA', phase: 'BI Settled', attorney: 'Atty. Elena Brooks', caseManager: 'Priya Natarajan',
    dateOfLoss: '10/15/2024', sol: '10/15/2026', target: '$ 95,000.00',
    narrative: 'Client\'s car was T-boned at Ash St and 9th Ave by a driver who ran a stop sign (Nora Fields). Pelvic fracture and a shoulder injury; she could not go back to her job as a home health aide. Settled 08/28/2026 for $95,000. Before the settlement she took a $6,000 pre-settlement advance from Bridgeway Legal Funding (03/2026), which must be paid back from the settlement.',
    injury: { primary: 'Pelvic fracture', parts: 'Pelvis, shoulder', type: 'Fracture', details: 'Shoulder injury; could not return to work as a home health aide.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-24-101533', officer: 'Ofc. M. Ruiz #2077', narrative: 'Unit 2 (Fields) failed to stop at the stop sign and struck Unit 1 (Jackson) on the driver side. Driver 2 cited.' },
    health: { carrier: 'Georgia Medicaid (CareSource)', memberId: 'CS-44120983', group: '—' },
    bi: [{ holder: 'Nora Fields', carrier: 'Budget Auto Insurance', policy: 'BAI-2208840', claim: 'BAI-24-33107', adjuster: 'Leah Morgan', contact: '(555) 010-7742', liability: 'Yes', limits: '$100,000 / $300,000' }],
    pipum: [],
    liens: [
        { type: 'Funding', entity: 'Bridgeway Legal Funding', file: 'BLF-26-0319', amount: '$ 6,000.00' },
        { type: 'Medical Lien', entity: 'Georgia Medicaid (CareSource)', file: 'GA-MCD-REC-88214', amount: '$ 17,420.00' }
    ],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '10/15/2024 – 10/20/2024', status: 'Discharged', charges: '$ 48,900.00' },
        { name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '11/04/2024 – 07/22/2025', status: 'Discharged', charges: '$ 9,300.00' },
        { name: 'Motion Physical Therapy', specialty: 'Physical Therapy (PT)', phone: '(555) 010-3390', email: 'billing@motionpt.example.com', dates: '12/02/2024 – 06/30/2025', status: 'Discharged', charges: '$ 6,700.00' }
    ],
    chrono: [
        { dos: ['10/15/2024'], facility: 'St. Mary\'s Hospital', next: '', notes: 'Pelvic fracture (non-surgical), right shoulder strain.' },
        { dos: ['07/22/2025'], facility: 'Riverton Orthopedic Associates', next: '', notes: 'Released; permanent lifting restrictions (no patient transfers).' }
    ],
    treatmentNotes: 'Treatment complete 07/2025.',
    pd: null, lit: null,
    finance: [{ date: '09/04/2026', staff: 'Lien Negotiator', desc: 'Settlement check $95,000 deposited to trust (cleared 09/11/2026)', amount: '$ 0.00' }],
    docs: [
        { cat: 'Case Files', summary: 'Release signed 08/28/2026. Bridgeway Legal Funding contract (03/2026): $6,000 advance; the payoff grows each month. The client signed an authorization letting Bridgeway be told the case STATUS only (no amounts, no medical details).' },
        { cat: 'Invoices', summary: 'Medicaid lien letter $17,420 (09/10/2026); reduction request sent 09/14/2026.' }
    ],
    notes: [
        { date: '09/14/2026', staff: 'Lien Negotiator', text: 'Medicaid reduction request sent. Bridgeway payoff letter requested (good through 10/31/2026). Bridgeway\'s authorization is status only: they may be told the case has settled and is in lien negotiations, nothing else, and never any amount.' },
        { date: '09/24/2026', staff: 'Case Manager', text: 'Client asked about her money. Waiting on Medicaid\'s answer; the settlement statement comes after that.' }
    ],
    tasks: [{ date: '09/24/2026', staff: 'Lien Negotiator', text: 'Follow up with the Medicaid recovery contractor by 10/09/2026.' }],
    reception: {
        verify: 'Latoya Jackson · DOB 01/09/1987 · 240 Peachtree Commons or SSN last 4 (6023). Bridgeway Legal Funding may be told the case STATUS only (no amounts, no medical details).',
        calls: [
            { from: 'Bridgeway Legal Funding', ask: '"Calling on your case number LSH-2024-MVA-900242, client Latoya Jackson. Did it settle, and for how much? We need our payoff."', handle: 'Business caller with a status-only authorization on file: you may say the case has settled and is in lien negotiations. Never give the settlement amount or a payment date. Route payoff questions to Rosa Delgado (ext 341). Log a Note.' },
            { from: 'Latoya Jackson (client)', ask: '"Why do I owe that funding company more than I borrowed?"', handle: 'Verify. Don\'t explain or interpret the funding contract: message Rosa Delgado (ext 341) / Priya Natarajan (ext 311).' }
        ]
    }
},
{
    id: 'MC-34', caseNumber: 'LSH-2025-PRL-900393', level: 'Advanced', programs: ['reception', 'cm', 'ea', 'md'],
    summary: 'Elevator dropped two floors in a medical office building. In litigation; the mediation center calls with our case number, and his wife wants the mediation time.',
    client: { name: 'Brian O\'Neill', phone: '(555) 010-6720', email: 'brian.oneill@example.com', dob: '10/03/1972', ssn: 'XXX-XX-5530',
        address: '18 Foxglove Court, Riverton, GA 30329',
        emergency: { name: 'Kathleen O\'Neill', phone: '(555) 010-6721', relationship: 'Wife' },
        employment: { status: 'Employed', employer: 'Riverton Title & Escrow', title: 'Escrow Officer' } },
    caseType: 'Premise Liability', phase: 'Mediation', attorney: 'Atty. Elena Brooks', caseManager: 'Tom Alvarez',
    dateOfLoss: '01/27/2025', sol: '01/27/2027', target: '$ 400,000.00',
    narrative: 'Client was in an elevator at Parkside Medical Plaza when it dropped about two floors and stopped hard. Two herniated neck discs; cervical fusion 10/2025. The building\'s elevator maintenance contractor (Apex Lift Services) had skipped two monthly inspections. Suit filed 07/08/2026 against the building owner and Apex (O\'Neill v. Parkside Medical Plaza LLC, et al., Riverton County State Court, No. 26-CV-03112). Mediation set for 10/21/2026.',
    injury: { primary: 'Two herniated neck discs', parts: 'Neck', type: 'Spine / disc', surgery: 'Completed', details: 'Cervical fusion 10/2025; life-care plan in progress.' },
    police: { agency: 'Riverton Fire Rescue', number: 'RFR-25-00917', officer: 'Capt. B. Irwin', narrative: 'Elevator entrapment, Parkside Medical Plaza, car 2. One occupant with neck pain transported. Building management notified its elevator contractor.' },
    health: { carrier: 'Blue Horizon PPO', memberId: 'BHP-3309128', group: 'RTE-EMP' },
    bi: [
        { holder: 'Parkside Medical Plaza LLC', carrier: 'Keystone Commercial', policy: 'KC-CGL-771039', claim: 'KC-25-80133', adjuster: 'Paul Dreyer', contact: '(555) 010-7870', liability: 'No', limits: '$2,000,000' },
        { holder: 'Apex Lift Services Inc.', carrier: 'Continental Product Liability Group', policy: 'CPLG-GL-2025-441', claim: 'CPLG-25-6618', adjuster: 'Irene Walsh', contact: '(555) 010-7992', liability: 'Pending', limits: '$5,000,000' }
    ],
    pipum: [],
    liens: [{ type: 'HI Subro', entity: 'Blue Horizon PPO', file: 'BHP-SUB-60771', amount: '$ 58,400.00' }],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '01/27/2025 – 01/27/2025', status: 'Discharged', charges: '$ 3,700.00' },
        { name: 'Riverton Neurosurgery Associates', specialty: 'Other', specialtyOther: 'Neurosurgery', phone: '(555) 010-3275', email: 'office@rivneurosurg.example.com', dates: '03/04/2025 – present', status: 'Ongoing', charges: '$ 12,400.00' },
        { name: 'Northside Surgery Center', specialty: 'Surgery', phone: '(555) 010-3180', email: 'billing@northsidesc.example.com', dates: '10/14/2025 – 10/14/2025', status: 'Discharged', charges: '$ 71,200.00' }
    ],
    chrono: [
        { dos: ['10/14/2025'], facility: 'Northside Surgery Center', next: '', notes: 'C5-C7 anterior cervical fusion.' },
        { dos: ['08/18/2026'], facility: 'Riverton Neurosurgery Associates', next: '11/03/2026 10:00 AM', notes: 'Fusion healing; permanent restrictions likely. Next visit Tuesday 11/03 at 10:00 AM.' }
    ],
    treatmentNotes: 'Billed to date $87,300, plus a life-care plan (planner retained 08/2026).',
    pd: null,
    lit: { sol: '01/27/2027', filed: '07/08/2026', cutoff: '03/15/2027', trial: '07/12/2027',
        rows: [
            { type: 'Interrogatories', party: 'Our responses to Apex Lift Services\' interrogatories', due: '10/09/2026', status: 'Pending' },
            { type: 'Motion', party: 'Parkside\'s motion to dismiss (hearing 10/27/2026)', due: '10/27/2026', status: 'Pending' },
            { type: 'Deposition Notice', party: 'Plaintiff Brian O\'Neill: 11/12/2026, 9:30 AM, at our office', due: '11/12/2026', status: 'Pending' }
        ] },
    finance: [
        { date: '07/08/2026', staff: 'Paralegal', desc: 'Filing fee and summons (2 defendants)', amount: '$ 276.00' },
        { date: '07/15/2026', staff: 'Paralegal', desc: 'Process server (2 defendants)', amount: '$ 170.00' }
    ],
    docs: [{ cat: 'Litigation Documents', summary: 'Complaint (07/08/2026). Order setting mediation: 10/21/2026, 9:00 AM, Riverton Dispute Resolution Center (mediator Hon. Carla Meade, ret.). Defense counsel: Voss & Tate LLP (Parkside), Lang & Ortiz (Apex).' }],
    notes: [
        { date: '09/16/2026', staff: 'Paralegal', text: 'Mediation 10/21 at 9:00 AM; the client must attend in person. Mediation prep with Atty. Brooks 10/14 at 3:00 PM.' },
        { date: '09/25/2026', staff: 'Case Manager', text: 'Client asked if his wife can come to the mediation. Atty. Brooks to decide; told him we would call back. His wife is the emergency contact only (not authorized).' }
    ],
    tasks: [
        { date: '09/16/2026', staff: 'Paralegal', text: 'Serve responses to Apex\'s interrogatories by 10/09/2026.' },
        { date: '09/16/2026', staff: 'Lead Attorney', text: 'Mediation prep with the client: 10/14/2026, 3:00 PM.' }
    ],
    reception: {
        verify: 'Brian O\'Neill · DOB 10/03/1972 · 18 Foxglove Court or SSN last 4 (5530). Only the client is authorized (wife Kathleen is the emergency contact only).',
        calls: [
            { from: 'Scheduling clerk, Riverton Dispute Resolution Center', ask: '"Confirming the mediation on your case number LSH-2025-PRL-900393, O\'Neill v. Parkside, October 21st at 9 AM. Will the plaintiff attend in person?"', handle: 'Business caller about a court-ordered date: don\'t confirm anything yourself. Transfer to Janelle Price (ext 221) or Atty. Brooks (ext 202); if unavailable, a priority message with the case number. Log a Note.' },
            { from: 'Kathleen O\'Neill (wife)', ask: '"What time is Brian\'s mediation? He can\'t remember."', handle: 'Not authorized (emergency contact only). Take a message and suggest Brian call himself.' }
        ]
    }
},
{
    id: 'MC-35', caseNumber: 'LSH-2026-PRL-901509', level: 'Intermediate', programs: ['reception', 'cm', 'md'],
    summary: 'A child hurt at a trampoline park. Her parents are divorced with joint custody and BOTH are authorized (unlike Sofia Morales, MC-10). A waiver the mother signed online is an issue.',
    client: { name: 'Emma Collins (minor), by her mother Sarah Collins', phone: '(555) 010-6730', email: 'sarah.collins@example.com', dob: '02/17/2015', ssn: 'XXX-XX-4488',
        address: '65 Birch Hollow Road, Riverton, GA 30334',
        emergency: { name: 'Michael Collins', phone: '(555) 010-6731', relationship: 'Father (joint custody, authorized)' },
        employment: { status: 'Student', employer: 'Riverton Middle School', title: 'Student (age 11)' } },
    caseType: 'Premise Liability', phase: 'Treating', attorney: 'Atty. David Okafor', caseManager: 'Grace Kim',
    dateOfLoss: '07/11/2026', sol: '02/17/2035', target: '',
    narrative: 'Emma (11) was at SkyHigh Trampoline Park for a birthday party. An older teen double-bounced her on a court where staff let mixed ages jump together, against the park\'s own posted rules; she landed badly and broke her left thigh bone (surgery, rod placed). Her mother signed the park\'s online waiver when she booked the party; Atty. Okafor is reviewing whether it applies to a minor.',
    injury: { primary: 'Broken left thigh bone (femur)', parts: 'Left thigh', type: 'Fracture', surgery: 'Completed', details: 'Surgery with a rod placed; back at school on crutches.' },
    police: { agency: 'None (park incident report only)', number: 'SkyHigh IR-0711-06', officer: 'Floor manager Tasha Greene', narrative: 'Guest (minor) injured on court 3 during open jump. Parents called; EMS transported.' },
    health: { carrier: 'Peach State Health Plan', memberId: 'PSH-66102299', group: 'GRP-73015' },
    bi: [{ holder: 'SkyHigh Trampoline Parks LLC', carrier: 'Allied Retail Casualty', policy: 'ARC-GL-551874', claim: 'ARC-26-60112', adjuster: 'Nadia Cole', contact: '(555) 010-7934', liability: 'Pending', limits: '$1,000,000' }],
    pipum: [],
    liens: [{ type: 'HI Subro', entity: 'Peach State Health Plan', file: 'PSH-SUB-81020', amount: '$ 38,650.00' }],
    facilities: [
        { name: 'Riverton Children\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3150', email: 'him@rivchildrens.example.com', dates: '07/11/2026 – 07/14/2026', status: 'Discharged', charges: '$ 41,200.00' },
        { name: 'Riverton Pediatric Orthopedics', specialty: 'Ortho', phone: '(555) 010-3165', email: 'office@rivpedsortho.example.com', dates: '07/28/2026 – present', status: 'Ongoing', charges: '$ 2,100.00' },
        { name: 'Motion Physical Therapy', specialty: 'Physical Therapy (PT)', phone: '(555) 010-3390', email: 'billing@motionpt.example.com', dates: '08/24/2026 – present', status: 'Ongoing', charges: '$ 1,540.00' }
    ],
    chrono: [
        { dos: ['07/11/2026'], facility: 'Riverton Children\'s Hospital', next: '', notes: 'Left femur fracture; rod (IM nail) placed.' },
        { dos: ['07/28/2026', '09/21/2026'], facility: 'Riverton Pediatric Orthopedics', next: '10/05/2026 4:15 PM', notes: 'Healing well. Next visit Monday 10/05 at 4:15 PM.' },
        { dos: ['08/24/2026', '09/25/2026'], facility: 'Motion Physical Therapy', next: '09/30/2026 3:45 PM', notes: 'PT twice a week after school. Next session Wednesday 09/30 at 3:45 PM.' }
    ],
    treatmentNotes: 'Emma is back at school on crutches.',
    pd: null, lit: null, finance: [],
    docs: [{ cat: 'Case Files', summary: 'Retainer signed by the mother, Sarah Collins (07/20/2026). Custody order (2021): joint legal custody; both parents may receive case information. SkyHigh online waiver (signed by Sarah 06/30/2026).' }],
    notes: [
        { date: '07/20/2026', staff: 'Intake Specialist', text: 'Both parents are authorized (joint legal custody order in the Doc Hub). The mother is the main contact; the father, Michael, calls too. Emma is 11: don\'t discuss the case with her if she calls.' },
        { date: '09/22/2026', staff: 'Case Manager', text: 'Father asked for the PT schedule; gave it to him (authorized). Mother prefers texts, not calls, during work hours.' }
    ],
    tasks: [{ date: '09/22/2026', staff: 'Associate Attorney', text: 'Review the SkyHigh waiver (minor) and send a memo to Atty. Reyes by 10/09/2026.' }],
    reception: {
        verify: 'Minor Emma Collins · DOB 02/17/2015 · 65 Birch Hollow Road or SSN last 4 (4488). BOTH parents are authorized (joint custody order): Sarah Collins (mother, signed the retainer) and Michael Collins (father).',
        calls: [
            { from: 'Michael Collins (father)', ask: '"When is Emma\'s next orthopedic appointment? I have her that week."', handle: 'Verify with Emma\'s DOB and the address or SSN last 4 on file: he is authorized (joint custody). Riverton Pediatric Orthopedics, Monday 10/05/2026 at 4:15 PM. Log a Note.' },
            { from: 'Manager at SkyHigh Trampoline Parks', ask: '"The mom signed our waiver, so there\'s no case, right? Can I talk to her?"', handle: 'Opposing party: don\'t discuss the waiver or the case, and don\'t put them in touch with the client. Take a message for Atty. Okafor (ext 203).' }
        ]
    }
},
{
    id: 'MC-36', caseNumber: 'LSH-2026-PEDE-902235', level: 'Starter', programs: ['reception', 'intake', 'cm', 'md'],
    summary: 'Brand-new file: a pedestrian hit in a crosswalk by a delivery van. Retainer signed yesterday; intake packet still missing; no case manager yet. His employer\'s HR calls.',
    client: { name: 'Walter Grant', phone: '(555) 010-6740', email: 'walter.grant@example.com', dob: '06/30/1968', ssn: 'XXX-XX-3371',
        address: '504 Riverbend Parkway, Riverton, GA 30317',
        emergency: { name: 'Loretta Grant', phone: '(555) 010-6741', relationship: 'Wife' },
        employment: { status: 'Employed', employer: 'Riverton Medical Supply', title: 'Sales Representative' } },
    caseType: 'Others', caseTypeOther: 'Pedestrian', phase: 'Intake', attorney: 'Atty. David Okafor', caseManager: '',
    dateOfLoss: '09/22/2026', sol: '09/22/2028', target: '',
    narrative: 'Client was crossing Harbor Street in the marked crosswalk, with the walk signal, when a FreshCart grocery delivery van turned right and hit him. Broken left leg (tibia) and a head laceration. Intake call 09/25; retainer signed by e-sign 09/27/2026. Intake packet (HIPAA forms, insurance card, photos) not returned yet.',
    injury: { primary: 'Broken left leg (tibia)', parts: 'Left leg, head', type: 'Fracture', details: 'Head laceration.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-26-092219', officer: 'Ofc. T. Hale #2231', narrative: 'Pedestrian struck in the crosswalk by a right-turning van (FreshCart Delivery, driver Leon Fry). Driver cited: failure to yield to a pedestrian.' },
    health: { carrier: 'Blue Horizon PPO', memberId: 'BHP-9910264', group: 'RMS-SALES' },
    bi: [{ holder: 'FreshCart Delivery LLC', carrier: 'TransAmerica Freight Insurance', policy: 'TFI-AU-990312', claim: 'TFI-26-51770', adjuster: 'Carol Benning', contact: '(555) 010-7702', liability: 'Pending', limits: '$1,000,000' }],
    pipum: [], liens: [],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '09/22/2026 – 09/24/2026', status: 'Discharged', charges: '$ 14,300.00' },
        { name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '10/01/2026 – ', status: 'Ongoing', charges: '$ 0.00' }
    ],
    chrono: [
        { dos: ['09/22/2026'], facility: 'St. Mary\'s Hospital', next: '', notes: 'Left tibia fracture (splinted; surgery consult); 8 stitches to the scalp.' },
        { dos: [], facility: 'Riverton Orthopedic Associates', next: '10/01/2026 10:00 AM', notes: 'First orthopedic visit Thursday 10/01 at 10:00 AM: surgery decision.' }
    ],
    treatmentNotes: 'Brand-new file: collect the health insurance card and the ER discharge papers.',
    pd: null, lit: null, finance: [],
    docs: [{ cat: 'Case Files', summary: 'Retainer signed by e-sign 09/27/2026. Intake packet not returned yet (HIPAA forms, insurance card, photos).' }],
    notes: [
        { date: '09/25/2026', staff: 'Intake Specialist', text: 'Intake call; client was in the hospital until 09/24. Only the client is authorized. His employer (Riverton Medical Supply) is NOT authorized.' },
        { date: '09/27/2026', staff: 'Intake Specialist', text: 'Retainer signed. A case manager will be assigned this week. Intake packet sent by email.' }
    ],
    tasks: [{ date: '09/27/2026', staff: 'Intake Specialist', text: 'Get the intake packet back by 10/02/2026 and assign a case manager.' }],
    reception: {
        verify: 'Walter Grant · DOB 06/30/1968 · 504 Riverbend Parkway or SSN last 4 (3371). Only the client is authorized; his employer is not.',
        calls: [
            { from: 'HR at Riverton Medical Supply (his employer)', ask: '"When can Walter come back to work, and was this work-related?"', handle: 'Not authorized: the employer isn\'t on the file. Don\'t confirm he is a client. Take a message and suggest they speak with Walter. Log a Note.' },
            { from: 'Walter Grant (client)', ask: '"Who is my case manager? Nobody has called me."', handle: 'Verify. Brand-new file (retainer 09/27): a case manager is being assigned this week. Remind him to send back the intake packet (HIPAA forms, insurance card, photos). Message Intake (ext 100). Log a Note.' }
        ]
    }
},
/* ---------- Recep2: front-desk call scenarios (caller type, DOL, DOB, status, attorney availability and
   notes as given in the Recep2 sheet; four clients have two files each, told apart by the DOL) ---------- */
{
    id: 'MC-37',
    caseNumber: 'LSH-2025-MVA-902417',
    level: 'Intermediate',
    programs: ['reception'],
    summary: 'Recep2 · Adjuster call. Demanded file: client finished treatment long ago; waiting for the third party\'s adjuster to respond to the demand. Attorney available. Same client as MC-51 (check the DOL).',
    client: { name: 'Schuyler Beauchamp', phone: '(555) 010-6810', email: 'schuyler.beauchamp@example.com', dob: '01/03/2000', ssn: 'XXX-XX-5073', address: '22 Linden Row, Riverton, GA 30312', emergency: { name: 'Marisol Beauchamp', phone: '(555) 010-6811', relationship: 'Mother' }, employment: { status: 'Employed', employer: 'Riverton Parcel Hub', title: 'Package Handler' } },
    caseType: 'MVA',
    phase: 'BI Demanded',
    attorney: 'Atty. Marcus Reyes',
    caseManager: 'Tom Alvarez',
    dateOfLoss: '07/02/2025',
    sol: '07/02/2027',
    target: '',
    narrative: 'Client was driving home on Route 9 when a pickup ran the stop sign at Mill Road and hit the passenger side of his car. Neck and back strain. Treated at Align Chiropractic until he was released on 10/14/2025.',
    injury: { primary: 'Neck and back strain', parts: 'Neck, back', type: 'Soft tissue (sprain / strain)', details: 'Chiropractic until released 10/14/2025.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-25-070214', officer: 'Ofc. R. Nunez #1876', narrative: 'Unit 2 (Dale Pruitt, Ford F-150) failed to stop at the stop sign and struck Unit 1 (Beauchamp, Toyota Corolla) on the passenger side. Driver 2 cited: failure to obey a stop sign.' },
    health: { carrier: 'Peach State Health Plan', memberId: 'PSH-7730915', group: 'RPH-OPS' },
    bi: [
        { holder: 'Dale Pruitt', carrier: 'Summit Casualty Insurance', policy: 'SCI-AU-5518203', claim: 'SCI-25-40672', adjuster: 'Craig Donnelly', contact: '(555) 010-7730', liability: 'Yes', limits: '$50,000 / $100,000' }
    ],
    pipum: [],
    liens: [],
    facilities: [
        { name: 'Align Chiropractic', specialty: 'Chiro', phone: '(555) 010-3240', email: 'billing@alignchiro.example.com', dates: '07/08/2025 – 10/14/2025', status: 'Discharged', charges: '$ 6,450.00' }
    ],
    chrono: [
        { dos: ['07/08/2025', '10/14/2025'], facility: 'Align Chiropractic', next: '', notes: 'Released from care 10/14/2025.' }
    ],
    treatmentNotes: 'Treatment finished 10/14/2025. All bills and records are in.',
    pd: null,
    lit: null,
    finance: [],
    docs: [
        { cat: 'Case Files', summary: 'BI demand sent to Summit Casualty (claim SCI-25-40672) on 03/10/2026. No response yet.' }
    ],
    notes: [
        { date: '03/10/2026', staff: 'Demand Specialist', text: 'BI demand sent to Summit Casualty, adjuster Craig Donnelly (555) 010-7730.' },
        { date: '09/15/2026', staff: 'Case Manager', text: 'Client finished treatment a long time ago. We\'re just waiting for the 3P\'s adjuster to respond to the demand. Only the client is authorized.' },
        { date: '09/29/2026', staff: 'Case Manager', text: 'Atty. Reyes is in the office and available today (ext 201).' }
    ],
    tasks: [
        { date: '09/29/2026', staff: 'Demand Specialist', text: 'Follow up with Summit Casualty on the demand response.' }
    ],
    reception: {
        verify: 'Schuyler Beauchamp · DOB 01/03/2000 · 22 Linden Row or SSN last 4 (5073). Two files: this one is DOL 07/02/2025 (the other, MC-51, is 12/05/2023). Only the client is authorized.',
        calls: [
            { from: 'Craig Donnelly, Summit Casualty (the other driver\'s adjuster)', ask: '"I got your demand on Schuyler Beauchamp. Is he still treating, and would he take $8,000 today?"', handle: 'Business caller: no identity check, route only. Don\'t confirm treatment and never accept or relay a decision on an offer. Atty. Reyes is available: transfer to him (ext 201), or take a complete message with the offer for him and Tom Alvarez (ext 312). Log a Note.' }
        ]
    }
},
{
    id: 'MC-38',
    caseNumber: 'LSH-2025-DOG-902428',
    level: 'Intermediate',
    programs: ['reception'],
    summary: 'Recep2 · Provider call. A child\'s dog-bite case in treatment: just finished physical therapy, started orthopedic treatment, missed 2 sessions. Attorney available.',
    client: { name: 'Saoirse Witwicky (minor), by her mother Gabriela Witwicky', phone: '(555) 010-6820', email: 'gabriela.witwicky@example.com', dob: '04/04/2016', ssn: 'XXX-XX-6148', address: '318 Cypress Hollow Drive, Riverton, GA 30314', emergency: { name: 'Gabriela Witwicky', phone: '(555) 010-6820', relationship: 'Mother / legal guardian (client contact)' }, employment: { status: 'Student', employer: 'Riverton Elementary', title: 'Student' } },
    caseType: 'Dog Bite',
    phase: 'Treating',
    attorney: 'Atty. Marcus Reyes',
    caseManager: 'Grace Kim',
    dateOfLoss: '02/11/2025',
    sol: '04/04/2036',
    target: '',
    narrative: 'Saoirse (8) was bitten on the left knee and calf by the neighbors\' dog, which got loose from their yard on Cypress Hollow Drive. ER stitches, then physical therapy for the knee; now orthopedic follow-up for knee stiffness. Minor client: her mother Gabriela is the client contact (SOL runs from her 18th birthday).',
    injury: { primary: 'Dog-bite wounds to the left knee and calf', parts: 'Left knee, left calf', type: 'Laceration / bite / scarring', details: 'ER stitches, then physical therapy; orthopedic follow-up for knee stiffness.' },
    police: { agency: 'Riverton County Animal Control', number: 'RCAC-25-0211', officer: 'Officer J. Tate', narrative: 'Dog (German shepherd mix, owners Frank and Diane Lott) left its yard and bit a child on the left leg. Dog quarantined 10 days; owners cited for dog at large.' },
    health: { carrier: 'Peach State Health Plan', memberId: 'PSH-4418702', group: 'RES-FAM' },
    bi: [
        { holder: 'Frank & Diane Lott (dog owners)', carrier: 'Homestead Fire & Casualty', policy: 'HFC-HO-5520931', claim: 'HFC-25-11408', adjuster: 'Ben Strauss', contact: '(555) 010-7741', liability: 'Yes', limits: '$300,000' }
    ],
    pipum: [],
    liens: [],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '02/11/2025 – 02/11/2025', status: 'Discharged', charges: '$ 2,870.00' },
        { name: 'Riverside Physical Therapy', specialty: 'Physical Therapy (PT)', phone: '(555) 010-3270', email: 'frontdesk@riversidept.example.com', dates: '02/24/2025 – 05/30/2025', status: 'Discharged', charges: '$ 4,120.00' },
        { name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '06/03/2025 – ', status: 'Ongoing', charges: '$ 0.00' }
    ],
    chrono: [
        { dos: ['02/11/2025'], facility: 'St. Mary\'s Hospital', next: '', notes: 'Bite wounds cleaned and stitched; tetanus shot.' },
        { dos: ['02/24/2025', '05/30/2025'], facility: 'Riverside Physical Therapy', next: '', notes: 'Just finished physical therapy (05/30/2025).' },
        { dos: ['06/03/2025'], facility: 'Riverton Orthopedic Associates', next: '06/17/2025 3:30 PM', notes: 'Orthopedic treatment started. Missed 06/05 and 06/10 visits.' }
    ],
    treatmentNotes: 'Just finished physical therapy. Client started Orthopedic treatment. Client missed 2 sessions.',
    pd: null,
    lit: null,
    finance: [],
    docs: [
        { cat: 'Police Report', summary: 'Animal Control report RCAC-25-0211.' }
    ],
    notes: [
        { date: '06/02/2025', staff: 'Case Manager', text: 'Just finished physical therapy. Client started Orthopedic treatment.' },
        { date: '06/11/2025', staff: 'Case Manager', text: 'Client missed 2 sessions (orthopedic 06/05 and 06/10). Left a message for Mrs. Witwicky. Only the mother (guardian) is authorized.' },
        { date: '06/12/2025', staff: 'Case Manager', text: 'Atty. Reyes is available today (ext 201).' }
    ],
    tasks: [
        { date: '06/12/2025', staff: 'Case Manager', text: 'Reach Mrs. Witwicky about the missed orthopedic visits and reschedule.' }
    ],
    reception: {
        verify: 'Client contact is Gabriela Witwicky (mother/guardian). Verify with Saoirse\'s name and DOB (04/04/2016) plus 318 Cypress Hollow Drive or Saoirse\'s SSN last 4 (6148). No one else is authorized.',
        calls: [
            { from: 'Scheduling at Riverton Orthopedic Associates (provider)', ask: '"Saoirse Witwicky missed her last two appointments with us. Is the family still going ahead with the case? We need to know before we book more visits."', handle: 'Provider (business caller): don\'t discuss the case or its status. Take a complete message about the two missed visits for the case manager Grace Kim (ext 313), who follows up with the mother. Log a Note.' }
        ]
    }
},
{
    id: 'MC-39',
    caseNumber: 'LSH-2024-MVA-902439',
    level: 'Intermediate',
    programs: ['reception'],
    summary: 'Recep2 · Client\'s husband calls. Client is Mireille Featherstonhaugh; litigation, discovery; mediation set for June 24, 2025. Attorney in court.',
    client: { name: 'Mireille Featherstonhaugh', phone: '(555) 010-6830', email: 'mireille.featherstonhaugh@example.com', dob: '04/20/1994', ssn: 'XXX-XX-2297', address: '71 Fairview Terrace, Riverton, GA 30309', emergency: { name: 'Daniel Featherstonhaugh', phone: '(555) 010-6831', relationship: 'Husband' }, employment: { status: 'Employed', employer: 'Northgate Dental', title: 'Office Manager' } },
    caseType: 'MVA',
    phase: 'Litigation Discovery',
    attorney: 'Atty. Elena Brooks',
    caseManager: 'Grace Kim',
    dateOfLoss: '09/15/2024',
    sol: '09/15/2026',
    target: '',
    narrative: 'Client was stopped in traffic on Harbor Street when a sedan rear-ended her at speed. Neck and shoulder injuries; treated with chiropractic and physical therapy. Suit filed after the insurer disputed the damages; in discovery.',
    injury: { primary: 'Neck and shoulder injuries', parts: 'Neck, shoulder', type: 'Soft tissue (sprain / strain)', details: 'Chiropractic and physical therapy; treatment complete.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-24-091533', officer: 'Ofc. L. Ortiz #2044', narrative: 'Unit 2 (Kyle Mercer, Nissan Altima) struck the stopped Unit 1 (Featherstonhaugh, Honda CR-V) in the rear. Driver 2 cited: following too closely.' },
    health: { carrier: 'Peach State Health Plan', memberId: 'PSH-2290416', group: 'NGD-STAFF' },
    bi: [
        { holder: 'Kyle Mercer', carrier: 'Keystone Mutual Insurance', policy: 'KM-5580214', claim: 'KM-24-77310', adjuster: 'Laura Pike', contact: '(555) 010-7752', liability: 'Pending', limits: '$100,000 / $300,000' }
    ],
    pipum: [],
    liens: [],
    facilities: [
        { name: 'Align Chiropractic', specialty: 'Chiro', phone: '(555) 010-3240', email: 'billing@alignchiro.example.com', dates: '09/18/2024 – 01/22/2025', status: 'Discharged', charges: '$ 7,300.00' }
    ],
    chrono: [
        { dos: ['09/18/2024', '01/22/2025'], facility: 'Align Chiropractic', next: '', notes: 'Released from care 01/22/2025.' }
    ],
    treatmentNotes: 'Treatment complete (01/22/2025).',
    pd: null,
    lit: { sol: '09/15/2026', filed: '02/03/2025', cutoff: '08/29/2025', trial: '01/12/2026', rows: [{ type: 'Motion', party: 'Court-ordered mediation: 06/24/2025, 9:00 AM, Riverton Dispute Resolution Center', due: '06/24/2025', status: 'Pending' }] },
    finance: [],
    docs: [
        { cat: 'Litigation Documents', summary: 'Complaint filed 02/03/2025. Order setting mediation for 06/24/2025.' }
    ],
    notes: [
        { date: '02/03/2025', staff: 'Paralegal', text: 'Complaint filed. Only the client, Mireille Featherstonhaugh, is authorized. Her husband Daniel is the emergency contact only.' },
        { date: '06/10/2025', staff: 'Paralegal', text: 'Client\'s name is Mireille Featherstonhaugh. Mediation set for June 24, 2025.' },
        { date: '06/16/2025', staff: 'Paralegal', text: 'Atty. Brooks is in court today. Messages to Janelle Price (ext 221).' }
    ],
    tasks: [
        { date: '06/16/2025', staff: 'Paralegal', text: 'Prepare the mediation summary by 06/20/2025.' }
    ],
    reception: {
        verify: 'Mireille Featherstonhaugh · DOB 04/20/1994 · 71 Fairview Terrace or SSN last 4 (2297). Only the client is authorized; her husband Daniel is the emergency contact only.',
        calls: [
            { from: 'Daniel Featherstonhaugh (Mireille\'s husband)', ask: '"When is my wife\'s mediation, and can I come with her?"', handle: 'Not authorized: only Mireille is on the file, so don\'t confirm the mediation, or even that she is a client, however much he knows. "I\'m not able to share any information, but I can take a message." Message for Janelle Price (ext 221); Atty. Brooks is in court. Log a Note.' }
        ]
    }
},
{
    id: 'MC-40',
    caseNumber: 'LSH-2020-PRL-902440',
    level: 'Starter',
    programs: ['reception'],
    summary: 'Recep2 · Client call. Litigation; arbitration set for Sep 11, 2023. Attorney in court. Same client as MC-48 (check the DOL).',
    client: { name: 'Niamh Cholmondeley', phone: '(555) 010-6840', email: 'niamh.cholmondeley@example.com', dob: '06/06/1998', ssn: 'XXX-XX-8816', address: '905 Juniper Lane, Apt 12, Riverton, GA 30318', emergency: { name: 'Paula Cholmondeley', phone: '(555) 010-6841', relationship: 'Mother' }, employment: { status: 'Employed', employer: 'Riverton Community College', title: 'Admissions Assistant' } },
    caseType: 'Premise Liability',
    phase: 'Arbitration',
    attorney: 'Atty. Elena Brooks',
    caseManager: 'Priya Natarajan',
    dateOfLoss: '11/29/2020',
    sol: '11/29/2022',
    target: '',
    narrative: 'Client fell on a broken, unlit stairwell in the Centerpoint parking garage downtown. Fractured right wrist (surgery) and a sprained ankle. The garage owner denied the claim; suit filed and sent to arbitration.',
    injury: { primary: 'Fractured right wrist', parts: 'Right wrist, ankle', type: 'Fracture', surgery: 'Completed', details: 'Sprained ankle.' },
    police: { agency: 'Centerpoint Parking security', number: 'CP-IR-20-1129', officer: 'Security Officer M. Grady', narrative: 'Patron fell on stairwell B, level 3; two stair lights out and a broken tread noted. Photos taken.' },
    health: { carrier: 'Peach State Health Plan', memberId: 'PSH-6630098', group: 'RCC-STAFF' },
    bi: [
        { holder: 'Centerpoint Parking LLC', carrier: 'Allied Retail Casualty', policy: 'ARC-GL-440198', claim: 'ARC-20-30912', adjuster: 'Sheila Novak', contact: '(555) 010-7763', liability: 'No', limits: '$1,000,000' }
    ],
    pipum: [],
    liens: [],
    facilities: [
        { name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '11/30/2020 – 06/15/2021', status: 'Discharged', charges: '$ 18,900.00' }
    ],
    chrono: [
        { dos: ['12/04/2020'], facility: 'Riverton Orthopedic Associates', next: '', notes: 'Right wrist ORIF surgery.' }
    ],
    treatmentNotes: 'Treatment complete (06/15/2021).',
    pd: null,
    lit: { sol: '11/29/2022', filed: '10/14/2022', cutoff: '06/30/2023', trial: '', rows: [{ type: 'Motion', party: 'Binding arbitration: 09/11/2023, 10:00 AM, Riverton Dispute Resolution Center', due: '09/11/2023', status: 'Pending' }] },
    finance: [],
    docs: [
        { cat: 'Litigation Documents', summary: 'Complaint filed 10/14/2022. Order sending the case to arbitration on 09/11/2023.' }
    ],
    notes: [
        { date: '07/20/2023', staff: 'Paralegal', text: 'Arbitration set for Sep 11, 2023. Only the client is authorized.' },
        { date: '08/28/2023', staff: 'Paralegal', text: 'Atty. Brooks is in court today. Messages to Janelle Price (ext 221).' }
    ],
    tasks: [
        { date: '08/28/2023', staff: 'Paralegal', text: 'Prep session with the client before the 09/11/2023 arbitration.' }
    ],
    reception: {
        verify: 'Niamh Cholmondeley · DOB 06/06/1998 · 905 Juniper Lane or SSN last 4 (8816). Two files: this one is DOL 11/29/2020 (the other, MC-48, is 10/10/2023). Only the client is authorized.',
        calls: [
            { from: 'Niamh Cholmondeley (client)', ask: '"What date is my arbitration again, and can I talk to Atty. Brooks?"', handle: 'Verify, and ask the DOL to open the right file (11/29/2020). Arbitration is set for 09/11/2023 (you can read a date on her own file to a verified client). Atty. Brooks is in court: take a message for her or Janelle Price (ext 221). No advice. Log a Note.' }
        ]
    }
},
{
    id: 'MC-41',
    caseNumber: 'LSH-2023-MVA-902451',
    level: 'Starter',
    programs: ['reception'],
    summary: 'Recep2 · Client call (a young child\'s case: the parent calls). Treating: physical therapy due to finish, orthopedic after PT. Attorney out of office.',
    client: { name: 'Cian Acheson (minor), by his mother Amber Acheson', phone: '(555) 010-6850', email: 'amber.acheson@example.com', dob: '04/04/2020', ssn: 'XXX-XX-3902', address: '14 Briar Glen Court, Riverton, GA 30316', emergency: { name: 'Amber Acheson', phone: '(555) 010-6850', relationship: 'Mother / legal guardian (client contact)' }, employment: { status: 'N/A', employer: '', title: '' } },
    caseType: 'MVA',
    phase: 'Treating',
    attorney: 'Atty. Marcus Reyes',
    caseManager: 'Priya Natarajan',
    dateOfLoss: '12/11/2023',
    sol: '04/04/2040',
    target: '',
    narrative: 'Cian (3) was in his car seat when the family car was T-boned at Oak Street and 5th. Hip and leg injuries; physical therapy, with orthopedic care to follow. Minor client: his mother Amber is the client contact (SOL runs from his 18th birthday).',
    injury: { primary: 'Hip and leg injuries', parts: 'Hip, leg', details: 'Physical therapy, with orthopedic care to follow.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-23-121108', officer: 'Ofc. D. Walsh #1902', narrative: 'Unit 2 (Terrence Boyd, Dodge Ram) ran the red light and struck Unit 1 (Acheson, Kia Sorento) on the driver side. Child passenger transported.' },
    health: { carrier: 'Peach State Health Plan', memberId: 'PSH-8812203', group: 'FAM-ACHESON' },
    bi: [
        { holder: 'Terrence Boyd', carrier: 'Summit Casualty Insurance', policy: 'SCI-AU-6630418', claim: 'SCI-23-58820', adjuster: 'Holly Stevens', contact: '(555) 010-7774', liability: 'Yes', limits: '$25,000 / $50,000' }
    ],
    pipum: [],
    liens: [],
    facilities: [
        { name: 'Riverside Physical Therapy', specialty: 'Physical Therapy (PT)', phone: '(555) 010-3270', email: 'frontdesk@riversidept.example.com', dates: '01/08/2024 – ', status: 'Ongoing', charges: '$ 3,960.00' }
    ],
    chrono: [
        { dos: ['01/08/2024'], facility: 'Riverside Physical Therapy', next: '', notes: 'Physical therapy is due to finish on June 1, 2023. Orthopedic will start after PT is done.' }
    ],
    treatmentNotes: 'Physical therapy is due to finish on June 1, 2023. Orthopedic will start after PT is done.',
    pd: null,
    lit: null,
    finance: [],
    docs: [
        { cat: 'Police Report', summary: 'Police report RPD-23-121108.' }
    ],
    notes: [
        { date: '05/20/2024', staff: 'Case Manager', text: 'Physical therapy is due to finish on June 1, 2023. Orthopedic will start after PT is done. Only the mother (guardian) is authorized.' },
        { date: '05/28/2024', staff: 'Case Manager', text: 'Atty. Reyes is out of the office this week. Messages to Priya Natarajan (ext 311).' }
    ],
    tasks: [
        { date: '05/28/2024', staff: 'Case Manager', text: 'Schedule the orthopedic referral once PT ends.' }
    ],
    reception: {
        verify: 'Client contact is Amber Acheson (mother/guardian). Verify with Cian\'s name and DOB (04/04/2020) plus 14 Briar Glen Court or Cian\'s SSN last 4 (3902).',
        calls: [
            { from: 'Amber Acheson (Cian\'s mother, the client contact)', ask: '"When does Cian\'s physical therapy end, and can I speak to the attorney today?"', handle: 'Verify the guardian (Cian\'s DOB plus the address or his SSN last 4). The file says PT is due to finish June 1, 2023, then orthopedic starts. Atty. Reyes is out of the office: offer the case manager Priya Natarajan (ext 311) or take a message. Log a Note.' }
        ]
    }
},
{
    id: 'MC-42',
    caseNumber: 'LSH-2023-MVA-902462',
    level: 'Intermediate',
    programs: ['reception'],
    summary: 'Recep2 · 1P adjuster call. Pending demand: the client\'s bills are incomplete and being collected. Attorney available. Same client as MC-49 (check the DOL).',
    client: { name: 'Mstislav Shaughnessy (minor), by his mother Tasha Shaughnessy', phone: '(555) 010-6860', email: 'tasha.shaughnessy@example.com', dob: '03/16/2015', ssn: 'XXX-XX-4417', address: '260 Ridgeview Avenue, Riverton, GA 30311', emergency: { name: 'Tasha Shaughnessy', phone: '(555) 010-6860', relationship: 'Mother / legal guardian (client contact)' }, employment: { status: 'Student', employer: 'Riverton Elementary', title: 'Student' } },
    caseType: 'MVA',
    phase: 'Pending Demand',
    attorney: 'Atty. Marcus Reyes',
    caseManager: 'Tom Alvarez',
    dateOfLoss: '12/03/2023',
    sol: '03/16/2035',
    target: '',
    narrative: 'Mstislav (8) was a passenger in his mother\'s car when an underinsured driver merged into them on I-85. Broken collarbone. Treatment is done; the file is being built for the demand. Minor client: his mother Tasha is the client contact.',
    injury: { primary: 'Broken collarbone', parts: 'Collarbone', type: 'Fracture', details: 'Treatment complete; the orthopedic bill has not come in yet.' },
    police: { agency: 'Georgia State Patrol', number: 'GSP-23-120377', officer: 'Tpr. K. Moss #611', narrative: 'Unit 2 (Rick Soto, Chevy Malibu) changed lanes into Unit 1 (Shaughnessy, Honda Pilot). Driver 2 cited: improper lane change.' },
    health: { carrier: 'Peach State Health Plan', memberId: 'PSH-5501876', group: 'FAM-SHAUGHNESSY' },
    bi: [
        { holder: 'Rick Soto', carrier: 'Keystone Mutual Insurance', policy: 'KM-6630127', claim: 'KM-23-81144', adjuster: 'Laura Pike', contact: '(555) 010-7752', liability: 'Yes', limits: '$25,000 / $50,000' }
    ],
    pipum: [
        { type: 'UM/UIM', holder: 'Tasha Shaughnessy', carrier: 'Harbor Point Insurance', policy: 'HP-3318046', claim: 'HP-23-7719', adjuster: 'Linda Cho', contact: '(555) 010-7815', limits: '$50,000 / $100,000' }
    ],
    liens: [],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '12/03/2023 – 12/03/2023', status: 'Discharged', charges: '$ 5,600.00' },
        { name: 'Riverton Orthopedic Associates', specialty: 'Ortho', phone: '(555) 010-3160', email: 'ortho@riverortho.example.com', dates: '12/08/2023 – 04/02/2024', status: 'Discharged', charges: '' }
    ],
    chrono: [
        { dos: ['12/08/2023', '04/02/2024'], facility: 'Riverton Orthopedic Associates', next: '', notes: 'Collarbone healed; released 04/02/2024.' }
    ],
    treatmentNotes: 'Treatment complete. Incomplete bills: the orthopedic bill has not come in yet.',
    pd: null,
    lit: null,
    finance: [],
    docs: [
        { cat: 'Bills', summary: 'ER bill in. Orthopedic bill requested 05/06/2024 and again 06/03/2024.' }
    ],
    notes: [
        { date: '06/03/2024', staff: 'Records Specialist', text: 'Incomplete bills for the client and is in the process of receiving them.' },
        { date: '06/10/2024', staff: 'Case Manager', text: 'Only the mother (guardian) is authorized. Atty. Reyes is available today (ext 201).' }
    ],
    tasks: [
        { date: '06/10/2024', staff: 'Records Specialist', text: 'Follow up on the orthopedic bill; then send the file for the demand.' }
    ],
    reception: {
        verify: 'Client contact is Tasha Shaughnessy (mother/guardian). Verify with Mstislav\'s name and DOB (03/16/2015) plus 260 Ridgeview Avenue or Mstislav\'s SSN last 4 (4417). Two files: this one is DOL 12/03/2023 (the other, MC-49, is 11/02/2021).',
        calls: [
            { from: 'Linda Cho, Harbor Point Insurance (the family\'s own UM carrier, 1P adjuster)', ask: '"I still don\'t have Mstislav Shaughnessy\'s bills. Can you just read me the totals?"', handle: 'Business caller: nothing read out over the phone. Bills are still being collected. Take a message for the case manager Tom Alvarez (ext 312), or transfer to Atty. Reyes (ext 201, available). Log a Note.' }
        ]
    }
},
{
    id: 'MC-43',
    caseNumber: 'LSH-2023-SNF-902473',
    level: 'Starter',
    programs: ['reception'],
    summary: 'Recep2 · Client call. Intake: the client was set for treatment last May 21, 2024. Attorney available. Same client as MC-50 (check the DOL).',
    client: { name: 'Bjorn Courthope', phone: '(555) 010-6870', email: 'bjorn.courthope@example.com', dob: '12/14/1988', ssn: 'XXX-XX-7751', address: '48 Quarry Hill Road, Riverton, GA 30319', emergency: { name: 'Lena Courthope', phone: '(555) 010-6871', relationship: 'Sister' }, employment: { status: 'Self-Employed', employer: 'Courthope Mobile Detailing', title: 'Owner' } },
    caseType: 'Slip and Fall',
    phase: 'Intake',
    attorney: 'Atty. David Okafor',
    caseManager: '',
    dateOfLoss: '05/10/2023',
    sol: '05/10/2025',
    target: '',
    narrative: 'Client slipped on a wet locker-room floor at IronWorks Fitness (no warning sign). Lower back and right hip pain. Intake file: treatment not confirmed yet.',
    injury: { primary: 'Lower back and right hip pain', parts: 'Lower back, right hip', details: 'Treatment not confirmed yet.' },
    police: { agency: 'IronWorks Fitness incident report', number: 'IWF-IR-230510', officer: 'Manager: S. Reeve', narrative: 'Member fell on the wet locker-room floor after cleaning; no wet-floor sign out. Ice pack given.' },
    health: { carrier: 'Blue Horizon PPO', memberId: 'PSH-3390772', group: 'IND-COURTHOPE' },
    bi: [
        { holder: 'IronWorks Fitness LLC', carrier: 'Allied Retail Casualty', policy: 'ARC-GL-551207', claim: 'ARC-23-51207', adjuster: 'Not yet assigned', contact: '(555) 010-7763', liability: 'Pending', limits: '$1,000,000' }
    ],
    pipum: [],
    liens: [],
    facilities: [
        { name: 'Peachtree Pain & Spine', specialty: 'Pain Management', phone: '(555) 010-3290', email: 'billing@peachtreepain.example.com', dates: '', status: 'Ongoing', charges: '$ 0.00' }
    ],
    chrono: [
        { dos: [], facility: 'Peachtree Pain & Spine', next: '05/21/2024 9:00 AM', notes: 'Client is set for treatment last May 21, 2024.' }
    ],
    treatmentNotes: 'Client is set for treatment last May 21, 2024.',
    pd: null,
    lit: null,
    finance: [],
    docs: [
        { cat: 'Case Files', summary: 'Retainer signed. Gym incident report requested.' }
    ],
    notes: [
        { date: '05/14/2024', staff: 'Intake Specialist', text: 'Client is set for treatment last May 21, 2024. Only the client is authorized.' },
        { date: '06/03/2024', staff: 'Intake Specialist', text: 'Atty. Okafor is available today (ext 203).' }
    ],
    tasks: [
        { date: '06/03/2024', staff: 'Intake Specialist', text: 'Confirm with Peachtree Pain & Spine whether the client went on 05/21/2024.' }
    ],
    reception: {
        verify: 'Bjorn Courthope · DOB 12/14/1988 · 48 Quarry Hill Road or SSN last 4 (7751). Two files: this one is DOL 05/10/2023 (the other, MC-50, is 04/11/2022). Only the client is authorized.',
        calls: [
            { from: 'Bjorn Courthope (client)', ask: '"I was supposed to start treatment back in May and I never went. Is my case still open?"', handle: 'Verify, and ask the DOL to open the right file (05/10/2023, the gym fall, in Intake). The file shows treatment was set for 05/21/2024. No advice on the case: transfer to Atty. Okafor (ext 203, available) or take a message for Intake (ext 100). Log a Note.' }
        ]
    }
},
{
    id: 'MC-44',
    caseNumber: 'LSH-2023-PRL-902484',
    level: 'Intermediate',
    programs: ['reception'],
    summary: 'Recep2 · Provider call. Treating: the client started treating Jan 12, 2024. Attorney available.',
    client: { name: 'Siobhan Masserene', phone: '(555) 010-6880', email: 'siobhan.masserene@example.com', dob: '11/20/1968', ssn: 'XXX-XX-5329', address: '1200 Oakmont Drive, Apt 3C, Riverton, GA 30310', emergency: { name: 'Raymond Masserene', phone: '(555) 010-6881', relationship: 'Husband' }, employment: { status: 'Employed', employer: 'Riverton Public Library', title: 'Library Assistant' } },
    caseType: 'Premise Liability',
    phase: 'Treating',
    attorney: 'Atty. Marcus Reyes',
    caseManager: 'Priya Natarajan',
    dateOfLoss: '12/30/2023',
    sol: '12/30/2025',
    target: '',
    narrative: 'Client fell on a broken outdoor stair at her apartment complex (Oakmont Apartments); the landlord had been told about the loose step. Lower back and left knee injuries.',
    injury: { primary: 'Lower back and left knee injuries', parts: 'Lower back, left knee', details: 'Pain management; started treating 01/12/2024.' },
    police: { agency: 'Oakmont Property Group incident report', number: 'OPG-IR-231230', officer: 'Property manager: T. Kline', narrative: 'Resident fell on the east stairwell; loose tread reported by residents on 12/12/2023, repair not completed.' },
    health: { carrier: 'Peach State Health Plan', memberId: 'PSH-1120569', group: 'RPL-STAFF' },
    bi: [
        { holder: 'Oakmont Property Group', carrier: 'Crestline Property & Casualty', policy: 'CPC-GL-771204', claim: 'CPC-24-00418', adjuster: 'Jill Harmon', contact: '(555) 010-7790', liability: 'Pending', limits: '$1,000,000' }
    ],
    pipum: [],
    liens: [],
    facilities: [
        { name: 'Peachtree Pain & Spine', specialty: 'Pain Management', phone: '(555) 010-3290', email: 'billing@peachtreepain.example.com', dates: '01/12/2024 – ', status: 'Ongoing', charges: '$ 2,340.00' }
    ],
    chrono: [
        { dos: ['01/12/2024', '02/09/2024'], facility: 'Peachtree Pain & Spine', next: '03/08/2024 10:30 AM', notes: 'Client started treating Jan 12, 2024.' }
    ],
    treatmentNotes: 'Client started treating Jan 12, 2024.',
    pd: null,
    lit: null,
    finance: [],
    docs: [
        { cat: 'Case Files', summary: 'Letter of representation sent to Crestline Property & Casualty.' }
    ],
    notes: [
        { date: '01/15/2024', staff: 'Case Manager', text: 'Client started treating Jan 12, 2024. Only the client is authorized.' },
        { date: '02/26/2024', staff: 'Case Manager', text: 'Atty. Reyes is available today (ext 201).' }
    ],
    tasks: [
        { date: '02/26/2024', staff: 'Case Manager', text: 'Check in with the client after her 03/08 visit.' }
    ],
    reception: {
        verify: 'Siobhan Masserene · DOB 11/20/1968 · 1200 Oakmont Drive or SSN last 4 (5329). Only the client is authorized.',
        calls: [
            { from: 'Billing at Peachtree Pain & Spine (provider)', ask: '"Siobhan Masserene has been treating with us since January 12th. Can you give me the landlord\'s insurance claim number so we can bill it?"', handle: 'Provider (business caller): don\'t read out claim numbers. Take the message for the case manager Priya Natarajan (ext 311), who decides what to send and where. Log a Note.' }
        ]
    }
},
{
    id: 'MC-45',
    caseNumber: 'LSH-2025-MVA-902495',
    level: 'Starter',
    programs: ['reception'],
    summary: 'Recep2 · Client call. Pending demand: the client just finished treatment; bills and records are being collected. Attorney available.',
    client: { name: 'Rhys Beaumont', phone: '(555) 010-6890', email: 'rhys.beaumont@example.com', dob: '01/01/1991', ssn: 'XXX-XX-6604', address: '33 Brantley Street, Riverton, GA 30308', emergency: { name: 'Monique Beaumont', phone: '(555) 010-6891', relationship: 'Wife' }, employment: { status: 'Employed', employer: 'Southline Freight', title: 'Forklift Operator' } },
    caseType: 'MVA',
    phase: 'Pending Demand',
    attorney: 'Atty. Marcus Reyes',
    caseManager: 'Tom Alvarez',
    dateOfLoss: '03/11/2025',
    sol: '03/11/2027',
    target: '',
    narrative: 'Client was rear-ended at a red light on Peachtree Parkway by a delivery van. Neck and lower back injuries; chiropractic and physical therapy, now finished.',
    injury: { primary: 'Neck and lower back injuries', parts: 'Neck, lower back', type: 'Soft tissue (sprain / strain)', details: 'Chiropractic and physical therapy, now finished.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-25-031127', officer: 'Ofc. R. Nunez #1876', narrative: 'Unit 2 (QuickDrop Couriers van, driver Ray Delacroix) struck the stopped Unit 1 (Beaumont, Chevy Impala) in the rear. Driver 2 cited: following too closely.' },
    health: { carrier: 'Peach State Health Plan', memberId: 'PSH-7009443', group: 'SLF-WHSE' },
    bi: [
        { holder: 'QuickDrop Couriers LLC', carrier: 'Keystone Mutual Insurance', policy: 'KM-7740088', claim: 'KM-25-80155', adjuster: 'Laura Pike', contact: '(555) 010-7752', liability: 'Yes', limits: '$100,000 / $300,000' }
    ],
    pipum: [],
    liens: [],
    facilities: [
        { name: 'Align Chiropractic', specialty: 'Chiro', phone: '(555) 010-3240', email: 'billing@alignchiro.example.com', dates: '03/14/2025 – 08/28/2025', status: 'Discharged', charges: '' },
        { name: 'Riverside Physical Therapy', specialty: 'Physical Therapy (PT)', phone: '(555) 010-3270', email: 'frontdesk@riversidept.example.com', dates: '05/05/2025 – 09/02/2025', status: 'Discharged', charges: '' }
    ],
    chrono: [
        { dos: ['09/02/2025'], facility: 'Riverside Physical Therapy', next: '', notes: 'Last visit; released.' }
    ],
    treatmentNotes: 'Client just finished treatment. In the process of collecting bills and records.',
    pd: null,
    lit: null,
    finance: [],
    docs: [
        { cat: 'Medical Records', summary: 'Records and bills requested from Align Chiropractic and Riverside PT on 09/08/2025.' }
    ],
    notes: [
        { date: '09/08/2025', staff: 'Records Specialist', text: 'Client just finished treatment. In the process of collecting bills and records.' },
        { date: '09/15/2025', staff: 'Case Manager', text: 'Only the client is authorized. Atty. Reyes is available today (ext 201).' }
    ],
    tasks: [
        { date: '09/15/2025', staff: 'Records Specialist', text: 'Follow up on the outstanding bills and records by 09/29/2025.' }
    ],
    reception: {
        verify: 'Rhys Beaumont · DOB 01/01/1991 · 33 Brantley Street or SSN last 4 (6604). Only the client is authorized.',
        calls: [
            { from: 'Rhys Beaumont (client)', ask: '"I finished my treatment. How much is my case worth, and when do I get paid?"', handle: 'Verify. No case value or timeline from the front desk. The file shows treatment just finished and bills and records are being collected before the demand. Message the case manager Tom Alvarez (ext 312) or offer Atty. Reyes (ext 201, available). Log a Note.' }
        ]
    }
},
{
    id: 'MC-46',
    caseNumber: 'LSH-2025-MVA-902506',
    level: 'Advanced',
    programs: ['reception'],
    summary: 'Recep2 · Uncooperative client. Treating: she should have finished physical therapy last week. Attorney available.',
    client: { name: 'Brittany Kirkcudbright', phone: '(555) 010-6900', email: 'brittany.kirkcudbright@example.com', dob: '09/13/1996', ssn: 'XXX-XX-2185', address: '612 Sycamore Bend Way, Riverton, GA 30315', emergency: { name: 'Curtis Kirkcudbright', phone: '(555) 010-6901', relationship: 'Brother' }, employment: { status: 'Employed', employer: 'Peach Street Café', title: 'Barista' } },
    caseType: 'MVA',
    phase: 'Treating',
    attorney: 'Atty. David Okafor',
    caseManager: 'Luis Ortega',
    dateOfLoss: '03/07/2025',
    sol: '03/07/2027',
    target: '',
    narrative: 'Client\'s car was sideswiped on Route 9 by a driver drifting out of his lane. Neck and shoulder strain; physical therapy.',
    injury: { primary: 'Neck and shoulder strain', parts: 'Neck, shoulder', type: 'Soft tissue (sprain / strain)', details: 'Physical therapy.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-25-030711', officer: 'Ofc. L. Ortiz #2044', narrative: 'Unit 2 (Mason Tully, Toyota Tacoma) drifted into Unit 1 (Kirkcudbright, Hyundai Elantra). Driver 2 cited: failure to maintain lane.' },
    health: { carrier: 'Peach State Health Plan', memberId: 'PSH-9951230', group: 'PSC-STAFF' },
    bi: [
        { holder: 'Mason Tully', carrier: 'Summit Casualty Insurance', policy: 'SCI-AU-7719032', claim: 'SCI-25-60117', adjuster: 'Craig Donnelly', contact: '(555) 010-7730', liability: 'Yes', limits: '$50,000 / $100,000' }
    ],
    pipum: [],
    liens: [],
    facilities: [
        { name: 'Riverside Physical Therapy', specialty: 'Physical Therapy (PT)', phone: '(555) 010-3270', email: 'frontdesk@riversidept.example.com', dates: '03/17/2025 – ', status: 'Ongoing', charges: '$ 3,150.00' }
    ],
    chrono: [
        { dos: ['03/17/2025', '06/20/2025'], facility: 'Riverside Physical Therapy', next: '', notes: 'Should have been finished with physical therapy last week.' }
    ],
    treatmentNotes: 'Should have been finished with physical therapy last week.',
    pd: null,
    lit: null,
    finance: [],
    docs: [
        { cat: 'Police Report', summary: 'Police report RPD-25-030711.' }
    ],
    notes: [
        { date: '07/07/2025', staff: 'Case Manager', text: 'Should have been finished with physical therapy last week. Client has not returned calls. Only the client is authorized.' },
        { date: '07/08/2025', staff: 'Case Manager', text: 'Atty. Okafor is available today (ext 203).' }
    ],
    tasks: [
        { date: '07/08/2025', staff: 'Case Manager', text: 'Reach the client about finishing PT; confirm the discharge date with Riverside PT.' }
    ],
    reception: {
        verify: 'Brittany Kirkcudbright · DOB 09/13/1996 · 612 Sycamore Bend Way or SSN last 4 (2185). Only the client is authorized.',
        calls: [
            { from: 'Brittany Kirkcudbright (client, uncooperative)', ask: '"Why do you people keep calling me about therapy? Just tell me what\'s going on with my case, you have all my information."', handle: 'Stay calm and polite. You can\'t discuss the case until she verifies (name, DOB and one more identifier). If she won\'t, offer a callback from her case manager Luis Ortega (ext 314) to the number on file. Don\'t read anything from the file to her. Log a Note.' }
        ]
    }
},
{
    id: 'MC-47',
    caseNumber: 'LSH-2023-SNF-902517',
    level: 'Intermediate',
    programs: ['reception'],
    summary: 'Recep2 · Clueless client. Litigation; arbitration set for Mar 12, 2025. Attorney in court.',
    client: { name: 'Saoirse Shaughnessy', phone: '(555) 010-6910', email: 'saoirse.shaughnessy@example.com', dob: '06/06/1955', ssn: 'XXX-XX-9046', address: '8 Chestnut Hill Road, Riverton, GA 30307', emergency: { name: 'Ruth Greene', phone: '(555) 010-6911', relationship: 'Daughter (emergency contact only)' }, employment: { status: 'Retired', employer: '', title: '' } },
    caseType: 'Slip and Fall',
    phase: 'Arbitration',
    attorney: 'Atty. Elena Brooks',
    caseManager: 'Grace Kim',
    dateOfLoss: '09/29/2023',
    sol: '09/29/2025',
    target: '',
    narrative: 'Client slipped on spilled juice in the produce aisle at FreshWay Grocers; no cone or sign. Fractured left hip (surgery). The store denied liability; suit filed and set for arbitration.',
    injury: { primary: 'Fractured left hip', parts: 'Left hip', type: 'Fracture', surgery: 'Completed', details: 'Treatment complete.' },
    police: { agency: 'FreshWay Grocers incident report', number: 'FWG-IR-230929', officer: 'Store manager: P. Dunn', narrative: 'Customer fell in aisle 2 (produce); spill not yet cleaned up. Ambulance called.' },
    health: { carrier: 'Medicare', memberId: 'MCR-1EG4-TE5-MK72', group: 'Medicare' },
    bi: [
        { holder: 'FreshWay Grocers Inc.', carrier: 'Allied Retail Casualty', policy: 'ARC-GL-660190', claim: 'ARC-23-66019', adjuster: 'Sheila Novak', contact: '(555) 010-7763', liability: 'No', limits: '$2,000,000' }
    ],
    pipum: [],
    liens: [{ type: 'Medical Lien', entity: 'Medicare (MSPRC)', file: 'MSP-23-448120', amount: '$ 21,400.00' }],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '09/29/2023 – 10/04/2023', status: 'Discharged', charges: '$ 38,900.00' }
    ],
    chrono: [
        { dos: ['09/30/2023'], facility: 'St. Mary\'s Hospital', next: '', notes: 'Left hip surgery.' }
    ],
    treatmentNotes: 'Treatment complete.',
    pd: null,
    lit: { sol: '09/29/2025', filed: '05/20/2024', cutoff: '01/15/2025', trial: '', rows: [{ type: 'Motion', party: 'Arbitration: 03/12/2025, 9:30 AM, Riverton Dispute Resolution Center', due: '03/12/2025', status: 'Pending' }] },
    finance: [],
    docs: [
        { cat: 'Litigation Documents', summary: 'Notice of arbitration for 03/12/2025 mailed to the client 02/20/2025.' }
    ],
    notes: [
        { date: '02/20/2025', staff: 'Paralegal', text: 'Arbitration set for Mar 12, 2025. Notice mailed to the client. Only the client is authorized; her daughter is the emergency contact only.' },
        { date: '03/03/2025', staff: 'Paralegal', text: 'Atty. Brooks is in court today. Messages to Janelle Price (ext 221).' }
    ],
    tasks: [
        { date: '03/03/2025', staff: 'Paralegal', text: 'Call the client to prepare for the 03/12/2025 arbitration and arrange her ride.' }
    ],
    reception: {
        verify: 'Saoirse Shaughnessy · DOB 06/06/1955 · 8 Chestnut Hill Road or SSN last 4 (9046). Only the client is authorized.',
        calls: [
            { from: 'Saoirse Shaughnessy (client, confused)', ask: '"I got a letter about an arbitration. What is that? Do I have to go to court? I don\'t understand any of this."', handle: 'Be patient and kind, and verify. The file shows the arbitration set for 03/12/2025. Don\'t explain the law or tell her what to do. Atty. Brooks is in court: take a message for Janelle Price (ext 221) to call her back today. Log a Note.' }
        ]
    }
},
{
    id: 'MC-48',
    caseNumber: 'LSH-2023-MVA-902528',
    level: 'Advanced',
    programs: ['reception'],
    summary: 'Recep2 · Defense counsel call. Litigation (deposition stage): deposition set for June 20, 2025. Attorney in court. Same client as MC-40 (check the DOL).',
    client: { name: 'Niamh Cholmondeley', phone: '(555) 010-6840', email: 'niamh.cholmondeley@example.com', dob: '06/06/1998', ssn: 'XXX-XX-8816', address: '905 Juniper Lane, Apt 12, Riverton, GA 30318', emergency: { name: 'Paula Cholmondeley', phone: '(555) 010-6841', relationship: 'Mother' }, employment: { status: 'Employed', employer: 'Riverton Community College', title: 'Admissions Assistant' } },
    caseType: 'MVA',
    phase: 'Deposition',
    attorney: 'Atty. Elena Brooks',
    caseManager: 'Priya Natarajan',
    dateOfLoss: '10/10/2023',
    sol: '10/10/2025',
    target: '',
    narrative: 'Client was hit head-on by a driver who crossed the center line on Old Mill Road. Broken ribs and a concussion. Suit filed; in discovery (depositions).',
    injury: { primary: 'Broken ribs and a concussion', parts: 'Ribs, head', type: 'Fracture', details: 'Treatment complete.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-23-101019', officer: 'Ofc. D. Walsh #1902', narrative: 'Unit 2 (Brian Kessler, Jeep Wrangler) crossed the center line and struck Unit 1 (Cholmondeley, Mazda 3) head-on. Driver 2 cited: failure to maintain lane.' },
    health: { carrier: 'Peach State Health Plan', memberId: 'PSH-6630098', group: 'RCC-STAFF' },
    bi: [
        { holder: 'Brian Kessler', carrier: 'Keystone Mutual Insurance', policy: 'KM-9913304', claim: 'KM-23-70442', adjuster: 'Laura Pike', contact: '(555) 010-7752', liability: 'Pending', limits: '$100,000 / $300,000' }
    ],
    pipum: [],
    liens: [],
    facilities: [
        { name: 'St. Mary\'s Hospital', specialty: 'Emergency Hospital', phone: '(555) 010-3100', email: 'him@stmarys.example.com', dates: '10/10/2023 – 10/12/2023', status: 'Discharged', charges: '$ 16,200.00' }
    ],
    chrono: [
        { dos: ['10/10/2023'], facility: 'St. Mary\'s Hospital', next: '', notes: 'Rib fractures; concussion.' }
    ],
    treatmentNotes: 'Treatment complete.',
    pd: null,
    lit: { sol: '10/10/2025', filed: '11/18/2024', cutoff: '09/30/2025', trial: '02/09/2026', rows: [{ type: 'Deposition Notice', party: 'Plaintiff Niamh Cholmondeley: 06/20/2025, 10:00 AM, at Hendricks & Vale LLP (defense counsel)', due: '06/20/2025', status: 'Pending' }] },
    finance: [],
    docs: [
        { cat: 'Litigation Documents', summary: 'Notice of deposition of the plaintiff for 06/20/2025 (Hendricks & Vale LLP).' }
    ],
    notes: [
        { date: '05/30/2025', staff: 'Paralegal', text: 'Deposition set for June 20, 2025. Defense counsel: Paul Hendricks, Hendricks & Vale LLP. Only the client is authorized.' },
        { date: '06/16/2025', staff: 'Paralegal', text: 'Atty. Brooks is in court today. Litigation calls to Janelle Price (ext 221).' }
    ],
    tasks: [
        { date: '06/16/2025', staff: 'Paralegal', text: 'Deposition prep with the client on 06/18/2025.' }
    ],
    reception: {
        verify: 'Niamh Cholmondeley · DOB 06/06/1998 · 905 Juniper Lane or SSN last 4 (8816). Two files: this one is DOL 10/10/2023 (the other, MC-40, is 11/29/2020). Only the client is authorized.',
        calls: [
            { from: 'Paul Hendricks, Hendricks & Vale LLP (defense counsel)', ask: '"We need to move Niamh Cholmondeley\'s deposition on June 20th. Can you confirm she\'ll be available the 27th instead?"', handle: 'Opposing counsel: don\'t confirm or agree to anything, and don\'t discuss the client\'s availability. A deposition within 7 days is urgent: Atty. Brooks is in court, so transfer to Janelle Price (ext 221) now or take a priority message. Log a Note.' }
        ]
    }
},
{
    id: 'MC-49',
    caseNumber: 'LSH-2021-MVA-902539',
    level: 'Advanced',
    programs: ['reception'],
    summary: 'Recep2 · Third-party adjuster probing for information. Demanded: demand packet sent last month; waiting for the adjuster\'s response. Attorney available. Same client as MC-42 (check the DOL).',
    client: { name: 'Mstislav Shaughnessy (minor), by his mother Tasha Shaughnessy', phone: '(555) 010-6860', email: 'tasha.shaughnessy@example.com', dob: '03/16/2015', ssn: 'XXX-XX-4417', address: '260 Ridgeview Avenue, Riverton, GA 30311', emergency: { name: 'Tasha Shaughnessy', phone: '(555) 010-6860', relationship: 'Mother / legal guardian (client contact)' }, employment: { status: 'Student', employer: 'Riverton Elementary', title: 'Student' } },
    caseType: 'MVA',
    phase: 'BI Demanded',
    attorney: 'Atty. Marcus Reyes',
    caseManager: 'Tom Alvarez',
    dateOfLoss: '11/02/2021',
    sol: '03/16/2035',
    target: '',
    narrative: 'Mstislav (6) was a passenger when a pickup rear-ended his mother\'s car at a school-zone crosswalk. Concussion and a wrist sprain; treatment finished. Minor client: his mother Tasha is the client contact.',
    injury: { primary: 'Concussion', parts: 'Head, wrist', type: 'Head injury / concussion', details: 'Wrist sprain; treatment complete.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-21-110245', officer: 'Ofc. T. Hale #2231', narrative: 'Unit 2 (Gary Lund, Ford F-250) failed to stop for traffic in the school zone and struck Unit 1 (Shaughnessy, Honda Pilot) in the rear.' },
    health: { carrier: 'Peach State Health Plan', memberId: 'PSH-5501876', group: 'FAM-SHAUGHNESSY' },
    bi: [
        { holder: 'Gary Lund', carrier: 'Allied Crest Insurance', policy: 'ACI-AU-2207741', claim: 'ACI-21-19077', adjuster: 'Nate Farris', contact: '(555) 010-7785', liability: 'Yes', limits: '$100,000 / $300,000' }
    ],
    pipum: [],
    liens: [],
    facilities: [
        { name: 'Riverton Pediatrics', specialty: 'Other', phone: '(555) 010-3310', email: 'records@riverpeds.example.com', dates: '11/03/2021 – 03/18/2022', status: 'Discharged', charges: '$ 4,880.00' }
    ],
    chrono: [
        { dos: ['11/03/2021', '03/18/2022'], facility: 'Riverton Pediatrics', next: '', notes: 'Released 03/18/2022.' }
    ],
    treatmentNotes: 'Treatment complete (03/18/2022).',
    pd: null,
    lit: null,
    finance: [],
    docs: [
        { cat: 'Case Files', summary: 'Demand packet sent to Allied Crest Insurance (claim ACI-21-19077) on 08/15/2022.' }
    ],
    notes: [
        { date: '08/15/2022', staff: 'Demand Specialist', text: 'Demand Packet sent to Allied Crest (adjuster Nate Farris).' },
        { date: '09/14/2022', staff: 'Case Manager', text: 'Demand Packet sent last month. Waiting for Adjuster\'s response. Only the mother (guardian) is authorized. Atty. Reyes is available today (ext 201).' }
    ],
    tasks: [
        { date: '09/14/2022', staff: 'Demand Specialist', text: 'Follow up with Allied Crest if no response by 09/30/2022.' }
    ],
    reception: {
        verify: 'Client contact is Tasha Shaughnessy (mother/guardian). Verify with Mstislav\'s name and DOB (03/16/2015) plus 260 Ridgeview Avenue or Mstislav\'s SSN last 4 (4417). Two files: this one is DOL 11/02/2021 (the other, MC-42, is 12/03/2023).',
        calls: [
            { from: 'Nate Farris, Allied Crest Insurance (the other driver\'s adjuster)', ask: '"I got the demand on Mstislav Shaughnessy. Quick questions: where does he go to school, is he playing sports again, and was he hurt before?"', handle: 'Third-party adjuster fishing for information: answer none of it (not school, activities, prior injuries, not even that the client is a minor). Transfer to Atty. Reyes (ext 201, available) or take a message. Log a Note.' }
        ]
    }
},
{
    id: 'MC-50',
    caseNumber: 'LSH-2022-MVA-902540',
    level: 'Advanced',
    programs: ['reception'],
    summary: 'Recep2 · Uncooperative client. Intake: the client hasn\'t started treating yet, according to the providers. Attorney available. Same client as MC-43 (check the DOL).',
    client: { name: 'Bjorn Courthope', phone: '(555) 010-6870', email: 'bjorn.courthope@example.com', dob: '12/14/1988', ssn: 'XXX-XX-7751', address: '48 Quarry Hill Road, Riverton, GA 30319', emergency: { name: 'Lena Courthope', phone: '(555) 010-6871', relationship: 'Sister' }, employment: { status: 'Self-Employed', employer: 'Courthope Mobile Detailing', title: 'Owner' } },
    caseType: 'MVA',
    phase: 'Intake',
    attorney: 'Atty. David Okafor',
    caseManager: '',
    dateOfLoss: '04/11/2022',
    sol: '04/11/2024',
    target: '',
    narrative: 'Client\'s work van was T-boned at the Main Street and 3rd intersection by a driver who ran the red light. Complains of back pain but has not started treatment.',
    injury: { primary: 'Back pain', parts: 'Back', details: 'Has not started treatment.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-22-041109', officer: 'Ofc. R. Nunez #1876', narrative: 'Unit 2 (Sandra Voight, Subaru Outback) ran the red light and struck Unit 1 (Courthope, Ford Transit) on the driver side. Driver 2 cited.' },
    health: { carrier: 'Blue Horizon PPO', memberId: 'PSH-3390772', group: 'IND-COURTHOPE' },
    bi: [
        { holder: 'Sandra Voight', carrier: 'Keystone Mutual Insurance', policy: 'KM-4410987', claim: 'KM-22-31986', adjuster: 'Not yet assigned', contact: '(555) 010-7752', liability: 'Pending', limits: '$50,000 / $100,000' }
    ],
    pipum: [],
    liens: [],
    facilities: [
        { name: 'Align Chiropractic', specialty: 'Chiro', phone: '(555) 010-3240', email: 'billing@alignchiro.example.com', dates: '', status: 'Ongoing', charges: '$ 0.00' }
    ],
    chrono: [
        { dos: [], facility: 'Align Chiropractic', next: '', notes: 'Client hasn\'t started treating yet according to providers.' }
    ],
    treatmentNotes: 'Client hasn\'t started treating yet according to providers.',
    pd: null,
    lit: null,
    finance: [],
    docs: [
        { cat: 'Case Files', summary: 'Retainer signed 04/18/2022.' }
    ],
    notes: [
        { date: '06/06/2022', staff: 'Intake Specialist', text: 'Client hasn\'t started treating yet according to providers. Only the client is authorized.' },
        { date: '06/13/2022', staff: 'Intake Specialist', text: 'Atty. Okafor is available today (ext 203).' }
    ],
    tasks: [
        { date: '06/13/2022', staff: 'Intake Specialist', text: 'Reach the client about starting treatment; confirm with Align Chiropractic.' }
    ],
    reception: {
        verify: 'Bjorn Courthope · DOB 12/14/1988 · 48 Quarry Hill Road or SSN last 4 (7751). Two files: this one is DOL 04/11/2022 (the other, MC-43, is 05/10/2023). Only the client is authorized.',
        calls: [
            { from: 'Bjorn Courthope (client, uncooperative)', ask: '"Stop having people call me about doctors. I feel fine. Just settle it and send me my money."', handle: 'Stay calm; verify, and ask the DOL (04/11/2022, the car accident). No legal advice and no promises. The providers say he hasn\'t started treating. Offer Atty. Okafor (ext 203, available) or take a message for Intake (ext 100). Log a Note.' }
        ]
    }
},
{
    id: 'MC-51',
    caseNumber: 'LSH-2023-MVA-902551',
    level: 'Intermediate',
    programs: ['reception'],
    summary: 'Recep2 · 1P adjuster call. Demanded: the client\'s last treatment was a month ago; the demand packet was sent to Geico for review. Attorney available. Same client as MC-37 (check the DOL).',
    client: { name: 'Schuyler Beauchamp', phone: '(555) 010-6810', email: 'schuyler.beauchamp@example.com', dob: '01/03/2000', ssn: 'XXX-XX-5073', address: '22 Linden Row, Riverton, GA 30312', emergency: { name: 'Marisol Beauchamp', phone: '(555) 010-6811', relationship: 'Mother' }, employment: { status: 'Employed', employer: 'Riverton Parcel Hub', title: 'Package Handler' } },
    caseType: 'MVA',
    phase: 'UM or UIM Demanded',
    attorney: 'Atty. Marcus Reyes',
    caseManager: 'Tom Alvarez',
    dateOfLoss: '12/05/2023',
    sol: '12/05/2025',
    target: '',
    narrative: 'Client was hit by an uninsured driver who backed out of a gas station into traffic on Route 9. Lower back injury. The at-fault driver had no insurance, so the claim is on the client\'s own uninsured motorist coverage with Geico.',
    injury: { primary: 'Lower back injury', parts: 'Lower back', details: 'Pain management.' },
    police: { agency: 'Riverton Police Department', number: 'RPD-23-120514', officer: 'Ofc. L. Ortiz #2044', narrative: 'Unit 2 (Curtis Lyle, Chevy Cavalier) pulled out of a gas station into Unit 1 (Beauchamp, Toyota Corolla). Driver 2 uninsured; cited for no insurance.' },
    health: { carrier: 'Peach State Health Plan', memberId: 'PSH-7730915', group: 'RPH-OPS' },
    bi: [
        { holder: 'Curtis Lyle', carrier: 'None (uninsured)', policy: '', claim: '', adjuster: '', contact: '', liability: 'Yes', limits: '$0' }
    ],
    pipum: [
        { type: 'UM/UIM', holder: 'Schuyler Beauchamp', carrier: 'Geico', policy: 'GEI-4471-22-908', claim: 'GC-23-0092451', adjuster: 'Pam Whitley', contact: '(555) 010-7796', limits: '$50,000 / $100,000' }
    ],
    liens: [],
    facilities: [
        { name: 'Peachtree Pain & Spine', specialty: 'Pain Management', phone: '(555) 010-3290', email: 'billing@peachtreepain.example.com', dates: '12/11/2023 – 07/08/2024', status: 'Discharged', charges: '$ 11,760.00' }
    ],
    chrono: [
        { dos: ['12/11/2023', '07/08/2024'], facility: 'Peachtree Pain & Spine', next: '', notes: 'Last treatment 07/08/2024.' }
    ],
    treatmentNotes: 'Client last treatment was from a month ago.',
    pd: null,
    lit: null,
    finance: [],
    docs: [
        { cat: 'Case Files', summary: 'UM demand packet sent to Geico (claim GC-23-0092451) on 08/01/2024.' }
    ],
    notes: [
        { date: '08/01/2024', staff: 'Demand Specialist', text: 'Client last treatment was from a month ago. Demand packet was sent to Geico for review.' },
        { date: '08/12/2024', staff: 'Case Manager', text: 'Only the client is authorized. Atty. Reyes is available today (ext 201).' }
    ],
    tasks: [
        { date: '08/12/2024', staff: 'Demand Specialist', text: 'Follow up with Geico (Pam Whitley) on the UM demand.' }
    ],
    reception: {
        verify: 'Schuyler Beauchamp · DOB 01/03/2000 · 22 Linden Row or SSN last 4 (5073). Two files: this one is DOL 12/05/2023 (the other, MC-37, is 07/02/2025). Only the client is authorized.',
        calls: [
            { from: 'Pam Whitley, Geico (the client\'s own UM carrier, 1P adjuster)', ask: '"I have the demand packet on Schuyler Beauchamp. Did he treat anywhere after his last visit a month ago?"', handle: 'Business caller (the client\'s own insurer, but still opposite the firm on this claim): no treatment details. Transfer to Atty. Reyes (ext 201, available) or take a message for him and Sam Whitaker (ext 331). Log a Note.' }
        ]
    }
},
{
    id: 'MC-52',
    caseNumber: 'LSH-2024-MVA-902562',
    level: 'Advanced',
    programs: ['reception'],
    summary: 'Recep2 · Court official call. Litigation, discovery: the plaintiff is out of the country. Attorney available.',
    client: { name: 'Cian Masserene', phone: '(555) 010-6920', email: 'cian.masserene@example.com', dob: '03/24/1970', ssn: 'XXX-XX-1388', address: '3401 Old Mill Road, Riverton, GA 30320', emergency: { name: 'Lucia Masserene', phone: '(555) 010-6921', relationship: 'Wife' }, employment: { status: 'Self-Employed', employer: 'Masserene Landscaping', title: 'Owner' } },
    caseType: 'MVA',
    phase: 'Litigation Discovery',
    attorney: 'Atty. Elena Brooks',
    caseManager: 'Luis Ortega',
    dateOfLoss: '10/11/2024',
    sol: '10/11/2026',
    target: '',
    narrative: 'Client\'s pickup was rear-ended on I-85 by a Kestrel Logistics tractor-trailer. Neck and back injuries with injections. Suit filed against the driver and the trucking company; in discovery.',
    injury: { primary: 'Neck and back injuries', parts: 'Neck, back', details: 'Treated with injections; treatment complete.' },
    police: { agency: 'Georgia State Patrol', number: 'GSP-24-101188', officer: 'Tpr. K. Moss #611', narrative: 'Unit 2 (Kestrel Logistics tractor-trailer) failed to slow for stopped traffic and struck Unit 1 (Masserene, Ford F-150) in the rear.' },
    health: { carrier: 'Blue Horizon PPO', memberId: 'PSH-4471190', group: 'IND-MASSERENE' },
    bi: [
        { holder: 'Kestrel Logistics Inc.', carrier: 'TransAmerica Freight Insurance', policy: 'TFI-AU-880412', claim: 'TFI-24-80233', adjuster: 'Carol Benning', contact: '(555) 010-7702', liability: 'Pending', limits: '$1,000,000' }
    ],
    pipum: [],
    liens: [],
    facilities: [
        { name: 'Peachtree Pain & Spine', specialty: 'Pain Management', phone: '(555) 010-3290', email: 'billing@peachtreepain.example.com', dates: '10/21/2024 – 05/30/2025', status: 'Discharged', charges: '$ 24,300.00' }
    ],
    chrono: [
        { dos: ['05/30/2025'], facility: 'Peachtree Pain & Spine', next: '', notes: 'Last injection; released.' }
    ],
    treatmentNotes: 'Treatment complete (05/30/2025).',
    pd: null,
    lit: { sol: '10/11/2026', filed: '04/07/2025', cutoff: '12/19/2025', trial: '', rows: [{ type: 'Interrogatories', party: 'Plaintiff\'s answers to the trucking company\'s interrogatories', due: '08/29/2025', status: 'Pending' }] },
    finance: [],
    docs: [
        { cat: 'Litigation Documents', summary: 'Complaint filed 04/07/2025 in Riverton County State Court.' }
    ],
    notes: [
        { date: '08/11/2025', staff: 'Paralegal', text: 'Plaintiff is out of the country. Only the client is authorized. Do not share his whereabouts with anyone.' },
        { date: '08/18/2025', staff: 'Paralegal', text: 'Atty. Brooks is in the office and available today (ext 202).' }
    ],
    tasks: [
        { date: '08/18/2025', staff: 'Paralegal', text: 'Ask the client when he returns; interrogatory answers due 08/29/2025.' }
    ],
    reception: {
        verify: 'Cian Masserene · DOB 03/24/1970 · 3401 Old Mill Road or SSN last 4 (1388). Only the client is authorized.',
        calls: [
            { from: 'Irene Park, clerk at Riverton County State Court (court official)', ask: '"The court needs the plaintiff at a status conference next Tuesday on Masserene v. Kestrel Logistics. Is Mr. Masserene in town?"', handle: 'Court calls are urgent: route now. Don\'t say where the plaintiff is (the note that he\'s out of the country is internal). Transfer to Atty. Brooks (ext 202, available) or Janelle Price (ext 221). Log a Note.' }
        ]
    }
}
];
/* =========================================================
   FRONT DESK DRILL: incoming calls (front-desk-drill.js)
   For each call the trainee must (1) find the caller's case in the
   CMS, (2) authenticate the caller by asking for identifiers and
   comparing them to the file, (3) choose how to handle it.
   `gives` is what the caller answers when asked (null = "I don't
   know / I'd rather not say"). `gives.dol` is the caller's answer for
   the date of the accident; without it they give the file's DOL.
   When two or more files share the client's name, the trainee must
   also ask for the DOL to earn the identifier points.
   `mock: null` = not in the system. `voice` ('f' or 'm') picks a
   female or male voice for the caller on a live call.
   auth codes: client · authorized · failed · unauthorized ·
   business · newcaller (labels in front-desk-drill.js).
   ========================================================= */
const DRILL_CALLS = [
    { id: 'D01', mock: 'MC-01', auth: 'client', level: 1, voice: 'f',
      opening: '"Hi, I\'m calling about my case. I lost my appointment card. When\'s my next chiropractor visit?"',
      gives: { name: 'Maria Santos', dob: '03/22/1988', address: '1187 Willow Bend Dr, Riverton', ssn4: '4821', callback: '(555) 010-4417', relationship: 'I\'m the client.', dol: 'June 9th, the car accident.' },
      actions: ['Tuesday 09/29/2026 at 10:30 AM at City Spine & Rehab (suggest she confirm with the clinic)', 'Thursday 10/01/2026 at 4:00 PM at City Spine & Rehab', 'Take a message; the front desk can\'t give out appointments', 'Tell her to call the clinic because you can\'t see appointments'],
      answer: 0, why: 'Verified client. Treatment tab: next chiro visit 09/29 at 10:30 AM (10/01 at 4:00 PM is physical therapy).' },
    { id: 'D02', mock: 'MC-01', auth: 'unauthorized', level: 1, voice: 'f',
      opening: '"Hi, this is Rosa. I\'m Maria Santos\'s cousin. Has her case settled yet? How much is she getting?"',
      gives: { name: 'Rosa Santos', dob: 'Her birthday? March-something, 1988.', address: null, ssn4: null, callback: '(555) 010-4490', relationship: 'Cousin.', dol: 'The car accident, back in June I think.' },
      actions: ['Take a message only, without confirming the firm represents Maria', 'Say the case is still in treatment', 'Share the status since she knows Maria\'s birthday', 'Transfer her to Atty. Reyes'],
      answer: 0, why: 'Only the client is authorized (Notes 06/12). A relative is not authorized, whatever she knows.' },
    { id: 'D03', mock: 'MC-06', auth: 'failed', level: 2, voice: 'm',
      opening: '"Yeah, this is James Wilson. Is my settlement check ready? I need it this week."',
      gives: { name: 'James Wilson', dob: '09/17/1983', address: 'I\'m at a new place, I\'d rather not say.', ssn4: 'I don\'t know it offhand.', callback: '(555) 010-4999', relationship: 'It\'s my case.', dol: 'January of last year. The box truck on I-85.' },
      actions: ['Explain you need one more identifier that matches the file; offer a callback from the case manager to the number on file', 'Give the check status; name and date of birth are enough', 'Ask for his full Social Security number instead', 'Hang up'],
      answer: 0, why: 'Only two identifiers (name, DOB). Anyone can find a DOB online. The rule is name + DOB + one more on file. His callback number doesn\'t match the file either.' },
    { id: 'D04', mock: 'MC-06', auth: 'client', level: 2, voice: 'm',
      opening: '"Hi, James Wilson. Quick one: can my buddy Troy pick up my settlement check for me?"',
      gives: { name: 'James Wilson', dob: '09/17/1983', address: '17 Birchwood Lane', ssn4: '3390', callback: '(555) 010-4962', relationship: 'I\'m the client.', dol: '01/12/2025, the truck crash.' },
      actions: ['Checks go only to the client with photo ID unless the attorney approves a signed written authorization; route to Accounting (ext 500) / Priya Natarajan', 'Yes, if Troy brings his ID', 'Yes, if James texts a photo of his ID', 'The check will be mailed, so it doesn\'t matter'],
      answer: 0, why: 'Verified client, but the front desk can\'t authorize a third-party pickup. (The check isn\'t ready yet anyway: Notes 09/24.)' },
    { id: 'D05', mock: 'MC-07', auth: 'client', level: 2, voice: 'f',
      opening: '"This is Keisha Brown. Nobody ever calls me back! I moved and I have a new number."',
      gives: { name: 'Keisha Brown', dob: '12/01/1995', address: '88 Elm Street, Apt 4 (my new place)', ssn4: '5149', callback: '(555) 010-5080', relationship: 'It\'s my case.' },
      actions: ['Verified by SSN last 4. Acknowledge, take the new phone and address, read them back, and send a priority message to Luis Ortega (ext 314)', 'Not verified: her address doesn\'t match, so end the call', 'Update the address in the CMS yourself and close the call', 'Tell her the case manager has been trying her old number'],
      answer: 0, why: 'The new address can\'t verify her, but the SSN last 4 matches the file. The case manager must update the file (Notes 09/18: her old mailbox was full).' },
    { id: 'D06', mock: 'MC-08', auth: 'authorized', level: 2, voice: 'f',
      opening: '"Hi, I\'m calling for my father, Tomás Rivera. What time is his surgery?"',
      gives: { name: 'Daniela Rivera', dob: 'His birthday is 04/18/1964.', address: '905 Mission Road', ssn4: null, callback: '(555) 010-5189', relationship: 'I\'m his daughter. I signed the authorization in July.' },
      actions: ['Authorized: 10/14/2026 at Northside Surgery Center, arrive 7:00 AM (pre-op labs 10/07)', 'Not authorized; only the client can get information', 'Surgery is 10/07', 'Transfer her to the surgeon\'s office'],
      answer: 0, why: 'Daniela is on the communication authorization (07/24/2026) and gave her father\'s DOB and address on file.' },
    { id: 'D07', mock: 'MC-10', auth: 'unauthorized', level: 3, voice: 'f',
      opening: '"I\'m Sofia Morales\'s mother, Angela Ruiz. I have a right to know what\'s happening with my daughter\'s case."',
      gives: { name: 'Angela Ruiz', dob: 'Sofia was born 06/02/2018.', address: 'Sofia lives with her dad on Orchard Lane.', ssn4: null, callback: '(555) 010-5390', relationship: 'I\'m her mother.' },
      actions: ['Respectfully take a message; share nothing (only Frank Morales, the guardian on file, is authorized)', 'Share the status; she\'s a parent and knows the child\'s DOB', 'Give her the next appointment only', 'Tell her she needs a court order'],
      answer: 0, why: 'Custody order and client instruction on file: no disclosure to Angela Ruiz without Frank\'s written authorization. Don\'t argue custody.' },
    { id: 'D08', mock: 'MC-10', auth: 'client', level: 2, voice: 'm',
      opening: '"Hi, Frank Morales, calling about my daughter Sofia\'s case. When\'s her next plastic surgeon appointment?"',
      gives: { name: 'Frank Morales', dob: 'Sofia: 06/02/2018.', address: '14 Orchard Lane', ssn4: '2718 (Sofia\'s)', callback: '(555) 010-5305', relationship: 'I\'m her father. I signed with you.' },
      actions: ['Verified guardian: Lakeside Plastic Surgery, 11/10/2026 at 3:30 PM', 'Not verified: only the client herself can call', '09/08/2026', 'Take a message for Priya'],
      answer: 0, why: 'Frank is the parent/guardian who signed the retainer. Treatment tab: next visit 11/10/2026 at 3:30 PM.' },
    { id: 'D09', mock: 'MC-04', auth: 'business', level: 2, voice: 'm',
      opening: '"Greg Hollis, Liberty Crest Insurance, about claim LC-25-99812. I\'ve got an offer: $65,000, open until Friday at 5."',
      gives: { name: 'Greg Hollis', dob: null, address: null, ssn4: null, callback: '(555) 010-7755', relationship: 'Adjuster for the at-fault driver.' },
      actions: ['Urgent: reach Atty. Marcus Reyes (ext 201) or Grace Kim (ext 313) now; otherwise a priority message with the amount and the deadline', 'Tell him the client wants the $100,000 limits', 'Call the client with the offer', 'Take a normal message for tomorrow'],
      answer: 0, why: 'An offer with a time limit is urgent. Never react to it or relay it to the client.' },
    { id: 'D10', mock: 'MC-02', auth: 'business', level: 2, voice: 'm',
      opening: '"Brent Kowalski, Allied Retail Casualty, claim ARC-26-44091. I\'d like to set up a quick recorded statement with your client."',
      gives: { name: 'Brent Kowalski', dob: null, address: null, ssn4: null, callback: '(555) 010-7931', relationship: 'Adjuster for the store.' },
      actions: ['Never agree to a recorded statement; message Atty. David Okafor (ext 203) with the claim number', 'Schedule it for next week', 'Give him the client\'s phone number', 'Confirm the client broke his wrist'],
      answer: 0, why: 'He also handles MC-09. The claim number puts this on Derek Thompson\'s file (MC-02). No statements or facts from the front desk.' },
    { id: 'D11', mock: 'MC-05', auth: 'business', level: 3, voice: 'f',
      opening: '"Hi, this is Voss & Tate, on Garcia v. Pine Ridge Property Management. We need to move the plaintiff\'s deposition on the 6th to the 13th."',
      gives: { name: 'Paula, assistant to Richard Voss', dob: null, address: null, ssn4: null, callback: '(555) 010-7990', relationship: 'Defense counsel\'s office.' },
      actions: ['Transfer to Janelle Price (ext 221) or Atty. Elena Brooks (ext 202); if unavailable, a priority message', 'Agree to the 13th', 'Tell her the client can\'t make the 13th', 'Ask her to email the client directly'],
      answer: 0, why: 'Depositions and court dates are never agreed at the front desk. The deposition is in 10 days.' },
    { id: 'D12', mock: 'MC-05', auth: 'authorized', level: 2, voice: 'm',
      opening: '"Hi, I\'m Linda Garcia\'s son. What time do I need to bring my mom in on the 2nd?"',
      gives: { name: 'Marco Garcia', dob: 'Mom\'s birthday is 05/09/1961.', address: '2200 Pine Ridge Blvd, Unit 14', ssn4: null, callback: '(555) 010-4851', relationship: 'Her son. I signed a form in May.' },
      actions: ['Authorized: deposition prep with Atty. Brooks on 10/02/2026 at 2:00 PM at our office', 'The deposition is 10/02 at 10:00 AM', 'Not authorized; take a message', 'Transfer to defense counsel'],
      answer: 0, why: 'Marco signed a communication authorization (05/2026). Prep is 10/02 at 2:00 PM; the deposition is 10/06 at 10:00 AM.' },
    { id: 'D13', mock: 'MC-13', auth: 'client', level: 3, voice: 'f',
      opening: '"Hi, Nicole Adams. I called last week. Is it too late for me to sue? The store\'s adjuster says I have plenty of time."',
      gives: { name: 'Nicole Adams', dob: '03/03/1984', address: '1520 Lakeshore Blvd', ssn4: '4470', callback: '(555) 010-5634', relationship: 'I\'m the one who got hurt.' },
      actions: ['Urgent: transfer to Atty. David Okafor (ext 203) or Intake (ext 100) now; no deadline advice', 'Tell her the statute runs 10/20/2026, so she has time', 'Agree with the adjuster', 'Book an intake appointment for next week'],
      answer: 0, why: 'The file flags the SOL as 10/20/2026. Deadline questions are legal advice; route them urgently.' },
    { id: 'D14', mock: 'MC-14', auth: 'unauthorized', level: 2, voice: 'f',
      opening: '"Hi, this is Jenna Park with Channel 8 News. Can you confirm your firm represents Carlos Mendoza in the Redline Freight crash, and when is the trial?"',
      gives: { name: 'Jenna Park', dob: null, address: null, ssn4: null, callback: '(555) 010-8800', relationship: 'Reporter.' },
      actions: ['"We have no comment." Take her name and number for Atty. Brooks (ext 202)', 'Confirm representation but not the trial date', 'Give the public court case number', 'Transfer her to the client'],
      answer: 0, why: 'File note 09/10: no media comment; all press to Atty. Brooks. Confirm nothing.' },
    { id: 'D15', mock: 'MC-15', auth: 'authorized', level: 2, voice: 'm',
      opening: '"Hi, I\'m calling about my mother\'s case, Patricia Lewis. Any update on more home-health hours?"',
      gives: { name: 'Michael Lewis', dob: 'Mom is 01/14/1946.', address: '12 Heritage Way', ssn4: null, callback: '(555) 010-5851', relationship: 'I\'m her son; I have power of attorney.' },
      actions: ['Authorized (POA): the case manager is checking with the provider and attorney, follow-up due 09/30; message Priya Natarajan (ext 311)', 'Not authorized; only Patricia can call', 'Approve the extra hours', 'Tell him to call Medicare'],
      answer: 0, why: 'Michael holds a durable POA on file. Tasks: call Michael re home-health hours by 09/30.' },
    { id: 'D16', mock: 'MC-15', auth: 'client', level: 2, voice: 'f',
      opening: '"Hello? This is Patricia Lewis… I got a letter. Am I supposed to pay the lawyer now? I can\'t afford it."',
      gives: { name: 'Patricia Lewis', dob: '01/14/1946', address: '12 Heritage Way', ssn4: '1507', callback: '(555) 010-5850', relationship: 'It\'s my case, dear.' },
      actions: ['Speak slowly; reassure her the retainer is contingency (no fee unless there is a recovery), ask for a copy of the letter and message Priya Natarajan (ext 311)', 'Tell her to ignore the letter', 'Transfer her to Accounting to set up payments', 'Tell her Medicare pays the lawyer'],
      answer: 0, why: 'Verified client. Doc Hub: contingency retainer. The letter may be from Medicare or a provider, so get a copy to the CM.' },
    { id: 'D17', mock: 'MC-16', auth: 'business', level: 3, voice: 'f',
      opening: '"This is the office of Attorney Sarah Klein. We now represent Hannah Pierce. Please send her complete file today."',
      gives: { name: 'Tina, paralegal for Atty. Sarah Klein', dob: null, address: null, ssn4: null, callback: '(555) 010-8120', relationship: 'New counsel\'s office.' },
      actions: ['Neutral and polite: ask for the signed client authorization/substitution in writing and route to Atty. Marcus Reyes (ext 201)', 'Email the file today', 'Refuse; the client still owes the firm', 'Call Hannah to ask if it\'s true'],
      answer: 0, why: 'Never release a file on a phone call. File note 09/24: any substitution or file request goes to Atty. Reyes.' },
    { id: 'D18', mock: 'MC-12', auth: 'business', level: 3, voice: 'm',
      opening: '"Parkway Collision here. We\'ve got a Buick LaCrosse, plate GA-HRS0808, sitting in our lot at $45 a day. Who\'s paying?"',
      gives: { name: 'Mike at Parkway Collision', dob: null, address: null, ssn4: null, callback: '(555) 010-6610', relationship: 'Body shop.' },
      actions: ['Priority message to Kevin Lam, PD Specialist (ext 351); don\'t promise payment', 'Tell him the insurance will pay', 'Tell him to release the car to the client', 'Transfer to Accounting'],
      answer: 0, why: 'Search by plate finds William Harris (MC-12). Storage is adding up and PD is Kevin Lam\'s.' },
    { id: 'D19', mock: 'MC-09', auth: 'business', level: 2, voice: 'f',
      opening: '"Premier Knee & Sports Medicine billing. Account PKS-5530. If we don\'t get paid by the 30th, this goes to collections."',
      gives: { name: 'Lorraine, billing office', dob: null, address: null, ssn4: null, callback: '(555) 010-3288', relationship: 'Provider billing.' },
      actions: ['Stay calm; a Letter of Protection is on file. Priority message to Rosa Delgado (ext 341) or Grace Kim (ext 313)', 'Promise payment by the 30th', 'Tell them to bill the client', 'Give them the settlement offer amount'],
      answer: 0, why: 'The account number matches Emily Nguyen\'s lien (MC-09). LOP on file; the lien negotiator handles it.' },
    { id: 'D20', mock: null, auth: 'newcaller', level: 1, voice: 'm',
      opening: '"Hi, my name is Tyler Brooks. I was rear-ended yesterday on the highway and I think I need a lawyer."',
      gives: { name: 'Tyler Brooks', dob: '07/30/1990', address: '45 Aspen Court', ssn4: null, callback: '(555) 010-8341', relationship: 'I\'m the one who was hit.', dol: 'Yesterday, on the highway.' },
      actions: ['Not in the system: transfer to Intake (ext 100) or take his details for Intake; no advice on the case', 'Open a case for him yourself', 'Tell him he has a strong case', 'Transfer him to Atty. Elena Brooks since they share a name'],
      answer: 0, why: 'No case on file (a search for "Brooks" finds Atty. Elena Brooks\'s cases, not him). New matters go to Intake.' },
    { id: 'D21', mock: 'MC-17', auth: 'client', level: 1, voice: 'm',
      opening: '"Hey, Andre Coleman. When do I get money for my bike? I can\'t work without it."',
      gives: { name: 'Andre Coleman', dob: '09/03/1991', address: '19 Riverside Walk, Apt 7', ssn4: '5582', callback: '(555) 010-6071', relationship: 'It\'s my case.' },
      actions: ['The bike claim is with the at-fault carrier; priority message to Kevin Lam (ext 351). No promises on amount or date', 'Tell him $2,400 is coming next week', 'Tell him to file with his own insurance', 'Transfer to Accounting'],
      answer: 0, why: 'Verified. Notes 09/02: PD claim with Harbor Point, waiting on the valuation (Kevin Lam).' },
    { id: 'D22', mock: 'MC-18', auth: 'business', level: 3, voice: 'm',
      opening: '"Martin Blake, Continental Product Liability Group, claim CPLG-26-7719. We\'d like to pick up the pressure cooker for testing this week."',
      gives: { name: 'Martin Blake', dob: null, address: null, ssn4: null, callback: '(555) 010-7988', relationship: 'Manufacturer\'s insurer.' },
      actions: ['Never release or agree to anything about evidence; priority message to Atty. Elena Brooks (ext 202)', 'Give him the SecureHold address', 'Agree to Thursday', 'Ask the client to bring it in'],
      answer: 0, why: 'File note 07/10: evidence stays at SecureHold; inspection requests go to Atty. Brooks.' },
    { id: 'D23', mock: 'MC-19', auth: 'business', level: 3, voice: 'f',
      opening: '"Deborah Kline, City of Riverton Risk Management. We received a notice of claim for Samuel Boateng. Can we get his recorded statement next week?"',
      gives: { name: 'Deborah Kline', dob: null, address: null, ssn4: null, callback: '(555) 010-7999', relationship: 'City risk management.' },
      actions: ['No statements or scheduling; route to Atty. Marcus Reyes (ext 201) with claim RM-26-0415', 'Schedule it; it\'s the city', 'Give her the client\'s number', 'Tell her the notice was late'],
      answer: 0, why: 'File note 08/14: all contact from the City goes to Atty. Reyes.' },
    { id: 'D24', mock: 'MC-20', auth: 'unauthorized', level: 3, voice: 'm',
      opening: '"This is Daniel Hammond. My dad George died in that crash in March. When does the family get the money?"',
      gives: { name: 'Daniel Hammond', dob: 'Dad was born 12/05/1949.', address: '8 Willow Creek Lane (Dad\'s house)', ssn4: null, callback: '(555) 010-6399', relationship: 'His son.' },
      actions: ['Offer condolences; he isn\'t authorized (only Carol, the administrator). Take a message for Atty. Brooks / Priya and suggest he speak with Carol', 'He knows the DOB and address, so share the status', 'Tell him the demand is with the attorney', 'Transfer to Accounting'],
      answer: 0, why: 'Knowing the decedent\'s details doesn\'t authorize him. Notes 05/21: only Carol Hammond.' },
    { id: 'D25', mock: 'MC-20', auth: 'authorized', level: 3, voice: 'f',
      opening: '"Hi, this is Carol Hammond, about my father George Hammond\'s case. Where do things stand?"',
      gives: { name: 'Carol Hammond', dob: 'Dad: 12/05/1949.', address: '8 Willow Creek Lane', ssn4: null, callback: '(555) 010-6307', relationship: 'I\'m his daughter and the administrator of his estate.' },
      actions: ['Verified administrator: the wrongful-death demand is in attorney review; offer a callback from Priya Natarajan (ext 311)', 'Not authorized; estates can\'t call', 'Tell her the value of the claim', 'Say nothing has happened'],
      answer: 0, why: 'Letters of administration name Carol. Notes 09/20: demand in attorney review.' },
    { id: 'D26', mock: 'MC-11', auth: 'failed', level: 2, voice: 'f',
      opening: '"Hi, Ngozi Okonkwo here. Did the hospital agree to reduce the lien yet?"',
      gives: { name: 'Ngozi Okonkwo', dob: '10/01/1979', address: 'Summit Terrace', ssn4: 'I don\'t have it with me.', callback: '(555) 010-5499', relationship: 'It\'s my case.' },
      actions: ['The DOB doesn\'t match the file: don\'t share; offer a callback from the case manager to the number on file', 'Close enough; share the status', 'Ask her to spell her name again and then share', 'Transfer to Rosa Delgado so she can check'],
      answer: 0, why: 'File DOB is 10/10/1979, not 10/01. Street name alone isn\'t a full address. Not verified.' },
    { id: 'D27', mock: 'MC-03', auth: 'business', level: 1, voice: 'f',
      opening: '"Monica Reyes-Hart, Homestead Fire & Casualty, claim HFC-26-02117. When am I getting the demand?"',
      gives: { name: 'Monica Reyes-Hart', dob: null, address: null, ssn4: null, callback: '(555) 010-7640', relationship: 'Homeowner\'s insurer.' },
      actions: ['Take a message for Tom Alvarez (ext 312) with her claim number; no dates or details', 'Tell her 10/02', 'Tell her it\'s with the attorney', 'Transfer to Atty. Marcus Reyes because the names match'],
      answer: 0, why: 'She also handles MC-10 and MC-22. Her claim number is Aisha Patel\'s (MC-03). No dates or details from the front desk.' },
    // Same name on several files (MC-01/21/22 Maria Santos, MC-06/23/24 James Wilson):
    // the date of the accident and the DOB decide which file the call belongs to.
    { id: 'D28', mock: 'MC-21', auth: 'client', level: 2, voice: 'f',
      opening: '"Hi, Maria Santos. When do I get my money from my fall at the pharmacy? It settled back in July."',
      gives: { name: 'Maria Santos', dob: '03/22/1988', address: '1187 Willow Bend Dr, Riverton', ssn4: '4821', callback: '(555) 010-4417', relationship: 'I\'m the client.', dol: 'January 14th, 2025. I fell at CareWay Pharmacy.' },
      actions: ['Settled; the firm is waiting on two lien reductions, so no date yet. Message Rosa Delgado (ext 341) / Grace Kim (ext 313)', 'Her case is still in treatment, so there\'s no money yet', 'The check will be ready this Friday', 'Transfer her to Accounting to pick up her check'],
      answer: 0, why: 'She has two files. The date of the fall (01/14/2025) puts the call on MC-21, not her 2026 car accident (MC-01, still in treatment). Notes 08/20: waiting on two lien reductions.' },
    { id: 'D29', mock: 'MC-01', auth: 'unauthorized', level: 3, voice: 'm',
      opening: '"Hi, this is Eduardo Santos, Maria\'s husband. You have my name on file. Did the other driver\'s insurance pay for her Civic yet?"',
      gives: { name: 'Eduardo Santos', dob: 'Maria\'s birthday is 03/22/1988.', address: '1187 Willow Bend Dr', ssn4: null, callback: '(555) 010-4418', relationship: 'Her husband.', dol: 'The car accident, June 9th this year.' },
      actions: ['He\'s authorized only on her 2025 pharmacy-fall file, not this car-accident file: take a message, share nothing', 'He\'s on file as authorized, so give the property-damage status', 'Tell him the claim is still open', 'Transfer him to Kevin Lam'],
      answer: 0, why: 'The car accident (DOL 06/09/2026) is MC-01, where only the client is authorized (Notes 06/12). Eduardo\'s authorization is on MC-21, the pharmacy fall, only. Authorization is per file.' },
    { id: 'D30', mock: 'MC-21', auth: 'authorized', level: 3, voice: 'm',
      opening: '"Eduardo Santos, calling for my wife Maria about her slip and fall at the pharmacy. Did the health plan agree to lower its bill yet?"',
      gives: { name: 'Eduardo Santos', dob: 'Maria\'s birthday is 03/22/1988.', address: '1187 Willow Bend Dr, Riverton', ssn4: null, callback: '(555) 010-4418', relationship: 'Her husband. I signed a form for that case.', dol: 'January 14th, 2025.' },
      actions: ['Authorized on this file: not yet (request sent 08/20, follow-up 10/05); offer a callback from Rosa Delgado (ext 341)', 'Not authorized: only Maria can get information', 'Yes, the health plan agreed to $3,000', 'Tell him the case is still in treatment'],
      answer: 0, why: 'The pharmacy fall (DOL 01/14/2025) is MC-21, where Eduardo signed a communication authorization (02/03/2025). He gave Maria\'s DOB and the address on file.' },
    { id: 'D31', mock: 'MC-22', auth: 'client', level: 2, voice: 'f',
      opening: '"Hi, this is Maria Santos. Did you get the report from animal control yet?"',
      gives: { name: 'Maria Santos', dob: '08/30/1971', address: '402 Magnolia Court', ssn4: '5307', callback: '(555) 010-6412', relationship: 'It\'s my case.', dol: 'July 28th. My neighbor\'s dog.' },
      actions: ['Not received yet (requested 08/06, follow-up by 10/02); message Luis Ortega (ext 314)', 'Not verified: her DOB doesn\'t match Maria Santos\'s file', 'Her chiropractor visit is Tuesday at 10:30 AM', 'Tell her the case settled and her money is coming'],
      answer: 0, why: 'Three files are named Maria Santos. Her DOB (08/30/1971) and the dog bite (07/28/2026) match MC-22, not MC-01 or MC-21 (DOB 03/22/1988). Notes 08/06: report requested.' },
    { id: 'D32', mock: 'MC-23', auth: 'client', level: 2, voice: 'm',
      opening: '"James Wilson here. When\'s my back injection? The one for the garage fall."',
      gives: { name: 'James Wilson', dob: '09/17/1983', address: '17 Birchwood Lane', ssn4: '3390', callback: '(555) 010-4962', relationship: 'I\'m the client.', dol: 'May 16th, this year.' },
      actions: ['Riverton Pain Institute, Wednesday 10/07/2026 at 1:15 PM', 'Wednesday 09/30/2026 at 5:30 PM', 'His case settled, so there are no more appointments', 'Take a message; the front desk can\'t give out appointments'],
      answer: 0, why: 'He has two files. The garage fall (DOL 05/16/2026) is MC-23; the truck crash (MC-06) is settled. Treatment tab: injection 10/07 at 1:15 PM (09/30 is chiropractic).' },
    { id: 'D33', mock: 'MC-24', auth: 'authorized', level: 3, voice: 'm',
      opening: '"Hi, I\'m calling for my dad, James Wilson. When is his next physical therapy?"',
      gives: { name: 'Kevin Wilson', dob: 'Dad\'s birthday is 04/02/1956.', address: '5 Quarry Road', ssn4: null, callback: '(555) 010-6521', relationship: 'I\'m his son. I signed a form at the rehab center.', dol: 'August 8th. He fell at the hotel pool.' },
      actions: ['Authorized: Motion Physical Therapy, Thursday 10/01/2026 at 11:00 AM', 'Not authorized: only the client can get information', 'Wednesday 09/30/2026 at 5:30 PM', 'His settlement check isn\'t ready yet'],
      answer: 0, why: 'Three files are named James Wilson. The DOB (04/02/1956) and the pool fall (08/08/2026) match MC-24, where his son Kevin is authorized (08/18/2026).' },
    // Newer files (MC-25 … MC-36). Some callers give only our case number; the two
    // Jose Hernandez files share a name, an address and a DOL, so the DOB decides.
    { id: 'D34', mock: 'MC-26', auth: 'unauthorized', level: 3, voice: 'f',
      opening: '"Hi, this is Carmen Hernandez. I\'m calling about my son Jose\'s wrist. When does he get his cast off?"',
      gives: { name: 'Carmen Hernandez', dob: 'Jose was born 11/02/1994.', address: '2210 Brookside Ave', ssn4: null, callback: '(555) 010-6631', relationship: 'I\'m his mother. I\'m on my husband\'s file.', dol: 'August 30th, the crash with my husband.' },
      actions: ['She is authorized only on her husband\'s file (MC-25), not her adult son\'s: take a message and share nothing', 'She knows his DOB and address, so give the appointment', 'She\'s on the Hernandez file, so give the cast check: 10/06 at 2:00 PM', 'Transfer her to Riverton Orthopedic'],
      answer: 0, why: 'Two files are named Jose Hernandez, with the same address and DOL. The DOB she gave (11/02/1994) is the son\'s file (MC-26), where only the client is authorized (Notes 09/02). Carmen is authorized on her husband\'s file only.' },
    { id: 'D35', mock: 'MC-25', auth: 'authorized', level: 2, voice: 'f',
      opening: '"Hola… this is Carmen Hernandez, calling for my husband Jose. When is his next appointment with the bone doctor?"',
      gives: { name: 'Carmen Hernandez', dob: 'His birthday is 03/14/1962.', address: '2210 Brookside Ave', ssn4: null, callback: '(555) 010-6631', relationship: 'His wife. I signed the paper for his case.', dol: 'August 30th.' },
      actions: ['Authorized on her husband\'s file: Riverton Orthopedic, Thursday 10/08/2026 at 9:30 AM', 'Tuesday 10/06/2026 at 2:00 PM', 'Not authorized: only Jose can get information', 'Transfer her to the orthopedic office'],
      answer: 0, why: 'The DOB (03/14/1962) is the father\'s file (MC-25), where Carmen signed a communication authorization (09/02). Tuesday 10/06 at 2:00 PM is the son\'s cast check (MC-26).' },
    { id: 'D36', mock: 'MC-29', auth: 'business', level: 2, voice: 'f',
      opening: '"Dana Whitfield, Keystone Mutual, uninsured-motorist claims. I\'m calling on your case number LSH-2025-MVA-900513. Where do I send the release, and who do I make the check out to?"',
      gives: { name: 'Dana Whitfield', dob: null, address: null, ssn4: null, callback: '(555) 010-7702', relationship: 'I handle the UM claim for your client\'s own insurance.' },
      actions: ['Find the file by the case number (Denise Carter) and route to Priya Natarajan (ext 311) / Atty. Reyes (ext 201); no release or payment instructions from the front desk', 'Give her the firm\'s mailing address for the check', 'Tell her to make the check out to the client', 'Say you can\'t help without the client\'s date of birth'],
      answer: 0, why: 'The case number is Denise Carter\'s file (MC-29): the UM claim settled for $60,000 (Notes 09/15). Releases and checks go through the case manager and the attorney, never the front desk.' },
    { id: 'D37', mock: 'MC-33', auth: 'business', level: 3, voice: 'm',
      opening: '"Bridgeway Legal Funding, on your case number LSH-2024-MVA-900242, client Latoya Jackson. Did her case settle, and for how much? We need our payoff."',
      gives: { name: 'Kyle at Bridgeway Legal Funding', dob: null, address: null, ssn4: null, callback: '(555) 010-8410', relationship: 'We advanced her money before the settlement.' },
      actions: ['Status only, as her authorization allows: settled and in lien negotiations. No amounts; payoff questions to Rosa Delgado (ext 341)', 'Give the settlement amount so they can work out the payoff', 'Say nothing at all: they aren\'t the client', 'Transfer to Accounting to arrange payment'],
      answer: 0, why: 'Doc Hub and Notes 09/14: the client signed a status-only authorization for Bridgeway. Amounts are never given out; the lien negotiator handles the payoff.' },
    { id: 'D38', mock: 'MC-32', auth: 'business', level: 3, voice: 'f',
      opening: '"This is Hartley & Moss Law. We have a lien on Ahmed Rahman\'s case, our file HM-2025-0441. Has it settled? We need to be paid."',
      gives: { name: 'Beth, paralegal at Hartley & Moss', dob: null, address: null, ssn4: null, callback: '(555) 010-8420', relationship: 'We were his lawyers before you.' },
      actions: ['Take a message for Atty. Marcus Reyes (ext 201) with their file number; confirm nothing about the case', 'Tell them the demand went out and is due 10/01', 'Tell them the client fired them, so they get nothing', 'Give them Tom Alvarez\'s direct line'],
      answer: 0, why: 'Notes 04/22: all contact with the prior firm goes to Atty. Reyes, and the front desk confirms nothing about the case.' },
    { id: 'D39', mock: 'MC-27', auth: 'unauthorized', level: 3, voice: 'm',
      opening: '"Hey, I\'m Olivia Bennett\'s cousin. She moved and I lost her new address. You\'re her lawyers, right? Can you give it to me?"',
      gives: { name: 'Tyrell. Just Tyrell.', dob: 'Her birthday? July, I think.', address: 'She used to live at Stonegate.', ssn4: null, callback: 'I\'ll just call back.', relationship: 'Cousin.', dol: 'Last November, when she got attacked.' },
      actions: ['Confirm nothing and give nothing; take a message, log it, and alert Grace Kim (ext 313) / Atty. Brooks (ext 202) right away (safety flag)', 'Give him her new address; he\'s family', 'Tell him she doesn\'t live at Stonegate anymore', 'Put him on hold and call Olivia to ask'],
      answer: 0, why: 'Safety flag (Notes 12/05/2025): the assailant\'s family has tried to find her. Never confirm she is a client or give out her address or phone, and alert the team.' },
    { id: 'D40', mock: 'MC-35', auth: 'authorized', level: 2, voice: 'm',
      opening: '"Hi, Michael Collins, Emma\'s dad. When\'s her next orthopedic appointment? I have her that week."',
      gives: { name: 'Michael Collins', dob: 'Emma was born 02/17/2015.', address: '65 Birch Hollow Road', ssn4: '4488 (Emma\'s)', callback: '(555) 010-6731', relationship: 'Her father. Her mom and I share custody.' },
      actions: ['Authorized (joint custody order on file): Riverton Pediatric Orthopedics, Monday 10/05/2026 at 4:15 PM', 'Not authorized: only the mother signed the retainer', 'PT on Wednesday 09/30 at 3:45 PM', 'Take a message for Sarah Collins'],
      answer: 0, why: 'Joint legal custody: both parents may get case information (Doc Hub, Notes 07/20). Unlike Sofia Morales (MC-10), no order limits the other parent.' },
    { id: 'D41', mock: 'MC-31', auth: 'client', level: 1, voice: 'f',
      opening: '"Hi, it\'s Tanya Reed. They offered me thirty thousand for my hand. Should I take it? What would you do?"',
      gives: { name: 'Tanya Reed', dob: '04/25/1990', address: '608 Dogwood Circle', ssn4: '9582', callback: '(555) 010-6690', relationship: 'It\'s my case.' },
      actions: ['Verified: no opinion on the offer; remind her of her meeting with Atty. Okafor on 09/30 at 2:00 PM, or take a message for him (ext 203)', 'Tell her to hold out for the $75,000 demand', 'Tell her $30,000 is fair for a dog bite', 'Tell her to accept today because offers expire'],
      answer: 0, why: 'Only the attorney discusses offers with the client (Notes 09/21). Her meeting with Atty. Okafor is 09/30 at 2:00 PM (Tasks).' },
    { id: 'D42', mock: 'MC-36', auth: 'unauthorized', level: 1, voice: 'f',
      opening: '"Hi, this is Janet from HR at Riverton Medical Supply. Walter Grant told us he hired you. When can he come back to work, and was this work-related?"',
      gives: { name: 'Janet Albright', dob: null, address: null, ssn4: null, callback: '(555) 010-8430', relationship: 'I\'m in HR where he works.' },
      actions: ['Not authorized (his employer isn\'t on the file): confirm nothing, take a message and suggest they speak with Walter', 'Confirm he\'s a client, since he told them himself', 'Tell them he broke his leg and will be out a few months', 'Transfer to Intake'],
      answer: 0, why: 'Notes 09/25: only the client is authorized; his employer is not. Even when the caller says the client told them, the front desk confirms nothing.' },
    { id: 'D43', mock: 'MC-34', auth: 'business', level: 2, voice: 'f',
      opening: '"Riverton Dispute Resolution Center, confirming the mediation on your case number LSH-2025-PRL-900393 for October 21st at 9 AM. Will the plaintiff attend in person?"',
      gives: { name: 'Alicia, scheduling clerk', dob: null, address: null, ssn4: null, callback: '(555) 010-8440', relationship: 'I schedule the mediations.' },
      actions: ['Find the file by the case number (Brian O\'Neill); transfer to Janelle Price (ext 221) or Atty. Brooks (ext 202), or take a priority message', 'Confirm the client will attend in person', 'Tell them the case is settling', 'Move it to a better date'],
      answer: 0, why: 'The case number is Brian O\'Neill\'s file (MC-34), in litigation. Court-ordered dates are handled by the paralegal and the attorney, never confirmed at the front desk.' },
    { id: 'D44', mock: 'MC-26', auth: 'client', level: 2, voice: 'm',
      opening: '"Hi, this is Jose Hernandez, case number LSH-2026-MVA-901924. I need a note for work saying when I can go back."',
      gives: { name: 'Jose Hernandez', dob: '11/02/1994', address: '2210 Brookside Ave', ssn4: '8156', callback: '(555) 010-6640', relationship: 'I\'m the client.', dol: 'August 30th.' },
      actions: ['Verified (the case number and DOB are the son\'s file): the firm doesn\'t write work notes, his doctor does (Riverton Orthopedic); offer a message to Luis Ortega (ext 314)', 'Email him a note on the firm\'s letterhead', 'Tell him he can go back to work next week', 'Give him his father\'s appointment instead'],
      answer: 0, why: 'The case number puts him on MC-26 (Jose Hernandez Jr.) and his DOB matches. Work notes come from the treating doctor (Notes 09/22).' },
    // Recep2 callers (MC-37 to MC-52, and one caller with no file)
    { id: 'D45', mock: 'MC-37', auth: 'business', level: 2, voice: 'm', opening: '"Craig Donnelly, Summit Casualty, claim SCI-25-40672 for Schuyler Beauchamp. I got your demand. Before I respond, is he still treating, and would he take $8,000 today?"', gives: { name: 'Craig Donnelly, Summit Casualty', dob: null, address: null, ssn4: null, callback: '(555) 010-7730', relationship: 'I\'m the other driver\'s adjuster.', dol: 'July 2nd, 2025.' }, actions: ['Business caller on a demanded file: no answers on treatment or the offer; transfer to Atty. Reyes (ext 201, available) or take the offer as a message for him', 'Tell him the client finished treatment a long time ago', 'Accept the $8,000 for the client', 'Tell him to call the client directly'], answer: 0, why: 'Schuyler Beauchamp has two files; the claim number and the DOL (07/02/2025) point to MC-37, in BI Demanded. Offers and adjusters go to the attorney on the file (Atty. Reyes, available). The front desk never accepts offers or confirms treatment.' },
    { id: 'D46', mock: 'MC-38', auth: 'business', level: 2, voice: 'f', opening: '"Hi, this is Carmen at Riverton Orthopedic Associates. Saoirse Witwicky missed her last two appointments with us. Is the family still going ahead with the case? We need to know before we book more visits."', gives: { name: 'Carmen, scheduling at Riverton Orthopedic', dob: 'Saoirse\'s? 04/04/2016.', address: null, ssn4: null, callback: '(555) 010-3161', relationship: 'I schedule at the orthopedic office.', dol: 'I don\'t have that.' }, actions: ['Provider: don\'t discuss the case; take a complete message about the two missed visits for the case manager Grace Kim (ext 313)', 'Tell her the case is going ahead and to book more visits', 'Give her the mother\'s cell number', 'Tell her the family may drop the case'], answer: 0, why: 'MC-38 (Saoirse Witwicky, a minor) is in treatment: PT just finished, ortho started, 2 missed sessions. Providers go to the case manager, who follows up with the guardian; the front desk shares nothing about the case.' },
    { id: 'D47', mock: 'MC-39', auth: 'unauthorized', level: 2, voice: 'm', opening: '"Hi, I\'m Daniel Featherstonhaugh, Mireille Featherstonhaugh\'s husband. When is her mediation, and can I come with her?"', gives: { name: 'Daniel Featherstonhaugh', dob: 'Mireille\'s birthday is 04/20/1994.', address: '71 Fairview Terrace', ssn4: null, callback: '(555) 010-6831', relationship: 'Her husband.', dol: 'September of last year, the car accident.' }, actions: ['Not authorized (only Mireille is on the file): don\'t confirm the mediation or the case; take a message for Janelle Price (ext 221)', 'Give him the mediation date, 06/24/2025, since he\'s her husband', 'Transfer him to Atty. Brooks', 'Tell him spouses can always attend mediation'], answer: 0, why: 'MC-39: only the client, Mireille Featherstonhaugh, is authorized; her husband is the emergency contact only, however much he knows. Atty. Brooks is in court.' },
    { id: 'D48', mock: 'MC-40', auth: 'client', level: 2, voice: 'f', opening: '"Hi, this is Niamh Cholmondeley. I have that arbitration coming up for my fall at the parking garage. What date is it again, and can I talk to Atty. Brooks?"', gives: { name: 'Niamh Cholmondeley', dob: '06/06/1998', address: '905 Juniper Lane, Apt 12', ssn4: '8816', callback: '(555) 010-6840', relationship: 'I\'m the client.', dol: 'November 29th, 2020, at the parking garage.' }, actions: ['Verified (the DOL is her 2020 garage case): the arbitration is set for 09/11/2023; Atty. Brooks is in court, so take a message for her or Janelle Price (ext 221)', 'Transfer her to Atty. Brooks right away', 'Give her the deposition date on her other file (06/20/2025)', 'Tell her she doesn\'t need to attend'], answer: 0, why: 'Niamh Cholmondeley has two files: the 11/29/2020 garage fall (MC-40, arbitration 09/11/2023) and the 10/10/2023 car accident (MC-48). A verified client can be told a date on her file; the attorney is in court.' },
    { id: 'D49', mock: 'MC-41', auth: 'client', level: 1, voice: 'f', opening: '"Hi, Amber Acheson, I\'m calling about my son Cian\'s case. When does his physical therapy end, and can I speak to the attorney today?"', gives: { name: 'Amber Acheson', dob: 'Cian\'s is 04/04/2020.', address: '14 Briar Glen Court', ssn4: '3902 (Cian\'s)', callback: '(555) 010-6850', relationship: 'I\'m his mom. I signed with you.', dol: 'December 11th, 2023.' }, actions: ['Verified guardian: the file says PT is due to finish June 1, 2023, then orthopedic; Atty. Reyes is out of the office, so offer Priya Natarajan (ext 311) or take a message', 'Transfer her to Atty. Reyes', 'Tell her Cian can stop PT now', 'Not verified: only Cian can call'], answer: 0, why: 'Amber is the mother/guardian on the file (MC-41). Treatment tab: PT due to finish June 1, 2023; orthopedic after PT. The attorney is out of the office, so the case manager takes it.' },
    { id: 'D50', mock: 'MC-42', auth: 'business', level: 2, voice: 'f', opening: '"Linda Cho, Harbor Point Insurance, UM claim for Mstislav Shaughnessy, date of loss December 3rd, 2023. I still don\'t have his bills. Can you just read me the totals?"', gives: { name: 'Linda Cho, Harbor Point Insurance', dob: null, address: null, ssn4: null, callback: '(555) 010-7815', relationship: 'I\'m the family\'s own insurer.', dol: 'December 3rd, 2023.' }, actions: ['Business caller: no totals or records over the phone; bills are still being collected; take a message for Tom Alvarez (ext 312) or transfer to Atty. Reyes (ext 201)', 'Read her the bill totals', 'Email her the medical records', 'Tell her the demand went out last month'], answer: 0, why: 'Mstislav Shaughnessy (a minor) has two files; the DOL 12/03/2023 is MC-42 (Pending Demand: bills incomplete, being collected). Adjusters are routed; nothing is read out. The demand sent last month is his other file, MC-49.' },
    { id: 'D51', mock: 'MC-43', auth: 'client', level: 1, voice: 'm', opening: '"This is Bjorn Courthope. I was supposed to start treatment back on May 21st and I never went. Is my case still open?"', gives: { name: 'Bjorn Courthope', dob: '12/14/1988', address: '48 Quarry Hill Road', ssn4: '7751', callback: '(555) 010-6870', relationship: 'I\'m the client.', dol: 'May 10th, 2023, I slipped at the gym.' }, actions: ['Verified (DOL 05/10/2023 = the gym fall, in Intake): no advice; transfer to Atty. Okafor (ext 203, available) or take a message for Intake (ext 100)', 'Tell him the case is closed because he missed treatment', 'Book him a new doctor\'s appointment yourself', 'Give him an update on his 2022 car accident file'], answer: 0, why: 'Bjorn Courthope has two files; the gym fall is MC-43 (DOL 05/10/2023, Intake; treatment was set for 05/21/2024). Whether the case goes on is the attorney\'s call, never the front desk\'s.' },
    { id: 'D52', mock: 'MC-44', auth: 'business', level: 2, voice: 'm', opening: '"Hi, this is Marco from Peachtree Pain & Spine billing. Siobhan Masserene has been treating with us since January 12th. Can you give me the landlord\'s insurance claim number so we can bill it?"', gives: { name: 'Marco, billing at Peachtree Pain & Spine', dob: '11/20/1968', address: null, ssn4: null, callback: '(555) 010-3291', relationship: 'I\'m her provider\'s billing office.', dol: 'December 30th, 2023.' }, actions: ['Provider: don\'t read out claim numbers; take the message for the case manager Priya Natarajan (ext 311)', 'Read him the claim number from the Insurance tab', 'Tell him to bill the client directly', 'Transfer him to Accounting (ext 500)'], answer: 0, why: 'MC-44 (Siobhan Masserene) is in treatment since 01/12/2024. Providers go to the case manager, who decides what to send and where; claim numbers aren\'t read over the phone.' },
    { id: 'D53', mock: 'MC-45', auth: 'client', level: 1, voice: 'm', opening: '"Rhys Beaumont here. I finished my treatment. How much is my case worth, and when do I get paid?"', gives: { name: 'Rhys Beaumont', dob: '01/01/1991', address: '33 Brantley Street', ssn4: '6604', callback: '(555) 010-6890', relationship: 'I\'m the client.', dol: 'March 11th, 2025.' }, actions: ['Verified: no case value or timeline; bills and records are being collected before the demand; message Tom Alvarez (ext 312) or offer Atty. Reyes (ext 201)', 'Tell him cases like his settle for about $30,000', 'Tell him he\'ll be paid within 30 days', 'Tell him the demand has already been sent'], answer: 0, why: 'MC-45: treatment just finished; bills and records are being collected (Pending Demand). Values and timelines are for the attorney, never the front desk.' },
    { id: 'D54', mock: null, auth: 'newcaller', level: 1, voice: 'f', opening: '"Hi, I\'m Brittany Beauchamp. I\'m a client, I signed up with you guys a while ago. I just want an update."', gives: { name: 'Brittany Beauchamp', dob: '08/22/1993', address: '9 Poplar Street', ssn4: null, callback: '(555) 010-6940', relationship: 'I\'m a client, I think.', dol: 'I don\'t remember exactly.' }, actions: ['No file under her name (check the spelling, her DOB and phone first): don\'t confirm or deny anything; take her details for Intake (ext 100) or transfer, in case she\'s a new client or signed with another firm', 'Tell her the firm doesn\'t represent her and hang up', 'Open a new case for her yourself', 'Give her an update from a file with a similar name'], answer: 0, why: 'No case on file (DOL, DOB and status all N/A): nothing to share. Search every way first; then Intake handles it. The Beauchamp files (MC-37, MC-51) are Schuyler Beauchamp\'s, a man born 01/03/2000: a similar name is not her file.' },
    { id: 'D55', mock: 'MC-46', auth: 'failed', level: 3, voice: 'f', opening: '"This is Brittany Kirkcudbright. Why do you people keep calling me about therapy? Just tell me what\'s going on with my case, you have all my information."', gives: { name: 'Brittany Kirkcudbright', dob: 'I\'m not giving you that, you already have it.', address: 'Same as before.', ssn4: 'No.', callback: '(555) 010-6900', relationship: 'It\'s my case!', dol: 'March.' }, actions: ['Not verified (she won\'t give identifiers): stay calm, explain you can\'t discuss the case without verifying; offer a callback from Luis Ortega (ext 314) to the number on file', 'Tell her anyway, it\'s obviously her', 'Tell her she should have finished PT last week', 'Hang up on her'], answer: 0, why: 'She gives only her name. Without her DOB and one more identifier there is no verification, however sure you are it\'s her (MC-46). A callback to the number on file keeps it safe.' },
    { id: 'D56', mock: 'MC-47', auth: 'client', level: 2, voice: 'f', opening: '"Hello dear, this is Saoirse Shaughnessy. I got a letter about an arbitration. What is that? Do I have to go to court? I don\'t understand any of this."', gives: { name: 'Saoirse Shaughnessy', dob: '06/06/1955', address: '8 Chestnut Hill Road', ssn4: '9046', callback: '(555) 010-6910', relationship: 'It\'s my case, dear.', dol: 'It was at the grocery store, September of 2023, I think.' }, actions: ['Verified: be patient; the arbitration is set for 03/12/2025; no legal explanations; Atty. Brooks is in court, so take a message for Janelle Price (ext 221) to call her today', 'Explain what arbitration is and what she should say', 'Tell her she doesn\'t need to go', 'Transfer her to Atty. Brooks in court'], answer: 0, why: 'MC-47: arbitration 03/12/2025, attorney in court. A verified client can hear a date on her file; explaining the process is for the attorney or paralegal.' },
    { id: 'D57', mock: 'MC-48', auth: 'business', level: 3, voice: 'm', opening: '"Paul Hendricks, Hendricks & Vale, defense counsel on the Niamh Cholmondeley case, the October 2023 accident. We need to move her deposition on June 20th. Can you confirm she\'ll be available the 27th instead?"', gives: { name: 'Paul Hendricks, Hendricks & Vale LLP', dob: null, address: null, ssn4: null, callback: '(555) 010-8120', relationship: 'Defense counsel.', dol: 'October 10th, 2023.' }, actions: ['Opposing counsel, and a deposition within days is urgent: confirm nothing; Atty. Brooks is in court, so transfer to Janelle Price (ext 221) now or take a priority message', 'Confirm June 27th for the client', 'Tell him the client is unavailable in June', 'Give him the arbitration date on her other file'], answer: 0, why: 'The DOL (10/10/2023) is MC-48, with the deposition set for 06/20/2025. Defense counsel goes to the attorney or paralegal; the front desk never agrees to dates.' },
    { id: 'D58', mock: 'MC-49', auth: 'business', level: 3, voice: 'm', opening: '"Nate Farris, Allied Crest Insurance, on the Mstislav Shaughnessy claim, date of loss November 2nd, 2021. I got the demand. Quick questions: where does he go to school, is he playing sports again, and was he hurt before?"', gives: { name: 'Nate Farris, Allied Crest Insurance', dob: null, address: null, ssn4: null, callback: '(555) 010-7785', relationship: 'I\'m the other driver\'s adjuster.', dol: 'November 2nd, 2021.' }, actions: ['An adjuster probing for information: answer none of it; transfer to Atty. Reyes (ext 201, available) or take a message', 'Answer the questions, since the demand is already out', 'Confirm Mstislav is back playing soccer', 'Give him the mother\'s number so he can ask her'], answer: 0, why: 'The DOL (11/02/2021) is MC-49 (BI Demanded, demand sent last month). Adjusters\' questions go to the attorney; the front desk gives no facts about the client.' },
    { id: 'D59', mock: 'MC-50', auth: 'client', level: 3, voice: 'm', opening: '"Yeah, Bjorn Courthope. Stop having people call me about doctors. I feel fine. Just settle it and send me my money."', gives: { name: 'Bjorn Courthope', dob: '12/14/1988', address: '48 Quarry Hill Road', ssn4: '7751', callback: '(555) 010-6870', relationship: 'It\'s my case.', dol: 'April 11th, 2022, the car wreck.' }, actions: ['Verified (DOL 04/11/2022 = his car accident file, in Intake): stay calm, no advice or promises; offer Atty. Okafor (ext 203, available) or take a message', 'Tell him the case is worth nothing if he doesn\'t treat', 'Promise to settle it this week', 'Give him an update on his 2023 gym-fall file'], answer: 0, why: 'Bjorn Courthope has two files; the car accident is MC-50 (DOL 04/11/2022, Intake; no treatment yet per the providers). Advice and settlement are for the attorney.' },
    { id: 'D60', mock: 'MC-51', auth: 'business', level: 2, voice: 'f', opening: '"This is Pam Whitley with Geico, UM claim for Schuyler Beauchamp, date of loss December 5th, 2023. I have the demand packet. Did he treat anywhere after his last visit a month ago?"', gives: { name: 'Pam Whitley, Geico', dob: null, address: null, ssn4: null, callback: '(555) 010-7796', relationship: 'I\'m his own insurer\'s adjuster.', dol: 'December 5th, 2023.' }, actions: ['Business caller: no treatment details; transfer to Atty. Reyes (ext 201, available) or take a message for him and Sam Whitaker (ext 331)', 'Tell her his last treatment was a month ago', 'Send her the medical records', 'Tell her about his 2025 accident too'], answer: 0, why: 'Schuyler Beauchamp has two files; the Geico UM claim and the DOL 12/05/2023 point to MC-51 (UM or UIM Demanded). Even the client\'s own insurer is routed to the attorney.' },
    { id: 'D61', mock: 'MC-52', auth: 'business', level: 3, voice: 'f', opening: '"Good morning, this is Irene Park, clerk at Riverton County State Court, on Masserene v. Kestrel Logistics. The court needs the plaintiff at a status conference next Tuesday. Is Mr. Masserene in town?"', gives: { name: 'Irene Park, court clerk', dob: null, address: null, ssn4: null, callback: '(555) 010-8200', relationship: 'I\'m the judge\'s clerk.', dol: 'October 11th, 2024.' }, actions: ['A court call is urgent: don\'t say where the plaintiff is; transfer to Atty. Brooks (ext 202, available) now, or Janelle Price (ext 221)', 'Tell her the plaintiff is out of the country', 'Confirm he\'ll attend next Tuesday', 'Take a message for next week'], answer: 0, why: 'MC-52 is in litigation (discovery); the attorney is available. Court dates are routed now, and the client\'s whereabouts are never shared by the front desk.' }
];

/* =========================================================
   HARD-TO-SAY NAMES (the Recep2 callers and clients)
   How each name sounds on the phone, for the NATO spelling practice:
   - say: how it's pronounced (the stressed part in capitals). The live caller
     says it this way, and the trainer's scripts tell the role-player to.
   - heard: how a receptionist might write down what they hear. The text drill
     shows the caller's words this way, so the name has to be spelled to be found.
   A call that names one of these (front-desk-drill.js) also expects the receptionist
   to ask for the spelling and read it back with the NATO phonetic alphabet.
   ========================================================= */
const MOCK_NAME_SOUNDS = {
    Niamh: { say: 'NEEV', heard: 'Neev' },
    Saoirse: { say: 'SEER-sha', heard: 'Seersha' },
    Mireille: { say: 'meer-AY', heard: 'Miray' },
    Schuyler: { say: 'SKY-ler', heard: 'Skyler' },
    Cian: { say: 'KEE-an', heard: 'Keean' },
    Rhys: { say: 'REESE', heard: 'Reese' },
    Bjorn: { say: 'BYORN', heard: 'Byorn' },
    Brittany: { say: 'BRIT-nee', heard: 'Britney' },
    Siobhan: { say: 'shiv-AWN', heard: 'Shivaun' },
    Mstislav: { say: 'mstee-SLAHV', heard: 'Mistislav' },
    Cholmondeley: { say: 'CHUM-lee', heard: 'Chumley' },
    Witwicky: { say: 'wit-WICK-ee', heard: 'Witwikki' },
    Featherstonhaugh: { say: 'FAN-shaw', heard: 'Fanshaw' },
    Beauchamp: { say: 'BEE-chum', heard: 'Beecham' },
    Acheson: { say: 'ATCH-ih-sun', heard: 'Atchison' },
    Beaumont: { say: 'BOH-mont', heard: 'Bomont' },
    Courthope: { say: 'CORT-hope', heard: 'Corthope' },
    Kirkcudbright: { say: 'kur-KOO-bree', heard: 'Kirkoobree' },
    Masserene: { say: 'MASS-uh-reen', heard: 'Massereen' },
    Shaughnessy: { say: 'SHAW-nuh-see', heard: 'Shawnessy' }
};

if (typeof window !== 'undefined') {
    window.MOCK_CASES = MOCK_CASES;
    window.MOCK_FIRM = MOCK_FIRM;
    window.MOCK_PROGRAMS = MOCK_PROGRAMS;
    window.DRILL_CALLS = DRILL_CALLS;
    window.MOCK_NAME_SOUNDS = MOCK_NAME_SOUNDS;
}
if (typeof module !== 'undefined') module.exports = { MOCK_CASES, MOCK_FIRM, MOCK_PROGRAMS, DRILL_CALLS, MOCK_NAME_SOUNDS };
