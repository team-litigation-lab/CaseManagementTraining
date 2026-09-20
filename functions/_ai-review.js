// Not a routed endpoint — filename starts with _, same convention as
// _utils.js, so Cloudflare Pages Functions never maps a URL to this file.
//
// Phase 2 of the admin review system: reads whatever PDF/image was just
// uploaded to Doc Hub and asks Gemini to (a) assess its writing quality
// and (b) flag anything in it that's inconsistent with what the trainee
// has written elsewhere in the case (police report narrative, notes,
// treatment chronology). This is layered ON TOP of Phase 1's rule-based
// runAutomatedReview() in _utils.js, not a replacement for it.
//
// Called via context.waitUntil() from case-repository.js's onRequestPost
// — deliberately NOT awaited inline, so a slow or failed API call can
// never delay or break an actual case save. It runs after the save's
// response has already gone back to the trainee; results show up on the
// dashboard a few seconds later on next load.
//
// Requires:
//   - env.GEMINI_API_KEY set as a Cloudflare secret
//   - case_reviews table to have ai_review / ai_review_status /
//     ai_reviewed_at columns (see add-ai-review-columns.sql) — column
//     names are provider-agnostic on purpose, so switching providers
//     again later wouldn't need another schema migration.

const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Natively supported inline_data types for Gemini's generateContent —
// anything else (e.g. .docx) is skipped with a clear "unsupported"
// status rather than guessed at.
const SUPPORTED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);

// Matches the exact anchor format handleDocUpload() in app.js generates:
// <a href="/api/file?key=..." data-r2-key="..." data-r2-mime="...">
// Only looks at content.html.docs (the Doc Hub section specifically) —
// not the whole case — since that's what "what was uploaded" means here.
function extractDocumentRefs(content) {
    const docsHtml = (content && content.html && content.html.docs) || '';
    const refs = [];
    const re = /data-r2-key="([^"]+)"[^>]*data-r2-mime="([^"]*)"/g;
    let m;
    while ((m = re.exec(docsHtml)) !== null) {
        refs.push({ key: m[1], mime: m[2] });
    }
    return refs;
}

function stripHtml(html) {
    return (html || '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

// The written narrative to compare the document against — deliberately
// limited to sections that are actually narrative/prose (not tables like
// Finance or Liens, which wouldn't give the model meaningful text to
// cross-check against).
function gatherNarrative(content) {
    const html = (content && content.html) || {};
    const sections = [
        ['police', 'Police Report Narrative'],
        ['notes', 'Notes'],
        ['chrono', 'Treatment Chronology'],
        ['lit', 'Litigation'],
    ];
    const parts = [];
    for (const [key, label] of sections) {
        const text = stripHtml(html[key]);
        if (text) parts.push(`## ${label}\n${text}`);
    }
    return parts.join('\n\n');
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000; // process in chunks — avoids a call-stack
    for (let i = 0; i < bytes.length; i += chunkSize) { // overflow on large files
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

async function storeAiReview(db, caseRepositoryId, trainingDay, review) {
    try {
        await db.prepare(
            `UPDATE case_reviews SET ai_review = ?, ai_review_status = ?, ai_reviewed_at = datetime('now')
             WHERE case_repository_id = ? AND training_day IS ?`
        ).bind(JSON.stringify(review), review.status, caseRepositoryId, trainingDay).run();
    } catch (e) {
        console.error('Failed to store automated feedback', e);
    }
}

export async function runAiReview(env, { caseRepositoryId, trainingDay, content, clientName }) {
    try {
        const apiKey = env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error('GEMINI_API_KEY not configured — skipping automated feedback');
            await storeAiReview(env.DB, caseRepositoryId, trainingDay, {
                status: 'failed',
                reason: 'Automated feedback is not configured yet (missing API key) — contact your admin.'
            });
            return;
        }

        const docRefs = extractDocumentRefs(content);
        const doc = docRefs.find(d => SUPPORTED_MIME.has(d.mime));
        if (!doc) {
            await storeAiReview(env.DB, caseRepositoryId, trainingDay, {
                status: 'skipped',
                reason: docRefs.length
                    ? 'The uploaded document type isn\'t supported for automated feedback yet (only PDF and image files are).'
                    : 'No document found in Doc Hub to review.'
            });
            return;
        }

        const object = await env.DOCUMENTS.get(doc.key);
        if (!object) {
            await storeAiReview(env.DB, caseRepositoryId, trainingDay, { status: 'failed', reason: 'Could not fetch the document from storage.' });
            return;
        }
        const bytes = await object.arrayBuffer();
        const base64 = arrayBufferToBase64(bytes);
        const narrative = gatherNarrative(content);

        const prompt = `You are reviewing a legal case file prepared by a trainee at a personal injury law firm, as part of a training exercise. You are given (1) an uploaded document from the case's Doc Hub and (2) the narrative text the trainee has written elsewhere in the case file.

Client: ${clientName || 'Unknown'}

--- WRITTEN CASE NARRATIVE ---
${narrative || '(no narrative text found elsewhere in the case)'}
--- END NARRATIVE ---

Review the attached document and respond with ONLY a JSON object (no markdown, no code fences, no other text) matching exactly this shape:
{
  "writingQualityScore": <integer 1-5, 5 being excellent>,
  "writingQualitySummary": "<1-2 sentence assessment of clarity, tone, and professionalism>",
  "consistencyIssues": ["<a specific fact in the document that conflicts with or isn't supported by the written narrative, if any>"],
  "strengths": ["<specific things done well>"],
  "concerns": ["<specific things to improve>"]
}
If there are no consistency issues, return an empty array for consistencyIssues. Be specific and cite what you actually found in the document — do not invent issues that aren't there.`;

        const requestBody = {
            contents: [{
                parts: [
                    { inline_data: { mime_type: doc.mime, data: base64 } },
                    { text: prompt }
                ]
            }]
        };

        const res = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify(requestBody)
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error('Gemini API error', res.status, errText);
            await storeAiReview(env.DB, caseRepositoryId, trainingDay, { status: 'failed', reason: `Automated feedback service returned ${res.status}.` });
            return;
        }

        const data = await res.json();
        const textOut = data && data.candidates && data.candidates[0] && data.candidates[0].content
            && data.candidates[0].content.parts && data.candidates[0].content.parts[0]
            && data.candidates[0].content.parts[0].text;

        let parsed;
        try {
            let raw = (textOut || '').trim();
            // Defensive: strip markdown fences if the model added them
            // despite the "no markdown" instruction.
            raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
            parsed = JSON.parse(raw);
        } catch (e) {
            console.error('Could not parse automated feedback JSON', e, textOut);
            await storeAiReview(env.DB, caseRepositoryId, trainingDay, { status: 'failed', reason: 'Automated feedback response could not be parsed.' });
            return;
        }

        await storeAiReview(env.DB, caseRepositoryId, trainingDay, { status: 'complete', ...parsed });
    } catch (e) {
        console.error('Automated feedback failed unexpectedly', e);
        try { await storeAiReview(env.DB, caseRepositoryId, trainingDay, { status: 'failed', reason: 'Unexpected error running automated feedback.' }); } catch (e2) {}
    }
}
