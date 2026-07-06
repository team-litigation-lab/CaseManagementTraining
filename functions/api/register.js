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
      email, userType, username, password
    } = data;
    // NOTE: batchId is intentionally NOT accepted from the client anymore.
    // It's generated below, server-side, after the row exists — see why underneath.

    if (!username || !password || !email) {
      return new Response(JSON.stringify({ error: "Required fields are missing." }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { hash, salt } = await hashPassword(password);

    // 1. Insert the user first, WITHOUT a batch_id yet.
    // We need the row's own auto-increment id before we can build a batch ID from it.
    const insertResult = await context.env.DB.prepare(`
      INSERT INTO users (first_name, mi, last_name, suffix, email, user_type, username, password_hash, password_salt, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
    `).bind(firstName, mi, lastName, suffix, email, userType, username, hash, salt).run();

    const newUserId = insertResult.meta.last_row_id;

    // 2. Build a batch ID from that row's own unique id, e.g. 2026-LSHTRAINEE-0042.
    // The database assigns this id atomically on insert, so it can never collide —
    // even if two people submit registrations at the exact same moment.
    const year = new Date().getFullYear();
    const typeTag = (userType === 'Admin') ? 'LSHADMIN' : 'LSHTRAINEE';
    const batchId = `${year}-${typeTag}-${String(newUserId).padStart(4, '0')}`;

    // 3. Write the generated batch ID back onto that same row.
    await context.env.DB.prepare(
      "UPDATE users SET batch_id = ? WHERE id = ?"
    ).bind(batchId, newUserId).run();

    return new Response(JSON.stringify({ success: true, message: "Registration complete!", batchId: batchId }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Username or Email already exists." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }
}
