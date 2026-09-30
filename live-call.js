/* =========================================================
   LSH CMS — LIVE CALL (voice for the Front Desk Drill)
   ---------------------------------------------------------
   A real-time phone call with a caller played by Gemini Live:
   the trainee talks into the microphone, the caller answers out
   loud in a natural voice, and either one can interrupt the
   other, like a real call. Both sides are transcribed as they
   speak.

   /api/live-call (functions/api/live-call.js) gives a single-use
   token with the caller's script locked in; the browser then
   talks straight to Google over a WebSocket. The microphone is
   sent as 16-bit PCM at the device's own rate (Gemini resamples),
   and the caller's audio comes back as 24 kHz PCM, queued so it
   plays without gaps and dropped at once when the trainee
   interrupts.

   LiveCall.start({ callId, onState, onLine, onError })
     onState(state)         connecting · live · ended
     onLine(role, text, id) role 'you' | 'caller'; the same id is
                            sent again as a line grows
     onError(message, code) the call couldn't start or dropped
   LiveCall.stop() · LiveCall.setMuted(bool) · LiveCall.sendText(text)
   ========================================================= */
(function () {
    'use strict';
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const WORKLET = `class LshMic extends AudioWorkletProcessor {
        constructor() { super(); this.size = Math.round(sampleRate / 10); this.buf = new Int16Array(this.size); this.n = 0; }
        process(inputs) {
            const ch = inputs[0] && inputs[0][0];
            if (ch) for (let i = 0; i < ch.length; i++) {
                const s = Math.max(-1, Math.min(1, ch[i]));
                this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
                if (this.n === this.size) { this.port.postMessage(this.buf.buffer.slice(0)); this.n = 0; }
            }
            return true;
        }
    }
    registerProcessor('lsh-mic', LshMic);`;

    function b64FromBuffer(buf) {
        const bytes = new Uint8Array(buf); let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(s);
    }
    function bufferFromB64(b64) {
        const s = atob(b64), out = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
        return out.buffer;
    }

    let C = null;   // the call in progress

    function supported() {
        return !!(Ctx && window.WebSocket && window.AudioWorkletNode && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    async function start(opts) {
        stop(true); stopRing();
        const call = C = { opts, ws: null, ctx: null, mic: null, node: null, src: null, muted: false, ended: false,
            playing: [], playAt: 0, line: null, lineSeq: 0, heard: false, kick: null };
        const state = (s) => { if (C === call && opts.onState) opts.onState(s); };
        const fail = (msg, code) => { if (C !== call || call.ended) return; stop(true); if (opts.onError) opts.onError(msg, code || ''); };
        state('connecting');
        try {
            // Made inside the click that answered the call, so the browser lets it play.
            call.ctx = new Ctx();
            if (call.ctx.state === 'suspended') call.ctx.resume().catch(() => {});
            call.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
        } catch (e) {
            return fail(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
                ? 'The microphone is blocked. Allow it in the address bar (🔒 → Microphone), then try again.'
                : 'No microphone was found. Plug in a headset, then try again.', 'MIC');
        }
        if (C !== call) return;
        let attempt = 0, attempts = 1;
        while (attempt < attempts && C === call) {
            let t;
            try {
                const res = await fetch('/api/live-call', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: opts.callId, attempt }) });
                t = await res.json().catch(() => ({}));
                if (!res.ok || !t.success) return fail(t.error || `Live voice couldn't start (error ${res.status}).`, t.code || 'TOKEN');
            } catch (e) { return fail('Live voice couldn\'t connect. Check your internet connection.', 'NETWORK'); }
            if (C !== call) return;
            attempts = t.attempts || 1;
            const ok = await openSocket(call, t);
            if (ok === true) return;          // the call is live
            if (C !== call || call.ended) return;
            attempt++;
            if (attempt >= attempts) return fail('The voice service didn\'t accept the call' + (ok ? ` (${ok})` : '') + '.', 'SOCKET');
        }
    }

    // Resolves true once the session is set up, or the close reason if it never was.
    function openSocket(call, t) {
        return new Promise((resolve) => {
            let ready = false;
            const ws = new WebSocket(t.url + '?access_token=' + encodeURIComponent(t.token));
            call.ws = ws;
            ws.onopen = () => {
                // The token already holds the whole setup (caller, voice, transcripts); this names the model.
                ws.send(JSON.stringify({ setup: { model: 'models/' + t.model } }));
            };
            ws.onmessage = async (ev) => {
                let msg;
                try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text()); } catch (e) { return; }
                if (C !== call) return;
                if (msg.setupComplete && !ready) { ready = true; onReady(call); resolve(true); return; }
                handle(call, msg);
            };
            ws.onerror = () => {};
            ws.onclose = (ev) => {
                if (C !== call) return;
                if (!ready) { call.ws = null; return resolve(ev.reason || `code ${ev.code}`); }
                if (!call.ended) {
                    const why = ev.code === 1000 ? '' : ev.reason || '';
                    stop(true);
                    if (/quota|resource.?exhausted|rate/i.test(why)) call.opts.onError && call.opts.onError('The voice service is busy. The call ended; try the next one, or run it as text.', 'DROPPED');
                    else if (ev.code !== 1000) call.opts.onError && call.opts.onError('The call dropped' + (why ? ` (${why})` : '') + '.', 'DROPPED');
                    else call.opts.onState && call.opts.onState('ended');
                }
            };
        });
    }

    async function onReady(call) {
        const opts = call.opts;
        try {
            const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
            await call.ctx.audioWorklet.addModule(url);
            URL.revokeObjectURL(url);
            if (C !== call) return;
            call.src = call.ctx.createMediaStreamSource(call.mic);
            call.node = new AudioWorkletNode(call.ctx, 'lsh-mic');
            const rate = call.ctx.sampleRate;
            call.node.port.onmessage = (e) => {
                if (C !== call || call.muted || !call.ws || call.ws.readyState !== 1) return;
                call.ws.send(JSON.stringify({ realtimeInput: { audio: { data: b64FromBuffer(e.data), mimeType: 'audio/pcm;rate=' + rate } } }));
            };
            call.src.connect(call.node);
            // A worklet with no output still has to be pulled; a silent gain keeps it running.
            const sink = call.ctx.createGain(); sink.gain.value = 0; call.node.connect(sink); sink.connect(call.ctx.destination);
        } catch (e) {
            if (opts.onError) opts.onError('This browser can\'t send microphone audio to the call. Use Chrome or Edge.', 'MIC');
            return stop(true);
        }
        if (opts.onState) opts.onState('live');
        // Silence after picking up: the caller says "Hello?" as a caller would.
        call.kick = setTimeout(() => { if (C === call && !call.heard) sendText('(The receptionist picked up but hasn\'t said anything yet.)', true); }, 4500);
    }

    function handle(call, msg) {
        const sc = msg.serverContent;
        if (sc) {
            if (sc.interrupted) flush(call);
            const parts = (sc.modelTurn && sc.modelTurn.parts) || [];
            parts.forEach(p => { if (p.inlineData && p.inlineData.data && /audio/.test(p.inlineData.mimeType || 'audio')) play(call, p.inlineData.data, p.inlineData.mimeType); });
            if (sc.inputTranscription && sc.inputTranscription.text) { call.heard = true; addText(call, 'you', sc.inputTranscription.text); }
            if (sc.outputTranscription && sc.outputTranscription.text) addText(call, 'caller', sc.outputTranscription.text);
            if (sc.turnComplete) call.line = null;
        }
    }

    function addText(call, role, text) {
        if (!call.line || call.line.role !== role) call.line = { role, text: '', id: role + (++call.lineSeq) };
        call.line.text = (call.line.text + text).replace(/\s+/g, ' ').replace(/^\s+/, '');
        if (call.opts.onLine) call.opts.onLine(role, call.line.text, call.line.id);
    }

    function play(call, b64, mime) {
        const ctx = call.ctx; if (!ctx || ctx.state === 'closed') return;
        const rate = Number((/rate=(\d+)/.exec(mime || '') || [])[1]) || 24000;
        const pcm = new Int16Array(bufferFromB64(b64));
        if (!pcm.length) return;
        const buf = ctx.createBuffer(1, pcm.length, rate), ch = buf.getChannelData(0);
        for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
        const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
        const at = Math.max(ctx.currentTime + 0.03, call.playAt);
        src.start(at); call.playAt = at + buf.duration;
        call.playing.push(src);
        src.onended = () => { call.playing = call.playing.filter(s => s !== src); };
    }
    // The trainee talked over the caller: stop the caller's voice at once.
    function flush(call) {
        call.playing.forEach(s => { try { s.stop(); } catch (e) {} });
        call.playing = []; call.playAt = 0;
    }

    function stop(silent) {
        const call = C; if (!call) return;
        call.ended = true; C = null;
        clearTimeout(call.kick);
        try { if (call.ws && call.ws.readyState <= 1) call.ws.close(1000); } catch (e) {}
        flush(call);
        try { if (call.src) call.src.disconnect(); } catch (e) {}
        try { if (call.node) { call.node.port.onmessage = null; call.node.disconnect(); } } catch (e) {}
        if (call.mic) call.mic.getTracks().forEach(tr => { try { tr.stop(); } catch (e) {} });
        try { if (call.ctx && call.ctx.state !== 'closed') call.ctx.close().catch(() => {}); } catch (e) {}
        if (!silent && call.opts.onState) call.opts.onState('ended');
    }

    function setMuted(m) { if (C) C.muted = !!m; return C ? C.muted : false; }
    // Text in place of speech (a typed question, or the nudge after a silent pickup).
    function sendText(text, hidden) {
        const call = C; if (!call || !call.ws || call.ws.readyState !== 1) return false;
        call.ws.send(JSON.stringify({ realtimeInput: { text: String(text) } }));
        if (!hidden) { call.heard = true; call.line = null; addText(call, 'you', String(text)); call.line = null; }
        return true;
    }
    // Ringing: the US ringtone (440 + 480 Hz), a few rings; answering stops it.
    let ringCtx = null;
    function stopRing() { if (ringCtx) { try { ringCtx.close().catch(() => {}); } catch (e) {} ringCtx = null; } }
    function ring(times) {
        stopRing();
        try {
            const ctx = ringCtx = new Ctx();
            const burst = (t) => [440, 480].forEach(f => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f; g.gain.value = 0.05; o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 1.1); });
            for (let i = 0; i < (times || 2); i++) burst(i * 2.2);
            setTimeout(() => { if (ringCtx === ctx) stopRing(); }, (times || 2) * 2200 + 200);
        } catch (e) { ringCtx = null; }
    }

    window.LiveCall = { supported, start, stop: () => { stopRing(); stop(false); }, setMuted, sendText, ring, stopRing, active: () => !!C };
})();
