/* =========================================================================================================================
   ↩ Back to the module (the strip's top-right buttons, before 🎓 Academy Index)
   A trainee who opens the CMS from a training course gets a button back to that course. The course is known from the link
   (?from=cm, as the Case Management course sends; or ?from=ft / eapa / pd / md / ln / cs) or, failing that, from the page
   that sent them, when it is one of the course sites. It is remembered for this tab (sessionStorage), so it survives
   opening cases and reloading. With no course known (opened from LSH Academy Index or typed in), there is no button.
   ========================================================================================================================= */
(function () {
    const COURSES = {
        ft: ['Foundational', 'https://foundational-training.legalsupporthelp.workers.dev/'],
        eapa: ['EA / PA', 'https://ea-pa-training.legalsupporthelp.workers.dev/'],
        cm: ['Case Management', 'https://case-management-training.legalsupporthelp.workers.dev/'],
        pd: ['PD Claims', 'https://propertydamageclaimstraining.legalsupporthelp.workers.dev/'],
        md: ['Medsum & Demand', 'https://medsumanddemandtraining.legalsupporthelp.workers.dev/'],
        ln: ['Lien Negotiator', 'https://liennegotiatortraining.legalsupporthelp.workers.dev/'],
        cs: ['Closing Specialist', 'https://closingspecialisttraining.legalsupporthelp.workers.dev/']
    };
    const KEY = 'cmsBackToModule';
    function source() {
        try {
            const from = (new URLSearchParams(location.search).get('from') || '').toLowerCase();
            if (COURSES[from]) return { name: COURSES[from][0], url: COURSES[from][1] };
            const ref = document.referrer ? new URL(document.referrer) : null;
            if (ref && ref.host !== location.host) {
                const hit = Object.values(COURSES).find(([, u]) => new URL(u).host === ref.host);
                if (hit) return { name: hit[0], url: ref.origin + ref.pathname };   // back to the course page they left (no query: it may carry a one-time ticket)
            }
        } catch (e) { /* an odd link: no button */ }
        return null;
    }
    function draw() {
        let back = null;
        try { back = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { back = null; }
        const s = source();
        if (s) { back = s; try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* not remembered */ } }
        const home = document.getElementById('portal-home-btn');
        if (!back || !home || document.getElementById('module-back-btn')) return;
        const a = document.createElement('a');
        a.id = 'module-back-btn'; a.className = 'cls-btn'; a.href = back.url;
        a.title = 'Back to the ' + back.name + ' training, where you came from';
        a.innerHTML = '↩ <span class="lbl"></span>'; a.querySelector('.lbl').textContent = 'Back to ' + back.name;
        home.parentNode.insertBefore(a, home);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', draw); else draw();
    window.lshModuleBack = { source };
})();
