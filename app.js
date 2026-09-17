/* =========================================================
   POST /api/admin/migrate-attachments — one-shot migration of
   legacy base64 attachments out of D1 and into R2.

   Runs as a Worker so it uses the same DB/FILES bindings as the
   rest of the app; there is no separate credential to hand out.

   Properties that matter:
     * IDEMPOTENT — a row with no `data:` URIs left in it is
       skipped, so re-running after a partial failure is safe and
       will not double-upload anything.
     * REVERSIBLE — the original `content` value is copied into
       r2_migration_backup BEFORE the row is rewritten. Nothing is
       destroyed until you drop that table yourself.
     * BATCHED — processes `limit` rows per call (default 25) and
       returns the next offset. Large attachments are the whole
       point of this migration, so a single pass over every row
       would blow the Worker's CPU/memory budget.

   Usage:
     POST /api/admin/migrate-attachments            -> dry run, reports only
     POST /api/admin/migrate-attachments {"apply":true}
     ...then repeat with {"apply":true,"offset":25} etc. until
     `done` comes back true.
   ========================================================= */

/* ---- Adjust these two if your schema differs -------------------- */
const TABLES = [
  { table: 'case_repository', idCol: 'id', contentCol: 'content' },
  { table: 'case_versions', idCol: 'id', contentCol: 'content' }
];
/* ----------------------------------------------------------------- */

const BACKUP_DDL = `
CREATE TABLE IF NOT EXISTS r2_migration_backup (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(table_name, row_id)
)`;

function json(body, status) {
  return new Response(JSON.stringify(body, null, 2), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function extFromMime(mime) {
  const map = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/bmp': 'bmp', 'image/tiff': 'tif',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt', 'text/csv': 'csv'
  };
  return map[(mime || '').toLowerCase()] || 'bin';
}

function attrFrom(tag, name) {
  const m = new RegExp(name + '="([^"]*)"', 'i').exec(tag);
  return m ? m[1] : '';
}

/* Rewrites every <a href="data:..."> in an HTML string, uploading each
   payload to R2. Returns { html, uploaded } — `html` is unchanged when
   there was nothing to do. */
async function rewriteHtml(html, env, uploadedBy, apply) {
  if (typeof html !== 'string' || html.indexOf('data:') === -1) {
    return { html, uploaded: 0 };
  }

  const anchorRe = /<a\b[^>]*href="data:([^;"]+);base64,([A-Za-z0-9+/=\s]+)"[^>]*>/gi;
  const tags = html.match(anchorRe);
  if (!tags || !tags.length) return { html, uploaded: 0 };

  let out = html;
  let uploaded = 0;

  for (const tag of tags) {
    const href = attrFrom(tag, 'href');
    const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(href);
    if (!m) continue;

    const mime = m[1];
    const b64 = m[2].replace(/\s+/g, '');
    const filename = attrFrom(tag, 'download') || ('attachment.' + extFromMime(mime));

    let key = 'migrated__' + crypto.randomUUID().replace(/-/g, '') + '.' + extFromMime(mime);

    if (apply) {
      const bytes = base64ToBytes(b64);
      await env.FILES.put(key, bytes, {
        httpMetadata: {
          contentType: mime,
          contentDisposition: /^image\//i.test(mime)
            ? 'inline'
            : 'attachment; filename="' + filename.replace(/["\\]/g, '') + '"'
        },
        customMetadata: {
          originalName: filename.slice(0, 255),
          uploadedBy: uploadedBy,
          uploadedAt: new Date().toISOString(),
          scope: 'case-doc',
          migrated: 'true'
        }
      });
    }

    // Swap the href and stamp the mime so the PDF export can classify
    // the attachment without sniffing the URL, matching what
    // handleDocUpload writes for new uploads.
    let newTag = tag.replace(href, '/api/files/' + key);
    if (!/data-r2-mime=/i.test(newTag)) {
      newTag = newTag.replace(/<a\b/i, '<a data-r2-key="' + key + '" data-r2-mime="' + mime + '"');
    }

    out = out.replace(tag, newTag);
    uploaded++;
  }

  return { html: out, uploaded };
}

export async function onRequestPost(context) {
  const { request, env, data } = context;

  const user = data && data.user;
  if (!user) return json({ error: 'Not authenticated.' }, 401);
  if (user.userType !== 'Admin') return json({ error: 'Not permitted.' }, 403);
  if (!env.FILES) return json({ error: 'R2 binding FILES is not configured.' }, 500);
  if (!env.DB) return json({ error: 'D1 binding DB is not configured.' }, 500);

  let body = {};
  try { body = await request.json(); } catch (e) {}

  const apply = body.apply === true;
  const offset = Math.max(0, parseInt(body.offset, 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(body.limit, 10) || 25));
  const target = TABLES.find(t => t.table === body.table) || TABLES[0];

  if (apply) await env.DB.prepare(BACKUP_DDL).run();

  const sel = await env.DB
    .prepare(`SELECT ${target.idCol} AS rid, ${target.contentCol} AS content FROM ${target.table} ORDER BY ${target.idCol} LIMIT ? OFFSET ?`)
    .bind(limit, offset)
    .all();

  const rows = (sel && sel.results) || [];
  const report = [];
  let totalUploaded = 0;
  let rowsChanged = 0;

  for (const row of rows) {
    let parsed;
    try {
      parsed = JSON.parse(row.content);
    } catch (e) {
      report.push({ id: row.rid, skipped: 'content is not valid JSON' });
      continue;
    }

    if (!parsed || !parsed.html || typeof parsed.html.docs !== 'string') {
      report.push({ id: row.rid, skipped: 'no html.docs' });
      continue;
    }

    const result = await rewriteHtml(parsed.html.docs, env, String(user.username || 'migration'), apply);
    if (!result.uploaded) {
      report.push({ id: row.rid, attachments: 0 });
      continue;
    }

    if (apply) {
      // Back up first. INSERT OR IGNORE so a re-run never clobbers the
      // pristine original with an already-migrated copy.
      await env.DB
        .prepare('INSERT OR IGNORE INTO r2_migration_backup (table_name, row_id, content, created_at) VALUES (?, ?, ?, ?)')
        .bind(target.table, String(row.rid), row.content, new Date().toISOString())
        .run();

      parsed.html.docs = result.html;
      await env.DB
        .prepare(`UPDATE ${target.table} SET ${target.contentCol} = ? WHERE ${target.idCol} = ?`)
        .bind(JSON.stringify(parsed), row.rid)
        .run();
    }

    totalUploaded += result.uploaded;
    rowsChanged++;
    report.push({ id: row.rid, attachments: result.uploaded, written: apply });
  }

  return json({
    table: target.table,
    mode: apply ? 'apply' : 'dry-run',
    offset,
    limit,
    rowsScanned: rows.length,
    rowsChanged,
    attachmentsUploaded: totalUploaded,
    done: rows.length < limit,
    nextOffset: offset + rows.length,
    report
  });
}
