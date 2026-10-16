/* =========================================================
   LSH CMS — CLIENT MESSAGING: THE CONVERSATIONS
   ---------------------------------------------------------
   The texts a firm's staff answer on a case file's 💬 Messages tab
   (client-messaging.js), the way CasePeer's client texting works: the
   client (or someone who says they know the client) texts the firm's
   number, the message lands on the file the number belongs to, and the
   trainee answers it in their program's role.

   Each conversation is about one Training Library file (mock-cases.js)
   and is written as BEHAVIOUR ONLY: who is texting, what they want, how
   they act, and what a good answer does (goals). Every fact — the
   appointment, the adjuster, the authorization, the SOL — comes from the
   file itself (fileText below), so the texter, the trainee and the grader
   all read the same case, and the dates roll forward with the library
   (case-freshness.js). Don't write a date into a conversation: point at
   the file ("the next chiropractic visit on the file").

   A conversation: { id, program ('reception' | 'intake' | 'cm' | 'md' |
   'pd' | 'ea'), mock (MC-xx), title, level, from: { name, role, number
   (omit for the client's own mobile on file) }, opening (their first
   text), hidden (the texter's script: what they know and how they act;
   the trainee never sees it), gives (what the texter answers when asked
   to verify; omit for the client, who answers from the file), goals
   (what is graded), critical (indexes into goals: missing one fails the
   conversation, at most 59%), rubric (optional, instead of RUBRIC) }.

   The texting policy (SMS_POLICY) is the firm's; it is shown to the
   trainee, given to the texter (so a policy-savvy client reacts
   realistically) and is what the grader checks the replies against.

   Read as window.MESSAGE_PACKS (and module.exports, for the tests).
   ========================================================= */
