/* 🧹 Clean up Master Control's Trainees Online list (the trainer: "allow clean up here as well").
   Each person's card gets a ✕ that takes them off the list, and 🧹 Clean up beside the search clears everyone not seen for
   7 days or more (anyone online now is never touched). Only the list's "last seen" rows go (DELETE /api/heartbeat):
   accounts, saved cases and logs are untouched, and anyone who signs in again is back on the list.
   app.js redraws the list (renderMonitoringOnline), so the ✕ is put back on every redraw. */
(function () {
    'use strict';
    const DAYS = 7;
    const $ = (id) => document.getElementById(id);
    const toast = (m, t) => { if (typeof window.showToast === 'function') window.showToast(m, t || 'success'); };
    const refresh = () => { if (typeof window.refreshMonitoring === 'function') window.refreshMonitoring(); };
    async function call(body) {
        const r = await fetch('/api/heartbeat', { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.success) throw new Error(d.error || ('HTTP ' + r.status));
        return d;
    }

    async function removeOne(row) {
        const user = row.dataset.username, name = (row.querySelector('.reg-info b') || {}).textContent || user;
        if (row.dataset.online === '1') { toast(name.trim() + ' is online now; they can be removed once they are not.', 'error'); return; }
        if (!confirm('Remove ' + name.trim() + ' from this list?\n\nOnly the list entry goes: their account and saved cases stay, and they are back on the list when they sign in again.')) return;
        try { await call({ usernames: [user] }); toast('Removed ' + name.trim() + ' from the list.'); refresh(); }
        catch (e) { toast('Couldn’t remove them: ' + e.message, 'error'); }
    }

    async function cleanStale() {
        try {
            const { count } = await call({ olderThanDays: DAYS, preview: true });
            if (!count) { toast('Nobody on the list has been away ' + DAYS + ' days or more.'); return; }
            if (!confirm('Clean up the list: remove the ' + count + (count === 1 ? ' person' : ' people') + ' not seen for ' + DAYS + ' days or more?\n\nOnly the list entries go: accounts and saved cases stay, and anyone who signs in again is back on the list.')) return;
            const { removed } = await call({ olderThanDays: DAYS });
            toast('Removed ' + removed + ' from the list.'); refresh();
        } catch (e) { toast('Couldn’t clean up the list: ' + e.message, 'error'); }
    }

    function decorate() {
        const chips = $('monitoring-chips');
        if (chips && !$('mon-clean')) {
            const b = document.createElement('button');
            b.type = 'button'; b.id = 'mon-clean'; b.className = 'mon-clean';
            b.textContent = '\u{1F9F9} Clean up'; b.title = 'Remove everyone not seen for ' + DAYS + ' days or more from this list';
            b.addEventListener('click', (e) => { e.stopPropagation(); cleanStale(); });
            chips.appendChild(b);
        }
        document.querySelectorAll('#monitoring-online-list .reg-row').forEach(row => {
            if (row.querySelector('.mon-x')) return;
            const box = row.lastElementChild; if (!box) return;
            const x = document.createElement('button');
            x.type = 'button'; x.className = 'mon-x'; x.textContent = '✕';
            x.title = 'Remove from this list'; x.setAttribute('aria-label', 'Remove ' + ((row.querySelector('.reg-info b') || {}).textContent || '').trim() + ' from this list');
            if (row.dataset.online === '1') { x.disabled = true; x.title = 'Online now'; }
            x.addEventListener('click', (e) => { e.stopPropagation(); removeOne(row); });
            box.appendChild(x);
        });
    }

    function watch() {
        const list = $('monitoring-online-list');
        if (!list || list.__clean) return;
        list.__clean = true;
        new MutationObserver(decorate).observe(list, { childList: true });
        decorate();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();

    const st = document.createElement('style');
    st.textContent = '.mon-chips .mon-clean{margin-left:auto;border:0;cursor:pointer;font:inherit;font-weight:800;font-size:12.5px;padding:7px 14px;border-radius:999px;'
        + 'background:linear-gradient(180deg,#fde7b0 0%,#f5c451 50%,#e0a43a 100%);color:#1E2340}'
        + '.mon-chips .mon-clean:hover{filter:brightness(1.05)}'
        + '.mon-card .mon-x{border:1px solid #e2e8f0;background:#fff;color:#64748b;border-radius:999px;width:26px;height:26px;line-height:1;font-size:12px;cursor:pointer;flex:none}'
        + '.mon-card .mon-x:hover:not(:disabled){border-color:#ef4444;color:#ef4444;background:#fef2f2}'
        + '.mon-card .mon-x:disabled{opacity:.35;cursor:default}';
    document.head.appendChild(st);
})();
