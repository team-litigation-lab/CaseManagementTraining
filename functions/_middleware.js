// Cross-site request guard for the API.
//
// The session cookie is SameSite=None (see sessionCookie in _utils.js) so the
// CMS works inside the LSH CM course's frame. That means the browser would
// also attach it to requests another website triggers, so every
// state-changing /api/ request must come from this site's own pages:
//   - an Origin header, when present, must be this host;
//   - Sec-Fetch-Site "cross-site" is refused.
// Requests without either header (server-side tools, curl) aren't browser
// CSRF and pass through; reads (GET/HEAD/OPTIONS) are unaffected.
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    if (UNSAFE.has(request.method) && url.pathname.startsWith('/api/')) {
        const origin = request.headers.get('Origin');
        const site = request.headers.get('Sec-Fetch-Site');
        let allowed = true;
        if (origin !== null) {
            try { allowed = origin !== 'null' && new URL(origin).host === url.host; } catch (e) { allowed = false; }
        }
        if (allowed && site === 'cross-site') allowed = false;
        if (!allowed) {
            return new Response(JSON.stringify({ success: false, error: 'Blocked: this request did not come from the LSH Case Management System.' }), {
                status: 403, headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    return context.next();
}
