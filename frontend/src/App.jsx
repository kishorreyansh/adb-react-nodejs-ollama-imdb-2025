// src/App.jsx
import React, { useState } from "react";
import MovieList from "./components/movie-list";
import MovieForm from "./components/movie-form";
import NLQuery from "./components/nl-query";
import "./styles.css";

export default function App() {
  const [view, setView] = useState("list"); // list | form | nl
  const [editingMovie, setEditingMovie] = useState(null);

  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <div className="logo">IMDB</div>
          <div>
            <div className="title">Movie Manager</div>
            <div className="subtitle">Clean UI • GraphQL + Ollama backend</div>
          </div>
        </div>

        <nav className="nav">
          <button
            className={`btn ${view === "list" ? "" : "ghost"}`}
            onClick={() => {
              setView("list");
              setEditingMovie(null);
            }}
          >
            Browse
          </button>
          <button
            className={`btn ${view === "form" ? "primary" : ""}`}
            onClick={() => {
              setView("form");
              setEditingMovie(null);
            }}
          >
            Create
          </button>
          <button
            className={`btn ${view === "update" ? "primary" : ""}`}
            onClick={() => {
              if (!editingMovie) {
                alert("Pick a movie from Browse to update");
                setView("list");
                return;
              }
              setView("update");
            }}
          >
            Update
          </button>
          <button
            className="btn"
            onClick={() => {
              if (!editingMovie) {
                alert("Pick a movie from Browse to delete");
                setView("list");
                return;
              }
              if (!confirm("Delete selected movie?")) return;
            }}
          >
            Delete
          </button>
          <button className="btn" onClick={() => setView("nl")}>
            Natural Language
          </button>
        </nav>
      </header>

      <main style={{ marginTop: 8 }}>
        {/* make this card the only scrolling area */}
        <section
          className="card card-scroll"
          style={{ maxWidth: "100%", width: "100%" }}
        >
          {view === "list" && (
            <MovieList
              onEdit={(m) => {
                setEditingMovie(m);
                setView("update");
              }}
            />
          )}

          {(view === "form" || view === "update") && (
            <MovieForm
              movie={editingMovie}
              onSaved={() => {
                setView("list");
                setEditingMovie(null);
              }}
            />
          )}

          {view === "nl" && <NLQuery />}
        </section>
      </main>
    </div>
  );
}
