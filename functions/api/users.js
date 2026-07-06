export async function onRequestGet(context) {
  try {
    // We now fetch the 'id' and 'status' columns as well
    const { results } = await context.env.DB.prepare(
      "SELECT id, first_name, mi, last_name, email, user_type, batch_id, username, status FROM users"
    ).all();

    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to load registrations" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
