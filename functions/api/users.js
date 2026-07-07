export async function onRequestGet(context) {
  try {
    const { results } = await context.env.DB.prepare(
      `SELECT id, first_name, last_name, email, user_type, batch_id, username, status, created_at, last_seen
       FROM users
       ORDER BY user_type ASC, created_at ASC, id ASC`
    ).all();

    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to fetch users." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
