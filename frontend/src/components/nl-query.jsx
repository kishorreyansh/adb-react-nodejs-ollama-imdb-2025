/* eslint-disable no-unused-vars */
// src/components/nl-query.jsx
import React, { useState } from "react";

export default function NLQuery() {
  const [nl, setNl] = useState("");
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState(null);

  const runQuery = async (e) => {
    e && e.preventDefault();
    setLoading(true);
    setError(null);
    setOutput("");

    try {
      const base = import.meta.env.VITE_API_URL || "http://127.0.0.1:4000"; //127.0.0.1 instead of this give local host in othercase
      const resp = await fetch(`${base.replace(/\/$/, "")}/api/llm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nl }),
      });

      const text = await resp.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (parseErr) {
        // If server doesn't return JSON, show raw text as output
        if (!resp.ok) {
          throw new Error(
            `Server error: ${resp.status} ${text.slice(0, 2000)}`
          );
        }
        setOutput(text);
        return;
      }

      // Backend returns at least { output: "<string>" }
      setOutput(json.output ?? "");

      if (!resp.ok) {
        // If server signaled error, throw to show message
        throw new Error(`Server error: ${resp.status} ${json.output || text}`);
      }
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setNl("");
    setOutput("");
    setError(null);
  };

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Natural Language Query</h3>

      <form onSubmit={runQuery}>
        <div className="field">
          <label className="label">Ask (natural language)</label>
          <textarea
            className="input"
            rows={4}
            value={nl}
            onChange={(e) => setNl(e.target.value)}
            placeholder="e.g. Show the movie with id 10, or List top 5 movies with rating > 8"
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button
            className="btn primary"
            type="submit"
            disabled={loading || !nl.trim()}
          >
            {loading ? "Running…" : "Ask"}
          </button>
          <button type="button" className="btn" onClick={clear}>
            Clear
          </button>
        </div>
      </form>

      <div>
        {loading && <div className="small">Loading…</div>}

        {error && (
          <div style={{ color: "salmon", whiteSpace: "pre-wrap" }}>{error}</div>
        )}

        {!loading && !error && (
          <pre
            style={{
              background: "#0f1724",
              color: "#e6eef8",
              padding: 12,
              borderRadius: 8,
              maxHeight: "60vh",
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {output || "No output yet."}
          </pre>
        )}
      </div>
    </div>
  );
}
