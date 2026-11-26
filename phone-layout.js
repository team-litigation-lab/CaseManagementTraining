/* =========================================================
   LSH CMS — PHONES
   ---------------------------------------------------------
   On a phone (760 px wide or less) the sidebar would take most of the
   screen and squeeze the case into a sliver, so it becomes a drawer:
   ☰ at the left of the strip over the case opens it over the page, and
   tapping a button in it, the shade beside it, ✕ or Esc closes it again.
   The layout rules are in styles.css ("phones"). Wider screens are not
   touched: the button and the shade are hidden there.

   Also on a phone: a table wider than the screen scrolls sideways inside
   its own box (.ph-scroll) instead of running off the edge of a window.
   Only tables that overflow and have no scrolling box around them already
   are wrapped; tables drawn later (Master Control, the libraries, the
   dashboards) are caught as they appear.
   ========================================================= */
(function () {
    'use strict';
    const NARROW = window.matchMedia('(max-width: 760px)');

    /* ---------- the sidebar drawer ---------- */
    function setOpen(open) {
        document.body.classList.toggle('sb-drawer-open', !!open);
        const btn = document.getElementById('sb-drawer-btn');
        if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    function buildDrawer() {
        const bar = document.getElementById('classification-bar'), sb = document.getElementById('sidebar');
        if (!bar || !sb || document.getElementById('sb-drawer-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'sb-drawer-btn'; btn.type = 'button'; btn.className = 'cls-btn';
        btn.title = 'Menu'; btn.setAttribute('aria-label', 'Open the menu');
        btn.setAttribute('aria-controls', 'sidebar'); btn.setAttribute('aria-expanded', 'false');
        btn.textContent = '☰';
        btn.addEventListener('click', () => setOpen(!document.body.classList.contains('sb-drawer-open')));
        bar.insertBefore(btn, bar.firstChild);

        const shade = document.createElement('div');
        shade.id = 'sb-drawer-shade';
        shade.addEventListener('click', () => setOpen(false));
        document.body.appendChild(shade);

        const x = document.createElement('button');
        x.id = 'sb-drawer-x'; x.type = 'button'; x.textContent = '✕';
        x.title = 'Close the menu'; x.setAttribute('aria-label', 'Close the menu');
        x.addEventListener('click', () => setOpen(false));
        sb.insertBefore(x, sb.firstChild);

        // A button or link in the drawer opens a window or a case: get out of its way.
        // (A select, a search box or the program picker keeps the drawer open.)
        sb.addEventListener('click', (e) => {
            if (!NARROW.matches) return;
            const t = e.target.closest('button, a');
            if (t && t !== x) setTimeout(() => setOpen(false), 0);
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('sb-drawer-open')) setOpen(false); });
        const off = () => { if (!NARROW.matches) setOpen(false); };
        if (NARROW.addEventListener) NARROW.addEventListener('change', off); else NARROW.addListener(off);
    }

    /* ---------- wide tables scroll in their own box ---------- */
    function scrolls(el) {
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
            const o = getComputedStyle(a).overflowX;
            if (o === 'auto' || o === 'scroll') return true;
        }
        return false;
    }
    function fitTables() {
        if (!NARROW.matches) return;
        document.querySelectorAll('table:not([data-ph-fit])').forEach((t) => {
            const p = t.parentElement;
            if (!p || !t.offsetWidth || t.closest('#capture-area')) return;   // hidden for now; the case has case-fit.js
            t.setAttribute('data-ph-fit', '');
            if (t.offsetWidth <= p.clientWidth + 1 || scrolls(t)) return;
            const box = document.createElement('div');
            box.className = 'ph-scroll';
            p.insertBefore(box, t); box.appendChild(t);
        });
    }
    let queued = false;
    const soon = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; fitTables(); }); } };

    function start() {
        buildDrawer();
        fitTables();
        new MutationObserver(soon).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
        window.addEventListener('resize', soon);
    }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
