/* =========================================================
   LSH CMS — THE CASE FITS THE WINDOW
   ---------------------------------------------------------
   The case editor is laid out for a wide window (the case itself needs
   about 1,030 px). When the browser window is narrower, or the Reception
   Simulator panel takes the right side (front-desk-drill.js sets
   body.fdd-open), the case is shown smaller so all of it is in view,
   never below 70% (past that it scrolls sideways). While that panel is
   open on a screen 1,100 px or wider, the case moves over beside it, and
   when there isn't room the sidebar steps aside for the call
   (body.fdd-nosb). In a window under 1,100 px (a browser beside a
   Google Meet, say) the sidebar is narrower, to leave the case more room.

   The fit is done again when the browser window is resized, when the
   panel opens, hides or closes (lshFitCase()), when a case is opened or
   closed, and for a few seconds after each of those if the case grows
   (a case that is still filling in), never while a mouse button is
   down or something is being dragged. Only #capture-area is scaled:
   the sidebar, the top bars, the windows and the case's action bar keep
   their size.
   ========================================================= */
(function () {
    'use strict';
    const MIN = 0.7;
    const css = document.createElement('style');
    css.textContent = `
    #capture-area{padding-right:2rem}
    body.case-fit #capture-area{zoom:var(--case-zoom,1)}
    @media (max-width:1100px){#sidebar{width:220px}#sidebar-system-name{letter-spacing:.5px;font-size:11px}}
    @media (min-width:1100px){body.fdd-open #app-shell > main{margin-right:min(500px,100vw)}body.fdd-open.fdd-nosb #sidebar{display:none}}
    `;
    document.head.appendChild(css);

    // Wider than its box? (The case's ✕ sits just outside the card's corner, inside the case's padding, so it
    // doesn't count: the padding is set below as well as by the page's styles.)
    const over = (ca) => ca.scrollWidth > ca.clientWidth + 1;
    let watch = null, watchUntil = 0, pressed = false;
    // Never change the case's size under someone's mouse: not while a button is down or a drag is on.
    ['pointerdown', 'dragstart'].forEach(t => document.addEventListener(t, () => { pressed = true; }, true));
    ['pointerup', 'pointercancel', 'dragend', 'drop'].forEach(t => document.addEventListener(t, () => { pressed = false; }, true));
    window.addEventListener('blur', () => { pressed = false; });
    // more: the case grew; shrink it a little more from where it is, without starting over.
    function fit(more) {
        const b = document.body, ca = document.getElementById('capture-area');
        clearInterval(watch); watch = null;
        if (!more) watchUntil = Date.now() + 5000;
        if (!b || !ca) return;
        if (!more) { b.classList.remove('fdd-nosb', 'case-fit'); b.style.removeProperty('--case-zoom'); }
        if (!ca.offsetParent) return;   // no case on screen (signed out, a full-screen view)
        if (b.classList.contains('fdd-open') && window.innerWidth >= 1100 && over(ca)) b.classList.add('fdd-nosb');
        if (over(ca)) {
            // the case widens a little with the room it gets, so step down until it fits
            let z = b.classList.contains('case-fit') ? Number(b.style.getPropertyValue('--case-zoom') || 1) - 0.02
                : Math.min(0.99, Math.floor(ca.clientWidth / ca.scrollWidth * 100) / 100);
            b.classList.add('case-fit');
            for (let i = 0; i < 12; i++) {
                z = Math.max(MIN, Math.round(z * 100) / 100);
                b.style.setProperty('--case-zoom', String(z));
                if (z === MIN || !over(ca)) break;
                z -= 0.02;
            }
        }
        // the case may still be filling in: look again every second for a few seconds
        watch = setInterval(() => {
            if (Date.now() > watchUntil) { clearInterval(watch); watch = null; return; }
            if (!pressed && !document.hidden && Number(b.style.getPropertyValue('--case-zoom') || 1) > MIN && over(ca)) fit(true);
        }, 1000);
    }
    window.lshFitCase = () => fit(false);

    let timer = null;
    window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(() => fit(false), 120); });
    // A case opened or closed can be a different width: fit again just after.
    const after = (name) => {
        const f = window[name]; if (typeof f !== 'function' || f.__fits) return;
        const w = function () { const r = f.apply(this, arguments); setTimeout(() => fit(false), 60); return r; };
        w.__fits = true; window[name] = w;
    };
    const start = () => { ['openMockCase', 'closeCase'].forEach(after); fit(false); };
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
