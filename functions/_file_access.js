// Who may open a file uploaded to the case storage (upload.js → R2 "documents/…"). Used by /api/file
// (opening or downloading it) and /api/drive-backup (copying it to the person's Google Drive).

// Only uploaded documents (upload.js), never another part of the bucket.
export function validFileKey(key) {
    return !!key && typeof key === 'string' && key.length <= 1024 && !key.includes('\0') && key.startsWith('documents/') && !key.includes('..');
}

// Who may open an uploaded file (having its link isn't enough), as saved cases are only their owner's and Admins':
//   - Admins, and whoever uploaded it;
//   - anyone, for a file an Admin uploaded (alert pictures, Training Library attachments are for everyone);
//   - a file from before uploads recorded who sent them: whoever has a saved case it's attached to.
export async function mayOpen(db, session, object, key) {
    if (session.userType === 'Admin') return true;
    const by = object.customMetadata && object.customMetadata.uploadedBy;
    if (by) {
        if (by === session.username) return true;
        const u = await db.prepare(`SELECT user_type FROM users WHERE username = ?`).bind(by).first();
        return !!(u && u.user_type === 'Admin');
    }
    const id = (/^documents\/([0-9a-f-]{36})/i.exec(key) || [])[1];
    if (!id) return false;
    const row = await db.prepare(`SELECT 1 AS ok FROM case_repository WHERE owner_username = ? AND content LIKE ? LIMIT 1`).bind(session.username, '%' + id + '%').first();
    return !!row;
}
