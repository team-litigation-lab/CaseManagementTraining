import { json } from '../_utils.js';

// The Training Calendar was folded into the Firm Calendar (the 📅 Calendar tab).
// A browser tab opened before that change still runs the old page code and calls
// here; answer it with what to do instead of letting it read the page's HTML.
const gone = () => json({ success: false, code: 'MOVED', error: 'The Training Calendar is now the 📅 Calendar tab of the case. Reload the page (Ctrl+Shift+R) to use it.' }, 410);
export const onRequestGet = gone;
export const onRequestPost = gone;
