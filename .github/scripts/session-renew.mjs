// 🔁 A sign-in in use is never cut off by its cookie: renewedSessionCookie (functions/_utils.js), called by /api/heartbeat,
// hands an aging session (a 12-hour cookie from before the 8-hour rule, or any token more than a day old) back in a fresh
// 30-day cookie, the same person; a fresh one is not reissued on every beat. The 8-hour idle rule still ends a session.
// Usage: node .github/scripts/session-renew.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const u = await import(pathToFileURL(path.resolve('functions/_utils.js')).href);
const env = { SESSION_SECRET: 'test-secret' };
const fails = [];
const old = await u.verifySessionToken(await u.createSessionToken({ username: 'trainee1', userType: 'Trainee', batchId: 'B1' }, env.SESSION_SECRET, 3600), env.SESSION_SECRET);
const cookie = await u.renewedSessionCookie(env, old);
const m = /lsh_session=([^;]+);.*Max-Age=(\d+)/.exec(cookie || '');
const back = m && await u.verifySessionToken(m[1], env.SESSION_SECRET);
if (!m || Number(m[2]) !== u.SESSION_MAX_SECONDS) fails.push('an old 1-hour sign-in is not handed back in a 30-day cookie: ' + cookie);
if (!back || back.username !== 'trainee1' || back.userType !== 'Trainee' || back.batchId !== 'B1') fails.push('the renewed cookie is not the same session: ' + JSON.stringify(back));
const fresh = await u.verifySessionToken(await u.createSessionToken({ username: 'trainee1' }, env.SESSION_SECRET), env.SESSION_SECRET);
if ((await u.renewedSessionCookie(env, fresh)) !== '') fails.push('a fresh 30-day sign-in is reissued on every beat');
if (fails.length) { console.error('Session renewal FAILED:\n- ' + fails.join('\n- ')); process.exit(1); }
console.log('Session renewal: an aging sign-in comes back as the same session in a 30-day cookie; a fresh one is left alone.');
