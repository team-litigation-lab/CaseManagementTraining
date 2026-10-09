/* =========================================================
           LSH CASE MANAGEMENT SYSTEM — CORE SCRIPT
           Consolidated, de-duplicated, and cleaned up.
           ========================================================= */

        /* =========================================================
           ACCESS GATE — single source of truth for whether case
           content is allowed to be rendered right now.

           IMPORTANT / HONEST LIMITATION: this app stores case data in
           the browser's localStorage and runs entirely client-side.
           No amount of JS/CSS here can make content truly inaccessible
           to someone with devtools/console access — they can always
           read localStorage directly. What this gate DOES fix is the
           specific bypass of "hide an overlay via the Elements panel
           and the full page is still sitting in the DOM underneath."
           Now, when locked/logged-out, the sensitive DOM content is
           never populated in the first place — so removing the
           overlay just reveals an empty shell instead of real data.
           ========================================================= */
        function hasAuthorizedAccess() {
            return !!getRealSession();
        }
        function blankCaseEditorContent() {
            _editorGen++;
            // Wipes any case content currently sitting in the DOM so a
            // hidden/removed overlay can't expose it.
            //
            // NOTE: 'pane-police' is intentionally NOT in this list. Unlike
            // the other ids below (which are empty-by-default containers
            // that dynamic add-row/add-card functions populate), pane-police
            // is a static card with its own hardcoded labels/layout baked
            // into the page HTML. Wiping its innerHTML doesn't just clear
            // entered values — it permanently destroys the Police Report
            // Details markup itself, and nothing ever rebuilds it, so the
            // whole section disappears for the rest of the session. The
            // contenteditable-clearing loop just below already blanks the
            // actual field VALUES inside pane-police, which is all that's
            // needed here.
            // Save any Notes/Tasks edits on a Training Library case before they're wiped.
            if (window.mockFlushUpdates) window.mockFlushUpdates();
            ['passenger-container','facility-container','chrono-container','fin-body','pip-um-container',
             'bi-container','doc-body','lit-body','lien-container','note-body','task-body'
            ].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
            document.querySelectorAll('[contenteditable="true"]').forEach(el => { el.innerHTML = ''; });
            // dropdowns back to their defaults too (e.g. Employment Status: N/A), so a new case doesn't inherit the last one's
            document.querySelectorAll('#capture-area select').forEach(sel => { const d = Array.from(sel.options).findIndex(o => o.defaultSelected); sel.selectedIndex = d < 0 ? 0 : d; });
            // ...and the big status words with them (a closed case's MEDIATION over a new case's Intake)
            const phaseSel = document.getElementById('phase-selector');
            if (phaseSel && document.getElementById('display-phase')) updatePhaseDisplay(phaseSel.value);
            applyKeyed(null);
            const nameField = document.getElementById('client-name-field');
            if (nameField) nameField.innerText = '';
            // Attorney / Case Manager are plain <input> fields (see
            // buildCaseContentPayload), so they're not swept up by the
            // contenteditable-clearing loop above — clear them explicitly
            // so this wipe covers them too.
            const attorneyField = document.getElementById('attorney-field');
            if (attorneyField) attorneyField.value = '';
            const caseManagerField = document.getElementById('case-manager-field');
            if (caseManagerField) caseManagerField.value = '';
            currentCaseId = null;
            currentCaseIsDraft = false;
            currentCaseCanEdit = true;
            // Wiping the editor also ends Training Library mode (training-library.js).
            if (window.mockReset) window.mockReset();
        }
        /* ---------- Overlay integrity watchdog ----------
           DevTools lets someone disable a single CSS declaration (e.g.
           uncheck "#auth-gate.open { display:flex }") without
           touching the element's class at all, so a MutationObserver on
           class/attributes won't see it. This polls the *computed*
           style instead and re-asserts it via an inline !important
           style, which devtools' checkbox toggle does not remove. */
        function enforceOverlayVisibility(id, shouldBeOpen) {
            const el = document.getElementById(id);
            if (!el) return;
            const wantDisplay = shouldBeOpen ? 'flex' : 'none';
            const computed = window.getComputedStyle(el).display;
            if (computed !== wantDisplay) {
                el.style.setProperty('display', wantDisplay, 'important');
            }
        }
        function runOverlayIntegrityCheck() {
            const session = getSession();
            const authorized = hasAuthorizedAccess();
            enforceOverlayVisibility('auth-gate', !session);
            if (!authorized) {
                blankCaseEditorContent();
                renderRepo(); // re-checks hasAuthorizedAccess() itself and keeps the sidebar blank
            }
        }
        setInterval(runOverlayIntegrityCheck, 750);

        /* ---------- Toast notifications + sound cues ---------- */
        let _audioCtx = null;
        function getAudioCtx() {
            if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            return _audioCtx;
        }
        function playNotificationSound(type) {
            try {
                const ctx = getAudioCtx();
                const now = ctx.currentTime;
                const patterns = {
                    success: [660, 880],
                    error: [300, 210],
                    info: [520, 660],
                    alert: [440, 330, 440],
                    // Ping needs to cut through and actually grab attention, so it's
                    // louder, longer, and uses its own back-and-forth two-tone
                    // pattern (repeated) rather than reusing any other cue.
                    ping: [988, 740, 988, 740, 988, 740]
                };
                const notes = patterns[type] || patterns.info;
                const isPing = type === 'ping';
                const peakGain = isPing ? 0.42 : 0.22;
                const noteSpacing = isPing ? 0.24 : 0.13;
                const noteLength = isPing ? 0.34 : 0.18;
                notes.forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    const t = now + i * noteSpacing;
                    gain.gain.setValueAtTime(0.0001, t);
                    gain.gain.exponentialRampToValueAtTime(peakGain, t + 0.015);
                    gain.gain.exponentialRampToValueAtTime(0.0001, t + noteLength);
                    osc.connect(gain).connect(ctx.destination);
                    osc.start(t);
                    osc.stop(t + noteLength + 0.02);
                });
            } catch (e) { console.warn('Audio playback unavailable:', e); }
        }
        function showToast(message, type, duration, subtitle) {
            type = type || 'info';
            duration = duration || 3500;
            let container = document.getElementById('toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toast-container';
                document.body.appendChild(container);
            }
            const toast = document.createElement('div');
            toast.className = 'toast ' + type;
            if (subtitle) {
                toast.innerHTML = '<div class="toast-main">' + escapeHtmlAttr(message) + '</div>' +
                    '<div class="toast-sub">' + escapeHtmlAttr(subtitle) + '</div>';
            } else {
                toast.textContent = message;
            }
            container.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('show'));
            playNotificationSound(type);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }

        let currentCaseId = null; // server-side case_repository row id (null = never saved)
        let _syncedSig = null; // fingerprint of the server's copy of the case in the editor (caseSig, autosave)
        // Which case the editor holds: changes whenever the editor is cleared or another case goes in (New, Close,
        // Discard, opening a case). A save still on its way when that happens belongs to the case it was sent for:
        // its answer doesn't attach that case's id to whatever the editor holds now.
        let _editorGen = 0;
        let currentCaseIsDraft = false; // true = loaded/created case has NO permanent Case ID yet
        let currentCaseCanEdit = true; // false when viewing a foreign case read-only (not owner/admin)
        let _emptyCaptureAreaTemplate = null; // pristine clone of #capture-area, captured once at load, used to render read-only previews of OTHER users' cases without touching the live editor
        const SESSION_KEY = 'LSH_SESSION_V1';
        // Heartbeats keep the session alive (the server allows 120 s between them) and show who's
        // online. Every 30 s, every 45 s in a background tab. Sparing on purpose: every /api/ request
        // counts toward Cloudflare's daily Functions requests, and the site stops answering when they
        // run out. A trainee's heartbeat waits at the server (up to HEARTBEAT_HOLD_S) for a trainer to
        // open 👁 Watch live, so the live view starts within a second or two at no extra request; while
        // watched, live-view.js sends the screen itself.
        const HEARTBEAT_INTERVAL_MS = 30000;
        const HEARTBEAT_HIDDEN_MS = 45000;
        const HEARTBEAT_HOLD_S = 29;
        const HEARTBEAT_GRACE_MS = 45000;   // "online" = a heartbeat in the last 90 s (twice this)
        const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes — adjust if needed
        const ANNOUNCE_KEY = 'LSH_ANNOUNCEMENT_V1';
        // Agency logo is hardcoded (no admin-editable/localStorage-backed
        // system anymore) — a corrupted/truncated localStorage value was
        // previously causing the logo to render as blank space; removing
        // that system entirely was the fix, not just patching one instance.
        const AGENCY_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAAX00lEQVR42u3de5DdZX3H8ffz/H7nfs7ekw0k2UACKBeBAQMiKKKg1YK21dpaetHWTqcdrK1jta3T1nY6rXVa205nerHtdIq1TKUqCuKll4gGRCEEUIhJgJgQNps1yd7O2T233/P0j99vb0Bhz9kLm93Pa2Zns5nsZvfs7/n8vs/zey4GwHv/Rufcb1trdwJFwAMGEVkrptt02Tn3gLX2Y8aYrxnv/Q3AHUC+2Wx67zGY5J+vIUFgsda2/onO4X2ky0dOc3GjNhhPEBpgEvgxE0XR/1prrwMiINALJbLmRUDgnNtlvPcTzWazEIah+fO//Hv2PPRdioU8zrk18ZNaG1CuVHjvL76LN1x3Dd57jFlA78Z7MIax73yWsUfuxlhlo5zOBYAlqlYonH0ZG978mxA1PUFYCYGiT8r9PXse5e6v/C893Z00o7URAGEQcGpklDdef21bXaba0EHGv/s1jE3pIpLT90YYBDTKIxjjk6vbGwPFcM7gAMVige7uLrq6SkRrJACCIMADmUy6veBMZwkL3Rgb6iqS0zkBCD3YTHHeXS5kzmi/c44oiogit2YCAAxRFOF9m6Oa3uNdhB6KyOndCoivY++e1TEQkfVbGOglEFEAiIgCQEQUACKiABARBYCIKABERAEgIgoAEVEAiIgCQEQUACKiABARBYCIKABERAEgIgoAEVEAiIgCQEQUACKiABARBYCIKABERAEgIgoAEVEAiIgCQEQUACKiABARBYCIKABERAEgIgoAEVEAiIgCQEQUACKiABBRAIiIAkBEFAAiogAQEQWAiCgAREQBICIKABFRAIiIAkBEFAAiogAQEQWAiCgAREQBICIKABFRAIiIAkBEFAAiogAQEQWAiCgAREQBICIKABFRAIiIAkBEFAAiogAQEQWAiCgAREQBICIKABFRAIiIAkBEFAAiogAQEQWAiAJARBQAIrLuhHoJXmoGzLM+fkEe/Jw/iygATqf2njRw78F7vG/O/Dn+2M02bP88n2cMxgaAwVibBIiNc8MvQyB4h2/x6xqTfE8rZeZ1a/FXYQMFgFrkyjZ8HzUhaoINMGGKTN92wmIvYccGwmI36f4dhMU+cA6TKWBSGXCO5vgwrlYmmhqj/Pg9RJOjNE4dxXuPb9bif5/KYGwQN4YlCgMTZrBBuOAQMIB3zfjnXClBiA1SLYeUa1SXJzQVAPKcxu8ivHcEmRKZTeeQHbiETP928tuvIN27taUv13vtL+GjBvUTR6j/8BCVA/dSeeLbNE4eIapOYLOl+A7cxl1x7t2xWRnlrFs+TWH7FXFjMeZFqwUTZpg6+hjP/Ov7aFZOYWxq+boqxuJqZTa86f30XvfeBf+8PmpiMwUO/dVPUB3ch03n120QKABWqNy32RIdl91E8WWvoXje1S/SmJ6vCzB/fMAEKTL9O8j076B00fVElRFGH7iD8vd3UR3cj5uawKazeBctqvwPSr1gA2ymsOBPyw1cgs0WYeKHEKSWr/0nwZru2YJNZVvoMXiMMRgTrPthFAXA8rV+fNTE1SbpvOyt9FxzM/ntO2cb+PTdyhieO/Bn5r17waDwSUMtdNP7uvfQc83PUD5wLyf/55NUnvw2wXQ10O6V7txMGLx4v97HP3ezvqJ3VO+a8/7/hQQbRv1/BcAy3vl9s0F643a6X/VOOi+7iSDfNTNYZaxdokGy5AmCCZKvHWHCDKULXk9uyysYe/AOTuz6JL4+CWF6tjGvVOWzgmErCoDV0fZtQDQ1QdeV76D/pg/HDR/wLsJYG5edy9TojAmTpwmOsGMDva//ZdKbzmHw0x/ENaYwqSwspksga44mAi3pqxkQVcsUzruK/hs/NHPXx/uZR3crcve1SUXgIkoXXMeZP/NxwlIffiEDeaIAkHZeSYurlimc8yo23/wJgkJ30tc0L02jm54v4B2lC9/A1vf8Hem+s/DNhkpmUQAscd2Pb9bJb7+CzT/7ifhu66OVnQzzAt8bPiK75UL63/o78Wi+98oAUQAsUQvDRzVsOk//jR8kLPWBi9rr6ydl+/QbzsXvFzuxxwTgIoovfw1dV74DVx2PxwtEAaCXYLE8JkhTvOA6ctsujQfZWp1imgzcTZft029YG783Nu5GeNf+5B5jAE/XzreT3nB2PHvQ6Ne/3uk2sNi7v49IdZzJxjd/YGYsoLXGP/183RBVTlE7/hSuPkVUOYVN5whynQTFHsKOPoJ8d/IpUevz2I0F1yTTv4Puq3+Woc99lLBjIz5y+jUqAKS9m6rB1WvkBi4i7Nw4EwqtNn43Nc7og1+gsv8bVA7twTeqROWTBIVeTCpLWOohs3EHxQuuo/jy15LqPrPdWgUDFM65knT/DppjxzFhZlFThkUBsF5bPx5PkCnQffXNGGOTwbUWAsBYaoP7OX7nx5g8tAfvmpggxIQZUr0D8YIa72iMDNIYGaT8xP3kH/kKHRffQPerb279W7YB3sUDgqULXs+p3Z+KFxtpVbHGAKQNLsLmO0kV+2busa2IJkc49p+/R3n/bjA2vhsnQTIzndbEK/JMKoPxnslDD3D8ix/j5K5/mh07aKnTEgdUx0XXE5Z648eCmhugAJBWC4AAV6vEJXnvlpmqYMGlP3Difz7J5NOPxgtnpv/e+zlB4mcbuXPxoGCQxjvHyV2fpHJgd9K3d61844Anu/UVhIVuzQxUAEj7FYAjyJXifv+CH9N5MJZoapzJHzwUdx3wC6sekjAwYZqoVuHkN26lOfHDeOBxoSFgDDgXh04QLm61oCgA1vUYgIsICr3JI7qFrUTzSUOdfOpB6sNPJmMHLf7fydTiyUMPUBv8fhIrLXyR5NsM8j3xklpRAEjrvHeYMNV6AwSiiRMQtTtbMJ57EJVP0Rg5FrfpVh4LJpOUSq+4HhOm1/2uOOuZngIsLgLiUfTp8nyBd2+AaGoMHzUgCNpqgN5F2HSekQc+S3NsiOdsLvrsgmTux95DmKJy4H7wRtOCFQDSZj8AGvXZvvWCeg7xHT9/9uXYfCfR5CgmSLUeAt5hUlmqRx+jeviROa18oX0ADzbEBLoEFACyiE5UizPybDxekN64nbC0gagysrgKxIbQbiP2rYSGaAxAntX4LG5yNLmzL7SONmA8Qb6LDW+8JR4UdNEinsX7eduKt/Smxq8A0EvQbrvzcQk+uA9Xn5yZwLPgl917ShddT/9bPxyv/ku2CtcCHVEAnBbt32PCNLXjTxFVxtoYPoj74b2vfQ9bfu6vSXWdgZsax0f1+MmCDq0QjQGs9i5AQLN8Et+ozelUt17Kl15xA6nuMxi9/zNM7LuH2vCTBJnCzFbc8dwBleuiAFhVXQAwuMYUY3vvZMObbmmjfJ95Lkd2y0VsesdFdB5+hMoT98dv3/9G/K/S+eQYsKRy0OCdKABWg3gP/PFHv0Lvte+OT+Rp8+tMrw/IbbuE3LZL6L7qp6keO0Dt2H5G7vt36icOJ1kxuybAGLOkx4AteUBOb2CyXN+fnz79SGGoAHipugFBmvqJw5z4779n442/tcADNJ4vA5I1AUkQBPlOCjt2Utixk67L30ZjbIjxh7/E2MNfxtUq8RqAqIlN5zGpTBwEL3lXIa5obJhm2/tuW5mFRsmpS/MrKlEArPDdrnxgN53P3Ehm8/mt7wswtwHNPT04WThkcyUyuRIbfuQ36HvTrydVwW3Uhg9RH36SxqmnMek8NpPHYFfFAp+w0KPrQgGwXqqAkNrxJxj+8l+y4S2/SfbM8+fsvNvmXek5R4bFx4AZY8meeT5nvOOPAKgc2E35wLeYOryXqUN7ca6BzXUsb+ktCgB5dgWfonzgm3g8m972EdIbzgJc8mBgKUrTOXP2vYsXIpmAwnnXUDjvGpoTw1QHDzD67dsZf/huTBBggnS8VFiDhvL/0DyApQyBMEtl/26O3/kxasOH4pd3ejffpWyAxsZTgGFmC/GwtJHiy65h87v+jO2/dRfdr/rp+LyC+hT4SLv+iAJgubsCeI8JM5T33cMzt76PyYPfwtUqM4OCcd98KYNgdhtxfHyGgEllyZ7xMja9/aMMvPcfye+4Ilny6zTLUBQAyx4CxCFQO3GYo7d9iGO3/z6VA/cCZvZ8wOXYhdckZwjMrA2A/I6dbPvVT9H/to9gsyV8VFclIBoDWIkgMCbAVUYY/+7XKO//Jl2v/DEK515F4WXXxMt/54VG0sdfmiSYN1YAhq6dP0FQ6OHY7R8hqiTLjzUmIKoAlrkaCOL19q4xxandtzL4mY8w9NmPMvbQnUTJKsK4tc559LeU4wVzThQqXfA6znznn8YnFkfaCVhUAaxABiRdAhuADXDVCUb3fIGxvXeR7ttGbuASOi9/K5n+cwhyncmpQmZmvMDMnCxsFh8ELqJ4/ms586f+hMHP/C6uOtHiCsbWNJvNFXsKGYaB9jZUAKz2IABsgEnW4teOP0lt6CBjD36e9MbtZAcupuOiN5Lp30GqZ/PsHn/e430U7yS0mIvcxo29eP619L/5Awx98U+SMwHssnQHwlCXlgJAnj8IjIn74Sb+u9rwU1SfeZzxPXeS7hsgv+MKCue+muwZ55LqHZg9aXjO57c1NkB8+nDp4jfFYxOP78JMHxe+xG7/7F2MjIwlQbA8pYAxhmq1xo++5Q0MbN2s60sBcJqNEUy35yDEhh1476gdf5Lq4D5GH7iDdM8Z5M6+nPzZO8lvv5xU1xnzP3+mYS+4xWA8mGyR7te+m8nDD+FqU/G+gEsUAt57jDF8/M//lu/vf4J8Pod3yxMAQRhw8sQIO7ZvY2Dr5pn/WxQAp11l4H0EGEwqg01n8a5JbeggteNPMf7QnaS6N5MduJjOS99C4byrmTdw2MpFn8wZKJ5zJfmzXkl539fBLv1l0L+xj4mJCrlcFr9MgwFBEJDLZslmM7qGFABrpSrwyVYDBpPOx2V71Ii7CUMHqTxxP/ltl9F91TvJDVycnO7b6uKjeHCx45IfoXLwvmUp0RvNJo1GgzAMli0AnHPU6w2c0yPNdukx4GoeL5he0GMCTJjCprJE48OMP/Ilnvn0hzi565/jQ0QNrZXwSVbkz7ps/tiCKABk9VYG08uDTZAiqo5zcvetDN/9CVy92mJDjhMg6NhI2LEx3ktAa+kVANKG6Wf17bwtKhMi3NQEYw9+nvrwoba+ngnCeGKQKgAFgLR3Z/ZRA9+s45uNFt7if7+ovrf3mFRySvA9/xwfM6YRcGmRBgEXFZ8hYb4rOdqrhQU+xuA9uMnR+DyAdhuuizcmnfzBXlytEt/NW6kAbEC6b4Dq0e/NnBYmCgBZUB86bnx9b/gVctsuxTcbszv3vmCjdRCEVI8+xvCX/wrXrGNMu5Nl4tOJorHjROWTLQfAdAiIAkDa6ftHdVK9A2Q3X9jyp6e6N3Ni1z/RnBxNJuIs7nuJ2jibwHtPY+z4nK3GRWMAssA7b0A0OUZz7Di4KH4c59yLv3kHUYOg0E2m/9xFjr2beDegzk2ke7bOqU4W+FM0pogqo+gJgAJA2mp8zXjLrWS1H9a++JuxyWw8T27g4kU/gjM2ICj2YlKtz4aLKiM0RgaTrotKAAWAtFYFhBnqJw4nS3dbeCmTx4BdO3+cTN82fKPa+nZdxgCOINfBhht+DRumW/re4wAYxbumKgAFgLTc/J3DpjJUjx3ATU0k/egWJuJ4T9jZz6a3/yE215E8xgsW/vkmwNUqlC66gcJ5r27thKDk31UH9yVHk+v3qQCQ1iuAIEX9xJE5u/u0eAf3jsK5V7HxRz9IkMnjauU5M/6mJwzZ2Z19ksbrXQM3NUbHpTey8S0fwAQhhoVOLvIzYVU5+K2kAtBloACQFtu/BxvSGDvG6AOfm1OWt9SBB+/ovvInOevXb6fzspsgSIE3+HoVV5vEVcu4WhnfqM7MGcgNXMpZt9zG5nd9HJsttnT2QHzSsGHi0a9S2b97ZntxWZ/0219kCJggxdjeu+i+8idJ9WxpLwSAdN82Nt/8F0w9/SjVI48yeeR7RJVTRBM/xGZLpHo2YzMliue+isLLr8UEczYJWfD/Ga+X98065f3fJJocx6QzmgqsAJC2uwE2pDEyyMh9/87Gmz68iP334+f3ua0Xk9t6Md1XL+Tft1Z1eOcwNqA2dJCJfV+HINmmXE8A1AWQ9kPAhinGHr6byUN7ZjbgbGNQYPaOnhzygYvij52L5xq4aM6U4xY3C/UeYyyuPsXJe/6FZvkkJkwtzxkFogBYX69iQHPiBMdu/z2mjjwCNkgG19rJATN7yIcN4jZu47kDxgaLPN3HM3LfbVQO3IsNUir9RQGwZGMBYZra8CEGb/swU4cfjgfX2g2B56sMFvG9eRefDXjq3k9x6r5/w9UnZyYjiQJAliQEHDaTozb8FEOf/yOqzzwGNmy/EliiYMLH/f7Jpx7g1Dc/HU9dxqjxiwJg6RtchE1laYwMMvTFj1M9+tjsY7aVbnDexd0Jayk//nWG7vhjGqeO6FgwmUdPAZa00cV9eFerUBvcx9FPvZ/e1/0SXTvfHp/QOzcIlmXzDj87J8BYovIpjn3uD6gc+Ba+WcOksrrziyqAZWcCfLNKY3SIoc//MU//6y1MPvmd2Wf209OGp1cHLvaOPP3UYM5swOoz+zh66/sZ23t3vFLRhmr8ogpgBUuBuNx2jvK+e6gPPUFu+056X/eLpHu2YjP5OdN7kwZsiD9vpjqYe9Lv/L69n358Z+Jjx40h3j782EHGHr6L0fv/A1ebJMh1JJWBHveJAuAl6IeDTedoTgwzvvdOJp/8DtnNL6dw7tXktl1CqnMTYccGTGD//68xEwRmttHPKd7qw4eonzzC+MN3M/H4LnANXLORnBmghi8KgJc4CDyYEBNCVD7BxHf/i/K+e0h1biLo2EBuy4WkewcIi33YTJ6w+wyCXImg0ItN55IccPh6BROE1IYOMvmDvURTEzRGjlJ9+nvUhp/CN6rx2gBIBh9V8osCYPV0CzxgA4JcR7wd1/gw9VNHmTq0BxOksOlc/D5XwoTp+OPpk3+8i3cStpaofJLG6NDMjsQ2W8SEGWwqkyz28Wr8ogBYrdVAfA7g9KGg6eSvXbzDUNQgqk4k4wLuebsAJgiTMwRz8Q7Dzs0fFxBRAJxeYRCzYKd36jUvMAfQP8/niigA1kY3YfrPIstM8wBelPbLElUA6/eeHNXj/frW2w3Z++TnViWiAFjPL1DXJnpf8wvxaPy6SgGLq08SFntUCSkA1mPlH/eOeq75eb0WoINHFQDrtQ+wzh+tGQ0TKQDUAETWaEdPRBQAIqIAEBEFgIgoAERkTVs3TwGiKKLRaOC9n7Pjjiw17z3G6r6iAFhlF2VnZwepVEq/8RVi9PhUAbAaOOfIZjN86e7/5vCRoy0epiktJi3GGJrNiJGRUVKpEK+1BAqAl/run81k+Op/3cMXvvhV/cZX5PYPPd1dhKECQAGwWroAHSW6uzr0G18hzWakxq8AWD2iKCLSBjoi82ikRkQBICIKABFRAIiIAkBEFAAiogAQEQWAiCgAREQBICIKABFRAIiIAkBEFAAiogAQEQWAiCgAREQBICIKABFRAIiIAkBEFAAiogAQEQWAiCgAREQBICIKABFRAIiIAkBEFAAiogAQEQWAiCgAREQBICIKABFRAIiIAkBEAaCXQEQBICIKABFRAIiIAkBEFAAiogAQEQWAiCgAREQBICIKABFRAIiIAkBEFAAiogAQEQWAiCgAREQBICIKABFRAIiIAkBEFAAiogAQEQWAiCgAREQBICIKABFRAIiIAkBEFAAiogAQEQWAiCgAREQBICIKABFRAIiIAkBkvQvnfmCMmfcmspot/jo1YEz8fu2/Ws/7s84LgEajQa1Wo1arE0VOV5isakEQUK3VcK69a9VHdXyjhrcBeL/Ga/0g/lmjxnMCoJG8N329PWzdciadHSUipwCQVR4ANqCQz5HNZtsrfzs2kurZgk3n1nwAGGsxmSJhqTcOP/AGmiaKom9ba18Z/x2BLiuRNS8CjHPuQeO9fzfwLwDOuUivjZyWFa5tYzzbOdZLnWsBB8Qvk52+0b/HAHjvfwV4H3ChLiWRNe8x4G+MMf9gvPfGGOPL5fKmQqHQpW6AyNou/yuVymixWBzy3pv/A/eQYKZx/d6rAAAAAElFTkSuQmCC";


        const staffOptions = `
            <option>Lead Attorney</option>
            <option>Associate Attorney</option>
            <option>Paralegal</option>
            <option>Litigation Assistant</option>
            <option>Case Manager</option>
            <option>Demand Specialist</option>
            <option>Records Specialist</option>
            <option>PD Specialist</option>
            <option>Claims Specialist</option>
            <option>Lien Negotiator</option>
            <option>Closer</option>
            <option>Accounting Department</option>
            <option>Intake Specialist</option>
            <option>Receptionist / Front Desk</option>
        `;

        /* ---------- Tabs ---------- */
        function showTab(id) {
            document.querySelectorAll('.tab-pane').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active-tab'));
            const pane = document.getElementById('pane-' + id);
            pane.style.display = 'block';
            void pane.offsetHeight; // force reflow so the fade-in transition actually plays
            requestAnimationFrame(() => pane.classList.add('active'));
            document.getElementById('tab-' + id).classList.add('active-tab');
        }

        /* Case statuses (the #phase-selector options). Cases saved before the firm's
           status list came in carry the old phase names; they open on the matching
           status. The saved phase column is the display text (upper case), so the
           lookup ignores case. functions/_utils.js groups the same statuses by stage. */
        const LEGACY_PHASES = {
            'investigation': 'Treating', 'treatment': 'Treating', 'demand review': 'Pending Demand', 'bi demand': 'BI Demanded',
            'bi settlement nego': 'BI Settlement Negotiations', 'um demand': 'UM or UIM Demanded', 'um settlement': 'UM or UIM Settlement Negotiations',
            'lien negotiations': 'BI Settled', 'settled': 'BI Settled', 'litigation': 'Litigation Initiated', 'discovery': 'Litigation Discovery',
            'post trial': 'Trial', 'dropped case': 'Dropped', 'referred out': 'Referral'
        };
        function normalizePhase(val) {
            const v = String(val || '').trim(); if (!v) return v;
            const sel = document.getElementById('phase-selector');
            const opts = sel ? Array.from(sel.options).map(o => o.value) : [];
            return opts.find(o => o.toLowerCase() === v.toLowerCase()) || LEGACY_PHASES[v.toLowerCase()] || v;
        }
        window.normalizePhase = normalizePhase;
        // A saved select value the status list no longer has (an old phase name): put the matching status in.
        function fixPhaseSelect(selects, saved) {
            const sel = selects.find(el => el && el.id === 'phase-selector'); if (!sel) return;
            const v = saved[selects.indexOf(sel)];
            if (v && sel.value !== v) sel.value = normalizePhase(v);
        }
        // The big status words and the status dropdown always say the same thing: setting one sets the other.
        function updatePhaseDisplay(val) {
            const v = normalizePhase(val), sel = document.getElementById('phase-selector');
            if (sel && v && sel.value !== v && Array.from(sel.options).some(o => o.value === v)) sel.value = v;
            document.getElementById('display-phase').innerText = String(v || (sel && sel.value) || 'Intake').toUpperCase();
        }

        function handleOtherSystem(selectId, otherInputId, revertId) {
            const sel = document.getElementById(selectId);
            const input = document.getElementById(otherInputId);
            const rev = document.getElementById(revertId);
            if (sel.value === "Others" || sel.value === "Other") {
                sel.classList.add('hidden');
                input.classList.remove('hidden');
                rev.style.display = "inline-block";
                input.focus();
            }
        }

        function revertOther(selectId, otherInputId, revertId) {
            document.getElementById(selectId).classList.remove('hidden');
            document.getElementById(selectId).selectedIndex = 0;
            document.getElementById(otherInputId).classList.add('hidden');
            document.getElementById(revertId).style.display = "none";
        }

        /* ---------- Third Party Vehicle: conditional owner/driver sections ---------- */
        function toggleOwnerExtra() {
            const owner = document.getElementById('tp-owner').innerText.trim().toLowerCase();
            const driver = document.getElementById('tp-driver').innerText.trim().toLowerCase();
            const extra = document.getElementById('tp-owner-extra');
            if (owner && driver && owner !== driver) extra.classList.remove('hidden');
            else extra.classList.add('hidden');
        }
        function toggleDriverInsuredExtra() {
            const val = document.getElementById('tp-driver-insured').value;
            const extra = document.getElementById('tp-driver-extra');
            if (val === 'Yes') extra.classList.remove('hidden');
            else extra.classList.add('hidden');
        }
        document.addEventListener('DOMContentLoaded', () => {
            const owner = document.getElementById('tp-owner');
            const driver = document.getElementById('tp-driver');
            if (owner && driver) {
                owner.addEventListener('input', toggleOwnerExtra);
                driver.addEventListener('input', toggleOwnerExtra);
                owner.addEventListener('focusout', toggleOwnerExtra);
                driver.addEventListener('focusout', toggleOwnerExtra);
            }
        });

        /* ---------- Placeholder auto-labeling (runs once per insertion, no polling) ---------- */
        function applyPlaceholders(scope) {
            const root = scope || document;
            root.querySelectorAll('[contenteditable="true"]').forEach(el => {
                if (el.hasAttribute('data-ph')) return;
                const wrap = el.closest('div');
                const lbl = wrap ? wrap.querySelector('label') : null;
                el.setAttribute('data-ph', lbl ? ('Enter ' + lbl.innerText.trim()) : 'Enter details');
            });
        }

        /* ---------- Dynamic row/card builders ---------- */
        // A Discovery & Filing Tracker row's document: the filed copy or the paper served, uploaded like a Doc Hub file
        // (named by the firm's convention with the row's Task Type) or a 🔗 Link. Backed up to Google Drive in the case's
        // Litigation folder (drive-backup.js). No field in it is saved by position: only the link inside it.
        const LIT_TYPES = ['Service', 'Complaint', 'Summons', 'Interrogatories', 'RFP', 'RFA', 'Deposition Notice', 'Subpoena', 'Motion',
            'Answer', 'Discovery Responses', 'Proof of Service', 'Notice of Hearing', 'Court Order', 'Stipulation', 'Other'];
        window.LIT_TYPES = LIT_TYPES;
        function litDocCell() {
            return `<td width="190" class="no-print lit-doc"><label class="hub-btn" style="display:inline-block;padding:6px 10px;cursor:pointer;">Upload<input type="file" onchange="handleDocUpload(this)" class="hidden"></label> <button type="button" class="hub-btn doc-link-btn" style="padding:6px 8px;" onclick="addDocLink(this)" title="Attach a web link instead (a court portal, a shared folder)">🔗 Link</button><div style="font-size:8px;color:#94a3b8;margin-top:2px;">Max ${formatBytes(DOC_UPLOAD_MAX_BYTES)}</div><div class="doc-attachment" style="margin-top:4px;font-size:9px;"></div></td>`;
        }
        window.litDocCell = litDocCell;
        function addRow(id) {
            const tr = document.createElement('tr');
            const today = new Date().toLocaleDateString();
            if (id === 'lit-body') {
                tr.innerHTML = `<td><select class="prof-input text-xs">${LIT_TYPES.map(t => `<option>${t}</option>`).join('')}</select></td><td><div contenteditable="true" class="text-xs" data-ph="Enter party"></div></td><td><div contenteditable="true" class="text-xs" data-ph="MM/DD/YYYY" data-fmt="date"></div></td><td><select class="prof-input text-xs"><option>Pending</option><option>Responded</option><option>Completed</option></select></td>${litDocCell()}<td><button onclick="this.parentElement.parentElement.remove()" class="text-red-500 font-bold">×</button></td>`;
            } else if (id === 'fin-body') {
                tr.innerHTML = `<td><div contenteditable="true" class="text-xs">${today}</div></td><td><select class="prof-input text-xs">${staffOptions}</select></td><td><div contenteditable="true" class="text-xs" data-ph="Enter description"></div></td><td><div contenteditable="true" class="font-black exp-field text-xs text-blue-600" data-ph="$ 0.00" data-fmt="currency"></div></td><td><button onclick="this.parentElement.parentElement.remove(); updateTotals();" class="text-red-500 font-bold">×</button></td>`;
            } else if (id === 'note-body' || id === 'task-body') {
                tr.innerHTML = `<td><div contenteditable="true" class="text-xs font-bold text-slate-400">${today}</div></td><td><select class="prof-input text-xs">${staffOptions}</select></td><td><div contenteditable="true" class="multiline-field text-xs min-h-[40px] italic" data-ph="Enter details"></div></td><td><button onclick="this.parentElement.parentElement.remove()" class="text-red-500 font-bold">×</button></td>`;
            }
            document.getElementById(id).appendChild(tr);
            applyPlaceholders(tr);
        }

        /* ---------- Case ID auto-generation: LSH-<Year>-<Type>-<XXXXXX> ---------- */
        const TYPE_CODES = { 'MVA': 'MVA', 'Slip and Fall': 'SNF', 'Dog Bite': 'DOG', 'Premise Liability': 'PRL' };
        function currentTypeCode() {
            const sel = document.getElementById('main-case-type');
            if (sel.value === 'Others') {
                const other = document.getElementById('main-case-other').innerText.trim();
                return other ? other.replace(/[^A-Za-z0-9]/g, '').toUpperCase().substring(0, 4) || 'OTH' : 'OTH';
            }
            return TYPE_CODES[sel.value] || sel.value.replace(/\s+/g, '').toUpperCase().substring(0, 3);
        }
        // NOTE: Case IDs are now minted directly inside /api/case-repository
        // (via finalize:true) at the moment a case is saved/finalized, so a
        // separate client-side requestCaseId()/POST /api/case-id round-trip
        // is no longer needed here. /api/case-id itself is left in place
        // and still works if anything else calls it.
        // Updates the on-screen Case ID field to reflect the current state:
        //  - Already permanently saved case open -> show its real, fixed,
        //    server-issued ID (never regenerated here).
        //  - Draft open (Archive Case (Save as Draft), no ID yet) -> say so.
        //  - Brand-new, never-saved case -> a real ID isn't reserved just for
        //    viewing the form (that's what makes cross-device numbers collide-
        //    free) — say it'll be assigned when you actually save.
        function generateCaseId() {
            const field = document.getElementById('case-id-field');
            field.dataset.series = '';
            if (currentCaseId !== null && !currentCaseIsDraft) {
                return; // finalized case — its ID is fixed, never regenerated here
            }
            field.innerText = currentCaseIsDraft
                ? 'DRAFT \u2014 assigned on Save Case'
                : 'Assigned on Save Case';
        }


        function addBI() {
            const div = document.createElement('div'); div.className = "pdf-card border-l-4 border-red-500 relative bg-white p-6 mb-4 shadow-sm";
            div.innerHTML = `<button onclick="this.parentElement.remove()" class="absolute top-2 right-4 text-slate-300 no-print">×</button>
                <div class="grid grid-cols-4 gap-6 mb-6">
                    <div><label>Policy Holder</label><div contenteditable="true" data-ph="Enter policy holder" data-fmt="name"></div></div>
                    <div><label>Carrier</label><div contenteditable="true" data-ph="Enter carrier" data-fmt="name"></div></div>
                    <div><label>Policy #</label><div contenteditable="true" data-ph="Enter policy #"></div></div>
                    <div><label>Claim #</label><div contenteditable="true" data-ph="Enter claim #"></div></div>
                </div>
                <div class="grid grid-cols-4 gap-6">
                    <div><label>Adjuster Name</label><div contenteditable="true" data-ph="Enter adjuster name" data-fmt="name"></div></div>
                    <div><label>Adjuster Contact</label><div contenteditable="true" data-ph="Enter adjuster contact"></div></div>
                    <div><label>Liability Accepted?</label><select class="prof-input"><option>Pending</option><option>Yes</option><option>No</option></select></div>
                    <div><label>Policy Limits</label><div contenteditable="true" data-ph="Enter limits"></div></div>
                </div>`;
            document.getElementById('bi-container').appendChild(div);
        }

        function addPIPUM() {
            const div = document.createElement('div'); div.className = "pdf-card border-l-4 border-orange-500 relative bg-white p-6 mb-4 shadow-sm";
            div.innerHTML = `<button onclick="this.parentElement.remove()" class="absolute top-2 right-4 text-slate-300 no-print">×</button>
                <div class="grid grid-cols-4 gap-6 mb-6">
                    <div><label>Coverage Type</label><select class="prof-input"><option>PIP</option><option>UM/UIM</option></select></div>
                    <div><label>Policy Holder</label><div contenteditable="true" data-ph="Enter policy holder" data-fmt="name"></div></div>
                    <div><label>Insurance Carrier</label><div contenteditable="true" data-ph="Enter carrier" data-fmt="name"></div></div>
                    <div><label>Policy #</label><div contenteditable="true" data-ph="Enter policy #"></div></div>
                </div>
                <div class="grid grid-cols-4 gap-6">
                    <div><label>Claim Number</label><div contenteditable="true" data-ph="Enter claim #"></div></div>
                    <div><label>Adjuster Name</label><div contenteditable="true" data-ph="Enter adjuster name" data-fmt="name"></div></div>
                    <div><label>Adjuster Contact</label><div contenteditable="true" data-ph="Enter adjuster contact"></div></div>
                    <div><label>Policy Limits</label><div contenteditable="true" data-ph="Enter limits"></div></div>
                </div>`;
            document.getElementById('pip-um-container').appendChild(div);
        }

        // A lien's type, and where it stands: the Liens tab totals them by status (case-sections.js), and the
        // Settlement tab warns while any is still unconfirmed. Rows saved before the status existed get these
        // fields when the case opens (upgradeLienRows in case-sections.js), with the status "Not recorded" (older):
        // nobody said where those liens stand, so they aren't counted as unconfirmed.
        const LIEN_TYPES = ['Prior Atty Lien', 'Medical Lien', 'HI Subro', 'Medicare', 'Medicaid / State', 'ERISA Plan', "Workers' Comp", 'Child Support', 'Funding', 'Other'];
        const LIEN_STATUSES = ['Unconfirmed', 'Confirmed (lien letter received)', 'Final lien received', 'Reduction requested', 'Negotiated', 'Waived', 'Paid'];
        function lienDetailsHTML(older) {
            return `<div class="grid grid-cols-4 gap-6 lien-more">
                    <div><label>Lien Status</label><select class="prof-input" data-lien="status">${older ? '<option value="" selected>Not recorded</option>' : ''}${LIEN_STATUSES.map(x => `<option>${x}</option>`).join('')}</select></div>
                    <div><label>Date Notified / Letter Date</label><div contenteditable="true" data-ph="MM/DD/YYYY" data-fmt="date"></div></div>
                    <div><label>Reduction Requested</label><div contenteditable="true" data-ph="$ 0.00" data-fmt="currency" data-lien="requested"></div></div>
                    <div><label>Final Payoff</label><div contenteditable="true" class="text-green-700 font-bold" data-ph="$ 0.00" data-fmt="currency" data-lien="final"></div></div>
                </div>
                <label class="lien-more-notes">Lien Notes</label>
                <div contenteditable="true" class="multiline-field text-sm italic text-slate-600 min-h-[40px]" data-ph="Dates of service it covers, who you spoke to, letters sent and received, where the lien letter is in Doc Hub…"></div>`;
        }
        function addLien() {
            const id = Date.now();
            const div = document.createElement('div'); div.className = "pdf-card border-l-4 border-slate-900 relative bg-white p-6 mb-4 shadow-sm";
            div.innerHTML = `<button onclick="this.parentElement.remove()" class="absolute top-2 right-4 text-slate-300 no-print">×</button>
                <div class="grid grid-cols-4 gap-6">
                    <div><label>Type of Lien</label><div class="flex items-center"><select id="l-sel-${id}" onchange="handleOtherSystem(this.id, 'l-oth-${id}', 'l-rev-${id}')" class="prof-input">${LIEN_TYPES.map(x => `<option>${x}</option>`).join('')}</select><div id="l-oth-${id}" contenteditable="true" data-ph="Specify type" class="hidden text-xs font-bold px-2 py-1 bg-orange-50 border border-orange-200 min-w-[80px]"></div><button id="l-rev-${id}" onclick="revertOther('l-sel-${id}', 'l-oth-${id}', this.id)" class="revert-btn">↺</button></div></div>
                    <div><label>Lienholder Entity</label><div contenteditable="true" data-ph="Enter entity" data-fmt="name"></div></div>
                    <div><label>Claim / File #</label><div contenteditable="true" data-ph="Enter claim / file #"></div></div>
                    <div><label>Lien Amount</label><div contenteditable="true" class="text-red-600 font-bold" data-ph="$ 0.00" data-fmt="currency" data-lien="amount"></div></div>
                </div>
                ${lienDetailsHTML()}`;
            document.getElementById('lien-container').appendChild(div);
            if (typeof window.updateLienSummary === 'function') window.updateLienSummary();
        }
        window.lienDetailsHTML = lienDetailsHTML;
        window.LIEN_TYPES = LIEN_TYPES;
        window.LIEN_STATUSES = LIEN_STATUSES;

        function addFacility() {
            const id = "fac-" + Date.now();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><div contenteditable="true" class="text-xs" data-ph="Enter facility name"></div></td>
                <td>
                    <div class="flex items-center gap-1">
                        <select id="sel-${id}" onchange="handleOtherSystem(this.id, 'oth-${id}', 'rev-${id}')" class="prof-input text-xs"><option>Chiro</option><option>EMC</option><option>EMS</option><option>Emergency Hospital</option><option>Ortho</option><option>Surgery</option><option>Anesthesia</option><option>Pain Management</option><option>MRI / Imaging</option><option>Physical Therapy (PT)</option><option value="Other">Other</option></select>
                        <div id="oth-${id}" contenteditable="true" data-ph="Specify" class="hidden text-xs px-2 py-1 bg-orange-50 border border-orange-200 min-w-[70px]"></div>
                        <button id="rev-${id}" onclick="revertOther('sel-${id}', 'oth-${id}', this.id)" class="revert-btn">↺</button>
                    </div>
                </td>
                <td><div contenteditable="true" class="text-xs" data-ph="(000) 000-0000" data-fmt="phone"></div></td>
                <td><div contenteditable="true" class="text-xs" data-ph="name@example.com" data-fmt="email"></div></td>
                <td><div contenteditable="true" class="text-xs" data-ph="MM/DD/YYYY – MM/DD/YYYY"></div></td>
                <td><select class="prof-input text-xs"><option>Ongoing</option><option>Discharged</option><option>Referred Out</option><option>Pending Records</option></select></td>
                <td><div contenteditable="true" class="med-field font-black text-green-700 text-xs" data-ph="$ 0.00" data-fmt="currency"></div></td>
                <td><button onclick="this.parentElement.parentElement.remove(); updateTotals();" class="text-red-500 font-bold">×</button></td>
            `;
            document.getElementById('facility-container').appendChild(tr);
            applyPlaceholders(tr);
        }

        function addChronology() {
            const rowId = "chrono-" + Date.now();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="chrono-dos-list" id="dos-${rowId}">
                        <div class="flex items-center gap-1 mb-1">
                            <div contenteditable="true" class="text-xs" data-ph="MM/DD/YYYY" data-fmt="date"></div>
                        </div>
                    </div>
                    <button onclick="addChronoDate('dos-${rowId}')" class="add-btn no-print" style="margin-top:2px;">+ Add Date</button>
                </td>
                <td><div contenteditable="true" class="text-xs" data-ph="Enter facility name" data-fmt="name"></div></td>
                <td><div contenteditable="true" class="text-xs" data-ph="MM/DD/YYYY" data-fmt="date"></div></td>
                <td><div contenteditable="true" class="multiline-field text-xs italic" data-ph="Enter notes"></div></td>
                <td><button onclick="this.parentElement.parentElement.remove()" class="text-red-500 font-bold">×</button></td>
            `;
            document.getElementById('chrono-container').appendChild(tr);
            applyPlaceholders(tr);
        }
        function addChronoDate(containerId) {
            const container = document.getElementById(containerId);
            const div = document.createElement('div');
            div.className = "flex items-center gap-1 mb-1";
            div.innerHTML = `<div contenteditable="true" class="text-xs" data-ph="MM/DD/YYYY" data-fmt="date"></div><button onclick="this.parentElement.remove()" class="text-red-400 font-bold text-[10px]">×</button>`;
            container.appendChild(div);
            applyPlaceholders(div);
        }

        function addPassenger() {
            const div = document.createElement('div'); div.className = "pdf-card border-l-4 border-orange-500 relative bg-white p-6 mb-4 shadow-sm";
            div.innerHTML = `<button onclick="this.parentElement.remove()" class="absolute top-2 right-4 text-slate-300 no-print">×</button>
                <div class="grid grid-cols-4 gap-6">
                    <div><label>Full Name</label><div contenteditable="true" data-ph="Enter full name" data-fmt="name"></div></div>
                    <div><label>DOB</label><div contenteditable="true" data-ph="MM/DD/YYYY" data-fmt="date"></div></div>
                    <div><label>Contact Info</label><div contenteditable="true" data-ph="Enter contact"></div></div>
                    <div><label>Injury Sustained</label><div contenteditable="true" data-ph="Enter injury"></div></div>
                </div>`;
            document.getElementById('passenger-container').appendChild(div);
        }

        function addDocument(label) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td width="200"><div class="bg-slate-100 p-2 rounded text-[10px] font-black border text-center uppercase">${label}</div></td><td><div contenteditable="true" class="multiline-field text-xs italic text-slate-500" data-ph="Enter summary"></div></td><td width="150" class="no-print"><label class="hub-btn" style="display:inline-block;padding:6px 10px;cursor:pointer;">Upload<input type="file" onchange="handleDocUpload(this)" class="hidden"></label> <button type="button" class="hub-btn doc-link-btn" style="padding:6px 8px;" onclick="addDocLink(this)" title="Attach a web link instead (a shared folder, a provider portal, a website)">🔗 Link</button><div style="font-size:8px;color:#94a3b8;margin-top:2px;">Max ${formatBytes(DOC_UPLOAD_MAX_BYTES)}</div><div class="doc-attachment" style="margin-top:4px;font-size:9px;"></div></td><td width="40"><button onclick="this.parentElement.parentElement.remove()" class="text-red-300 font-bold">×</button></td>`;
            document.getElementById('doc-body').appendChild(tr);
            applyPlaceholders(tr);
        }
        /* ---------- R2-backed file attachments ----------
           Files used to be inlined into the row as base64 data URLs, which
           meant every attachment was carried inside the case's serialized
           HTML blob and re-sent on every save. They now live in R2 instead:
           the upload POSTs to /api/upload (functions/api/upload.js), the
           server returns an opaque key, and the row stores only a short path.

           The saved markup therefore holds `/api/file?key=<key>` in the href
           (functions/api/file.js) rather than a multi-megabyte data: URI.
           Everything downstream that reads the row (save/load/print) keeps
           working on the anchor exactly as before — only the href's contents
           changed. /api/file?key=<key> is session-gated server-side, so an
           attachment is no more reachable than the case it belongs to.

           `data-r2-mime` is stamped on the anchor at upload time so the PDF
           export can tell an image from a PDF/Word file without sniffing the
           URL. Legacy rows saved before this change still carry `data:` URIs
           and are handled by the fallback paths — they are not broken by it. */
        const DOC_UPLOAD_MAX_BYTES = 2 * 1024 * 1024; // 2MB per document — matches upload.js's server-side MAX_UPLOAD_BYTES; keep these two in sync
        function formatBytes(n) {
            if (n >= 1024 * 1024) return Math.round(n / (1024 * 1024)) + 'MB';
            return Math.round(n / 1024) + 'KB';
        }
        // Uploads a File to R2 and resolves to { key, url, mime, name, size }.
        // Rejects on any non-2xx so callers can surface a real failure instead
        // of silently attaching nothing.
        //
        // The real backend route is POST /api/upload (functions/api/upload.js),
        // which returns only { success, key, filename } — no url/mime, and
        // "filename" not "name". Files are read back via GET
        // /api/file?key=<key> (functions/api/file.js; also the format
        // migrate-to-r2.js already writes into saved case content), not the
        // /api/files/<key> path this used to call. Everything downstream
        // (up.url / up.key / up.mime / up.name) is unchanged — this function
        // is the only place that needs to know the real contract.
        async function uploadFileToR2(file, scope, name) {
            const fd = new FormData();
            fd.append('file', file, name || file.name);   // name: the file's name in the case (caseFileName)
            if (scope) fd.append('scope', scope);
            const res = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
            if (!res.ok) {
                let msg = 'Upload failed (' + res.status + ')';
                try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
                throw new Error(msg);
            }
            const data = await res.json();
            if (!data || !data.key) throw new Error('Upload succeeded but returned no key.');
            return {
                key: data.key,
                url: '/api/file?key=' + encodeURIComponent(data.key),
                mime: file.type || '',
                name: data.filename || name || file.name,
                size: file.size
            };
        }
        /* The firm's file naming for what's uploaded to a case:
             <Case ID>_<Last-First>_<Type>_<YYYY-MM-DD>.<ext>
             e.g. LSH-2024-PRL-900171_Garcia-Linda_Medical-Records_2026-10-04.pdf
           The type is the Doc Hub category (or Demand-Letter, Client-ID); the date is the day it was uploaded. Only
           letters, digits and - _ . are used, so the name is the same in the case, in the download and in a Drive backup.
           The file's own name is kept on the link (its tooltip). */
        function caseFileName(type, original) {
            const part = (v, max) => String(v || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ')
                .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
            const id = textOf('case-id-field');
            // a real Case ID (LSH-2026-MVA-000041) has digits and no spaces; "LSH-----" or "Assigned on Save Case" isn't one yet
            const caseId = /\d/.test(id) && /^[A-Za-z0-9-]+$/.test(id) ? part(id, 40) : 'NO-CASE-ID';
            let raw = textOf('client-name-field').replace(/\s+/g, ' ').trim();
            if (raw.includes(',')) { const at = raw.indexOf(','); raw = (raw.slice(at + 1) + ' ' + raw.slice(0, at)).replace(/,/g, ' ').replace(/\s+/g, ' ').trim(); }   // "Garcia, Linda"
            const proper = raw === raw.toUpperCase() ? raw.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, a, b) => a + b.toUpperCase()) : raw;
            const words = proper.split(' ').filter(Boolean);
            while (words.length > 1 && /^(jr|sr|ii|iii|iv)\.?$/i.test(words[words.length - 1])) words.pop();
            const client = words.length ? part([words[words.length - 1]].concat(words.slice(0, -1)).join(' '), 40) : '';
            const d = new Date(), day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const ext = (/\.([A-Za-z0-9]{1,8})$/.exec(String(original || '')) || [])[1];
            return uniqueCaseFileName([caseId, client || 'No-Client-Name', part(type, 40) || 'Document', day].join('_') + (ext ? '.' + ext.toLowerCase() : ''));
        }
        window.caseFileName = caseFileName;
        // The names of the files already on the case (Doc Hub, Litigation, demand letters, the client's ID, PD photos)
        function caseFileNames() {
            const names = new Set();
            document.querySelectorAll('#doc-body .doc-attachment a[download], #lit-body .doc-attachment a[download], #kx-demand a.kx-dl-link[download]').forEach(a => names.add(a.getAttribute('download')));
            const f = document.querySelector('#kx-client-id [data-k="file"]');
            if (f) { try { const o = JSON.parse(f.textContent); if (o && o.name) names.add(o.name); } catch (e) { /* no ID file */ } }
            if (window.lshPdPhotos) window.lshPdPhotos.list().forEach(p => { if (p.name) names.add(p.name); });   // property damage photos (pd-photos.js)
            return names;
        }
        // Two files of the same type uploaded the same day: the second is …-2, the third …-3 (before the extension)
        function uniqueCaseFileName(name) {
            const taken = caseFileNames();
            if (!taken.has(name)) return name;
            const dot = name.lastIndexOf('.'), stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
            for (let n = 2; ; n++) { const next = `${stem}-${n}${ext}`; if (!taken.has(next)) return next; }
        }
        // Files uploaded before the case had its Case ID are named NO-CASE-ID_…: when the case gets its ID, they take it.
        // (The link asks /api/file for the new name, so a download is named the same.) Returns how many were renamed.
        function renameNoCaseIdFiles(caseId) {
            const id = String(caseId || '').trim();
            if (!/\d/.test(id) || !/^[A-Za-z0-9-]+$/.test(id)) return 0;
            const fresh = (old) => uniqueCaseFileName(id + old.slice('NO-CASE-ID'.length));
            let n = 0;
            document.querySelectorAll('#doc-body .doc-attachment a[data-r2-key], #lit-body .doc-attachment a[data-r2-key], #kx-demand a.kx-dl-link[data-r2-key]').forEach(a => {
                const old = a.getAttribute('download') || '';
                if (!old.startsWith('NO-CASE-ID_')) return;
                const name = fresh(old);
                a.setAttribute('download', name);
                a.textContent = a.textContent.replace(old, name);
                a.setAttribute('href', '/api/file?key=' + encodeURIComponent(a.getAttribute('data-r2-key')) + '&name=' + encodeURIComponent(name));
                n++;
            });
            const f = document.querySelector('#kx-client-id [data-k="file"]');
            if (f) {
                try {
                    const o = JSON.parse(f.textContent);
                    if (o && typeof o.name === 'string' && o.name.startsWith('NO-CASE-ID_')) { o.name = fresh(o.name); f.textContent = JSON.stringify(o); n++; }
                } catch (e) { /* no ID file */ }
            }
            if (window.lshPdPhotos) n += window.lshPdPhotos.rename((old) => (old.startsWith('NO-CASE-ID_') ? fresh(old) : null));
            return n;
        }
        async function handleDocUpload(input) {
            const file = input.files && input.files[0];
            if (!file) return;
            if (file.size > DOC_UPLOAD_MAX_BYTES) {
                alert('That file is too large to attach (max ' + formatBytes(DOC_UPLOAD_MAX_BYTES) + '). Try a smaller file or a compressed copy.');
                input.value = '';
                return;
            }
            const row = input.closest('tr');
            const holder = row ? row.querySelector('.doc-attachment') : null;
            if (holder) holder.innerHTML = '<span style="color:#64748b;font-style:italic;">Uploading…</span>';
            try {
                // named by the firm's convention (caseFileName), under the row's category (a Litigation row: its Task Type)
                const litType = row && row.closest('#lit-body') && row.querySelector('select');
                const cat = litType ? (litType.value || 'Litigation') : row && row.querySelector('td div') ? row.querySelector('td div').textContent.trim() : 'Document';
                const named = caseFileName(cat, file.name);
                const up = await uploadFileToR2(file, 'case-doc', named);
                const q = (v) => String(v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const safeName = q(named), safeMime = q(up.mime || file.type || '');
                if (holder) {
                    holder.innerHTML = `<a href="${up.url}" download="${safeName}" data-r2-key="${q(up.key)}" data-r2-mime="${safeMime}" data-orig-name="${q(file.name)}" title="Original file: ${q(file.name)}" target="_blank" rel="noopener" class="doc-file-link" style="color:#2563eb;font-weight:700;">📎 ${safeName}</a> <button type="button" onclick="this.parentElement.innerHTML=''" class="text-red-300 no-print" style="margin-left:4px;">×</button>`;
                }
            } catch (err) {
                if (holder) holder.innerHTML = '';
                alert('Could not attach that file: ' + (err && err.message ? err.message : 'unknown error'));
            }
            input.value = '';
        }

        /* ---------- Totals ---------- */
        function updateTotals() {
            let med = 0; document.querySelectorAll('.med-field').forEach(el => med += parseFloat(el.innerText.replace(/[^0-9.-]/g, '')) || 0);
            const put = (el, v) => { if (el && el.innerText !== v) el.innerText = v; };   // only a change is written: the page watches the case for edits
            put(document.getElementById('med-total'), '$ ' + med.toLocaleString(undefined, { minimumFractionDigits: 2 }));
            let exp = 0; document.querySelectorAll('.exp-field').forEach(el => exp += parseFloat(el.innerText.replace(/[^0-9.-]/g, '')) || 0);
            put(document.getElementById('exp-total'), '$ ' + exp.toLocaleString(undefined, { minimumFractionDigits: 2 }));
        }
        // Recalculate on input instead of aggressive polling — avoids flicker/lag.
        document.addEventListener('input', (e) => {
            if (e.target && (e.target.classList.contains('med-field') || e.target.classList.contains('exp-field'))) updateTotals();
        });
        setInterval(updateTotals, 4000); // light safety-net, not a UI repaint loop

        /* ---------- Case repository (server-side, D1-backed) ----------
           Replaces the old localStorage-based repository entirely. Every
           user can VIEW every finalized case; drafts are visible only to
           their owner or an Admin (enforced server-side in
           case-repository.js, not just here). Only the owner or an Admin
           may modify/delete a case — also enforced server-side. */
        // Builds just the FIELD CONTENT of the current case (no metadata —
        // clientName/phase/medTotal/ownership are tracked separately and
        // sent alongside this on save).
        /* ---------- Keyed sections: new case fields saved by id, not by position ----------
           The case's older fields are saved by their position on the page (the
           `inputs` / `sels` arrays below), so a field added in the middle would
           shift every later field of every case saved before it. Newer sections
           are marked [data-keyed] with an id and saved under that id instead
           (content.keyed), and their fields are left out of the positional lists:
             data-keyed="rows"  a list people add rows to: saved as its HTML plus its selects' values;
             data-keyed         fixed fields: each saved under its data-k name.
           A case saved before a section existed simply shows it empty. */
        // (data-mirror: a second view of another field, e.g. the header's SSN; not saved itself)
        const posEdits = (root) => Array.from((root || document).querySelectorAll('[contenteditable="true"]')).filter(el => !el.closest('[data-keyed]') && !el.hasAttribute('data-mirror'));
        const posSels = (root) => Array.from((root || document).querySelectorAll('select')).filter(el => !el.closest('[data-keyed]'));
        // The dropdowns a saved case's values (sels) go back into, by position. They were saved from posSels() over
        // the whole page, which starts with the dropdowns above the case editor (the clock's time zone, the program
        // picker) and ends with those below it (sign-in, Master Control). Only the case's own get a value: opening
        // a case never changes the clock's zone or a picker. A copy of the editor (a preview: Monitoring, Case Logs,
        // the live view) holds only the case's own, so the ones above it are counted in front.
        function savedSelects(root) {
            const area = document.getElementById('capture-area'), all = posSels(document);
            if (!root || root === document) return all.map(el => (area && area.contains(el) ? el : null));
            const before = area ? all.filter(el => !area.contains(el) && (area.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)).length : 0;
            return new Array(before).fill(null).concat(posSels(root));
        }
        const _keyedTemplates = {};
        document.querySelectorAll('[data-keyed="rows"][id]').forEach(el => { _keyedTemplates[el.id] = el.innerHTML; });
        const keyedFields = (el) => (el.matches('[contenteditable="true"], select') ? [el] : []).concat(Array.from(el.querySelectorAll('[contenteditable="true"], select')));
        // A Training Library case file locks the dropdowns outside the trainee's areas (training-library.js:
        // disabled + data-mock-ro). The lock is the library's, not the case's: it's left out of what's saved, so a
        // saved case never opens with dead dropdowns, and locking or unlocking an area isn't an edit.
        function savedHtml(el) {
            if (!el) return '';
            if (!el.querySelector('[data-mock-ro]')) return el.innerHTML;
            const copy = el.cloneNode(true);
            copy.querySelectorAll('[data-mock-ro]').forEach(x => { x.removeAttribute('disabled'); x.removeAttribute('data-mock-ro'); });
            return copy.innerHTML;
        }
        function captureKeyed(root) {
            const out = {};
            (root || document).querySelectorAll('[data-keyed][id]').forEach(el => {
                if (el.dataset.keyed === 'rows') { out[el.id] = { html: savedHtml(el), sels: Array.from(el.querySelectorAll('select')).map(x => x.value) }; return; }
                const fields = {};
                keyedFields(el).forEach((x, i) => { fields[x.dataset.k || i] = x.tagName === 'SELECT' ? x.value : x.innerHTML; });
                out[el.id] = { fields };
            });
            return out;
        }
        /* Saved case content is markup (table rows, line breaks, bold text, the row buttons), and someone else's
           case is opened too: an Admin opens a trainee's, every trainee opens an Admin's library edit. Before any
           of it goes back on the page it's cleaned (cleanCaseHtml): it's parsed in an inert <template> (nothing
           in it loads or runs there), then anything that could run is dropped: script-like elements, javascript:
           and data: links, and every on…= handler except the app's own row buttons, which only ever call the
           case editor's helpers below with plain values. What's left is text and layout. */
        const CASE_HTML_DROP = new Set(['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'link', 'meta', 'base',
            'style', 'template', 'noscript', 'portal', 'foreignobject', 'animate', 'animatemotion', 'animatetransform', 'set', 'handler', 'listener']);
        const CASE_HTML_URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'background', 'poster', 'data', 'srcset', 'lowsrc', 'dynsrc', 'cite', 'ping']);
        const CASE_HANDLER_FNS = new Set(['handleDocUpload', 'handleOtherSystem', 'revertOther', 'addChronoDate', 'updateTotals', 'afterKeyedApplied',
            'window.afterKeyedApplied', 'applyReportKind', 'calcSettlement', 'calcWages', 'toggleDriverInsuredExtra', 'toggleOwnerExtra', 'updatePhaseDisplay',
            'generateCaseId', 'sortChronology', 'docDropCat', 'docDrop', 'docDragOver', 'docDragLeave', 'addRow', 'addBI', 'addPIPUM', 'addLien',
            'addFacility', 'addChronology', 'addDocument', 'addDocLink', 'addParty', 'addAuthorized', 'addDemand', 'addCounsel', 'addAdr', 'addInsurance', 'uploadDemandLetter', 'showTab',
            'lshClientId.pick', 'lshClientId.open', 'lshClientId.remove', 'lshPdPhotos.add']);
        const CASE_HANDLER_ARG = /^(?:'[\w .:#\-]*'|-?\d+(?:\.\d+)?|this|this\.(?:id|value|checked)|event|true|false|null)$/;
        function caseHandlerOk(code) {
            return String(code).split(';').map(x => x.trim()).filter(Boolean).every(st => {
                if (/^this(?:\.parentElement|\.closest\('[\w.#\-]+'\))*\.remove\(\)$/.test(st)) return true;
                if (/^this(?:\.parentElement)+\.innerHTML\s*=\s*''$/.test(st)) return true;
                if (/^(?:event\.stopPropagation|event\.preventDefault|this\.blur)\(\)$/.test(st) || st === 'return false') return true;
                if (/^window\.afterKeyedApplied\s*&&\s*afterKeyedApplied\(\)$/.test(st)) return true;
                const m = /^([\w.]+)\((.*)\)$/.exec(st);
                if (!m || !CASE_HANDLER_FNS.has(m[1])) return false;
                return !m[2].trim() || m[2].split(',').every(a => CASE_HANDLER_ARG.test(a.trim()));
            });
        }
        const _cleanTpl = document.createElement('template');
        function cleanCaseHtml(html) {
            if (typeof html !== 'string') return html == null ? '' : String(html);
            if (html.indexOf('<') < 0) return html;   // plain text: nothing to clean
            _cleanTpl.innerHTML = html;               // parsed as a template's content: inert, and table rows stay rows
            const frag = _cleanTpl.content;
            frag.querySelectorAll('*').forEach(el => {
                if (CASE_HTML_DROP.has(el.localName.toLowerCase())) { el.remove(); return; }
                Array.from(el.attributes).forEach(a => {
                    const n = a.name.toLowerCase();
                    if (n.startsWith('on')) { if (!caseHandlerOk(a.value)) el.removeAttribute(a.name); return; }
                    if (n === 'srcdoc' || n === 'is') { el.removeAttribute(a.name); return; }
                    if (!CASE_HTML_URL_ATTRS.has(n)) return;
                    const url = a.value.replace(/[\u0000- ]/g, '');
                    // data: stays only as the Doc Hub saved it before R2: a picture, or a file link that downloads
                    const picture = /^data:image\/(?:png|jpe?g|gif|webp);/i.test(url);
                    const dataOk = (n === 'src' && el.localName === 'img' && picture) || (n === 'href' && (picture || el.hasAttribute('download')));
                    if (/^(?:javascript|vbscript|data):/i.test(url) && !dataOk) el.removeAttribute(a.name);
                });
                // nothing opened in a new tab gets a handle on this page: links get rel="noopener noreferrer";
                // forms and form buttons don't open new tabs at all (a case never has forms)
                if (el.hasAttribute('target')) {
                    if (el.localName === 'a' || el.localName === 'area') el.setAttribute('rel', 'noopener noreferrer');
                    else el.removeAttribute('target');
                }
                if (el.hasAttribute('formtarget')) el.removeAttribute('formtarget');
            });
            const out = _cleanTpl.innerHTML;
            _cleanTpl.innerHTML = '';
            return out;
        }
        window.cleanCaseHtml = cleanCaseHtml;

        // Puts saved keyed sections back; a section with nothing saved goes back to empty.
        function applyKeyed(keyed, root) {
            (root || document).querySelectorAll('[data-keyed][id]').forEach(el => {
                const k = keyed && keyed[el.id];
                if (el.dataset.keyed === 'rows') {
                    el.innerHTML = k && typeof k.html === 'string' ? cleanCaseHtml(k.html) : (_keyedTemplates[el.id] || '');
                    const sels = el.querySelectorAll('select');
                    ((k && k.sels) || []).forEach((v, i) => { if (sels[i]) sels[i].value = v; });
                    return;
                }
                keyedFields(el).forEach((x, i) => {
                    const v = k && k.fields ? k.fields[x.dataset.k || i] : undefined;
                    if (x.tagName === 'SELECT') {
                        if (v !== undefined) x.value = v;
                        else { const d = Array.from(x.options).findIndex(o => o.defaultSelected); x.selectedIndex = d < 0 ? 0 : d; }
                    } else x.innerHTML = v !== undefined ? cleanCaseHtml(v) : '';
                });
            });
            if (!root || root === document) { if (typeof window.afterKeyedApplied === 'function') window.afterKeyedApplied(); }
        }

        function textOf(id) { const el = document.getElementById(id); return el ? el.innerText.trim() : ''; }
        function buildCaseContentPayload() {
            return {
                // trainingLibraryId / program (training-library.js): which Training Library
                // case file a trainee's case is their work on, and which program saved it.
                ...(window.mockPayloadTags ? window.mockPayloadTags() : {}),
                caseType: document.getElementById('main-case-type') ? document.getElementById('main-case-type').value : null,
                caseTypeOther: document.getElementById('main-case-other') ? document.getElementById('main-case-other').innerHTML : '',
                caseTypeOtherVisible: !!(document.getElementById('main-case-other') && !document.getElementById('main-case-other').classList.contains('hidden')),
                // Attorney / Case Manager: plain <input> fields, not
                // contenteditable — deliberately kept OUT of the generic
                // positional `inputs`/`sels` arrays below. Those arrays
                // restore-by-index, so inserting these anywhere in that
                // list would shift every field after them for every case
                // saved before this feature existed. Captured/restored
                // explicitly by id instead, so old saved cases are unaffected.
                attorney: document.getElementById('attorney-field') ? document.getElementById('attorney-field').value : '',
                caseManager: document.getElementById('case-manager-field') ? document.getElementById('case-manager-field').value : '',
                // Case-deadline date fields: same reasoning as attorney/
                // caseManager above — captured explicitly by id so the
                // calendars (functions/_calendar.js)
                // and /api/export-calendar can query them directly as
                // real DB columns instead of parsing them back out of the
                // saved HTML. These divs are STILL also contenteditable and
                // still captured by the generic positional array below as
                // before (only an id was added to them) — this is a second,
                // additive capture for the new columns, not a replacement.
                // NOTE: the summary bar's SOL and the Litigation tab's own
                // separate "Statute (SOL)" field are NOT linked to each
                // other (a pre-existing quirk, not introduced here) — both
                // are captured under distinct keys so neither is silently
                // dropped.
                dateOfLoss: document.getElementById('date-of-loss-field') ? document.getElementById('date-of-loss-field').innerText.trim() : '',
                solBar: document.getElementById('sol-bar-field') ? document.getElementById('sol-bar-field').innerText.trim() : '',
                solLitigation: document.getElementById('sol-litigation-field') ? document.getElementById('sol-litigation-field').innerText.trim() : '',
                complaintFiled: document.getElementById('complaint-filed-field') ? document.getElementById('complaint-filed-field').innerText.trim() : '',
                discoveryCutoff: document.getElementById('discovery-cutoff-field') ? document.getElementById('discovery-cutoff-field').innerText.trim() : '',
                trialDate: document.getElementById('trial-date-field') ? document.getElementById('trial-date-field').innerText.trim() : '',
                // Intake essentials, captured by id (same additive capture as the
                // date fields above) so the Intake folder's automatic checklist
                // (functions/_intake.js) reads them reliably.
                intake: {
                    phone: textOf('client-phone-field'), dob: textOf('client-dob-field'), email: textOf('client-email-field'),
                    address: textOf('client-address-field'), narrative: textOf('case-narrative-field'),
                    emergencyName: textOf('emergency-name-field'), emergencyPhone: textOf('emergency-phone-field')
                },
                html: {
                    pass: savedHtml(document.getElementById('passenger-container')),
                    facs: savedHtml(document.getElementById('facility-container')),
                    chrono: savedHtml(document.getElementById('chrono-container')),
                    fin: savedHtml(document.getElementById('fin-body')),
                    pipum: savedHtml(document.getElementById('pip-um-container')),
                    bi: savedHtml(document.getElementById('bi-container')),
                    docs: savedHtml(document.getElementById('doc-body')),
                    lit: savedHtml(document.getElementById('lit-body')),
                    liens: savedHtml(document.getElementById('lien-container')),
                    notes: savedHtml(document.getElementById('note-body')),
                    tasks: savedHtml(document.getElementById('task-body')),
                    police: savedHtml(document.getElementById('police-body'))
                },
                inputs: posEdits().map(el => el.innerHTML),
                sels: posSels().map(el => el.value),
                keyed: captureKeyed()
            };
        }
        // Applies a content payload (from buildCaseContentPayload / server) into
        // a DOM subtree. root defaults to `document` for loading a case into
        // the real live editor; pass a detached clone of #capture-area to
        // render a READ-ONLY preview of someone else's case without ever
        // touching the current user's own in-progress work (see
        // openMonitorCase() under Monitoring).
        function applyCaseContentToDOM(content, root) {
            root = root || document;
            if (!content) return;
            const $ = (id) => root.querySelector('#' + id);
            const H = (k) => cleanCaseHtml((content.html && content.html[k]) || '');   // someone else's case may be opened: cleaned
            $('passenger-container').innerHTML = H('pass');
            $('facility-container').innerHTML = H('facs');
            $('chrono-container').innerHTML = H('chrono');
            $('fin-body').innerHTML = H('fin');
            $('pip-um-container').innerHTML = H('pipum');
            $('bi-container').innerHTML = H('bi');
            $('doc-body').innerHTML = H('docs');
            $('lit-body').innerHTML = H('lit');
            $('lien-container').innerHTML = H('liens');
            $('note-body').innerHTML = H('notes');
            $('task-body').innerHTML = H('tasks');
            // (html.police: the report's own fields, #police-body; cases saved before the Report Type choice have the same markup)
            if (content.html && content.html.police) $('police-body').innerHTML = H('police');
            if ($('attorney-field')) $('attorney-field').value = content.attorney || '';
            if ($('case-manager-field')) $('case-manager-field').value = content.caseManager || '';

            const edits = posEdits(root);
            (content.inputs || []).forEach((v, i) => { if (edits[i]) edits[i].innerHTML = cleanCaseHtml(v); });
            const selects = savedSelects(root);
            (content.sels || []).forEach((v, i) => { if (selects[i]) selects[i].value = v; });
            fixPhaseSelect(selects, content.sels || []);
            applyKeyed(content.keyed, root);
            // the header's SSN shows the Profile tab's (client-id.js keeps them the same as you type)
            if ($('head-ssn-field') && $('client-ssn-field')) $('head-ssn-field').innerHTML = $('client-ssn-field').innerHTML;
            if ($('head-dob-field') && $('client-dob-field')) $('head-dob-field').innerHTML = $('client-dob-field').innerHTML;

            const mainType = $('main-case-type'), mainOther = $('main-case-other'), mainRevert = $('main-revert');
            if (content.caseTypeOtherVisible && mainType && mainOther) {
                mainType.classList.add('hidden');
                mainOther.classList.remove('hidden');
                mainOther.innerHTML = cleanCaseHtml(content.caseTypeOther || '');
                if (mainRevert) mainRevert.style.display = 'inline-block';
            } else if (content.caseType && mainType) {
                mainType.value = content.caseType;
            }
            if (root === document) {
                if (typeof updateTotals === 'function') updateTotals();
                toggleOwnerExtra();
                toggleDriverInsuredExtra();
            }
        }
        // Walks a (possibly detached) capture-area tree and produces a
        // read-only label:value HTML summary — same extraction approach as
        // downloadPDF()'s card walking, reused here for the Monitoring
        // "view latest saved case" preview so nothing needs a second parallel
        // rendering implementation.
        // An empty copy of the case editor in an inert document, to lay out someone else's case in: nothing
        // in it loads or runs (an <img onerror> typed into a field stays text). Read back with extractReadableSections.
        function inertCaseCopy() {
            const doc = document.implementation.createHTMLDocument('case');
            const root = doc.importNode(_emptyCaptureAreaTemplate, true);
            doc.body.appendChild(root);
            return root;
        }
        function extractReadableSections(root) {
            let html = '';
            // the ⚠ Critical note (case-alerts.js) first: it's in the case header, which has no section of its own here
            const crit = root.querySelector('#kx-critical [data-k="note"]'), critText = crit ? crit.textContent.trim() : '';
            if (critText) html += `<div style="margin-bottom:16px;padding:9px 12px;background:#fef2f2;border:1px solid #fecaca;border-left:5px solid #dc2626;border-radius:8px;font-size:12px;font-weight:700;color:#991b1b;white-space:pre-wrap;">⚠ CRITICAL: ${escapeHtmlAttr(critText)}</div>`;
            root.querySelectorAll('.pdf-card').forEach(card => {
                const header = card.querySelector('.section-head, h3');
                if (!header) return;
                let sectionContent = '';
                card.querySelectorAll('[contenteditable="true"], select').forEach(input => {
                    const val = input.tagName === 'SELECT' ? input.value : input.innerText.trim();
                    if (val) {
                        let labelText = 'Detail';
                        if (input.previousElementSibling && input.previousElementSibling.tagName === 'LABEL') labelText = input.previousElementSibling.innerText;
                        else if (input.closest('div') && input.closest('div').querySelector('label')) labelText = input.closest('div').querySelector('label').innerText;
                        // escaped: these views show what someone else typed (Monitoring, Case Logs, the live view)
                        sectionContent += `<div style="margin-bottom:8px;"><div style="font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase;">${escapeHtmlAttr(labelText)}</div><div style="font-size:12px;font-weight:600;color:#0f2148;white-space:pre-wrap;">${escapeHtmlAttr(val)}</div></div>`;
                    }
                });
                if (sectionContent) {
                    html += `<div style="margin-bottom:16px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                        <div style="background:#0f2148;color:#f97316;font-size:10px;font-weight:800;padding:7px 12px;text-transform:uppercase;">${escapeHtmlAttr(header.innerText)}</div>
                        <div style="padding:12px 14px;">${sectionContent}</div>
                    </div>`;
                }
            });
            return html || '<p style="font-size:12px;color:#94a3b8;">No fields have been filled in yet.</p>';
        }
        function hasCaseContent() {
            // Only a client name typed by the user counts as "real" case content.
            // case-id-field is auto-generated by the system on every page load/reset,
            // so it's never a reliable signal that the user has actually entered anything.
            // A view-only Training Library case isn't the user's work: nothing to
            // autosave, archive on inactivity, or warn about losing.
            if (window.mockIsViewOnly && window.mockIsViewOnly()) return false;
            // Nor is an Admin's edit of a library case: it saves to the library, never as their own case.
            if (window.mockIsLibraryEdit && window.mockIsLibraryEdit()) return false;
            const name = document.getElementById('client-name-field').innerText.trim();
            return !!name;
        }

        /* =========================================================
           IN-PROGRESS EDITOR PERSISTENCE (survives a page refresh)

           This is separate from both the server-side Case Repository
           and the autosave-to-draft mechanism (autoSaveProgress, which
           sends the case to the server only when something interrupts the
           work — see AUTOSAVE ON INTERRUPTIONS — and only once a client name
           exists; it also remembers what the server has, syncedSig). This
           persists whatever is currently sitting in the editor — typed or
           not yet named, finalized or not — under its own key, so an
           accidental refresh/reload never loses in-progress work. It is
           overwritten continuously while editing and cleared whenever the
           user explicitly starts fresh (Start a New Case), or when a case
           is auto-archived/reassigned via the inactivity prompt.
           ========================================================= */
        const CURRENT_DRAFT_KEY = 'LSH_CURRENT_EDITOR_DRAFT_V1';
        let _draftRestoredFor = null; // who restoreCurrentEditorState() last ran for: once per person signing in on this page

        // The draft is the same content a save sends (buildCaseContentPayload: Attorney and Case Manager
        // included, so a refresh never blanks them on the server), plus what the editor needs to carry on,
        // and whose it is (owner): it only ever comes back for that person (restoreCurrentEditorState).
        function persistCurrentEditorState() {
            if (!hasAuthorizedAccess()) return; // never persist a blanked/unauthorized DOM over a real draft
            try {
                const snapshot = Object.assign(buildCaseContentPayload(), {
                    owner: (getRealSession() || {}).username || null,
                    currentCaseId,
                    currentCaseIsDraft,
                    phase: document.getElementById('display-phase') ? document.getElementById('display-phase').innerText : 'INTAKE',
                    currentCaseCanEdit,
                    caseIdFieldText: document.getElementById('case-id-field') ? document.getElementById('case-id-field').innerText : '',
                    mock: window.mockSnapshot ? window.mockSnapshot() : null,
                    syncedSig: _syncedSig,   // what the server has: differs from this case = unsaved work (sent on the next visit)
                    savedAt: new Date().toISOString()
                });
                // said outright, so the next visit doesn't have to work it out (whatever version of the CMS it is)
                snapshot.unsynced = hasCaseContent() && caseSig() !== _syncedSig;
                localStorage.setItem(CURRENT_DRAFT_KEY, JSON.stringify(snapshot));
            } catch (e) { console.warn('Could not persist in-progress case:', e); }
        }

        let _persistDebounceTimer = null;
        function schedulePersistCurrentEditorState() {
            clearTimeout(_persistDebounceTimer);
            _persistDebounceTimer = setTimeout(persistCurrentEditorState, 500);
        }

        function clearPersistedEditorState() {
            try { localStorage.removeItem(CURRENT_DRAFT_KEY); } catch (e) {}
        }

        // Wires up listeners that keep CURRENT_DRAFT_KEY in sync with
        // whatever is currently in the editor. Uses a MutationObserver (in
        // addition to input/change) so dynamically added/removed rows,
        // cards, and document uploads are captured too, not just typing.
        function initEditorPersistence() {
            const root = document.getElementById('capture-area');
            if (!root) return;
            // The Calendar and Time tabs ([data-free-edit]) aren't part of the case: their typing and redraws don't count as edits.
            const inCalendar = (n) => { const el = n && (n.nodeType === 3 ? n.parentElement : n); return !!(el && el.closest && el.closest('[data-free-edit]')); };
            root.addEventListener('input', (e) => { if (!inCalendar(e.target)) schedulePersistCurrentEditorState(); });
            root.addEventListener('change', (e) => { if (!inCalendar(e.target)) schedulePersistCurrentEditorState(); });
            const observer = new MutationObserver((muts) => { if (muts.some(m => !inCalendar(m.target))) schedulePersistCurrentEditorState(); });
            observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'value'] });
        }

        // Restores whatever was last persisted. Only called once per page
        // load, right after we've confirmed the session is authorized, so
        // it never fires while the editor is being kept blank for a
        // logged-out/locked-out viewer.
        function restoreCurrentEditorState() {
            if (!hasAuthorizedAccess()) return false;
            let raw;
            try { raw = localStorage.getItem(CURRENT_DRAFT_KEY); } catch (e) { return false; }
            if (!raw) return false;
            let data;
            try { data = JSON.parse(raw); } catch (e) { return false; }
            if (!data) return false;
            // Someone else's work on this computer (a shared one) never comes back for the next person.
            const me = (getRealSession() || {}).username;
            if (data.owner && data.owner !== me) return false;
            // A view-only Training Library case is reopened fresh from mock-cases.js.
            if (data.mock && window.mockRestore && window.mockRestore(data.mock)) return true;
            try {
                applyCaseContentToDOM(data, document);

                currentCaseId = (typeof data.currentCaseId === 'number') ? data.currentCaseId : null;
                currentCaseIsDraft = !!data.currentCaseIsDraft;
                currentCaseCanEdit = (typeof data.currentCaseCanEdit === 'boolean') ? data.currentCaseCanEdit : true;

                if (currentCaseId !== null && !currentCaseIsDraft && data.caseIdFieldText) {
                    document.getElementById('case-id-field').innerText = data.caseIdFieldText;
                } else {
                    generateCaseId();
                }
                if (data.phase) updatePhaseDisplay(data.phase);
                // A draft that was in step with the server when it was kept has nothing to send: what's on the page now
                // is the server's copy (drawn by this version of the CMS). Only work the server never got is sent.
                const nameText = (document.getElementById('client-name-field') || {}).innerText || '';
                const inStep = data.unsynced === false || (data.unsynced === undefined && !!data.syncedSig && draftSig(data, nameText) === data.syncedSig);
                if (inStep) { noteServerCopy(); return true; }
                // Work the server never got (the page closed, crashed or lost power first): send it now.
                _syncedSig = data.syncedSig || null;
                const recover = () => setTimeout(() => saveOnInterruption('recovered'), 1500);
                // A draft kept before drafts held Attorney and Case Manager: take those two from the server's copy
                // first, so sending the recovered work doesn't blank them. If that can't be read, nothing is sent.
                if (!('attorney' in data) && currentCaseId !== null) {
                    const id = currentCaseId;
                    fetch('/api/case-repository?id=' + encodeURIComponent(id), { credentials: 'include' }).then(r => r.json()).then(d => {
                        const c = d && d.success && d.case && d.case.content;
                        if (!c || currentCaseId !== id) return;
                        const a = document.getElementById('attorney-field'), m = document.getElementById('case-manager-field');
                        if (a && !a.value) a.value = c.attorney || '';
                        if (m && !m.value) m.value = c.caseManager || '';
                        persistCurrentEditorState();
                        recover();
                    }).catch(() => {});
                } else recover();
                return true;
            } catch (e) {
                console.warn('Could not restore in-progress case:', e);
                return false;
            }
        }

        /* ---------- New Case ---------- */
        function newCase() {
            if (hasCaseContent() && !confirm('Start a new case? Any unsaved progress on this case will be lost.')) return;
            if (window.mockConfirmLeave && !window.mockConfirmLeave()) return; // unsaved changes to a Training Library case
            blankCaseEditorContent(); // wipes all case fields and sets currentCaseId = null
            clearPersistedEditorState(); // don't let a refresh bring back the case we just discarded
            currentCaseIsDraft = false;
            revertOther('main-case-type', 'main-case-other', 'main-revert'); // reset case type back to default
            updatePhaseDisplay('INTAKE');
            // Not saved yet, so no permanent number is consumed — this just
            // shows a fresh live preview based on how many cases are actually
            // saved so far.
            generateCaseId();
            showTab('profile');
            renderRepo();
        }

        /* ---------- Close Case ----------
           ✕ at the top right of the case, or Close in the bar at the bottom of the case: closes the
           case in the editor and leaves it blank. A saved case stays saved; anything not saved yet is
           lost, so it asks first when the case has a client name. Goes through newCase() (and the
           modules that follow it: Intake mode, the calendar tab, the timer). */
        function closeCase() {
            const libCase = !!(window.mockSnapshot && window.mockSnapshot().mockId);
            const content = hasCaseContent();
            if (!content && currentCaseId === null && !libCase && !document.body.classList.contains('intake-mode')) { showToast('No case is open.', 'info'); return; }
            if (content && !confirm('Close this case? Anything not saved yet is lost. Save it first if you need it.')) return;
            if (content) document.getElementById('client-name-field').innerText = ''; // already asked: newCase() needn't ask again
            window.newCase();
            if (window.mockSnapshot && window.mockSnapshot().mockId) return; // an Admin kept unsaved changes to a Training Library case
            showToast('Case closed.', 'info');
        }

        /* ---------- Discard Case ----------
           🗑 Discard Case in the bar at the bottom of the case: throws the open case away. A saved case
           or draft is deleted from the Case Repository (the same as its 🗑 in My cases) and the editor
           goes blank; a case that was never saved is just cleared. Asks first either way. */
        async function discardCase() {
            if (window.mockSnapshot && window.mockSnapshot().mockId) { showToast('A case file from the library can\'t be discarded. Use Close instead.', 'info'); return; }
            if (document.body.classList.contains('intake-mode')) { showToast('This is an intake, not a case. Use the Intake bar above the case.', 'info'); return; }
            const name = (document.getElementById('client-name-field').textContent || '').trim().slice(0, 80);   // as typed (the field shows it in capitals)
            if (currentCaseId === null) {
                if (!hasCaseContent()) { showToast('No case is open.', 'info'); return; }
                if (!confirm('Discard this case? It was never saved, so everything typed in it is lost.')) return;
            } else {
                if (!currentCaseCanEdit) { showToast('Only the trainee who saved this case, or an Admin, can discard it.', 'error'); return; }
                if (!confirm('Discard ' + (name || 'this case') + '? It is deleted from the saved cases and can\'t be undone.')) return;
                try {
                    const res = await fetch('/api/case-repository?id=' + encodeURIComponent(currentCaseId), { method: 'DELETE', credentials: 'include' });
                    const data = await res.json();
                    if (!data || !data.success) { showToast((data && data.error) || 'Could not discard that case.', 'error'); return; }
                } catch (e) { showToast('Network error discarding that case.', 'error'); return; }
                currentCaseId = null; currentCaseIsDraft = false; currentCaseCanEdit = true;
                refreshRepoCache();
            }
            document.getElementById('client-name-field').innerText = ''; // already asked: newCase() needn't ask again
            window.newCase();
            showToast('Case discarded.', 'info');
        }

        /* ---------- Export My Calendar (.ics) ----------
           Not a live Google Calendar connection — generates a downloadable
           .ics file of every date-bearing deadline across cases the
           logged-in user can see (own cases + all finalized cases, or
           everything if Admin), which they then import into their own
           Google Calendar via Settings > Import & export > Import. See
           functions/api/export-calendar.js for the generation side. */
        async function exportMyCalendar() {
            try {
                const res = await fetch('/api/export-calendar', { credentials: 'include' });
                if (!res.ok) {
                    let msg = 'Could not generate calendar (' + res.status + ')';
                    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
                    showToast(msg, 'error');
                    return;
                }
                const eventCount = res.headers.get('X-Event-Count');
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'my-case-calendar.ics';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                showToast(
                    (eventCount !== null ? eventCount + ' event(s)' : 'Calendar') + ' downloaded — import it into Google Calendar via Settings > Import & export.',
                    'info'
                );
            } catch (e) {
                showToast('Network error generating calendar.', 'error');
            }
        }

        /* ---------- Trainee Dashboard (Phase 1: rule-based automated review) ----------
           Same full-page overlay pattern as Master Control
           (#trainee-dashboard-page + .open, mirroring #master-control-page).
           A Trainee sees only their own review feed, read-only. An Admin
           gets a trainee picker and can add/edit trainer notes per entry —
           see functions/api/trainee-dashboard.js and review-comment.js. */
        function openTraineeDashboard() {
            const session = getSession();
            if (!session) return;
            document.getElementById('trainee-dashboard-page').classList.add('open');
            document.body.classList.add('mc-active');
            if (session.userType === 'Admin') {
                showTrainerRoster();
            } else {
                document.getElementById('trainee-dash-picker').style.display = 'none';
                document.getElementById('trainer-roster-back-btn').style.display = 'none';
                document.getElementById('trainer-roster-container').style.display = 'none';
                document.getElementById('trainee-dash-title').innerText = 'My Dashboard';
                document.getElementById('trainee-dash-sub').innerText = 'Automated Case Review';
                loadTraineeDashboard(session.username);
            }
        }
        function closeTraineeDashboard() {
            document.getElementById('trainee-dashboard-page').classList.remove('open');
            document.body.classList.remove('mc-active');
        }

        /* ---------- Trainer Roster (Admin: all trainees at a glance) ----------
           The Admin's DEFAULT view when opening the dashboard — a table of
           every trainee with a health dot and both trends (completeness +
           AI writing quality), see functions/api/trainer-roster.js.
           Clicking a row drills into that trainee's existing full feed
           (loadTraineeDashboard, already built) via showTraineeDetail(). */
        function showTrainerRoster() {
            document.getElementById('trainer-roster-container').style.display = '';
            document.getElementById('trainee-dash-list').innerHTML = '';
            document.getElementById('trainee-dash-empty').style.display = 'none';
            document.getElementById('trainee-dash-picker').style.display = 'none';
            document.getElementById('trainer-roster-back-btn').style.display = 'none';
            document.getElementById('trainee-dash-title').innerText = 'Trainer Roster';
            document.getElementById('trainee-dash-sub').innerText = 'All Trainees — Progress at a Glance';
            loadTrainerRoster();
        }

        function loadTrainerRoster() {
            const body = document.getElementById('trainer-roster-body');
            const empty = document.getElementById('trainer-roster-empty');
            body.innerHTML = '<tr><td colspan="6" style="color:#94a3b8; font-size:12px;">Loading…</td></tr>';
            empty.style.display = 'none';
            fetch('/api/trainer-roster', { credentials: 'include' })
                .then(r => r.json())
                .then(data => {
                    if (!data || !data.success) {
                        body.innerHTML = '';
                        empty.style.display = 'block';
                        empty.innerText = (data && data.error) || 'Could not load the roster.';
                        return;
                    }
                    renderTrainerRoster(data.roster || []);
                })
                .catch(() => {
                    body.innerHTML = '';
                    empty.style.display = 'block';
                    empty.innerText = 'Network error loading the roster.';
                });
        }

        function renderTrainerRoster(roster) {
            const body = document.getElementById('trainer-roster-body');
            const empty = document.getElementById('trainer-roster-empty');
            if (!roster.length) {
                body.innerHTML = '';
                empty.style.display = 'block';
                return;
            }
            empty.style.display = 'none';
            const esc = s => String(s == null ? '' : s).replace(/</g, '&lt;');

            function completenessTrend(c) {
                if (!c || !c.earliest || !c.latest) return '<span class="roster-no-data">No cases yet</span>';
                const before = c.earliest.fails * 10 + c.earliest.warnings; // fails weigh more for direction
                const after = c.latest.fails * 10 + c.latest.warnings;
                const arrow = after < before ? '↑' : (after > before ? '↓' : '→');
                const cls = after < before ? 'up' : (after > before ? 'down' : 'flat');
                return `<div class="roster-trend"><span>${c.earliest.fails}F/${c.earliest.warnings}W</span><span class="roster-trend-arrow ${cls}">${arrow}</span><span>${c.latest.fails}F/${c.latest.warnings}W</span></div>`;
            }
            function writingTrend(w) {
                if (!w || w.earliest === null || w.latest === null) return '<span class="roster-no-data">No AI reviews yet</span>';
                const arrow = w.latest > w.earliest ? '↑' : (w.latest < w.earliest ? '↓' : '→');
                const cls = w.latest > w.earliest ? 'up' : (w.latest < w.earliest ? 'down' : 'flat');
                return `<div class="roster-trend"><span>${w.earliest}/5</span><span class="roster-trend-arrow ${cls}">${arrow}</span><span>${w.latest}/5</span></div>`;
            }

            body.innerHTML = roster.map(t => `
                <tr onclick="drillIntoTrainee('${t.username.replace(/'/g, "\\'")}')">
                    <td><span class="roster-health-dot ${t.health}"></span></td>
                    <td><span class="roster-name">${esc(t.fullName)}</span>${t.via ? ` <span class="roster-via" title="Signed in with just their name from this training platform">via ${esc(t.via)}</span>` : ''}</td>
                    <td>${t.distinctCases}</td>
                    <td>${t.lastActiveDay ? 'Day ' + t.lastActiveDay : '—'}</td>
                    <td>${completenessTrend(t.completeness)}</td>
                    <td>${writingTrend(t.writingQuality)}</td>
                </tr>
            `).join('');
        }

        function drillIntoTrainee(username) {
            document.getElementById('trainer-roster-container').style.display = 'none';
            document.getElementById('trainer-roster-back-btn').style.display = '';
            document.getElementById('trainee-dash-picker').style.display = '';
            populateTraineeDashPicker(username);
        }

        function populateTraineeDashPicker(preselectUsername) {
            const picker = document.getElementById('trainee-dash-picker');
            picker.innerHTML = '<option value="">Loading trainees…</option>';
            fetch('/api/users', { credentials: 'include' })
                .then(r => r.json())
                .then(users => {
                    users = Array.isArray(users) ? users : [];
                    const trainees = users.filter(u => u.user_type === 'Trainee')
                        .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
                    if (!trainees.length) {
                        picker.innerHTML = '<option value="">No trainees registered yet</option>';
                        document.getElementById('trainee-dash-list').innerHTML = '';
                        const empty = document.getElementById('trainee-dash-empty');
                        empty.style.display = 'block';
                        empty.innerText = 'No trainees registered yet.';
                        return;
                    }
                    picker.innerHTML = trainees.map(t =>
                        `<option value="${t.username}">${(t.full_name || t.username).replace(/"/g, '&quot;')}</option>`
                    ).join('');
                    const target = (preselectUsername && trainees.some(t => t.username === preselectUsername))
                        ? preselectUsername
                        : trainees[0].username;
                    picker.value = target;
                    loadTraineeDashboard(target);
                })
                .catch(() => { picker.innerHTML = '<option value="">Could not load trainees</option>'; });
        }

        function loadTraineeDashboard(username) {
            const session = getSession();
            const isAdminView = !!(session && session.userType === 'Admin');
            const list = document.getElementById('trainee-dash-list');
            const empty = document.getElementById('trainee-dash-empty');
            list.innerHTML = '<p style="font-size:12px;color:#94a3b8;">Loading…</p>';
            empty.style.display = 'none';
            if (isAdminView) {
                const picker = document.getElementById('trainee-dash-picker');
                const selectedOption = picker.options[picker.selectedIndex];
                document.getElementById('trainee-dash-title').innerText = selectedOption ? selectedOption.innerText : username;
                document.getElementById('trainee-dash-sub').innerText = 'Automated Case Review — ' + username;
            }
            fetch('/api/trainee-dashboard?username=' + encodeURIComponent(username), { credentials: 'include' })
                .then(r => r.json())
                .then(data => {
                    if (!data || !data.success) {
                        list.innerHTML = '';
                        empty.style.display = 'block';
                        empty.innerText = (data && data.error) || 'Could not load this dashboard.';
                        return;
                    }
                    renderTraineeDashboardEntries(data.entries || [], isAdminView);
                })
                .catch(() => {
                    list.innerHTML = '';
                    empty.style.display = 'block';
                    empty.innerText = 'Network error loading dashboard.';
                });
        }

        // Phase 2: renders the AI-powered document-vs-narrative review for
        // one dashboard entry (see functions/_ai-review.js). Returns ''
        // (nothing) when no AI review has ever been triggered for this
        // entry — e.g. no document was uploaded/changed that day — so the
        // dashboard doesn't show an empty box for every ordinary save.
        function renderAiReviewBlock(e) {
            const esc = s => String(s == null ? '' : s).replace(/</g, '&lt;');
            if (!e.aiReviewStatus) {
                // Doc Hub changed this save but the background AI call
                // hasn't written its result yet (it runs after the save's
                // response already returned) — only show this if we know
                // one is actually expected, not for every ordinary entry.
                const docsChanged = (e.changedSections || []).some(c => c.key === 'docs');
                if (!docsChanged) return '';
                return `<div class="review-ai-box review-ai-pending"><label>Review</label><div class="review-ai-pending-text">Running — check back in a moment.</div></div>`;
            }
            if (e.aiReviewStatus === 'skipped') {
                return `<div class="review-ai-box review-ai-skipped"><label>Review</label><div class="review-ai-pending-text">${esc(e.aiReview && e.aiReview.reason)}</div></div>`;
            }
            if (e.aiReviewStatus === 'failed') {
                return `<div class="review-ai-box review-ai-failed"><label>Review</label><div class="review-ai-pending-text">Could not complete: ${esc(e.aiReview && e.aiReview.reason)}</div></div>`;
            }
            const r = e.aiReview || {};
            const score = r.writingQualityScore;
            const stars = (typeof score === 'number') ? '★'.repeat(score) + '☆'.repeat(5 - score) : '';
            const list = (items, cls) => (items && items.length)
                ? `<ul class="review-ai-list ${cls}">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
                : '';
            return `
                <div class="review-ai-box">
                    <label>Review${stars ? ` <span class="review-ai-stars">${stars}</span>` : ''}</label>
                    ${r.writingQualitySummary ? `<div class="review-ai-summary">${esc(r.writingQualitySummary)}</div>` : ''}
                    ${(r.consistencyIssues && r.consistencyIssues.length) ? `<div class="review-ai-sublabel">Consistency Issues</div>${list(r.consistencyIssues, 'issues')}` : ''}
                    ${(r.strengths && r.strengths.length) ? `<div class="review-ai-sublabel">Strengths</div>${list(r.strengths, 'strengths')}` : ''}
                    ${(r.concerns && r.concerns.length) ? `<div class="review-ai-sublabel">Concerns</div>${list(r.concerns, 'concerns')}` : ''}
                </div>
            `;
        }

        function renderTraineeDashboardEntries(entries, isAdminView) {
            const list = document.getElementById('trainee-dash-list');
            const empty = document.getElementById('trainee-dash-empty');
            if (!entries.length) {
                list.innerHTML = '';
                empty.style.display = 'block';
                empty.innerText = 'No case reviews yet — a review is generated automatically each time a case is saved.';
                return;
            }
            empty.style.display = 'none';

            // Entries arrive newest-first from the API; group consecutive
            // entries that share a training day under one heading.
            const groups = [];
            let currentDay;
            let currentGroup = null;
            entries.forEach(e => {
                const dayLabel = e.trainingDay ? ('Day ' + e.trainingDay) : 'Day —';
                if (dayLabel !== currentDay) {
                    currentDay = dayLabel;
                    currentGroup = { label: dayLabel, items: [] };
                    groups.push(currentGroup);
                }
                currentGroup.items.push(e);
            });

            const badgeIcon = { pass: '✓', warning: '!', fail: '✕' };
            const esc = s => String(s == null ? '' : s).replace(/</g, '&lt;');

            list.innerHTML = groups.map(g => `
                <div class="review-day-group">
                    <div class="review-day-label">${g.label}</div>
                    ${g.items.map(e => `
                        <div class="review-entry">
                            <div class="review-entry-header">
                                <div class="review-entry-case">${esc(e.clientName || 'Unnamed Client')}${e.caseId ? ' · ' + esc(e.caseId) : ''}</div>
                                <div class="review-entry-time">${new Date(e.createdAt).toLocaleString()}</div>
                            </div>
                            <div class="review-finding-list">
                                ${e.findings.map(f => `
                                    <div class="review-finding">
                                        <div class="review-finding-badge ${f.status}">${badgeIcon[f.status] || '?'}</div>
                                        <div class="review-finding-text"><span class="review-finding-check">${esc(f.check)}:</span> ${esc(f.message)}</div>
                                    </div>
                                `).join('')}
                            </div>
                            ${(e.changedSections && e.changedSections.length) ? `
                                <div class="review-changed-box">
                                    <label>What Was Updated</label>
                                    <div class="review-changed-list">
                                        ${e.changedSections.map(c => `
                                            <span class="review-changed-chip ${c.wasEmpty ? 'added' : (c.isEmpty ? 'cleared' : 'edited')}">${esc(c.label)}${c.wasEmpty ? ' (added)' : (c.isEmpty ? ' (cleared)' : '')}</span>
                                        `).join('')}
                                    </div>
                                </div>
                            ` : ''}
                            ${renderAiReviewBlock(e)}
                            ${isAdminView ? `
                                <div class="review-comment-box">
                                    <label>Trainer Notes</label>
                                    <textarea id="comment-${e.id}">${esc(e.trainerComment)}</textarea>
                                    <div style="margin-top:6px; display:flex; justify-content:flex-end;">
                                        <button class="btn-primary" style="padding:6px 14px; font-size:10px; border-radius:5px;" onclick="saveTrainerComment(${e.id})">Save Note</button>
                                    </div>
                                    ${e.trainerComment && e.commentUpdatedAt ? `<div class="review-comment-meta">— ${esc(e.trainerName || e.trainerUsername || 'Trainer')}, ${new Date(e.commentUpdatedAt).toLocaleString()}</div>` : ''}
                                </div>
                            ` : e.trainerComment ? `
                                <div class="review-comment-box">
                                    <label>📝 Note from your trainer</label>
                                    <div class="review-comment-readonly">${esc(e.trainerComment)}</div>
                                    ${e.commentUpdatedAt ? `<div class="review-comment-meta">— ${esc(e.trainerName || 'Your trainer')}, ${new Date(e.commentUpdatedAt).toLocaleString()}</div>` : ''}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            `).join('');
        }

        function saveTrainerComment(reviewId) {
            const textarea = document.getElementById('comment-' + reviewId);
            if (!textarea) return;
            fetch('/api/review-comment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ reviewId, comment: textarea.value })
            })
                .then(r => r.json())
                .then(data => {
                    if (data && data.success) {
                        showToast('Trainer note saved.', 'info');
                    } else {
                        showToast((data && data.error) || 'Could not save note.', 'error');
                    }
                })
                .catch(() => showToast('Network error saving note.', 'error'));
        }

        /* ---------- Save Case (permanent — assigns the real Case ID) ----------
           If this case has never been permanently saved before (a brand-new
           case, or a draft opened via "Archive Case (Save as Draft)"), a real
           Case ID is minted server-side right now. If the case was already
           finalized, its existing Case ID is kept and this just re-saves the
           latest content. Blocked client-side (and enforced server-side) for
           anyone viewing a foreign case who isn't its owner or an Admin. */
        // opts.quiet (the New Intake form, intake-form.js): no alerts; it returns { ok, caseId, error } and the caller says what happened.
        async function saveCase(opts) {
            const quiet = !!(opts && opts.quiet);
            if (window.mockBlocksSave && window.mockBlocksSave()) return quiet ? { ok: false, error: 'This case can\'t be saved here.' } : undefined; // view-only Training Library case
            if (currentCaseId !== null && !currentCaseCanEdit) {
                showToast('You can only view this case — only its owner or an Admin can modify it.', 'error');
                return quiet ? { ok: false, error: 'You can only view this case.' } : undefined;
            }
            const content = buildCaseContentPayload();
            const clientName = (document.getElementById('client-name-field').innerText.split('\n')[0] || 'Unnamed Client').trim();
            const phase = document.getElementById('display-phase').innerText;
            const medTotal = document.getElementById('med-total') ? document.getElementById('med-total').innerText : '';
            const gen = _editorGen, sig = caseSig();   // what's being sent (typing during the save is still unsaved)
            try {
                const res = await fetch('/api/case-repository', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        id: currentCaseId, content, clientName, phase, medTotal,
                        isDraft: false, finalize: true, typeCode: currentTypeCode()
                    })
                });
                const data = await res.json();
                if (!data || !data.success) {
                    if (quiet) return { ok: false, error: (data && data.error) || 'Unknown error.' };
                    alert('Could not save: ' + ((data && data.error) || 'Unknown error.')); return;
                }
                if (gen !== _editorGen) {   // the editor moved on to another case while this one was saving
                    refreshRepoCache();
                    if (quiet) return { ok: true, caseId: data.caseId };
                    showToast(`${clientName} was saved (Case ID ${data.caseId}).`, 'success'); return;
                }
                const wasAlreadyFinal = (currentCaseId !== null && !currentCaseIsDraft);
                currentCaseId = data.id;
                currentCaseIsDraft = false;
                currentCaseCanEdit = true;
                document.getElementById('case-id-field').innerText = data.caseId;
                noteServerCopy(sig);
                persistCurrentEditorState();
                refreshRepoCache();
                // files uploaded before the case had its ID take it now, and that's saved too (once)
                if (renameNoCaseIdFiles(data.caseId)) await saveCase({ quiet: true });
                if (quiet) return { ok: true, caseId: data.caseId };
                alert(wasAlreadyFinal ? 'Case saved.' : `Case saved. Case ID ${data.caseId} has been permanently assigned.`);
            } catch (e) {
                if (quiet) return { ok: false, error: 'Network error while saving.' };
                alert('Network error while saving. Check your connection and try again.');
            }
        }

        /* ---------- Archive Case (Save as Draft) ----------
           Saves current progress WITHOUT assigning a permanent Case ID. Open
           this draft later and click "Save Case" to finalize it and get its
           real, permanent Case ID. If the currently loaded case is ALREADY
           finalized, archiving creates a separate NEW draft rather than
           downgrading the finalized case back into a draft. */
        async function archiveCaseAsDraft() {
            if (window.mockIsMine && window.mockIsMine()) return saveCase(); // a trainee's work on a case file is saved as their own case, never as a draft
            if (window.mockBlocksSave && window.mockBlocksSave()) return; // view-only Training Library case
            if (currentCaseId !== null && !currentCaseCanEdit) {
                showToast('You can only view this case — only its owner or an Admin can modify it.', 'error');
                return;
            }
            const content = buildCaseContentPayload();
            const clientName = (document.getElementById('client-name-field').innerText.split('\n')[0] || 'Unnamed Client').trim();
            const phase = document.getElementById('display-phase').innerText;
            const medTotal = document.getElementById('med-total') ? document.getElementById('med-total').innerText : '';
            const targetId = (currentCaseId !== null && currentCaseIsDraft) ? currentCaseId : null;
            const gen = _editorGen, sig = caseSig();
            try {
                const res = await fetch('/api/case-repository', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ id: targetId, content, clientName, phase, medTotal, isDraft: true })
                });
                const data = await res.json();
                if (!data || !data.success) { alert('Could not archive: ' + ((data && data.error) || 'Unknown error.')); return; }
                if (gen !== _editorGen) { refreshRepoCache(); showToast(`${clientName} was archived as a draft.`, 'success'); return; }   // the editor moved on meanwhile
                currentCaseId = data.id;
                currentCaseIsDraft = true;
                currentCaseCanEdit = true;
                generateCaseId();
                noteServerCopy(sig);
                persistCurrentEditorState();
                refreshRepoCache();
                alert('Case archived as a draft. No Case ID has been assigned yet — open this draft and use "Save Case" whenever you\'re ready to finalize it.');
            } catch (e) {
                alert('Network error while archiving. Check your connection and try again.');
            }
        }
        async function updateCase() {
            if (window.mockBlocksSave && window.mockBlocksSave()) return; // view-only Training Library case
            if (currentCaseId === null && window.mockIsMine && window.mockIsMine()) return saveCase(); // the first save of a trainee's work on a case file
            if (currentCaseId === null) {
                alert("No saved case is currently open to update. Load a case from the repository first, or use \"Archive Case (Save as Draft)\" / \"Save Case\" to save this as a new one.");
                return;
            }
            if (!currentCaseCanEdit) {
                showToast('You can only view this case — only its owner or an Admin can modify it.', 'error');
                return;
            }
            const content = buildCaseContentPayload();
            const clientName = (document.getElementById('client-name-field').innerText.split('\n')[0] || 'Unnamed Client').trim();
            const phase = document.getElementById('display-phase').innerText;
            const medTotal = document.getElementById('med-total') ? document.getElementById('med-total').innerText : '';
            const gen = _editorGen, sig = caseSig();
            try {
                const res = await fetch('/api/case-repository', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    // No isDraft/finalize here — the server keeps this case's
                    // existing draft/final status exactly as it was.
                    body: JSON.stringify({ id: currentCaseId, content, clientName, phase, medTotal })
                });
                const data = await res.json();
                if (!data || !data.success) { alert('Could not update: ' + ((data && data.error) || 'Unknown error.')); return; }
                if (gen !== _editorGen) { refreshRepoCache(); showToast(`${clientName} was updated.`, 'success'); return; }   // the editor moved on meanwhile
                noteServerCopy(sig);
                persistCurrentEditorState();
                refreshRepoCache();
                alert("Saved case updated.");
            } catch (e) {
                alert('Network error while updating. Check your connection and try again.');
            }
        }

        /* ---------- Autosave (background, silent) ----------
           Never on a timer and never while you work: every server request counts toward the account's
           monthly requests. Your work is kept in this browser as you type (persistCurrentEditorState),
           and autosave sends it to the server only when something interrupts it (AUTOSAVE ON
           INTERRUPTIONS, below) or after 5 minutes idle (the inactivity prompt).
           Saves to the server repository: creates a new draft if this case has
           never been saved before, or updates the existing row in place
           otherwise — WITHOUT touching its current draft/final status (an
           already-finalized case stays finalized; autosave never downgrades
           it back to a draft). Silent by design — failures don't interrupt
           the user, since this runs in the background.
           opts.keepalive: the page is closing, so the request is sent to outlive it (when it's small
           enough for the browser to allow; a bigger case waits in this browser for the next visit). */
        async function autoSaveProgress(reason, opts) {
            if (!hasCaseContent()) return false; // nothing meaningful to save yet
            if (currentCaseId !== null && !currentCaseCanEdit) return false; // viewing a foreign case — never autosave over it
            const content = buildCaseContentPayload();
            const clientName = (document.getElementById('client-name-field').innerText.split('\n')[0] || 'Unnamed Client').trim();
            const phase = document.getElementById('display-phase').innerText;
            const medTotal = document.getElementById('med-total') ? document.getElementById('med-total').innerText : '';
            const sig = caseSig(), gen = _editorGen;
            // A trainee's work on a Training Library case file is their own case for that file, never a draft
            // (the server keeps one per trainee per file).
            const mine = !!(window.mockIsMine && window.mockIsMine());
            try {
                const body = JSON.stringify(currentCaseId !== null
                    ? { id: currentCaseId, content, clientName, phase, medTotal }
                    : mine ? { content, clientName, phase, medTotal, isDraft: false, finalize: true, typeCode: currentTypeCode() }
                    : { content, clientName, phase, medTotal, isDraft: true });
                const res = await fetch('/api/case-repository', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    keepalive: !!(opts && opts.keepalive) && body.length < 60000,
                    body
                });
                const data = await res.json();
                if (!data || !data.success) return false;
                if (gen !== _editorGen) { refreshRepoCache(); return true; }   // saved; the editor holds another case now
                currentCaseId = data.id;
                if (typeof data.isDraft === 'boolean') currentCaseIsDraft = data.isDraft;
                if (mine && data.caseId) document.getElementById('case-id-field').innerText = data.caseId;
                noteServerCopy(sig);
                persistCurrentEditorState();
                flashAutoSaveIndicator(reason);
                refreshRepoCache();
                return true;
            } catch (e) {
                return false; // silent — autosave failures shouldn't interrupt the user
            }
        }
        function flashAutoSaveIndicator(reason, text) {
            const el = document.getElementById('autosave-indicator');
            if (!el) return;
            const stamp = new Date().toLocaleTimeString();
            el.innerText = text || (/back-online/.test(reason || '') ? `Saved when the connection came back · ${stamp}`
                : /recovered/.test(reason || '') ? `Unsaved work from your last visit saved · ${stamp}`
                : (window.mockIsMine && window.mockIsMine()) ? `Autosaved · ${stamp}`
                : `Autosaved as draft · ${stamp}`);
            el.style.opacity = '1';
            clearTimeout(flashAutoSaveIndicator._t);
            if (!text) flashAutoSaveIndicator._t = setTimeout(() => { el.style.opacity = '0.55'; }, 4000);
        }

        // What the server has for the case in the editor: a fingerprint of it (_syncedSig, declared with
        // currentCaseId), taken whenever the case is saved to or opened from the server. Autosave sends the
        // case only when it differs (unsaved work).
        function sigOf(payload, nameText, phaseText) {
            // the case's own dropdowns only: the clock's time zone or the program picker changing isn't an edit
            const own = savedSelects(document);
            const p = Object.assign({}, payload, { sels: (payload.sels || []).map((v, i) => (own[i] ? v : null)) });
            const t = JSON.stringify([p, nameText || '', phaseText || '']);
            let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); }
            return (h >>> 0).toString(16) + '.' + t.length;
        }
        function caseSig() {
            try {
                return sigOf(buildCaseContentPayload(), (document.getElementById('client-name-field') || {}).innerText || '', (document.getElementById('display-phase') || {}).innerText || '');
            } catch (e) { return null; }
        }
        // The fingerprint of a kept draft as it was kept: its own content, not the page a newer version of the CMS draws
        // from it (a new version may draw the same case a little differently: a button added to old rows, a link made
        // safer). So "was this draft in step with the server when it was kept?" doesn't depend on the version.
        const DRAFT_EXTRAS = new Set(['owner', 'currentCaseId', 'currentCaseIsDraft', 'phase', 'currentCaseCanEdit', 'caseIdFieldText', 'mock', 'syncedSig', 'unsynced', 'savedAt']);
        function draftSig(data, nameText) {
            try {
                const p = {};
                Object.keys(data).forEach(k => { if (!DRAFT_EXTRAS.has(k)) p[k] = data[k]; });
                return sigOf(p, nameText, data.phase || '');
            } catch (e) { return null; }
        }
        function noteServerCopy(sig) { _syncedSig = sig || caseSig(); }
        function hasUnsyncedChanges() { return hasCaseContent() && caseSig() !== _syncedSig; }

        // In-memory cache of the case list (metadata only, no field content —
        // content is fetched separately per-case via loadCase()/openMonitorCase()
        // only when actually needed, since it can be large). Refreshed after
        // every save/update/delete and on a light background poll so users
        // passively see other people's changes to the shared repository.
        let _repoCache = [];
        let _activeUsersCache = []; // last-fetched Approved/Suspended users — feeds the Ping recipient dropdown
        async function refreshRepoCache() {
            if (!hasAuthorizedAccess()) { _repoCache = []; renderRepo(); if (window.renderCaseLibrary) renderCaseLibrary(); return; }
            try {
                const res = await fetch('/api/case-repository', { credentials: 'include' });
                const data = await res.json();
                if (data && data.success) _repoCache = data.cases || [];
            } catch (e) { /* keep showing the last-known cache on a transient network error */ }
            renderRepo();
            if (window.renderCaseLibrary) renderCaseLibrary();
            renderCaseLogs();
        }
        // Passive background refresh so shared changes show up without a manual reload: every minute
        // while the tab is in view (each save refreshes it too), and when the tab comes back into view.
        const REPO_REFRESH_MS = 60000;
        let _repoRefreshAt = Date.now();
        setInterval(() => { if (!document.hidden) { _repoRefreshAt = Date.now(); refreshRepoCache(); } }, REPO_REFRESH_MS);
        document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - _repoRefreshAt > REPO_REFRESH_MS) { _repoRefreshAt = Date.now(); refreshRepoCache(); } });

        // The sidebar doesn't list everyone's cases. Saved cases go into the
        // Case Library with the Training Library mock cases, and show here
        // only as results of the sidebar search (case-library.js).
        function renderRepo() {
            const list = document.getElementById('repo-list');
            const countNote = document.getElementById('repo-count-note');
            if (!hasAuthorizedAccess()) {
                if (list) { list.innerHTML = ''; list.dataset.blanked = 'true'; }
                if (countNote) countNote.innerText = '';
                return;
            }
            if (list) delete list.dataset.blanked;
            if (window.renderCaseLibrarySidebar) window.renderCaseLibrarySidebar();
        }
        let _loadSeq = 0;
        async function loadCase(id) {
            if (!hasAuthorizedAccess()) return; // blocked: not logged in, or site is locked
            if (window.mockConfirmLeave && !window.mockConfirmLeave()) return; // unsaved changes to a Training Library case
            // Work in the editor the server doesn't have yet would be lost: ask first (as New and Close do).
            if (currentCaseId !== id && !(window.mockSnapshot && window.mockSnapshot().mockId) && hasUnsyncedChanges()
                && !confirm('Open this case? Changes to the case in the editor that aren\'t saved yet will be lost. Cancel, then Save or Update, to keep them.')) return;
            const seq = ++_loadSeq;   // clicked another case meanwhile: only the last one opens
            try {
                const res = await fetch('/api/case-repository?id=' + encodeURIComponent(id), { credentials: 'include' });
                const data = await res.json();
                if (seq !== _loadSeq) return;
                if (!data || !data.success) { showToast((data && data.error) || 'Could not load that case.', 'error'); return; }
                const c = data.case;
                if (window.mockFlushUpdates) window.mockFlushUpdates(); // save Notes/Tasks edits on a library case first
                if (window.mockReset) window.mockReset(); // leaving any Training Library case
                // The editor starts empty, so nothing of the case that was open (a field this case never had, an
                // "Other" box) stays on screen under this one's name.
                blankCaseEditorContent();
                revertOther('main-case-type', 'main-case-other', 'main-revert');
                applyCaseContentToDOM(c.content, document);
                currentCaseId = c.id;
                currentCaseIsDraft = !!c.isDraft;
                currentCaseCanEdit = !!c.canEdit;
                if (!c.isDraft && c.caseId) {
                    document.getElementById('case-id-field').innerText = c.caseId;
                    if (c.canEdit) renameNoCaseIdFiles(c.caseId);   // (saved before the ID reached them: kept with the next save)
                } else {
                    generateCaseId();
                }
                if (c.phase) updatePhaseDisplay(c.phase);
                updateTotals(); toggleOwnerExtra(); toggleDriverInsuredExtra(); showTab('profile');
                if (window.closeCaseLibrary) closeCaseLibrary();
                if (!c.canEdit) showToast('Viewing ' + c.ownerUsername + '\u2019s case — read-only (not the owner or an Admin).', 'info');
                noteServerCopy();
                persistCurrentEditorState();
            } catch (e) {
                showToast('Network error loading that case.', 'error');
            }
        }
        async function deleteCase(id, e) {
            e.stopPropagation();
            if (!confirm('Delete Case?')) return;
            try {
                const res = await fetch('/api/case-repository?id=' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' });
                const data = await res.json();
                if (!data || !data.success) { showToast((data && data.error) || 'Could not delete that case.', 'error'); return; }
                forgetDeletedOpenCase(id);
                refreshRepoCache();
            } catch (e2) {
                showToast('Network error deleting that case.', 'error');
            }
        }
        // The case open in the editor was just deleted: the editor is cleared (and this browser's copy of it
        // forgotten), so autosave can't bring it back as a new draft.
        function forgetDeletedOpenCase(id) {
            if (currentCaseId !== id) return;
            currentCaseId = null; currentCaseIsDraft = false; currentCaseCanEdit = true;
            document.getElementById('client-name-field').innerText = ''; // already asked: newCase() needn't ask again
            window.newCase();
            showToast('The case you had open was deleted, so the editor was cleared.', 'info');
        }

        /* ---------- PDF export ---------- */
        // Pulls a same-origin R2 file back down and re-encodes it as a data
        // URI so html2canvas can rasterize it. Returns null (never throws) on
        // any failure, so one dead attachment can't take the export with it.
        async function fetchAsDataURI(url) {
            try {
                const res = await fetch(url, { credentials: 'include' });
                if (!res.ok) return null;
                const blob = await res.blob();
                return await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(blob);
                });
            } catch (e) { return null; }
        }
        // async because the Doc Hub section now awaits R2 image fetches before
        // handing the assembled page to html2pdf. Callers fire-and-forget as
        // before; nothing downstream depends on the return value.
        async function downloadPDF(info) {
            info = info || {};
            const virtualPage = document.createElement('div');
            Object.assign(virtualPage.style, { padding: '46px', backgroundColor: '#ffffff', color: '#0f2148', fontFamily: "'IBM Plex Sans', Arial, sans-serif", lineHeight: '1.5' });

            // Everything below goes into the page as HTML, and all of it was typed by someone: escaped (e).
            const e = escapeHtmlAttr;
            const rawClientName = document.getElementById('client-name-field').innerText.trim() || "UNNAMED CLIENT";
            const clientName = e(rawClientName);
            const phase = e(document.getElementById('display-phase').innerText);
            const caseId = e(document.getElementById('case-id-field').innerText.trim() || '—');
            const attorneyName = e((document.getElementById('attorney-field') && document.getElementById('attorney-field').value.trim()) || '—');
            const caseManagerName = e((document.getElementById('case-manager-field') && document.getElementById('case-manager-field').value.trim()) || '—');
            const logoSrc = AGENCY_LOGO;
            // the ⚠ Critical note under the case header (case-alerts.js): on the first page, where nobody misses it
            const critEl = document.querySelector('#kx-critical [data-k="note"]');
            const critical = critEl ? critEl.innerText.trim() : '';

            // Person who originally submitted / created this case record.
            const subName = e(info.submittedBy || '—');
            const subBatch = e(info.submittedByBatch || '—');
            const subDate = e(info.submittedAt || '—');

            // Person producing THIS particular downloaded copy (may be a different person).
            const copyName = e(info.producedByName || '—');
            const copyBatch = e(info.producedByBatch || '—');
            const copyDate = e(info.producedAt || new Date().toLocaleString());

            // How many times this case's file has been downloaded, per the database record.
            const printSeq = (typeof info.printSequence === 'number') ? info.printSequence : 1;

            virtualPage.innerHTML = `
                <div style="display:flex; align-items:center; gap:14px; margin-bottom:18px;">
                    <img src="${logoSrc}" style="width:44px;height:44px;object-fit:contain;border-radius:6px;" />
                    <div>
                        <div style="font-family:'IBM Plex Mono','Courier New',monospace; font-size:9px; font-weight:800; letter-spacing:1.5px; color:#64748b; text-transform:uppercase;">Legal Support Help &middot; Training Interface</div>
                        <div style="font-family:'IBM Plex Mono','Courier New',monospace; font-size:9px; font-weight:900; letter-spacing:1.5px; color:#b91c1c; text-transform:uppercase;">Confidential — LSH Internal Record</div>
                    </div>
                </div>
                <div style="border-bottom: 4px solid #0f2148; margin-bottom: 24px; padding-bottom: 14px;">
                    <h1 style="margin:0; font-size: 26px; font-weight:800; text-transform: uppercase; letter-spacing:0.02em;">${clientName}</h1>
                    <div style="display: flex; justify-content: space-between; margin-top: 10px; font-family:'IBM Plex Mono','Courier New',monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing:0.04em;">
                        <span style="color: #f97316;">Case ID: ${caseId}</span>
                        <span style="color: #f97316;">Phase: ${phase}</span>
                        <span style="color: #64748b;">Printed: ${new Date().toLocaleString()}</span>
                        <span style="color: #b91c1c;">Print Sequence: #${printSeq}</span>
                    </div>
                    <div style="display:flex; gap:24px; margin-top:8px; font-family:'IBM Plex Mono','Courier New',monospace; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing:0.04em; color:#0f2148;">
                        <span>Attorney: ${attorneyName}</span>
                        <span>Case Manager: ${caseManagerName}</span>
                    </div>
                    ${critical ? `<div style="margin-top:12px; padding:9px 12px; background:#fef2f2; border:1px solid #fecaca; border-left:5px solid #dc2626; border-radius:6px; font-size:12px; font-weight:700; color:#991b1b; white-space:pre-wrap;">⚠ CRITICAL: ${e(critical)}</div>` : ''}
                    <div style="margin-top:14px; display:flex; gap:12px;">
                        <div style="flex:1; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; font-family:'IBM Plex Mono','Courier New',monospace; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:#0f2148;">
                            <div style="color:#94a3b8; font-size:8px; margin-bottom:5px;">Submitted By (Case Originator)</div>
                            <div>Name: ${subName}</div>
                            <div>Batch ID: ${subBatch}</div>
                            <div>Date of Submission: ${subDate}</div>
                        </div>
                        <div style="flex:1; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; font-family:'IBM Plex Mono','Courier New',monospace; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:#0f2148;">
                            <div style="color:#94a3b8; font-size:8px; margin-bottom:5px;">Copy Produced By</div>
                            <div>Name: ${copyName}</div>
                            <div>Batch ID: ${copyBatch}</div>
                            <div>Date &amp; Time Produced: ${copyDate}</div>
                        </div>
                    </div>
                </div>`;

            // Doc Hub is deliberately excluded from this generic per-card walk
            // (its rows are file attachments, not simple label:value fields —
            // see the dedicated Doc Hub section built below instead, which is
            // appended LAST, after every other card, per the requested PDF
            // ordering).
            //
            // Every field is always included, even if blank (shown as
            // "None") — this section used to skip empty fields entirely.
            // findFieldLabel() also fixes table-based sections (Chronology,
            // Treatment Matrix, Litigation, Finance, Notes, Tasks, Liens):
            // those cells have no <label> sibling, so they used to all fall
            // back to a generic "Detail" — now each cell's label comes from
            // its column's real <thead> header instead.
            function findFieldLabel(input) {
                const td = input.closest('td');
                if (td) {
                    const tr = td.closest('tr');
                    const table = td.closest('table');
                    if (tr && table) {
                        const cellIndex = Array.prototype.indexOf.call(tr.children, td);
                        const headRow = table.querySelector('thead tr');
                        if (headRow && headRow.children[cellIndex]) {
                            const label = headRow.children[cellIndex].innerText.trim();
                            if (label) return label;
                        }
                    }
                    return 'Detail';
                }
                if (input.previousElementSibling && input.previousElementSibling.tagName === 'LABEL') {
                    return input.previousElementSibling.innerText;
                }
                if (input.closest('div') && input.closest('div').querySelector('label')) {
                    return input.closest('div').querySelector('label').innerText;
                }
                return 'Detail';
            }
            const cards = document.querySelectorAll('.pdf-card');
            cards.forEach(card => {
                if (card.closest('#pane-docs')) return;
                const header = card.querySelector('.section-head, h3');
                if (!header) return;
                let sectionContent = "";
                const inputs = card.querySelectorAll('[contenteditable="true"], select');
                inputs.forEach(input => {
                    const val = input.tagName === 'SELECT' ? input.value : input.innerText.trim();
                    const labelText = e(findFieldLabel(input));
                    const displayVal = e(val || 'None');
                    sectionContent += `<div style="margin-bottom: 11px; padding-bottom: 6px; border-bottom: 1px solid #f1f5f9; break-inside: avoid;">
                        <div style="font-family:'IBM Plex Mono','Courier New',monospace; font-size: 8px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing:0.04em;">${labelText}</div>
                        <div style="font-size: 12px; font-weight: 600; color: ${val ? '#0f2148' : '#94a3b8'}; margin-top:2px;${val ? '' : ' font-style:italic;'}">${displayVal}</div>
                    </div>`;
                });
                if (sectionContent) {
                    virtualPage.innerHTML += `<div style="margin-bottom: 26px; break-inside: avoid; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
                        <div style="background-color: #0f2148; color: #f97316; font-family:'IBM Plex Mono','Courier New',monospace; font-size: 11px; font-weight:800; padding: 9px 16px; text-transform: uppercase; letter-spacing:0.05em;">${e(header.innerText)}</div>
                        <div style="padding: 16px 18px;">${sectionContent}</div>
                    </div>`;
                }
            });

            // Doc Hub — built as its own dedicated section instead of the
            // generic label:value walk above, since its content is category +
            // summary + an attached file, not a simple field list. Appended
            // LAST, after every other case-detail card, per the requested
            // ordering. Image attachments are embedded directly so they're
            // visible in the printed/downloaded PDF; non-image attachments
            // (e.g. PDFs, Word docs) can't be rasterized into a static page,
            // so those are referenced by filename instead.
            // Attachments no longer live in the markup as data URIs, so an
            // image has to be fetched back out of R2 and re-encoded before
            // html2pdf rasterizes the page — html2canvas cannot reliably
            // capture an <img> that is still in flight. Each image is pulled
            // and inlined here, and a fetch failure degrades to the same
            // filename-only reference used for non-image attachments rather
            // than aborting the whole export.
            const docRows = Array.from(document.querySelectorAll('#doc-body tr'));
            let docHubContent = '';
            for (const row of docRows) {
                const categoryEl = row.querySelector('td:first-child div');
                const category = e(categoryEl ? categoryEl.innerText.trim() : '');
                const summaryEl = row.querySelector('[contenteditable="true"]');
                const summary = e(summaryEl ? summaryEl.innerText.trim() : '');
                const linkEl = row.querySelector('.doc-attachment a');

                let attachmentHtml = '';
                if (linkEl) {
                    const href = linkEl.getAttribute('href') || '';
                    const filename = e(linkEl.getAttribute('download') || linkEl.innerText.trim());
                    const mime = linkEl.getAttribute('data-r2-mime') || '';
                    const isWebLink = linkEl.classList.contains('doc-web-link');
                    const isLegacyImage = /^data:image\//i.test(href);
                    const isR2Image = !!href && !/^data:/i.test(href) && /^image\//i.test(mime);
                    if (isWebLink) {
                        attachmentHtml = `<div style="margin-top:6px;font-size:11px;font-weight:700;color:#2563eb;">🔗 Link: ${e(linkEl.innerText.replace(/^🔗\s*/, '').trim())} <span style="font-weight:400;color:#64748b;">(${e(href)})</span></div>`;
                    } else if (isLegacyImage) {
                        // Pre-R2 row: the base64 is still sitting in the href.
                        attachmentHtml = `<div style="margin-top:8px;"><img src="${e(href)}" style="max-width:100%;max-height:320px;border:1px solid #e2e8f0;border-radius:6px;" /></div>`;
                    } else if (isR2Image) {
                        const dataUri = await fetchAsDataURI(href);
                        attachmentHtml = dataUri
                            ? `<div style="margin-top:8px;"><img src="${e(dataUri)}" style="max-width:100%;max-height:320px;border:1px solid #e2e8f0;border-radius:6px;" /></div>`
                            : `<div style="margin-top:6px;font-size:11px;font-weight:700;color:#2563eb;">📎 Attached file: ${filename}</div>`;
                    } else {
                        attachmentHtml = `<div style="margin-top:6px;font-size:11px;font-weight:700;color:#2563eb;">📎 Attached file: ${filename}</div>`;
                    }
                } else {
                    attachmentHtml = `<div style="margin-top:6px;font-size:11px;font-style:italic;color:#94a3b8;">No attachment</div>`;
                }

                docHubContent += `<div style="margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #f1f5f9; break-inside: avoid;">
                    <div style="font-family:'IBM Plex Mono','Courier New',monospace; font-size: 9px; font-weight: 900; color: #9a3412; text-transform: uppercase; letter-spacing:0.05em;">${category || 'Uncategorized'}</div>
                    <div style="font-size: 12px; font-weight: 600; color: ${summary ? '#0f2148' : '#94a3b8'}; margin-top:4px;${summary ? '' : ' font-style:italic;'}">${summary || 'None'}</div>
                    ${attachmentHtml}
                </div>`;
            }
            if (docHubContent) {
                virtualPage.innerHTML += `<div style="margin-bottom: 26px; break-inside: avoid; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
                    <div style="background-color: #0f2148; color: #f97316; font-family:'IBM Plex Mono','Courier New',monospace; font-size: 11px; font-weight:800; padding: 9px 16px; text-transform: uppercase; letter-spacing:0.05em;">Documents</div>
                    <div style="padding: 16px 18px;">${docHubContent}</div>
                </div>`;
            }
            // Litigation documents: the Discovery & Filing Tracker's filed copies and papers (a 📎 file or a 🔗 link per row)
            let litContent = '';
            document.querySelectorAll('#lit-body tr').forEach(row => {
                const a = row.querySelector('.doc-attachment a'); if (!a) return;
                const sel = row.querySelectorAll('select'), ed = row.querySelectorAll('[contenteditable="true"]');
                const what = [sel[0] && sel[0].value, ed[0] && ed[0].innerText.trim(), ed[1] && ed[1].innerText.trim() ? 'due ' + ed[1].innerText.trim() : '', sel[1] && sel[1].value].filter(Boolean).join(' · ');
                const web = a.classList.contains('doc-web-link');
                const doc = web ? `🔗 Link: ${e(a.innerText.replace(/^🔗\s*/, '').trim())} <span style="font-weight:400;color:#64748b;">(${e(a.getAttribute('href') || '')})</span>`
                    : `📎 ${e(a.getAttribute('download') || a.innerText.replace(/^\S+\s+/, '').trim())}`;
                litContent += `<div style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #f1f5f9; break-inside: avoid;">
                    <div style="font-family:'IBM Plex Mono','Courier New',monospace; font-size: 9px; font-weight: 900; color: #9a3412; text-transform: uppercase; letter-spacing:0.05em;">${e(what)}</div>
                    <div style="margin-top:4px;font-size:11px;font-weight:700;color:#2563eb;">${doc}</div>
                </div>`;
            });
            if (litContent) {
                virtualPage.innerHTML += `<div style="margin-bottom: 26px; break-inside: avoid; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden;">
                    <div style="background-color: #0f2148; color: #f97316; font-family:'IBM Plex Mono','Courier New',monospace; font-size: 11px; font-weight:800; padding: 9px 16px; text-transform: uppercase; letter-spacing:0.05em;">Litigation Documents</div>
                    <div style="padding: 16px 18px;">${litContent}</div>
                </div>`;
            }

            virtualPage.innerHTML += `
                <div style="margin-top:30px; padding-top:12px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; font-family:'IBM Plex Mono','Courier New',monospace; font-size:8.5px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.04em;">
                    <span>Generated via LSH Training Interface</span>
                    <span>For internal training use only</span>
                </div>`;

            const exportOptions = { margin: [0.5, 0.5], filename: `LSH_SUMMARY_${rawClientName.replace(/\s+/g, '_')}.pdf`, image: { type: 'jpeg', quality: 1 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } };
            html2pdf().set(exportOptions).from(virtualPage).save().then(() => virtualPage.remove());
        }

        /* =========================================================
           LIVE CLOCK + TIMEZONE
           ========================================================= */
        function populateTimezones() {
            const select = document.getElementById('tz-select');
            let zones = [];
            try {
                if (typeof Intl.supportedValuesOf === 'function') {
                    zones = Intl.supportedValuesOf('timeZone');
                }
            } catch (e) { zones = []; }

            if (!zones.length) return; // keep the built-in fallback list already in the HTML

            const preferred = 'Asia/Manila';
            const groups = {};
            zones.forEach(z => {
                const region = z.includes('/') ? z.split('/')[0] : 'Other';
                if (!groups[region]) groups[region] = [];
                groups[region].push(z);
            });

            select.innerHTML = '';
            select.appendChild(new Option('UTC', 'UTC'));
            Object.keys(groups).sort().forEach(region => {
                const og = document.createElement('optgroup');
                og.label = region.replace(/_/g, ' ');
                groups[region].sort().forEach(z => {
                    const label = z.split('/').slice(1).join(' / ').replace(/_/g, ' ') || z;
                    og.appendChild(new Option(label, z));
                });
                select.appendChild(og);
            });
            // The zone picked last on this computer (opening a case no longer sets it, so it's remembered on its own).
            let saved = null; try { saved = localStorage.getItem('LSH_CLOCK_TZ'); } catch (e) {}
            select.value = saved && zones.concat('UTC').includes(saved) ? saved : preferred;
            select.addEventListener('change', () => { try { localStorage.setItem('LSH_CLOCK_TZ', select.value); } catch (e) {} });
        }

        function refreshClock() {
            const tz = document.getElementById('tz-select').value;
            const now = new Date();
            const formatted = new Intl.DateTimeFormat('en-US', {
                year: 'numeric', month: 'short', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                timeZone: tz, hour12: true
            }).format(now);
            document.getElementById('live-clock').innerText = formatted;
        }
        setInterval(refreshClock, 1000);

        /* =========================================================
           AUTHENTICATION — Login / Register / Session

           NOTE: this section previously contained a fully client-side,
           localStorage-backed authentication path (getUsers/saveUsers/
           authenticate(), plus a hardcoded Master Account username AND
           PLAINTEXT PASSWORD shipped straight to the browser) that was
           already dead code — fully superseded by the real /api/login
           and /api/register calls further down this file. It has been
           removed entirely, since shipping the Master Account's
           credentials in client-side JS was a real security exposure
           regardless of whether that code path was ever executed.

           What remains here (getSession/setSession/clearSession, view
           switching, password validation) is genuinely used by the real
           API-backed login/registration flow below.
           ========================================================= */
        // The signed-in account as the server knows it (Admins stay Admins in Trainee view).
        function getRealSession() {
            try {
                let raw = sessionStorage.getItem(SESSION_KEY);
                // One-time migration from the old localStorage session key.
                if (raw === null) {
                    raw = localStorage.getItem(SESSION_KEY);
                    if (raw !== null) {
                        sessionStorage.setItem(SESSION_KEY, raw);
                        localStorage.removeItem(SESSION_KEY);
                    }
                }
                return JSON.parse(raw || 'null');
            } catch (e) { return null; }
        }
        /* Trainee view: a trainer (Admin) sees the site the way trainees do. Everything that
           shapes the screen reads getSession(), which then answers as a trainee; the server
           still knows them as an Admin, and the few Admin exemptions (Pause and Lock never
           stop them) read getRealSession(). The switch reloads the page so every part of
           the screen is drawn for the new view. */
        const TRAINEE_VIEW_KEY = 'LSH_TRAINEE_VIEW_V1';
        function isTraineeView() {
            const s = getRealSession();
            if (!s || s.userType !== 'Admin') return false;
            try { return sessionStorage.getItem(TRAINEE_VIEW_KEY) === '1'; } catch (e) { return false; }
        }
        function getSession() {
            const s = getRealSession();
            return s && isTraineeView() ? Object.assign({}, s, { userType: 'Trainee', traineeView: true }) : s;
        }
        function setTraineeView(on) {
            const s = getRealSession();
            if (!s || s.userType !== 'Admin') return;
            if (window.mockConfirmLeave && !window.mockConfirmLeave()) return; // unsaved changes to a Training Library case
            try { if (on) sessionStorage.setItem(TRAINEE_VIEW_KEY, '1'); else sessionStorage.removeItem(TRAINEE_VIEW_KEY); } catch (e) { return; }
            if (window.mockFlushUpdates) window.mockFlushUpdates({ keepalive: true });   // Notes/Tasks typed on a library case survive the reload
            location.reload();
        }
        // Trainee view has no bar of its own: the sidebar's ⇦ Back to trainer view is the way back.
        function markTraineeView() { document.body.classList.toggle('trainee-view', isTraineeView()); }
        // Set when this browser was signed in as someone else while this tab was open (see
        // handleSessionTakenOver). The tab then has no session of its own but the browser still holds
        // that trainee's cookie, so anything it sent would be read and written as them. It stays out of
        // the API until someone signs in here again — only the sign-in endpoints still go through.
        let _takenOver = false;
        const SIGN_IN_API = /^\/api\/(portal-login|login|register|state|status)\b/;
        // Bumped every time this tab's own session changes, so work already in flight can tell
        // "this tab signed in as someone else since" from "this browser was taken over by someone
        // else" (see sendHeartbeat's SESSION_CHANGED handling).
        let _sessionGen = 0;
        function setSession(user) {
            _sessionGen++;
            _takenOver = false;   // someone has signed in here, so this tab is somebody again
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                fullName: user.fullName,
                batchId: user.batchId,
                userType: user.userType,
                username: user.username
            }));
        }
        function clearSession() {
            _sessionGen++;
            sessionStorage.removeItem(SESSION_KEY);
            sessionStorage.removeItem(TRAINEE_VIEW_KEY);
            localStorage.removeItem(SESSION_KEY);
        }

        let currentPortalTab = 'Trainee';
        function showLoginView() {
            document.getElementById('auth-login-view').classList.remove('hidden');
            document.getElementById('auth-register-view').classList.add('hidden');
        }
        // Registration is for trainees only (admins sign in with the admin password): full name, Batch ID, username.
        function showRegisterView() {
            document.getElementById('auth-login-view').classList.add('hidden');
            document.getElementById('auth-register-view').classList.remove('hidden');
        }

        function applySessionUI() {
            const session = getSession();
            const gate = document.getElementById('auth-gate');
            const footer = document.getElementById('session-footer');

            markTraineeView();
            if (!session) {
                gate.classList.add('open');
                gate.style.setProperty('display', 'flex', 'important');
                footer.innerHTML = '';
                blankCaseEditorContent();
                renderRepo();
                _draftRestoredFor = null;   // whoever signs in next gets their own work back (and only theirs)
                // Nothing of the last person's stays open over the sign-in screen: the live view of a trainee
                // (and this page's own screen going to one), the Client's ID view, the Blueprint, a contact card.
                if (window.lshLiveWatched) window.lshLiveWatched(false);
                if (window.closeLiveView) window.closeLiveView();
                if (window.lshClientId) window.lshClientId.close();
                if (window.LSHBlueprint && document.getElementById('lbp-page')) window.LSHBlueprint.close();
                if (window.closeContacts) window.closeContacts(false);
                return;
            }
            gate.classList.remove('open');
            gate.style.removeProperty('display');

            // Restore in-progress editor content once each time someone signs in
            // on this page (covers both "logged in already, hit refresh" and "just
            // logged back in after being logged out mid-edit"). Guarded so later,
            // unrelated calls to applySessionUI() while they stay signed in (e.g.
            // after opening/closing Master Control) never stomp on whatever they
            // have typed since. The draft is theirs only (its owner).
            const signedInAs = (getRealSession() || {}).username || null;
            if (_draftRestoredFor !== signedInAs) {
                _draftRestoredFor = signedInAs;
                restoreCurrentEditorState();
            }
            refreshRepoCache(); // don't wait for the next background poll — show the shared repository immediately on login

            if (session.userType === 'Admin') {
                footer.innerHTML = `
                    <div class="session-user-tag">Signed in as: <b>${session.fullName || session.username}</b><br>Batch ID: <b>${session.batchId}</b></div>
                    <button class="session-btn active-admin" onclick="openAdminDashboard()">⇄ Master Control</button>
                    <button class="session-btn trainee-view-btn" onclick="setTraineeView(true)" title="See the site the way trainees see it">👁 Trainee view</button>
                    <button class="session-btn logout-btn" onclick="logoutSession()">Log Out</button>
                `;
            } else {
                footer.innerHTML = `
                    <div class="session-user-tag">Signed in as: <b>${session.fullName || session.username}</b><br>Batch ID: <b>${session.batchId}</b></div>
                    ${session.traineeView ? '<button class="session-btn active-admin" onclick="setTraineeView(false)">⇦ Back to trainer view</button>' : ''}
                    <button class="session-btn logout-btn" onclick="logoutSession()">Log Out</button>
                `;
            }
        }

        // Log Out (or the inactivity timeout): work the server doesn't have yet is sent first (a new case as a
        // draft), then this computer forgets the case, so the next person here never gets it. If it can't be
        // sent (offline), it stays in this browser for this person only (the draft's owner).
        async function logoutSession(reason) {
            if (hasAuthorizedAccess() && hasUnsyncedChanges()) {
                let sent = false;
                try { sent = await Promise.race([Promise.resolve(autoSaveProgress('logout')), new Promise(r => setTimeout(() => r(false), 6000))]); } catch (e) { sent = false; }
                if (sent) clearPersistedEditorState();
            } else clearPersistedEditorState();
            stopHeartbeat();
            stopIdleTracking();
            fetch('/api/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
            clearSession();
            exitMasterControl();
            applySessionUI();
            if (reason) showToast(reason, 'info');
        }

        function handleSessionExpired(message) {
            stopHeartbeat();
            stopIdleTracking();
            fetch('/api/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
            clearSession();
            exitMasterControl();
            applySessionUI();
            if (message) showToast(message, 'info');
        }

        /* Someone else signed in on this browser (a browser holds one session cookie; each tab keeps
           its own session). This tab is no longer the person it was, so it stops here rather than
           writing their work, their "online" or their screen into the account that now owns the
           cookie — which is what made 👁 Watch live show the wrong trainee. Deliberately NO
           /api/logout: that cookie belongs to whoever signed in last, and this tab must not end
           their session. Only this tab's own session is cleared (sessionStorage). */
        function handleSessionTakenOver(who) {
            _takenOver = true;
            stopHeartbeat();
            stopIdleTracking();
            clearSession();
            exitMasterControl();
            applySessionUI();
            showToast('This browser has been signed in as someone else, so ' + (who || 'you') + ' is signed out of this tab. Open the CMS again from your course to carry on.', 'info');
        }

        /* =========================================================
           MASTER CONTROL — full-page admin view + portal toggle
           ========================================================= */
        function openAdminDashboard() {
            const session = getSession();
            if (!session || session.userType !== 'Admin') return;
            document.getElementById('admin-dash-session').innerText = session.fullName + ' \u00B7 Batch ' + session.batchId;
            document.getElementById('admin-stat-cases').innerText = _repoCache.length;
            document.getElementById('admin-stat-name').innerText = (document.getElementById('client-name-field').innerText.trim() || '\u2014');
            document.getElementById('admin-stat-phase').innerText = 'Phase: ' + document.getElementById('display-phase').innerText;
            document.getElementById('master-control-page').classList.add('open');
            document.body.classList.add('mc-active');
            showAdminDashTab('overview');
            refreshUsersAndRegistrations();
            refreshMonitoring();
            refreshSiteState();
        }
        function exitMasterControl() {
            document.getElementById('master-control-page').classList.remove('open');
            document.body.classList.remove('mc-active');
        }

        const MC_TABS = ['overview', 'registrations', 'users', 'monitoring', 'case-logs', 'announce', 'access'];
        function showAdminDashTab(tab) {
            document.querySelectorAll('.mc-tab').forEach((t, i) => t.classList.toggle('active', MC_TABS[i] === tab));
            document.querySelectorAll('.mc-pane').forEach(p => p.classList.remove('active'));
            const pane = document.getElementById('admin-dash-' + tab);
            if (pane) pane.classList.add('active');
            if (tab === 'registrations' || tab === 'users' || tab === 'overview' || tab === 'announce') refreshUsersAndRegistrations();
            if (tab === 'monitoring') refreshMonitoring();
            if (tab === 'case-logs') refreshCaseLogs();
            if (tab === 'access') renderDbMaintenanceVisibility();
        }

        /* =========================================================
           DATABASE MAINTENANCE — Master Account only: 🧹 Clear old data.
           D1 can't VACUUM, so this clears data that's only needed for a while
           (old pings, online status, live-view copies, sign-in counts…);
           D1 reuses the space. See functions/api/db-cleanup.js.
           ========================================================= */
        function renderDbMaintenanceVisibility() {
            const section = document.getElementById('db-maintenance-section');
            if (!section) return;
            const session = getSession();
            const sessionIsMaster = !!(session && session.username === 'LSHADMIN123');
            section.style.display = sessionIsMaster ? 'block' : 'none';
        }
        function runDbCleanup() {
            const btn = document.getElementById('db-cleanup-btn');
            const label = document.getElementById('db-cleanup-result');
            if (!confirm('Clear old data now? Old pings, online status, live-view copies, sign-in attempt counts, old live-call records and stopped alerts are removed. Cases, results, intakes, time and the server logs are kept.')) return;
            btn.disabled = true;
            btn.innerText = 'Clearing…';
            fetch('/api/db-cleanup', { method: 'POST', credentials: 'include' })
                .then(r => r.json())
                .then(data => {
                    btn.disabled = false;
                    btn.innerText = '🧹 Clear old data';
                    if (data.success) {
                        const parts = (data.cleared || []).filter(c => c.rows).map(c => c.rows + ' ' + c.what);
                        label.innerText = 'Last run (' + new Date().toLocaleTimeString() + '): ' + (parts.length ? parts.join(' · ') : 'nothing old to clear') + '.';
                        showToast(data.rows ? 'Cleared ' + data.rows + ' old row' + (data.rows === 1 ? '' : 's') + '.' : 'Nothing old to clear.', 'info');
                    } else {
                        label.innerText = 'Last run failed: ' + (data.error || 'Unknown error');
                        showToast(data.error || 'Couldn\'t clear old data.', 'error');
                    }
                })
                .catch(() => {
                    btn.disabled = false;
                    btn.innerText = '🧹 Clear old data';
                    showToast('Network error clearing old data.', 'error');
                });
        }

        /* =========================================================
           BATCH IDs — B + the date the batch started (MMDDYY), e.g. B100526 for 5 October 2026
           (Batch IDs given out before as B + DDMMYY, e.g. B300926, keep working as they are.)
           canonicalBatchId() is canonicalBatch() in functions/_utils.js: what's typed (any capitals,
           spaces or dashes, the B left off, a four-digit year, or the older long forms B30092026 and
           B30092026-LSHTRAINEE-001 without the trainee number) in its one form, or null when it isn't a real date.
           parseBatchId() sorts the Users tab's batches, the newest first.
           ========================================================= */
        const batchRealDay = (mm, dd, yy) => { const d = new Date(Date.UTC(2000 + yy, mm - 1, dd)); return mm >= 1 && mm <= 12 && dd >= 1 && d.getUTCMonth() === mm - 1; };
        function canonicalBatchId(raw) {
            const v = String(raw || '').toUpperCase().replace(/[\s\-]/g, '');
            const m = /^B?(\d{2})(\d{2})(\d{4}|\d{2})(?:LSH[A-Z]*\d+)?$/.exec(v);
            if (!m) return null;
            const a = +m[1], b = +m[2], yy = m[3].slice(-2);
            if (!batchRealDay(a, b, +yy) && !batchRealDay(b, a, +yy)) return null;
            return 'B' + m[1] + m[2] + yy;
        }
        function parseBatchId(batchId) {
            const b = canonicalBatchId(batchId);
            if (!b) return null;
            // YYMMDD: read as MMDDYY, or as the older DDMMYY when that's the only real date
            const a = b.slice(1, 3), c = b.slice(3, 5), yy = b.slice(5, 7);
            const mmdd = batchRealDay(+a, +c, +yy);
            return { batch: b, sortKey: yy + (mmdd ? a + c : c + a) };
        }

        /* =========================================================
           USERS + REGISTRATIONS — backed by /api/users (Cloudflare D1)
           Registrations tab: pending only. Users tab: approved only —
           revocation is now a permanent delete (see /api/revoke-user),
           so a 'Revoked' status row should never actually appear here;
           deleted accounts are simply gone from this list entirely.
           Users tab segregates Admin/Trainee, groups Trainees by Batch
           ID, and sorts everything by <XXX> sequence.
           ========================================================= */
        function refreshUsersAndRegistrations() {
            fetch('/api/users', { credentials: 'include' })
                .then(r => r.json())
                .then(users => {
                    users = Array.isArray(users) ? users : [];
                    users.sort((a, b) => new Date(a.created_at || a.createdAt || 0) - new Date(b.created_at || b.createdAt || 0));

                    const pending = users.filter(u => (u.status || 'Pending') === 'Pending');
                    // 'active' here means "shows up in the main Users list",
                    // which includes both fully Approved users and
                    // Temporarily Revoked (Suspended) ones — Suspended
                    // users must still be visible, with a Lift Revocation /
                    // Permanent Revocation choice, not disappear from the UI.
                    const active = users.filter(u => u.status === 'Approved' || u.status === 'Suspended');

                    document.getElementById('admin-stat-pending').innerText = pending.length;
                    const badge = document.getElementById('reg-pending-badge');
                    if (badge) { badge.innerText = pending.length > 0 ? ('(' + pending.length + ')') : ''; badge.style.color = pending.length > 0 ? 'var(--classified-red)' : 'inherit'; }

                    renderGroupedUserList('registrations-list', pending, true, 'No pending registrations.');
                    renderUsersList(active);
                    _activeUsersCache = active;
                    populatePingUserSelect();
                })
                .catch(err => console.error('Failed to load users:', err));
        }
        function renderGroupedUserList(containerId, list, isPending, emptyMsg) {
            const container = document.getElementById(containerId);
            if (!container) return;
            if (!list.length) { container.innerHTML = '<p style="font-size:12px;color:#94a3b8;">' + emptyMsg + '</p>'; return; }
            const byType = {};
            list.forEach(u => { const t = u.user_type || u.userType || 'Trainee'; (byType[t] = byType[t] || []).push(u); });
            let html = '';
            Object.keys(byType).sort().forEach(type => {
                html += '<div class="group-heading">' + type + 's \u00B7 ' + byType[type].length + '</div>';
                byType[type].forEach(u => { html += renderUserRow(u, isPending); });
            });
            container.innerHTML = html;
        }
        // Admin/Trainee segregation -> Trainees grouped by Batch ID -> both
        // sorted by <XXX> sequence number. Admins are a flat list, sorted by
        // <XXX>, with no batch-date grouping (per spec — admins don't have a
        // training start date to group by).
        function renderUsersList(list) {
            const container = document.getElementById('users-list');
            if (!container) return;
            if (!list.length) { container.innerHTML = '<p style="font-size:12px;color:#94a3b8;">No approved users yet.</p>'; return; }

            const admins = list.filter(u => (u.user_type || u.userType) === 'Admin');   // in the order they were made
            const trainees = list.filter(u => (u.user_type || u.userType) === 'Trainee');

            let html = '<div class="group-heading">Admins &middot; ' + admins.length + '</div>';
            html += admins.length
                ? admins.map(u => renderUserRow(u, false)).join('')
                : '<p style="font-size:11px;color:#94a3b8;margin:4px 0 12px;">No approved admins.</p>';

            html += '<div class="group-heading">Trainees &middot; ' + trainees.length + '</div>';
            if (!trainees.length) {
                html += '<p style="font-size:11px;color:#94a3b8;margin:4px 0 12px;">No approved trainees.</p>';
            } else {
                // One group per batch, the newest batch first; anything that isn't a Batch ID comes last
                const byBatch = {};
                trainees.forEach(u => {
                    const p = parseBatchId(u.batch_id || u.batchId);
                    const key = p ? p.batch : (String(u.batch_id || u.batchId || '').trim() || 'Unassigned Batch');
                    (byBatch[key] = byBatch[key] || []).push(u);
                });
                const order = (k) => { const p = parseBatchId(k); return p ? p.sortKey : ''; };
                Object.keys(byBatch).sort((a, b) => order(b).localeCompare(order(a)) || a.localeCompare(b)).forEach(batchKey => {
                    const members = byBatch[batchKey];   // in the order they registered
                    html += '<div class="group-heading" style="background:#f8fafc;border:1px solid #eef2f7;margin-left:12px;">' + escapeHtmlAttr(batchKey) + ' &middot; ' + members.length + ' trainee(s)</div>';
                    html += members.map(u => renderUserRow(u, false)).join('');
                });
            }
            container.innerHTML = html;
        }
        // Escapes a string so it's safe to embed inside a double-quoted HTML
        // attribute (e.g. onclick="..."). Without this, any value containing
        // a double quote — including anything wrapped by JSON.stringify(),
        // which always adds surrounding quotes — prematurely closes the
        // attribute and truncates the JS that follows, silently breaking the
        // button. This was a real bug: every "Permanent Revocation" button
        // threw Uncaught SyntaxError and did nothing, for every user.
        function escapeHtmlAttr(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }
        function renderUserRow(u, isPending) {
            const status = u.status || 'Pending';
            const pillClass = 'status-' + status.toLowerCase();
            const statusLabel = status === 'Suspended' ? 'Temporarily Revoked' : status;
            const fullName = u.full_name || u.fullName || ((u.first_name || '') + ' ' + (u.last_name || '')).trim();
            const created = u.created_at || u.createdAt;
            const createdLabel = created ? new Date(created).toLocaleDateString() : '\u2014';
            const userType = u.user_type || u.userType;

            let actions = '';
            if (isPending) {
                actions = '<button class="mini-btn approve" onclick="updateUserStatus(' + u.id + ',\'Approved\')">Approve</button>' +
                          '<button class="mini-btn reject" onclick="if(confirm(\'Permanently reject this registration?\'))updateUserStatus(' + u.id + ',\'Rejected\')">Reject</button>';
            } else {
                // Permission gating in the UI, mirroring what the server
                // enforces in revoke-user.js/suspend-user.js: Admins can't
                // revoke/suspend Admins, only the Master Account can, and the
                // Master Account can never be revoked or suspended at all.
                // This is a UI convenience only — the server is the real
                // enforcement point.
                const session = getSession();
                const sessionIsMaster = !!(session && session.username === 'LSHADMIN123');
                const targetIsMaster = u.username === 'LSHADMIN123';
                const isSuspended = status === 'Suspended';
                if (targetIsMaster) {
                    actions = '<span style="font-size:10px;color:#94a3b8;font-weight:800;text-transform:uppercase;">Master Account</span>';
                } else if (userType === 'Admin' && !sessionIsMaster) {
                    actions = '<span style="font-size:10px;color:#94a3b8;font-weight:800;text-transform:uppercase;">Only Master can ' + (isSuspended ? 'reinstate' : 'revoke') + '</span>';
                } else if (isSuspended) {
                    // Suspended (Temporary Revocation) accounts can be
                    // reinstated, or escalated straight to Permanent
                    // Revocation without needing to reinstate first.
                    actions = '<button class="mini-btn reinstate" onclick="confirmReinstateUser(' + u.id + ', ' + escapeHtmlAttr(JSON.stringify(fullName)) + ')">Lift Revocation</button>' +
                              '<button class="mini-btn reject" onclick="confirmRevokeUser(' + u.id + ', ' + escapeHtmlAttr(JSON.stringify(fullName)) + ')">Permanent Revocation</button>';
                } else {
                    actions = '<button class="mini-btn suspend" onclick="confirmSuspendUser(' + u.id + ', ' + escapeHtmlAttr(JSON.stringify(fullName)) + ')">Temporary Revocation</button>' +
                              '<button class="mini-btn reject" onclick="confirmRevokeUser(' + u.id + ', ' + escapeHtmlAttr(JSON.stringify(fullName)) + ')">Permanent Revocation</button>';
                }
            }

            const trainingStart = u.training_start_date || u.trainingStartDate;
            const trainingStartLabel = trainingStart ? (' \u00B7 Training Start ' + new Date(trainingStart + 'T00:00:00').toLocaleDateString()) : '';
            const batch = u.batch_id || u.batchId || '';
            // Trainees registered without an email get a placeholder address (register.js): not shown
            const email = u.email && !/\.invalid$/i.test(u.email) ? ' \u00B7 ' + escapeHtmlAttr(u.email) : '';
            // A trainee's Batch ID is what they sign in with: an Admin can change it (editUserBatch)
            const batchBtn = userType === 'Trainee' ? '<button class="mini-btn batch" onclick="editUserBatch(' + u.id + ', this)">\u270E Batch ID</button>' : '';
            return '<div class="reg-row" data-user-id="' + u.id + '" data-batch="' + escapeHtmlAttr(batch) + '">' +
                    '<div class="reg-info">' +
                        '<b>' + escapeHtmlAttr(fullName) + ' <span class="status-pill ' + pillClass + '">' + statusLabel + '</span></b>' +
                        '<div class="reg-meta">' + userType + ' \u00B7 Batch <span class="reg-batch">' + (escapeHtmlAttr(batch) || '\u2014') + '</span> \u00B7 @' + escapeHtmlAttr(u.username) + email + ' \u00B7 Registered ' + createdLabel + (userType === 'Trainee' ? trainingStartLabel : '') + '</div>' +
                    '</div>' +
                    '<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">' + batchBtn + actions + '</div>' +
                '</div>';
        }
        // ✎ Batch ID: a box in the row to change a trainee's Batch ID (functions/api/update-batch.js).
        function editUserBatch(userId, btn) {
            const row = btn && btn.closest('.reg-row');
            if (!row) return;
            const open = row.querySelector('.batch-edit');
            if (open) { open.querySelector('input').focus(); return; }
            const box = document.createElement('div');
            box.className = 'batch-edit';
            box.innerHTML = '<label>New Batch ID <input type="text" maxlength="24" autocomplete="off" data-allow="batch" placeholder="B300926"></label>' +
                '<button type="button" class="mini-btn approve">Save</button><button type="button" class="mini-btn revoke">Cancel</button><span class="batch-edit-msg" role="alert"></span>';
            const input = box.querySelector('input');
            input.value = row.getAttribute('data-batch') || '';
            const [save, cancel] = box.querySelectorAll('button');
            cancel.onclick = () => box.remove();
            save.onclick = () => saveUserBatch(userId, input.value, box);
            input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); save.click(); } else if (e.key === 'Escape') cancel.click(); };
            row.querySelector('.reg-info').appendChild(box);
            input.focus(); input.select();
        }
        function saveUserBatch(userId, value, box) {
            const msg = box.querySelector('.batch-edit-msg');
            const batchId = canonicalBatchId(value);
            if (!batchId) { msg.textContent = 'B and the date the batch started (MMDDYY), e.g. B100526.'; return; }
            box.querySelectorAll('button').forEach(b => { b.disabled = true; });
            msg.textContent = '';
            fetch('/api/update-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userId, batchId })
            })
            .then(res => res.json())
            .then(data => {
                if (data && data.success) {
                    showToast('Batch ID changed to ' + data.batchId + '. The trainee signs in with it from now on.', 'success');
                    refreshUsersAndRegistrations();
                } else {
                    msg.textContent = (data && data.error) || 'Couldn\'t change the Batch ID.';
                    box.querySelectorAll('button').forEach(b => { b.disabled = false; });
                }
            })
            .catch(() => { msg.textContent = 'Network error. Please try again.'; box.querySelectorAll('button').forEach(b => { b.disabled = false; }); });
        }
        function updateUserStatus(userId, newStatus) {
            // Only ever called with 'Approved' or 'Rejected' now — permanent
            // revocation of an already-approved user goes through
            // confirmRevokeUser() / /api/revoke-user instead (see below).
            fetch('/api/update-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userId: userId, newStatus: newStatus })
            })
            .then(res => res.json())
            .then(data => {
                const labels = { Approved: 'User approved.', Rejected: 'Registration rejected.' };
                if (data && data.success !== false) {
                    const msg = (newStatus === 'Approved' && data.batchId) ? `User approved. Batch ID: ${data.batchId}` : (labels[newStatus] || `Status updated to ${newStatus}.`);
                    showToast(msg, 'success');
                } else {
                    showToast((data && data.error) || 'Failed to update status.', 'error');
                }
                refreshUsersAndRegistrations();
            })
            .catch(err => { console.error('Status update error:', err); showToast('Network error. Failed to update status.', 'error'); });
        }
        function confirmRevokeUser(userId, fullName) {
            if (!confirm('Permanently revoke access for ' + fullName + '? This deletes their account entirely — their saved cases will remain, but this action itself cannot be undone.')) return;
            fetch('/api/revoke-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userId: userId })
            })
            .then(res => res.json())
            .then(data => {
                if (data && data.success) {
                    showToast('Access permanently revoked.', 'success');
                } else {
                    showToast((data && data.error) || 'Failed to revoke access.', 'error');
                }
                refreshUsersAndRegistrations();
            })
            .catch(() => showToast('Network error. Failed to revoke access.', 'error'));
        }
        function confirmSuspendUser(userId, fullName) {
            if (!confirm('Temporarily revoke access for ' + fullName + '? Their account and saved cases are kept — you can reinstate access later.')) return;
            fetch('/api/suspend-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userId: userId })
            })
            .then(res => res.json())
            .then(data => {
                if (data && data.success) {
                    showToast('Access temporarily revoked.', 'success');
                } else {
                    showToast((data && data.error) || 'Failed to suspend access.', 'error');
                }
                refreshUsersAndRegistrations();
            })
            .catch(() => showToast('Network error. Failed to suspend access.', 'error'));
        }
        function confirmReinstateUser(userId, fullName) {
            if (!confirm('Lift the temporary revocation for ' + fullName + '? They will regain full access immediately.')) return;
            fetch('/api/reinstate-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ userId: userId })
            })
            .then(res => res.json())
            .then(data => {
                if (data && data.success) {
                    showToast('Revocation lifted. Access restored.', 'success');
                } else {
                    showToast((data && data.error) || 'Failed to lift revocation.', 'error');
                }
                refreshUsersAndRegistrations();
            })
            .catch(() => showToast('Network error. Failed to reinstate access.', 'error'));
        }

        /* =========================================================
           MONITORING — reset to a single live-sessions view: who's
           online right now, click a name to view their latest saved
           case (read-only). Case Review has moved to its own "Case
           Logs" tab (see below). Backed by /api/heartbeat and
           /api/monitor-case.

           NOTE: deleted (permanently revoked) accounts never appear
           here — revoke-user.js deletes their heartbeat row the
           moment they're revoked, so there's no separate filtering
           needed on this side.
           ========================================================= */
        function refreshMonitoring() {
            fetch('/api/heartbeat', { credentials: 'include' })
                .then(r => r.json())
                .then(list => renderMonitoringOnline(Array.isArray(list) ? list : []))
                .catch(() => renderMonitoringOnline([]));
        }
        // heartbeats.last_seen is SQLite's datetime('now'): UTC wall clock with no zone on it
        // ("2026-10-09 08:02:31"). new Date() reads that as LOCAL time, so in Manila (UTC+8) every
        // trainee looked 8 hours stale — none was ever "Online now" and 👁 Watch live never appeared;
        // west of UTC they all looked online for ever. Read it as the UTC it is (the same way
        // functions/api/live-view.js does). 0 when there's nothing to read.
        function seenAt(raw) {
            if (!raw) return 0;
            const s = String(raw);
            const t = Date.parse(s.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
            return isFinite(t) ? t : 0;
        }
        // Flat list, no Batch ID grouping — sorted online-first, then by
        // most recently seen.
        function renderMonitoringOnline(list) {
            const now = Date.now();
            list.forEach(u => u._online = (now - seenAt(u.last_seen)) < HEARTBEAT_GRACE_MS * 2);
            const onlineCount = list.filter(u => u._online).length;
            const statTile = document.getElementById('admin-stat-online');
            if (statTile) statTile.innerText = onlineCount;

            const container = document.getElementById('monitoring-online-list');
            if (!container) return;
            if (!list.length) { container.innerHTML = '<p style="font-size:12px;color:#94a3b8;">No sessions recorded yet.</p>'; return; }

            function rowHtml(u) {
                // (the username goes in a data attribute: JSON.stringify's double quotes inside onclick="…" cut the handler short, so the click did nothing)
                return '<div class="reg-row" style="cursor:pointer;" data-username="' + escapeHtmlAttr(u.username) + '" onclick="openMonitorCase(this.dataset.username)"><div class="reg-info">' +
                    '<b><span class="online-dot ' + (u._online ? 'live' : '') + '"></span>' + escapeHtmlAttr(u.full_name || u.username) + '</b>' +
                    '<div class="reg-meta">' + escapeHtmlAttr(u.user_type || '') + ' \u00B7 @' + escapeHtmlAttr(u.username) + ' \u00B7 ' + (u._online ? 'Online now' : 'Last seen ' + (seenAt(u.last_seen) ? new Date(seenAt(u.last_seen)).toLocaleString() : '\u2014')) + (u.current_case ? (' \u00B7 Working on: ' + escapeHtmlAttr(u.current_case)) : '') + '</div>' +
                    '</div><div style="display:flex;align-items:center;gap:10px;">' +
                    ((u._online && (u.user_type || 'Trainee') !== 'Admin') ? '<button class="mini-btn live-watch" onclick="event.stopPropagation(); openLiveView(this.closest(\'.reg-row\').dataset.username)">\u{1F441} Watch live</button>' : '') +
                    '<span style="font-size:11px;color:#64748b;">View Latest Saved \u2192</span></div></div>';
            }

            const sorted = list.slice().sort((a, b) => (b._online - a._online) || (seenAt(b.last_seen) - seenAt(a.last_seen)));
            container.innerHTML = sorted.map(rowHtml).join('');
        }

        /* =========================================================
           SERVER LOGS (Monitoring > Server Logs clickable panel) —
           backed by /api/server-logs, which reshapes the existing
           activity_log table (login, logout, pause/resume, lock/
           unlock, ping, and the three revocation actions) with a
           computed duration for the paired event types.
           ========================================================= */
        function openServerLogs() {
            document.getElementById('server-logs-modal').classList.add('open');
            document.getElementById('server-logs-list').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Loading...</p>';
            fetch('/api/server-logs', { credentials: 'include' })
                .then(r => r.json())
                .then(data => renderServerLogs((data && data.success) ? data.logs : []))
                .catch(() => renderServerLogs([]));
        }
        function closeServerLogs() { document.getElementById('server-logs-modal').classList.remove('open'); }
        function formatDuration(seconds) {
            if (seconds == null) return '';
            if (seconds < 60) return seconds + 's';
            const m = Math.floor(seconds / 60), s = seconds % 60;
            if (m < 60) return m + 'm ' + s + 's';
            const h = Math.floor(m / 60), rm = m % 60;
            return h + 'h ' + rm + 'm';
        }
        function renderServerLogs(logs) {
            const container = document.getElementById('server-logs-list');
            if (!container) return;
            if (!logs.length) { container.innerHTML = '<p style="font-size:12px;color:#94a3b8;">No activity recorded yet.</p>'; return; }
            container.innerHTML = logs.map(function (l) {
                return '<div class="reg-row"><div class="reg-info">' +
                    '<b>' + l.label + (l.durationSeconds != null ? ' <span class="status-pill status-approved">' + formatDuration(l.durationSeconds) + '</span>' : '') + '</b>' +
                    '<div class="reg-meta">' + (l.actorUsername ? '@' + l.actorUsername : 'System') + (l.actorBatch ? ' \u00B7 Batch ' + l.actorBatch : '') + ' \u00B7 ' + new Date(l.occurredAt).toLocaleString() + '</div>' +
                    // which case a look at its full SSN was on (case-alerts.js → /api/case-activity)
                    (l.action === 'ssn-view' && l.details ? '<div class="reg-meta">' + escapeHtmlAttr([l.details.caseId ? 'Case ' + l.details.caseId : '', l.details.client || ''].filter(Boolean).join(' \u00B7 ') || 'a case') + '</div>' : '') +
                    '</div></div>';
            }).join('');
        }

        /* =========================================================
           CASE LOGS (Master Control > Case Logs) — Search Case, all
           cases sorted by most recent modification, See Previous
           Versions (backed by /api/case-versions), and View Full Case
           (the current version, read-only, backed by
           /api/case-repository?id=).
           ========================================================= */
        function refreshCaseLogs() {
            renderCaseLogs(); // reuses the already-fetched shared repo cache (_repoCache)
        }
        // Cases ticked for deleting; kept across the list's redraws (the repo cache refreshes every minute).
        const _caseLogsSelected = new Set();
        let _caseLogsShown = [];
        function renderCaseLogs() {
            const container = document.getElementById('case-logs-list');
            if (!container) return;
            const searchEl = document.getElementById('case-logs-search');
            const query = (searchEl ? searchEl.value : '').trim().toLowerCase();

            let list = _repoCache.slice();
            if (query) {
                list = list.filter(c =>
                    (c.clientName || '').toLowerCase().includes(query) ||
                    (c.caseId || '').toLowerCase().includes(query) ||
                    (c.submittedBy || '').toLowerCase().includes(query) ||
                    (c.ownerUsername || '').toLowerCase().includes(query)
                );
            }
            list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            // a ticked case that's gone (deleted elsewhere) is no longer ticked
            _caseLogsSelected.forEach(id => { if (!_repoCache.some(c => c.id === id)) _caseLogsSelected.delete(id); });
            _caseLogsShown = list.map(c => c.id);
            renderCaseLogsBulk();

            if (!list.length) { container.innerHTML = '<p style="font-size:12px;color:#94a3b8;">No matching cases.</p>'; return; }

            container.innerHTML = list.map(function (c) {
                const name = escapeHtmlAttr(c.clientName || 'Untitled Case');
                return '<div class="reg-row" data-case-row="' + c.id + '"><label class="case-logs-pick" title="Select to delete"><input type="checkbox" aria-label="Select ' + name + '"' + (_caseLogsSelected.has(c.id) ? ' checked' : '') + ' onchange="toggleCaseLogPick(' + c.id + ', this.checked)"></label><div class="reg-info" style="flex:1;">' +
                    '<b>' + name + ' <span class="status-pill ' + (c.isDraft ? 'status-pending' : 'status-approved') + '">' + (c.isDraft ? 'DRAFT' : escapeHtmlAttr(c.phase || '')) + '</span></b>' +
                    '<div class="reg-meta">By ' + escapeHtmlAttr(c.submittedBy || c.ownerUsername) + ' \u00B7 Case ID ' + escapeHtmlAttr(c.caseId || '\u2014') + ' \u00B7 Modified ' + new Date(c.updatedAt).toLocaleString() + '</div>' +
                    '</div><div style="display:flex;gap:8px;">' +
                    '<button class="mini-btn" style="background:var(--navy);color:white;" onclick="openCaseVersions(' + c.id + ', event)">See Previous Versions</button>' +
                    '<button class="mini-btn" style="background:#16a34a;color:white;" onclick="openCaseLogsFullView(' + c.id + ', event)">View Full Case</button>' +
                    '<button class="mini-btn del" onclick="adminDeleteCases([' + c.id + '], event)">🗑 Delete</button>' +
                    '</div></div>';
            }).join('');
        }
        function renderCaseLogsBulk() {
            const bar = document.getElementById('case-logs-bulk');
            if (!bar) return;
            const n = _caseLogsSelected.size, shown = _caseLogsShown.length;
            const all = shown > 0 && _caseLogsShown.every(id => _caseLogsSelected.has(id));
            bar.innerHTML = shown || n
                ? '<label><input type="checkbox" id="case-logs-all"' + (all ? ' checked' : '') + ' onchange="toggleCaseLogsAll(this.checked)"> Select all shown (' + shown + ')</label>' +
                  '<button class="mini-btn del" id="case-logs-delete-selected"' + (n ? '' : ' disabled') + ' onclick="adminDeleteCases(Array.from(_caseLogsSelected), event)">🗑 Delete selected (' + n + ')</button>' +
                  (n ? '<button class="mini-btn" style="background:#f1f5f9;color:#334155;" onclick="_caseLogsSelected.clear(); renderCaseLogs();">Clear</button>' : '')
                : '';
        }
        function toggleCaseLogPick(id, on) { if (on) _caseLogsSelected.add(id); else _caseLogsSelected.delete(id); renderCaseLogsBulk(); }
        function toggleCaseLogsAll(on) { _caseLogsShown.forEach(id => { if (on) _caseLogsSelected.add(id); else _caseLogsSelected.delete(id); }); renderCaseLogs(); }
        // Deletes cases from Master Control (Admins may delete any case: /api/case-repository DELETE checks it).
        async function adminDeleteCases(ids, evt) {
            if (evt) evt.stopPropagation();
            ids = (ids || []).filter(id => _repoCache.some(c => c.id === id));
            if (!ids.length) return;
            const one = ids.length === 1 ? _repoCache.find(c => c.id === ids[0]) : null;
            const msg = one
                ? `Delete ${one.clientName || 'this case'} (${one.caseId || 'a draft, no Case ID'}), saved by ${one.submittedBy || one.ownerUsername}?\n\nThe case is removed for good. This can't be undone.`
                : `Delete these ${ids.length} cases?\n\nThey are removed for good. This can't be undone.`;
            if (!confirm(msg)) return;
            let done = 0; const failed = [];
            for (const id of ids) {
                try {
                    const res = await fetch('/api/case-repository?id=' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' });
                    const data = await res.json();
                    if (data && data.success) {
                        done++;
                        _caseLogsSelected.delete(id);
                        forgetDeletedOpenCase(id);
                    } else failed.push((data && data.error) || 'Could not delete a case.');
                } catch (e) { failed.push('Network error deleting a case.'); }
            }
            await refreshRepoCache();
            if (failed.length) showToast(`Deleted ${done} of ${ids.length}. ${failed[0]}`, 'error');
            else showToast(`Deleted ${done} case${done === 1 ? '' : 's'}.`, 'success');
        }

        function openCaseVersions(caseRepositoryId, evt) {
            if (evt) evt.stopPropagation();
            document.getElementById('case-versions-modal').classList.add('open');
            document.getElementById('case-versions-list').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Loading...</p>';
            fetch('/api/case-versions?caseRepositoryId=' + encodeURIComponent(caseRepositoryId), { credentials: 'include' })
                .then(r => r.json())
                .then(data => renderCaseVersions(caseRepositoryId, (data && data.success) ? data.versions : []))
                .catch(() => renderCaseVersions(caseRepositoryId, []));
        }
        function renderCaseVersions(caseRepositoryId, versions) {
            const container = document.getElementById('case-versions-list');
            if (!container) return;
            if (!versions.length) { container.innerHTML = '<p style="font-size:12px;color:#94a3b8;">No previous versions recorded for this case yet.</p>'; return; }
            const e = escapeHtmlAttr;   // names and phases are typed by whoever saved the case
            container.innerHTML = versions.map(function (v) {
                return '<div class="reg-row" style="cursor:pointer;" onclick="openCaseVersionView(' + Number(caseRepositoryId) + ', ' + Number(v.id) + ')"><div class="reg-info">' +
                    '<b>' + e(v.clientName || 'Untitled Case') + ' <span class="status-pill ' + (v.isDraft ? 'status-pending' : 'status-approved') + '">' + (v.isDraft ? 'DRAFT' : e(v.phase || '')) + '</span></b>' +
                    '<div class="reg-meta">Saved by ' + e(v.savedBy || '\u2014') + (v.savedByBatch ? ' \u00B7 Batch ' + e(v.savedByBatch) : '') + ' \u00B7 ' + new Date(v.savedAt).toLocaleString() + '</div>' +
                    '</div><div style="font-size:11px;color:#64748b;">View &rarr;</div></div>';
            }).join('');
        }
        function closeCaseVersions() { document.getElementById('case-versions-modal').classList.remove('open'); }

        // Renders a read-only snapshot (either a past version, or the current
        // full case) into the shared case-logs-view-modal, reusing the same
        // detached-clone technique as openMonitorCase().
        function renderReadOnlyCaseInto(elIds, meta, content) {
            document.getElementById(elIds.title).innerText = meta.title;
            document.getElementById(elIds.sub).innerText = meta.sub;
            document.getElementById(elIds.meta).innerHTML = meta.metaHtml;
            if (_emptyCaptureAreaTemplate) {
                const offscreen = inertCaseCopy();
                applyCaseContentToDOM(content, offscreen);
                document.getElementById(elIds.body).innerHTML = extractReadableSections(offscreen);
            } else {
                document.getElementById(elIds.body).innerHTML = '<p style="font-size:12px;color:#94a3b8;">Preview unavailable.</p>';
            }
        }
        async function openCaseVersionView(caseRepositoryId, versionId) {
            const modal = document.getElementById('case-logs-view-modal');
            document.getElementById('case-logs-view-title').innerText = 'Previous Version';
            document.getElementById('case-logs-view-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Loading...</p>';
            modal.classList.add('open');
            try {
                const res = await fetch('/api/case-versions?caseRepositoryId=' + encodeURIComponent(caseRepositoryId) + '&versionId=' + encodeURIComponent(versionId), { credentials: 'include' });
                const data = await res.json();
                if (!data || !data.success) {
                    document.getElementById('case-logs-view-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">' + ((data && data.error) || 'Could not load this version.') + '</p>';
                    return;
                }
                const v = data.version;
                renderReadOnlyCaseInto(
                    { title: 'case-logs-view-title', sub: 'case-logs-view-sub', meta: 'case-logs-view-meta', body: 'case-logs-view-body' },
                    {
                        title: 'Previous Version \u2014 ' + (v.clientName || 'Unnamed'),
                        sub: 'Saved by ' + (v.savedBy || '\u2014') + ' \u00B7 ' + new Date(v.savedAt).toLocaleString(),
                        metaHtml: '<div class="reg-meta" style="margin-bottom:10px;">' + (v.isDraft ? 'DRAFT (no Case ID yet)' : ('Case ID ' + escapeHtmlAttr(v.caseId || ''))) + ' \u00B7 Phase: ' + escapeHtmlAttr(v.phase || '\u2014') + '</div>'
                    },
                    v.content
                );
            } catch (e) {
                document.getElementById('case-logs-view-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Network error loading this version.</p>';
            }
        }
        async function openCaseLogsFullView(id, evt) {
            if (evt) evt.stopPropagation();
            const modal = document.getElementById('case-logs-view-modal');
            document.getElementById('case-logs-view-title').innerText = 'Current Version';
            document.getElementById('case-logs-view-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Loading...</p>';
            modal.classList.add('open');
            try {
                const res = await fetch('/api/case-repository?id=' + encodeURIComponent(id), { credentials: 'include' });
                const data = await res.json();
                if (!data || !data.success) {
                    document.getElementById('case-logs-view-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">' + ((data && data.error) || 'Could not load this case.') + '</p>';
                    return;
                }
                const c = data.case;
                renderReadOnlyCaseInto(
                    { title: 'case-logs-view-title', sub: 'case-logs-view-sub', meta: 'case-logs-view-meta', body: 'case-logs-view-body' },
                    {
                        title: 'Full Case \u2014 ' + (c.clientName || 'Unnamed'),
                        sub: 'Current version \u00B7 last saved ' + new Date(c.updatedAt).toLocaleString(),
                        metaHtml: '<div class="reg-meta" style="margin-bottom:10px;">' + (c.isDraft ? 'DRAFT (no Case ID yet)' : ('Case ID ' + escapeHtmlAttr(c.caseId || ''))) + ' \u00B7 Phase: ' + escapeHtmlAttr(c.phase || '\u2014') + ' \u00B7 By ' + escapeHtmlAttr(c.submittedBy || c.ownerUsername || '') + '</div>'
                    },
                    c.content
                );
            } catch (e) {
                document.getElementById('case-logs-view-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Network error loading this case.</p>';
            }
        }
        function closeCaseLogsView() { document.getElementById('case-logs-view-modal').classList.remove('open'); }

        // Admin clicks a trainee in the online list -> shows that user's
        // LATEST SAVED (or autosaved) case, read-only, without touching the
        // admin's own in-progress work in the main editor. Renders via a
        // detached clone of the empty capture-area template (see
        // applyCaseContentToDOM/extractReadableSections above).
        async function openMonitorCase(username) {
            const modal = document.getElementById('monitor-case-modal');
            document.getElementById('monitor-case-title').innerText = 'Latest Saved Case \u2014 ' + username;
            document.getElementById('monitor-case-meta').innerHTML = '';
            document.getElementById('monitor-case-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Loading latest saved version...</p>';
            modal.classList.add('open');
            try {
                const res = await fetch('/api/monitor-case?username=' + encodeURIComponent(username), { credentials: 'include' });
                const data = await res.json();
                if (!data || !data.success) {
                    document.getElementById('monitor-case-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">' + ((data && data.error) || 'No saved cases found for this user yet.') + '</p>';
                    return;
                }
                const c = data.case;
                document.getElementById('monitor-case-meta').innerHTML =
                    '<div class="reg-meta" style="margin-bottom:10px;">Client: <b>' + escapeHtmlAttr(c.clientName || 'Unnamed') + '</b> &middot; Phase: ' + escapeHtmlAttr(c.phase || '\u2014') +
                    ' &middot; ' + (c.isDraft ? 'DRAFT (no Case ID yet)' : ('Case ID ' + escapeHtmlAttr(c.caseId || ''))) +
                    ' &middot; Last saved ' + new Date(c.updatedAt).toLocaleString() + '</div>';
                if (_emptyCaptureAreaTemplate) {
                    const offscreen = inertCaseCopy();
                    applyCaseContentToDOM(c.content, offscreen);
                    document.getElementById('monitor-case-body').innerHTML = extractReadableSections(offscreen);
                } else {
                    document.getElementById('monitor-case-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Preview unavailable.</p>';
                }
            } catch (e) {
                document.getElementById('monitor-case-body').innerHTML = '<p style="font-size:12px;color:#94a3b8;">Network error loading this user\u2019s latest case.</p>';
            }
        }
        function closeMonitorCase() { document.getElementById('monitor-case-modal').classList.remove('open'); }
        let heartbeatTimer = null;
        let heartbeatRunning = false, heartbeatBusy = false, heartbeatAgain = false;
        let idleTimer = null;

        // opts.hold: wait at the server for a trainer to start watching (only the scheduled heartbeats of a
        // trainee nobody watches; never the one sent to revive a lapsed session)
        function sendHeartbeat(opts) {
            const session = getSession();
            if (!session) return Promise.resolve(false);
            // as: the account THIS TAB believes it is. A browser has one session cookie, but each tab
            // keeps its own session (sessionStorage), so a second trainee signing in on this browser
            // (another tab, a link from their course, a shared computer) silently re-points every page
            // already open at their account. The server records nothing for a page whose `as` isn't the
            // session it authenticated as, and answers SESSION_CHANGED; this tab then signs itself out
            // instead of writing someone else's work, "online" and screen into that account (which is
            // what made 👁 Watch live show the wrong trainee). See functions/api/heartbeat.js.
            const as = (getRealSession() || {}).username || '';
            const beat = {
                as,
                fullName: session.fullName,
                currentCase: (document.getElementById('client-name-field') ? document.getElementById('client-name-field').innerText.trim() : '') || null
            };
            if (opts && opts.hold) beat.hold = HEARTBEAT_HOLD_S;
            // live view (live-view.js): where the trainee is
            let live = {};
            try { live = window.lshLiveReport ? window.lshLiveReport() : {}; } catch (e) { live = {}; }
            return Promise.resolve(live).catch(() => ({})).then(extra => fetch('/api/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(Object.assign(beat, extra))
            }))
            .then(async r => {
                if (r.status === 401) {
                    handleSessionExpired('Your session has expired. Please log in again.');
                    return false;
                }
                // 409 SESSION_CHANGED (someone else signed in on this browser) is handled for every
                // /api/ request in the fetch wrapper above, this one included: the tab signs itself out.
                if (r.status === 409) return false;
                if (r.ok) {
                    const d = await r.clone().json().catch(() => null);
                    // is a trainer watching? d.screenId: the trainee's screen the server has
                    if (d && window.lshLiveWatched) window.lshLiveWatched(!!d.watched, d);
                }
                return r.ok;
            })
            .catch(() => false);
        }

        // A request refused only because the session's heartbeat lapsed (the computer slept,
        // or the browser paused a background tab) is sent again once, right after a heartbeat,
        // so the trainee's note, call or save goes through instead of failing. The server
        // refuses those before doing anything, so sending one again is safe.
        // Every /api/ request also says which account THIS TAB believes it is (X-LSH-As). A browser holds
        // one session cookie but each tab keeps its own session, so a second trainee signing in here
        // re-points every page already open at their account — a stale tab's case saves, time entries and
        // drill results landed in their name, and its reads came back as their data. The server refuses
        // any request whose X-LSH-As isn't the account it authenticated as (functions/_utils.js), and the
        // first refusal signs this tab out, so nothing of one trainee's work reaches another's account.
        // Only our own API is told: never a cross-origin request, which has no business knowing the name.
        const ourApi = (url) => { try { const u = new URL(url, location.href); return u.origin === location.origin && u.pathname.startsWith('/api/'); } catch (e) { return false; } };
        (function () {
            const nativeFetch = window.fetch.bind(window);
            window.fetch = async function (input, init) {
                const url = typeof input === 'string' ? input : (input && input.url) || '';
                const as = (getRealSession() || {}).username || '', gen = _sessionGen;
                // Taken over and nobody signed in here since: the browser's cookie isn't this tab's to
                // use, so the request never leaves. Signing in again (a ticket from their course) does.
                if (_takenOver && !as && ourApi(url) && !SIGN_IN_API.test(new URL(url, location.href).pathname)) {
                    return new Response(JSON.stringify({ success: false, code: 'SESSION_CHANGED', error: 'This browser is signed in as someone else now. Open the CMS again from your course to carry on.' }),
                        { status: 409, headers: { 'Content-Type': 'application/json' } });
                }
                let req = input, opts = init;
                if (as && ourApi(url)) {
                    if (typeof input === 'string' || input instanceof URL) {
                        const h = new Headers((init && init.headers) || undefined);
                        h.set('X-LSH-As', as);
                        opts = Object.assign({}, init, { headers: h });
                    } else {
                        const h = new Headers(input.headers);
                        h.set('X-LSH-As', as);
                        req = new Request(input, { headers: h });
                    }
                }
                const res = await nativeFetch(req, opts);
                if (res.status === 409 && as && ourApi(url)) {
                    const d = await res.clone().json().catch(() => null);
                    // Someone else signed in on this browser. Only act while this tab is still the account
                    // it claimed and hasn't signed in as anyone since (a request already on its way when
                    // this tab itself signed in as someone new gets the same answer, and is not a takeover).
                    if (d && d.code === 'SESSION_CHANGED' && gen === _sessionGen && (getRealSession() || {}).username === as) {
                        handleSessionTakenOver((getSession() || {}).fullName || as);
                    }
                    return res;
                }
                if (res.status !== 401) return res;
                if (!/\/api\//.test(url) || /\/api\/(heartbeat|login|logout)\b/.test(url) || !getSession()) return res;
                const data = await res.clone().json().catch(() => null);
                if (!data || data.code !== 'SESSION_EXPIRED') return res;
                return (await sendHeartbeat()) ? nativeFetch(req, opts) : res;
            };
        })();

        function stopHeartbeat() {
            if (heartbeatTimer) {
                clearTimeout(heartbeatTimer);
                heartbeatTimer = null;
            }
            heartbeatRunning = false;
            heartbeatAgain = false;
        }

        // One heartbeat at a time: the next goes 30 s (45 s in a background tab) after the last was sent,
        // or straight after it when the last one waited at the server.
        function scheduleHeartbeat(wait) {
            clearTimeout(heartbeatTimer);
            heartbeatTimer = setTimeout(heartbeatLoop, Math.max(0, wait || 0));
        }
        function heartbeatLoop() {
            heartbeatTimer = null;
            if (!heartbeatRunning) return;
            if (heartbeatBusy) { heartbeatAgain = true; return; }
            heartbeatBusy = true;
            const sentAt = Date.now();
            const hold = !!(window.lshLiveCanWait && window.lshLiveCanWait());   // a trainee nobody watches (live-view.js)
            sendHeartbeat({ hold }).then(() => {
                heartbeatBusy = false;
                if (!heartbeatRunning) return;
                const wait = heartbeatAgain ? 0 : sentAt + (document.hidden ? HEARTBEAT_HIDDEN_MS : HEARTBEAT_INTERVAL_MS) - Date.now();
                heartbeatAgain = false;
                scheduleHeartbeat(wait);
            });
        }
        // live-view.js: a watch just ended, so the next heartbeat (waiting for the next watch) goes now
        window.lshHeartbeatSoon = function () {
            if (!heartbeatRunning) return;
            if (heartbeatBusy) heartbeatAgain = true; else scheduleHeartbeat(0);
        };

        function startHeartbeat() {
            stopHeartbeat();
            heartbeatRunning = true;
            heartbeatLoop();
        }

        function onUserActivity() {
            if (!getSession()) return;
            resetIdleTimer();
        }

        function resetIdleTimer() {
            if (!getSession()) return;
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(onIdleTimeout, IDLE_TIMEOUT_MS);
        }

        function onIdleTimeout() {
            logoutSession('Logged out due to inactivity.');
        }

        function startIdleTracking() {
            stopIdleTracking();
            ['mousemove', 'keydown', 'click'].forEach(evt => {
                document.addEventListener(evt, onUserActivity, { passive: true });
            });
            resetIdleTimer();
        }

        function stopIdleTracking() {
            if (idleTimer) {
                clearTimeout(idleTimer);
                idleTimer = null;
            }
            ['mousemove', 'keydown', 'click'].forEach(evt => {
                document.removeEventListener(evt, onUserActivity);
            });
        }

        function resumeSession() {
            const session = getSession();
            if (!session) {
                applySessionUI();
                return;
            }
            sendHeartbeat().then(alive => {
                if (alive) {
                    applySessionUI();
                    startHeartbeat();
                    startIdleTracking();
                } else {
                    applySessionUI();
                }
            });
        }
        // NOTE: syncCaseSnapshot() (which POSTed to the old, now-retired
        // /api/cases activity log) has been removed — saveCase()/
        // updateCase()/archiveCaseAsDraft()/autoSaveProgress() now write
        // directly to the server-side Case Repository (/api/case-repository),
        // which is also what Monitoring reads from, so no separate sync step
        // is needed anymore.

        /* =========================================================
           ANNOUNCEMENTS (ticker) & ALERTS (full-screen) — both backed
           by Cloudflare D1 via /api/announcement and /api/alert, and
           kept in sync for every connected user through /api/state.
           ========================================================= */
        const ALERT_SWATCHES = ['#b91c1c', '#c2410c', '#a16207', '#166534', '#1d4ed8', '#4c1d95', '#0f172a'];
        let alertImageDataUrl = null;
        (function buildAlertSwatches() {
            document.addEventListener('DOMContentLoaded', () => {
                const row = document.getElementById('alert-bg-swatches');
                if (!row) return;
                row.innerHTML = ALERT_SWATCHES.map(c => `<div class="swatch" style="background:${c}" onclick="selectAlertSwatch('${c}', this)"></div>`).join('');
            });
        })();
        function selectAlertSwatch(color, el) {
            document.getElementById('alert-bg-color').value = color;
            document.querySelectorAll('#alert-bg-swatches .swatch').forEach(s => s.classList.remove('selected'));
            if (el) el.classList.add('selected');
        }
        // Alert images go to R2 as well. The preview renders instantly from a
        // local object URL so the admin isn't staring at a blank box while the
        // upload runs; `alertImageDataUrl` then holds the /api/file?key=<key>
        // path that gets broadcast, not the image bytes. The variable keeps
        // its old name so the alert-render path at refreshSiteState (which
        // just assigns it to img.src) needs no change — a path works there
        // exactly as a data URI did.
        let alertImagePreviewObjectUrl = null;
        async function previewAlertImage(input) {
            const file = input.files[0]; if (!file) return;
            const preview = document.getElementById('alert-image-preview');
            if (file.size > DOC_UPLOAD_MAX_BYTES) {
                showToast('That image is too large (max ' + formatBytes(DOC_UPLOAD_MAX_BYTES) + ').', 'error');
                input.value = '';
                return;
            }
            if (alertImagePreviewObjectUrl) { URL.revokeObjectURL(alertImagePreviewObjectUrl); alertImagePreviewObjectUrl = null; }
            alertImagePreviewObjectUrl = URL.createObjectURL(file);
            preview.src = alertImagePreviewObjectUrl;
            preview.style.display = 'inline-block';
            preview.style.opacity = '0.5';
            try {
                const up = await uploadFileToR2(file, 'alert-image');
                alertImageDataUrl = up.url;
                preview.style.opacity = '1';
            } catch (err) {
                alertImageDataUrl = null;
                preview.style.display = 'none';
                preview.src = '';
                preview.style.opacity = '1';
                showToast('Could not upload that image: ' + (err && err.message ? err.message : 'unknown error'), 'error');
            }
            input.value = '';
        }
        function clearAlertImage() {
            alertImageDataUrl = null;
            if (alertImagePreviewObjectUrl) { URL.revokeObjectURL(alertImagePreviewObjectUrl); alertImagePreviewObjectUrl = null; }
            document.getElementById('alert-image-input').value = '';
            const preview = document.getElementById('alert-image-preview');
            preview.style.display = 'none'; preview.src = ''; preview.style.opacity = '1';
        }
        function makeAnnouncement() {
            const text = document.getElementById('announce-text-input').value.trim();
            if (!text) return;
            fetch('/api/announcement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ text }) })
                .then(r => r.json()).then(() => {
                    document.getElementById('announce-text-input').value = '';
                    showToast('Announcement broadcasted.', 'info');
                    refreshSiteState();
                }).catch(() => showToast('Network error broadcasting announcement.', 'error'));
        }
        function clearAnnouncement() {
            fetch('/api/announcement', { method: 'DELETE', credentials: 'include' }).then(() => { showToast('Ticker cleared.', 'info'); refreshSiteState(); }).catch(() => {});
        }
        function setAlert() {
            const text = document.getElementById('alert-text-input').value.trim();
            if (!text) { showToast('Please enter alert text.', 'error'); return; }
            const bgColor = document.getElementById('alert-bg-color').value;
            const duration = parseInt(document.getElementById('alert-duration-select').value, 10) || 0;
            const scheduleRaw = document.getElementById('alert-schedule-input').value;
            const startAt = scheduleRaw ? new Date(scheduleRaw).toISOString() : new Date().toISOString();
            fetch('/api/alert', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ text, bgColor, image: alertImageDataUrl, durationSeconds: duration, startAt })
            }).then(r => r.json()).then(() => {
                showToast(scheduleRaw ? 'Alert scheduled.' : 'Alert is now live for all users.', 'alert');
                refreshSiteState();
            }).catch(() => showToast('Network error setting alert.', 'error'));
        }
        function stopAlert() {
            fetch('/api/alert', { method: 'DELETE', credentials: 'include' }).then(() => { showToast('Alert stopped.', 'info'); dismissAlertLocally(); refreshSiteState(); }).catch(() => {});
        }
        function dismissAlertLocally() {
            document.getElementById('alert-overlay').classList.remove('open');
        }

        /* =========================================================
           PING — instant one-shot notification (toast + sound), sent to
           a specific user or broadcast to everyone. Unlike the Alert
           overlay it never takes over the screen. It renders with its
           own 'ping' toast style and its own louder, longer alert tone
           (see playNotificationSound's 'ping' pattern) so it stands out
           from ordinary success/info toasts, and always shows who sent
           it via a "By: ..." line — "By: System Administrator" for the
           hardcoded Master Account, otherwise "By: Admin <First Name>".
           Delivered the same way Announcement/Alert are: written
           server-side via /api/ping (including the "by" attribution),
           then picked up by every connected browser on the next
           /api/state poll (see applySiteState -> state.ping).
           ========================================================= */
        let pingMode = 'single'; // 'single' (one-or-more specific users) | 'all'
        let _pingUserListSorted = []; // _activeUsersCache, sorted alphabetically by full name, feeds the search dropdown
        let pingSelectedUsers = []; // usernames currently selected as recipients, in the order they were picked
        function setPingMode(mode) {
            pingMode = mode;
            const singleBtn = document.getElementById('ping-mode-single-btn');
            const allBtn = document.getElementById('ping-mode-all-btn');
            const userRow = document.getElementById('ping-user-row');
            if (singleBtn) singleBtn.style.background = mode === 'single' ? 'var(--navy)' : '#94a3b8';
            if (allBtn) allBtn.style.background = mode === 'all' ? 'var(--navy)' : '#94a3b8';
            if (userRow) userRow.style.display = mode === 'single' ? '' : 'none';
            if (mode !== 'single') closePingUserList();
        }
        // Builds the alphabetized (by full name) recipient list used by the
        // searchable dropdown below. Each row surfaces Full Name, username,
        // Batch ID, and Type, in that order, so admins can search/scan by any
        // of them.
        function populatePingUserSelect() {
            _pingUserListSorted = (_activeUsersCache || []).slice().sort((a, b) =>
                (a.full_name || a.username || '').localeCompare(b.full_name || b.username || '', undefined, { sensitivity: 'base' }));
            // Drop any previously-picked recipients who are no longer in the
            // active list (e.g. suspended since) rather than silently keep
            // targeting them.
            pingSelectedUsers = pingSelectedUsers.filter(uname => _pingUserListSorted.some(u => u.username === uname));
            syncPingHiddenValue();
            renderPingUserChips();
            renderPingUserList(_pingUserListSorted);
        }
        function renderPingUserList(list) {
            const listEl = document.getElementById('ping-user-list');
            if (!listEl) return;
            if (!list.length) {
                listEl.innerHTML = '<div style="padding:10px;font-size:12px;color:#94a3b8;">No matching users found</div>';
                return;
            }
            listEl.innerHTML = list.map(u => {
                const uname = u.username || '';
                const fullName = u.full_name || uname;
                const batchId = u.batch_id || u.batchId || '\u2014';
                const type = u.user_type || u.userType || '\u2014';
                const checked = pingSelectedUsers.includes(uname);
                return '<div class="ping-user-option' + (checked ? ' active' : '') + '" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:9px;" ' +
                    'onclick="togglePingUser(' + escapeHtmlAttr(JSON.stringify(uname)) + ')">' +
                    '<input type="checkbox" tabindex="-1" style="pointer-events:none;flex-shrink:0;" ' + (checked ? 'checked' : '') + '>' +
                    '<div style="flex:1;min-width:0;">' +
                    '<div style="font-weight:700;color:var(--navy);">' + escapeHtmlAttr(fullName) + '</div>' +
                    '<div style="color:#64748b;font-size:10.5px;margin-top:2px;">@' + escapeHtmlAttr(uname) +
                    ' \u00B7 Batch ' + escapeHtmlAttr(String(batchId)) + ' \u00B7 ' + escapeHtmlAttr(type) + '</div>' +
                    '</div></div>';
            }).join('');
        }
        // Filters by Full Name, username, Batch ID, or Type — whichever the
        // admin is searching by — while keeping results alphabetical. Typing
        // to search no longer clears whoever is already selected.
        function filterPingUserList() {
            openPingUserList();
            const q = (document.getElementById('ping-user-search').value || '').trim().toLowerCase();
            if (!q) { renderPingUserList(_pingUserListSorted); return; }
            const filtered = _pingUserListSorted.filter(u => {
                const fullName = (u.full_name || '').toLowerCase();
                const uname = (u.username || '').toLowerCase();
                const batchId = String(u.batch_id || u.batchId || '').toLowerCase();
                const type = (u.user_type || u.userType || '').toLowerCase();
                return fullName.includes(q) || uname.includes(q) || batchId.includes(q) || type.includes(q);
            });
            renderPingUserList(filtered);
        }
        // Adds/removes a user from the recipient set. The list stays open
        // afterwards so the admin can keep picking more people — it only
        // closes via the outside-click/Escape handlers below, or removePingUser
        // is not what closes it either.
        function togglePingUser(username) {
            const idx = pingSelectedUsers.indexOf(username);
            if (idx === -1) pingSelectedUsers.push(username); else pingSelectedUsers.splice(idx, 1);
            syncPingHiddenValue();
            renderPingUserChips();
            filterPingUserList(); // re-render against whatever's currently typed in search, preserving checkmarks
        }
        function removePingUser(username) {
            pingSelectedUsers = pingSelectedUsers.filter(u => u !== username);
            syncPingHiddenValue();
            renderPingUserChips();
            filterPingUserList();
        }
        function syncPingHiddenValue() {
            const hidden = document.getElementById('ping-user-select');
            if (hidden) hidden.value = JSON.stringify(pingSelectedUsers);
        }
        // Renders the selected recipients as removable chips above the search box.
        function renderPingUserChips() {
            const wrap = document.getElementById('ping-user-chips');
            if (!wrap) return;
            if (!pingSelectedUsers.length) { wrap.innerHTML = ''; return; }
            wrap.innerHTML = pingSelectedUsers.map(uname => {
                const u = _pingUserListSorted.find(x => x.username === uname);
                const label = u ? (u.full_name || uname) : uname;
                return '<span style="display:inline-flex;align-items:center;gap:6px;background:#eef2ff;color:var(--navy);border:1px solid #c7d2fe;border-radius:999px;padding:4px 10px 4px 12px;font-size:11px;font-weight:700;">' +
                    escapeHtmlAttr(label) +
                    '<span onclick="removePingUser(' + escapeHtmlAttr(JSON.stringify(uname)) + ')" style="cursor:pointer;font-weight:900;color:#64748b;line-height:1;">\u00D7</span>' +
                    '</span>';
            }).join('');
        }
        function openPingUserList() {
            const listEl = document.getElementById('ping-user-list');
            if (listEl) listEl.style.display = 'block';
        }
        function closePingUserList() {
            const listEl = document.getElementById('ping-user-list');
            if (listEl) listEl.style.display = 'none';
        }
        // Closing no longer depends on picking a user: clicking anywhere
        // outside the recipient widget, or pressing Escape, closes the list
        // regardless of selection state. Uses 'mousedown' + capture so it
        // fires reliably even if something inside the admin dashboard stops
        // click-event propagation.
        document.addEventListener('mousedown', function (e) {
            const wrap = document.getElementById('ping-user-row');
            if (wrap && !wrap.contains(e.target)) closePingUserList();
        }, true);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closePingUserList();
        });
        // First name of the signed-in admin, used to attribute a ping (e.g.
        // "Jane Doe" -> "Jane"). Falls back gracefully if a full name isn't set.
        function firstNameOf(fullName) {
            const trimmed = String(fullName || '').trim();
            if (!trimmed) return 'Administrator';
            return trimmed.split(/\s+/)[0];
        }
        function sendPing() {
            const asTask = !!(document.getElementById('ping-as-task') && document.getElementById('ping-as-task').checked);
            const typed = document.getElementById('ping-text-input').value.trim();
            const text = typed && asTask ? '[TASK] ' + typed : typed;
            if (!text) { showToast('Please enter a ping message.', 'error'); return; }
            // target is '__all__' for a broadcast, a single username string for
            // one recipient, or an array of usernames when several are picked —
            // the backend's /api/ping needs to accept all three shapes.
            let target = '__all__';
            if (pingMode === 'single') {
                if (!pingSelectedUsers.length) { showToast('Select at least one user to ping.', 'error'); return; }
                target = pingSelectedUsers.length === 1 ? pingSelectedUsers[0] : pingSelectedUsers.slice();
            }
            // Attribute the ping: the hardcoded Master Account always shows as
            // "System Administrator"; any other Admin shows as "Admin <First Name>".
            const pingSession = getSession();
            const isMasterSender = !!(pingSession && pingSession.username === 'LSHADMIN123');
            const sentBy = isMasterSender ? 'System Administrator' : ('Admin ' + firstNameOf(pingSession && pingSession.fullName));
            fetch('/api/ping', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
                body: JSON.stringify({ text, target, by: sentBy })
            })
            .then(r => r.json())
            .then(data => {
                if (!data || !data.success) { showToast((data && data.error) || 'Failed to send ping.', 'error'); return; }
                const recipientLabel = pingMode === 'all' ? 'all users' :
                    (pingSelectedUsers.length === 1 ? pingSelectedUsers[0] : pingSelectedUsers.length + ' users');
                showToast('Ping sent to ' + recipientLabel + '.', 'success');
                document.getElementById('ping-text-input').value = '';
                pingSelectedUsers = [];
                syncPingHiddenValue();
                const search = document.getElementById('ping-user-search');
                if (search) search.value = '';
                renderPingUserChips();
                renderPingUserList(_pingUserListSorted);
                closePingUserList();
                refreshSiteState();
            })
            .catch(() => showToast('Network error sending ping.', 'error'));
        }

        /* =========================================================
           SITE STATE POLLING — pause / announcement / alert / pings,
           shared across every connected browser via /api/state.
           ========================================================= */
        let lastAlertId = null;
        let lastAnnouncementText = null; // null = not yet initialized (first poll after page load)
        // Pings this browser has shown (kept across reloads, so a reload doesn't show one again).
        const SEEN_PINGS_KEY = 'LSH_SEEN_PINGS_V1';
        const seenPings = new Set((() => { try { return JSON.parse(localStorage.getItem(SEEN_PINGS_KEY) || '[]'); } catch (e) { return []; } })().map(String));
        function markPingSeen(id) {
            seenPings.add(String(id));
            try { localStorage.setItem(SEEN_PINGS_KEY, JSON.stringify([...seenPings].slice(-100))); } catch (e) { /* private mode: this tab still remembers */ }
        }
        function refreshSiteState() {
            fetch('/api/state').then(r => r.json()).then(state => applySiteState(state)).catch(() => {});
        }
        // Every 15 s, every 30 s in a background tab (a ping stays up for a minute, so none is missed),
        // and right away when the tab comes back into view.
        const SITE_STATE_MS = 15000, SITE_STATE_HIDDEN_MS = 30000;
        let _siteStateAt = Date.now();
        function pollSiteState() {
            if (Date.now() - _siteStateAt < (document.hidden ? SITE_STATE_HIDDEN_MS : SITE_STATE_MS) - 1000) return;
            _siteStateAt = Date.now();
            refreshSiteState();
        }
        function deliverPing(ping) {
            if (!ping || !ping.id || seenPings.has(String(ping.id))) return;
            const pingSession = getSession();
            const myUsername = pingSession && pingSession.username;
            const isForMe = ping.target === '__all__' ||
                (myUsername && (Array.isArray(ping.target) ? ping.target.includes(myUsername) : ping.target === myUsername));
            if (!isForMe) return;
            const age = typeof ping.ageMs === 'number' ? ping.ageMs : (ping.firedAt ? Date.now() - new Date(ping.firedAt).getTime() : 0);
            if (age >= 60000) return;
            markPingSeen(ping.id);
            const byLine = 'By: ' + (ping.by || 'System Administrator');
            // A ping sent as a task ("[TASK] …") waits for Accept, which adds it to the case's Tasks (case-sections.js).
            const taskText = /^\[TASK\]\s*/.test(ping.text || '') ? ping.text.replace(/^\[TASK\]\s*/, '') : null;
            if (taskText && typeof window.showTaskAssignment === 'function') window.showTaskAssignment({ id: ping.id, text: taskText, by: ping.by || 'System Administrator' });
            else showToast('📣 ' + (ping.text || 'You have been pinged by an Administrator.'), 'ping', 6000, byLine);
        }
        function applySiteState(state) {
            if (!state) return;
            // Announcement ticker
            const annText = (state.announcement && state.announcement.text) || 'Welcome to the LSH Training Interface.';
            const tickerText = document.getElementById('ticker-text');
            if (tickerText) tickerText.innerText = annText;
            const announcePreview = document.getElementById('announce-current-preview');
            if (announcePreview) announcePreview.innerText = annText;
            // Notification sound for everyone the moment the broadcast actually
            // changes (skipped on first load, so reopening/refreshing the page
            // doesn't replay a sound for an announcement that's been up a while).
            if (lastAnnouncementText !== null && lastAnnouncementText !== annText) {
                playNotificationSound('info');
            }
            lastAnnouncementText = annText;

            // Alert overlay (full screen, separate from ticker)
            const alertLine = document.getElementById('alert-status-line');
            if (state.alert && state.alert.active) {
                if (alertLine) alertLine.innerHTML = 'Alert is <b>LIVE</b> since ' + new Date(state.alert.startAt).toLocaleTimeString() + (state.alert.durationSeconds ? (' \u00B7 auto-stops after ' + state.alert.durationSeconds + 's') : ' \u00B7 until manually stopped');
                const ovState = document.getElementById('ov-alert-state'); if (ovState) ovState.innerText = 'Active';
                if (lastAlertId !== state.alert.id) {
                    lastAlertId = state.alert.id;
                    const overlay = document.getElementById('alert-overlay');
                    overlay.style.background = hexToRgba(state.alert.bgColor || '#b91c1c', 0.65);
                    document.getElementById('alert-overlay-text').innerText = state.alert.text || '';
                    const img = document.getElementById('alert-overlay-image');
                    if (state.alert.image) { img.src = state.alert.image; img.style.display = 'block'; } else { img.style.display = 'none'; img.src=''; }
                    overlay.classList.add('open');
                    playNotificationSound('alert');
                }
            } else {
                if (alertLine) alertLine.innerText = 'No alert is currently active.';
                const ovState = document.getElementById('ov-alert-state'); if (ovState) ovState.innerText = 'None Active';
                lastAlertId = null;
                document.getElementById('alert-overlay').classList.remove('open');
            }

            // Ping — instant toast+sound notification to a specific user or
            // everyone, styled and sounding exactly like the login-success
            // toast (see showToast). /api/state lists the last minute's pings,
            // each with its age measured on the server (so a computer whose clock
            // is off still gets them), and a ping sent right after another one
            // isn't lost between two polls. Each one shows once per browser, even
            // across reloads; older ones (e.g. sent before this tab was opened)
            // are skipped.
            const pings = Array.isArray(state.pings) ? state.pings : (state.ping ? [state.ping] : []);
            pings.slice().sort((x, y) => x.id - y.id).forEach(deliverPing);

            // Pause overlay (freezes, no logout) — admins are exempt so they can always resume
            const pauseOverlay = document.getElementById('pause-overlay');
            const pauseLabel = document.getElementById('pause-state-label');
            const pauseBtn = document.getElementById('pause-toggle-btn');
            const ovPause = document.getElementById('ov-pause-state');
            const sessionForPause = getRealSession();   // Pause never stops a trainer, Trainee view or not
            const isAdminSession = sessionForPause && sessionForPause.userType === 'Admin';
            if (state.paused) {
                if (isAdminSession) {
                    pauseOverlay.classList.remove('open');
                } else {
                    pauseOverlay.classList.add('open');
                }
                if (pauseLabel) { pauseLabel.innerText = 'Paused'; pauseLabel.style.color = 'var(--classified-red)'; }
                if (pauseBtn) pauseBtn.innerText = '\u25B6 Resume Activity';
                if (ovPause) ovPause.innerText = 'Paused';
            } else {
                pauseOverlay.classList.remove('open');
                if (pauseLabel) { pauseLabel.innerText = 'Active (not paused)'; pauseLabel.style.color = '#166534'; }
                if (pauseBtn) pauseBtn.innerText = '\u23F8 Pause All Activity';
                if (ovPause) ovPause.innerText = 'Active';
            }

            // (Site-state fetch is async: on a fresh page load the first renderRepo() may have run before the
            // session was settled. Re-render now.)
            renderRepo();
            runOverlayIntegrityCheck();
        }
        function hexToRgba(hex, alpha) {
            hex = (hex || '#b91c1c').replace('#', '');
            if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
            const num = parseInt(hex, 16);
            const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
            return `rgba(${r},${g},${b},${alpha})`;
        }
        setInterval(pollSiteState, SITE_STATE_MS);
        document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - _siteStateAt > 5000) { _siteStateAt = Date.now(); refreshSiteState(); } });

        /* =========================================================
           PAUSE — freezes activity site-wide, no logout, resumable
           ========================================================= */
        function togglePause() {
            fetch('/api/pause', { method: 'POST', credentials: 'include' })
                .then(r => r.json())
                .then(data => { showToast(data.paused ? 'Activity paused for all users.' : 'Activity resumed for all users.', 'info'); refreshSiteState(); })
                .catch(() => showToast('Network error toggling pause.', 'error'));
        }

        // Replaces the old admin-editable, localStorage-backed logo/background
        // system (changeLogo/resetLogo/applyLogo/setBackgroundImage/
        // resetBackgroundImage/applyBackgroundImage). A corrupted/truncated
        // localStorage value was causing the logo to render as blank space —
        // the fix is a single hardcoded constant, unconditionally applied,
        // with nothing left for localStorage to corrupt.
        function renderAgencyLogo() {
            const seal = document.getElementById('agency-seal');
            if (seal) seal.innerHTML = '<img src="' + AGENCY_LOGO + '" alt="Agency Logo">';
            const authSeal = document.getElementById('auth-seal');
            if (authSeal) authSeal.innerHTML = '<img src="' + AGENCY_LOGO + '" alt="Agency Logo" style="width:100%;height:100%;object-fit:contain;">';
        }

        /* =========================================================
           INACTIVITY REMINDER — triggered by user inactivity on the
           case (never by technical errors/glitches — see the
           TECHNICAL-INTERRUPTION AUTO-ARCHIVE block below for that).
           Threshold is 5 minutes of no detected activity. Once hit,
           the user gets a 30-second window to choose Continue,
           Archive Case (Save as Draft), or Start a New Case — if no
           response, the case is silently auto-archived as a draft.
           This applies to the CASE only — it does not log the user
           out, lock the screen, or affect anything else.
           ========================================================= */
        const INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
        const AUTO_ARCHIVE_COUNTDOWN_SECONDS = 30;
        let inactivityTimer = null;
        let autoArchiveTimer = null;
        let autoArchiveSecondsLeft = AUTO_ARCHIVE_COUNTDOWN_SECONDS;
        let autoArchivePromptOpen = false;

        function resetInactivityTimer() {
            if (autoArchivePromptOpen) return; // don't reset while the user is being asked to respond
            clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(checkInactivityAndPrompt, INACTIVITY_THRESHOLD_MS);
        }
        function checkInactivityAndPrompt() {
            // Only prompt if there's an actual case in progress worth protecting.
            if (!hasCaseContent()) { resetInactivityTimer(); return; }
            scheduleInactivityPrompt();
        }
        // Any real user activity resets the 5-minute inactivity clock.
        ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'input'].forEach(evt => {
            window.addEventListener(evt, resetInactivityTimer, { passive: true });
        });
        resetInactivityTimer();

        function scheduleInactivityPrompt() {
            if (autoArchivePromptOpen) return; // avoid stacking prompts
            autoArchivePromptOpen = true;
            autoArchiveSecondsLeft = AUTO_ARCHIVE_COUNTDOWN_SECONDS;
            const countdownEl = document.getElementById('auto-archive-countdown');
            countdownEl.innerText = autoArchiveSecondsLeft;
            document.getElementById('auto-archive-modal').classList.add('open');

            autoArchiveTimer = setInterval(() => {
                autoArchiveSecondsLeft -= 1;
                countdownEl.innerText = Math.max(autoArchiveSecondsLeft, 0);
                if (autoArchiveSecondsLeft <= 0) {
                    autoArchiveOnNoResponse();
                }
            }, 1000);
        }
        function closeInactivityPrompt() {
            clearInterval(autoArchiveTimer);
            autoArchiveTimer = null;
            autoArchivePromptOpen = false;
            document.getElementById('auto-archive-modal').classList.remove('open');
        }

        // "Continue" — user is still there; resume exactly where they left off.
        function continueEditing() {
            closeInactivityPrompt();
            resetInactivityTimer(); // give the user another full 5 minutes of activity
        }

        // "Archive Case (Save as Draft)" — an explicit user choice, so this
        // reuses the exact same path as the sidebar button (no permanent
        // Case ID is assigned; the usual confirmation is shown).
        function archiveFromInactivityPrompt() {
            closeInactivityPrompt();
            archiveCaseAsDraft();
            resetInactivityTimer();
        }

        // "Start a New Case" — an explicit user choice made via this
        // prompt, so it skips newCase()'s own confirm() dialog (the prompt
        // itself already serves as that confirmation). All progress is
        // wiped and currentCaseId is cleared, freeing that case-id "slot"
        // for the new, blank case — a real ID is only ever minted later,
        // when this new case is actually saved.
        function startNewCaseFromInactivityPrompt() {
            closeInactivityPrompt();
            blankCaseEditorContent();
            clearPersistedEditorState();
            currentCaseIsDraft = false;
            revertOther('main-case-type', 'main-case-other', 'main-revert');
            updatePhaseDisplay('INTAKE');
            generateCaseId();
            showTab('profile');
            renderRepo();
            showToast('Started a new case.', 'info');
            resetInactivityTimer();
        }

        // No response within the countdown — silently archive as a draft
        // so nothing is lost, then give the user a fresh 5-minute window.
        // No alert() here: the user isn't there to dismiss one.
        function autoArchiveOnNoResponse() {
            closeInactivityPrompt();
            if (hasUnsyncedChanges()) autoSaveProgress('inactivity-timeout');
            resetInactivityTimer();
        }

        /* =========================================================
           AUTOSAVE ON INTERRUPTIONS — separate from the inactivity prompt
           above. Nothing is saved to the server while you work (no timer, no
           save on a tab switch): every request counts toward the account's
           monthly requests. Your work is kept in this browser as you type, and
           it's sent to the server, as a draft (a finalized case stays final),
           when something interrupts it:
           - network: the connection drops ('offline'): it's sent the moment the
             connection is back ('online'); a save that failed is sent then too;
           - accidental closing: the tab or browser closes ('beforeunload',
             'pagehide'), sent so it outlives the page (keepalive);
           - the device: the browser suspends the page ('freeze': sleep, low
             memory), or the tab has been away for AUTOSAVE_AWAY_MS (2 minutes);
           - a crash or power cut (no event at all): the work comes back from
             this browser on the next visit (restoreCurrentEditorState) and is
             sent then ('recovered').
           Only work the server doesn't have yet is sent (hasUnsyncedChanges). A
           case never saved before isn't sent while the page closes (its new id
           would be lost with the page and the next visit would make a second
           draft): it waits in this browser for the next visit instead.
           ========================================================= */
        const AUTOSAVE_AWAY_MS = (window.CMS_AUTOSAVE_TIMINGS && window.CMS_AUTOSAVE_TIMINGS.away) || 2 * 60 * 1000;
        let _lastInterruptionSaveAt = 0, _saveWhenOnline = false, _awayTimer = null;
        function saveOnInterruption(reason, opts) {
            if (!hasAuthorizedAccess() || !hasUnsyncedChanges()) return;
            if (navigator.onLine === false) { _saveWhenOnline = true; return; }
            const closing = !!(opts && opts.keepalive);
            // A new case waits in this browser for the next visit (its new id would be lost with the page). A trainee's work
            // on a case file goes now: the server keeps it to one case per trainee per file.
            if (closing && currentCaseId === null && !(window.mockIsMine && window.mockIsMine())) return;
            const now = Date.now();
            if (now - _lastInterruptionSaveAt < 2000) return;   // several signals often fire together (pagehide + beforeunload)
            _lastInterruptionSaveAt = now;
            Promise.resolve(autoSaveProgress('interruption:' + reason, opts)).then(ok => { if (!ok && !closing) _saveWhenOnline = true; }).catch(() => { _saveWhenOnline = true; });
        }
        window.addEventListener('beforeunload', () => saveOnInterruption('closing', { keepalive: true }));
        window.addEventListener('pagehide', () => saveOnInterruption('closing', { keepalive: true }));
        document.addEventListener('freeze', () => saveOnInterruption('device', { keepalive: true }));
        document.addEventListener('visibilitychange', () => {
            clearTimeout(_awayTimer);
            if (document.visibilityState === 'hidden') _awayTimer = setTimeout(() => saveOnInterruption('away'), AUTOSAVE_AWAY_MS);
        });
        window.addEventListener('offline', () => {
            if (!hasUnsyncedChanges()) return;
            _saveWhenOnline = true;
            flashAutoSaveIndicator('', 'Offline: your work is kept on this computer and saved when the connection is back.');
        });
        window.addEventListener('online', () => {
            if (!_saveWhenOnline) return;
            _saveWhenOnline = false;
            saveOnInterruption('back-online');
        });

        /* =========================================================
           DOWNLOAD CONFIRMATION
           ========================================================= */
        function requestDownload() {
            if (currentCaseIsDraft || currentCaseId === null) {
                alert('This case doesn\'t have a permanent Case ID yet. Use "Save Case" to finalize it before downloading the summary.');
                return;
            }
            const session = getSession();
            const errorEl = document.getElementById('download-confirm-error');
            errorEl.style.display = 'none';
            if (!session) {
                // No verified session to pull identity from — surface this
                // instead of silently letting an unattributed copy through.
                document.getElementById('dl-fullname').innerText = '\u2014';
                document.getElementById('dl-batchid').innerText = '\u2014';
                errorEl.innerText = 'Your session could not be verified. Please log in again.';
                errorEl.style.display = 'block';
            } else {
                // Auto-filled from the logged-in account — no manual typing,
                // so there's nothing here for the user to get wrong.
                document.getElementById('dl-fullname').innerText = session.fullName;
                document.getElementById('dl-batchid').innerText = session.batchId;
            }
            document.getElementById('dl-date-preview').innerText = new Date().toLocaleString();
            document.getElementById('download-confirm-modal').classList.add('open');
        }
        function closeDownloadConfirm() { document.getElementById('download-confirm-modal').classList.remove('open'); }
        // Print Sequence is now a real, atomic, server-issued counter keyed on
        // this case's permanent Case ID (see /api/print-sequence and
        // nextPrintSequence() in _utils.js) — never a locally-guessed
        // localStorage count, so two people downloading the same case from
        // two different devices at the same moment can never get the same
        // number. This makes confirmDownload async.
        async function confirmDownload() {
            const session = getSession();
            const errorEl = document.getElementById('download-confirm-error');
            if (!session) {
                errorEl.innerText = 'Your session could not be verified. Please log in again.';
                errorEl.style.display = 'block';
                return;
            }
            // Identity is taken straight from the verified session — the same
            // source used everywhere else in the app — so it can't mismatch.
            const fullName = session.fullName;
            const batchId = session.batchId;
            errorEl.style.display = 'none';
            const producedAt = new Date().toLocaleString();

            // Pull the case's original submitter info from the shared repo
            // cache (purely descriptive metadata, already fetched from the
            // server — not itself a uniqueness guarantee, that's what
            // /api/print-sequence below is for).
            const rec = _repoCache.find(i => i.id === currentCaseId);
            const submittedBy = (rec && rec.submittedBy) || session.fullName;
            const submittedByBatch = (rec && rec.submittedByBatch) || session.batchId;
            const submittedAt = (rec && rec.submittedAt) ? new Date(rec.submittedAt).toLocaleString() : producedAt;
            const realCaseId = document.getElementById('case-id-field').innerText.trim();

            let printSequence = 1;
            try {
                const res = await fetch('/api/print-sequence', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ caseId: realCaseId })
                });
                const data = await res.json();
                if (data && data.success) {
                    printSequence = data.printSequence;
                } else {
                    errorEl.innerText = (data && data.error) || 'Could not assign a print sequence number.';
                    errorEl.style.display = 'block';
                    return;
                }
            } catch (e) {
                errorEl.innerText = 'Network error assigning print sequence. Please try again.';
                errorEl.style.display = 'block';
                return;
            }

            closeDownloadConfirm();
            downloadPDF({
                submittedBy: submittedBy,
                submittedByBatch: submittedByBatch,
                submittedAt: submittedAt,
                producedByName: fullName,
                producedByBatch: batchId,
                producedAt: producedAt,
                printSequence: printSequence
            });
        }


        /* =========================================================
           AUTO-FORMAT — masks field values to a consistent,
           professional format live, as the user types.
           ========================================================= */
        function getCaretOffset(el) {
            const sel = window.getSelection();
            if (!sel.rangeCount) return 0;
            const range = sel.getRangeAt(0);
            const pre = range.cloneRange();
            pre.selectNodeContents(el);
            pre.setEnd(range.endContainer, range.endOffset);
            return pre.toString().length;
        }
        function setCaretOffset(el, offset) {
            const sel = window.getSelection();
            const node = el.firstChild;
            if (!node || node.nodeType !== 3) { setCaretToEnd(el); return; }
            const pos = Math.max(0, Math.min(offset, node.length));
            const range = document.createRange();
            range.setStart(node, pos);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
        }
        function setCaretToEnd(el) {
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(el);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }

        // Live mask applied on every keystroke. Length-changing masks (phone/date/ssn/currency)
        // move the caret to the end, which is the standard, predictable behavior for masked inputs.
        // Case-only transforms (name/upper/email) preserve the caret's exact position.
        function liveFormatField(el) {
            const fmt = el.dataset.fmt;
            if (!fmt) return;
            const raw = el.innerText;
            if (!raw) return;
            let val = raw;
            let preserveCaret = false;
            const caretOffset = getCaretOffset(el);

            switch (fmt) {
                case 'phone': {
                    if (raw.includes('@')) { preserveCaret = true; break; } // likely an email in a combined field
                    const d = raw.replace(/\D/g, '').slice(0, 10);
                    if (d.length > 6) val = `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
                    else if (d.length > 3) val = `(${d.slice(0,3)}) ${d.slice(3)}`;
                    else if (d.length > 0) val = `(${d}`;
                    else val = '';
                    break;
                }
                case 'ssn': {
                    const d = raw.replace(/\D/g, '').slice(0, 9);
                    if (d.length > 5) val = `${d.slice(0,3)}-${d.slice(3,5)}-${d.slice(5)}`;
                    else if (d.length > 3) val = `${d.slice(0,3)}-${d.slice(3)}`;
                    else val = d;
                    break;
                }
                case 'date': {
                    const d = raw.replace(/\D/g, '').slice(0, 8);
                    if (d.length > 4) val = `${d.slice(0,2)}/${d.slice(2,4)}/${d.slice(4)}`;
                    else if (d.length > 2) val = `${d.slice(0,2)}/${d.slice(2)}`;
                    else val = d;
                    break;
                }
                case 'currency': {
                    let clean = raw.replace(/[^0-9.]/g, '');
                    const firstDot = clean.indexOf('.');
                    if (firstDot !== -1) clean = clean.slice(0, firstDot + 1) + clean.slice(firstDot + 1).replace(/\./g, '');
                    const parts = clean.split('.');
                    let intPart = (parts[0] || '').replace(/^0+(?=\d)/, '');
                    const decPart = parts.length > 1 ? '.' + parts[1].slice(0, 2) : '';
                    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
                    val = raw.trim() ? '$ ' + (withCommas || '0') + decPart : '';
                    break;
                }
                case 'email': {
                    val = raw.toLowerCase().replace(/[^a-z0-9@._+\-]/g, '');
                    preserveCaret = true;
                    break;
                }
                case 'upper': {
                    val = raw.toUpperCase().replace(/[^A-Z0-9\- ]/g, '');
                    preserveCaret = true;
                    break;
                }
                case 'name': {
                    val = raw.replace(/[^a-zA-Z\s'\-.]/g, '');
                    val = val.replace(/(^|\s)([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase());
                    preserveCaret = true;
                    break;
                }
                case 'year': {
                    val = raw.replace(/\D/g, '').slice(0, 4);
                    break;
                }
                case 'alnum': {
                    val = raw.replace(/[^a-zA-Z0-9]/g, '');
                    preserveCaret = true;
                    break;
                }
            }

            if (val !== raw) {
                el.innerText = val;
                if (preserveCaret) setCaretOffset(el, caretOffset);
                else setCaretToEnd(el);
            }
        }

        // Final cleanup pass on blur: pads decimals, resolves full dates typed/pasted in other forms, etc.
        function finalizeFormatField(el) {
            const fmt = el.dataset.fmt;
            if (!fmt) return;
            let val = el.innerText.trim();
            if (!val) return;
            if (fmt === 'currency') {
                const n = parseFloat(val.replace(/[^0-9.\-]/g, ''));
                if (!isNaN(n)) val = '$ ' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else if (fmt === 'date' && !/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
                const parsed = new Date(val);
                if (!isNaN(parsed.getTime())) {
                    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
                    const dd = String(parsed.getDate()).padStart(2, '0');
                    val = `${mm}/${dd}/${parsed.getFullYear()}`;
                }
            }
            if (val !== el.innerText.trim()) el.innerText = val;
        }

        // Character-set restriction for plain <input> fields (registration, download confirmation, etc.)
        // Keeps only characters valid for the field's declared type as the user types.
        const ALLOW_PATTERNS = {
            'name': /[^\p{L}\p{M}\s'\-.]/gu,
            'batch': /[^a-zA-Z0-9 \-]/g,
            'alnum': /[^a-zA-Z0-9]/g,
            'alnum-upper': /[^a-zA-Z0-9]/g,
            'alnum-underscore': /[^a-zA-Z0-9_]/g,
            'email': /[^a-zA-Z0-9@._+\-]/g,
            'digits': /[^0-9]/g
        };
        document.addEventListener('input', (e) => {
            const el = e.target;
            if (!el || !el.matches || !el.matches('input[data-allow]')) return;
            const type = el.dataset.allow;
            const pattern = ALLOW_PATTERNS[type];
            if (!pattern) return;
            const start = el.selectionStart, end = el.selectionEnd;
            let val = el.value.replace(pattern, '');
            if (type === 'alnum-upper' || type === 'batch') val = val.toUpperCase();
            if (val !== el.value) {
                const removedBeforeCaret = el.value.slice(0, start).replace(pattern, '').length;
                el.value = val;
                el.setSelectionRange(removedBeforeCaret, removedBeforeCaret);
            }
        });

        document.addEventListener('input', (e) => {
            if (e.target && e.target.matches && e.target.matches('[contenteditable="true"][data-fmt]')) {
                liveFormatField(e.target);
            }
        });
        // focusout bubbles (unlike blur), so a single delegated listener covers every field, including dynamically added rows.
        document.addEventListener('focusout', (e) => {
            if (e.target && e.target.matches && e.target.matches('[contenteditable="true"][data-fmt]')) {
                finalizeFormatField(e.target);
            }
        });

        // Enter key: single-line fields commit the value instead of indenting/adding a new line.
        // Genuinely multi-line fields (narratives, notes) get a clean line break instead of the
        // browser's default nested <div>, which otherwise causes odd indentation/spacing.
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const el = e.target.closest ? e.target.closest('[contenteditable="true"]') : null;
            if (!el) return;
            e.preventDefault();
            if (el.classList.contains('multiline-field')) {
                document.execCommand('insertLineBreak');
            } else {
                el.blur();
            }
        });

        /* ---------- Init ---------- */
        window.addEventListener('DOMContentLoaded', () => {
            // Captured BEFORE any case content (own or restored draft) is ever
            // loaded into #capture-area, so it stays a clean, empty structural
            // template forever — used to render read-only previews of OTHER
            // users' cases (Monitoring) without ever touching the real editor.
            const captureArea = document.getElementById('capture-area');
            if (captureArea) _emptyCaptureAreaTemplate = captureArea.cloneNode(true);

            refreshRepoCache();
            applyPlaceholders();
            renderAgencyLogo();
            // Shows a live preview of the next Case ID (derived from how many
            // cases are actually saved) — never reserves/consumes a number.
            generateCaseId();
            populateTimezones();
            refreshClock();
            initEditorPersistence(); // start listening for edits to autosave across refreshes
            resumeSession(); // will call restoreCurrentEditorState() once authorized
            refreshSiteState();
        });
