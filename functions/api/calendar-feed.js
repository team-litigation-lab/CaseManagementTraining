import { CALENDARS, CALENDAR_IDS, buildICS, addDays, firmToday, ensureCalendarTables, visibleEvents } from '../_calendar.js';

// GET /api/calendar-feed?token=<feed token>&cal=reyes|brooks|okafor|firm|all, or several: cal=reyes,brooks
//
// A live iCalendar feed of an attorney's calendar, for "subscribe by URL" in
// Google Calendar or Outlook, so the schedule a trainee builds in the CMS shows
// up in a real calendar app and stays in step (the app re-reads the feed on its
// own schedule: Outlook about hourly, Google every few hours). No sign-in: the
// feed token (Firm Calendar → Subscribe) stands in for it, and shows what that
// user's calendar shows (the attorneys' standing schedule, events an Admin
// shared firm-wide, and the user's own events), from 30 days back to 120 ahead.
export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const token = String(url.searchParams.get('token') || '');
    const cal = String(url.searchParams.get('cal') || 'all');
    if (!/^[a-f0-9]{32,80}$/.test(token)) return new Response('Unknown calendar link.', { status: 404 });
    // the calendars the link covers (Firm Calendar → Sync: the ones the person ticked)
    const picked = cal === 'all' ? CALENDAR_IDS.slice() : [...new Set(cal.split(','))];
    if (!picked.length || picked.some(c => !CALENDAR_IDS.includes(c))) return new Response('Unknown calendar.', { status: 404 });
    const everyOne = picked.length === CALENDAR_IDS.length;
    await ensureCalendarTables(env.DB);
    const row = await env.DB.prepare(
        `SELECT f.username, u.user_type, u.status FROM calendar_feeds f JOIN users u ON u.username = f.username WHERE f.token = ?`
    ).bind(token).first();
    if (!row || row.status !== 'Approved') return new Response('This calendar link is no longer active.', { status: 404 });

    const today = firmToday();
    const session = { username: row.username, userType: row.user_type };
    let events = await visibleEvents(env.DB, session, addDays(today, -30), addDays(today, 120));
    if (!everyOne) events = events.filter(e => picked.includes(e.calendar) || (e.invite || []).some(c => picked.includes(c)));
    const name = everyOne ? 'LSH Firm Calendar (training)'
        : `${picked.map(c => CALENDARS.find(x => x.id === c).name.replace('Atty. ', '')).join(' + ')} (LSH training)`;
    return new Response(buildICS(events, name, url.host), {
        status: 200,
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': `inline; filename="lsh-${everyOne ? 'all' : picked.join('-')}-calendar.ics"`,
            'Cache-Control': 'no-cache, max-age=0'
        }
    });
}
