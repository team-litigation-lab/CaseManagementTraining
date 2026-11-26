/* The standard LSH footer line, the same on every LSH site (the Training Portal's theme.css .lsh-footer and every
   course's js/lsh-footer.js): "© <year> Legal Support Help. All Rights Reserved.", large and easy to read.
   In the CMS it sits in the middle of the case's action bar (#case-actions-bar), between ✕ Close · 🗄 Archive ·
   🗑 Discard Case and 💾 Save Case · ⟳ Update Case, so the action bar stays the last thing on the screen and
   nothing moves. A page without that bar gets it as its own navy footer row instead.
   Left out when the CMS is framed beside a lesson in a course: the course's own page has the footer. */
(function () {
    let framed = false;
    try { framed = window.self !== window.top; } catch (e) { framed = true; }
    if (framed) return;
    const text = '© ' + new Date().getFullYear() + ' Legal Support Help. All Rights Reserved.';
    const st = document.createElement('style'); st.id = 'lsh-footer-style';
    st.textContent = `#case-actions-bar .cab-copy{flex:2 1 auto;min-width:0;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        font:700 14px/1.3 'IBM Plex Sans',Arial,Helvetica,sans-serif;letter-spacing:.02em;color:#0f2148;}
    #case-actions-bar .cab-copy + .cab-note{flex:0 1 auto;max-width:22%;}
    @media (max-width:700px){#case-actions-bar .cab-copy{order:11;flex-basis:100%;white-space:normal;font-size:12.5px;}}
    .lsh-footer{position:relative;z-index:5;flex-shrink:0;width:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;
        padding:10px 20px;background:#081226;border-top:3px solid #f97316;color:#f1f5f9;text-align:center;
        font:600 14.5px/1.4 'IBM Plex Sans',Arial,Helvetica,sans-serif;letter-spacing:.02em;}
    @media print{.lsh-footer{display:none;}}`;
    document.head.appendChild(st);
    function add() {
        if (document.querySelector('.cab-copy, .lsh-footer')) return;
        const bar = document.getElementById('case-actions-bar');
        if (bar) {
            const s = document.createElement('span'); s.className = 'cab-copy'; s.setAttribute('role', 'contentinfo'); s.textContent = text;
            const note = document.getElementById('autosave-indicator');
            bar.insertBefore(s, note && note.parentNode === bar ? note : null);
            return;
        }
        const f = document.createElement('footer'); f.className = 'lsh-footer no-print'; f.setAttribute('role', 'contentinfo'); f.textContent = text;
        document.body.appendChild(f);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
