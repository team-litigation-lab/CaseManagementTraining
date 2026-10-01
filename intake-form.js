/* =========================================================
   LSH CMS — NEW INTAKE
   ---------------------------------------------------------
   📝 New Intake (the sidebar, and the Intake folder's 📝 New
   intake): the trainee picks the case type, and that type's intake
   form opens (the firm's five intake sheets):
     MVA · Slip and Fall ·
     Premises Liability · Dog Bite · Medical Malpractice
   They gather the client's information and the facts of loss, then
   💾 Save Intake:
     - the intake is graded on how much they gathered (key
       information, questions answered, detail in the facts of loss);
     - a new case is created from it: the editor is filled in from
       the answers and the case is saved, with its Case ID;
     - "New case created" shows the Case ID, the grade and what to
       ask next time.
   Answers with no case field of their own go into a Case Note, and
   the intake and its grade stay with the case (Profile → 📋 Intake
   form: view, print). An unfinished intake is kept in this browser
   (per user) until it's saved or discarded.

   No <select> or contenteditable in the form on purpose: the case
   editor saves every select and contenteditable on the page by
   position (buildCaseContentPayload in app.js). The intake on the
   case is a keyed section (#kx-intake in index.html), saved by id.
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const str = (v) => String(v == null ? '' : v).trim();
    const toast = (m, t, d) => { if (typeof showToast === 'function') showToast(m, t || 'info', d); };
    const session = () => (typeof getSession === 'function' ? getSession() : null);
    const signedIn = () => typeof hasAuthorizedAccess === 'function' && hasAuthorizedAccess();
    const draftKey = () => 'LSH_NEW_MATTER_DRAFT_V1:' + ((session() || {}).username || '');
    const pad = (n) => String(n).padStart(2, '0');
    const today = () => { const d = new Date(); return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`; };
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    /* ---------- the forms ----------
       F(key, label, type, options): a question. Types: text, date, time, phone, email, ssn, money,
         area (several lines), yn (Yes / No), choice (one of options.choices), check (a box to tick),
         part (a body part: the injury, and Right / Left / Both when options.sides).
       G(key, label, fields, options): rows of the same questions (witnesses, providers…), up to
         options.max; options.min rows show from the start (default 1).
       H(label): a heading inside a section.
       Options: w (width, out of 4 columns), req (needed to save: only the client's name), when (shown
       only when that Yes / No question is Yes), ph (placeholder), auto: 'today' (filled with today's
       date), added (not on the paper form: the case file needs it), hint (a line under the question). */
    const F = (k, label, t, o) => Object.assign({ k, label, t: t || 'text' }, o || {});
    const G = (k, label, fields, o) => Object.assign({ k, label, t: 'group', fields }, o || {});
    const H = (label, o) => Object.assign({ t: 'head', label }, o || {});
    const WIDTH = { text: 2, email: 2, date: 1, time: 1, phone: 1, ssn: 1, money: 1, area: 4, yn: 4, choice: 4, check: 4, part: 4, group: 4, head: 4 };
    const ACK = 'I understand that this is a free consultation about my accident and that I am not represented until I speak with the attorney who agrees to accept my case and I sign a fee agreement. I understand that my case may or may not be accepted by the attorney.';
    // The facts of loss: graded on how much detail was gathered.
    const FACTS_HINT = 'Graded on detail: what happened, how, where and when, who was involved or at fault, and what the client did right after.';
    const DIAGRAM = 'The accident scene (the paper form asks for a diagram: describe the layout, where you were and what you hit or fell on)';

    // Slip and Fall and Dog Bite: the same client block, treatment history, lost income and additional information.
    const sfClient = () => ({ id: 'client', title: 'Client', items: [
        F('today', "Today's Date", 'date', { auto: 'today' }),
        F('first', 'First Name', 'text', { req: 1, w: 1 }), F('middle', 'Middle Name', 'text', { w: 1 }), F('last', 'Last Name', 'text', { req: 1, w: 1 }),
        F('address', 'Address', 'text', { w: 2 }), F('city', 'City', 'text', { w: 1 }), F('state', 'State', 'text', { w: 1 }),
        F('homePhone', 'Home Phone', 'phone'), F('cellPhone', 'Cell Phone', 'phone'), F('workPhone', 'Work Phone', 'phone'), F('email', 'Email Address', 'email', { w: 1 }),
        F('dob', 'Date of Birth', 'date'), F('ssn', 'SSN', 'ssn'),
        F('marital', 'Marital Status', 'choice', { choices: ['Married', 'Single', 'Divorced', 'Widowed', 'Minor'] }),
        F('spouseName', "Spouse's Name"), F('spouseDob', "Spouse's Date of Birth", 'date'), F('spouseSsn', "Spouse's SSN", 'ssn'),
    ] });
    const sfInsurance = () => [
        F('locationPhotos', 'Do you have any pictures of the location where this accident occurred?', 'yn'),
        F('ownerInsKnown', 'Do you know the name of the insurance carrier of the owners/tenants where this accident occurred?', 'yn'),
        F('ownerInsurers', 'Name(s) of the insurance company', 'text', { w: 4, when: 'ownerInsKnown' }),
        F('reportedToIns', 'Did you report this accident to any insurance agent or company?', 'yn'),
        F('statementGiven', 'Did you give a statement to any insurance company?', 'yn'),
        F('statementDetails', 'When, and to what insurance company?', 'text', { w: 4, when: 'statementGiven' }),
        F('claimNumbers', 'Claim numbers you have been given by any insurance carrier for this accident', 'text', { w: 4 }),
    ];
    const sfHospital = () => [
        F('hospitalYn', 'Did you go to the hospital due to your injuries?', 'yn'),
        F('ambulance', 'Were you transported from the scene via ambulance?', 'yn', { when: 'hospitalYn' }),
        F('ambulanceCo', 'Name of the ambulance company', 'text', { when: 'ambulance' }),
        F('hospital', 'Name of the hospital', 'text', { when: 'hospitalYn' }),
        F('hospitalStay', 'How long did you stay at the hospital?', 'text', { when: 'hospitalYn' }),
        F('hospitalTreatment', 'What kind of treatment did you receive from the hospital?', 'area', { when: 'hospitalYn' }),
    ];
    const sfProviders = () => G('providers', 'Other providers you have treated with or are currently treating with as a result of this accident (specialist, chiropractor, primary care physician, physical therapy, rehabilitation)',
        [F('name', 'Name', 'text', { w: 3 }), F('phone', 'Phone Number', 'phone')], { max: 5, add: '+ Add provider' });
    const sfHistory = () => [
        F('healthYn', 'Do you have health insurance?', 'yn'), F('healthCarrier', 'What carrier?', 'text', { when: 'healthYn' }),
        F('priorYn', 'Have you had any other injuries or medical treatment before this accident?', 'yn'),
        F('prior5', 'Are the injuries/medical treatment within the past five years?', 'yn', { when: 'priorYn' }),
        F('priorDetails', 'Year of the previous accident, type of accident and type of injuries/medical treatment', 'area', { when: 'priorYn' }),
        F('medsYn', 'Were you taking any medication on the date of the accident?', 'yn'), F('meds', 'What medications?', 'text', { w: 4, when: 'medsYn' }),
        F('laterYn', 'Have you had any other injuries after this accident?', 'yn'), F('later', 'Please describe', 'area', { when: 'laterYn' }),
    ];
    const sfWages = () => ({ id: 'wages', title: 'Lost Income or Wages', items: [
        F('missedWork', 'Did you miss work time as a result of this accident?', 'yn'), F('timeMissed', 'How much time?', 'text', { when: 'missedWork' }),
        F('employer', 'Your employer / occupation', 'text', { w: 4 }),
        F('employerAddress', 'Address', 'text', { w: 4 }),
        F('supervisor', 'Name of supervisor and telephone number', 'text', { w: 4 }),
    ] });
    const sfAdditional = () => ({ id: 'additional', title: 'Additional Information', items: [
        F('bankruptcy', 'Have you or are you filing for bankruptcy?', 'yn'),
        F('childSupport', 'Are you paying child support?', 'yn'),
        F('otherAttyYn', 'Do you currently or have you had another attorney in this matter?', 'yn'),
        F('otherAtty', 'Who is/was your other attorney?', 'text', { w: 4, when: 'otherAttyYn' }),
        G('emergency', 'Emergency contact information: two close relatives who do not live with you', [F('name', 'Name'), F('phone', 'Phone Number', 'phone'), F('relation', 'Relation', 'text', { w: 1 })], { min: 2, max: 2 }),
        F('hearAbout', 'How did you hear about us?', 'text', { w: 4 }),
        H('Acknowledgment'),
        F('ackRead', ACK, 'check'),
        F('ackName', 'Client name (signature)'), F('ackDate', 'Date', 'date', { auto: 'today' }),
    ] });
    const PARTS = [['bpHead', 'Head'], ['bpJaw', 'Jaw / mouth'], ['bpNeck', 'Neck'], ['bpShoulders', 'Shoulders', 1], ['bpUpperBack', 'Upper back'], ['bpArms', 'Arms', 1],
        ['bpHands', 'Hands', 1], ['bpChest', 'Chest'], ['bpTorso', 'Torso'], ['bpOrgans', 'Any problems with internal organs?'], ['bpMidBack', 'Mid back'], ['bpHips', 'Hips', 1],
        ['bpLowBack', 'Low back'], ['bpLegs', 'Legs', 1], ['bpFeet', 'Feet', 1], ['bpOther', 'Any other symptoms or problems']];

    const FORMS = {
        pi: {
            title: 'MVA', icon: '🚗', caseType: 'MVA',
            sections: [
                { id: 'client', title: 'Injured Party', items: [
                    F('first', 'First Name', 'text', { req: 1, w: 1 }), F('middle', 'Middle', 'text', { w: 1 }), F('last', 'Last', 'text', { req: 1 }),
                    F('address', 'Address', 'text', { w: 4 }), F('city', 'City'), F('state', 'State', 'text', { w: 1 }), F('zip', 'Zip Code', 'text', { w: 1 }),
                    F('homePhone', 'Home #', 'phone'), F('cellPhone', 'Cell #', 'phone'), F('email', 'Email Address', 'email'),
                    F('ssn', 'Social Security #', 'ssn'), F('dl', "Driver's License #", 'text', { w: 1 }), F('dob', 'Date of Birth', 'date', { added: 1 }),
                    G('injured2', 'Another injured party (the form has room for two)', [F('first', 'First Name', 'text', { w: 1 }), F('middle', 'Middle', 'text', { w: 1 }), F('last', 'Last'),
                        F('address', 'Address', 'text', { w: 4 }), F('city', 'City'), F('state', 'State', 'text', { w: 1 }), F('zip', 'Zip Code', 'text', { w: 1 }),
                        F('homePhone', 'Home #', 'phone'), F('cellPhone', 'Cell #', 'phone'), F('email', 'Email Address', 'email'),
                        F('ssn', 'Social Security #', 'ssn'), F('dl', "Driver's License #", 'text', { w: 1 })], { min: 0, max: 1, add: '+ Add another injured party' }),
                ] },
                { id: 'facts', title: 'Facts on the Incident', items: [
                    F('dol', 'Date of Injury', 'date'), F('time', 'Time of Day/Night', 'time'), F('dayOfWeek', 'Day of Week', 'text', { w: 1 }), F('weather', 'Weather Conditions', 'text', { w: 1 }),
                    F('location', 'Location', 'text', { w: 4 }),
                    H('Facts of loss (summary of incident)'),
                    F('description', 'Describe what occurred', 'area', { rows: 6, hint: FACTS_HINT }),
                ] },
                { id: 'atfault', title: 'Person Who Caused Injury', items: [
                    F('afName', 'Full Name / Company'), F('afDl', "Driver's License #", 'text', { w: 1 }), F('afPhone', 'Telephone #', 'phone'),
                    F('afAddress', 'Address', 'text', { w: 4 }),
                ] },
                { id: 'witnesses', title: 'Witnesses to Accident', items: [
                    G('witnesses', 'Witnesses', [F('name', 'Name', 'text', { w: 3 }), F('phone', 'Telephone #', 'phone')], { max: 2, add: '+ Add witness' }),
                ] },
                { id: 'reports', title: 'Reports', items: [
                    F('policeReport', 'Police report?', 'yn'),
                    F('policeAgency', 'Agency', 'text', { when: 'policeReport' }), F('policeReportNo', 'Report #', 'text', { when: 'policeReport' }),
                    F('officerName', 'Officer Name', 'text', { when: 'policeReport' }), F('officerId', 'ID #', 'text', { when: 'policeReport' }),
                    F('paramedic', 'Paramedic reports?', 'yn'),
                    F('paramedicAgency', 'Agency', 'text', { when: 'paramedic' }), F('paramedicReportNo', 'Report #', 'text', { when: 'paramedic' }),
                ] },
                { id: 'autoins', title: 'Auto Insurance', items: [
                    H('Your insurance'),
                    F('ownCo', 'Company'), F('ownPhone', 'Telephone #', 'phone'), F('ownPolicy', 'Policy #', 'text', { w: 1 }),
                    F('ownClaimMade', 'Insurance claim made?', 'yn'),
                    F('ownClaim', 'Claim #', 'text', { when: 'ownClaimMade' }), F('ownAdjuster', 'Adjuster'), F('ownAdjPhone', 'Telephone #', 'phone'), F('ownAdjExt', 'ext.', 'text', { w: 1 }),
                    H("At-fault parties' insurance"),
                    F('afCo', 'Company'), F('afInsPhone', 'Telephone #', 'phone'), F('afPolicy', 'Policy #', 'text', { w: 1 }),
                    F('afClaimMade', 'Insurance claim made?', 'yn'),
                    F('afClaim', 'Claim #', 'text', { when: 'afClaimMade' }), F('afAdjuster', 'Adjuster'), F('afAdjPhone', 'Telephone #', 'phone'), F('afAdjExt', 'ext.', 'text', { w: 1 }),
                ] },
                { id: 'auto', title: 'Vehicles', items: [
                    H('Your vehicle'),
                    F('vMake', 'Make', 'text', { w: 1 }), F('vModel', 'Model', 'text', { w: 1 }), F('vYear', 'Year', 'text', { w: 1 }), F('vColor', 'Color', 'text', { w: 1 }),
                    F('vPlate', 'License Plate #', 'text'),
                    F('vOwner', 'Registered owner (name, address and telephone # if not you)', 'area', { rows: 2 }),
                    F('vDriver', 'Who was driving (name, address and telephone # if not you)', 'area', { rows: 2 }),
                    F('vDamage', 'Damages to vehicle', 'area', { rows: 2 }),
                    F('vTowed', 'Was the vehicle towed?', 'yn'),
                    F('vBodyShop', 'Body shop info', 'area', { rows: 2 }),
                    H("Defendant's vehicle info"),
                    F('dMake', 'Make', 'text', { w: 1 }), F('dModel', 'Model', 'text', { w: 1 }), F('dYear', 'Year', 'text', { w: 1 }), F('dColor', 'Color', 'text', { w: 1 }),
                    F('dPlate', 'License Plate #', 'text'),
                    F('dOwner', 'Registered owner (name, address and telephone #)', 'area', { rows: 2 }),
                    F('dDriver', 'Who was driving (name, address and telephone #)', 'area', { rows: 2 }),
                    F('dDamage', 'Damages to vehicle', 'area', { rows: 2 }),
                ] },
                { id: 'health', title: 'Health Insurance', items: [
                    F('healthYn', 'Health insurance?', 'yn'),
                    F('healthProvider', 'Provider', 'text', { when: 'healthYn' }), F('healthNo', 'Health Care #', 'text', { w: 1, when: 'healthYn' }), F('healthPhone', 'Telephone #', 'phone', { when: 'healthYn' }),
                ] },
                { id: 'injuries', title: 'Injuries / Treatment', items: [
                    F('injuries', 'Type of injuries', 'area'),
                    F('hospital', 'Hospital where treated (name, address and telephone #)', 'area', { rows: 2 }),
                    F('admitDates', 'Dates of admission and release date', 'text', { w: 4 }),
                ] },
                { id: 'prior', title: 'Prior Accidents', items: [
                    F('priorAccidents', 'Prior accidents (provide date & any injuries)', 'area'),
                ] },
                { id: 'personal', title: 'Personal History', items: [
                    F('marital', 'Marital Status', 'choice', { choices: ['Single', 'Married', 'Divorced'] }),
                    F('spouseName', "Spouse's Name", 'text', { w: 4 }),
                    F('children', 'Children?', 'yn'),
                    G('kids', 'Children', [F('name', 'Name'), F('age', 'Age', 'text', { w: 1 }), F('dob', 'DOB', 'date')], { max: 4, when: 'children', add: '+ Add child' }),
                ] },
                { id: 'employment', title: 'Employment', items: [
                    F('employer', 'Company', 'text', { w: 4 }), F('position', 'Occupation / Position', 'text', { w: 4 }),
                    F('employDate', 'Date of Employment', 'date'), F('wage', 'Hourly Wage', 'money'),
                    F('lostFrom', 'Dates lost from work because of injury: From', 'date'), F('lostTo', 'To', 'date'),
                    F('lostTotal', 'Total Amount of Income Lost', 'money'),
                ] },
            ],
        },
        slipfall: {
            title: 'Slip and Fall', icon: '⚠️', caseType: 'Slip and Fall',
            sections: [
                sfClient(),
                { id: 'accident', title: 'Accident Details', items: [
                    F('dol', 'Date of Accident', 'date'), F('time', 'Time of Accident', 'time'),
                    F('location', 'What was the location and address of the accident?', 'text', { w: 4 }),
                    F('incCity', 'City'), F('incState', 'State'),
                    F('incidentReport', 'Was an incident report taken due to this accident?', 'yn'), F('incidentNo', 'Incident No.', 'text', { when: 'incidentReport' }),
                    F('propertyType', 'How would you describe the property where this accident occurred? (commercial property, private property)', 'text', { w: 4 }),
                    F('adverseParties', 'What are the names of any and all adverse parties where you fell?', 'area', { rows: 2 }),
                    H('Facts of loss'),
                    F('description', 'Describe in detail how this accident happened', 'area', { rows: 6, hint: FACTS_HINT }),
                    F('diagram', DIAGRAM, 'area', { rows: 2 }),
                ] },
                { id: 'witnesses', title: 'Witnesses, Photos and Insurance', items: [
                    F('witnessesYn', 'Did you talk to any witnesses at the scene of the accident?', 'yn'),
                    G('witnesses', 'Witnesses', [F('name', 'Name'), F('relation', 'Relation to you'), F('address', 'Address'), F('phone', 'Phone #', 'phone')], { max: 4, when: 'witnessesYn', add: '+ Add witness' }),
                    ...sfInsurance(),
                ] },
                { id: 'injuries', title: 'Injuries and Treatment', items: [
                    F('injuries', 'What injuries did you receive from this accident?', 'area'),
                    ...sfHospital(),
                    F('diagnostics', 'Did you have x-rays, MRI or other diagnostic tests?', 'yn'),
                    F('diagnosticsDetails', 'What type, and what results?', 'area', { when: 'diagnostics', rows: 2 }),
                    F('bonesScarring', 'Did you receive any broken bones or scarring from this accident?', 'yn'),
                    F('bonesScarringDetails', 'Explain', 'area', { when: 'bonesScarring', rows: 2 }),
                    F('injuryPhotos', 'Have you taken any photographs of your accident injuries?', 'yn'),
                    sfProviders(),
                    F('medBills', 'Approximate amount of your medical bills', 'money'),
                    F('revisionEstimate', 'Did they give you an estimate cost for such future revision?', 'text', { w: 3 }),
                    ...sfHistory(),
                ] },
                sfWages(),
                sfAdditional(),
            ],
        },
        premises: {
            title: 'Premises Liability', icon: '🏢', caseType: 'Premise Liability',
            sections: [
                { id: 'party', title: 'Party', items: [
                    F('today', 'Date', 'date', { auto: 'today' }),
                    F('name', 'Legal Name', 'text', { req: 1 }), F('sex', 'Sex', 'text', { w: 1 }),
                    F('dob', 'DOB', 'date'), F('ssn', 'SSN', 'ssn'), F('nickname', 'Nickname'),
                    F('address', 'Address', 'text', { w: 4 }),
                    F('homePhone', 'Phone (home)', 'phone'), F('fax', '(fax)', 'phone'), F('workPhone', '(office)', 'phone'), F('cellPhone', '(cell / other)', 'phone'),
                    F('email', '(e-mail)', 'email', { w: 4 }),
                    F('marital', 'Marital Status', 'choice', { choices: ['Married', 'Divorced', 'Single', 'Separated', 'Domestic Partner', 'Widow/er'] }),
                    F('spouseName', "Spouse's name (if applicable)"), F('formerNames', 'Your former name(s)'),
                    F('dependents', 'Dependents / ages', 'text', { w: 4 }),
                    F('priorAccidents', 'Prior accidents', 'area', { rows: 2 }),
                    H('Emergency contact (someone not in your current household)'),
                    F('emName', 'Name'), F('emRelation', 'Relationship', 'text', { w: 1 }), F('emPhone', 'Telephone number', 'phone'),
                    F('emAddress', 'Address', 'text', { w: 4 }),
                    F('bankruptcyPlans', 'Do you have any plans to file for bankruptcy in the near future?', 'yn'),
                    F('arrested', 'Have you ever been arrested?', 'yn'), F('arrestedDetails', 'Please explain', 'area', { when: 'arrested', rows: 2 }),
                ] },
                { id: 'case', title: 'Case', items: [
                    F('dol', 'Date of Incident', 'date'),
                    H('Facts of loss'),
                    F('description', 'Provide a brief description of what occurred', 'area', { rows: 6, hint: FACTS_HINT }),
                    F('location', 'Location of incident', 'text', { w: 4 }),
                    F('incCity', 'City', 'text', { w: 1 }), F('incCounty', 'County', 'text', { w: 1 }), F('time', 'Time', 'time'),
                    F('sceneInfo', 'Incident scene info', 'area', { rows: 2 }),
                    F('lighting', 'Lighting conditions'), F('flooring', 'Flooring conditions'),
                    F('shoes', 'Describe what type of shoes you were wearing'), F('clothing', 'Describe what clothing you were wearing'),
                    F('waiver', 'Did you sign any waiver or release?', 'yn'), F('waiverCopy', 'Do you have a copy?', 'yn', { when: 'waiver' }),
                    F('incidentReport', 'Was an incident report taken?', 'yn'), F('incidentBy', 'By whom?', 'text', { when: 'incidentReport' }),
                    F('incidentCopy', 'Do you have a copy?', 'yn', { when: 'incidentReport' }),
                    F('witnessesYn', 'Were there any witnesses to the incident?', 'yn'),
                    F('witnessWho', 'Whom?', 'text', { w: 4, when: 'witnessesYn' }),
                    F('witnessInfo', 'What information would these witnesses have?', 'area', { when: 'witnessesYn', rows: 2 }),
                    F('witnessContact', 'Contact info for witnesses', 'area', { when: 'witnessesYn', rows: 2 }),
                    F('recordedStatement', 'Have you provided a recorded statement to any insurance company?', 'yn'), F('recordedTo', 'To whom?', 'text', { when: 'recordedStatement' }),
                    F('healthYn', 'Do you have health insurance / Medicare / Medicaid?', 'yn'),
                    F('healthCarrier', 'Name of carrier (we will need a copy of your card)', 'text', { w: 4, when: 'healthYn' }),
                ] },
                { id: 'insurance', title: 'Insurance', items: [
                    F('defCarrier', "Name of defendant's carrier"), F('defCarrierPhone', 'Contact number', 'phone'), F('defClaim', 'Claim number', 'text', { w: 1 }),
                    F('defCarrierAddress', 'Address', 'text', { w: 4 }),
                    F('defAdjuster', 'Adjuster name'),
                    F('glLimit', 'Limits of coverage: general liability (GL)', 'money'), F('medPay', 'Med Pay', 'money'),
                ] },
                { id: 'value', title: 'Value', items: [
                    F('oopYn', 'Have you incurred any out-of-pocket expenses as a result of this incident?', 'yn'),
                    F('oopDetails', 'Type and amount (prescriptions, co-pays, deductibles)', 'area', { when: 'oopYn', rows: 2 }),
                ] },
                { id: 'employment', title: 'Employment', items: [
                    F('employer', 'Current employer'), F('position', 'Position'),
                    F('employerAddress', 'Address', 'text', { w: 4 }),
                    F('supervisor', 'Name of supervisor'), F('payRate', 'Rate of pay', 'money'),
                    F('payPer', 'Paid', 'choice', { choices: ['Per hour', 'Per week', 'Per month', 'Per year'] }),
                    F('lostWagesYn', 'Have you lost wages due to your injuries in this incident?', 'yn'), F('lostWagesAmt', 'How much?', 'money', { when: 'lostWagesYn' }),
                ] },
                { id: 'medical', title: 'Medical', items: [
                    G('providers', 'The names and addresses of all medical providers you have seen for your injuries', [F('name', 'Name'), F('phone', 'Telephone', 'phone'),
                        F('address', 'Address', 'text', { w: 4 }), F('treatment', 'Type of treatment received', 'text', { w: 4 })], { max: 4, add: '+ Add provider' }),
                ] },
                { id: 'health', title: 'General Health', items: [
                    F('healthBefore', 'Prior to this incident, what was the state of your health (high blood pressure, diabetes, etc.)?', 'area', { rows: 2 }),
                    F('physicians', 'Names of treating physicians', 'text', { w: 4 }),
                    F('regularMedsYn', 'Were you taking any medications regularly prior to this incident?', 'yn'), F('regularMeds', 'Please name them', 'text', { w: 4, when: 'regularMedsYn' }),
                    F('priorInjYn', 'Have you had any prior injuries?', 'yn'), F('priorInj', 'Please describe', 'area', { when: 'priorInjYn', rows: 2 }),
                ] },
                { id: 'injuries', title: 'Injuries', intro: 'Describe any injuries to these parts of the body, how often there is pain and what the pain feels like. If there is no injury, write NONE.', items: [
                    ...PARTS.map(([k, label, sides]) => F(k, label, 'part', { sides: !!sides })),
                    F('hospitalized', 'Were you hospitalized?', 'yn'), F('mri', 'Have you had an MRI?', 'yn'),
                    F('injuryPhotos', 'Have you taken photos of your injuries?', 'yn'), F('scarring', 'Do you have any scarring?', 'yn'),
                    F('suppliesYn', 'Have you purchased or were you provided any medical supplies?', 'yn'), F('supplies', 'Which?', 'text', { w: 4, when: 'suppliesYn' }),
                    F('laterYn', 'Have you had any injuries since this incident?', 'yn'), F('later', 'Please describe', 'area', { when: 'laterYn', rows: 2 }),
                    F('lifeImpact', 'How has this incident affected your personal life (hobbies, relationships, etc.)?', 'area'),
                ] },
            ],
        },
        dogbite: {
            title: 'Dog Bite', icon: '🐕', caseType: 'Dog Bite',
            sections: [
                sfClient(),
                { id: 'accident', title: 'Accident Details', items: [
                    F('dol', 'Date of Accident', 'date'), F('time', 'Time of Accident', 'time'),
                    F('location', 'What was the street location of the accident?', 'text', { w: 4 }),
                    F('incCity', 'City'), F('incState', 'State'),
                    F('policeArrived', 'Did police arrive at the location of the accident?', 'yn'),
                    F('policeDept', 'What police department?', 'text', { when: 'policeArrived' }),
                    F('policeReportNo', 'Police report number (can be found on the accident exchange form)', 'text', { when: 'policeArrived' }),
                    F('policeWho', 'If yes, who?', 'text', { w: 4, when: 'policeArrived' }),
                    F('privateProp', 'Did this dog bite occur on private property?', 'yn'),
                    F('propertyType', 'How would you describe the property where this accident occurred? (single-dwelling home, multi-dwelling home/condominium, apartment, retail/commercial property)', 'text', { w: 4, when: 'privateProp' }),
                    F('publicArea', 'Did this dog bite occur on a sidewalk or other public area?', 'yn'),
                    F('publicWhere', 'Explain where', 'text', { w: 4, when: 'publicArea' }),
                    F('ownerKnown', 'Do you know the name of the homeowner/tenants/business owner on the property where this occurred?', 'yn'),
                    F('occupants', 'Please list all residents/occupants', 'area', { when: 'ownerKnown', rows: 2 }),
                    H('Facts of loss'),
                    F('description', 'Describe in detail how this accident happened', 'area', { rows: 6, hint: FACTS_HINT }),
                    F('diagram', DIAGRAM, 'area', { rows: 2 }),
                ] },
                { id: 'photos', title: 'Photos and Insurance', items: sfInsurance() },
                { id: 'injuries', title: 'Injuries and Treatment', items: [
                    F('injuries', 'What injuries did you receive from this dog bite?', 'area'),
                    ...sfHospital(),
                    F('diagnosticsDetails', 'Did you have x-rays, MRI or other diagnostic tests?', 'text', { w: 4 }),
                    sfProviders(),
                    F('medBills', 'Approximate amount of your medical bills', 'money'),
                    F('scarring', 'Do you have any scarring or disfigurement from this accident?', 'yn'),
                    F('scarPhotos', 'Did you take any photographs of your injuries or scarring/disfigurement?', 'yn', { when: 'scarring' }),
                    F('scarRevision', 'Has any medical professional indicated that you may need scar revision?', 'yn', { when: 'scarring' }),
                    F('scarRevisionDetails', 'The medical professional, and their recommendation', 'area', { when: 'scarRevision', rows: 2 }),
                    F('revisionEstimate', 'Did they give you an estimate cost for such future revision?', 'text', { w: 4, when: 'scarRevision' }),
                    ...sfHistory(),
                ] },
                sfWages(),
                sfAdditional(),
            ],
        },
        medmal: {
            title: 'Medical Malpractice', icon: '🩺', caseType: 'Others', caseTypeOther: 'Medical Malpractice',
            sections: [
                { id: 'client', title: 'Client', items: [
                    F('name', 'Name', 'text', { req: 1 }), F('today', 'Date', 'date', { auto: 'today' }),
                    F('hearAbout', 'How did you hear about us?', 'text', { w: 1 }),
                    F('address', 'Address'), F('apt', 'Apt / unit (if applicable)', 'text', { w: 1 }), F('county', 'County', 'text', { w: 1 }),
                    F('homePhone', 'Telephone (home)', 'phone'), F('workPhone', '(work)', 'phone'), F('cellPhone', '(cell)', 'phone'), F('email', 'E-mail', 'email', { w: 1 }),
                    F('ssn', 'SSN', 'ssn'), F('dob', 'DOB', 'date'),
                    F('spouseName', "Spouse's Name"), F('spouseDob', "Spouse's DOB", 'date'), F('spouseSsn', "Spouse's SSN", 'ssn'),
                    F('marriageDate', 'Date of Marriage', 'date'),
                    F('addressAtIncident', 'If you did not live at the address above at the time of the incident, the address where you lived', 'text', { w: 4 }),
                ] },
                { id: 'malpractice', title: 'Malpractice', items: [
                    F('dol', 'Date of the care you believe was improper (date of loss)', 'date', { added: 1 }),
                    F('responsible', 'The treating physician(s), medical provider(s) and/or hospital(s) you feel are responsible for your claim of malpractice', 'area', { rows: 3 }),
                    H('Facts of loss'),
                    F('improperCare', 'Describe the care and treatment you feel was improper, who provided it, and what your doctor/hospital did or failed to do in treating you', 'area', { rows: 6, hint: FACTS_HINT }),
                ] },
                { id: 'injuries', title: 'Injuries', items: [
                    F('injuries', 'All injuries and disabilities you have sustained because of the incident', 'area', { rows: 4 }),
                    F('permanent', 'Do you believe the injuries will be permanent?', 'text', { w: 4 }),
                ] },
                { id: 'treatment', title: 'Medical Treatment', items: [
                    G('providers', 'All medical providers (hospitals, doctors, chiropractors, physical therapists, etc.) you have treated with because of the medical malpractice',
                        [F('name', 'Name of provider'), F('dates', 'Dates of admission or treatment'), F('address', 'Address', 'text', { w: 4 })], { max: 5, add: '+ Add provider' }),
                    F('medsYn', 'Were you prescribed any medications as a result of the injuries?', 'yn'),
                    F('meds', 'List all medications', 'area', { when: 'medsYn', rows: 2 }),
                    G('pharmacies', 'Pharmacies where you have obtained these medications', [F('name', 'Name of pharmacy'), F('address', 'Address')], { max: 2, when: 'medsYn', add: '+ Add pharmacy' }),
                    F('futureYn', 'Do you have any appointments scheduled for future medical care?', 'yn'),
                    F('future', 'The date, provider and purpose of the future treatment', 'area', { when: 'futureYn', rows: 2 }),
                    F('similarYn', 'Have you ever been treated for a similar injury or condition in the past?', 'yn'),
                    G('priorProviders', 'Medical providers who have treated you for this type of injury in the past', [F('name', 'Name of provider'), F('dates', 'Dates of admission or treatment'), F('address', 'Address', 'text', { w: 4 })], { max: 4, when: 'similarYn', add: '+ Add provider' }),
                    H('Because of the malpractice, how long you have been (if at all)'),
                    F('totallyDisabled', 'Totally disabled'), F('partiallyDisabled', 'Partially disabled'),
                    F('confinedHospital', 'Confined to hospitals'), F('confinedBed', 'Confined to bed'), F('confinedHouse', 'Confined to house'),
                ] },
                { id: 'witnesses', title: 'Witnesses / Statements', items: [
                    F('witnesses', 'Name, address and telephone number of any witness to the incident or your resulting medical condition', 'area', { rows: 2 }),
                    F('admissions', 'Statements or admissions you recall the potential defendant(s) making, including when and where they were made', 'area', { rows: 2 }),
                    F('physicianComments', 'Name, address and telephone number of any physician who has commented on the care you received, and where and when that opinion was given', 'area', { rows: 2 }),
                    F('statementWitnesses', 'Name, address and telephone number of any witnesses present for statements or admissions by the potential defendants', 'area', { rows: 2 }),
                ] },
                { id: 'photos', title: 'Photographs / Documents', items: [
                    F('scenePhotos', 'Do you have photographs of the incident/accident scene?', 'yn'), F('scenePhotosDesc', 'Please describe', 'text', { w: 4, when: 'scenePhotos' }),
                    F('injuryPhotos', 'Do you have photographs of the injuries?', 'yn'),
                    F('sceneVideos', 'Do you have videos of the incident/accident scene?', 'yn'),
                    F('injuryVideos', 'Do you have videos of the injuries?', 'yn'),
                    F('documents', 'Any documents or items that may help establish your claim', 'area', { rows: 2 }),
                ] },
                { id: 'health', title: 'Health Insurance', items: [
                    F('medicare', 'Do you receive, or are you eligible to receive, Medicare or Medicaid benefits?', 'yn'),
                    G('healthPlans', 'All medical insurance providers (including Medicare or Medicaid)', [F('name', 'Name of provider'), F('id', 'ID # (and group policy number)'),
                        F('address', 'Address of provider'), F('copay', 'Co-pay and/or deductible')], { max: 2, add: '+ Add insurance' }),
                ] },
                { id: 'benefits', title: 'Additional Benefits', intro: 'Any additional benefits being received (even with Medicare or Medicaid).', items: [
                    F('noFault', 'No-fault benefits (motor vehicle accidents only)?', 'yn'),
                    F('nfCarrier', 'Insurance carrier', 'text', { when: 'noFault' }), F('nfPolicy', 'Policy or claim no.', 'text', { w: 1, when: 'noFault' }), F('nfDate', 'Date of accident', 'date', { when: 'noFault' }),
                    F('nfAddress', "Carrier's address", 'text', { w: 4, when: 'noFault' }),
                    F('workersComp', "Workers' compensation benefits?", 'yn'),
                    F('wcCarrier', 'Carrier', 'text', { when: 'workersComp' }), F('wcCase', 'WCB case no.', 'text', { w: 1, when: 'workersComp' }), F('wcDate', 'Date of accident', 'date', { when: 'workersComp' }),
                    F('wcMonthly', 'Monthly benefit receiving', 'money', { when: 'workersComp' }),
                    F('socialSecurity', 'Social Security?', 'yn'),
                    F('ssSsn', "Beneficiary's SSN", 'ssn', { when: 'socialSecurity' }), F('ssMonthly', 'Monthly benefits receiving', 'money', { when: 'socialSecurity' }), F('ssStart', 'Date benefits started', 'date', { when: 'socialSecurity' }),
                    F('ssdi', 'Social Security Disability?', 'yn'),
                    F('ssdiSsn', "Beneficiary's SSN", 'ssn', { when: 'ssdi' }), F('ssdiMonthly', 'Monthly benefits receiving', 'money', { when: 'ssdi' }), F('ssdiStart', 'Date benefits started', 'date', { when: 'ssdi' }),
                    F('pension', 'Pension and/or retirement?', 'yn'),
                    F('penThrough', 'Benefits received through', 'text', { when: 'pension' }), F('penMonthly', 'Monthly benefit', 'money', { when: 'pension' }),
                    F('penRetired', 'Date of retirement', 'date', { when: 'pension' }), F('penStart', 'Date benefits started', 'date', { when: 'pension' }),
                    F('penAddress', 'Address', 'text', { w: 4, when: 'pension' }),
                ] },
                { id: 'expenses', title: 'Expenses', items: [
                    F('expenses', 'All expenses related to this injury (co-pays, mileage, housecleaning, childcare, home maintenance, or any service or item you had to pay for because of the injury or disability), with the name and address of anyone you paid', 'area', { rows: 3 }),
                ] },
                { id: 'employment', title: 'Employment History', intro: 'For each employer as of the date of injury.', items: [
                    F('employer', 'Employer name'), F('employerAddress', 'Employer address'),
                    F('position', 'Position / title'), F('tenure', 'Length of time employed before the injury'),
                    F('wage', 'Hourly, monthly or yearly wage'), F('hoursPerWeek', 'Hours / days worked per week'),
                    F('benefits', 'Benefits received (pension, 401K contributions, medical coverage)', 'text', { w: 4 }),
                    F('lostTimeYn', 'Have you lost time from work because of your injury?', 'yn'),
                    F('timeOut', 'The period of time you were out of work', 'text', { when: 'lostTimeYn' }), F('lostWagesAmt', 'Total wages lost to date', 'money', { when: 'lostTimeYn' }),
                ] },
                { id: 'limitations', title: 'Limitations', items: [
                    F('limitations', 'Other ways these injuries have affected your life (cannot pick up children, garden, walk, drive, cook, etc.): "enjoyment of life" items and physical limitations', 'area', { rows: 3 }),
                ] },
                { id: 'background', title: 'Background', items: [
                    F('priorClaimYn', 'Have you ever been involved in a prior claim or lawsuit?', 'yn'), F('priorClaim', 'Please explain', 'area', { when: 'priorClaimYn', rows: 2 }),
                    F('settlementsYn', 'Have you ever received any settlements due to a personal injury action?', 'yn'), F('settlements', 'Please explain', 'area', { when: 'settlementsYn', rows: 2 }),
                    F('crimeYn', 'Have you ever been convicted of a crime or declared bankruptcy?', 'yn'), F('crime', 'Please explain', 'area', { when: 'crimeYn', rows: 2 }),
                    F('socialYn', 'Do you have a Facebook, Twitter, YouTube, or other social media account?', 'yn'), F('social', 'Please specify', 'text', { w: 4, when: 'socialYn' }),
                    H('Signature'),
                    F('ackName', 'Client signature (typed name)'), F('ackDate', 'Date', 'date', { auto: 'today' }),
                ] },
            ],
        },
    };
    const ORDER = ['pi', 'slipfall', 'premises', 'dogbite', 'medmal'];
    // Each form's questions by key (groups by their own key).
    Object.values(FORMS).forEach(form => {
        form.index = {};
        form.sections.forEach(sec => sec.items.forEach(it => { if (it.k) form.index[it.k] = it; }));
    });

    /* ---------- what the case needs to open ---------- */
    const PHONES = ['cellPhone', 'homePhone', 'workPhone'];
    const dateOk = (s) => {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str(s));
        if (!m) return false;
        const d = new Date(+m[3], +m[1] - 1, +m[2]);
        return d.getMonth() === +m[1] - 1 && d.getDate() === +m[2] && +m[3] > 1900;
    };
    const future = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str(s)); return !!m && new Date(+m[3], +m[1] - 1, +m[2]) > new Date(); };

    /* ---------- the grade: how much the intaker gathered ----------
       Key information (45%): the essentials a case needs, those this form asks for.
       Questions answered (30%): every question shown (a follow-up counts only once its Yes is given;
         the dates the form fills in itself, and optional extra rows, don't count).
       Facts of loss (25%): the detail in the client's account, by its length in words.
       90+ A Excellent · 80+ B Good · 70+ C Fair · 60+ D Needs work · below F Incomplete. */
    const KEY_INFO = [
        ['Client name', ['name', 'first']], ['Phone number', PHONES], ['Date of birth', ['dob']], ['Home address', ['address']],
        ['Email address', ['email']], ['Date of loss', ['dol']], ['Where it happened', ['location']], ['Facts of loss', ['description', 'improperCare']],
        ['Injuries', ['injuries'].concat(PARTS.map(x => x[0]))], ['Medical treatment', ['hospitalYn', 'hospital', 'providers', 'hospitalized']],
        ['Insurance', ['ownCo', 'afCo', 'healthYn', 'healthProvider', 'ownerInsKnown', 'defCarrier', 'medicare', 'healthPlans']],
        ['Police or incident report', ['policeReport', 'policeArrived', 'incidentReport']],
        ['Who is at fault', ['afName', 'adverseParties', 'ownerKnown', 'responsible', 'defCarrier']],
        ['Emergency contact', ['emergency', 'emName']], ['Employment / lost wages', ['employer', 'missedWork', 'lostWagesYn', 'lostTimeYn']],
    ];
    const answered = (v) => Array.isArray(v) ? v.some(r => r && Object.values(r).some(x => str(x))) : !!str(v);
    const wordCount = (t) => (str(t).match(/[A-Za-z0-9']+/g) || []).length;
    function gradeOf(formId, a) {
        const f = FORMS[formId];
        const got = [], missing = [];
        KEY_INFO.forEach(([label, ks]) => {
            const asked = ks.filter(k => f.index[k]);
            if (!asked.length) return;
            const ok = label === 'Client name' ? (answered(a.name) || (answered(a.first) && answered(a.last))) : asked.some(k => answered(a[k]) && visible(k, a, f));
            (ok ? got : missing).push(label);
        });
        let total = 0, done = 0;
        f.sections.forEach(sec => sec.items.forEach(it => {
            if (!it.k || it.t === 'head' || it.auto || (it.t === 'group' && it.min === 0) || !visible(it.k, a, f)) return;
            total++; if (answered(a[it.k])) done++;
        }));
        const words = wordCount([a.description, a.improperCare].map(str).join(' '));
        const facts = words >= 60 ? 100 : words >= 30 ? 80 : words >= 15 ? 55 : words > 0 ? 30 : 0;
        const keyPct = got.length + missing.length ? Math.round(got.length / (got.length + missing.length) * 100) : 0;
        const covPct = total ? Math.round(done / total * 100) : 0;
        const score = Math.round(keyPct * 0.45 + covPct * 0.30 + facts * 0.25);
        const letter = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
        return { score, letter, word: { A: 'Excellent', B: 'Good', C: 'Fair', D: 'Needs work', F: 'Incomplete' }[letter],
            key: { got: got.length, total: got.length + missing.length, missing }, questions: { answered: done, total, pct: covPct }, facts: { words, score: facts } };
    }

    /* ---------- state ---------- */
    // mode: 'new' (a new intake), 'view' (the case's own intake, read only). step: 'pick', 'form', 'done' (saved).
    let S = { open: false, step: 'pick', mode: 'new', form: null, a: {}, errors: {}, readOnly: false };
    const form = () => FORMS[S.form];
    const visible = (k, a, f) => {
        a = a || S.a; f = f || form();
        const it = f && f.index[k];
        if (!it || !it.when) return true;
        return a[it.when] === 'Yes' && visible(it.when, a, f);
    };

    /* ---------- draft (this browser, per user) ---------- */
    function loadDraft() {
        try { const d = JSON.parse(localStorage.getItem(draftKey()) || 'null'); return d && FORMS[d.form] ? d : null; } catch (e) { return null; }
    }
    function saveDraft() {
        if (S.mode === 'view' || !S.form) return;
        try { localStorage.setItem(draftKey(), JSON.stringify({ form: S.form, a: S.a, savedAt: Date.now() })); } catch (e) { /* private mode */ }
    }
    let draftTimer = null;
    const saveDraftSoon = () => { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 400); };
    function clearDraft() { clearTimeout(draftTimer); try { localStorage.removeItem(draftKey()); } catch (e) { /* private mode */ } }
    const clientOf = (a) => str(a.name) || [a.first, a.middle, a.last].map(str).filter(Boolean).join(' ');

    /* ---------- styles ---------- */
    const css = document.createElement('style');
    css.textContent = `
    #nm-modal{position:fixed;inset:0;z-index:9000;background:rgba(15,23,42,.62);display:none;align-items:center;justify-content:center;padding:16px}
    #nm-modal.open{display:flex}
    #nm-modal .nm-box{background:#f8fafc;width:min(1120px,100%);height:min(94vh,980px);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(2,6,23,.45)}
    #nm-modal .nm-head{background:#0f2148;color:#fff;padding:14px 18px;display:flex;gap:12px;align-items:flex-start;border-bottom:3px solid #f97316}
    #nm-modal .nm-kicker{font-family:'IBM Plex Mono',monospace;font-size:10.5px;font-weight:800;letter-spacing:1px;color:#fdba74}
    #nm-modal h3{margin:3px 0 0;font-size:19px;font-weight:900;letter-spacing:-.01em}
    #nm-modal .nm-sub{font-size:12px;color:#cbd5e1;margin-top:2px}
    #nm-modal .nm-x{margin-left:auto;background:transparent;border:1px solid #334155;color:#e2e8f0;border-radius:8px;padding:6px 10px;cursor:pointer;font-weight:800}
    #nm-modal .nm-x:hover{border-color:#f97316;color:#fff}
    #nm-modal .nm-main{flex:1;min-height:0;display:flex}
    #nm-modal .nm-nav{width:220px;flex-shrink:0;border-right:1px solid #e2e8f0;background:#fff;overflow-y:auto;padding:10px 8px}
    #nm-modal .nm-nav button{display:flex;justify-content:space-between;gap:8px;width:100%;text-align:left;background:none;border:none;border-radius:7px;padding:7px 9px;font-size:12px;font-weight:700;color:#334155;cursor:pointer}
    #nm-modal .nm-nav button:hover{background:#fff7ed}
    #nm-modal .nm-nav button.err{color:#b91c1c}
    #nm-modal .nm-nav .c{font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:#94a3b8;font-weight:700}
    #nm-modal .nm-nav .c.done{color:#16a34a}
    #nm-modal .nm-body{flex:1;overflow-y:auto;padding:16px 20px 24px}
    #nm-modal .nm-sec{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px 16px;margin-bottom:14px;scroll-margin-top:8px}
    #nm-modal .nm-sec h4{margin:0 0 10px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:#0f2148;border-left:4px solid #f97316;padding-left:8px}
    #nm-modal .nm-intro{font-size:12px;color:#64748b;margin:-4px 0 10px;line-height:1.45}
    #nm-modal .nm-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 12px}
    #nm-modal .w1{grid-column:span 1}#nm-modal .w2{grid-column:span 2}#nm-modal .w3{grid-column:span 3}#nm-modal .w4{grid-column:1 / -1}
    #nm-modal .nm-f label.l{display:block;font-size:10.5px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:.03em;margin:0 0 4px;line-height:1.3}
    #nm-modal .nm-f label.l i{color:#f97316;font-style:normal}
    #nm-modal .nm-f label.l .add{color:#2563eb;text-transform:none;font-weight:700;letter-spacing:0}
    #nm-modal input[type=text],#nm-modal textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:7px;padding:8px 10px;font-size:13px;font-family:inherit;background:#fff;color:#0f172a}
    #nm-modal textarea{resize:vertical;line-height:1.45}
    #nm-modal input[type=text]:focus,#nm-modal textarea:focus{outline:none;border-color:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.15)}
    #nm-modal input[readonly],#nm-modal textarea[readonly]{background:#f8fafc;color:#334155}
    #nm-modal .nm-err input[type=text],#nm-modal .nm-err textarea{border-color:#dc2626;background:#fef2f2}
    #nm-modal .nm-err .nm-q,#nm-modal .nm-err label.l{color:#b91c1c}
    #nm-modal .nm-h{grid-column:1 / -1;font-size:11px;font-weight:900;color:#c2410c;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px dashed #fed7aa;padding:6px 0 3px;margin-top:4px}
    #nm-modal .nm-yn{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #f1f5f9;padding:3px 0}
    #nm-modal .nm-q{font-size:13px;color:#1e293b;line-height:1.4}
    #nm-modal .nm-seg{display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0}
    #nm-modal .nm-seg label{position:relative;display:inline-flex;align-items:center;gap:5px;border:1px solid #cbd5e1;border-radius:99px;padding:5px 12px;font-size:12px;font-weight:700;color:#334155;cursor:pointer;background:#fff;user-select:none}
    #nm-modal .nm-seg label.on{background:#0f2148;border-color:#0f2148;color:#fff}
    #nm-modal .nm-seg input{position:absolute;left:0;top:0;opacity:0;width:1px;height:1px;margin:0}
    #nm-modal .nm-seg label:focus-within{box-shadow:0 0 0 3px rgba(249,115,22,.3)}
    #nm-modal .nm-choice .nm-seg{margin-top:2px}
    #nm-modal .nm-check{display:flex;gap:10px;align-items:flex-start;background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;padding:10px 12px;font-size:12.5px;color:#7c2d12;line-height:1.5;cursor:pointer}
    #nm-modal .nm-check input{margin-top:3px;accent-color:#f97316;width:16px;height:16px;flex-shrink:0}
    #nm-modal .nm-part{display:grid;grid-template-columns:180px auto minmax(0,1fr);gap:10px;align-items:center;border-bottom:1px solid #f1f5f9;padding:3px 0}
    #nm-modal .nm-part .nm-q{font-weight:700}
    #nm-modal .nm-g{border:1px solid #e2e8f0;border-radius:10px;padding:10px;background:#f8fafc}
    #nm-modal .nm-glabel{font-size:12px;font-weight:800;color:#334155;margin-bottom:8px;line-height:1.4}
    #nm-modal .nm-row{position:relative;background:#fff;border:1px solid #e2e8f0;border-radius:9px;padding:10px 34px 10px 36px;margin-bottom:8px}
    #nm-modal .nm-rn{position:absolute;left:10px;top:10px;width:18px;height:18px;border-radius:99px;background:#0f2148;color:#fff;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center}
    #nm-modal .nm-del{position:absolute;right:8px;top:6px;background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;line-height:1}
    #nm-modal .nm-del:hover{color:#dc2626}
    #nm-modal .nm-add{background:#fff;border:1px dashed #f97316;color:#c2410c;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:800;text-transform:uppercase;cursor:pointer}
    #nm-modal .nm-foot{background:#fff;border-top:1px solid #e2e8f0;padding:10px 18px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    #nm-modal .nm-foot .sp{flex:1}
    #nm-modal .nm-foot .st{font-size:11.5px;color:#64748b}
    #nm-modal .nm-btn{font-size:11px;font-weight:800;text-transform:uppercase;border-radius:8px;padding:9px 13px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#0f2148}
    #nm-modal .nm-btn:hover{border-color:#0f2148}
    #nm-modal .nm-btn.go{background:#f97316;border-color:#f97316;color:#fff}
    #nm-modal .nm-btn.go:hover{background:#ea580c}
    #nm-modal .nm-btn.del{color:#b91c1c;border-color:#fecaca}
    #nm-modal .nm-hint{font-size:11.5px;color:#c2410c;margin:-1px 0 5px;line-height:1.4}
    #nm-modal .nm-done{max-width:760px;margin:0 auto;width:100%}
    #nm-modal .nm-created{background:#ecfdf5;border:1px solid #6ee7b7;border-radius:12px;padding:14px 16px;margin-bottom:14px;display:flex;flex-direction:column;gap:4px}
    #nm-modal .nm-created b{font-size:17px;color:#065f46}
    #nm-modal .nm-created span{font-size:13px;color:#065f46}
    #nm-modal .nm-created .mono{font-family:'IBM Plex Mono',monospace;font-weight:800}
    #nm-modal .nm-created.warn{background:#fff7ed;border-color:#fdba74}#nm-modal .nm-created.warn b,#nm-modal .nm-created.warn span{color:#9a3412}
    #nm-modal .nm-grade{display:flex;gap:20px;align-items:center;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:12px;flex-wrap:wrap}
    #nm-modal .nm-ring{width:132px;height:132px;border-radius:99px;border:9px solid #94a3b8;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0}
    #nm-modal .nm-ring b{font-size:30px;font-weight:900;color:#0f2148;line-height:1}
    #nm-modal .nm-ring span{font-size:12px;font-weight:800;color:#334155;margin-top:4px}
    #nm-modal .nm-ring em{font-size:10px;font-style:normal;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-top:2px}
    #nm-modal .nm-ring.g-A{border-color:#16a34a}#nm-modal .nm-ring.g-B{border-color:#65a30d}#nm-modal .nm-ring.g-C{border-color:#f59e0b}#nm-modal .nm-ring.g-D{border-color:#f97316}#nm-modal .nm-ring.g-F{border-color:#dc2626}
    #nm-modal .nm-bars{flex:1;min-width:240px;display:flex;flex-direction:column;gap:12px}
    #nm-modal .nm-bar .t{display:flex;justify-content:space-between;font-size:12.5px;color:#334155;margin-bottom:4px}
    #nm-modal .nm-bar .t b{color:#0f2148}
    #nm-modal .nm-bar .b{height:8px;background:#f1f5f9;border-radius:99px;overflow:hidden}
    #nm-modal .nm-bar .b i{display:block;height:100%;background:#f97316;border-radius:99px}
    #nm-modal .nm-miss{background:#fff;border:1px solid #fed7aa;border-left:4px solid #f97316;border-radius:9px;padding:10px 14px;font-size:13px;color:#7c2d12;line-height:1.5;margin-bottom:10px}
    #nm-modal .nm-miss.ok{border-color:#86efac;border-left-color:#16a34a;color:#166534}
    #nm-modal .nm-errs{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;line-height:1.5}
    #nm-modal .nm-errs button{background:none;border:none;color:#991b1b;text-decoration:underline;cursor:pointer;font:inherit;padding:0}
    #nm-modal .nm-pick{padding:20px;overflow-y:auto;flex:1}
    #nm-modal .nm-pick p.lead{font-size:13px;color:#475569;margin:0 0 14px;line-height:1.5}
    #nm-modal .nm-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
    #nm-modal .nm-card{text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px 16px;cursor:pointer;display:flex;align-items:center;gap:12px;transition:border-color .15s,box-shadow .15s}
    #nm-modal .nm-card:hover,#nm-modal .nm-card:focus{border-color:#f97316;box-shadow:0 4px 16px rgba(15,33,72,.1);outline:none}
    #nm-modal .nm-card .ic{font-size:24px}
    #nm-modal .nm-card b{font-size:16px;color:#0f2148}
    #nm-modal .nm-resume{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#fff7ed;border:1px solid #fdba74;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12.5px;color:#7c2d12}
    #nm-modal .nm-resume .sp{flex:1;min-width:200px}
    @media (max-width:760px){#nm-modal{padding:0}#nm-modal .nm-box{height:100vh;border-radius:0}#nm-modal .nm-nav{display:none}#nm-modal .nm-body{padding:12px}
        #nm-modal .nm-grid{grid-template-columns:1fr 1fr}#nm-modal .w2,#nm-modal .w3{grid-column:1 / -1}
        #nm-modal .nm-yn{flex-direction:column;align-items:flex-start}#nm-modal .nm-part{grid-template-columns:1fr}}
    #kx-intake{display:none}
    #kx-intake.has{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff7ed;border:1px solid #fdba74;border-radius:10px;padding:8px 12px;margin:0 0 16px}
    #kx-intake .io-tag{font-family:'IBM Plex Mono',monospace;font-weight:900;font-size:10.5px;color:#fff;background:#f97316;border-radius:6px;padding:3px 8px;letter-spacing:.5px}
    #kx-intake .io-txt{flex:1;min-width:200px;font-size:12px;color:#7c2d12}
    #kx-intake button{font-size:10.5px;font-weight:800;text-transform:uppercase;border-radius:7px;padding:6px 10px;cursor:pointer;border:1px solid #fdba74;background:#fff;color:#9a3412}
    #kx-intake button.go{background:#f97316;border-color:#f97316;color:#fff}
    `;
    document.head.appendChild(css);

    /* ---------- the window ---------- */
    function build() {
        if ($id('nm-modal')) return;
        document.body.insertAdjacentHTML('beforeend', `
        <div id="nm-modal" role="dialog" aria-modal="true" aria-labelledby="nm-title">
            <div class="nm-box">
                <div class="nm-head">
                    <div><div class="nm-kicker" id="nm-kicker">📝 NEW MATTER · CLIENT INTAKE</div><h3 id="nm-title"></h3><div class="nm-sub" id="nm-sub"></div></div>
                    <button type="button" class="nm-x" data-nm="close" aria-label="Close the intake form">✕</button>
                </div>
                <div class="nm-main" id="nm-main"></div>
                <div class="nm-foot" id="nm-foot"></div>
            </div>
        </div>`);
        const m = $id('nm-modal');
        m.addEventListener('click', onClick);
        m.addEventListener('input', onInput);
        m.addEventListener('change', onInput);
        m.addEventListener('focusout', onBlur);
        m.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    }
    function show() { build(); S.open = true; $id('nm-modal').classList.add('open'); paint(); }
    // Something typed (not just the dates the form fills in itself).
    const hasAnswers = (a) => Object.keys(a || {}).some(k => k !== 'today' && k !== 'ackDate' && (Array.isArray(a[k]) ? a[k].some(r => r && Object.values(r).some(x => str(x))) : str(a[k])));
    function close() {
        if (!S.open) return;
        if (S.mode !== 'view' && S.form && hasAnswers(S.a)) saveDraft();
        S.open = false;
        const m = $id('nm-modal'); if (m) m.classList.remove('open');
    }

    function paint() {
        const title = $id('nm-title'), sub = $id('nm-sub'), kicker = $id('nm-kicker');
        kicker.textContent = S.mode === 'view' ? '📋 INTAKE FORM ON FILE' : '📝 NEW INTAKE';
        if (S.step === 'pick') {
            title.textContent = 'What type of case is it?';
            sub.textContent = 'Pick the case type, and its intake form opens. Saving the intake creates the new case.';
            paintPick();
            return;
        }
        const f = form(), who = clientOf(S.a);
        title.textContent = `${f.icon} ${f.title}${who ? ' · ' + who : ''}`;
        const g = S.rec && S.rec.grade;
        sub.textContent = S.mode === 'view'
            ? `Saved ${fmtWhen(S.rec && S.rec.completedAt)}${S.rec && S.rec.completedBy ? ' by ' + S.rec.completedBy : ''}${g ? ` · grade ${g.score}% (${g.letter})` : ''}.`
            : 'Gather as much as you can, then 💾 Save Intake. The intake is graded on how much you gathered.';
        paintForm();
    }
    function fmtWhen(iso) {
        const d = iso ? new Date(iso) : null;
        return d && !isNaN(d) ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}` : '';
    }

    /* ---------- step 1: the kind of matter ---------- */
    function paintPick() {
        const d = loadDraft();
        $id('nm-main').innerHTML = `<div class="nm-pick">
            ${d ? `<div class="nm-resume"><span class="sp">⏸ <b>Unfinished intake:</b> ${esc(FORMS[d.form].title)}${clientOf(d.a) ? ' · ' + esc(clientOf(d.a)) : ''} · saved ${esc(ago(d.savedAt))}</span>
                <button type="button" class="nm-btn go" data-nm="resume">Resume</button><button type="button" class="nm-btn del" data-nm="discard">Discard</button></div>` : ''}
            <p class="lead">Ask the caller what happened, then pick the case type. Its intake form follows the firm's intake sheet for that kind of case.</p>
            <div class="nm-cards">${ORDER.map(id => { const f = FORMS[id]; return `<button type="button" class="nm-card" data-nm="pick" data-form="${id}">
                <span class="ic" aria-hidden="true">${f.icon}</span><b>${esc(f.title)}</b></button>`; }).join('')}</div>
        </div>`;
        $id('nm-foot').innerHTML = `<span class="sp"></span><button type="button" class="nm-btn" data-nm="close">Cancel</button>`;
        const first = $id('nm-main').querySelector('.nm-resume .nm-btn, .nm-card'); if (first) first.focus();
    }
    function ago(ms) {
        const m = Math.round((Date.now() - ms) / 60000);
        return !ms ? '' : m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
    }
    function startForm(id, answers) {
        S.form = id; S.step = 'form'; S.errors = {};
        S.a = answers || {};
        // today's date where the sheet has a date line
        Object.values(FORMS[id].index).forEach(it => { if (it.auto === 'today' && !S.a[it.k]) S.a[it.k] = today(); });
        paint();
        const first = $id('nm-main').querySelector('input[type=text], textarea'); if (first) first.focus();
    }

    /* ---------- step 2: the form ---------- */
    const counts = (sec) => {
        let total = 0, done = 0;
        sec.items.forEach(it => {
            if (it.t === 'head' || !visible(it.k)) return;
            total++;
            const v = S.a[it.k];
            if (it.t === 'group' ? Array.isArray(v) && v.some(r => r && Object.values(r).some(x => str(x))) : str(v)) done++;
        });
        return { total, done };
    };
    function paintNav() {
        const nav = $id('nm-nav'); if (!nav) return;
        nav.innerHTML = form().sections.map(sec => {
            const c = counts(sec), err = sec.items.some(it => S.errors[it.k]);
            return `<button type="button" data-nm="goto" data-sec="${sec.id}" class="${err ? 'err' : ''}"><span>${esc(sec.title)}</span><span class="c${c.total && c.done === c.total ? ' done' : ''}">${c.done}/${c.total}</span></button>`;
        }).join('');
    }
    function paintForm() {
        const f = form(), ro = S.readOnly;
        const errs = Object.keys(S.errors);
        $id('nm-main').innerHTML = `<nav class="nm-nav" id="nm-nav" aria-label="Sections"></nav>
            <div class="nm-body" id="nm-body">
                ${errs.length ? `<div class="nm-errs" role="alert"><b>Before saving, fix:</b><br>${errs.map(k => `<button type="button" data-nm="fix" data-k="${esc(k)}">${esc(S.errors[k])}</button>`).join('<br>')}</div>` : ''}
                ${f.sections.map(sec => `<section class="nm-sec" id="nm-sec-${sec.id}"><h4>${esc(sec.title)}</h4>${sec.intro ? `<p class="nm-intro">${esc(sec.intro)}</p>` : ''}
                    <div class="nm-grid">${sec.items.map(it => itemHTML(it, ro)).join('')}</div></section>`).join('')}
            </div>`;
        const foot = S.mode === 'view'
            ? `<button type="button" class="nm-btn" data-nm="print">🖨 Print</button><span class="sp"></span><button type="button" class="nm-btn" data-nm="close">Close</button>`
            : `<button type="button" class="nm-btn" data-nm="back">← Change case type</button><span class="sp"></span>
               <button type="button" class="nm-btn" data-nm="close">Cancel</button>
               <button type="button" class="nm-btn go" data-nm="complete">💾 Save Intake</button>`;
        $id('nm-foot').innerHTML = foot;
        paintNav();
        applyWhen();
    }
    const inputId = (k, g, i) => g ? `nm-${g}-${i}-${k}` : `nm-${k}`;
    function inputHTML(it, value, ro, g, i) {
        const id = inputId(it.k, g, i), data = g ? `data-g="${g}" data-i="${i}" data-k="${it.k}"` : `data-k="${it.k}"`;
        const ph = it.ph || { date: 'MM/DD/YYYY', phone: '(000) 000-0000', ssn: 'XXX-XX-XXXX', money: '$ 0.00', time: 'e.g. 3:45 PM', email: 'name@example.com' }[it.t] || '';
        const mode = { date: 'numeric', phone: 'tel', ssn: 'numeric', money: 'decimal', email: 'email' }[it.t];
        if (it.t === 'area') return `<textarea id="${id}" ${data} rows="${it.rows || 3}"${ph ? ` placeholder="${esc(ph)}"` : ''}${ro ? ' readonly' : ''}>${esc(value)}</textarea>`;
        return `<input type="text" id="${id}" ${data} data-t="${it.t}" value="${esc(value)}" autocomplete="off"${ph ? ` placeholder="${esc(ph)}"` : ''}${mode ? ` inputmode="${mode}"` : ''}${ro ? ' readonly' : ''}>`;
    }
    function seg(name, choices, value, ro, data) {
        return `<div class="nm-seg" role="radiogroup">${choices.map(c => `<label class="${value === c ? 'on' : ''}"><input type="radio" name="${name}" value="${esc(c)}" ${data}${value === c ? ' checked' : ''}${ro ? ' disabled' : ''}>${esc(c)}</label>`).join('')}</div>`;
    }
    function itemHTML(it, ro) {
        const w = 'w' + (it.w || WIDTH[it.t] || 2);
        const when = it.when ? ` data-when="${it.when}"` : '';
        const err = it.k && S.errors[it.k] ? ' nm-err' : '';
        const req = it.req ? ' <i title="Needed to save the intake">*</i>' : '';
        const added = it.added ? ' <span class="add" title="Not on the paper form: the case file needs it">(for the case file)</span>' : '';
        const v = S.a[it.k];
        if (it.t === 'head') return `<div class="nm-h"${when}>${esc(it.label)}</div>`;
        if (it.t === 'yn') return `<div class="nm-f nm-yn ${w}${err}" data-f="${it.k}"${when}><span class="nm-q" id="nm-q-${it.k}">${esc(it.label)}${req}</span>${seg('nm-' + it.k, ['Yes', 'No'], v, ro, `data-k="${it.k}"`).replace('role="radiogroup"', `role="radiogroup" aria-labelledby="nm-q-${it.k}"`)}</div>`;
        if (it.t === 'choice') return `<div class="nm-f nm-choice ${w}${err}" data-f="${it.k}"${when}><label class="l">${esc(it.label)}${req}</label>${seg('nm-' + it.k, it.choices, v, ro, `data-k="${it.k}"`)}</div>`;
        if (it.t === 'check') return `<div class="nm-f ${w}" data-f="${it.k}"${when}><label class="nm-check"><input type="checkbox" data-k="${it.k}"${v === 'Yes' ? ' checked' : ''}${ro ? ' disabled' : ''}><span>${esc(it.label)}<br><b>Read to the client, and the client agrees.</b></span></label></div>`;
        if (it.t === 'part') return `<div class="nm-f nm-part ${w}" data-f="${it.k}"${when}><label class="nm-q" for="${inputId(it.k)}">${esc(it.label)}</label>
            ${it.sides ? seg('nm-' + it.k + 'Side', ['R', 'L', 'Both'], S.a[it.k + 'Side'], ro, `data-k="${it.k}Side"`) : '<span></span>'}${inputHTML(it, v || '', ro)}</div>`;
        if (it.t === 'group') {
            const rows = Array.isArray(v) ? v : [];
            const n = Math.max(rows.length, it.min == null ? 1 : it.min);
            let html = '';
            for (let i = 0; i < n; i++) html += rowHTML(it, rows[i] || {}, i, ro);
            return `<div class="nm-g ${w}" data-f="${it.k}"${when}><div class="nm-glabel">${esc(it.label)}</div><div class="nm-rows">${html}</div>
                ${!ro && n < (it.max || 1) ? `<button type="button" class="nm-add" data-nm="addrow" data-g="${it.k}">${esc(it.add || '+ Add')}</button>` : ''}</div>`;
        }
        return `<div class="nm-f ${w}${err}" data-f="${it.k}"${when}><label class="l" for="${inputId(it.k)}">${esc(it.label)}${req}${added}</label>${it.hint ? `<p class="nm-hint">${esc(it.hint)}</p>` : ''}${inputHTML(it, v || '', ro)}</div>`;
    }
    function rowHTML(g, row, i, ro) {
        return `<div class="nm-row" data-row="${i}"><span class="nm-rn">${i + 1}</span>${ro ? '' : `<button type="button" class="nm-del" data-nm="delrow" data-g="${g.k}" data-i="${i}" title="Remove" aria-label="Remove row ${i + 1}">×</button>`}
            <div class="nm-grid">${g.fields.map(fd => `<div class="nm-f w${fd.w || WIDTH[fd.t] || 2}"><label class="l" for="${inputId(fd.k, g.k, i)}">${esc(fd.label)}</label>${inputHTML(fd, row[fd.k] || '', ro, g.k, i)}</div>`).join('')}</div></div>`;
    }
    // Questions that follow a Yes / No show only when it's Yes.
    function applyWhen() {
        const body = $id('nm-body'); if (!body) return;
        body.querySelectorAll('[data-when]').forEach(el => {
            let on = S.a[el.dataset.when] === 'Yes';
            if (on && el.dataset.f) on = visible(el.dataset.f);
            el.style.display = on ? '' : 'none';
        });
    }

    /* ---------- typing ---------- */
    const digits = (s) => String(s || '').replace(/\D/g, '');
    function formatLive(el) {
        const t = el.dataset.t, v = el.value;
        let out = v;
        if (t === 'date') { const d = digits(v).slice(0, 8); out = d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; }
        else if (t === 'phone') { const d = digits(v); if (d.length <= 10) out = d.length > 6 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d.length > 3 ? `(${d.slice(0, 3)}) ${d.slice(3)}` : d; }
        else if (t === 'ssn') { const d = digits(v).slice(0, 9); out = d.length > 5 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d; }
        if (out !== v) el.value = out;
    }
    function onBlur(e) {
        const el = e.target;
        if (!el || el.dataset.t !== 'money' || !str(el.value)) return;
        const n = parseFloat(el.value.replace(/[^0-9.\-]/g, ''));
        if (isFinite(n)) { el.value = '$ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); onInput({ target: el }); }
    }
    function onInput(e) {
        const el = e.target;
        if (!el || !el.dataset || !el.dataset.k || S.readOnly) return;
        const k = el.dataset.k;
        if (el.type === 'radio') {
            if (!el.checked) return;
            el.closest('.nm-seg').querySelectorAll('label').forEach(l => l.classList.toggle('on', l.contains(el)));
            S.a[k] = el.value;
        } else if (el.type === 'checkbox') S.a[k] = el.checked ? 'Yes' : '';
        else {
            if (e.type === 'input') formatLive(el);
            if (el.dataset.g) {
                const g = el.dataset.g, i = +el.dataset.i;
                const rows = Array.isArray(S.a[g]) ? S.a[g] : (S.a[g] = []);
                while (rows.length <= i) rows.push({});
                rows[i][k] = el.value;
            } else S.a[k] = el.value;
        }
        // MVA: the day of the week follows the date of injury
        if (k === 'dol' && S.form === 'pi' && dateOk(S.a.dol) && (!str(S.a.dayOfWeek) || S.autoDay === S.a.dayOfWeek)) {
            const m = S.a.dol.split('/'); S.a.dayOfWeek = S.autoDay = DAYS[new Date(+m[2], +m[0] - 1, +m[1]).getDay()];
            const dw = $id('nm-dayOfWeek'); if (dw) dw.value = S.a.dayOfWeek;
        }
        if (S.errors[k] || (el.dataset.g && S.errors[el.dataset.g])) {
            delete S.errors[k];
            const box = el.closest('.nm-err'); if (box) box.classList.remove('nm-err');
        }
        if (k === 'first' || k === 'last' || k === 'middle' || k === 'name') { const f = form(), who = clientOf(S.a); $id('nm-title').textContent = `${f.icon} ${f.title}${who ? ' · ' + who : ''}`; }
        if (el.type === 'radio' || el.type === 'checkbox') applyWhen();
        paintNav();
        if (S.mode !== 'view' && hasAnswers(S.a)) saveDraftSoon();
    }

    function onClick(e) {
        const b = e.target.closest('[data-nm]');
        if (!b) { if (e.target === $id('nm-modal')) close(); return; }
        const a = b.dataset.nm;
        if (a === 'close') close();
        else if (a === 'pick') {
            const d = loadDraft();
            if (d && hasAnswers(d.a) && !confirm(`Start a new ${FORMS[b.dataset.form].title} intake? The unfinished ${FORMS[d.form].title} intake${clientOf(d.a) ? ` (${clientOf(d.a)})` : ''} will be discarded.`)) return;
            clearDraft();
            startForm(b.dataset.form, {});
        } else if (a === 'resume') { const d = loadDraft(); if (d) { S.autoDay = null; startForm(d.form, d.a || {}); } }
        else if (a === 'discard') { if (confirm('Discard the unfinished intake? This can\'t be undone.')) { clearDraft(); paintPick(); } }
        else if (a === 'back') {
            if (hasAnswers(S.a)) saveDraft();
            S.step = 'pick'; S.errors = {}; paint();
        } else if (a === 'goto') { const s = $id('nm-sec-' + b.dataset.sec); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        else if (a === 'fix') focusField(b.dataset.k);
        else if (a === 'addrow') {
            const it = form().index[b.dataset.g];
            const rows = Array.isArray(S.a[it.k]) ? S.a[it.k] : (S.a[it.k] = []);
            const shown = Math.max(rows.length, it.min == null ? 1 : it.min);
            while (rows.length < shown + 1) rows.push({});
            rerenderItem(it);
            const box = $id('nm-body').querySelector(`[data-f="${it.k}"] .nm-row:last-child input, [data-f="${it.k}"] .nm-row:last-child textarea`); if (box) box.focus();
            saveDraftSoon();
        } else if (a === 'delrow') {
            const it = form().index[b.dataset.g];
            const rows = Array.isArray(S.a[it.k]) ? S.a[it.k] : [];
            rows.splice(+b.dataset.i, 1);
            S.a[it.k] = rows;
            rerenderItem(it);
            paintNav(); saveDraftSoon();
        } else if (a === 'complete') saveIntake();
        else if (a === 'print') printIntake(S.rec || { form: S.form, title: form().title, answers: S.a });
    }
    function rerenderItem(it) {
        const old = $id('nm-body').querySelector(`[data-f="${it.k}"]`); if (!old) return;
        old.insertAdjacentHTML('afterend', itemHTML(it, S.readOnly));
        old.remove();
        applyWhen();
    }
    function focusField(k) {
        const box = $id('nm-body') && $id('nm-body').querySelector(`[data-f="${k}"]`);
        if (!box) return;
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const input = box.querySelector('input[type=text], textarea, input'); if (input) setTimeout(() => input.focus({ preventScroll: true }), 250);
    }

    /* ---------- complete: check, open the case, fill it ---------- */
    function validate() {
        const f = form(), a = S.a, errs = {};
        Object.values(f.index).forEach(it => {
            if (!visible(it.k)) return;
            const v = str(a[it.k]);
            if (it.req && !v) errs[it.k] = `${it.label.replace(/\?$/, '')}: needed to save the intake.`;
            else if (v && it.t === 'date' && !dateOk(v)) errs[it.k] = `${it.label}: write the date as MM/DD/YYYY.`;
            else if (v && it.t === 'date' && (it.k === 'dol' || it.k === 'dob') && future(v)) errs[it.k] = `${it.label}: the date is in the future.`;
            else if (v && it.t === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errs[it.k] = `${it.label}: not a valid email address.`;
        });
        return errs;
    }
    // 💾 Save Intake: grade it, create the case from it, save the case, and show the result.
    let saving = false;
    async function saveIntake() {
        if (saving) return;
        S.errors = validate();
        if (Object.keys(S.errors).length) {
            paintForm();
            $id('nm-body').scrollTop = 0;
            toast(`Fix ${Object.keys(S.errors).length === 1 ? 'one thing' : Object.keys(S.errors).length + ' things'} before saving the intake.`, 'error');
            return;
        }
        const f = form(), answers = tidy(S.a);
        const rec = { v: 2, form: S.form, title: f.title, answers, grade: gradeOf(S.form, answers), completedAt: new Date().toISOString(),
            completedBy: (session() || {}).fullName || (session() || {}).username || '' };
        if (!openBlankCase()) { toast('The intake is kept. Save or close the case that\'s open, then save the intake again.', 'info', 6000); return; }
        saving = true;
        const btn = $id('nm-foot').querySelector('[data-nm="complete"]'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
        try { fillFromIntake(rec); }
        catch (e) { console.error(e); toast(`Some of the intake couldn't be copied into the case: ${e.message}`, 'error', 7000); }
        writeRecord(rec);
        if (typeof persistCurrentEditorState === 'function') persistCurrentEditorState();
        clearDraft();
        let res;
        try { res = typeof window.saveCase === 'function' ? await window.saveCase({ quiet: true }) : null; } catch (e) { res = { ok: false, error: e.message }; }
        saving = false;
        res = res || { ok: false, error: 'The case could not be saved.' };
        paintResult(rec, res);
    }
    // After saving: the new case, the grade, and what to ask next time.
    function paintResult(rec, res) {
        S.step = 'done'; S.form = null; S.a = {}; S.errors = {};
        const g = rec.grade, who = clientOf(rec.answers);
        $id('nm-kicker').textContent = '📝 NEW INTAKE · SAVED';
        $id('nm-title').textContent = res.ok ? '✅ New case created' : '⚠ The case wasn\'t saved';
        $id('nm-sub').textContent = `${who} · ${rec.title}`;
        const bar = (label, pct, text) => `<div class="nm-bar"><div class="t"><span>${esc(label)}</span><b>${esc(text)}</b></div><div class="b"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></div></div>`;
        $id('nm-main').innerHTML = `<div class="nm-pick nm-done">
            <div class="nm-created ${res.ok ? '' : 'warn'}">${res.ok
                ? `<b>New case created</b><span>${res.caseId ? `Case ID <span class="mono">${esc(res.caseId)}</span> · ` : ''}${esc(who)} · it's open in the editor.</span>`
                : `<b>Not saved yet</b><span>${esc(res.error)} The case is open in the editor, filled in from the intake: click <b>Save Case</b> to try again.</span>`}</div>
            <div class="nm-grade">
                <div class="nm-ring g-${g.letter}"><b>${g.score}%</b><span>${g.letter} · ${esc(g.word)}</span><em>Intake grade</em></div>
                <div class="nm-bars">
                    ${bar('Key information', g.key.total ? g.key.got / g.key.total * 100 : 0, `${g.key.got} of ${g.key.total}`)}
                    ${bar('Questions answered', g.questions.pct, `${g.questions.answered} of ${g.questions.total}`)}
                    ${bar('Facts of loss', g.facts.score, g.facts.words ? `${g.facts.words} words` : 'none')}
                </div>
            </div>
            ${g.key.missing.length ? `<div class="nm-miss"><b>Ask next time:</b> ${g.key.missing.map(esc).join(' · ')}</div>` : '<div class="nm-miss ok"><b>Every key item was gathered.</b></div>'}
            ${g.facts.score < 80 ? '<div class="nm-miss"><b>Facts of loss:</b> get more detail: what happened and how, where and when, who was involved or at fault, and what the client did right after.</div>' : ''}
        </div>`;
        $id('nm-foot').innerHTML = '<span class="sp"></span><button type="button" class="nm-btn go" data-nm="close">Done</button>';
        const d = $id('nm-foot').querySelector('button'); if (d) d.focus();
    }
    // The answers without empty rows or blanks.
    function tidy(a) {
        const out = {};
        Object.entries(a).forEach(([k, v]) => {
            if (Array.isArray(v)) { const rows = v.filter(r => r && Object.values(r).some(x => str(x))); if (rows.length) out[k] = rows; }
            else if (str(v)) out[k] = str(v);
        });
        return out;
    }
    // A blank case in the editor: false when the person kept the case they had open.
    function openBlankCase() {
        const nameEl = $id('client-name-field');
        if (typeof hasCaseContent === 'function' && hasCaseContent()
            && !confirm('Save this intake as a new case? The case open in the editor now will be closed, and any unsaved changes to it are lost. Save it first if you need it.')) return false;
        if (nameEl && typeof hasCaseContent === 'function' && hasCaseContent()) nameEl.innerText = ''; // already confirmed: newCase() needn't ask again
        if (typeof window.newCase === 'function') window.newCase();   // (from Intake mode too: it leaves Intake mode)
        const snap = window.mockSnapshot ? window.mockSnapshot() : null;
        if (snap && snap.mockId) return false;   // an Admin kept unsaved changes to a Training Library case
        return !(nameEl && nameEl.innerText.trim());
    }

    /* ---------- the intake → case fields ---------- */
    // Reads answers for the mapping; v() and rows() mark what went into the case, so the rest can go in a Case Note.
    function reader(f, a) {
        const used = new Set();
        const peek = (k) => (visible(k, a, f) ? str(a[k]) : '');
        const v = (k) => { used.add(k); return peek(k); };
        const rows = (k) => { used.add(k); return visible(k, a, f) && Array.isArray(a[k]) ? a[k].filter(r => r && Object.values(r).some(x => str(x))) : []; };
        return { used, peek, v, rows };
    }
    const join = (arr, sep) => arr.map(str).filter(Boolean).join(sep == null ? ' ' : sep);
    // The first line (a name, a party); sentence: the first sentence (an injury summary). "Dr." and "St." don't end one.
    const firstLine = (s, n, sentence) => {
        let l = str(s).split('\n')[0].trim();
        if (sentence) l = l.split(/(?<=[a-z]{3}\.)\s+/)[0];
        n = n || 140;
        return l.length > n ? l.slice(0, n - 1) + '…' : l;
    };
    const SPECIALTY = [[/chiro/i, 'Chiro'], [/physical therap|\bPT\b|rehab/i, 'Physical Therapy (PT)'], [/ortho/i, 'Ortho'], [/pain/i, 'Pain Management'],
        [/\bMRI\b|imaging|radiolog|x-?ray/i, 'MRI / Imaging'], [/anesth/i, 'Anesthesia'], [/surg/i, 'Surgery'], [/ambulance|\bEMS\b|paramedic|rescue|fire (dept|department)/i, 'EMS'],
        [/hospital|medical center|\bER\b|emergency/i, 'Emergency Hospital']];
    const specialty = (text) => { const hit = SPECIALTY.find(([re]) => re.test(text || '')); return hit ? hit[1] : ''; };

    function buildPlan(rec) {
        const f = FORMS[rec.form], a = rec.answers || {}, id = rec.form;
        const r = reader(f, a), v = r.v, peek = r.peek, rows = r.rows;
        const p = { parties: [], bi: [], pip: [], facilities: [], treat: [], facts: [], noteExtra: [] };

        // client
        p.name = v('name') || join([v('first'), v('middle'), v('last')]);
        const phoneKey = PHONES.find(k => peek(k));
        p.phone = phoneKey ? v(phoneKey) : '';
        p.dob = v('dob'); p.ssn = v('ssn'); p.email = v('email');
        p.address = join([join([v('address'), v('apt')], ', '), join([v('city'), join([v('state'), v('zip')])], ', ')], ', ');
        const ems = rows('emergency');
        if (ems[0]) p.emergency = { name: ems[0].name, phone: ems[0].phone, relation: ems[0].relation };
        else if (peek('emName')) p.emergency = { name: v('emName'), phone: v('emPhone'), relation: v('emRelation') };
        if (ems[1]) p.noteExtra.push(`Second emergency contact: ${join([ems[1].name, ems[1].phone, ems[1].relation], ' · ')}`);

        // the incident
        p.dol = v('dol');
        p.location = join([v('location'), v('incCity'), v('incState'), peek('incCounty') ? v('incCounty') + ' County' : ''], ', ');
        p.caseType = f.caseType; p.caseTypeOther = f.caseTypeOther || '';
        const fact = (label, k) => { const x = v(k); if (x) p.facts.push(`${label}: ${x}`); };
        let story = '';
        if (id === 'pi') { story = v('description'); fact('Time of day/night', 'time'); fact('Day of week', 'dayOfWeek'); fact('Weather', 'weather'); }
        if (id === 'slipfall') { story = v('description'); fact('Time', 'time'); fact('Property', 'propertyType'); fact('Adverse parties', 'adverseParties'); fact('The scene', 'diagram'); }
        if (id === 'dogbite') {
            story = v('description'); fact('Time', 'time');
            if (v('privateProp') === 'Yes') p.facts.push('On private property' + (v('propertyType') ? `: ${v('propertyType')}` : ''));
            if (v('publicArea') === 'Yes') p.facts.push('In a public area' + (v('publicWhere') ? `: ${v('publicWhere')}` : ''));
            fact('The scene', 'diagram');
        }
        if (id === 'premises') {
            story = v('description'); fact('Time', 'time'); fact('Scene', 'sceneInfo'); fact('Lighting', 'lighting'); fact('Flooring', 'flooring'); fact('Shoes', 'shoes'); fact('Clothing', 'clothing');
            if (v('waiver')) p.facts.push(`Signed a waiver or release: ${v('waiver')}${v('waiverCopy') ? ` (copy: ${v('waiverCopy')})` : ''}`);
        }
        if (id === 'medmal') { story = v('improperCare'); fact('Responsible provider(s)', 'responsible'); fact('Address at the time', 'addressAtIncident'); }
        p.narrative = join([story, p.facts.length ? 'From the intake:\n' + p.facts.map(x => '• ' + x).join('\n') : ''], '\n\n');

        // injury
        const injuries = v('injuries');
        const inj = { primary: firstLine(injuries, 140, true), parts: '', type: id === 'dogbite' ? 'Laceration / bite / scarring' : '', prior: '', details: '' };
        const det = [];
        if (injuries && injuries !== inj.primary) det.push(injuries);
        if (id === 'premises') {
            const parts = [];
            PARTS.forEach(([k, label]) => {
                const text = v(k), side = v(k + 'Side');
                if (!text || /^none\.?$/i.test(text)) return;
                const name = `${label.replace(/^Any problems with internal organs\?$/, 'Internal organs').replace(/^Any other symptoms or problems$/, 'Other')}${side ? ` (${side})` : ''}`;
                parts.push(name); det.push(`${name}: ${text}`);
            });
            inj.parts = parts.join(', ');
            if (!inj.primary && parts.length) inj.primary = firstLine(det[0], 140, true);
        }
        const yes = (k, text) => { if (v(k) === 'Yes') det.push(text); };
        if (v('diagnosticsDetails')) det.push(`Diagnostic tests: ${v('diagnosticsDetails')}`); else yes('diagnostics', 'Had x-rays, MRI or other diagnostic tests.');
        if (v('bonesScarringDetails')) det.push(`Broken bones / scarring: ${v('bonesScarringDetails')}`); else yes('bonesScarring', 'Broken bones or scarring.');
        yes('scarring', 'Scarring or disfigurement.');
        if (v('scarRevisionDetails')) det.push(`Scar revision: ${v('scarRevisionDetails')}`); else yes('scarRevision', 'A medical professional said scar revision may be needed.');
        if (v('revisionEstimate')) det.push(`Estimated cost of future revision: ${v('revisionEstimate')}`);
        yes('mri', 'Has had an MRI.'); yes('hospitalized', 'Was hospitalized.');
        if (v('permanent')) det.push(`Permanent? ${v('permanent')}`);
        if (v('later')) det.push(`Injuries since the incident: ${v('later')}`);
        inj.details = det.join('\n');
        const prior = [];
        if (v('priorDetails')) prior.push(v('priorDetails') + (v('prior5') ? ` (within the past five years: ${v('prior5')})` : ''));
        else if (v('priorYn') === 'Yes') prior.push('Other injuries or treatment before this accident.');
        if (v('priorInj')) prior.push(v('priorInj'));
        if (v('priorAccidents')) prior.push(`Prior accidents: ${v('priorAccidents')}`);
        rows('priorProviders').forEach(x => prior.push(`Treated before for this type of injury: ${join([x.name, x.dates, x.address], ' · ')}`));
        if (!prior.length && v('similarYn') === 'Yes') prior.push('Treated before for a similar injury or condition.');
        inj.prior = prior.join('\n');
        p.injury = inj;

        // police / incident report
        if (id === 'pi' && v('policeReport')) p.police = v('policeReport') === 'Yes' ? { kind: 'Police Report', agency: v('policeAgency'), number: v('policeReportNo'), officer: join([v('officerName'), peek('officerId') ? 'ID ' + v('officerId') : ''], ' · ') } : { kind: 'No Report' };
        if (id === 'dogbite' && v('policeArrived')) p.police = v('policeArrived') === 'Yes' ? { kind: 'Police Report', agency: v('policeDept'), number: v('policeReportNo'), officer: v('policeWho') } : { kind: 'No Report' };
        if (id === 'slipfall' && v('incidentReport')) p.police = v('incidentReport') === 'Yes' ? { kind: 'Incident Report', agency: firstLine(peek('adverseParties'), 120) || peek('location'), number: v('incidentNo') } : { kind: 'No Report' };
        if (id === 'premises' && v('incidentReport')) p.police = v('incidentReport') === 'Yes' ? { kind: 'Incident Report', agency: peek('location'), officer: v('incidentBy'), narrative: v('incidentCopy') ? `Client has a copy: ${v('incidentCopy')}` : '' } : { kind: 'No Report' };

        // parties
        const party = (role, name, o) => { if (str(name)) p.parties.push(Object.assign({ role, name: str(name) }, o || {})); };
        if (id === 'pi') {
            party('At-Fault Driver', v('afName'), { phone: v('afPhone'), contact: v('afAddress'), insurance: join([peek('afCo'), peek('afClaim')], ' · '),
                vehicle: join([peek('dYear'), peek('dMake'), peek('dModel'), peek('dColor'), peek('dPlate') ? 'plate ' + peek('dPlate') : '']), notes: v('afDl') ? `Driver's license # ${v('afDl')}` : '' });
            rows('injured2').forEach(x => party('Other', join([x.first, x.middle, x.last]), { phone: x.cellPhone || x.homePhone, contact: join([x.email, join([x.address, x.city, join([x.state, x.zip])], ', ')], ' · '),
                notes: join(['Also injured in this incident (intake form).', x.ssn ? `SSN ${x.ssn}` : '', x.dl ? `Driver's license # ${x.dl}` : ''], ' ') }));
        }
        if (id === 'slipfall') party('Property Owner / Business', firstLine(v('adverseParties'), 120), { insurance: join([peek('ownerInsurers'), peek('claimNumbers')], ' · '), vehicle: peek('location'), notes: str(a.adverseParties).includes('\n') ? str(a.adverseParties) : '' });
        if (id === 'dogbite') party('At-Fault Party', firstLine(v('occupants'), 120), { insurance: join([peek('ownerInsurers'), peek('claimNumbers')], ' · '), vehicle: peek('location'), notes: join(['Homeowner / tenants / business owner where the bite happened (intake form).', str(a.occupants).includes('\n') ? str(a.occupants) : ''], '\n') });
        if (id === 'medmal') party('At-Fault Party', firstLine(v('responsible'), 120), { notes: str(a.responsible).length > 120 || str(a.responsible).includes('\n') ? str(a.responsible) : 'Named at intake as responsible for the malpractice.' });
        rows('witnesses').forEach(x => party('Witness', x.name, { phone: x.phone, contact: x.address, notes: x.relation ? `Relation to the client: ${x.relation}` : '' }));
        if (id === 'premises') party('Witness', firstLine(v('witnessWho'), 120), { contact: v('witnessContact'), notes: v('witnessInfo') });
        if (id === 'medmal') party('Witness', firstLine(v('witnesses'), 120), { notes: str(a.witnesses).length > 120 || str(a.witnesses).includes('\n') ? str(a.witnesses) : '' });

        // insurance
        if (peek('healthProvider') || peek('healthCarrier')) p.health = { carrier: v('healthProvider') || v('healthCarrier'), memberId: v('healthNo') };
        const plans = rows('healthPlans');
        if (plans[0]) p.health = { carrier: plans[0].name, memberId: plans[0].id };
        plans.slice(1).forEach(x => p.noteExtra.push(`Other medical insurance: ${join([x.name, x.id, x.address, x.copay], ' · ')}`));
        if (id === 'pi' && peek('afCo')) p.bi.push({ holder: peek('afName'), carrier: v('afCo'), policy: v('afPolicy'), claim: v('afClaim'), adjuster: v('afAdjuster'), contact: join([v('afAdjPhone') || v('afInsPhone'), peek('afAdjExt') ? 'ext. ' + v('afAdjExt') : ''], ' ') });
        if ((id === 'slipfall' || id === 'dogbite') && peek('ownerInsurers')) p.bi.push({ holder: firstLine(peek('adverseParties') || peek('occupants'), 120), carrier: v('ownerInsurers'), claim: v('claimNumbers') });
        if (id === 'premises' && peek('defCarrier')) p.bi.push({ carrier: v('defCarrier'), claim: v('defClaim'), adjuster: v('defAdjuster'), contact: join([v('defCarrierPhone'), v('defCarrierAddress')], ' · '),
            limits: join([peek('glLimit') ? 'GL ' + v('glLimit') : '', peek('medPay') ? 'Med Pay ' + v('medPay') : ''], '; ') });
        if (id === 'pi' && peek('ownCo')) p.pip.push({ type: 'PIP', holder: p.name, carrier: v('ownCo'), policy: v('ownPolicy'), claim: v('ownClaim'), adjuster: v('ownAdjuster'), contact: join([v('ownAdjPhone') || v('ownPhone'), peek('ownAdjExt') ? 'ext. ' + v('ownAdjExt') : ''], ' ') });
        if (id === 'medmal' && peek('nfCarrier')) p.pip.push({ type: 'PIP', holder: p.name, carrier: v('nfCarrier'), claim: v('nfPolicy') });

        // treatment
        const fac = (name, spec, o) => { if (str(name)) p.facilities.push(Object.assign({ name: str(name), specialty: spec || 'Other' }, o || {})); };
        if (id === 'pi') { fac(firstLine(v('hospital'), 120), 'Emergency Hospital', { dates: v('admitDates') }); if (str(a.hospital).includes('\n')) p.treat.push(`Hospital: ${str(a.hospital)}`); fac(v('paramedicAgency'), 'EMS', { other: '' }); }
        fac(v('ambulanceCo'), 'EMS');
        fac(v('hospital') && id !== 'pi' ? v('hospital') : '', 'Emergency Hospital');
        rows('providers').forEach(x => { const s = specialty(`${x.name} ${x.treatment || ''}`); fac(x.name, s || 'Other', { other: s ? '' : str(x.treatment), phone: x.phone, dates: x.dates }); if (x.address) p.treat.push(`${x.name}: ${x.address}${x.treatment ? ' · ' + x.treatment : ''}`); });
        const tl = (label, k) => { const x = v(k); if (x) p.treat.push(`${label}: ${x}`); };
        tl('Approximate medical bills', 'medBills'); tl('Hospital stay', 'hospitalStay'); tl('Hospital treatment', 'hospitalTreatment'); tl('Paramedic report #', 'paramedicReportNo');
        tl('Medications', 'meds'); tl('Regular medications before the incident', 'regularMeds'); tl('Health before the incident', 'healthBefore'); tl('Treating physicians', 'physicians');
        rows('pharmacies').forEach(x => p.treat.push(`Pharmacy: ${join([x.name, x.address], ' · ')}`));
        tl('Future appointments', 'future'); tl('Medical supplies', 'supplies');
        [['Totally disabled', 'totallyDisabled'], ['Partially disabled', 'partiallyDisabled'], ['Confined to hospitals', 'confinedHospital'], ['Confined to bed', 'confinedBed'], ['Confined to house', 'confinedHouse']].forEach(([l, k]) => tl(l, k));
        tl('Effect on personal life', 'lifeImpact'); tl('Limitations', 'limitations');

        // employment and lost wages
        const employer = v('employer');
        if (employer) p.employment = { status: 'Employed', employer, title: v('position') };
        const w = { employer, position: peek('position'), contact: join([v('supervisor'), v('employerAddress')], ' · '), notes: [] };
        if (peek('wage') && id === 'pi') { w.payType = 'Hourly'; w.rate = v('wage'); }
        if (peek('payRate')) { const per = v('payPer'); w.rate = v('payRate'); w.payType = per === 'Per hour' ? 'Hourly' : per === 'Per year' ? 'Salary (annual)' : ''; if (per && !w.payType) w.notes.push(`Rate of pay: ${w.rate} ${per.toLowerCase()}`); }
        if (id === 'medmal' && peek('wage')) w.notes.push(`Wage: ${v('wage')}`);
        w.from = v('lostFrom'); w.to = v('lostTo');
        w.claimed = v('lostTotal') || v('lostWagesAmt');
        const wn = (label, k) => { const x = v(k); if (x) w.notes.push(`${label}: ${x}`); };
        wn('Time missed', 'timeMissed'); wn('Out of work', 'timeOut'); wn('Hours / days per week', 'hoursPerWeek'); wn('Employed before the injury', 'tenure'); wn('Benefits', 'benefits'); wn('Date of employment', 'employDate');
        if (v('missedWork') === 'No' || v('lostWagesYn') === 'No' || v('lostTimeYn') === 'No') w.notes.push('Client says no work time was lost.');
        if (employer || w.rate || w.claimed || w.from || w.notes.length) p.wages = w;

        // property damage (MVA)
        const anyVehicle = ['vMake', 'vModel', 'vYear', 'vPlate', 'vOwner', 'vDriver', 'dMake', 'dModel', 'dYear', 'dPlate', 'dOwner', 'dDriver'].some(k => peek(k));
        if (id === 'pi' && anyVehicle) {
            p.pd = {
                client: { year: v('vYear'), make: v('vMake'), model: v('vModel'), plate: v('vPlate'), owner: firstLine(v('vOwner'), 120) || p.name, driver: firstLine(v('vDriver'), 120) || p.name },
                tp: { year: v('dYear'), make: v('dMake'), model: v('dModel'), plate: v('dPlate'), owner: firstLine(v('dOwner'), 120), driver: firstLine(v('dDriver'), 120) || peek('afName'),
                    insured: peek('afCo') ? 'Yes' : '', carrierPolicy: join([peek('afCo'), peek('afPolicy')], ' · ') },
            };
            const pd = (label, k) => { const x = v(k); if (x) p.noteExtra.push(`${label}: ${x}`); };
            pd('Client vehicle color', 'vColor'); pd('Client vehicle damage', 'vDamage'); pd('Client vehicle towed', 'vTowed'); pd('Body shop', 'vBodyShop');
            pd('Defendant vehicle color', 'dColor'); pd('Defendant vehicle damage', 'dDamage');
            ['vOwner', 'vDriver', 'dOwner', 'dDriver'].forEach(k => { if (str(a[k]).includes('\n')) p.noteExtra.push(`${f.index[k].label}: ${str(a[k])}`); });
        }

        // everything else answered goes in the Case Note
        const rest = [];
        f.sections.forEach(sec => sec.items.forEach(it => {
            if (!it.k || it.t === 'head' || r.used.has(it.k) || !visible(it.k, a, f)) return;
            if (it.t === 'group') {
                (Array.isArray(a[it.k]) ? a[it.k] : []).forEach((row, i) => { const t = it.fields.map(fd => str(row[fd.k]) ? `${fd.label}: ${str(row[fd.k])}` : '').filter(Boolean).join('; '); if (t) rest.push(`${it.label.split(':')[0]} ${i + 1}: ${t}`); });
                return;
            }
            const x = str(a[it.k]);
            if (!x) return;
            if (it.t === 'check') rest.push(`Acknowledgment read to the client: ${x}`);
            else rest.push(`${it.label.replace(/\s*\(the paper form[^)]*\)/, '')}: ${x}`);
        }));
        const who = rec.completedBy ? ` by ${rec.completedBy}` : '', g = rec.grade;
        p.note = join([`New intake (${f.title} intake form)${who}.${g ? ` Intake grade ${g.score}% (${g.letter}): key information ${g.key.got} of ${g.key.total}, questions answered ${g.questions.answered} of ${g.questions.total}, facts of loss ${g.facts.words} words.` : ''} The full intake is on file: Profile → 📋 Intake form.`,
            p.noteExtra.concat(rest).map(x => '• ' + x).join('\n')], '\n\n').slice(0, 8000);
        return p;
    }

    function fillFromIntake(rec) {
        const C = window.caseFill;
        if (!C) throw new Error('the case editor isn\'t ready');
        const p = buildPlan(rec);
        const { setVal, set, fieldFor, cardByHead, setOther, added, cells, editIn, selIn } = C;
        let n = 0;
        const put = (el, val) => { if (el && str(val)) { setVal(el, str(val)); n++; } };
        const putIn = (scope, label, val) => put(fieldFor(scope, label), val);

        put($id('client-name-field'), p.name);
        put($id('client-phone-field'), p.phone);
        put($id('date-of-loss-field'), p.dol);
        put($id('kf-incident-location'), p.location);
        if (p.caseType === 'Others') { setOther($id('main-case-type'), $id('main-case-other'), $id('main-revert'), p.caseTypeOther); n++; }
        else if (p.caseType && $id('main-case-type')) { $id('main-case-type').value = p.caseType; n++; }
        const phase = $id('phase-selector'); if (phase) phase.value = 'Intake';
        if (typeof updatePhaseDisplay === 'function') updatePhaseDisplay('Intake');

        const prof = $id('pane-profile');
        const idCard = cardByHead(prof, 'Identity');
        putIn(idCard, 'DOB', p.dob); putIn(idCard, 'SSN', p.ssn); putIn(idCard, 'Email Address', p.email); putIn(idCard, 'Home Address', p.address);
        if (p.emergency) { const em = cardByHead(prof, 'Emergency Contact'); putIn(em, 'Full Name', p.emergency.name); putIn(em, 'Phone', p.emergency.phone); putIn(em, 'Relationship', p.emergency.relation); }
        if (p.employment) { const emp = cardByHead(prof, 'Employment Details'); putIn(emp, 'Status', p.employment.status); putIn(emp, 'Employer Name', p.employment.employer); putIn(emp, 'Job Position', p.employment.title); }
        put($id('case-narrative-field'), p.narrative);
        const inj = $id('kx-injury');
        if (inj) Object.entries(p.injury).forEach(([k, val]) => put(inj.querySelector(`[data-k="${k}"]`), val));

        if (p.police) {
            const kind = document.querySelector('#kx-report-kind select');
            if (kind) { kind.value = p.police.kind; n++; }
            if (typeof applyReportKind === 'function') applyReportKind();
            const pf = $id('police-body') ? $id('police-body').querySelectorAll('[contenteditable="true"]') : [];
            put(pf[0], p.police.agency); put(pf[1], p.police.number); put(pf[2], p.police.officer); put(pf[3], p.police.narrative);
        }

        p.parties.forEach(x => {
            if (typeof addParty !== 'function') return;
            addParty(x.role);
            const row = $id('kx-parties').lastElementChild; if (!row) return;
            n++;
            putIn(row, 'Full Name', x.name); putIn(row, 'Phone', x.phone); putIn(row, 'Email / Address', x.contact);
            putIn(row, 'Insurance Carrier', x.insurance); putIn(row, 'Vehicle / Location', x.vehicle); putIn(row, 'Notes', x.notes);
        });

        const ins = $id('pane-matrix');
        if (p.health) { const hi = cardByHead(ins, 'Health Insurance'); putIn(hi, 'Carrier', p.health.carrier); putIn(hi, 'Member ID', p.health.memberId); }
        p.bi.forEach(b => {
            addBI(); const card = added('bi-container'); if (!card) return;
            putIn(card, 'Policy Holder', b.holder); putIn(card, 'Carrier', b.carrier); putIn(card, 'Policy #', b.policy); putIn(card, 'Claim #', b.claim);
            putIn(card, 'Adjuster Name', b.adjuster); putIn(card, 'Adjuster Contact', b.contact); putIn(card, 'Policy Limits', b.limits);
        });
        p.pip.forEach(x => {
            addPIPUM(); const card = added('pip-um-container'); if (!card) return;
            putIn(card, 'Coverage Type', x.type); putIn(card, 'Policy Holder', x.holder); putIn(card, 'Insurance Carrier', x.carrier); putIn(card, 'Policy #', x.policy);
            putIn(card, 'Claim Number', x.claim); putIn(card, 'Adjuster Name', x.adjuster); putIn(card, 'Adjuster Contact', x.contact);
        });

        p.facilities.forEach(x => {
            addFacility(); const tr = added('facility-container'); if (!tr) return;
            const td = cells(tr);
            put(editIn(td[0]), x.name);
            if (x.specialty === 'Other') { if (str(x.other)) setOther(selIn(td[1]), td[1].querySelector('[contenteditable]'), td[1].querySelector('.revert-btn'), x.other); else setVal(selIn(td[1]), 'Other'); }
            else setVal(selIn(td[1]), x.specialty);
            put(editIn(td[2]), x.phone); put(editIn(td[4]), x.dates);
        });
        const tn = cardByHead($id('pane-medical'), 'Other Treatment Notes');
        put(tn && tn.querySelector('[contenteditable]'), p.treat.join('\n'));

        if (p.wages) {
            const wk = (k, val) => put(document.querySelector(`#kx-wages [data-k="${k}"]`), val);
            wk('employer', p.wages.employer); wk('position-title', p.wages.position); wk('employer-contact-hr-payroll', p.wages.contact);
            if (p.wages.payType) wk('pay-type', p.wages.payType);
            wk('rate-of-pay', p.wages.rate); wk('off-work-from', p.wages.from); wk('returned-to-work', p.wages.to); wk('lost-wages-claimed', p.wages.claimed);
            wk('notes', p.wages.notes.join('\n'));
        }

        if (p.pd) {
            const pd = $id('pane-pd'), cv = cardByHead(pd, 'Client Vehicle'), tv = cardByHead(pd, 'Third Party Vehicle');
            const c = p.pd.client, t = p.pd.tp;
            putIn(cv, 'Year', c.year); putIn(cv, 'Make', c.make); putIn(cv, 'Model', c.model); putIn(cv, 'License Plate', c.plate); putIn(cv, 'Registered Owner', c.owner); putIn(cv, "Driver's Name", c.driver);
            putIn(tv, 'Year', t.year); putIn(tv, 'Make', t.make); putIn(tv, 'Model', t.model); putIn(tv, 'License Plate', t.plate);
            put($id('tp-owner'), t.owner); put($id('tp-driver'), t.driver);
            if (t.insured) { setVal($id('tp-driver-insured'), t.insured); putIn(tv, 'Carrier / Policy Details', t.carrierPolicy); }
        }

        // the Case Note: who did the intake, and the answers with no case field of their own
        addRow('note-body');
        const note = added('note-body');
        if (note) { const td = cells(note); setVal(selIn(td[1]), 'Intake Specialist'); setVal(editIn(td[2]), p.note); }

        if (typeof toggleOwnerExtra === 'function') toggleOwnerExtra();
        if (typeof toggleDriverInsuredExtra === 'function') toggleDriverInsuredExtra();
        if (typeof window.afterKeyedApplied === 'function') window.afterKeyedApplied();
        if (typeof updateTotals === 'function') updateTotals();
        if (typeof generateCaseId === 'function') generateCaseId();
        if (typeof showTab === 'function') showTab('profile');
        if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#capture-area')) document.activeElement.blur();
        return n;
    }

    /* ---------- the intake on the case (#kx-intake) ---------- */
    const recordEl = () => document.querySelector('#kx-intake [data-k="data"]');
    function readRecord() {
        const el = recordEl(); if (!el) return null;
        try { const r = JSON.parse(el.textContent || 'null'); return r && FORMS[r.form] && r.answers ? r : null; } catch (e) { return null; }
    }
    function writeRecord(rec) {
        const el = recordEl(); if (!el) return;
        el.textContent = rec ? JSON.stringify(rec) : '';
        paintRecord();
    }
    function paintRecord() {
        const box = $id('kx-intake'); if (!box) return;
        const rec = readRecord();
        box.classList.toggle('has', !!rec);
        let bar = box.querySelector('.io-bar');
        if (!bar) { box.insertAdjacentHTML('beforeend', '<div class="io-bar" style="display:contents"></div>'); bar = box.querySelector('.io-bar'); }
        bar.innerHTML = rec ? `<span class="io-tag">📋 INTAKE FORM</span>
            <span class="io-txt"><b>${esc(FORMS[rec.form].title)} intake</b>${rec.grade ? ` · grade <b>${rec.grade.score}% (${esc(rec.grade.letter)})</b>` : ''} · saved ${esc(fmtWhen(rec.completedAt))}${rec.completedBy ? ' by ' + esc(rec.completedBy) : ''}</span>
            <button type="button" class="go" onclick="openNewMatter({ view: true })">View intake form</button><button type="button" onclick="printIntakeOnFile()">🖨 Print</button>` : '';
    }
    /* ---------- print ---------- */
    function display(it, a) {
        const v = a[it.k];
        if (it.t === 'group') return '';
        if (it.t === 'part') return join([a[it.k + 'Side'], str(v)], ' · ');
        return str(v);
    }
    function printIntake(rec) {
        const f = FORMS[rec.form], a = rec.answers || {};
        const sections = f.sections.map(sec => {
            const rowsHtml = sec.items.map(it => {
                if (it.t === 'head') return `<tr><td colspan="2" class="h">${esc(it.label)}</td></tr>`;
                if (!visible(it.k, a, f)) return '';
                if (it.t === 'group') {
                    const list = (Array.isArray(a[it.k]) ? a[it.k] : []).filter(r => r && Object.values(r).some(x => str(x)));
                    return `<tr><td class="l">${esc(it.label)}</td><td>${list.length ? list.map((r, i) => `${i + 1}. ${esc(it.fields.map(fd => str(r[fd.k]) ? `${fd.label}: ${str(r[fd.k])}` : '').filter(Boolean).join(' · '))}`).join('<br>') : '<span class="e">—</span>'}</td></tr>`;
                }
                const val = display(it, a);
                return `<tr><td class="l">${esc(it.label)}</td><td>${val ? esc(val).replace(/\n/g, '<br>') : '<span class="e">—</span>'}</td></tr>`;
            }).join('');
            return `<h2>${esc(sec.title)}</h2><table>${rowsHtml}</table>`;
        }).join('');
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(f.title)} intake${clientOf(a) ? ' – ' + esc(clientOf(a)) : ''}</title>
            <style>body{font:12px/1.45 Arial,Helvetica,sans-serif;color:#111;margin:28px}h1{font-size:18px;margin:0}.sub{color:#555;margin:4px 0 14px}
            h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #f97316;padding-bottom:3px;margin:18px 0 6px;break-after:avoid}
            table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:4px 6px;border-bottom:1px solid #e5e7eb}td.l{width:44%;color:#444}td.h{font-weight:700;color:#c2410c;padding-top:10px}
            .e{color:#aaa}tr{break-inside:avoid}</style></head><body>
            <h1>Legal Support Help · ${esc(f.title)} client intake</h1>
            <div class="sub">${clientOf(a) ? `<b>${esc(clientOf(a))}</b> · ` : ''}${rec.completedAt ? `saved ${esc(fmtWhen(rec.completedAt))}${rec.completedBy ? ' by ' + esc(rec.completedBy) : ''}` : 'not saved yet'}${rec.grade ? ` · intake grade ${rec.grade.score}% (${esc(rec.grade.letter)})` : ''} · printed ${esc(today())}</div>
            ${sections}</body></html>`;
        const w = window.open('', '_blank');
        if (!w) { toast('The print window was blocked. Allow pop-ups for this site, then try again.', 'error'); return; }
        w.document.open(); w.document.write(html); w.document.close();
        w.focus(); setTimeout(() => { try { w.print(); } catch (e) { /* closed */ } }, 300);
    }

    /* ---------- open ---------- */
    window.openNewMatter = function (opts) {
        opts = opts || {};
        if (!signedIn()) return;
        build();
        if (opts.view) {
            const rec = readRecord();
            if (!rec) { toast('This case has no intake form on file.', 'info'); return; }
            S = { open: false, step: 'form', mode: 'view', form: rec.form, a: JSON.parse(JSON.stringify(rec.answers || {})), errors: {}, rec, readOnly: true };
        } else S = { open: false, step: 'pick', mode: 'new', form: null, a: {}, errors: {}, readOnly: false };
        show();
    };
    window.openNewIntake = window.openNewMatter;
    window.printIntakeOnFile = function () { const rec = readRecord(); if (rec) printIntake(rec); };
    window.newMatterState = () => ({ open: S.open, step: S.step, mode: S.mode, form: S.form, answers: S.a, errors: Object.assign({}, S.errors), record: readRecord() }); // for the tests and debugging
    window.newMatterPlan = (rec) => buildPlan(rec); // for the tests

    // The intake on file follows the case: redrawn whenever a case loads or the editor clears.
    const baseAfter = window.afterKeyedApplied;
    window.afterKeyedApplied = function () { const r = typeof baseAfter === 'function' ? baseAfter.apply(this, arguments) : undefined; paintRecord(); return r; };
    // Signed out: close the form (the draft stays for this user's next visit).
    const origApply = window.applySessionUI;
    if (typeof origApply === 'function') {
        window.applySessionUI = function () {
            const r = origApply.apply(this, arguments);
            if (!signedIn()) close();
            const btn = $id('nm-open-btn'); if (btn) btn.style.display = signedIn() ? '' : 'none';
            return r;
        };
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintRecord); else paintRecord();
})();
