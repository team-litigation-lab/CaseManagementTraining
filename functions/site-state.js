async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const saltBytes = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  const hashHex = [...new Uint8Array(derivedBits)].map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex;
}

async function verifyAdmin(env, batchId, password) {
  if (!batchId || !password) return null;
  const user = await env.DB.prepare(
    "SELECT * FROM users WHERE batch_id = ? AND user_type = 'Admin'"
  ).bind(batchId).first();
  if (!user) return null;
  if (user.status === 'Revoked') return null;
  const hash = await hashPassword(password, user.password_salt);
  if (hash !== user.password_hash) return null;
  return user;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

export async function onRequestGet(context) {
  try {
    const row = await context.env.DB.prepare("SELECT * FROM site_state WHERE id = 1").first();
    return json({ success: true, state: row || {} });
  } catch (err) {
    return json({ error: "Failed to fetch site state." }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { action } = body;
    const env = context.env;
    const now = Date.now();

    if (action === 'announcement') {
      const { text, active } = body;
      await env.DB.prepare(
        "UPDATE site_state SET announcement_text = ?, announcement_active = ?, updated_at = ? WHERE id = 1"
      ).bind(text || '', active ? 1 : 0, now).run();
      return json({ success: true });
    }

    if (action === 'alert') {
      const { text, bgColor, opacity, image, durationSeconds } = body;
      if (!text) return json({ error: "Alert text is required." }, 400);
      const expiresAt = durationSeconds && durationSeconds > 0 ? now + (durationSeconds * 1000) : 0;
      await env.DB.prepare(`
        UPDATE site_state
        SET alert_active = 1, alert_text = ?, alert_bg_color = ?, alert_opacity = ?, alert_image = ?, alert_expires_at = ?, updated_at = ?
        WHERE id = 1
      `).bind(text, bgColor || '#7c2d12', opacity || 0.65, image || '', expiresAt, now).run();
      return json({ success: true });
    }

    if (action === 'clear-alert') {
      await env.DB.prepare(
        "UPDATE site_state SET alert_active = 0, alert_expires_at = 0, updated_at = ? WHERE id = 1"
      ).bind(now).run();
      return json({ success: true });
    }

    if (action === 'pause' || action === 'resume') {
      await env.DB.prepare(
        "UPDATE site_state SET paused = ?, updated_at = ? WHERE id = 1"
      ).bind(action === 'pause' ? 1 : 0, now).run();
      return json({ success: true });
    }

    if (action === 'lock') {
      const { batchId, password } = body;
      const admin = await verifyAdmin(env, batchId, password);
      if (!admin) return json({ error: "Verification failed. Invalid Batch ID or password." }, 401);
      await env.DB.prepare(
        "UPDATE site_state SET locked = 1, locked_by = ?, updated_at = ? WHERE id = 1"
      ).bind(batchId, now).run();
      return json({ success: true });
    }

    if (action === 'unlock') {
      const { batchId, password } = body;
      const admin = await verifyAdmin(env, batchId, password);
      if (!admin) return json({ error: "Verification failed. Invalid Batch ID or password." }, 401);
      await env.DB.prepare(
        "UPDATE site_state SET locked = 0, locked_by = '', updated_at = ? WHERE id = 1"
      ).bind(now).run();
      return json({ success: true });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (err) {
    return json({ error: "Failed to update site state." }, 500);
  }
}
