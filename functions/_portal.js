// Single sign-on from the LSH Training Portal (the same signed ticket the training programs use).
//   ticket = base64url(JSON {first,last,b,exp}) + "." + base64url(HMAC-SHA256(key "portal-sso:" + PORTAL_SSO_SECRET, payload))
//   an administrator's ticket is {r:"a", exp}
// Everyone signs in on the Portal; the CMS does not sign anyone in by a typed name or a username alone once
// PORTAL_SSO_SECRET (and the admin password) are set. Until then it behaves as before, so nothing breaks mid-setup.
const MAX_AHEAD_MS = 10 * 60 * 1000;
const enc = new TextEncoder();

export const portalSecret = (env) => String(env.PORTAL_SSO_SECRET || '').trim();
export const adminPasswordsSet = (env) => [env.MASTER_ADMIN_PASSWORD, env.ADMIN_PORTAL_PASSWORD].some(p => String(p || '').trim());
export const portalOnly = (env) => !!(portalSecret(env) && adminPasswordsSet(env));

function b64url(bytes) {
    let s = '';
    new Uint8Array(bytes).forEach(b => { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function same(a, b) {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
}

// Returns { admin:true } | { first, last, batch } | null; `why.r` says why a ticket was refused.
export async function readPortalTicket(env, ticket, why = {}) {
    const secret = portalSecret(env);
    if (!secret) { why.r = 'format'; return null; }
    const parts = String(ticket || '').split('.');
    if (parts.length !== 2) { why.r = 'format'; return null; }
    const key = await crypto.subtle.importKey('raw', enc.encode('portal-sso:' + secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const good = b64url(await crypto.subtle.sign('HMAC', key, enc.encode(parts[0])));
    if (!same(good, parts[1])) { why.r = 'signature'; return null; }
    let t;
    try { t = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)))); } catch (e) { why.r = 'format'; return null; }
    const exp = Number(t && t.exp);
    if (!exp || Date.now() > exp || exp - Date.now() > MAX_AHEAD_MS) { why.r = 'expired'; return null; }
    if (t.r === 'a') return { admin: true };
    const first = String(t.first || '').trim(), last = String(t.last || '').trim(), batch = String(t.b || '').trim();
    if (!first || !last) { why.r = 'format'; return null; }
    return { first, last, batch };
}
