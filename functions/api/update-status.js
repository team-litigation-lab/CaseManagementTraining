export async function onRequestPost(context) {
  try {
    const { userId, newStatus } = await context.request.json();

    if (!userId || !newStatus) {
      return new Response(JSON.stringify({ error: "Missing required data." }), { status: 400 });
    }

    if (newStatus === "Rejected") {
      // If rejected, permanently wipe them out of the database
      await context.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
    } else {
      // Otherwise, change status to 'Approved' or 'Revoked'
      await context.env.DB.prepare("UPDATE users SET status = ? WHERE id = ?").bind(newStatus, userId).run();
    }

    return new Response(JSON.stringify({ success: true }));
  } catch (err) {
    return new Response(JSON.stringify({ error: "Database update error." }), { status: 500 });
  }
}
