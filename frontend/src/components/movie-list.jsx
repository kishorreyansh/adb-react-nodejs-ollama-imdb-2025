// src/components/movie-list.jsx
import React, { useEffect, useRef, useState } from "react";
import { graphqlFetch } from "../api";

export default function MovieList({ onEdit }) {
  const [movies, setMovies] = useState([]);
  const [displayed, setDisplayed] = useState([]); // filtered view
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const inFlight = useRef(false);
  const lastLoadTs = useRef(0);

  const idValue = (id) => {
    if (!id) return Number.MAX_SAFE_INTEGER;
    const m = String(id).match(/(\d+)/);
    return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
  };

  const normalizeIdInput = (s) => {
    if (s == null) return "";
    return String(s).trim();
  };

  const load = async (opts = { force: false }) => {
    if (inFlight.current && !opts.force) return;
    const now = Date.now();
    if (!opts.force && now - lastLoadTs.current < 500) return;
    lastLoadTs.current = now;

    inFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      const data = await graphqlFetch(`
        query {
          movies {
            ids
            title
            description
            year
            runtime
            rating
            votes
            revenue
            actors { name }
            directors { name }
            genres { type }
          }
        }
      `);

      let list = Array.isArray(data.movies) ? data.movies : [];
      list.sort((a, b) => idValue(a.ids) - idValue(b.ids));
      setMovies(list);
      // apply current query to the freshly loaded list
      applyFilter(list, query);
    } catch (err) {
      const m = String(err.message || err);
      setError(m.length > 2000 ? m.slice(0, 2000) + "…" : m);
      console.warn("MovieList load error:", err);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // apply filter to a provided list (or current movies when list omitted)
  const applyFilter = (list = null, q = query) => {
    const src = Array.isArray(list) ? list : movies;
    const trimmed = String(q || "").trim();
    if (trimmed === "") {
      setDisplayed(src);
      return;
    }

    const qLower = trimmed.toLowerCase();

    // match ids exactly either 'id123' or '123'
    const normalized = normalizeIdInput(trimmed);
    const idCandidates = new Set();
    if (/^\d+$/.test(normalized)) {
      idCandidates.add(normalized); // e.g. "1001"
      idCandidates.add(`id${normalized}`); // e.g. "id1001"
    } else if (/^id\d+$/i.test(normalized)) {
      idCandidates.add(normalized);
      const digits = normalized.match(/\d+/)[0];
      idCandidates.add(digits);
    }

    const filtered = src.filter((m) => {
      // exact id match takes precedence
      if (m.ids && idCandidates.size > 0) {
        if (idCandidates.has(String(m.ids))) return true;
      }
      // title contains match (case-insensitive)
      if (m.title && String(m.title).toLowerCase().includes(qLower))
        return true;
      // fallback: match description too
      if (m.description && String(m.description).toLowerCase().includes(qLower))
        return true;
      return false;
    });

    setDisplayed(filtered);
  };

  // when query changes (typing), just update state; actual filtering runs on Search/Enter
  const onQueryChange = (e) => setQuery(e.target.value);

  const onSearch = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    applyFilter(undefined, query);
  };

  const onClear = () => {
    setQuery("");
    setDisplayed(movies);
  };

  // remove: now deterministic REST primary (keeps existing behavior)
  const remove = async (id) => {
    if (!confirm("Delete this movie?")) return;

    try {
      const base = import.meta.env.VITE_API_URL || "http://localhost:4000";
      const resp = await fetch(
        `${base.replace(/\/$/, "")}/movies/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: { Accept: "application/json" },
        }
      );

      if (resp.ok) {
        const json = await resp.json();
        if (json.ok) {
          await load({ force: true });
          return;
        } else {
          console.warn("REST delete returned: ", json);
        }
      } else {
        const txt = await resp.text();
        console.warn("REST delete non-ok:", resp.status, txt.slice(0, 300));
      }
    } catch (restErr) {
      console.warn("REST delete failed, will try GraphQL fallback:", restErr);
    }

    try {
      await graphqlFetch(
        `mutation { deleteMovies(where: { ids: "${id}" }) { nodesDeleted } }`
      );
      await load({ force: true });
    } catch (gErr) {
      alert("Delete failed: " + String(gErr.message || gErr));
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 6px 0" }}>Movies</h2>
          <div className="small">Showing all movies (sorted by ID)</div>
        </div>

        {/* Search + Refresh controls */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <form
            onSubmit={onSearch}
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            <input
              value={query}
              onChange={onQueryChange}
              placeholder="Search by id or title (press Enter or Search)"
              className="input"
              style={{ width: 300, padding: "6px 8px" }}
              aria-label="Search movies"
            />
            <button className="btn" type="submit" disabled={inFlight.current}>
              Search
            </button>
            <button className="btn ghost" type="button" onClick={onClear}>
              Clear
            </button>
          </form>

          <button
            className="btn ghost"
            onClick={() => load()}
            disabled={inFlight.current}
            title={inFlight.current ? "Request in flight" : "Refresh"}
            style={{ marginLeft: 8 }}
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && <div className="small">Loading…</div>}
      {error && (
        <div
          style={{ color: "salmon", whiteSpace: "pre-wrap", marginBottom: 12 }}
        >
          {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ overflowX: "auto" }}>
          <table className="table wide" role="table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Description</th>
                <th>Year</th>
                <th>Runtime</th>
                <th>Rating</th>
                <th>Votes</th>
                <th>Revenue</th>
                <th>Actors</th>
                <th>Directors</th>
                <th>Genres</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(displayed || []).map((m) => (
                <tr key={m.ids}>
                  <td>{m.ids}</td>
                  <td style={{ fontWeight: 600 }}>{m.title}</td>
                  <td style={{ maxWidth: 260, whiteSpace: "normal" }}>
                    {m.description || "-"}
                  </td>
                  <td>{m.year ?? "-"}</td>
                  <td>{m.runtime ?? "-"}</td>
                  <td>{m.rating ?? "-"}</td>
                  <td>{m.votes ?? "-"}</td>
                  <td>{m.revenue ?? "-"}</td>
                  <td>
                    {(m.actors || []).map((a) => a.name).join(", ") || "-"}
                  </td>
                  <td>
                    {(m.directors || []).map((d) => d.name).join(", ") || "-"}
                  </td>
                  <td>
                    {(m.genres || []).map((g) => g.type).join(", ") || "-"}
                  </td>
                  <td>
                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        alignItems: "center",
                      }}
                    >
                      <button className="btn" onClick={() => onEdit(m)}>
                        Edit
                      </button>

                      <button
                        className="btn"
                        onClick={() => remove(m.ids)}
                        style={{
                          background: "linear-gradient(90deg,#ff7b7b,#ff4b4b)",
                          color: "#04142b",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {(!displayed || displayed.length === 0) && (
                <tr>
                  <td colSpan={12} className="small">
                    No movies found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
