// Automatic review of an Intake folder file by Claude (not routed: the file name starts
// with _). Called by /api/intake-files right after a save or upload.
//
// Typed intakes are sent as text (formSummary in _intake.js); uploaded intake documents
// are sent as the PDF or image itself, and the reviewer also reports which checklist
// details the document contains, so the checklist can be scored for them too.
// The answer is structured output (a JSON schema), so it always parses.
//
// Needs env.ANTHROPIC_API_KEY (the same Cloudflare secret the Doc Hub review uses).
// Plain fetch, like _ai-review.js: the Pages Functions here have no npm dependencies.
import { formSummary, REVIEWABLE_MIME, todayIso } from './_intake.js';

const MODEL = 'claude-opus-5-5';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_ITEMS = 12;

const LIST = { type: 'array', items: { type: 'string' } };
const TEXT_OR_NULL = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const REVIEW_PROPS = {
    score: { type: 'integer', description: 'Overall quality of the intake, 1 (poor) to 5 (excellent).' },
    summary: { type: 'string', description: 'Two or three sentences for the trainee: how complete and usable this intake is.' },
    missing: Object.assign({ description: 'Information a complete intake has that this one lacks.' }, LIST),
    redFlags: Object.assign({ description: 'Risks for the case: limitation deadlines, liability doubts, coverage gaps, prior injuries or claims, treatment gaps, a minor or an unauthorized caller, inconsistencies.' }, LIST),
    followUps: Object.assign({ description: 'Questions to ask the client next.' }, LIST),
    strengths: Object.assign({ description: 'What the trainee did well.' }, LIST),
    concerns: Object.assign({ description: 'Problems with accuracy, clarity or professionalism in how it was recorded.' }, LIST),
};
export const DOC_FIELDS = ['clientName', 'phone', 'dateOfBirth', 'address', 'email', 'dateOfLoss', 'accidentType', 'whatHappened', 'injuries',
    'treatment', 'insurance', 'policeReport', 'statuteOfLimitations', 'emergencyContact', 'attorney', 'notes'];
const FORM_SCHEMA = { type: 'object', properties: REVIEW_PROPS, required: Object.keys(REVIEW_PROPS), additionalProperties: false };
const DOC_SCHEMA = {
    type: 'object',
    properties: Object.assign({}, REVIEW_PROPS, {
        fields: {
            type: 'object',
            description: 'What the document says for each item, copied or briefly summarized; null when the document does not contain it.',
            properties: Object.fromEntries(DOC_FIELDS.map(k => [k, TEXT_OR_NULL])),
            required: DOC_FIELDS, additionalProperties: false,
        },
    }),
    required: [...Object.keys(REVIEW_PROPS), 'fields'], additionalProperties: false,
};

const SYSTEM = `You review client intake files for a personal injury law firm's training program. Trainees (legal assistants in training) take new-client calls and record the intake; the clients are fictional. Your review is shown to the trainee and their trainer.

A complete intake lets an attorney decide whether to take the case and lets the team act on it: who the client is and how to reach them, when and how the accident happened and who was at fault, the injuries and treatment so far, the insurance on both sides, any police or incident report, and the deadlines (statute of limitations) worked out from the date of loss.

Base every point on what the file actually says, and name the specific detail. Don't invent problems; if the intake is good, say so. Write for the trainee: plain, direct, specific.`;

function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
}
const cleanList = (v) => (Array.isArray(v) ? v : []).map(x => String(x || '').trim()).filter(Boolean).slice(0, MAX_ITEMS).map(x => x.slice(0, 600));

/**
 * Reviews one intake_files row. Returns { status: 'complete', ...review } or
 * { status: 'failed' | 'skipped' | 'not-configured', reason }. Never throws.
 */
