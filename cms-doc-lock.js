/* 🔒 A filed document is part of the case record — the Doc Hub row that holds it is locked.
   Filing a document into a case is a record of what the firm did, not a draft. Once a row carries an
   uploaded file, the row freezes: the file cannot be detached or replaced, the row cannot be deleted, and
   its summary cannot be retyped. The trainee can still open and download what is filed — reading a filed
   document is not an edit.

   Four doors were open on a filed row, all of them in app.js's Doc Hub markup:
     • the × beside the attachment (onclick="this.parentElement.innerHTML=''") wiped the filed file
     • the row's own × (this.parentElement.parentElement.remove()) deleted the row and the file with it
     • the Upload input stayed live, so a second file silently replaced the filed one
     • the summary stayed contenteditable
   Each is closed here rather than in app.js, so the Doc Hub's markup stays in one place and the lock is
   one file to read. Rows with no attachment are untouched: filing is still free until it has happened.

   Applied to #doc-body and #lit-body, and re-applied whenever either changes — a case loaded from the
   server replaces their innerHTML (applyCaseContentToDOM in app.js), and an upload fills in the
   attachment afterwards (handleDocUpload). The <a> itself is never removed, so the course's filing relay
   (course-bridge.js, which reads the link back after it uploads) still sees what it filed. */
(function () {
    "use strict";

    const LOCKED = "doc-row-locked";
    const filedLink = (row) => row.querySelector('.doc-attachment a[data-r2-key], .doc-attachment a[data-doc-link]');

    function lockRow(row) {
        if (row.classList.contains(LOCKED)) return;
        const link = filedLink(row);
        if (!link) return;
        row.classList.add(LOCKED);

        // the × beside the attachment, and anything else in the holder that is not the link itself
        const holder = link.parentElement;
        if (holder) holder.querySelectorAll("button").forEach(b => b.remove());

        // the row's own delete ×: the last cell's button
        row.querySelectorAll("button").forEach(b => {
            const oc = (b.getAttribute("onclick") || "");
            if (/\.remove\(\)/.test(oc) || /innerHTML\s*=\s*''/.test(oc)) b.remove();
            else if (b.classList.contains("doc-link-btn")) b.remove();        // 🔗 Link: no second attachment either
        });

        // the Upload control: a filed row takes no further file
        row.querySelectorAll('input[type="file"]').forEach(i => { i.disabled = true; i.remove(); });
        row.querySelectorAll("label.hub-btn").forEach(l => { if (/upload/i.test(l.textContent)) l.remove(); });
        row.querySelectorAll("div").forEach(d => { if (/^Max\s/i.test(d.textContent.trim())) d.remove(); });

        /* The summary: what was filed was filed with it. It keeps contenteditable="true" — the case is saved
           and restored BY POSITION in the page's [contenteditable="true"] list (posEdits in app.js), so
           flipping one to "false" would shift every later field's index and a reloaded case would restore
           its values into the wrong fields. The editing is blocked by event instead: beforeinput covers
           typing and deleting, and the clipboard and drop handlers cover the rest. */
        row.querySelectorAll('[contenteditable="true"]').forEach(el => {
            if (el.dataset.docLocked === "1") return;
            el.dataset.docLocked = "1";
            el.classList.add("doc-summary-locked");
            el.title = "Filed in the case record — this summary is part of what was filed.";
            const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
            ["beforeinput", "paste", "cut", "drop", "dragover"].forEach(t => el.addEventListener(t, stop));
        });

        if (holder && !holder.querySelector(".doc-filed-note")) {
            const note = document.createElement("span");
            note.className = "doc-filed-note no-print";
            note.title = "A filed document is part of the case record. It cannot be replaced or removed from here.";
            note.textContent = " 🔒 filed";
            holder.appendChild(note);
        }
    }

    const sweep = (root) => {
        (root || document).querySelectorAll("#doc-body tr, #lit-body tr").forEach(lockRow);
    };
    window.cmsDocLock = { sweep, lockRow, isLocked: (row) => !!row && row.classList.contains(LOCKED) };

    function watch() {
        const bodies = ["doc-body", "lit-body"].map(id => document.getElementById(id)).filter(Boolean);
        if (!bodies.length) return false;
        // a case loaded, a row added, an upload finished: lock whatever is filed now
        const obs = new MutationObserver(() => sweep());
        bodies.forEach(b => obs.observe(b, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-r2-key", "href"] }));
        sweep();
        return true;
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch, { once: true });
    else if (!watch()) document.addEventListener("DOMContentLoaded", watch, { once: true });
})();