(function () {
    'use strict';

    // Where a graded conversation counts: the program's course on the Training Portal
    // (functions/api/drill-results.js → the Portal's /api/call-results), on its own line.
    const PROGRAMS = [
        { id: 'reception', label: 'Receptionist / Front Desk', short: 'Reception', course: 'FT', icon: '☎' },
        { id: 'intake', label: 'Intake', short: 'Intake', course: 'FT', icon: '📋' },
        { id: 'cm', label: 'Case Management', short: 'Case Management', course: 'CM', icon: '🗂' },
        { id: 'md', label: 'Medical Summary & Demand', short: 'Med Summary & Demand', course: 'MD', icon: '🩺' },
        { id: 'pd', label: 'Property Damage (Claims)', short: 'Property Damage', course: 'PD', icon: '🚗' },
        { id: 'ea', label: 'EA / PA', short: 'EA / PA', course: 'EA', icon: '🧑‍💼' }
    ];
    const LINE = 'Client Messaging';

    /* ---------- the firm's texting policy ---------- */
    const SMS_POLICY = [
        'A text from a number on the file is matched to that contact, but a phone number is not proof of who is typing. Before you share ANY case detail (an appointment, a status, a name), confirm two identifiers on file: full name and date of birth. A third party (a relative, a friend) gets case information only if the file lists them as authorized, and only after you verify them.',
        'Never send or ask for by text: a Social Security number (not even the last 4), a full date of birth written back, bank or account numbers, settlement or offer amounts, medical details beyond scheduling, or documents and photos of IDs, bills or records. Point people to the secure upload link or the office instead.',
        'No legal advice by text: not whether to accept an offer, what a case is worth, deadlines or the statute of limitations, or whether to give a statement. Route it to the attorney or case manager on the file by phone, and say when they will call.',
        'A person who is not authorized on the file gets nothing: do not confirm the firm represents the client. Offer to take a message.',
        'STOP, UNSUBSCRIBE, "quit texting me": the number has opted out. Send one short confirmation that texting has stopped and how the firm will reach them instead, send nothing more, and note it so the case manager calls.',
        'An emergency or a safety concern (someone in danger, a medical emergency, a threat): tell them to call 911 now if they are in danger, and get the attorney or case manager on the phone with them immediately. Do not handle it by text.',
        'Write like the firm: short, plain, courteous; the firm name and your first name in your first reply; no slang, no emoji, no promises of money or dates the file doesn\'t support. One message that answers beats five that ask.',
        'Every text is part of the client\'s file (and can be read in a lawsuit). Log the conversation as a Case Note: who texted (name and number), whether they were verified, what they asked, what you told them, and the next step and who owns it.'
    ];

    /* ---------- the firm's quick replies (CasePeer-style templates) ---------- */
    // {fields} are filled from the open file and the trainee (client-messaging.js fill()); a field the file
    // has no value for is left as [field] so the trainee sees what to fill in by hand.
    const TEMPLATES = [
        { id: 'verify', label: 'Verify before details', text: 'Hi {client_first}, this is {my_name} with {firm}. To protect your privacy, please reply with your full name and date of birth before we discuss your case.' },
        { id: 'call', label: 'Better by phone', text: 'Thank you. This is best handled by phone: {cm} (ext {cm_ext}) will call you today. What is the best number and time to reach you?' },
        { id: 'nodetail', label: 'Can\'t discuss by text', text: 'For your privacy we can\'t discuss case details by text. Please call us at {main_line} and ask for {cm}.' },
        { id: 'noauth', label: 'Not authorized', text: 'Thank you for reaching out to {firm}. We\'re not able to share any information, but we can take a message. What is your name and the best number to call you back?' },
        { id: 'upload', label: 'Secure upload', text: 'Please don\'t text photos of IDs, bills or records. Use the secure upload link we emailed you, or bring them to our office at {firm_address}.' },
        { id: 'appt', label: 'Appointment on file', text: 'Your next appointment on file is at {provider} on {next_visit}. Please call them at {provider_phone} to confirm, and let us know if anything changes.' },
        { id: 'optout', label: 'Opt-out confirmation', text: 'You have been unsubscribed from text messages from {firm}. We will contact you by phone at this number from now on.' },
        { id: 'emergency', label: 'Emergency', text: 'If you are in danger, please call 911 now. I am getting {attorney} on the phone for you right away.' },
        { id: 'afterhours', label: 'After hours', text: 'Thank you for your message. Our office is closed; we will reply when we open at 8:30 AM. If this is an emergency, call 911.' }
    ];

    /* ---------- how a conversation is scored ---------- */
    // Each metric 0-5, weighted; the score is the weighted average as a percentage. A conversation that misses
    // one of its critical goals (a privacy breach, advice by text, ignoring an emergency) is capped at 59%.
    const RUBRIC = [
        { metric: 'Identity and authorization', weight: 3, what: 'Verified the texter (name and DOB on file; an authorized third party checked against the file) before sharing anything; used the right file; gave an unauthorized texter nothing.' },
        { metric: 'Accuracy against the file', weight: 2, what: 'Every fact given (dates, places, names, extensions, status) matches the case file; nothing invented or guessed.' },
        { metric: 'Resolution and next step', weight: 2, what: 'Answered what could be answered by text, or routed to the right person on the file with when they will reach out; the texter knows what happens next.' },
        { metric: 'Privacy and texting policy', weight: 3, what: 'No SSN, DOB, amounts, medical detail or documents by text; no legal advice; an opt-out honored; an emergency moved to 911 and a phone call.' },
        { metric: 'Professional tone and clarity', weight: 1, what: 'Firm name and own name up front, short plain courteous sentences, no slang or emoji, calm with an upset texter.' },
        { metric: 'Efficiency', weight: 1, what: 'No needless back-and-forth or repeated questions; each reply moves the conversation forward.' },
        { metric: 'Case note', weight: 2, what: 'The Case Note says who texted (name, number), verified or not, what they asked, what was said, the next step and its owner.' }
    ];

    /* ---------- the conversations ---------- */
    const THREADS = [
        // ☎ Receptionist / Front Desk
        { id: 'rx_appt', program: 'reception', mock: 'MC-01', level: 'Beginner', title: 'Lost appointment card',
          opening: 'hi its maria, i lost my appt card. when is my next chiropractor appointment??',
          hidden: 'You are the client. Friendly, a little rushed (on a break at work). If asked to verify, give your full name and date of birth as the file has them. You only want the CHIROPRACTOR visit (you may confuse it with physical therapy if the receptionist gives the wrong one). Say thanks and end once you have the right visit.',
          goals: ['Asks her to confirm her full name and date of birth before giving the appointment', 'Gives the next chiropractic visit (provider, day, date and time) exactly as the file has it, not the physical therapy one', 'Suggests she confirm with the clinic (the clinic\'s phone from the file)', 'Opens with the firm name and their own name', 'Logs the conversation as a Case Note'],
          critical: [0] },
        { id: 'rx_cousin', program: 'reception', mock: 'MC-01', level: 'Beginner', title: 'A "cousin" asks about the settlement',
          from: { name: 'Rosa', role: 'Says she is the client\'s cousin', number: '(555) 010-4490' },
          opening: 'Hi this is Rosa, Maria Santos cousin. did her case settle yet? how much is she getting',
          hidden: 'You are Rosa, the client\'s cousin. You are NOT on the file. You are nosy but polite. If refused, push once ("I\'m family, she told me to ask"). If asked to verify, you only know Maria\'s birthday is "in March". Accept a message offer and give your name and number. End politely.',
          gives: { name: 'Rosa Santos', dob: 'You don\'t know it, only "March-something"', relationship: 'Cousin' },
          goals: ['Does not confirm the firm represents Maria or that a case exists', 'Shares no case information at all (status, settlement, amounts)', 'Offers to take a message and gets her name and callback number', 'Stays polite when she pushes back', 'Logs the attempt as a Case Note (who, number, what was asked, nothing shared)'],
          critical: [0, 1] },
        { id: 'rx_samename', program: 'reception', mock: 'MC-22', level: 'Intermediate', title: 'Which Maria Santos?',
          opening: 'Good morning, Maria Santos here. Is there an update on my case? And can you remind me of my next appointment?',
          hidden: 'You are the client on this file (a different Maria Santos from the firm\'s other two Maria Santos files). Polite and patient. If asked to verify, give your name and date of birth exactly as THIS file has them, and the date of the accident if asked. You want a status in plain words and your next appointment. End once you have them.',
          goals: ['Verifies with her date of birth (and the date of the accident) because several files share her name', 'Uses THIS file (the dog bite): gives the next appointment as this file has it, nothing from the other Maria Santos files', 'Gives the status in plain words without legal advice or values', 'Offers the case manager on this file for anything more', 'Logs the conversation as a Case Note'],
          critical: [0, 1] },
        { id: 'rx_optout', program: 'reception', mock: 'MC-46', level: 'Intermediate', title: '"STOP texting me"',
          opening: 'STOP. quit texting me, i\'ll call when i want to talk.',
          hidden: 'You are the client, annoyed: the firm texted you a reminder about therapy and you are sick of reminders. You do not want to verify or explain. If the firm keeps texting, get angrier ("I said stop"). If they send one polite confirmation, do not reply again (end).',
          goals: ['Sends one short confirmation that the firm will stop texting and how they will reach her instead (by phone)', 'Sends nothing more after the confirmation (no reminders, no questions, no case details)', 'Notes the opt-out on the file and routes it to the case manager to call her', 'Stays courteous: no argument'],
          critical: [1] },
        { id: 'rx_safety', program: 'reception', mock: 'MC-27', level: 'Advanced', title: 'A client in danger',
          opening: 'This is Olivia. I think he found where I live now. There is a car outside again. What do I do',
          hidden: 'You are the client (the file\'s safety flag is about you: you moved after the assault). You are scared and texting fast. If told to call 911, say you will but you\'re scared; if someone from the firm is getting the attorney on the phone, calm down a little and end ("ok calling now"). If the trainee asks for your address or new details by text, hesitate ("is this safe?").',
          goals: ['Tells her to call 911 now if she is in danger', 'Gets the attorney or case manager on the phone with her immediately (does not handle it by text)', 'Does not ask for or repeat her address or any location by text', 'Keeps the replies short and calm', 'Logs it as an urgent Case Note and alerts the attorney on the file'],
          critical: [0, 1, 2] },

        // 📋 Intake
        { id: 'in_retainer', program: 'intake', mock: 'MC-02', level: 'Beginner', title: 'Is this e-sign email legit?',
          opening: 'Hey, Derek Thompson. I got an email to sign something from your firm, is that legit? Also the store\'s insurance company keeps calling me',
          hidden: 'You are the potential client. You haven\'t signed the retainer and HIPAA sent by e-sign (the file says when). You are cautious about scams. The store\'s insurer wants a recorded statement and you were about to call them back. Ask "should I just give them the statement and get it over with?" If told not to and that the attorney will handle it, agree. If the trainee offers to resend the link or walk you through signing, accept. End once you know what to do.',
          goals: ['Verifies him (name and date of birth) before discussing the file', 'Confirms the e-sign email is the firm\'s retainer and HIPAA and offers to resend or help him sign', 'Tells him not to give the store\'s insurer a statement and that the attorney\'s office will handle the insurer (without legal advice beyond the file\'s instruction)', 'Gives a clear next step (signing, who follows up and when)', 'Logs it as a Case Note with a follow-up task on the unsigned retainer'],
          critical: [2] },
        { id: 'in_sol', program: 'intake', mock: 'MC-13', level: 'Advanced', title: '"Am I running out of time?"',
          opening: 'hi I talked to someone there about my fall at HomeMax. are you taking my case or not? I\'m running out of time right?',
          hidden: 'You are the potential client. You dealt with the store\'s insurer yourself for a year and only recently called the firm. You keep pressing: "just tell me the deadline" and "so am I too late?". If the trainee routes you to the attorney urgently with a real callback window, accept and give your best time. End once someone is calling you.',
          goals: ['Verifies her (name and date of birth)', 'Gives no legal advice by text: no deadline, no SOL date, no opinion on whether she is too late or whether the firm will take the case', 'Treats it as urgent and routes it to the intake attorney on the file by phone, with when they will call', 'Gets her best callback number and time', 'Logs an urgent Case Note and a task for the attorney'],
          critical: [1, 2] },
        { id: 'in_packet', program: 'intake', mock: 'MC-36', level: 'Intermediate', title: '"What else do you need from me?"',
          opening: 'Walter Grant. I signed your papers yesterday. What else do you need from me?',
          hidden: 'You are the new client. Cooperative and organized. If told what is missing, offer to "just text you pictures of my license and insurance card". If redirected to the secure upload or the office, agree. Ask who your case manager is; accept whatever the file supports. End when you know the list.',
          goals: ['Verifies him (name and date of birth)', 'Tells him what the file says is still missing from the intake packet, accurately', 'Stops him from texting photos of his ID or insurance card and points him to the secure upload or the office', 'Sets an honest expectation about the case manager (not assigned yet, per the file)', 'Logs a Case Note with the items requested'],
          critical: [2] },
        { id: 'in_social', program: 'intake', mock: 'MC-28', level: 'Intermediate', title: 'Posting the crash video',
          opening: 'yo it\'s Marcus. my scooter crash video is getting views lol. ok if I post it on tiktok? also do I need to send it to you',
          hidden: 'You are the client, young and casual. You think posting is harmless. If told the attorney asks clients not to post about the case, push once ("it\'s my video though"). If given the reason simply and a way to send the video to the firm safely, agree and end.',
          goals: ['Verifies him (name and date of birth)', 'Asks him not to post the video or anything about the crash online and to keep the original, as the firm\'s standing instruction (not a legal opinion)', 'Gets the video to the firm the right way (the secure upload), not by text', 'Routes any further question to the attorney on the file', 'Logs a Case Note (the video exists, he was told not to post it, how it is being sent)'],
          critical: [1] },

        // 🗂 Case Management
        { id: 'cm_gap', program: 'cm', mock: 'MC-23', level: 'Beginner', title: 'Missed physical therapy',
          opening: 'Hey it\'s James Wilson. I missed PT this week, work has been crazy. Is that a big deal?',
          hidden: 'You are the client on THIS file (James Wilson has more than one file with the firm: this is the garage handrail case). Busy, a little defensive. If verified, give your name and date of birth and, if asked, the date of the accident. If told why gaps matter, ask "so will it hurt my case?" — want reassurance, not a lecture. Agree to reschedule if helped. End when the next visit is sorted.',
          goals: ['Verifies him, including the date of the accident (he has more than one file)', 'Explains simply why consistent treatment matters, without valuing the case or giving legal advice', 'Helps him get back on schedule: the next visits on the file, and calling the provider to reschedule', 'Documents the missed visit as a treatment gap in the Case Note, with a follow-up task', 'Stays supportive, not scolding'],
          critical: [0] },
        { id: 'cm_offer', program: 'cm', mock: 'MC-31', level: 'Intermediate', title: '"Should I take the offer?"',
          opening: 'they offered me 30k!! should I take it?? just tell me yes or no',
          hidden: 'You are the client. Excited and impatient: you want a yes or no right now. Push twice ("you work there, you know", "just between us"). If the trainee sets up a call with the attorney with a real time, accept. If they say a number or "yes take it", agree happily (that is their mistake). End when a call is set.',
          goals: ['Verifies her (name and date of birth) before discussing the offer', 'Gives no advice and no opinion on the offer by text (the decision is hers, with the attorney)', 'Does not repeat or discuss amounts by text', 'Sets up a call with the attorney or the case manager on the file, with when', 'Logs a Case Note and a task for the attorney about the offer'],
          critical: [1, 2] },
        { id: 'cm_check', program: 'cm', mock: 'MC-06', level: 'Intermediate', title: 'Can my buddy pick up the check?',
          opening: 'James Wilson. Is my settlement check ready? My buddy Mike can swing by and pick it up for me today',
          hidden: 'You are the client on THIS file (the settled truck crash: you have another file with the firm). If asked, verify with your name, date of birth and the date of the accident. You are counting on the money. If told the check can\'t go to Mike, ask "what if I text you that it\'s ok?" Accept the real rule and a realistic timeline from the file. End when you know when and how.',
          goals: ['Verifies him, including which file (the settled one)', 'Gives the status the file supports (what is still pending and the realistic timeline), with no amounts by text', 'Explains the check goes only to him with photo ID unless the attorney approves a signed written authorization (a text is not enough)', 'Offers the case manager or accounting on the file for questions', 'Logs a Case Note'],
          critical: [2] },
        { id: 'cm_newnumber', program: 'cm', mock: 'MC-07', level: 'Advanced', title: 'New number, upset client',
          from: { name: 'Keisha Brown', role: 'Says she is the client, texting from a new number', number: '(555) 010-5099' },
          opening: 'This is Keisha Brown. I moved and got a new number and NOBODY from your office ever calls me back!!',
          hidden: 'You are the client, texting from a number that is NOT on the file. You moved. You are upset and want an apology and a call today. If asked to verify, give your name, date of birth and, if asked for your address, your NEW address first (if they ask for the address on file, give the old one from the file). Calm down if the trainee is calm and gives a real callback time.',
          goals: ['Treats the number as unknown and verifies her identity with the details ON FILE (including the old address) before anything else', 'Shares no case details until she is verified', 'Takes the new number and address for the file (a Case Note and a task to update it), not just in the chat', 'Acknowledges the frustration and sets a specific callback from the case manager on the file', 'Stays calm and professional'],
          critical: [0, 1] },
        { id: 'cm_noshow', program: 'cm', mock: 'MC-15', level: 'Intermediate', title: 'The therapist never came',
          from: { name: 'Michael Lewis', role: 'Says he is the client\'s son', number: '(555) 010-5851' },
          opening: 'Hi, Michael Lewis, Patricia\'s son. The physical therapist never showed up for Mom\'s home visit this morning. Also she keeps asking if she owes you a lawyer bill.',
          hidden: 'You are the client\'s son and you hold her durable power of attorney (the file says so). If asked to verify, give your name, your mother\'s name and date of birth as the file has it, and say you have the POA. You want someone to chase the therapy company and you want your mother reassured about fees in simple words. End when both are handled.',
          goals: ['Checks that Michael is authorized on the file (the POA) and verifies him before discussing anything', 'Takes the missed home visit seriously: a task to contact the provider and reschedule, noted as a provider no-show, not a gap caused by the client', 'Reassures about fees in general terms only (no fee unless there is a recovery is the firm\'s standard, with the attorney for details), without amounts', 'Gives the case manager on the file and when they will follow up', 'Logs a Case Note'],
          critical: [0] },

        // 🩺 Medical Summary & Demand
        { id: 'md_demand', program: 'md', mock: 'MC-03', level: 'Beginner', title: 'When does my demand go out?',
          opening: 'Hi, Aisha Patel. I finished treatment months ago. When is my demand going out?',
          hidden: 'You are the client. Patient but wants a real answer. Ask "how much do you think I\'ll get?" once. If told what is still being gathered and roughly what happens next, offer any receipts you have. End when you know the next step.',
          goals: ['Verifies her (name and date of birth)', 'Gives the demand status the file supports in plain words (where it is and what is left)', 'Gives no estimate of value', 'Asks for anything the demand still needs from her (out-of-pocket receipts, other providers) through the secure upload, not by text', 'Logs a Case Note'],
          critical: [2] },
        { id: 'md_collections', program: 'md', mock: 'MC-09', level: 'Intermediate', title: 'The bill went to collections',
          opening: 'the clinic says they\'re sending my bill to COLLECTIONS. you guys said you\'d handle this!!',
          hidden: 'You are the client, upset and embarrassed. If asked to verify, give your name and date of birth. You can name the provider and say the letter came this week. Offer to text a photo of the letter. Calm down if someone takes ownership and says when they will call the provider.',
          goals: ['Verifies her (name and date of birth)', 'Takes ownership: a task for the case manager or records team to contact the provider today about the account (lien or letter of protection per the file), with no promise that the firm will pay it', 'Redirects the photo of the letter to the secure upload', 'Calms her with a specific next step and who owns it', 'Logs a Case Note'],
          critical: [1] },
        { id: 'md_discharged', program: 'md', mock: 'MC-17', level: 'Beginner', title: '"My doctor says I\'m done"',
          opening: 'Andre here. Doctor says I\'m done with therapy. What happens now?',
          hidden: 'You are the client. Glad to be done. Ask "so when do I get paid?" once. Mention you also saw an urgent care once that you never told anyone about (true, the file may not have it). End when you know the next steps.',
          goals: ['Verifies him (name and date of birth)', 'Explains the next phase simply: collecting records and bills from every provider, then the demand, with no timeline or amount promises', 'Asks about any other providers or out-of-pocket costs and captures the urgent care visit he mentions', 'Asks for the discharge paperwork through the secure upload', 'Logs a Case Note with the new provider and a task to request its records'],
          critical: [] },

        // 🚗 Property Damage (Claims)
        { id: 'pd_storage', program: 'pd', mock: 'MC-12', level: 'Intermediate', title: 'Storage fees and no rental',
          opening: 'William Harris. The body shop says I owe storage fees now and I STILL don\'t have a rental. Who pays for this?',
          hidden: 'You are the client, frustrated and practical. If asked, verify with your name and date of birth. You want to know who pays storage and when you get a rental. If told the truth from the file (where the claim stands) and what the PD specialist is doing, ask whether you should move the car. End when you know the next step.',
          goals: ['Verifies him (name and date of birth)', 'Explains where the property damage claim stands, accurately from the file (liability, adjuster, rental)', 'Makes no promise that storage or a rental will be paid', 'Routes to the property damage specialist on the file with a task about the storage charges and when he will hear back', 'Logs a Case Note'],
          critical: [2] },
        { id: 'pd_totalloss', program: 'pd', mock: 'MC-25', level: 'Advanced', title: 'The total-loss value is too low',
          opening: 'Jose Hernandez. They say my Camry is a total loss for 9850?? That is too low. And when does my rental end',
          hidden: 'You are the client on THIS file (the father, born in the 1960s: your son has a file with the same name and address). Your English is fine for texting but you prefer Spanish for long explanations. If asked, verify with name and date of birth. You think the car was worth more (new tires last year). Ask "can you just tell them 12 thousand?". End when you know how to dispute and when the rental ends.',
          goals: ['Verifies him with his date of birth (the son\'s file has the same name, address and date of the accident)', 'Explains the rental rule exactly as the file has it', 'Explains how to back up a higher value (comparable listings, maintenance and tire receipts through the secure upload) without promising a number', 'Routes the valuation to the property damage specialist on the file and offers Spanish (the bilingual case manager)', 'Logs a Case Note'],
          critical: [0] },
        { id: 'pd_lossofuse', program: 'pd', mock: 'MC-08', level: 'Intermediate', title: 'Loss of use on the motorcycle',
          from: { name: 'Daniela Rivera', role: 'Says she is the client\'s daughter', number: '(555) 010-5189' },
          opening: 'Hi, this is Daniela Rivera, Tomás\'s daughter. Any update on the money for Dad not having his motorcycle? And when will the shop be done?',
          hidden: 'You are the client\'s daughter; the file has a communication authorization for you. If asked to verify, give your name, your father\'s name and date of birth as the file has them. You handle things for your father because he prefers Spanish. End when you have the status.',
          goals: ['Checks that Daniela is authorized on the file and verifies her before sharing anything', 'Gives the repair and loss-of-use status accurately from the file (where the bike is, what is approved, what is still open)', 'Makes no promise of an amount or a date for the loss-of-use payment', 'Gives the property damage specialist on the file as the owner of the next step', 'Logs a Case Note'],
          critical: [0] },

        // 🧑‍💼 EA / PA
        { id: 'ea_mediation', program: 'ea', mock: 'MC-34', level: 'Intermediate', title: 'Mediation time, and can my wife come?',
          opening: 'Brian O\'Neill here. What time is my mediation and do I need to bring anything? My wife wants to come with me.',
          hidden: 'You are the client. Nervous about the mediation. If asked, verify with name and date of birth. You assume your wife can come. If told it is the attorney\'s decision and someone will confirm, accept. End when you have the time, place and what to bring.',
          goals: ['Verifies him (name and date of birth)', 'Gives the mediation date, time and place, in person, exactly as the file has it, and the prep session with the attorney', 'Does not say yes or no about his wife: it is the attorney\'s decision (as the file says), and offers to ask', 'Tells him what to bring or that the attorney will cover it at the prep session, without inventing requirements', 'Logs a Case Note and a task for the attorney about his wife attending'],
          critical: [2] },
        { id: 'ea_prep', program: 'ea', mock: 'MC-05', level: 'Advanced', title: 'Move Mom\'s deposition prep?',
          from: { name: 'Marco Garcia', role: 'Says he is the client\'s son', number: '(555) 010-4851' },
          opening: 'Hi, Marco Garcia, Linda\'s son. Mom has a doctor appointment the day of her deposition prep. Can we move it? Or can we just move the deposition?',
          hidden: 'You are the client\'s son and authorized on the file (signed communication authorization). If asked to verify, give your name, your mother\'s name and date of birth as the file has them. You would prefer to move the deposition itself. Accept that it can\'t be moved by text and that prep can be rescheduled with the attorney. Offer two days that work. End when a plan is set.',
          goals: ['Checks that Marco is authorized on the file and verifies him', 'Does not move or agree to move the deposition: that goes to the attorney and the paralegal on the file', 'Offers to reschedule the prep session with the attorney (checks her availability, confirms back), without double-booking', 'Gives who will confirm and when', 'Logs a Case Note and a task for the paralegal'],
          critical: [1] }
    ];

    /* ---------- the case file, as text ---------- */
    // Everything the texter and the grader may need, from the file as it reads today (mock-cases.js, rolled forward).
    const pick = (o, keys) => keys.map(k => (o && o[k] ? `${k}: ${o[k]}` : '')).filter(Boolean).join(' · ');
    function fileText(c, firm) {
        if (!c) return '';
        const out = [];
        const cl = c.client || {};
        out.push(`CASE FILE ${c.caseNumber || c.id} — ${cl.name} · ${c.caseType} · status: ${c.phase}`);
        out.push(`Client: ${pick(cl, ['name', 'phone', 'email', 'dob', 'address'])}${cl.ssn ? ' · SSN on file (masked)' : ''}`);
        if (cl.emergency) out.push(`Emergency contact (NOT authorized unless listed below): ${pick(cl.emergency, ['name', 'phone', 'relationship'])}`);
        if (c.reception && c.reception.verify) out.push(`Verification and who is authorized: ${c.reception.verify}`);
        if (c.critical) out.push(`⚠ Critical note: ${c.critical}`);
        out.push(`Date of loss: ${c.dateOfLoss} · SOL: ${c.sol || '—'} · Attorney: ${c.attorney} · Case manager: ${c.caseManager || 'not assigned yet'}`);
        if (c.narrative) out.push(`Narrative: ${c.narrative}`);
        (c.facilities || []).forEach(f => out.push(`Provider: ${pick(f, ['name', 'specialty', 'phone', 'dates', 'status'])}`));
        (c.chrono || []).forEach(r => out.push(`Treatment at ${r.facility}: visits ${(r.dos || []).join(', ')}${r.next ? ` · NEXT VISIT ${r.next}` : ''}${r.notes ? ` · ${r.notes}` : ''}`));
        if (c.treatmentNotes) out.push(`Treatment notes: ${c.treatmentNotes}`);
        (c.bi || []).forEach(b => out.push(`At-fault (BI) insurance: ${pick(b, ['holder', 'carrier', 'claim', 'adjuster', 'liability', 'limits'])}`));
        (c.pipum || []).forEach(b => out.push(`${b.type || 'PIP / UM'}: ${pick(b, ['holder', 'carrier', 'claim', 'adjuster'])}`));
        if (c.pdClaim) out.push(`Property damage claim: ${pick(c.pdClaim, ['carrier', 'claim', 'adjuster', 'liability', 'rental', 'estimate', 'outcome', 'status', 'shop', 'notes'])}`);
        (c.liens || []).forEach(l => out.push(`Lien: ${pick(l, ['holder', 'type', 'amount', 'status', 'notes'])}`));
        (c.adr || []).forEach(a => out.push(`${a.type}: ${pick(a, ['status', 'date', 'time', 'where', 'attend', 'neutral', 'prep', 'notes'])}`));
        if (c.lit) out.push(`Litigation: ${Object.keys(c.lit).filter(k => typeof c.lit[k] === 'string').map(k => `${k}: ${c.lit[k]}`).join(' · ')}`);
        (c.docs || []).forEach(d => out.push(`Doc Hub (${d.cat}): ${d.summary}`));
        (c.notes || []).forEach(n => out.push(`Case note ${n.date} (${n.staff}): ${n.text}`));
        (c.tasks || []).forEach(t => out.push(`Task ${t.date} (${t.staff}): ${t.text}`));
        if (firm) out.push(`FIRM: ${firm.name} · main line ${firm.mainLine} · ${firm.hours} · ${firm.address}\nDirectory: ${(firm.directory || []).map(d => `${d.name} (${d.role}) ext ${d.ext}`).join(' · ')}`);
        return out.join('\n');
    }

    /* ---------- lookups ---------- */
    const find = (id) => THREADS.find(t => t.id === id) || null;
    const programOf = (id) => PROGRAMS.find(p => p.id === id) || null;
    const threadsIn = (program) => THREADS.filter(t => t.program === program);
    const rubricOf = (t) => (t && t.rubric) || RUBRIC;
    const courseOf = (t) => { const p = programOf(t && t.program); return p ? { program: p.course, line: LINE } : null; };
    // Where the conversation's AI use counts in the Portal's shared budget (functions/_ai.js GATEWAY_MODULES)
    const MODULES = { reception: 'reception', intake: 'intake', cm: 'cms', md: 'medsum', pd: 'pd', ea: 'ea-pa' };
    const aiModule = (t) => MODULES[t && t.program] || 'cms';
    // The Case Note's staff role for the program (app.js staffOptions)
    const ROLES = { reception: 'Receptionist / Front Desk', intake: 'Intake Specialist', cm: 'Case Manager', md: 'Demand Specialist', pd: 'PD Specialist', ea: 'Paralegal' };
    const roleOf = (t) => ROLES[t && t.program] || 'Case Manager';
    // Who is texting, with the number they text from (the client's own mobile on file when the conversation doesn't say)
    function senderOf(t, c) {
        const cl = (c && c.client) || {};
        if (t.from) return { name: t.from.name, role: t.from.role, number: t.from.number || cl.phone || '', client: false };
        return { name: cl.name || 'The client', role: 'Client', number: cl.phone || '', client: true };
    }
    // Whose number this is on the file: the client, the emergency contact, or another contact the file lists (an
    // authorized relative). CasePeer files an inbound text on the contact whose number it is; a number the file
    // doesn't have shows as unknown, and noticing that is part of the exercise. → { on: bool, who: label }
    const digitsOf = (n) => String(n || '').replace(/\D/g, '').slice(-10);
    function numberOnFile(number, c) {
        const d = digitsOf(number);
        if (d.length < 10 || !c) return { on: false, who: '' };
        const cl = c.client || {};
        if (digitsOf(cl.phone) === d) return { on: true, who: `${cl.name} (client)` };
        if (cl.emergency && digitsOf(cl.emergency.phone) === d) return { on: true, who: `${cl.emergency.name} (emergency contact)` };
        const phones = JSON.stringify(c).match(/\(\d{3}\)\s?\d{3}-\d{4}/g) || [];
        return phones.some(p => digitsOf(p) === d) ? { on: true, who: 'a contact on this file' } : { on: false, who: '' };
    }

    /* ---------- the texter ---------- */
    function texterPrompt(t, c, firm) {
        const s = senderOf(t, c), gives = t.gives ? Object.keys(t.gives).map(k => `${k}: ${t.gives[k]}`).join('; ') : '';
        return [
            `You are role-playing a person texting a personal-injury law firm, ${firm ? firm.name : 'the firm'}, by SMS. You are ${s.name} (${s.role}), texting from ${s.number || 'your phone'}.`,
            `Write ONLY your next text message: 1 to 3 short sentences, the way a real person texts (casual, the occasional lowercase or missing punctuation is fine; no emoji unless it fits you; never more than 300 characters). Never write the firm's side, never narrate, never use quotation marks around your message.`,
            `Stay in character. You know only what your character would know. Never say you are an AI or a simulation.`,
            `YOUR SCRIPT: ${t.hidden}`,
            gives ? `If asked to verify who you are, answer only with: ${gives}.` : (s.client ? 'If asked to verify who you are, answer with your details exactly as the case file has them (your full name, date of birth, address on file). Never give your SSN by text; if asked for it, say you would rather not text that.' : ''),
            `When your question is answered or you have been told clearly what happens next and by whom, send a short closing text and then write [END] on its own. If the firm keeps texting after you clearly ended, or after you said STOP, react as your script says.`,
            `The firm's texting policy (you don't recite it, but a real client would react naturally if the firm breaks it):\n- ${SMS_POLICY.join('\n- ')}`,
            `THE CASE FILE (the firm's record; you know what a person in your role would know about it):\n${fileText(c, firm)}`
        ].filter(Boolean).join('\n\n');
    }

    /* ---------- the grader ---------- */
    const GRADE_SYSTEM = 'You are a strict but fair quality reviewer at a personal-injury law firm. You grade a trainee\'s text-message conversation with a client or caller against the firm\'s texting policy, the case file and the conversation\'s goals. You only judge what the trainee actually wrote. Answer with JSON only.';
    function gradePrompt(t, o) {
        const rubric = rubricOf(t);
        return [
            `CONVERSATION: "${t.title}" (${(programOf(t.program) || {}).label || t.program}). The trainee works for the firm and answers the texts.`,
            `GOALS (grade each as met or not, with a one-line note):\n${t.goals.map((g, i) => `${i + 1}. ${g}`).join('\n')}`,
            `THE FIRM'S TEXTING POLICY:\n- ${SMS_POLICY.join('\n- ')}`,
            `SCORECARD (rate each metric 0-5: 5 excellent, 3 acceptable, 0 missing or harmful):\n${rubric.map(r => `- ${r.metric}: ${r.what}`).join('\n')}`,
            `THE CASE FILE:\n${fileText(o.file, o.firm)}`,
            `THE TEXT CONVERSATION (${o.secs ? `${Math.round(o.secs / 60)} min` : 'time not recorded'}):\n${o.transcript}`,
            `THE TRAINEE'S CASE NOTE:\n${o.note ? o.note : '(none written)'}`,
            `Answer with this JSON and nothing else:
{"scores":[${rubric.map(r => `{"metric":"${r.metric}","score":0-5,"feedback":"one sentence"}`).join(',')}],
 "goals":[{"goal":"<the goal>","met":true|false,"note":"one line"}],
 "verdict":"one or two sentences on the conversation as a whole",
 "strengths":["up to 3"],"improve":["up to 3, concrete"],
 "betterReply":"one text message the trainee could have sent at the weakest point, in the firm's voice"}`
        ].join('\n\n');
    }
    const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n);
    // The grader's JSON → { score, verdict, scorecard, goals, strengths, improve, betterReply, capped }; null when unreadable.
    function parseGrade(text, t) {
        let j = null;
        const s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
        try { j = JSON.parse(a >= 0 && b > a ? s.slice(a, b + 1) : s); } catch (e) { return null; }
        if (!j || !Array.isArray(j.scores)) return null;
        const rubric = rubricOf(t);
        const rows = rubric.map(r => {
            const hit = j.scores.find(x => x && String(x.metric || '').toLowerCase() === r.metric.toLowerCase()) || {};
            const v = Math.max(0, Math.min(5, Math.round(Number(hit.score)) || 0));
            return { metric: r.metric, weight: r.weight, score: v, feedback: clip(hit.feedback, 300) };
        });
        const w = rows.reduce((x, r) => x + r.weight, 0), avg = rows.reduce((x, r) => x + r.weight * r.score, 0) / w;
        const goals = t.goals.map((g, i) => {
            const hit = (Array.isArray(j.goals) ? j.goals : [])[i] || {};
            return { goal: g, met: hit.met === true || hit.met === 'true', note: clip(hit.note, 300) };
        });
        let score = Math.round(avg / 5 * 100);
        const missed = (t.critical || []).filter(i => goals[i] && !goals[i].met);
        const capped = missed.length > 0 && score > 59;
        if (capped) score = 59;
        const list = (x) => (Array.isArray(x) ? x : []).filter(Boolean).slice(0, 3).map(v => clip(v, 300));
        return {
            score, capped, criticalMissed: missed.map(i => t.goals[i]),
            scorecard: { title: 'Client Messaging scorecard', outOf: 5, rows, average: Math.round(avg * 10) / 10, pct: Math.round(avg / 5 * 100) },
            goals, verdict: clip(j.verdict, 400), strengths: list(j.strengths), improve: list(j.improve), betterReply: clip(j.betterReply, 400)
        };
    }

    const API = { PROGRAMS, LINE, SMS_POLICY, TEMPLATES, RUBRIC, THREADS, find, programOf, threadsIn, rubricOf, courseOf, aiModule, roleOf, senderOf, numberOnFile,
        fileText, texterPrompt, GRADE_SYSTEM, gradePrompt, parseGrade };
    if (typeof window !== 'undefined') window.MESSAGE_PACKS = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
