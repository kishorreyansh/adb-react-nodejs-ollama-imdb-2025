// // src/components/movie-form.jsx
// import React, { useEffect, useState } from "react";

// export default function MovieForm({ movie, onSaved }) {
//   const [form, setForm] = useState({
//     ids: "",
//     title: "",
//     description: "",
//     year: "",
//     runtime: "",
//     rating: "",
//     votes: "",
//     revenue: "",
//     actorsText: "",
//     directorsText: "",
//     genresText: "",
//   });
//   const [loading, setLoading] = useState(false);
//   const [message, setMessage] = useState(null);

//   useEffect(() => {
//     if (movie) {
//       setForm({
//         ids: movie.ids || "",
//         title: movie.title || "",
//         description: movie.description || "",
//         year: movie.year ?? "",
//         runtime: movie.runtime ?? "",
//         rating: movie.rating ?? "",
//         votes: movie.votes ?? "",
//         revenue: movie.revenue ?? "",
//         actorsText: (movie.actors || []).map((a) => a.name).join(", "),
//         directorsText: (movie.directors || []).map((d) => d.name).join(", "),
//         genresText: (movie.genres || []).map((g) => g.type).join(", "),
//       });
//     } else {
//       setForm({
//         ids: "",
//         title: "",
//         description: "",
//         year: "",
//         runtime: "",
//         rating: "",
//         votes: "",
//         revenue: "",
//         actorsText: "",
//         directorsText: "",
//         genresText: "",
//       });
//     }
//     setMessage(null);
//   }, [movie]);

//   const handle = (k) => (e) =>
//     setForm((prev) => ({ ...prev, [k]: e.target.value }));

//   const parseList = (txt) =>
//     String(txt || "")
//       .split(",")
//       .map((s) => s.trim())
//       .filter(Boolean);

//   const save = async (e) => {
//     e && e.preventDefault();
//     setLoading(true);
//     setMessage(null);

//     try {
//       if (!form.ids || !form.title) throw new Error("Provide id and title");

//       // prepare payload for REST upsert
//       const payload = {
//         title: form.title || null,
//         description: form.description || null,
//         year: form.year === "" ? null : Number(form.year),
//         runtime: form.runtime === "" ? null : Number(form.runtime),
//         rating: form.rating === "" ? null : Number(form.rating),
//         votes: form.votes === "" ? null : Number(form.votes),
//         revenue: form.revenue === "" ? null : Number(form.revenue),
//         actors: parseList(form.actorsText),
//         directors: parseList(form.directorsText),
//         genres: parseList(form.genresText),
//       };

//       const base = import.meta.env.VITE_API_URL || "http://localhost:4000";
//       const url = `${base.replace(/\/$/, "")}/movies/${encodeURIComponent(
//         form.ids
//       )}`;

//       const resp = await fetch(url, {
//         method: "PUT",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify(payload),
//       });

//       if (!resp.ok) {
//         const txt = await resp.text();
//         throw new Error(`Update failed: ${resp.status} ${txt}`);
//       }

//       // success
//       setMessage("Saved successfully");
//       onSaved && onSaved();
//     } catch (err) {
//       setMessage("Error: " + (err.message || err));
//       console.warn("MovieForm save error:", err);
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <form onSubmit={save}>
//       <h3 style={{ marginTop: 0 }}>{movie ? "Edit Movie" : "Create Movie"}</h3>

//       <div className="field">
//         <label className="label">ID</label>
//         <input
//           className="input"
//           value={form.ids}
//           onChange={handle("ids")}
//           placeholder="unique id (e.g. id1)"
//           readOnly={!!movie}
//         />
//       </div>

//       <div className="field">
//         <label className="label">Title</label>
//         <input
//           className="input"
//           value={form.title}
//           onChange={handle("title")}
//           placeholder="Movie title"
//         />
//       </div>

//       <div className="field">
//         <label className="label">Description</label>
//         <textarea
//           className="input"
//           rows={3}
//           value={form.description}
//           onChange={handle("description")}
//         />
//       </div>

//       <div className="row">
//         <div className="col field">
//           <label className="label">Year</label>
//           <input
//             className="input"
//             value={form.year}
//             onChange={handle("year")}
//           />
//         </div>
//         <div className="col field">
//           <label className="label">Runtime (minutes)</label>
//           <input
//             className="input"
//             value={form.runtime}
//             onChange={handle("runtime")}
//           />
//         </div>
//         <div className="col field">
//           <label className="label">Rating</label>
//           <input
//             className="input"
//             value={form.rating}
//             onChange={handle("rating")}
//           />
//         </div>
//       </div>

