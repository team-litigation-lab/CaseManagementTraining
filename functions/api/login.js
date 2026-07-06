// Shared helper — put this in a file like functions/_utils/crypto.js and import it
// in both login.js and register.js so they always hash the exact same way.
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

    // Verify password: re-hash the submitted password using the STORED salt,
    // then compare the resulting hash to the STORED hash.
    const { hash } = await hashPassword(password, user.password_salt);
    if (hash !== user.password_hash) {
      return new Response(JSON.stringify({ error: "Invalid username or password." }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (user.user_type !== portalMode) {
      return new Response(JSON.stringify({
        error: `This account is registered as a ${user.user_type}. Please use the correct Portal Tab.`
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

    // NEW: block login until an admin has approved the account.
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
        userType: user.user_type
      }
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal database verification failure" }), { status: 500 });
  }
}
