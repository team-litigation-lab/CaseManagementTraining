async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const saltBytes = saltHex
    ? new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)))
    : crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );

  const hashHex = [...new Uint8Array(derivedBits)].map(b => b.toString(16).padStart(2, "0")).join("");
  const saltOut = [...saltBytes].map(b => b.toString(16).padStart(2, "0")).join("");
  return { hash: hashHex, salt: saltOut };
}

export async function onRequestPost(context) {
  try {
    const { username, password, portalMode } = await context.request.json();

    const user = await context.env.DB.prepare(
      "SELECT * FROM users WHERE username = ?"
    ).bind(username).first();

    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid username or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { hash } = await hashPassword(password, user.password_salt);
    if (hash !== user.password_hash) {
      return new Response(JSON.stringify({ error: "Invalid username or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Access rule:
    // - Admin accounts may log into EITHER portal tab (Trainee or Admin).
    // - Trainee accounts may ONLY log into the Trainee portal tab.
    if (portalMode === 'Admin' && user.user_type !== 'Admin') {
      return new Response(JSON.stringify({
        error: "This account is not authorized for Admin Portal access."
      }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (user.status === 'Revoked') {
      return new Response(JSON.stringify({ error: "Your access authorization has been revoked by administration." }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (user.status === 'Pending') {
      return new Response(JSON.stringify({ error: "Your account is awaiting admin approval." }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      user: {
        firstName: user.first_name,
        lastName: user.last_name,
        userType: portalMode
      }
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal database verification failure" }), { status: 500 });
  }
}