//       <div className="row">
//         <div className="col field">
//           <label className="label">Votes</label>
//           <input
//             className="input"
//             value={form.votes}
//             onChange={handle("votes")}
//           />
//         </div>
//         <div className="col field">
//           <label className="label">Revenue</label>
//           <input
//             className="input"
//             value={form.revenue}
//             onChange={handle("revenue")}
//           />
//         </div>
//       </div>

//       <div className="field">
//         <label className="label">Actors (comma-separated)</label>
//         <input
//           className="input"
//           value={form.actorsText}
//           onChange={handle("actorsText")}
//           placeholder="Actor1, Actor2, ..."
//         />
//       </div>

//       <div className="field">
//         <label className="label">Directors (comma-separated)</label>
//         <input
//           className="input"
//           value={form.directorsText}
//           onChange={handle("directorsText")}
//           placeholder="Director1, Director2, ..."
//         />
//       </div>

//       <div className="field">
//         <label className="label">Genres (comma-separated)</label>
//         <input
//           className="input"
//           value={form.genresText}
//           onChange={handle("genresText")}
//           placeholder="Genre1, Genre2, ..."
//         />
//       </div>

//       <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
//         <button className="btn primary" type="submit" disabled={loading}>
//           {loading ? "Saving..." : "Save"}
//         </button>
//         <button
//           className="btn"
//           type="button"
//           onClick={() => {
//             if (movie) {
//               setForm({
//                 ids: movie.ids || "",
//                 title: movie.title || "",
//                 description: movie.description || "",
//                 year: movie.year ?? "",
//                 runtime: movie.runtime ?? "",
//                 rating: movie.rating ?? "",
//                 votes: movie.votes ?? "",
//                 revenue: movie.revenue ?? "",
//                 actorsText: (movie.actors || []).map((a) => a.name).join(", "),
//                 directorsText: (movie.directors || [])
//                   .map((d) => d.name)
//                   .join(", "),
//                 genresText: (movie.genres || []).map((g) => g.type).join(", "),
//               });
//             } else {
//               setForm({
//                 ids: "",
//                 title: "",
//                 description: "",
//                 year: "",
//                 runtime: "",
//                 rating: "",
//                 votes: "",
//                 revenue: "",
//                 actorsText: "",
//                 directorsText: "",
//                 genresText: "",
//               });
//             }
//             setMessage(null);
//           }}
//         >
//           Reset
//         </button>
//       </div>

//       {message && (
//         <div style={{ marginTop: 10 }} className="small">
//           {message}
//         </div>
//       )}
//     </form>
//   );
// }

// src/components/movie-form.jsx
import React, { useEffect, useState } from "react";

