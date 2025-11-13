// seed.js
import fs from "node:fs";
import path from "node:path";
import csv from "csv-parser";
import neo4j from "neo4j-driver";
import dotenv from "dotenv";

dotenv.config();

const CSV_FILE =
  process.env.CSV_FILE ||
  path.join(process.cwd(), "data", "IMDB-Movie-Data.csv");
const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USER = process.env.NEO4J_USER;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;
const BATCH_SIZE = Number.parseInt(process.env.SEED_BATCH_SIZE || "100", 10); // number of CSV rows per DB batch

if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
  console.error("Set NEO4J_URI, NEO4J_USER and NEO4J_PASSWORD in .env");
  process.exit(1);
}

if (!fs.existsSync(CSV_FILE)) {
  console.error("CSV file not found at", CSV_FILE);
  process.exit(1);
}

const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
);

async function ensureConstraints(session) {
  try {
    await session.executeWrite((tx) =>
      tx.run(`
        CREATE CONSTRAINT movie_ids_unique IF NOT EXISTS
        FOR (m:Movie) REQUIRE (m.ids) IS UNIQUE;
      `)
    );
    await session.executeWrite((tx) =>
      tx.run(`
        CREATE CONSTRAINT actor_name_unique IF NOT EXISTS
        FOR (a:Actor) REQUIRE (a.name) IS UNIQUE;
      `)
    );
    await session.executeWrite((tx) =>
      tx.run(`
        CREATE CONSTRAINT director_name_unique IF NOT EXISTS
        FOR (d:Director) REQUIRE (d.name) IS UNIQUE;
      `)
    );
    await session.executeWrite((tx) =>
      tx.run(`
        CREATE CONSTRAINT genre_type_unique IF NOT EXISTS
        FOR (g:Genre) REQUIRE (g.type) IS UNIQUE;
      `)
    );
    console.log("Constraints created/verified.");
  } catch (err) {
    console.warn(
      "Constraint creation warning (may be older Neo4j):",
      err.message
    );
  }
}

/**
 * Normalize/parse a CSV row into a JS object suitable for sending to Cypher.
 * actors/directors/genres become arrays (possibly empty).
 */
function normalizeRow(row) {
  // helper: handle multiple possible headers and trim
  const pick = (...keys) => {
    for (const k of keys) {
      if (row[k] !== undefined) return row[k];
    }
    return "";
  };

  const ids = String(pick("Ids", "ids", "Id", "ID", "id") || "").trim();
  const title = (pick("Title", "title") || "Untitled").trim();
  const desc = (pick("Description", "description") || "").trim();

  const parseIntSafe = (v) => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };
  const parseFloatSafe = (v) => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  const year = parseIntSafe(pick("Year", "year"));
  const runtime = parseIntSafe(pick("Runtime (Minutes)", "Runtime", "runtime"));
  const rating = parseFloatSafe(pick("Rating", "rating"));
  const votes = parseIntSafe(pick("Votes", "votes"));
  const revenue = parseFloatSafe(
    pick("Revenue (Millions)", "Revenue", "revenue")
  );

  const splitAndTrim = (cell) => {
    if (!cell) return [];
    return String(cell)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const actors = splitAndTrim(pick("Actors", "actors"));
  const directors = splitAndTrim(pick("Director", "director", "Directors"));
  const genres = splitAndTrim(pick("Genre", "genre", "Genres"));

  return {
    ids,
    title,
    desc,
    year,
    runtime,
    rating,
    votes,
    revenue,
    actors,
    directors,
    genres,
  };
}

async function run() {
  const rows = [];
  console.log("Reading CSV:", CSV_FILE);

  await new Promise((resolve, reject) => {
    fs.createReadStream(CSV_FILE)
      .pipe(csv())
      .on("data", (data) => {
        rows.push(normalizeRow(data));
      })
      .on("end", () => resolve())
      .on("error", (err) => reject(err));
  });

  console.log(
    `Read ${rows.length} rows. Starting batched insert with batch size ${BATCH_SIZE}...`
  );

  const session = driver.session();
  try {
    await ensureConstraints(session);

    // NOTE: moved the final count outside of the UNWIND block so it returns a meaningful value.
    const cypher = `
      UNWIND $batch AS r
      MERGE (m:Movie {ids: r.ids})
      SET m.title = r.title,
          m.description = r.desc,
          m.year = r.year,
          m.runtime = r.runtime,
          m.rating = r.rating,
          m.votes = r.votes,
          m.revenue = r.revenue
      WITH m, r
      // actors: only proceed if list not empty
      FOREACH (actorName IN CASE WHEN size(r.actors) = 0 THEN [] ELSE r.actors END |
        MERGE (a:Actor {name: actorName})
        MERGE (a)-[:ACTED_IN]->(m)
      )
      WITH m, r
      FOREACH (dirName IN CASE WHEN size(r.directors) = 0 THEN [] ELSE r.directors END |
        MERGE (d:Director {name: dirName})
        MERGE (d)-[:DIRECTED]->(m)
      )
      WITH m, r
      FOREACH (genreName IN CASE WHEN size(r.genres) = 0 THEN [] ELSE r.genres END |
        MERGE (g:Genre {type: genreName})
        MERGE (m)-[:IN]->(g)
      )
      // collect distinct movies that were processed in this batch and return the batch size
      WITH collect(DISTINCT m) AS ms
      RETURN size(ms) AS moviesCreated;
    `;

    // chunk rows into batches
    let totalInsertedMovies = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      const params = { batch };

      const result = await session.executeWrite((tx) => tx.run(cypher, params));
      let moviesCreated = 0;
      if (result.records && result.records.length > 0) {
        const val = result.records[0].get("moviesCreated");
        // convert neo4j Integer -> JS number safely
        moviesCreated =
          val && typeof val.toNumber === "function"
            ? val.toNumber()
            : Number(val) || 0;
      }

      totalInsertedMovies += moviesCreated;

      console.log(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1} inserted (${
          batch.length
        } rows). Movies created/updated in this batch: ${moviesCreated}. Total movies so far (sum of batches): ${totalInsertedMovies}`
      );
    }

    // Final verification: query DB counts and print human-readable numbers
    const countsRes = await session.run(`
      MATCH (m:Movie)
      MATCH (a:Actor)
      MATCH (d:Director)
      MATCH (g:Genre)
      RETURN count(DISTINCT m) AS movies, count(DISTINCT a) AS actors, count(DISTINCT d) AS directors, count(DISTINCT g) AS genres
    `);
    const rec = countsRes.records[0].toObject();
    const finalMovies = rec.movies.toNumber();
    const finalActors = rec.actors.toNumber();
    const finalDirectors = rec.directors.toNumber();
    const finalGenres = rec.genres.toNumber();

    console.log("Seeding complete.");
    console.log(
      `Final totals in DB -> movies: ${finalMovies}, actors: ${finalActors}, directors: ${finalDirectors}, genres: ${finalGenres}`
    );
  } catch (err) {
    console.error("Seeding error:", err);
  } finally {
    await session.close();
    await driver.close();
    process.exit(0);
  }
}

run().catch((err) => {
  console.error("Fatal seed error:", err);
  process.exit(1);
});
