export async function onRequestGet(context) {
  try {
    // Pull all columns except passwords from your D1 SQL database for security
    const { results } = await context.env.DB.prepare(
      "SELECT id, first_name, mi, last_name, email, user_type, batch_id, username FROM users"
    ).all();

    // Send the list of users back to your Admin panel layout
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
