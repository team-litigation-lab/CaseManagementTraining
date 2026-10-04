import { json, requireSession, fileTypeIsInline } from '../_utils.js';

// Who may open an uploaded file (having its link isn't enough), as saved cases are only their owner's and Admins':
//   - Admins, and whoever uploaded it;
//   - anyone, for a file an Admin uploaded (alert pictures, Training Library attachments are for everyone);
//   - a file from before uploads recorded who sent them: whoever has a saved case it's attached to.
async function mayOpen(db, session, object, key) {
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

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    if (!env.DOCUMENTS) return json({ success: false, error: 'Document storage is not configured.' }, 503);

    const key = new URL(request.url).searchParams.get('key');
    // Only uploaded documents (upload.js), never another part of the bucket.
    if (!key || key.length > 1024 || key.includes('\0') || !key.startsWith('documents/') || key.includes('..')) {
        return json({ success: false, error: 'Invalid file key.' }, 400);
    }

    const object = await env.DOCUMENTS.get(key);
    if (!object) return json({ success: false, error: 'File not found.' }, 404);
    if (!(await mayOpen(env.DB, auth.session, object, key))) {
        return json({ success: false, error: 'This file belongs to another trainee\'s case.' }, 403);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    // Files stored before upload.js checked the type may still say text/html: those download, never open here.
    if (!fileTypeIsInline(headers.get('Content-Type'))) {
        const name = String((object.customMetadata && object.customMetadata.originalName) || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_');
        headers.set('Content-Type', 'application/octet-stream');
        headers.set('Content-Disposition', `attachment; filename="${name}"`);
    }
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(object.body, { headers });
}
