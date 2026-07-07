export async function onRequestPost(context) {
  try {
    const { username } = await context.request.json();
    if (!username) {
      return new Response(JSON.stringify({ error: "Missing username." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
    await context.env.DB.prepare(
      "UPDATE users SET last_seen = datetime('now') WHERE username = ?"
    ).bind(username).run();
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Heartbeat failed." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
