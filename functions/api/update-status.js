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
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (newStatus === 'Approved') {
      // Look up the user's type and any existing batch_id first.
      const user = await context.env.DB.prepare(
        "SELECT user_type, batch_id FROM users WHERE id = ?"
      ).bind(userId).first();

      let batchId = user && user.batch_id;
      if (!batchId) {
        // Only assign a batch ID the FIRST time a user is approved. This keeps the
        // ID stable and tied to this specific user even if they're later revoked
        // and re-approved. Built from the row's own unique id, so it can never
        // collide with another user's batch ID.
        const year = new Date().getFullYear();
        const typeTag = (user && user.user_type === 'Admin') ? 'LSHADMIN' : 'LSHTRAINEE';
        batchId = `${year}-${typeTag}-${String(userId).padStart(4, '0')}`;
      }

      await context.env.DB.prepare(
        "UPDATE users SET status = ?, batch_id = ? WHERE id = ?"
      ).bind(newStatus, batchId, userId).run();

      return new Response(JSON.stringify({ success: true, batchId: batchId }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Any other status change (e.g. Revoked) — leave batch_id untouched.
    await context.env.DB.prepare("UPDATE users SET status = ? WHERE id = ?")
      .bind(newStatus, userId).run();

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
