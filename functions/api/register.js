async function hashPassword(password) {
  const enc = new TextEncoder();
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));

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
    const data = await context.request.json();

    const {
      firstName, mi, lastName, suffix,
      email, userType, batchId, username, password
    } = data;

    if (!username || !password || !email) {
      return new Response(JSON.stringify({ error: "Required fields are missing." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { hash, salt } = await hashPassword(password);

    await context.env.DB.prepare(`
      INSERT INTO users (first_name, mi, last_name, suffix, email, user_type, batch_id, username, password_hash, password_salt, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
    `).bind(firstName, mi, lastName, suffix, email, userType, batchId, username, hash, salt).run();

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
