/* =========================================================
   LSH CMS — TRAINING LIBRARY: HARDCODED MOCK CASES
   ---------------------------------------------------------
   Fictional personal-injury files every training program can open
   (Receptionist / Front Desk, Intake, Case Management, EA/PA, …).
   They live in this file, not in the database, so they are identical
   for every trainee and can't be edited or deleted. Opening one loads
   it into the case editor as VIEW ONLY, except its Notes and Tasks:
   what a trainee adds or edits there is saved for them only
   (/api/mock-case-updates). "Work on a practice copy" lets a trainee
   save their own copy (a normal case they own).

   Some client names are on more than one file on purpose (the same
   client with a second accident, or a different person with the same
   name) so the front desk practices telling files apart by the date
   of the accident and the date of birth. Files that share a name must
   have different DOLs (.github/scripts/check-data.mjs checks it).

   All people, phone numbers (555-01xx), addresses, claim and policy
   numbers here are invented for training. SSNs are masked on purpose:
   the front desk never needs, reads out or keys a full SSN.

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
        'Verify every caller who asks about a case: full name, date of birth, and one more identifier on file (home address, or the last 4 of the SSN). Never read an identifier out to the caller; ask them to give it to you.',
        'Only the client, or a person the file lists as authorized (a guardian, a power of attorney, or someone on a signed communication authorization), gets case information. Everyone else gets "I can take a message" and nothing more, not even whether the firm represents that person.',
        'The front desk never gives legal advice, case values, settlement opinions or deadlines to act on. Take a complete message and route it.',
        'Insurance adjusters and opposing counsel go to the attorney or case manager on the file. Never agree to a recorded statement, confirm facts, or accept a settlement offer.',
        'Media calls: "We have no comment. I can take your name and number for the attorney." Nothing else.',
        'A complete message: date and time, caller name and role, callback number, best time to call, case name, what they need, how urgent, and your initials. Log it as a Note on the case and route it to the person on the file.',
        'Urgent (route now, not by message): a client in danger or in crisis, a deadline or court date in the next 7 days, a settlement offer with a time limit, a statute of limitations close, a subpoena or a process server, or anyone threatening legal action against the firm.'
    ]
};

const MOCK_PROGRAMS = [
    { id: 'reception', label: 'Receptionist / Front Desk' },
    { id: 'intake', label: 'Intake' },
    { id: 'cm', label: 'Case Management' },
    { id: 'ea', label: 'EA / PA' },
    { id: 'pd', label: 'Property Damage' }
];

const MOCK_CASES = [
{
    id: 'MC-01', level: 'Starter', programs: ['reception', 'cm', 'ea', 'pd'],
    summary: 'Rear-end collision, in treatment. Client calls about her next appointment; a "cousin" asks about the settlement.',
    client: { name: 'Maria Santos', phone: '(555) 010-4417', email: 'maria.santos@example.com', dob: '03/22/1988', ssn: 'XXX-XX-4821',
        address: '1187 Willow Bend Dr, Riverton, GA 30301',
        emergency: { name: 'Eduardo Santos', phone: '(555) 010-4418', relationship: 'Husband' },
        employment: { status: 'Employed', employer: 'Brightside Dental Group', title: 'Dental Hygienist' } },
    caseType: 'MVA', phase: 'Treatment', attorney: 'Atty. Marcus Reyes', caseManager: 'Priya Natarajan',
    dateOfLoss: '06/09/2026', sol: '06/09/2028', target: '',
    narrative: 'Client was stopped at a red light on Peachtree Ave when a 2019 Ford Escape driven by Kyle Brandt rear-ended her at about 30 mph. Neck and low-back pain the same evening; went to urgent care the next morning. No prior neck injuries. Liability is clear (Brandt admitted he was looking at his phone; cited for following too closely).',
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
    id: 'MC-02', level: 'Starter', programs: ['reception', 'intake', 'cm'],
    summary: 'Grocery-store slip and fall, retainer still out. The store\'s insurer wants a recorded statement.',
    client: { name: 'Derek Thompson', phone: '(555) 010-4520', email: 'd.thompson@example.com', dob: '11/05/1975', ssn: 'XXX-XX-1934',
        address: '52 Harbor View Rd, Apt 3B, Riverton, GA 30303',
        emergency: { name: 'Carla Thompson', phone: '(555) 010-4521', relationship: 'Sister' },
        employment: { status: 'Employed', employer: 'Metro Transit Authority', title: 'Bus Operator' } },
    caseType: 'Slip and Fall', phase: 'Intake', attorney: 'Atty. David Okafor', caseManager: '',
    dateOfLoss: '09/12/2026', sol: '09/12/2028', target: '',
    narrative: 'Potential client slipped on spilled liquid detergent in aisle 7 of FreshWay Market (Route 9 store) at about 6:15 PM. No warning cone. Fell on his right side; right wrist fracture (cast) and hip bruising. Store manager (Alan Pruitt) took an incident report; client photographed the spill. Two witnesses gave names to the store. Intake completed 09/18; retainer sent by e-sign 09/21, NOT yet signed.',
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
    id: 'MC-03', level: 'Starter', programs: ['reception', 'cm'],
    summary: 'Dog bite at a neighbor\'s home, demand in review. Homeowner\'s insurer calls about the demand.',
    client: { name: 'Aisha Patel', phone: '(555) 010-4633', email: 'aisha.patel@example.com', dob: '07/14/1992', ssn: 'XXX-XX-6610',
        address: '309 Maple Court, Riverton, GA 30305',
        emergency: { name: 'Raj Patel', phone: '(555) 010-4634', relationship: 'Brother' },
        employment: { status: 'Employed', employer: 'Riverton Public Library', title: 'Children\'s Librarian' } },
    caseType: 'Dog Bite', phase: 'Demand Review', attorney: 'Atty. Marcus Reyes', caseManager: 'Tom Alvarez',
    dateOfLoss: '02/03/2026', sol: '02/03/2028', target: '$ 65,000.00',
    narrative: 'Client was walking on the public sidewalk when a German Shepherd ("Max") owned by Gerald Finch ran through an open gate and bit her left forearm and calf. 14 stitches; later scar revision consult. Animal Control confirmed a prior bite complaint on the same dog (2024).',
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
    id: 'MC-04', level: 'Intermediate', programs: ['reception', 'cm', 'pd'],
    summary: 'Policy-limits demand is out. The adjuster calls with an offer that has a deadline.',
    client: { name: 'Robert Chen', phone: '(555) 010-4741', email: 'bobby.chen@example.com', dob: '01/30/1969', ssn: 'XXX-XX-2208',
        address: '88 Lantern Hill Rd, Riverton, GA 30307',
        emergency: { name: 'Susan Chen', phone: '(555) 010-4742', relationship: 'Wife' },
        employment: { status: 'Employed', employer: 'Chen & Sons Hardware', title: 'Owner' } },
    caseType: 'MVA', phase: 'Bi Demand', attorney: 'Atty. Marcus Reyes', caseManager: 'Grace Kim',
    dateOfLoss: '11/18/2025', sol: '11/18/2027', target: '$ 100,000.00',
    narrative: 'Client (goes by "Bobby") was broadsided at Oak St and 5th Ave by a driver who ran a stop sign (Tanya Mills). Left shoulder rotator-cuff tear, surgery 03/2026. Policy-limits demand ($100,000) sent 09/08/2026 with a 30-day time limit: response due 10/08/2026.',
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
    id: 'MC-05', level: 'Advanced', programs: ['reception', 'cm'],
    summary: 'Apartment stairway fall in litigation. Defense counsel calls to move a deposition.',
    client: { name: 'Linda Garcia', phone: '(555) 010-4850', email: 'lgarcia61@example.com', dob: '05/09/1961', ssn: 'XXX-XX-7702',
        address: '2200 Pine Ridge Blvd, Unit 14, Riverton, GA 30309',
        emergency: { name: 'Marco Garcia', phone: '(555) 010-4851', relationship: 'Son' },
        employment: { status: 'Retired', employer: '', title: 'Retired school secretary' } },
    caseType: 'Premise Liability', phase: 'Litigation', attorney: 'Atty. Elena Brooks', caseManager: 'Tom Alvarez',
    dateOfLoss: '08/27/2024', sol: '08/27/2026', target: '$ 175,000.00',
    narrative: 'Client fell on a broken stair tread (reported twice to management in writing) at Pine Ridge Apartments. Fractured left ankle (ORIF) and a later hip bursitis. Suit filed 04/15/2026 (Garcia v. Pine Ridge Property Management LLC, Riverton County State Court, No. 26-CV-01877).',
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
    id: 'MC-06', level: 'Intermediate', programs: ['reception', 'cm', 'ea'],
    summary: 'Settled and in disbursement. Client asks when his check is ready and wants his friend to pick it up.',
    client: { name: 'James Wilson', phone: '(555) 010-4962', email: 'jwilson.rvt@example.com', dob: '09/17/1983', ssn: 'XXX-XX-3390',
        address: '17 Birchwood Lane, Riverton, GA 30311',
        emergency: { name: 'Nadia Wilson', phone: '(555) 010-4963', relationship: 'Wife' },
        employment: { status: 'Employed', employer: 'Riverton Distribution Center', title: 'Forklift Operator' } },
    caseType: 'MVA', phase: 'Disbursement', attorney: 'Atty. Marcus Reyes', caseManager: 'Priya Natarajan',
    dateOfLoss: '01/12/2025', sol: '01/12/2027', target: '$ 42,000.00',
    narrative: 'Side-swipe on I-85 by a box truck changing lanes. Neck and shoulder soft-tissue injuries, 5 months of care. Settled 08/28/2026 for $42,000 (policy tender accepted by the client in writing).',
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
    id: 'MC-07', level: 'Intermediate', programs: ['reception', 'cm'],
    summary: 'Rideshare passenger, UM demand. Client moved, changed numbers and is upset nobody calls back.',
    client: { name: 'Keisha Brown', phone: '(555) 010-5073', email: 'keisha.brown@example.com', dob: '12/01/1995', ssn: 'XXX-XX-5149',
        address: '640 Crescent Ave, Apt 22, Riverton, GA 30312',
        emergency: { name: 'Denise Brown', phone: '(555) 010-5074', relationship: 'Mother' },
        employment: { status: 'Employed', employer: 'Sunrise Senior Living', title: 'Certified Nursing Assistant' } },
    caseType: 'MVA', phase: 'UM Demand', attorney: 'Atty. Marcus Reyes', caseManager: 'Luis Ortega',
    dateOfLoss: '10/04/2025', sol: '10/04/2027', target: '$ 85,000.00',
    narrative: 'Client was a rideshare passenger (RideNow) when a hit-and-run driver struck the car. Concussion and lumbar disc bulge. At-fault driver never identified; the claim is against RideNow\'s UM coverage and the client\'s own UM.',
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
    id: 'MC-08', level: 'Intermediate', programs: ['reception', 'cm', 'pd'],
    summary: 'Motorcycle crash, surgery scheduled. Spanish-speaking client; his daughter is authorized.',
    client: { name: 'Tomás Rivera', phone: '(555) 010-5188', email: '', dob: '04/18/1964', ssn: 'XXX-XX-8043',
        address: '905 Mission Road, Riverton, GA 30314',
        emergency: { name: 'Daniela Rivera', phone: '(555) 010-5189', relationship: 'Daughter (authorized)' },
        employment: { status: 'Employed', employer: 'Rivera Landscaping', title: 'Landscaper' } },
    caseType: 'Others', caseTypeOther: 'Motorcycle', phase: 'Treatment', attorney: 'Atty. Marcus Reyes', caseManager: 'Luis Ortega',
    dateOfLoss: '07/19/2026', sol: '07/19/2028', target: '',
    narrative: 'Client was riding his motorcycle when an SUV turned left in front of him (driver Brian Keller). Right tibia fracture; knee surgery scheduled. Client speaks Spanish; prefers Spanish. Daughter Daniela signed as authorized contact (communication authorization 07/24/2026).',
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
    id: 'MC-09', level: 'Intermediate', programs: ['reception', 'cm'],
    summary: 'Restaurant slip and fall in negotiation. A provider threatens to send the bill to collections.',
    client: { name: 'Emily Nguyen', phone: '(555) 010-5291', email: 'emily.nguyen@example.com', dob: '02/26/1990', ssn: 'XXX-XX-0415',
        address: '71 Grove Street, Riverton, GA 30316',
        emergency: { name: 'Long Nguyen', phone: '(555) 010-5292', relationship: 'Father' },
        employment: { status: 'Employed', employer: 'Riverton Credit Union', title: 'Loan Officer' } },
    caseType: 'Slip and Fall', phase: 'BI Settlement Nego', attorney: 'Atty. Marcus Reyes', caseManager: 'Grace Kim',
    dateOfLoss: '03/15/2025', sol: '03/15/2027', target: '$ 55,000.00',
    narrative: 'Slipped on a wet floor near the kitchen doors at Bella Cucina (no mat, no sign). Knee injury (meniscus tear), treated conservatively and with an injection. Demand sent 07/2026; carrier offered $22,000 on 09/15; counter at $48,000 sent 09/19.',
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
    id: 'MC-10', level: 'Advanced', programs: ['reception', 'cm'],
    summary: 'Child dog-bite victim. The parent on file is the guardian; the other parent and the school are not.',
    client: { name: 'Sofia Morales (minor), by her father Frank Morales', phone: '(555) 010-5305', email: 'frank.morales@example.com', dob: '06/02/2018', ssn: 'XXX-XX-2718',
        address: '14 Orchard Lane, Riverton, GA 30318',
        emergency: { name: 'Frank Morales', phone: '(555) 010-5305', relationship: 'Father / legal guardian (client contact)' },
        employment: { status: 'Unemployed', employer: '', title: 'Student (age 8)' } },
    caseType: 'Dog Bite', phase: 'Treatment', attorney: 'Atty. Marcus Reyes', caseManager: 'Priya Natarajan',
    dateOfLoss: '05/30/2026', sol: '06/02/2038', target: '',
    narrative: 'Sofia (8) was bitten on the face by a neighbor\'s dog at a birthday party. Facial lacerations; plastic surgery follow-up. Retainer signed by her father Frank Morales, who has primary custody. The file says: do not share information with the mother (Angela Ruiz) unless Frank authorizes it in writing. SOL for a minor runs from her 18th birthday (confirm the state rule with the attorney).',
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
    id: 'MC-11', level: 'Intermediate', programs: ['reception', 'cm'],
    summary: 'MVA in lien negotiations. The hospital lien department calls about a reduction.',
    client: { name: 'Ngozi Okonkwo', phone: '(555) 010-5412', email: 'ngozi.o@example.com', dob: '10/10/1979', ssn: 'XXX-XX-6254',
        address: '480 Summit Terrace, Riverton, GA 30320',
        emergency: { name: 'Chidi Okonkwo', phone: '(555) 010-5413', relationship: 'Husband' },
        employment: { status: 'Employed', employer: 'Riverton General Hospital', title: 'Registered Nurse' } },
    caseType: 'MVA', phase: 'Lien Negotiations', attorney: 'Atty. Marcus Reyes', caseManager: 'Tom Alvarez',
    dateOfLoss: '04/02/2025', sol: '04/02/2027', target: '$ 90,000.00',
    narrative: 'T-bone collision at Summit and 3rd; other driver ran a red light. Wrist fracture and a concussion. Settled 09/05/2026 for $90,000. Liens being negotiated before disbursement.',
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
    id: 'MC-12', level: 'Starter', programs: ['reception', 'cm', 'intake', 'pd'],
    summary: 'Early investigation. The body shop is charging storage and the client wants a rental car.',
    client: { name: 'William Harris', phone: '(555) 010-5520', email: 'will.harris@example.com', dob: '08/08/1958', ssn: 'XXX-XX-9136',
        address: '3 Colonial Drive, Riverton, GA 30322',
        emergency: { name: 'Beverly Harris', phone: '(555) 010-5521', relationship: 'Wife' },
        employment: { status: 'Retired', employer: '', title: 'Retired postal carrier' } },
    caseType: 'MVA', phase: 'Investigation', attorney: 'Atty. David Okafor', caseManager: 'Grace Kim',
    dateOfLoss: '09/14/2026', sol: '09/14/2028', target: '',
    narrative: 'Client\'s parked car was hit, and he was clipped while loading groceries, by a driver backing out (Stacy Owens). Hip and hand bruising. The police report is pending. The car was towed to Parkway Collision; storage is $45/day starting 09/21.',
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
    id: 'MC-13', level: 'Advanced', programs: ['reception', 'intake', 'cm'],
    summary: 'Potential client with the statute of limitations weeks away. Urgent routing, no advice.',
    client: { name: 'Nicole Adams', phone: '(555) 010-5634', email: 'nicole.adams@example.com', dob: '03/03/1984', ssn: 'XXX-XX-4470',
        address: '1520 Lakeshore Blvd, Riverton, GA 30324',
        emergency: { name: 'Jordan Adams', phone: '(555) 010-5635', relationship: 'Spouse' },
        employment: { status: 'Employed', employer: 'Lakeshore Realty', title: 'Real Estate Agent' } },
    caseType: 'Premise Liability', phase: 'Intake', attorney: 'Atty. David Okafor', caseManager: '',
    dateOfLoss: '10/20/2024', sol: '10/20/2026', target: '',
    narrative: 'Boxed patio heaters fell from a top shelf at HomeMax (Route 12) onto the client\'s shoulder and head. Rotator cuff strain and concussion symptoms. She handled it herself with the store\'s insurer for a year and it stalled. Called the firm 09/24/2026. STATUTE OF LIMITATIONS 10/20/2026: flagged URGENT for attorney review.',
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
    id: 'MC-14', level: 'Advanced', programs: ['reception', 'cm', 'ea'],
    summary: 'Commercial-truck case in litigation. A reporter calls; the workers\' comp carrier asserts a lien.',
    client: { name: 'Carlos Mendoza', phone: '(555) 010-5745', email: 'cmendoza@example.com', dob: '12/19/1977', ssn: 'XXX-XX-3862',
        address: '250 Ironwood Street, Riverton, GA 30326',
        emergency: { name: 'Lucia Mendoza', phone: '(555) 010-5746', relationship: 'Wife' },
        employment: { status: 'Unemployed', employer: 'Formerly Summit Electrical Contractors', title: 'Electrician (on disability)' } },
    caseType: 'MVA', phase: 'Litigation', attorney: 'Atty. Elena Brooks', caseManager: 'Luis Ortega',
    dateOfLoss: '02/11/2025', sol: '02/11/2027', target: '$ 750,000.00',
    narrative: 'Client was driving his work van when a tractor-trailer (Redline Freight, driver Mark Toller) rear-ended him in stopped traffic on I-75. Cervical fusion (C5-C6). Workers\' compensation paid benefits (client was on the job). Suit filed 01/06/2026 (Mendoza v. Redline Freight LLC and Toller, Riverton County Superior Court, No. 26-CV-00412). Local news covered the crash.',
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
    id: 'MC-15', level: 'Intermediate', programs: ['reception', 'cm', 'ea'],
    summary: 'Elderly pedestrian in treatment. Her son holds a power of attorney; she is worried about "a lawyer bill".',
    client: { name: 'Patricia Lewis', phone: '(555) 010-5850', email: '', dob: '01/14/1946', ssn: 'XXX-XX-1507',
        address: '12 Heritage Way, Riverton, GA 30328',
        emergency: { name: 'Michael Lewis', phone: '(555) 010-5851', relationship: 'Son (durable power of attorney)' },
        employment: { status: 'Retired', employer: '', title: 'Retired' } },
    caseType: 'MVA', phase: 'Treatment', attorney: 'Atty. Marcus Reyes', caseManager: 'Priya Natarajan',
    dateOfLoss: '08/03/2026', sol: '08/03/2028', target: '',
    narrative: 'Client (80) was hit by a reversing SUV in the Riverton Plaza parking lot while walking to her car. Pelvic fracture; rehab facility stay, now home with home-health visits. Hard of hearing: speak slowly and clearly. Son Michael holds a durable power of attorney (copy in file) and is authorized.',
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
    id: 'MC-16', level: 'Advanced', programs: ['reception', 'cm', 'ea'],
    summary: 'Client says she is changing lawyers. Her new firm calls for the file.',
    client: { name: 'Hannah Pierce', phone: '(555) 010-5961', email: 'hannah.pierce@example.com', dob: '06/25/1987', ssn: 'XXX-XX-8820',
        address: '77 Cedar Hollow Rd, Riverton, GA 30330',
        emergency: { name: 'Owen Pierce', phone: '(555) 010-5962', relationship: 'Husband' },
        employment: { status: 'Employed', employer: 'Riverton Fitness Club', title: 'Personal Trainer' } },
    caseType: 'MVA', phase: 'Demand Review', attorney: 'Atty. Marcus Reyes', caseManager: 'Tom Alvarez',
    dateOfLoss: '12/09/2025', sol: '12/09/2027', target: '$ 60,000.00',
    narrative: 'Rear-end collision on Highway 20. Lumbar strain and a torn labrum (hip). Treatment finished 08/2026; demand in preparation. Client emailed 09/23 unhappy with communication and said she "might go elsewhere."',
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
    id: 'MC-17', level: 'Starter', programs: ['reception', 'cm'],
    summary: 'Cyclist "doored" by a parked car. Client wants to know about replacing his bike.',
    client: { name: 'Andre Coleman', phone: '(555) 010-6071', email: 'andre.coleman@example.com', dob: '09/03/1991', ssn: 'XXX-XX-5582',
        address: '19 Riverside Walk, Apt 7, Riverton, GA 30332',
        emergency: { name: 'Tasha Coleman', phone: '(555) 010-6072', relationship: 'Sister' },
        employment: { status: 'Employed', employer: 'Quickbite Couriers', title: 'Bike Courier' } },
    caseType: 'Others', caseTypeOther: 'Bicycle', phase: 'Treatment', attorney: 'Atty. David Okafor', caseManager: 'Grace Kim',
    dateOfLoss: '08/21/2026', sol: '08/21/2028', target: '',
    narrative: 'Client was riding in the bike lane on Main St when a parked driver (Leslie Tran) opened her door into his path. Broken collarbone and road rash. His $2,400 bicycle was destroyed; it is his work bike.',
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
    id: 'MC-18', level: 'Advanced', programs: ['reception', 'cm'],
    summary: 'Pressure-cooker burn (product liability). The manufacturer\'s insurer wants to pick up the cooker.',
    client: { name: 'Rachel Donovan', phone: '(555) 010-6183', email: 'rachel.donovan@example.com', dob: '11/27/1986', ssn: 'XXX-XX-7340',
        address: '63 Magnolia Circle, Riverton, GA 30334',
        emergency: { name: 'Sean Donovan', phone: '(555) 010-6184', relationship: 'Husband' },
        employment: { status: 'Employed', employer: 'Riverton Middle School', title: 'Teacher' } },
    caseType: 'Others', caseTypeOther: 'Product Liability', phase: 'Investigation', attorney: 'Atty. Elena Brooks', caseManager: 'Tom Alvarez',
    dateOfLoss: '07/04/2026', sol: '07/04/2028', target: '',
    narrative: 'The lid of a Hearthline QuickPot 8-qt pressure cooker blew off while locked and pressurized, causing second-degree burns to the client\'s chest and arms. The cooker is EVIDENCE: it is stored at the firm\'s evidence vendor (SecureHold Storage, tag SH-2291) and must not be released, tested or altered without the attorney.',
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
    id: 'MC-19', level: 'Advanced', programs: ['reception', 'cm', 'intake'],
    summary: 'Pedestrian hit by a city bus. Government-claim notice deadline; the city\'s risk office calls.',
    client: { name: 'Samuel Boateng', phone: '(555) 010-6295', email: 'sam.boateng@example.com', dob: '02/14/1970', ssn: 'XXX-XX-0921',
        address: '301 Station Road, Riverton, GA 30336',
        emergency: { name: 'Ama Boateng', phone: '(555) 010-6296', relationship: 'Wife' },
        employment: { status: 'Employed', employer: 'Riverton Water Utility', title: 'Meter Technician' } },
    caseType: 'MVA', phase: 'Investigation', attorney: 'Atty. Marcus Reyes', caseManager: 'Luis Ortega',
    dateOfLoss: '06/30/2026', sol: '06/30/2028', target: '',
    narrative: 'Client was in a marked crosswalk when a Riverton Transit bus (Route 4) turned right and struck him. Fractured pelvis. Claim against a government entity: written ante litem notice to the City must be served within 6 months of the incident (by 12/30/2026). Notice was served 08/14/2026.',
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
    id: 'MC-20', level: 'Advanced', programs: ['reception', 'cm', 'ea'],
    summary: 'Wrongful death. Only the estate\'s administrator is authorized; grieving relatives call.',
    client: { name: 'Estate of George Hammond (Carol Hammond, administrator)', phone: '(555) 010-6307', email: 'carol.hammond@example.com', dob: '12/05/1949', ssn: 'XXX-XX-6678',
        address: '8 Willow Creek Lane, Riverton, GA 30338',
        emergency: { name: 'Carol Hammond', phone: '(555) 010-6307', relationship: 'Daughter · court-appointed administrator (authorized)' },
        employment: { status: 'Retired', employer: '', title: 'Decedent: retired machinist' } },
    caseType: 'MVA', phase: 'Demand Review', attorney: 'Atty. Elena Brooks', caseManager: 'Priya Natarajan',
    dateOfLoss: '03/28/2026', sol: '03/28/2028', target: '',
    narrative: 'George Hammond (76) died after a wrong-way driver (Travis Keene) struck his car on Route 9. His daughter Carol Hammond was appointed administrator of the estate (letters of administration 05/20/2026) and signed the retainer. DOB and address above are George\'s (verify with them plus the administrator\'s name). Other family members are NOT authorized; be compassionate and take messages.',
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
    id: 'MC-21', level: 'Intermediate', programs: ['reception', 'cm'],
    summary: 'Maria Santos\'s SECOND file (same client as MC-01): an older pharmacy slip and fall, settled, liens being negotiated. Her husband is authorized on this file only.',
    client: { name: 'Maria Santos', phone: '(555) 010-4417', email: 'maria.santos@example.com', dob: '03/22/1988', ssn: 'XXX-XX-4821',
        address: '1187 Willow Bend Dr, Riverton, GA 30301',
        emergency: { name: 'Eduardo Santos', phone: '(555) 010-4418', relationship: 'Husband' },
        employment: { status: 'Employed', employer: 'Brightside Dental Group', title: 'Dental Hygienist' } },
    caseType: 'Slip and Fall', phase: 'Lien Negotiations', attorney: 'Atty. David Okafor', caseManager: 'Grace Kim',
    dateOfLoss: '01/14/2025', sol: '01/14/2027', target: '$ 38,500.00',
    narrative: 'Client slipped on a freshly mopped floor with no wet-floor sign at CareWay Pharmacy (Main St store) while picking up a prescription. Fell on her left knee and wrist. Torn meniscus treated with injections; no surgery. Settled 07/30/2026 for $38,500 (client accepted in writing). This is a different, older file from her 06/09/2026 car accident (MC-01).',
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
    id: 'MC-22', level: 'Intermediate', programs: ['reception', 'cm'],
    summary: 'A DIFFERENT Maria Santos (not MC-01 or MC-21): a neighbor\'s dog bit her while she was gardening. Check the DOB before you share anything.',
    client: { name: 'Maria Santos', phone: '(555) 010-6412', email: 'msantos.garden@example.com', dob: '08/30/1971', ssn: 'XXX-XX-5307',
        address: '402 Magnolia Court, Riverton, GA 30318',
        emergency: { name: 'Lucia Santos', phone: '(555) 010-6413', relationship: 'Daughter' },
        employment: { status: 'Employed', employer: 'Riverton Unified School District', title: 'Cafeteria Manager' } },
    caseType: 'Dog Bite', phase: 'Investigation', attorney: 'Atty. David Okafor', caseManager: 'Luis Ortega',
    dateOfLoss: '07/28/2026', sol: '07/28/2028', target: '',
    narrative: 'Client was gardening in her front yard when her neighbor\'s German shepherd (owner Dale Fenton, 406 Magnolia Court) got through a broken fence and bit her right forearm and calf. ER stitches, then wound care. Client says the same dog bit a mail carrier in 2025. Speaks Spanish and English; Luis Ortega is her case manager.',
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
    id: 'MC-23', level: 'Intermediate', programs: ['reception', 'cm'],
    summary: 'James Wilson\'s SECOND file (same client as MC-06): a garage handrail gave way. In treatment while his truck-crash case is being paid out.',
    client: { name: 'James Wilson', phone: '(555) 010-4962', email: 'jwilson.rvt@example.com', dob: '09/17/1983', ssn: 'XXX-XX-3390',
        address: '17 Birchwood Lane, Riverton, GA 30311',
        emergency: { name: 'Nadia Wilson', phone: '(555) 010-4963', relationship: 'Wife' },
        employment: { status: 'Employed', employer: 'Riverton Distribution Center', title: 'Forklift Operator' } },
    caseType: 'Premise Liability', phase: 'Treatment', attorney: 'Atty. Marcus Reyes', caseManager: 'Tom Alvarez',
    dateOfLoss: '05/16/2026', sol: '05/16/2028', target: '',
    narrative: 'Client leaned on a stairwell handrail on level 3 of the Riverton Plaza parking garage; the rail was loose, gave way, and he fell about six steps. Lower-back injury and a right-wrist sprain. Garage management had an open work order on that rail since April. This is a different file from his 01/12/2025 truck crash (MC-06), which is in disbursement.',
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
    id: 'MC-24', level: 'Advanced', programs: ['reception', 'cm', 'intake'],
    summary: 'A DIFFERENT James Wilson (not MC-06 or MC-23): a retiree who fell on a hotel pool deck. His son is authorized. Check the DOB before you share anything.',
    client: { name: 'James Wilson', phone: '(555) 010-6520', email: '', dob: '04/02/1956', ssn: 'XXX-XX-7718',
        address: '5 Quarry Road, Riverton, GA 30325',
        emergency: { name: 'Kevin Wilson', phone: '(555) 010-6521', relationship: 'Son' },
        employment: { status: 'Retired', employer: '', title: 'Retired bus mechanic' } },
    caseType: 'Slip and Fall', phase: 'Investigation', attorney: 'Atty. David Okafor', caseManager: 'Priya Natarajan',
    dateOfLoss: '08/08/2026', sol: '08/08/2028', target: '',
    narrative: 'Client slipped on algae-slick tiles at the edge of the pool at the Grandview Hotel (Lakeshore Blvd) while visiting his grandchildren. Fractured right hip; partial hip replacement 08/09/2026, then inpatient rehab. The hotel says the deck was cleaned that morning; his son photographed the tiles the same day.',
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
   `mock: null` = not in the system.
   auth codes: client · authorized · failed · unauthorized ·
   business · newcaller (labels in front-desk-drill.js).
   ========================================================= */
