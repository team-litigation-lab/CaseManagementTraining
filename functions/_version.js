// The deployed version of the site: a short fingerprint of the page and every local script and
// stylesheet it loads, read through the Pages ASSETS binding (no build step needed). A new deployment
// serves new files, so it gets a new fingerprint; one deployment always gives the same one.
// /api/state reports it, and an open page that loaded older files reloads itself (cms-update.js).
//
// Worked out once per worker (a deployment's files never change). After a failure it's tried again
// a minute later, and the version is null meanwhile (pages then simply don't update themselves).
let pending = null, failedAt = 0;

const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));

// The local scripts and stylesheets a page loads, in order (CDN files aren't ours, so they're left out).
export function pageAssets(html) {
    const out = [];
    for (const m of String(html).matchAll(/<(?:script\b[^>]*?\bsrc|link\b[^>]*?\bhref)\s*=\s*["']([^"'#?]+)/gi)) {
        const f = m[1].trim();
        if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(f) || !/\.(?:js|css)$/i.test(f)) continue;
        const p = '/' + f.replace(/^\.?\//, '');
        if (!out.includes(p)) out.push(p);
    }
    return out;
}

async function compute(env, request) {
    const origin = request && request.url ? new URL(request.url).origin : 'https://cms.local';
    const get = async (path) => {
        const res = env.ASSETS ? await env.ASSETS.fetch(new Request(origin + path)) : await fetch(origin + path, { headers: { 'Cache-Control': 'no-cache' } });
        if (!res.ok) throw new Error(`${path}: ${res.status}`);
        return res.text();
    };
    const html = await get('/');
    const parts = ['/:' + await sha(html)];
    for (const p of pageAssets(html)) parts.push(p + ':' + await sha(await get(p)));
    return (await sha(parts.join('\n'))).slice(0, 16);
}

export async function deployVersion(env, request) {
    if (!env || (!env.ASSETS && !(request && request.url))) return null;   // nothing to read the files with
    if (!pending) {
        if (Date.now() - failedAt < 60000) return null;
        pending = compute(env, request).catch(() => { failedAt = Date.now(); pending = null; return null; });
    }
    return pending;
}
