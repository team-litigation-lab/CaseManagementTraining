/* ☁ Google Drive backup (the Doc Hub tab).

   Connect your own Google account (a Gmail address works) once, then "Back up this case's files" copies the
   open case's uploaded files into your Drive:
       LSH CMS Backups / <Case ID> <Client>
   The files: the Doc Hub attachments, the demand letters and the client's ID, under the names the case shows
   (the firm's naming: caseFileName in app.js). Backing up again only sends what's new.

   The server side is /api/drive-backup (functions/api/drive-backup.js, functions/_google_drive.js). The app
   asks Google only for drive.file: it can see the folders and files it made, nothing else in the Drive.
   It needs Google sign-in set up for the site (README → Doc Hub → Google Drive backup); until then the bar
   says so. The status is asked for the first time the Doc Hub tab is opened, not on every page load.

   The bar sits in the case editor but isn't part of the case: it's data-free-edit (its redraws aren't
   edits, and it works on a view-only case) and no-print. */
(function () {
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t, d) => { if (typeof showToast === 'function') showToast(m, t || 'info', d); };
    const signedIn = () => typeof getSession === 'function' && !!getSession();
    const API = '/api/drive-backup', BATCH = 5;
    const GLOGO = '<svg width="14" height="14" viewBox="0 0 87.3 78" aria-hidden="true" style="vertical-align:-2px;margin-right:5px"><path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"/><path fill="#00ac47" d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z"/><path fill="#ea4335" d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"/><path fill="#00832d" d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"/><path fill="#2684fc" d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"/><path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"/></svg>';

    let D = null;            // the connection, from GET /api/drive-backup
    let asked = false, loading = false, busy = false, connecting = false, progress = '', lastFolder = '', error = '';
    let gisLoading = false, gisFailed = false;

    const css = document.createElement('style');
    css.textContent = `
    #drive-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px;padding:9px 12px;border:1px solid #dbeafe;background:#f8fbff;border-radius:10px;font-size:12px;color:#334155}
    #drive-bar .db-t{font-weight:800;color:#0f2148;white-space:nowrap}
    #drive-bar .db-s{flex:1;min-width:180px;color:#475569}
    #drive-bar .db-s b{color:#0f2148}
    #drive-bar button,#drive-bar a.db-btn{border:1px solid #cbd5e1;background:#fff;color:#0f2148;border-radius:7px;padding:6px 11px;font-size:11px;font-weight:800;cursor:pointer;text-decoration:none;white-space:nowrap}
    #drive-bar button.db-go{background:#2563eb;border-color:#2563eb;color:#fff}
    #drive-bar button:disabled{opacity:.6;cursor:default}
    #drive-bar button:hover:not(:disabled),#drive-bar a.db-btn:hover{border-color:#f97316}
    #drive-bar .db-err{color:#b91c1c;flex-basis:100%}`;
    document.head.appendChild(css);

    function bar() {
        let b = $id('drive-bar');
        if (b) return b;
        const card = document.querySelector('#pane-docs .pdf-card'), head = card && card.querySelector('.section-head');
        if (!head) return null;
        head.insertAdjacentHTML('afterend', '<div id="drive-bar" class="no-print" data-free-edit role="region" aria-label="Google Drive backup"></div>');
        return $id('drive-bar');
    }

    /* ---------- the open case's files ---------- */
    function clientIdFile() {
        const f = document.querySelector('#kx-client-id [data-k="file"]'), t = f ? f.textContent.trim() : '';
        if (!t) return null;
        try { const o = JSON.parse(t); return o && typeof o.key === 'string' && o.key ? o : null; } catch (e) { return null; }
    }
    function caseFiles() {
        const out = [], seen = new Set();
        const add = (key, name) => { if (!key || seen.has(key) || !/^documents\//.test(key)) return; seen.add(key); out.push({ key, name: String(name || '').trim() || key.split('/').pop() }); };
        document.querySelectorAll('#doc-body .doc-attachment a[data-r2-key], #kx-demand a.kx-dl-link[data-r2-key]')
            .forEach(a => add(a.getAttribute('data-r2-key'), a.getAttribute('download') || a.textContent.replace(/^\S+\s+/, '')));
        const id = clientIdFile(); if (id) add(id.key, id.name || 'Client-ID.jpg');
        return out;
    }
    // files kept inside the case from before uploads went to storage (data: links): these can't be copied
    const oldInline = () => document.querySelectorAll('#doc-body .doc-attachment a[href^="data:"]').length;
    function caseIdentity() {
        const txt = (id) => { const el = $id(id); return el ? el.innerText.replace(/\s+/g, ' ').trim() : ''; };
        const id = txt('case-id-field'), client = txt('client-name-field');
        const realId = /\d/.test(id) && /^[A-Za-z0-9-]+$/.test(id) ? id : '';   // (not "LSH-----" or "Assigned on Save Case")
        const saved = typeof currentCaseId !== 'undefined' && currentCaseId != null ? currentCaseId : null;
        const key = realId || (saved != null ? `saved-${saved}` : client ? `unsaved-${client.toLowerCase()}` : '');
        return { key, name: [realId || 'No Case ID', client || 'No client name'].join(' ') };
    }

    /* ---------- server ---------- */
    async function api(body) {
        const opts = body ? { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { credentials: 'include' };
        let res, data = {};
        try { res = await fetch(API, opts); } catch (e) { throw new Error('Network error. Check your connection and try again.'); }
        try { data = await res.json(); } catch (e) { data = {}; }
        if (!res.ok || data.success === false) {
            const err = new Error(data.error || `Google Drive request failed (${res.status}).`);
            err.code = data.code;
            if (D && (err.code === 'DRIVE_RECONNECT' || err.code === 'DRIVE_NOT_CONNECTED')) D = Object.assign({}, D, { connected: false, email: '' });
            throw err;
        }
        return data;
    }
    async function load() {
        if (!signedIn() || loading) return;
        loading = true; error = ''; paint();
        try { D = (await api()).drive; } catch (e) { error = e.message; }
        loading = false; paint();
    }

    /* ---------- the bar ---------- */
    function paint() {
        const b = bar(); if (!b) return;
        if (!signedIn()) { b.innerHTML = ''; return; }
        let body;
        if (!D) body = `<span class="db-s">${loading ? 'Checking the Google Drive connection…' : 'Google Drive backup.'}</span>`;
        else if (!D.configured) body = `<span class="db-s">Backing up to Google Drive isn't switched on for this site yet (an admin sets it up: README → Doc Hub → Google Drive backup).</span>`;
        else if (!D.connected) {
            preloadGis();
            body = `<span class="db-s">Connect your Google account (Gmail) to back up this case's files to your own Google Drive. The app can only see the folders it makes there.</span>
                <button type="button" class="db-go" data-db="connect" onclick="driveConnect()" ${connecting ? 'disabled' : ''}>${connecting ? 'Connecting…' : 'Connect Google Drive'}</button>`;
        } else {
            const n = caseFiles().length, old = oldInline(), id = caseIdentity();
            const what = !id.key ? 'Open a case (or give it a client name) to back up its files.'
                : n ? `<b>${n} file${n === 1 ? '' : 's'}</b> on this case (Doc Hub, demand letters, the client's ID) → <b>LSH CMS Backups / ${esc(id.name)}</b>.`
                : 'No uploaded files on this case yet.';
            body = `<span class="db-s">${what}${old ? ` ${old} older file${old === 1 ? ' is' : 's are'} kept inside the case and can't be copied: upload ${old === 1 ? 'it' : 'them'} again to back ${old === 1 ? 'it' : 'them'} up.` : ''}<br>
                    <span style="color:#64748b">Signed in as ${esc(D.email || 'your Google account')}${D.lastBackupAt ? ` · last backup ${esc(new Date(D.lastBackupAt.replace(' ', 'T') + 'Z').toLocaleString())}` : ''}${progress ? ` · ${esc(progress)}` : ''}</span></span>
                <button type="button" class="db-go" data-db="backup" onclick="driveBackupNow()" ${busy || !n || !id.key ? 'disabled' : ''}>${busy ? 'Backing up…' : "☁ Back up this case's files"}</button>
                ${lastFolder || D.rootUrl ? `<a class="db-btn" data-db="open" href="${esc(lastFolder || D.rootUrl)}" target="_blank" rel="noopener noreferrer">Open in Drive ↗</a>` : ''}
                <button type="button" data-db="disconnect" onclick="driveDisconnect()" ${busy ? 'disabled' : ''}>Disconnect</button>`;
        }
        b.innerHTML = `<span class="db-t">${GLOGO}Google Drive backup</span>${body}${error ? `<span class="db-err">${esc(error)}</span>` : ''}`;
    }

    /* ---------- Google sign-in (the same popup as the Firm Calendar's Google Calendar) ---------- */
    function preloadGis() {
        if (gisLoading || gisFailed || (window.google && google.accounts && google.accounts.oauth2)) return;
        gisLoading = true;
        const sc = document.createElement('script');
        sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
        sc.onload = () => { gisLoading = false; };
        sc.onerror = () => { gisLoading = false; gisFailed = true; error = 'Google sign-in couldn\'t load. Check that accounts.google.com isn\'t blocked, then try again.'; paint(); };
        document.head.appendChild(sc);
    }
    window.driveConnect = function () {
        const oauth = window.google && google.accounts && google.accounts.oauth2;
        if (!D || !D.configured) return;
        if (!oauth) { preloadGis(); toast(gisFailed ? 'Google sign-in couldn\'t load.' : 'Google sign-in is still loading. Click Connect again in a moment.', gisFailed ? 'error' : 'info'); return; }
        // popup code flow: the one-time code comes back here and goes to the server under this person's own session
        oauth.initCodeClient({
            client_id: D.clientId, scope: D.scopes, ux_mode: 'popup', select_account: true,
            callback: async (resp) => {
                if (!resp || resp.error || !resp.code) { toast(resp && resp.error === 'access_denied' ? 'Google access wasn\'t allowed.' : 'Google sign-in didn\'t finish.', 'error'); return; }
                connecting = true; error = ''; paint();
                try { D = (await api({ action: 'connect', code: resp.code })).drive; toast(`Google Drive connected (${D.email || 'your Google account'}).`, 'success'); }
                catch (e) { error = e.message; toast(e.message, 'error', 6000); }
                connecting = false; paint();
            },
            error_callback: (err) => {
                const t = err && err.type;
                toast(t === 'popup_closed' ? 'Google sign-in was closed before it finished.'
                    : t === 'popup_failed_to_open' ? 'The browser blocked the Google sign-in window. Allow pop-ups for this site and try again.' : 'Google sign-in failed.', 'error');
            }
        }).requestCode();
    };
    window.driveDisconnect = async function () {
        if (!D || !D.connected || busy) return;
        if (!confirm('Disconnect Google Drive? The copies already in your Drive stay there.')) return;
        try { D = (await api({ action: 'disconnect' })).drive; lastFolder = ''; error = ''; toast('Google Drive disconnected.', 'info'); }
        catch (e) { error = e.message; }
        paint();
    };
    window.driveBackupNow = async function () {
        if (!D || !D.connected || busy) return;
        const id = caseIdentity(), files = caseFiles();
        if (!id.key || !files.length) { paint(); return; }
        busy = true; error = ''; progress = ''; paint();
        let copied = 0, skipped = 0;
        const failed = [];
        try {
            for (let i = 0; i < files.length; i += BATCH) {
                progress = `${Math.min(i + BATCH, files.length)} of ${files.length}…`; paint();
                const r = await api({ action: 'backup', caseKey: id.key, caseName: id.name, files: files.slice(i, i + BATCH) });
                (r.results || []).forEach(x => { if (!x.ok) failed.push(x); else if (x.skipped) skipped++; else copied++; });
                if (r.folderUrl) lastFolder = r.folderUrl;
                if (r.drive) D = r.drive;
            }
            const parts = [copied ? `${copied} file${copied === 1 ? '' : 's'} copied` : '', skipped ? `${skipped} already backed up` : '', failed.length ? `${failed.length} not copied` : ''].filter(Boolean);
            toast(`Google Drive backup: ${parts.join(', ') || 'nothing to copy'}.`, failed.length ? 'error' : 'success', 6000);
            if (failed.length) error = failed.map(f => `${(files.find(x => x.key === f.key) || {}).name || f.key}: ${f.error}`).slice(0, 3).join(' · ');
        } catch (e) { error = e.message; toast(e.message, 'error', 6000); }
        busy = false; progress = ''; paint();
    };

    // The status is asked for once, when the Doc Hub tab is first opened; the bar redraws whenever it's opened.
    function onDocs() { if (!signedIn()) return; watchFiles(); paint(); if (!asked) { asked = true; load(); } }
    const baseShow = window.showTab;
    if (typeof baseShow === 'function') {
        window.showTab = function (id) { const r = baseShow.apply(this, arguments); if (id === 'docs') onDocs(); return r; };
    }
    // a file added or removed on the case (an upload finishing, a row removed, a case opened): the count follows
    let watched = false, later = 0;
    function watchFiles() {
        if (watched || typeof MutationObserver !== 'function') return;
        const boxes = ['doc-body', 'kx-demand', 'kx-client-id'].map(id => $id(id)).filter(Boolean);
        if (!boxes.length) return;
        watched = true;
        const mo = new MutationObserver(() => { if (!$id('drive-bar') || !D || !D.connected) return; clearTimeout(later); later = setTimeout(paint, 150); });
        boxes.forEach(el => mo.observe(el, { childList: true, subtree: true, characterData: true }));
    }
    // someone else signs in: their own connection
    const baseApply = window.applySessionUI;
    if (typeof baseApply === 'function') {
        window.applySessionUI = function () {
            const r = baseApply.apply(this, arguments);
            D = null; asked = false; lastFolder = ''; error = ''; progress = '';
            const p = $id('pane-docs'); if (p && p.style.display === 'block' && signedIn()) onDocs(); else paint();
            return r;
        };
    }
    window.lshDriveBackup = { files: caseFiles, identity: caseIdentity, state: () => D, refresh: load };
})();
