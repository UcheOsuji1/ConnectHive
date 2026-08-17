import Anthropic from '@anthropic-ai/sdk';

let _client = null;

function getClient() {
  if (!_client && process.env.ANTHROPIC_API_KEY) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export function aiEnabled() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// In-memory rate limiter: 10 calls per user per 60s
const RATE_LIMIT  = 10;
const RATE_WINDOW = 60_000;
const _rates      = new Map(); // userId → { count, windowStart }

function checkRate(userId) {
  const now   = Date.now();
  const entry = _rates.get(userId);
  if (!entry || now - entry.windowStart > RATE_WINDOW) {
    _rates.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

function extractJSON(text) {
  try { return JSON.parse(text); } catch { /* fall through */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
  return null;
}

function trunc(str, max = 200) {
  if (!str) return 'N/A';
  return String(str).slice(0, max);
}

function arr(v, max = 10) {
  if (!v) return [];
  const items = Array.isArray(v) ? v : (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return [v]; } })() : []);
  return items.slice(0, max).map(x => (typeof x === 'object' ? JSON.stringify(x) : String(x)));
}

async function callAI(messages, userId) {
  const client = getClient();
  if (!client) return null;
  if (!checkRate(userId)) {
    console.error('[aiExplain] rate limit exceeded for user', userId);
    return null;
  }

  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

  try {
    const response = await Promise.race([
      client.messages.create({ model, max_tokens: 500, temperature: 0.3, messages }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 12_000)),
    ]);

    const text = response.content?.[0]?.text ?? '';
    return extractJSON(text);
  } catch (err) {
    console.error('[aiExplain] API error:', err.message);
    return null;
  }
}

// ── generateHiveFitAnalysis ───────────────────────────────────────────────────
// Returns { summary, strengths, consideration } or null on any failure.
export async function generateHiveFitAnalysis({ hive, candidate, reasons }, userId) {
  const prompt = `You are a community fit analyst. Analyze whether this candidate is a good fit for this Hive.

Hive: "${hive.hive_name}" (${hive.category_name ?? 'N/A'})
Description: ${trunc(hive.description)}
Ideal members: ${trunc(hive.ideal_members)}
Tags: ${JSON.stringify(arr(hive.tags))}

Candidate: "${candidate.full_name ?? 'Candidate'}"
Interests: ${JSON.stringify(arr(candidate.interests))}
Goals: ${JSON.stringify(arr(candidate.goals))}
Skills: ${JSON.stringify(arr(candidate.skills))}
Join message: "${trunc(candidate.request_message, 300)}"
Hive fit score: ${candidate.hive_fit_score ?? 'N/A'}%
Personal compatibility score: ${candidate.pair_score ?? 'N/A'}%
Match reasons: ${JSON.stringify(reasons)}

Respond ONLY with valid JSON, no markdown fences:
{"summary":"2-3 sentence overall assessment","strengths":["strength 1","strength 2","strength 3"],"consideration":"1 sentence caveat or null"}`;

  const result = await callAI([{ role: 'user', content: prompt }], userId);
  if (!result) return null;
  if (typeof result.summary !== 'string') return null;
  if (!Array.isArray(result.strengths)) return null;
  return {
    summary:       result.summary,
    strengths:     result.strengths.slice(0, 3),
    consideration: typeof result.consideration === 'string' ? result.consideration : null,
  };
}

// ── generateDiscoveryExplanation ──────────────────────────────────────────────
// Returns { summary, highlights } or null on any failure.
export async function generateDiscoveryExplanation({ hive, userProfile, reasons }, userId) {
  const prompt = `You are a community matchmaker. Explain concisely why this Hive is a strong match for this person.

Hive: "${hive.hive_name}" (${hive.category_name ?? 'N/A'})
Description: ${trunc(hive.description)}
Tags: ${JSON.stringify(arr(hive.tags))}
Match score: ${hive.match_score ?? 'N/A'}%

Person's interests: ${JSON.stringify(arr(userProfile.interests))}
Person's goals: ${JSON.stringify(arr(userProfile.goals))}
Person's skills: ${JSON.stringify(arr(userProfile.skills))}
Match reasons: ${JSON.stringify(reasons)}

Respond ONLY with valid JSON, no markdown fences:
{"summary":"2-3 sentence personalised explanation","highlights":["highlight 1","highlight 2","highlight 3"]}`;

  const result = await callAI([{ role: 'user', content: prompt }], userId);
  if (!result) return null;
  if (typeof result.summary !== 'string') return null;
  if (!Array.isArray(result.highlights)) return null;
  return {
    summary:    result.summary,
    highlights: result.highlights.slice(0, 3),
  };
}
