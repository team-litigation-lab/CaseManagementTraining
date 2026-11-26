/* The standard LSH footer, the same on every LSH site (the Training Portal's theme.css .lsh-footer and every
   course's js/lsh-footer.js): "© <year> Legal Support Help. All Rights Reserved." on a solid navy bar with the
   orange line along its top, large and light enough to read at a glance. The page is one full-height column
   (body is a flex column and #app-shell takes the rest), so the footer is its last row and nothing moves.
   Left out when the CMS is framed beside a lesson in a course: the course's own page has the footer. */
(function () {
    let framed = false;
    try { framed = window.self !== window.top; } catch (e) { framed = true; }
    if (framed) return;
    const st = document.createElement('style'); st.id = 'lsh-footer-style';
    st.textContent = `.lsh-footer{position:relative;z-index:5;flex-shrink:0;width:100%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;
        padding:10px 20px;background:#081226;border-top:3px solid #f97316;color:#f1f5f9;text-align:center;
        font:600 14.5px/1.4 'IBM Plex Sans',Arial,Helvetica,sans-serif;letter-spacing:.02em;}
    @media (max-width:560px){.lsh-footer{font-size:13px;padding:9px 14px;}}
    @media print{.lsh-footer{display:none;}}`;
    document.head.appendChild(st);
    function add() {
        if (document.querySelector('.lsh-footer')) return;
        const f = document.createElement('footer'); f.className = 'lsh-footer no-print'; f.setAttribute('role', 'contentinfo');
        f.textContent = '© ' + new Date().getFullYear() + ' Legal Support Help. All Rights Reserved.';
        document.body.appendChild(f);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
