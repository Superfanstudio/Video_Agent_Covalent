// OpenAI embeddings via OpenRouter (server-side only).

const URL = "https://openrouter.ai/api/v1/embeddings";
const MODEL = "openai/text-embedding-3-small"; // 1536-dim
const BATCH = 64;

function keyOf(env) {
  return env.VITE_OPENROUTER_API_KEY || env.OPENROUTER_API_KEY || "";
}

export function hasEmbeddingKey(env) {
  return Boolean(keyOf(env));
}

async function embedBatch(input, env) {
  const r = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${keyOf(env)}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://covalent.local",
      "X-Title": "Covalent Medical Admin",
    },
    body: JSON.stringify({ model: MODEL, input }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Embedding request failed (${r.status})`);
  return (j.data || []).sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// Embed an array of strings; batched to stay within request limits.
export async function embedTexts(texts, env) {
  if (!keyOf(env)) throw new Error("Missing OpenRouter API key (set VITE_OPENROUTER_API_KEY).");
  const list = Array.isArray(texts) ? texts : [texts];
  const out = [];
  for (let i = 0; i < list.length; i += BATCH) {
    out.push(...(await embedBatch(list.slice(i, i + BATCH), env)));
  }
  return out;
}

export async function embedOne(text, env) {
  return (await embedTexts([text], env))[0];
}

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