export async function reviewIntake(env, row) {
    try {
        if (!env.ANTHROPIC_API_KEY) return { status: 'not-configured', reason: 'Automatic review isn\'t set up yet: an admin needs to add the ANTHROPIC_API_KEY secret. The checklist still runs.' };
        let content, schema;
        if (row.kind === 'document') {
            if (!REVIEWABLE_MIME.has(row.doc_mime)) return { status: 'skipped', reason: 'Only PDF and image files can be reviewed. Save the intake as a PDF and upload it again.' };
            if (!env.DOCUMENTS) return { status: 'failed', reason: 'Document storage is not configured.' };
            const obj = await env.DOCUMENTS.get(row.doc_key);
            if (!obj) return { status: 'failed', reason: 'The uploaded file could not be found in storage.' };
            const data = toBase64(await obj.arrayBuffer());
            const block = row.doc_mime === 'application/pdf'
                ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
                : { type: 'image', source: { type: 'base64', media_type: row.doc_mime, data } };
            content = [block, {
                type: 'text',
                text: `This is an intake document a trainee uploaded to the Intake folder. Today's date: ${todayIso()}.\n`
                    + `Client name given with the upload: ${row.client_name || '(none)'}. Date of loss given with the upload: ${row.date_of_loss || '(none)'}.`
                    + `${row.note ? `\nTrainee's note: ${row.note}` : ''}\n\nReport what the document contains for each checklist field, then review it as an intake.`,
            }];
            schema = DOC_SCHEMA;
        } else {
            let saved = {};
            try { saved = JSON.parse(row.content || '{}'); } catch (e) { saved = {}; }
            content = [{ type: 'text', text: `Review this intake, typed by a trainee in the case management system.\n\n${formSummary(saved, row.client_name)}` }];
            schema = FORM_SCHEMA;
        }

        const res = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                // Server-side fallback: if a safety classifier declines, the API retries on
                // Anthropic's recommended fallback model instead of returning the refusal.
                'anthropic-beta': 'server-side-fallback-2026-07-01',
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: 16000,
                fallbacks: 'default',
                system: SYSTEM,
                output_config: { effort: 'low', format: { type: 'json_schema', schema } },
                messages: [{ role: 'user', content }],
            }),
            signal: AbortSignal.timeout(110000),
        });
        if (!res.ok) {
            console.error('Intake review API error', res.status, await res.text().catch(() => ''));
            return { status: 'failed', reason: `The review service returned an error (${res.status}). Try again later.` };
        }
        const data = await res.json();
        if (data.stop_reason === 'refusal') return { status: 'failed', reason: 'The reviewer declined to review this file.' };
        if (data.stop_reason === 'max_tokens') return { status: 'failed', reason: 'The review was cut off. Try again.' };
        const texts = (data.content || []).filter(b => b.type === 'text');
        const last = texts[texts.length - 1];
        let parsed;
        try { parsed = JSON.parse(last ? last.text : ''); } catch (e) {
            console.error('Intake review JSON did not parse', e);
            return { status: 'failed', reason: 'The review came back in an unexpected form. Try again.' };
        }
        const review = {
            status: 'complete', model: data.model || MODEL,
            score: Math.max(1, Math.min(5, parseInt(parsed.score, 10) || 1)),
            summary: String(parsed.summary || '').trim().slice(0, 1500),
            missing: cleanList(parsed.missing), redFlags: cleanList(parsed.redFlags), followUps: cleanList(parsed.followUps),
            strengths: cleanList(parsed.strengths), concerns: cleanList(parsed.concerns),
        };
        if (row.kind === 'document') {
            const f = parsed.fields || {};
            review.fields = Object.fromEntries(DOC_FIELDS.map(k => [k, typeof f[k] === 'string' && f[k].trim() ? f[k].trim().slice(0, 600) : null]));
        }
        return review;
    } catch (e) {
        console.error('Intake review failed', e);
        return { status: 'failed', reason: e && e.name === 'TimeoutError' ? 'The review took too long. Try again.' : 'The review could not be completed. Try again.' };
    }
}
