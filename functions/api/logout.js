import { json, clearSessionCookie } from '../_utils.js';

export async function onRequestPost() {
    return json({ success: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}