const DRILL_CALLS = [
    { id: 'D01', mock: 'MC-01', auth: 'client', level: 1,
      opening: '"Hi, I\'m calling about my case. I lost my appointment card. When\'s my next chiropractor visit?"',
      gives: { name: 'Maria Santos', dob: '03/22/1988', address: '1187 Willow Bend Dr, Riverton', ssn4: '4821', callback: '(555) 010-4417', relationship: 'I\'m the client.', dol: 'June 9th, the car accident.' },
      actions: ['Tuesday 09/29/2026 at 10:30 AM at City Spine & Rehab (suggest she confirm with the clinic)', 'Thursday 10/01/2026 at 4:00 PM at City Spine & Rehab', 'Take a message; the front desk can\'t give out appointments', 'Tell her to call the clinic because you can\'t see appointments'],
      answer: 0, why: 'Verified client. Treatment tab: next chiro visit 09/29 at 10:30 AM (10/01 at 4:00 PM is physical therapy).' },
    { id: 'D02', mock: 'MC-01', auth: 'unauthorized', level: 1,
      opening: '"Hi, this is Rosa. I\'m Maria Santos\'s cousin. Has her case settled yet? How much is she getting?"',
      gives: { name: 'Rosa Santos', dob: 'Her birthday? March-something, 1988.', address: null, ssn4: null, callback: '(555) 010-4490', relationship: 'Cousin.', dol: 'The car accident, back in June I think.' },
      actions: ['Take a message only, without confirming the firm represents Maria', 'Say the case is still in treatment', 'Share the status since she knows Maria\'s birthday', 'Transfer her to Atty. Reyes'],
      answer: 0, why: 'Only the client is authorized (Notes 06/12). A relative is not authorized, whatever she knows.' },
    { id: 'D03', mock: 'MC-06', auth: 'failed', level: 2,
      opening: '"Yeah, this is James Wilson. Is my settlement check ready? I need it this week."',
      gives: { name: 'James Wilson', dob: '09/17/1983', address: 'I\'m at a new place, I\'d rather not say.', ssn4: 'I don\'t know it offhand.', callback: '(555) 010-4999', relationship: 'It\'s my case.', dol: 'January of last year. The box truck on I-85.' },
      actions: ['Explain you need one more identifier that matches the file; offer a callback from the case manager to the number on file', 'Give the check status; name and date of birth are enough', 'Ask for his full Social Security number instead', 'Hang up'],
      answer: 0, why: 'Only two identifiers (name, DOB). Anyone can find a DOB online. The rule is name + DOB + one more on file. His callback number doesn\'t match the file either.' },
    { id: 'D04', mock: 'MC-06', auth: 'client', level: 2,
      opening: '"Hi, James Wilson. Quick one: can my buddy Troy pick up my settlement check for me?"',
      gives: { name: 'James Wilson', dob: '09/17/1983', address: '17 Birchwood Lane', ssn4: '3390', callback: '(555) 010-4962', relationship: 'I\'m the client.', dol: '01/12/2025, the truck crash.' },
      actions: ['Checks go only to the client with photo ID unless the attorney approves a signed written authorization; route to Accounting (ext 500) / Priya Natarajan', 'Yes, if Troy brings his ID', 'Yes, if James texts a photo of his ID', 'The check will be mailed, so it doesn\'t matter'],
      answer: 0, why: 'Verified client, but the front desk can\'t authorize a third-party pickup. (The check isn\'t ready yet anyway: Notes 09/24.)' },
    { id: 'D05', mock: 'MC-07', auth: 'client', level: 2,
      opening: '"This is Keisha Brown. Nobody ever calls me back! I moved and I have a new number."',
      gives: { name: 'Keisha Brown', dob: '12/01/1995', address: '88 Elm Street, Apt 4 (my new place)', ssn4: '5149', callback: '(555) 010-5080', relationship: 'It\'s my case.' },
      actions: ['Verified by SSN last 4. Acknowledge, take the new phone and address, read them back, and send a priority message to Luis Ortega (ext 314)', 'Not verified: her address doesn\'t match, so end the call', 'Update the address in the CMS yourself and close the call', 'Tell her the case manager has been trying her old number'],
      answer: 0, why: 'The new address can\'t verify her, but the SSN last 4 matches the file. The case manager must update the file (Notes 09/18: her old mailbox was full).' },
    { id: 'D06', mock: 'MC-08', auth: 'authorized', level: 2,
      opening: '"Hi, I\'m calling for my father, Tomás Rivera. What time is his surgery?"',
      gives: { name: 'Daniela Rivera', dob: 'His birthday is 04/18/1964.', address: '905 Mission Road', ssn4: null, callback: '(555) 010-5189', relationship: 'I\'m his daughter. I signed the authorization in July.' },
      actions: ['Authorized: 10/14/2026 at Northside Surgery Center, arrive 7:00 AM (pre-op labs 10/07)', 'Not authorized; only the client can get information', 'Surgery is 10/07', 'Transfer her to the surgeon\'s office'],
      answer: 0, why: 'Daniela is on the communication authorization (07/24/2026) and gave her father\'s DOB and address on file.' },
    { id: 'D07', mock: 'MC-10', auth: 'unauthorized', level: 3,
      opening: '"I\'m Sofia Morales\'s mother, Angela Ruiz. I have a right to know what\'s happening with my daughter\'s case."',
      gives: { name: 'Angela Ruiz', dob: 'Sofia was born 06/02/2018.', address: 'Sofia lives with her dad on Orchard Lane.', ssn4: null, callback: '(555) 010-5390', relationship: 'I\'m her mother.' },
      actions: ['Respectfully take a message; share nothing (only Frank Morales, the guardian on file, is authorized)', 'Share the status; she\'s a parent and knows the child\'s DOB', 'Give her the next appointment only', 'Tell her she needs a court order'],
      answer: 0, why: 'Custody order and client instruction on file: no disclosure to Angela Ruiz without Frank\'s written authorization. Don\'t argue custody.' },
    { id: 'D08', mock: 'MC-10', auth: 'client', level: 2,
      opening: '"Hi, Frank Morales, calling about my daughter Sofia\'s case. When\'s her next plastic surgeon appointment?"',
      gives: { name: 'Frank Morales', dob: 'Sofia: 06/02/2018.', address: '14 Orchard Lane', ssn4: '2718 (Sofia\'s)', callback: '(555) 010-5305', relationship: 'I\'m her father. I signed with you.' },
      actions: ['Verified guardian: Lakeside Plastic Surgery, 11/10/2026 at 3:30 PM', 'Not verified: only the client herself can call', '09/08/2026', 'Take a message for Priya'],
      answer: 0, why: 'Frank is the parent/guardian who signed the retainer. Treatment tab: next visit 11/10/2026 at 3:30 PM.' },
    { id: 'D09', mock: 'MC-04', auth: 'business', level: 2,
      opening: '"Greg Hollis, Liberty Crest Insurance, about claim LC-25-99812. I\'ve got an offer: $65,000, open until Friday at 5."',
      gives: { name: 'Greg Hollis', dob: null, address: null, ssn4: null, callback: '(555) 010-7755', relationship: 'Adjuster for the at-fault driver.' },
      actions: ['Urgent: reach Atty. Marcus Reyes (ext 201) or Grace Kim (ext 313) now; otherwise a priority message with the amount and the deadline', 'Tell him the client wants the $100,000 limits', 'Call the client with the offer', 'Take a normal message for tomorrow'],
      answer: 0, why: 'An offer with a time limit is urgent. Never react to it or relay it to the client.' },
    { id: 'D10', mock: 'MC-02', auth: 'business', level: 2,
      opening: '"Brent Kowalski, Allied Retail Casualty, claim ARC-26-44091. I\'d like to set up a quick recorded statement with your client."',
      gives: { name: 'Brent Kowalski', dob: null, address: null, ssn4: null, callback: '(555) 010-7931', relationship: 'Adjuster for the store.' },
      actions: ['Never agree to a recorded statement; message Atty. David Okafor (ext 203) with the claim number', 'Schedule it for next week', 'Give him the client\'s phone number', 'Confirm the client broke his wrist'],
      answer: 0, why: 'He also handles MC-09. The claim number puts this on Derek Thompson\'s file (MC-02). No statements or facts from the front desk.' },
    { id: 'D11', mock: 'MC-05', auth: 'business', level: 3,
      opening: '"Hi, this is Voss & Tate, on Garcia v. Pine Ridge Property Management. We need to move the plaintiff\'s deposition on the 6th to the 13th."',
      gives: { name: 'Paula, assistant to Richard Voss', dob: null, address: null, ssn4: null, callback: '(555) 010-7990', relationship: 'Defense counsel\'s office.' },
      actions: ['Transfer to Janelle Price (ext 221) or Atty. Elena Brooks (ext 202); if unavailable, a priority message', 'Agree to the 13th', 'Tell her the client can\'t make the 13th', 'Ask her to email the client directly'],
      answer: 0, why: 'Depositions and court dates are never agreed at the front desk. The deposition is in 10 days.' },
    { id: 'D12', mock: 'MC-05', auth: 'authorized', level: 2,
      opening: '"Hi, I\'m Linda Garcia\'s son. What time do I need to bring my mom in on the 2nd?"',
      gives: { name: 'Marco Garcia', dob: 'Mom\'s birthday is 05/09/1961.', address: '2200 Pine Ridge Blvd, Unit 14', ssn4: null, callback: '(555) 010-4851', relationship: 'Her son. I signed a form in May.' },
      actions: ['Authorized: deposition prep with Atty. Brooks on 10/02/2026 at 2:00 PM at our office', 'The deposition is 10/02 at 10:00 AM', 'Not authorized; take a message', 'Transfer to defense counsel'],
      answer: 0, why: 'Marco signed a communication authorization (05/2026). Prep is 10/02 at 2:00 PM; the deposition is 10/06 at 10:00 AM.' },
    { id: 'D13', mock: 'MC-13', auth: 'client', level: 3,
      opening: '"Hi, Nicole Adams. I called last week. Is it too late for me to sue? The store\'s adjuster says I have plenty of time."',
      gives: { name: 'Nicole Adams', dob: '03/03/1984', address: '1520 Lakeshore Blvd', ssn4: '4470', callback: '(555) 010-5634', relationship: 'I\'m the one who got hurt.' },
      actions: ['Urgent: transfer to Atty. David Okafor (ext 203) or Intake (ext 100) now; no deadline advice', 'Tell her the statute runs 10/20/2026, so she has time', 'Agree with the adjuster', 'Book an intake appointment for next week'],
      answer: 0, why: 'The file flags the SOL as 10/20/2026. Deadline questions are legal advice; route them urgently.' },
    { id: 'D14', mock: 'MC-14', auth: 'unauthorized', level: 2,
      opening: '"Hi, this is Jenna Park with Channel 8 News. Can you confirm your firm represents Carlos Mendoza in the Redline Freight crash, and when is the trial?"',
      gives: { name: 'Jenna Park', dob: null, address: null, ssn4: null, callback: '(555) 010-8800', relationship: 'Reporter.' },
      actions: ['"We have no comment." Take her name and number for Atty. Brooks (ext 202)', 'Confirm representation but not the trial date', 'Give the public court case number', 'Transfer her to the client'],
      answer: 0, why: 'File note 09/10: no media comment; all press to Atty. Brooks. Confirm nothing.' },
    { id: 'D15', mock: 'MC-15', auth: 'authorized', level: 2,
      opening: '"Hi, I\'m calling about my mother\'s case, Patricia Lewis. Any update on more home-health hours?"',
      gives: { name: 'Michael Lewis', dob: 'Mom is 01/14/1946.', address: '12 Heritage Way', ssn4: null, callback: '(555) 010-5851', relationship: 'I\'m her son; I have power of attorney.' },
      actions: ['Authorized (POA): the case manager is checking with the provider and attorney, follow-up due 09/30; message Priya Natarajan (ext 311)', 'Not authorized; only Patricia can call', 'Approve the extra hours', 'Tell him to call Medicare'],
      answer: 0, why: 'Michael holds a durable POA on file. Tasks: call Michael re home-health hours by 09/30.' },
    { id: 'D16', mock: 'MC-15', auth: 'client', level: 2,
      opening: '"Hello? This is Patricia Lewis… I got a letter. Am I supposed to pay the lawyer now? I can\'t afford it."',
      gives: { name: 'Patricia Lewis', dob: '01/14/1946', address: '12 Heritage Way', ssn4: '1507', callback: '(555) 010-5850', relationship: 'It\'s my case, dear.' },
      actions: ['Speak slowly; reassure her the retainer is contingency (no fee unless there is a recovery), ask for a copy of the letter and message Priya Natarajan (ext 311)', 'Tell her to ignore the letter', 'Transfer her to Accounting to set up payments', 'Tell her Medicare pays the lawyer'],
      answer: 0, why: 'Verified client. Doc Hub: contingency retainer. The letter may be from Medicare or a provider, so get a copy to the CM.' },
    { id: 'D17', mock: 'MC-16', auth: 'business', level: 3,
      opening: '"This is the office of Attorney Sarah Klein. We now represent Hannah Pierce. Please send her complete file today."',
      gives: { name: 'Tina, paralegal for Atty. Sarah Klein', dob: null, address: null, ssn4: null, callback: '(555) 010-8120', relationship: 'New counsel\'s office.' },
      actions: ['Neutral and polite: ask for the signed client authorization/substitution in writing and route to Atty. Marcus Reyes (ext 201)', 'Email the file today', 'Refuse; the client still owes the firm', 'Call Hannah to ask if it\'s true'],
      answer: 0, why: 'Never release a file on a phone call. File note 09/24: any substitution or file request goes to Atty. Reyes.' },
    { id: 'D18', mock: 'MC-12', auth: 'business', level: 3,
      opening: '"Parkway Collision here. We\'ve got a Buick LaCrosse, plate GA-HRS0808, sitting in our lot at $45 a day. Who\'s paying?"',
      gives: { name: 'Mike at Parkway Collision', dob: null, address: null, ssn4: null, callback: '(555) 010-6610', relationship: 'Body shop.' },
      actions: ['Priority message to Kevin Lam, PD Specialist (ext 351); don\'t promise payment', 'Tell him the insurance will pay', 'Tell him to release the car to the client', 'Transfer to Accounting'],
      answer: 0, why: 'Search by plate finds William Harris (MC-12). Storage is adding up and PD is Kevin Lam\'s.' },
    { id: 'D19', mock: 'MC-09', auth: 'business', level: 2,
      opening: '"Premier Knee & Sports Medicine billing. Account PKS-5530. If we don\'t get paid by the 30th, this goes to collections."',
      gives: { name: 'Lorraine, billing office', dob: null, address: null, ssn4: null, callback: '(555) 010-3288', relationship: 'Provider billing.' },
      actions: ['Stay calm; a Letter of Protection is on file. Priority message to Rosa Delgado (ext 341) or Grace Kim (ext 313)', 'Promise payment by the 30th', 'Tell them to bill the client', 'Give them the settlement offer amount'],
      answer: 0, why: 'The account number matches Emily Nguyen\'s lien (MC-09). LOP on file; the lien negotiator handles it.' },
    { id: 'D20', mock: null, auth: 'newcaller', level: 1,
      opening: '"Hi, my name is Tyler Brooks. I was rear-ended yesterday on the highway and I think I need a lawyer."',
      gives: { name: 'Tyler Brooks', dob: '07/30/1990', address: '45 Aspen Court', ssn4: null, callback: '(555) 010-8341', relationship: 'I\'m the one who was hit.', dol: 'Yesterday, on the highway.' },
      actions: ['Not in the system: transfer to Intake (ext 100) or take his details for Intake; no advice on the case', 'Open a case for him yourself', 'Tell him he has a strong case', 'Transfer him to Atty. Elena Brooks since they share a name'],
      answer: 0, why: 'No case on file (a search for "Brooks" finds Atty. Elena Brooks\'s cases, not him). New matters go to Intake.' },
    { id: 'D21', mock: 'MC-17', auth: 'client', level: 1,
      opening: '"Hey, Andre Coleman. When do I get money for my bike? I can\'t work without it."',
      gives: { name: 'Andre Coleman', dob: '09/03/1991', address: '19 Riverside Walk, Apt 7', ssn4: '5582', callback: '(555) 010-6071', relationship: 'It\'s my case.' },
      actions: ['The bike claim is with the at-fault carrier; priority message to Kevin Lam (ext 351). No promises on amount or date', 'Tell him $2,400 is coming next week', 'Tell him to file with his own insurance', 'Transfer to Accounting'],
      answer: 0, why: 'Verified. Notes 09/02: PD claim with Harbor Point, waiting on the valuation (Kevin Lam).' },
    { id: 'D22', mock: 'MC-18', auth: 'business', level: 3,
      opening: '"Martin Blake, Continental Product Liability Group, claim CPLG-26-7719. We\'d like to pick up the pressure cooker for testing this week."',
      gives: { name: 'Martin Blake', dob: null, address: null, ssn4: null, callback: '(555) 010-7988', relationship: 'Manufacturer\'s insurer.' },
      actions: ['Never release or agree to anything about evidence; priority message to Atty. Elena Brooks (ext 202)', 'Give him the SecureHold address', 'Agree to Thursday', 'Ask the client to bring it in'],
      answer: 0, why: 'File note 07/10: evidence stays at SecureHold; inspection requests go to Atty. Brooks.' },
    { id: 'D23', mock: 'MC-19', auth: 'business', level: 3,
      opening: '"Deborah Kline, City of Riverton Risk Management. We received a notice of claim for Samuel Boateng. Can we get his recorded statement next week?"',
      gives: { name: 'Deborah Kline', dob: null, address: null, ssn4: null, callback: '(555) 010-7999', relationship: 'City risk management.' },
      actions: ['No statements or scheduling; route to Atty. Marcus Reyes (ext 201) with claim RM-26-0415', 'Schedule it; it\'s the city', 'Give her the client\'s number', 'Tell her the notice was late'],
      answer: 0, why: 'File note 08/14: all contact from the City goes to Atty. Reyes.' },
    { id: 'D24', mock: 'MC-20', auth: 'unauthorized', level: 3,
      opening: '"This is Daniel Hammond. My dad George died in that crash in March. When does the family get the money?"',
      gives: { name: 'Daniel Hammond', dob: 'Dad was born 12/05/1949.', address: '8 Willow Creek Lane (Dad\'s house)', ssn4: null, callback: '(555) 010-6399', relationship: 'His son.' },
      actions: ['Offer condolences; he isn\'t authorized (only Carol, the administrator). Take a message for Atty. Brooks / Priya and suggest he speak with Carol', 'He knows the DOB and address, so share the status', 'Tell him the demand is with the attorney', 'Transfer to Accounting'],
      answer: 0, why: 'Knowing the decedent\'s details doesn\'t authorize him. Notes 05/21: only Carol Hammond.' },
    { id: 'D25', mock: 'MC-20', auth: 'authorized', level: 3,
      opening: '"Hi, this is Carol Hammond, about my father George Hammond\'s case. Where do things stand?"',
      gives: { name: 'Carol Hammond', dob: 'Dad: 12/05/1949.', address: '8 Willow Creek Lane', ssn4: null, callback: '(555) 010-6307', relationship: 'I\'m his daughter and the administrator of his estate.' },
      actions: ['Verified administrator: the wrongful-death demand is in attorney review; offer a callback from Priya Natarajan (ext 311)', 'Not authorized; estates can\'t call', 'Tell her the value of the claim', 'Say nothing has happened'],
      answer: 0, why: 'Letters of administration name Carol. Notes 09/20: demand in attorney review.' },
    { id: 'D26', mock: 'MC-11', auth: 'failed', level: 2,
      opening: '"Hi, Ngozi Okonkwo here. Did the hospital agree to reduce the lien yet?"',
      gives: { name: 'Ngozi Okonkwo', dob: '10/01/1979', address: 'Summit Terrace', ssn4: 'I don\'t have it with me.', callback: '(555) 010-5499', relationship: 'It\'s my case.' },
      actions: ['The DOB doesn\'t match the file: don\'t share; offer a callback from the case manager to the number on file', 'Close enough; share the status', 'Ask her to spell her name again and then share', 'Transfer to Rosa Delgado so she can check'],
      answer: 0, why: 'File DOB is 10/10/1979, not 10/01. Street name alone isn\'t a full address. Not verified.' },
    { id: 'D27', mock: 'MC-03', auth: 'business', level: 1,
      opening: '"Monica Reyes-Hart, Homestead Fire & Casualty, claim HFC-26-02117. When am I getting the demand?"',
      gives: { name: 'Monica Reyes-Hart', dob: null, address: null, ssn4: null, callback: '(555) 010-7640', relationship: 'Homeowner\'s insurer.' },
      actions: ['Take a message for Tom Alvarez (ext 312) with her claim number; no dates or details', 'Tell her 10/02', 'Tell her it\'s with the attorney', 'Transfer to Atty. Marcus Reyes because the names match'],
      answer: 0, why: 'She also handles MC-10 and MC-22. Her claim number is Aisha Patel\'s (MC-03). No dates or details from the front desk.' },
    // Same name on several files (MC-01/21/22 Maria Santos, MC-06/23/24 James Wilson):
    // the date of the accident and the DOB decide which file the call belongs to.
    { id: 'D28', mock: 'MC-21', auth: 'client', level: 2,
      opening: '"Hi, Maria Santos. When do I get my money from my fall at the pharmacy? It settled back in July."',
      gives: { name: 'Maria Santos', dob: '03/22/1988', address: '1187 Willow Bend Dr, Riverton', ssn4: '4821', callback: '(555) 010-4417', relationship: 'I\'m the client.', dol: 'January 14th, 2025. I fell at CareWay Pharmacy.' },
      actions: ['Settled; the firm is waiting on two lien reductions, so no date yet. Message Rosa Delgado (ext 341) / Grace Kim (ext 313)', 'Her case is still in treatment, so there\'s no money yet', 'The check will be ready this Friday', 'Transfer her to Accounting to pick up her check'],
      answer: 0, why: 'She has two files. The date of the fall (01/14/2025) puts the call on MC-21, not her 2026 car accident (MC-01, still in treatment). Notes 08/20: waiting on two lien reductions.' },
    { id: 'D29', mock: 'MC-01', auth: 'unauthorized', level: 3,
      opening: '"Hi, this is Eduardo Santos, Maria\'s husband. You have my name on file. Did the other driver\'s insurance pay for her Civic yet?"',
      gives: { name: 'Eduardo Santos', dob: 'Maria\'s birthday is 03/22/1988.', address: '1187 Willow Bend Dr', ssn4: null, callback: '(555) 010-4418', relationship: 'Her husband.', dol: 'The car accident, June 9th this year.' },
      actions: ['He\'s authorized only on her 2025 pharmacy-fall file, not this car-accident file: take a message, share nothing', 'He\'s on file as authorized, so give the property-damage status', 'Tell him the claim is still open', 'Transfer him to Kevin Lam'],
      answer: 0, why: 'The car accident (DOL 06/09/2026) is MC-01, where only the client is authorized (Notes 06/12). Eduardo\'s authorization is on MC-21, the pharmacy fall, only. Authorization is per file.' },
    { id: 'D30', mock: 'MC-21', auth: 'authorized', level: 3,
      opening: '"Eduardo Santos, calling for my wife Maria about her slip and fall at the pharmacy. Did the health plan agree to lower its bill yet?"',
      gives: { name: 'Eduardo Santos', dob: 'Maria\'s birthday is 03/22/1988.', address: '1187 Willow Bend Dr, Riverton', ssn4: null, callback: '(555) 010-4418', relationship: 'Her husband. I signed a form for that case.', dol: 'January 14th, 2025.' },
      actions: ['Authorized on this file: not yet (request sent 08/20, follow-up 10/05); offer a callback from Rosa Delgado (ext 341)', 'Not authorized: only Maria can get information', 'Yes, the health plan agreed to $3,000', 'Tell him the case is still in treatment'],
      answer: 0, why: 'The pharmacy fall (DOL 01/14/2025) is MC-21, where Eduardo signed a communication authorization (02/03/2025). He gave Maria\'s DOB and the address on file.' },
    { id: 'D31', mock: 'MC-22', auth: 'client', level: 2,
      opening: '"Hi, this is Maria Santos. Did you get the report from animal control yet?"',
      gives: { name: 'Maria Santos', dob: '08/30/1971', address: '402 Magnolia Court', ssn4: '5307', callback: '(555) 010-6412', relationship: 'It\'s my case.', dol: 'July 28th. My neighbor\'s dog.' },
      actions: ['Not received yet (requested 08/06, follow-up by 10/02); message Luis Ortega (ext 314)', 'Not verified: her DOB doesn\'t match Maria Santos\'s file', 'Her chiropractor visit is Tuesday at 10:30 AM', 'Tell her the case settled and her money is coming'],
      answer: 0, why: 'Three files are named Maria Santos. Her DOB (08/30/1971) and the dog bite (07/28/2026) match MC-22, not MC-01 or MC-21 (DOB 03/22/1988). Notes 08/06: report requested.' },
    { id: 'D32', mock: 'MC-23', auth: 'client', level: 2,
      opening: '"James Wilson here. When\'s my back injection? The one for the garage fall."',
      gives: { name: 'James Wilson', dob: '09/17/1983', address: '17 Birchwood Lane', ssn4: '3390', callback: '(555) 010-4962', relationship: 'I\'m the client.', dol: 'May 16th, this year.' },
      actions: ['Riverton Pain Institute, Wednesday 10/07/2026 at 1:15 PM', 'Wednesday 09/30/2026 at 5:30 PM', 'His case settled, so there are no more appointments', 'Take a message; the front desk can\'t give out appointments'],
      answer: 0, why: 'He has two files. The garage fall (DOL 05/16/2026) is MC-23; the truck crash (MC-06) is settled. Treatment tab: injection 10/07 at 1:15 PM (09/30 is chiropractic).' },
    { id: 'D33', mock: 'MC-24', auth: 'authorized', level: 3,
      opening: '"Hi, I\'m calling for my dad, James Wilson. When is his next physical therapy?"',
      gives: { name: 'Kevin Wilson', dob: 'Dad\'s birthday is 04/02/1956.', address: '5 Quarry Road', ssn4: null, callback: '(555) 010-6521', relationship: 'I\'m his son. I signed a form at the rehab center.', dol: 'August 8th. He fell at the hotel pool.' },
      actions: ['Authorized: Motion Physical Therapy, Thursday 10/01/2026 at 11:00 AM', 'Not authorized: only the client can get information', 'Wednesday 09/30/2026 at 5:30 PM', 'His settlement check isn\'t ready yet'],
      answer: 0, why: 'Three files are named James Wilson. The DOB (04/02/1956) and the pool fall (08/08/2026) match MC-24, where his son Kevin is authorized (08/18/2026).' }
];


if (typeof window !== 'undefined') {
    window.MOCK_CASES = MOCK_CASES;
    window.MOCK_FIRM = MOCK_FIRM;
    window.MOCK_PROGRAMS = MOCK_PROGRAMS;
    window.DRILL_CALLS = DRILL_CALLS;
}
if (typeof module !== 'undefined') module.exports = { MOCK_CASES, MOCK_FIRM, MOCK_PROGRAMS, DRILL_CALLS };
