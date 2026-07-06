export async function onRequestPost(context) {
  try {
    const { userId, newStatus } = await context.request.json();

    if (!userId || !newStatus) {
      return new Response(JSON.stringify({ error: "Missing userId or newStatus." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (newStatus === 'Rejected') {
      await context.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
    } else {
      await context.env.DB.prepare("UPDATE users SET status = ? WHERE id = ?")
        .bind(newStatus, userId).run();
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to update status." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
