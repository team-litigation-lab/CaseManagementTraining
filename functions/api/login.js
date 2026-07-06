export async function onRequestPost(context) {
  try {
    const { username, password, portalMode } = await context.request.json();

    // 1. Look up the user account profile in D1
    const user = await context.env.DB.prepare(
      "SELECT * FROM users WHERE username = ?"
    ).bind(username).first();

    // 2. Core structural error validations
    if (!user || user.password !== password) {
      return new Response(JSON.stringify({ error: "Invalid username or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3. Security Cross-Check: Does their account role match their selected interface tab?
    if (user.user_type !== portalMode) {
      return new Response(JSON.stringify({ 
        error: `This account is registered as a ${user.user_type}. Please use the correct Portal Tab.` 
      }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 4. Revocation Lock Check
    if (user.status === 'Revoked') {
      return new Response(JSON.stringify({ error: "Your access authorization has been revoked by administration." }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 5. SUCCESS DETECTED
    return new Response(JSON.stringify({ 
      success: true, 
      user: {
        firstName: user.first_name,
        lastName: user.last_name,
        userType: user.user_type
      }
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal database verification failure" }), { status: 500 });
  }
}
