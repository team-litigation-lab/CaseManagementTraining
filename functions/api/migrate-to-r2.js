import { json, requireSession } from '../_utils.js';

const DATA_URL_RE = /data:([^;,]+)?(;base64)?,([A-Za-z0-9+/=\s%_-]+)/i;
const HREF_RE = /href=(['"])(data:[^'"<>]+)\1/gi;

function decodeDataUrl(value) {
    const match = DATA_URL_RE.exec(value);
    if (!match) return null;
    const mime = match[1] || 'application/octet-stream';
    const encoded = match[3];
    if (match[2]) {
        const binary = atob(encoded.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return { mime, bytes };
    }
    return { mime, bytes: new TextEncoder().encode(decodeURIComponent(encoded)) };
}

function filenameFromHtml(html, endIndex) {
    const tail = html.slice(endIndex, endIndex + 300);
    const match = /download=(['"])([^'"]+)\1/i.exec(tail);
    return (match && match[2] ? match[2] : 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function migrateContent(content, env, username, cache) {
    let changed = false;
    const html = JSON.stringify(content);
    const replaced = html.replace(HREF_RE, (whole, quote, dataUrl, offset) => {
        const decoded = decodeDataUrl(dataUrl);
        if (!decoded) return whole;
        changed = true;
        const existing = cache.get(dataUrl);
        if (existing) return `href=${quote}/api/file?key=${encodeURIComponent(existing)}${quote}`;
        // The replacement is finalized asynchronously below; use a marker that
        // cannot occur in normal HTML and resolve it after the scan.
        const marker = `__R2_MIGRATION_${cache.size}__`;
        cache.set(marker, { dataUrl, decoded, username, filename: filenameFromHtml(html, offset + whole.length) });
        return `href=${quote}${marker}${quote}`;
    });

    if (!changed) return { content, changed: false };
    for (const [marker, item] of [...cache.entries()]) {
        if (!marker.startsWith('__R2_MIGRATION_')) continue;
        const existingKey = cache.get(item.dataUrl);
        if (typeof existingKey === 'string') continue;
        const key = `documents/${crypto.randomUUID()}-${item.filename || 'attachment'}`;
        await env.DOCUMENTS.put(key, item.decoded.bytes, {
            httpMetadata: { contentType: item.decoded.mime, contentDisposition: `inline; filename="${item.filename}"` },
            customMetadata: { uploadedBy: username, originalName: item.filename, migrated: 'true' }
        });
        cache.set(item.dataUrl, key);
        cache.set(marker, key);
    }
    let finalHtml = replaced;
    for (const [marker, value] of cache) {
        if (marker.startsWith('__R2_MIGRATION_') && typeof value === 'string') finalHtml = finalHtml.replaceAll(marker, `/api/file?key=${encodeURIComponent(value)}`);
    }
    return { content: JSON.parse(finalHtml), changed: true };
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    if (!env.DOCUMENTS) return json({ success: false, error: 'Document storage is not configured.' }, 503);

    const cache = new Map();
    let casesMigrated = 0;
    let versionsMigrated = 0;
    const cases = await env.DB.prepare('SELECT id, content FROM case_repository').all();
    for (const row of cases.results || []) {
        let content;
        try { content = JSON.parse(row.content); } catch (e) { continue; }
        const result = await migrateContent(content, env, auth.session.username, cache);
        if (result.changed) {
            await env.DB.prepare('UPDATE case_repository SET content = ?, content_bytes = ? WHERE id = ?')
                .bind(JSON.stringify(result.content), new TextEncoder().encode(JSON.stringify(result.content)).length, row.id).run();
            casesMigrated++;
        }
    }

    const versions = await env.DB.prepare('SELECT id, content FROM case_versions').all();
    for (const row of versions.results || []) {
        let content;
        try { content = JSON.parse(row.content); } catch (e) { continue; }
        const result = await migrateContent(content, env, auth.session.username, cache);
        if (result.changed) {
            await env.DB.prepare('UPDATE case_versions SET content = ? WHERE id = ?')
                .bind(JSON.stringify(result.content), row.id).run();
            versionsMigrated++;
        }
    }

    return json({ success: true, casesMigrated, versionsMigrated, filesMigrated: [...cache.values()].filter(v => typeof v === 'string').length });
}
