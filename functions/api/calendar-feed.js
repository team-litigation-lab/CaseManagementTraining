import { CALENDARS, CALENDAR_IDS, buildICS, addDays, firmToday, ensureCalendarTables, visibleEvents } from '../_calendar.js';

// GET /api/calendar-feed?token=<feed token>&cal=reyes|brooks|okafor|firm|all
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
    if (cal !== 'all' && !CALENDAR_IDS.includes(cal)) return new Response('Unknown calendar.', { status: 404 });
    await ensureCalendarTables(env.DB);
    const row = await env.DB.prepare(
        `SELECT f.username, u.user_type, u.status FROM calendar_feeds f JOIN users u ON u.username = f.username WHERE f.token = ?`
    ).bind(token).first();
    if (!row || row.status !== 'Approved') return new Response('This calendar link is no longer active.', { status: 404 });

    const today = firmToday();
    const session = { username: row.username, userType: row.user_type };
    let events = await visibleEvents(env.DB, session, addDays(today, -30), addDays(today, 120));
    if (cal !== 'all') events = events.filter(e => e.calendar === cal || (e.invite || []).includes(cal));
    const name = cal === 'all' ? 'LSH Firm Calendar (training)' : `${CALENDARS.find(c => c.id === cal).name} (LSH training)`;
    return new Response(buildICS(events, name, url.host), {
        status: 200,
        headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Content-Disposition': `inline; filename="lsh-${cal}-calendar.ics"`,
            'Cache-Control': 'no-cache, max-age=0'
        }
    });
}
