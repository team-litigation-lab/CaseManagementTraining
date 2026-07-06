export async function onRequestPost(context) {
  try {
    const data = await context.request.json();
    
    // Extract every single field from your specific UI form
    const { 
      firstName, mi, lastName, suffix, 
      email, userType, batchId, username, password 
    } = data;

    if (!username || !password || !email) {
      return new Response(JSON.stringify({ error: "Required fields are missing." }), { status: 400 });
    }

    // Insert all fields into your D1 database columns
    await context.env.DB.prepare(`
      INSERT INTO users (first_name, mi, last_name, suffix, email, user_type, batch_id, username, password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(firstName, mi, lastName, suffix, email, userType, batchId, username, password).run();

    return new Response(JSON.stringify({ success: true, message: "Registration complete!" }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Username or Email already exists." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
}
