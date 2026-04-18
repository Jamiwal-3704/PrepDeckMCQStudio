// ─── Provider Definitions ────────────────────────────────────────────────────

export const PROVIDERS = {
  groq: {
    id: "groq",
    name: "Groq",
    tagline: "Fastest inference — Free tier",
    icon: "⚡",
    color: "#f55036",
    model: "llama-3.3-70b-versatile",
    modelLabel: "LLaMA 3.3 70B",
    keyPlaceholder: "gsk_…",
    keyLink: "https://console.groq.com/keys",
    keyLinkLabel: "console.groq.com",
    type: "openai-compat",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    tagline: "Google AI — Free tier",
    icon: "✦",
    color: "#4285f4",
    model: "gemini-2.0-flash",
    modelLabel: "Gemini 2.0 Flash",
    keyPlaceholder: "AIza…",
    keyLink: "https://aistudio.google.com/app/apikey",
    keyLinkLabel: "aistudio.google.com",
    type: "gemini",
    endpoint:
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
  },
  openai: {
    id: "openai",
    name: "ChatGPT",
    tagline: "OpenAI GPT-4o mini",
    icon: "🤖",
    color: "#10a37f",
    model: "gpt-4o-mini",
    modelLabel: "GPT-4o mini",
    keyPlaceholder: "sk-…",
    keyLink: "https://platform.openai.com/api-keys",
    keyLinkLabel: "platform.openai.com",
    type: "openai-compat",
    endpoint: "https://api.openai.com/v1/chat/completions",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    tagline: "Access 100+ models — Free models available",
    icon: "🔀",
    color: "#7c3aed",
    model: "meta-llama/llama-3.1-8b-instruct:free",
    modelLabel: "Llama 3.1 8B (free)",
    keyPlaceholder: "sk-or-…",
    keyLink: "https://openrouter.ai/keys",
    keyLinkLabel: "openrouter.ai",
    type: "openai-compat",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    extraHeaders: {
      "HTTP-Referer": "https://mcq-practice-studio.app",
      "X-Title": "MCQ Practice Studio",
    },
  },
};

export const PROVIDER_ORDER = ["groq", "gemini", "openai", "openrouter"];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract / normalise MCQs from ANY input text (questions in any format).
 * provider: one of the PROVIDERS values
 */
export async function extractMcqsWithAI(text, provider, apiKey) {
  validate(text, apiKey);
  const prompt = buildExtractPrompt(text.trim());
  const raw = await callProvider(prompt, provider, apiKey.trim());
  return parseJsonResponse(raw);
}

/**
 * Generate fresh MCQs from a plain paragraph / passage.
 */
export async function generateQuestionsViaAI(text, provider, apiKey, count = 5) {
  validate(text, apiKey);
  const prompt = buildGeneratePrompt(text.trim(), count);
  const raw = await callProvider(prompt, provider, apiKey.trim());
  return parseJsonResponse(raw);
}

/**
 * Quick heuristic: does the text look like it already contains MCQs?
 */
export function looksLikeMcqs(text) {
  const hits = (text.match(/^\s*\(?[A-D][.)]\)?[\s)]/gim) || []).length;
  return hits >= 4;
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

function buildExtractPrompt(text) {
  return `You are an expert MCQ extractor. The user has pasted text containing multiple-choice questions in ANY format (numbered, "QUESTION N" headers, markdown, HTML <details> blocks, bold answers like **C) text**, answer-key tables, etc.).

YOUR TASK:
- Extract EVERY question, regardless of format
- Identify the correct answer from ANY marker (✅, bold text, <details> block, answer key)
- Clean up question text (remove "QUESTION 3", "Q3.", "3." prefixes, HTML tags)
- Return ONLY valid JSON — no markdown fences, no explanation

REQUIRED JSON FORMAT:
{
  "questions": [
    {
      "question": "The question text",
      "options": [
        { "label": "A", "text": "first option" },
        { "label": "B", "text": "second option" },
        { "label": "C", "text": "third option" },
        { "label": "D", "text": "fourth option" }
      ],
      "correct": "C"
    }
  ]
}

RULES:
- "correct" is null if no answer found, otherwise "A"/"B"/"C"/"D"
- Always 4 options labelled A, B, C, D
- No explanation text inside question or option text
- Return ONLY the JSON object, nothing else

INPUT TEXT:
"""
${text}
"""`;
}

function buildGeneratePrompt(text, count) {
  return `You are an expert educator. Read the passage and create exactly ${count} multiple-choice questions testing comprehension.

Return ONLY this JSON (no markdown fences, no other text):
{
  "questions": [
    {
      "question": "Question text here",
      "options": [
        { "label": "A", "text": "first option" },
        { "label": "B", "text": "second option" },
        { "label": "C", "text": "third option" },
        { "label": "D", "text": "fourth option" }
      ],
      "correct": "B"
    }
  ]
}

Rules: exactly 4 options per question, "correct" is the right label, questions must be answerable from the passage, return ONLY JSON.

PASSAGE:
"""
${text}
"""`;
}

// ─── API Calls ────────────────────────────────────────────────────────────────

async function callProvider(prompt, provider, apiKey) {
  if (provider.type === "gemini") {
    return callGemini(prompt, provider, apiKey);
  }
  return callOpenAICompat(prompt, provider, apiKey);
}

async function callOpenAICompat(prompt, provider, apiKey) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...(provider.extraHeaders || {}),
  };

  const res = await fetch(provider.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.error?.message || ""; } catch { /* ignore */ }
    throw new Error(`${provider.name} API error ${res.status}${detail ? ": " + detail : ""}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error(`${provider.name} returned an empty response. Try again.`);
  return text;
}

async function callGemini(prompt, provider, apiKey) {
  const url = `${provider.endpoint}?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
    }),
  });

  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.error?.message || ""; } catch { /* ignore */ }
    throw new Error(`Gemini API error ${res.status}${detail ? ": " + detail : ""}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) throw new Error("Gemini returned an empty response. Try again.");
  return text;
}

// ─── JSON Parser ──────────────────────────────────────────────────────────────

function parseJsonResponse(raw) {
  let cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("AI did not return valid JSON. Please try again.");
  }
  cleaned = cleaned.slice(start, end + 1);

  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch { throw new Error("Could not parse AI response as JSON. Please try again."); }

  const questions = parsed?.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("AI returned JSON but found no questions inside.");
  }

  return questions.map((q, i) => ({
    id: i + 1,
    question: String(q.question || "").trim(),
    options: (q.options || []).map((o) => ({
      label: String(o.label || "").toUpperCase(),
      text: String(o.text || "").trim(),
    })),
    correct: q.correct ? String(q.correct).toUpperCase() : null,
  }));
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(text, apiKey) {
  if (!apiKey?.trim()) throw new Error("Please enter your API key in the Settings panel.");
  if (!text?.trim()) throw new Error("Please paste some content first.");
}
