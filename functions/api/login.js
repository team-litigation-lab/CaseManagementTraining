export async function onRequestPost(context) {
  try {
    // 1. Read the login details sent from your login screen form
    const { username, password } = await context.request.json();

    if (!username || !password) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });
    }

    // 2. Query your D1 Database to find the user by their username
    const user = await context.env.DB.prepare(
      "SELECT * FROM users WHERE username = ?"
    ).bind(username).first();

    // 3. If user doesn't exist, block them
    if (!user) {
      return new Response(JSON.stringify({ error: "Account does not exist." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 4. Verify the password matches exactly
    // (Note: Later on, you should hash these with a library for peak security!)
    if (user.password !== password) {
      return new Response(JSON.stringify({ error: "Incorrect password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 5. SUCCESS! Send back an approval signal along with their account info
    return new Response(JSON.stringify({ 
      success: true, 
      message: "Login authorized!",
      user: {
        firstName: user.first_name,
        lastName: user.last_name,
        userType: user.user_type,
        batchId: user.batch_id
      }
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("Login Server Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}
