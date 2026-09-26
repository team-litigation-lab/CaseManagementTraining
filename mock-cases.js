/* =========================================================
   LSH CMS — TRAINING LIBRARY: HARDCODED MOCK CASES
   ---------------------------------------------------------
   Fictional personal-injury files every training program can open
   (Receptionist / Front Desk, Intake, Case Management, EA/PA, …).
   They live in this file, not in the database, so they are identical
   for every trainee and can't be edited or deleted. Opening one loads
   it into the case editor as VIEW ONLY; "Work on a practice copy"
   lets a trainee save their own copy (a normal case they own).

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
    { id: 'ea', label: 'EA / PA' }
];

const MOCK_CASES = [
{
    id: 'MC-01', level: 'Starter', programs: ['reception', 'cm', 'ea'],
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
    id: 'MC-04', level: 'Intermediate', programs: ['reception', 'cm'],
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
    id: 'MC-08', level: 'Intermediate', programs: ['reception', 'cm'],
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
    id: 'MC-12', level: 'Starter', programs: ['reception', 'cm', 'intake'],
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
}
];

if (typeof window !== 'undefined') {
    window.MOCK_CASES = MOCK_CASES;
    window.MOCK_FIRM = MOCK_FIRM;
    window.MOCK_PROGRAMS = MOCK_PROGRAMS;
}
if (typeof module !== 'undefined') module.exports = { MOCK_CASES, MOCK_FIRM, MOCK_PROGRAMS };
