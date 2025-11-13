// src/api.js  (diagnostic-friendly, no functional changes)
const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";

async function safeParseResponse(res) {
  const txt = await res.text();
  try {
    return JSON.parse(txt);
    // eslint-disable-next-line no-unused-vars
  } catch (e) {
    return { __rawText: txt, __status: res.status, __ok: res.ok };
  }
}

async function fetchWithInfo(url, opts) {
  try {
    const r = await fetch(url, opts);
    return r;
  } catch (err) {
    // network-level failure (DNS/refused/blocked)
    // throw an Error with clear information for debugging.
    throw new Error(
      `Network error while fetching ${url} — ${err.message || err}`
    );
  }
}

export async function graphqlFetch(query, variables = {}) {
  const url = `${BASE.replace(/\/$/, "")}/graphql`;
  const opts = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  };

  const res = await fetchWithInfo(url, opts);

  const parsed = await safeParseResponse(res);
  if (!res.ok) {
    const err = parsed?.errors
      ? parsed.errors
      : parsed.__rawText || `HTTP ${res.status}`;
    throw new Error(typeof err === "string" ? err : JSON.stringify(err));
  }

  if (parsed.__rawText)
    throw new Error(
      "Unexpected non-JSON response from GraphQL: " +
        parsed.__rawText.slice(0, 200)
    );
  if (parsed.errors) throw new Error(JSON.stringify(parsed.errors));
  return parsed.data;
}

export async function llmNL(nl) {
  const url = `${(
    import.meta.env.VITE_API_URL || "http://localhost:4000"
  ).replace(/\/$/, "")}/api/llm`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nl }),
  });
  if (!r.ok) throw new Error("LLM request failed: " + r.status);
  const j = await r.json();
  return j.output;
}