export default function MovieForm({ movie, onSaved }) {
  const [form, setForm] = useState({
    ids: "",
    title: "",
    description: "",
    year: "",
    runtime: "",
    rating: "",
    votes: "",
    revenue: "",
    actorsText: "",
    directorsText: "",
    genresText: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (movie) {
      setForm({
        ids: movie.ids || "",
        title: movie.title || "",
        description: movie.description || "",
        year: movie.year ?? "",
        runtime: movie.runtime ?? "",
        rating: movie.rating ?? "",
        votes: movie.votes ?? "",
        revenue: movie.revenue ?? "",
        actorsText: (movie.actors || []).map((a) => a.name).join(", "),
        directorsText: (movie.directors || []).map((d) => d.name).join(", "),
        genresText: (movie.genres || []).map((g) => g.type).join(", "),
      });
    } else {
      setForm({
        ids: "",
        title: "",
        description: "",
        year: "",
        runtime: "",
        rating: "",
        votes: "",
        revenue: "",
        actorsText: "",
        directorsText: "",
        genresText: "",
      });
    }
    setMessage(null);
  }, [movie]);

  const handle = (k) => (e) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const parseList = (txt) =>
    String(txt || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const toNumberOrNull = (v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const save = async (e) => {
    e && e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (!form.title) throw new Error("Title is required");

      const payload = {
        title: form.title || null,
        description: form.description || null,
        year: toNumberOrNull(form.year),
        runtime: toNumberOrNull(form.runtime),
        rating: toNumberOrNull(form.rating),
        votes: toNumberOrNull(form.votes),
        revenue: toNumberOrNull(form.revenue),
        actors: parseList(form.actorsText),
        directors: parseList(form.directorsText),
        genres: parseList(form.genresText),
      };

      const base = import.meta.env.VITE_API_URL || "http://localhost:4000";
      const baseUrl = base.replace(/\/$/, "");

      if (movie) {
        // EDIT: use PUT /movies/:id (unchanged behavior)
        const resp = await fetch(
          `${baseUrl}/movies/${encodeURIComponent(form.ids)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );

        if (!resp.ok) {
          const txt = await resp.text();
          throw new Error(`Update failed: ${resp.status} ${txt}`);
        }

        setMessage("Saved successfully");
        onSaved && onSaved();
      } else {
        // CREATE: call POST /movies which will auto-generate next id
        const resp = await fetch(`${baseUrl}/movies`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const txt = await resp.text();
          throw new Error(`Create failed: ${resp.status} ${txt}`);
        }

        const json = await resp.json();
        const newId = json && json.ids ? json.ids : null;
        setMessage(newId ? `Created (id: ${newId})` : "Created successfully");
        onSaved && onSaved();
      }
    } catch (err) {
      setMessage("Error: " + (err.message || err));
      console.warn("MovieForm save error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={save}>
      <h3 style={{ marginTop: 0 }}>{movie ? "Edit Movie" : "Create Movie"}</h3>

      {/* IDs: show only when editing (read-only). Removed from create form. */}
      {/* {movie && (
        <div className="field">
          <label className="label">ID (read-only)</label>
          <input className="input" value={form.ids} readOnly />
        </div>
      )} */}

      <div className="field">
        <label className="label">Title</label>
        <input
          className="input"
          value={form.title}
          onChange={handle("title")}
          placeholder="Movie title"
        />
      </div>

      <div className="field">
        <label className="label">Description</label>
        <textarea
          className="input"
          rows={3}
          value={form.description}
          onChange={handle("description")}
        />
      </div>

      <div className="row">
        <div className="col field">
          <label className="label">Year</label>
          <input
            className="input"
            value={form.year}
            onChange={handle("year")}
          />
        </div>
        <div className="col field">
          <label className="label">Runtime (minutes)</label>
          <input
            className="input"
            value={form.runtime}
            onChange={handle("runtime")}
          />
        </div>
        <div className="col field">
          <label className="label">Rating</label>
          <input
            className="input"
            value={form.rating}
            onChange={handle("rating")}
          />
        </div>
      </div>

      <div className="row">
        <div className="col field">
          <label className="label">Votes</label>
          <input
            className="input"
            value={form.votes}
            onChange={handle("votes")}
          />
        </div>
        <div className="col field">
          <label className="label">Revenue</label>
          <input
            className="input"
            value={form.revenue}
            onChange={handle("revenue")}
          />
        </div>
      </div>

      <div className="field">
        <label className="label">Actors (comma-separated)</label>
        <input
          className="input"
          value={form.actorsText}
          onChange={handle("actorsText")}
          placeholder="Actor1, Actor2, ..."
        />
      </div>

      <div className="field">
        <label className="label">Directors (comma-separated)</label>
        <input
          className="input"
          value={form.directorsText}
          onChange={handle("directorsText")}
          placeholder="Director1, Director2, ..."
        />
      </div>

      <div className="field">
        <label className="label">Genres (comma-separated)</label>
        <input
          className="input"
          value={form.genresText}
          onChange={handle("genresText")}
          placeholder="Genre1, Genre2, ..."
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? "Saving..." : movie ? "Save" : "Create"}
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => {
            if (movie) {
              setForm({
                ids: movie.ids || "",
                title: movie.title || "",
                description: movie.description || "",
                year: movie.year ?? "",
                runtime: movie.runtime ?? "",
                rating: movie.rating ?? "",
                votes: movie.votes ?? "",
                revenue: movie.revenue ?? "",
                actorsText: (movie.actors || []).map((a) => a.name).join(", "),
                directorsText: (movie.directors || [])
                  .map((d) => d.name)
                  .join(", "),
                genresText: (movie.genres || []).map((g) => g.type).join(", "),
              });
            } else {
              setForm({
                ids: "",
                title: "",
                description: "",
                year: "",
                runtime: "",
                rating: "",
                votes: "",
                revenue: "",
                actorsText: "",
                directorsText: "",
                genresText: "",
              });
            }
            setMessage(null);
          }}
        >
          Reset
        </button>
      </div>

      {message && (
        <div style={{ marginTop: 10 }} className="small">
          {message}
        </div>
      )}
    </form>
  );
}
