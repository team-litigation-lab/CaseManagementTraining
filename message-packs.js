/* 💬 Client messaging: the clients' scripted texts.
   -----------------------------------------------------------------------------
   The client's side of every Messages thread, the way call-packs.js holds the
   callers' side of every call. Nothing here leaves the CMS: the clients are
   fictional and no message is ever sent anywhere.

   A pack is one case's thread. The client opens it; each of their texts carries
   what a good reply does (`goals`) and the coaching note the trainee reads after
   they answer (`tip`), and `next` is what the client says back once they have an
   answer. A text with no `next` ends the thread.

   Which pack a case gets: the first pack whose `cases` holds the case's Training
   Library id (MC-01 …) or its client's name; otherwise GENERIC, whose texts work
   on any personal-injury file and name the client from the open case.

   Add a thread by adding a pack here. `.github/scripts/message-packs.cjs` checks
   every pack: unique ids, a `start` that exists, every `next` reachable, and no
   text without goals.
   The page reads it as window.MESSAGE_PACKS. */
(function () {
    'use strict';

    const PACKS = [
        {
            id: 'mc01-maria-appointments',
            cases: ['MC-01', 'Maria Santos'],
            client: 'Maria Santos',
            about: 'Treating. Chiropractic and physical therapy twice a week; she misses visits and asks the firm about money.',
            start: 'm1',
            messages: {
                m1: {
                    body: "Hi, it's Maria. I'm so sorry — I had to miss my chiro visit yesterday, my son was sick. Is that going to mess up my case?",
                    goals: [
                        'Answers her question without giving legal advice or predicting the case',
                        'Explains plainly why gaps in treatment hurt a claim',
                        'Asks her to call the clinic and reschedule, and to tell you the new date',
                        'Offers to help if transport or childcare is the real problem'
                    ],
                    tip: 'A gap in treatment is the single most common thing a case manager has to head off. Say why it matters, fix the next visit, and log it as a Case Note — never say the case is "fine" or "ruined".',
                    next: 'm2'
                },
                m2: {
                    body: "Ok I rebooked for Thursday 2pm. One more thing — the chiro office keeps sending me bills. Do I have to pay those?",
                    goals: [
                        'Thanks her and confirms the new date is being noted on the file',
                        'Explains the firm handles provider bills and liens; she should forward bills, not pay them herself',
                        'Does not promise who will pay what, or quote an amount',
                        'Tells her how to send the bills in'
                    ],
                    tip: 'Billing questions are where trainees over-promise. "Send them to us and we will handle it with your attorney" is the whole answer. Any number you quote is a promise you cannot keep.',
                    next: 'm3'
                },
                m3: {
                    body: "Thank you!! You're the only one who answers me. Is my settlement going to be enough to cover my car?",
                    goals: [
                        'Stays warm but does not value the case or predict a settlement',
                        'Routes the question to the attorney, and says when she will hear back',
                        'Keeps the property damage claim separate from the injury claim',
                        'Closes the thread politely'
                    ],
                    tip: 'Case value is the attorney\'s to discuss. Warmth is not the same as an answer: "I can\'t give you a number, but I will have the attorney call you Thursday" is both kind and correct.'
                }
            }
        },
        {
            id: 'mc02-derek-work',
            cases: ['MC-02', 'Derek Thompson'],
            client: 'Derek Thompson',
            about: 'Out of work on restrictions. He is anxious about money and wants the firm to move faster.',
            start: 'd1',
            messages: {
                d1: {
                    body: "My boss is asking for a note saying when I can come back. I don't have anything from the doctor. Can you send him something?",
                    goals: [
                        'Does not write or send a work status himself: it comes from the treating doctor',
                        'Offers to request the work status / restrictions from the provider',
                        'Asks for the employer\'s name and where the note should go',
                        'Gives him a realistic turnaround'
                    ],
                    tip: 'Only the doctor says when someone can work. The case manager\'s job is to request the record and route it — writing it yourself is practising medicine and it sinks the wage claim.',
                    next: 'd2'
                },
                d2: {
                    body: "Ok. Honestly man I'm 2 months behind on rent. How long is this whole thing going to take?",
                    goals: [
                        'Acknowledges the pressure without brushing it off',
                        'Explains the stage the case is at, and what has to happen before a demand goes out',
                        'Gives no date and no dollar figure',
                        'Says what will happen next and when he will hear from the firm'
                    ],
                    tip: 'Never answer "how long" with a date. Answer with the next step and a time you control: "Your records are requested; once they are in, the demand goes out. I will update you Friday either way."'
                }
            }
        },
        {
            id: 'cm-johndoe-apex',
            cases: ['John Doe'],
            client: 'John Doe',
            about: 'The Case Management program\'s file (John Doe v. Apex Delivery Services). Post-surgery, demand sent, the carrier has countered low.',
            start: 'j1',
            messages: {
                j1: {
                    body: "The insurance adjuster from Aggressive Casualty just called my cell. He wants to record a statement about my back. Should I do it?",
                    goals: [
                        'Tells him not to give a recorded statement to the defendant\'s carrier',
                        'Tells him to refer any further calls to the firm',
                        'Does not give legal advice beyond that: the attorney is told at once',
                        'Logs the contact on the case and escalates it'
                    ],
                    tip: 'A represented client giving the defence a recorded statement is an emergency, not a message. Stop it, route every further call to the firm, and tell the attorney the same day.',
                    next: 'j2'
                },
                j2: {
                    body: "Got it, I didn't say anything to him. Also my wife Jane was in the car too and her neck still hurts. Can you guys take her case?",
                    goals: [
                        'Does not sign her up or promise representation',
                        'Recognises a possible second claimant and a conflict check',
                        'Takes her details and routes it to intake and the attorney',
                        'Tells John what happens next'
                    ],
                    tip: 'A passenger in the same car is a conflict check before anything else. Take the information, promise nothing, and hand it to intake.'
                }
            }
        }
    ];

    // Any personal-injury file with no pack of its own. {client} is the open case's client.
    const GENERIC = {
        id: 'generic-pi',
        cases: [],
        client: '',
        about: 'Works on any file: a client checking in, a change of address and a records question.',
        start: 'g1',
        messages: {
            g1: {
                body: "Hi, this is {client}. I haven't heard anything in a few weeks. Is there any news on my case?",
                goals: [
                    'Greets the client by name and identifies the firm and herself or himself',
                    'Verifies who is texting before giving any case information',
                    'Gives the real status of the file in plain words',
                    'Says what happens next and when they will hear again'
                ],
                tip: 'A status text is still a status update: verify first, then say where the file actually stands and give a date for the next contact. "Still pending" is not an update.',
                next: 'g2'
            },
            g2: {
                body: "Thanks. Also I moved last week — new address is 88 Pearl St, Apt 3. And my new number is the one I'm texting from.",
                goals: [
                    'Confirms the new address and phone back to them, spelled out',
                    'Says the file is being updated (and the providers and carrier told where it matters)',
                    'Logs it as a Case Note'
                ],
                tip: 'Read changed details back before you save them. A wrong address on a file is a missed settlement cheque.',
                next: 'g3'
            },
            g3: {
                body: "One more — the hospital called me about a bill. Do I send it to you?",
                goals: [
                    'Yes: bills and liens come to the firm, the client does not negotiate them',
                    'Tells them how to send it',
                    'Does not promise who pays, or how much'
                ],
                tip: 'Bills in, promises out. Take the document, never the commitment.'
            }
        }
    };

    const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();

    // The pack for the open case: by Training Library id, or by the client's name; otherwise the generic one.
    function packFor(openCase) {
        const ref = norm(openCase && openCase.ref), label = norm(openCase && openCase.label);
        const hit = PACKS.find(p => p.cases.some(c => norm(c) === ref || (label && norm(c) === label)));
        return hit || GENERIC;
    }
    // One scripted text, with {client} filled in from the open case.
    function message(pack, id, openCase) {
        const m = pack && pack.messages[id];
        if (!m) return null;
        const who = (pack.client || (openCase && openCase.label) || 'your client').split('\n')[0].trim();
        return Object.assign({}, m, { id, packId: pack.id, sender: who, body: String(m.body).replace(/\{client\}/g, who) });
    }

    window.MESSAGE_PACKS = { packs: PACKS, generic: GENERIC, packFor, message };
})();
