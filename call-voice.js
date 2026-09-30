/* =========================================================
   LSH CMS — CALL VOICE (the standard voice of the Front Desk practice calls)
   ---------------------------------------------------------
   Used when a practice call isn't on live voice (live-call.js): live voice
   is off, not set up, busy, or this browser can't do it. Same handling as
   the Training Portal's Call Simulator (simulators/call.html) and the EA/PA
   course's calls:
     - speak(): the caller's line out loud, one voice per caller (their gender
       and name pick it), in sentence-sized chunks (Chrome drops long ones),
       with a safety timer for browsers that never report the end of speech
       and a flag when the computer has no working voice;
     - listen(): the trainee's reply by microphone (Chrome/Edge), with interim
       text as they speak; hands-free is the page's choice (listen after the
       caller finishes, send when they pause).
   Typing always works; nothing here is required for a call to go on.
   ========================================================= */
(function () {
    'use strict';
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    const CAN_SPEAK = 'speechSynthesis' in window;
    let speakToken = null, rec = null, utts = [];

    // Inside the click that starts the call, so the browser lets the caller speak later.
    function unlock() {
        if (!CAN_SPEAK) return;
        try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); speechSynthesis.resume(); } catch (e) {}
    }
    function pickVoice(gender, name) {
        const vs = (CAN_SPEAK ? speechSynthesis.getVoices() : []).filter(v => /^en[-_]/i.test(v.lang)); if (!vs.length) return null;
        const f = /female|samantha|victoria|zira|aria|jenny|susan|karen|moira|tessa|fiona|libby|sonia|emma|ava|allison|google us english/i, m = /\bmale|daniel|david|guy|alex|fred|mark|george|ryan|thomas|arthur|eric|brian|christopher|google uk english male/i;
        const g = gender === 'f' ? vs.filter(v => f.test(v.name) && !/\bmale/i.test(v.name)) : vs.filter(v => m.test(v.name));
        const pool = g.length ? g : vs; let h = 0; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        return pool[h % pool.length];
    }
    function stopSpeaking() { speakToken = null; if (CAN_SPEAK) try { speechSynthesis.cancel(); } catch (e) {} }
    // opts: { gender, name, onDone(), onNoVoice() }. Stage directions in (parentheses) aren't read out.
    function speak(text, opts) {
        opts = opts || {};
        const done = () => { if (speakToken === token) { speakToken = null; if (opts.onDone) opts.onDone(); } };
        const spoken = String(text || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
        const token = {}; speakToken = token;
        if (!CAN_SPEAK || !spoken) { setTimeout(done, 0); return; }
        const chunks = (spoken.match(/[^.!?]+[.!?]*["”]?\s*/g) || [spoken]).map(t => t.trim()).filter(Boolean);
        const wasBusy = speechSynthesis.speaking || speechSynthesis.pending;
        if (wasBusy) speechSynthesis.cancel();
        let started = false;
        setTimeout(() => {
            if (speakToken !== token) return;
            try { speechSynthesis.resume(); } catch (e) {}
            const v = pickVoice(opts.gender, opts.name);
            utts = chunks.map((t, i) => {   // kept so the browser can't garbage-collect them mid-speech
                const u = new SpeechSynthesisUtterance(t); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US'; u.rate = 1.02;
                u.onstart = () => { started = true; };
                if (i === chunks.length - 1) u.onend = done;
                u.onerror = (ev) => { if (ev && ev.error === 'interrupted') return; if (opts.onNoVoice) opts.onNoVoice(); done(); };
                speechSynthesis.speak(u); return u;
            });
            // Nothing started within 2.5 s: this computer has no working voice.
            setTimeout(() => { if (speakToken === token && !started && !speechSynthesis.speaking) { speechSynthesis.cancel(); if (opts.onNoVoice) opts.onNoVoice(); done(); } }, 2500);
        }, wasBusy ? 150 : 30);
        // Safety net for browsers that never fire onend.
        setTimeout(() => { if (speakToken === token) { speechSynthesis.cancel(); done(); } }, 4000 + spoken.split(/\s+/).length * 480);
    }
    // handlers: { onText(text so far), onEnd(final text), onBlocked() }
    function listen(handlers) {
        if (!SR) return false;
        stopSpeaking(); stopListening();
        const r = new SR(); r.lang = 'en-US'; r.interimResults = true; r.continuous = false;
        let finalText = '';
        r.onresult = (e) => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += t; else interim += t; } if (handlers.onText) handlers.onText((finalText + ' ' + interim).trim()); };
        r.onerror = (e) => { if ((e.error === 'not-allowed' || e.error === 'service-not-allowed') && handlers.onBlocked) handlers.onBlocked(); };
        r.onend = () => { if (rec !== r) return; rec = null; if (handlers.onEnd) handlers.onEnd(finalText.trim()); };
        rec = r;
        try { r.start(); } catch (e) { rec = null; return false; }
        return true;
    }
    // send=true: stop and let onEnd deliver what was heard; otherwise drop it.
    function stopListening(send) {
        const r = rec; if (!r) return;
        if (!send) rec = null;
        try { send ? r.stop() : r.abort(); } catch (e) {}
    }
    function stopAll() { stopSpeaking(); stopListening(); }

    window.CallVoice = { canSpeak: CAN_SPEAK, canListen: !!SR, unlock, speak, stopSpeaking, listen, stopListening, isListening: () => !!rec, stopAll };
    if (CAN_SPEAK) try { speechSynthesis.getVoices(); } catch (e) {}
    window.addEventListener('pagehide', stopAll);
})();
