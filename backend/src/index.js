import express from "express";
import cors from "cors";
import { ApolloServer } from "apollo-server-express";
import { Neo4jGraphQL } from "@neo4j/graphql";
import neo4j from "neo4j-driver";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { parse, validate } from "graphql";

dotenv.config();

const {
  NEO4J_URI,
  NEO4J_USER,
  NEO4J_PASSWORD,
  PORT = 4000,
  OLLAMA_HOST = "http://localhost:11434",
  OLLAMA_MODEL = "phi3",
} = process.env;

if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
  console.error("NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD must be set in .env");
  process.exit(1);
}

const typeDefs = `
type Movie @node(labels: ["Movie"]) {
  ids: ID! @id
  title: String!
  description: String
  year: Int
  runtime: Int
  rating: Float
  votes: Int
  revenue: Float
  actors: [Actor!]! @relationship(type: "ACTED_IN", direction: IN)
  directors: [Director!]! @relationship(type: "DIRECTED", direction: IN)
  genres: [Genre!]! @relationship(type: "IN", direction: OUT)
}
type Actor @node(labels: ["Actor"]) {
  name: ID! @id
  movies: [Movie!]! @relationship(type: "ACTED_IN", direction: OUT)
}
type Director @node(labels: ["Director"]) {
  name: ID! @id
  movies: [Movie!]! @relationship(type: "DIRECTED", direction: OUT)
}
type Genre @node(labels: ["Genre"]) {
  type: ID! @id
  movies: [Movie!]! @relationship(type: "IN", direction: IN)
}
`;

async function ensureConstraints(driver) {
  const session = driver.session();
  try {
    await session.executeWrite((tx) =>
      tx.run(
        `CREATE CONSTRAINT movie_ids_unique IF NOT EXISTS FOR (m:Movie) REQUIRE (m.ids) IS UNIQUE;`
      )
    );
    await session.executeWrite((tx) =>
      tx.run(
        `CREATE CONSTRAINT actor_name_unique IF NOT EXISTS FOR (a:Actor) REQUIRE (a.name) IS UNIQUE;`
      )
    );
    await session.executeWrite((tx) =>
      tx.run(
        `CREATE CONSTRAINT director_name_unique IF NOT EXISTS FOR (d:Director) REQUIRE (d.name) IS UNIQUE;`
      )
    );
    await session.executeWrite((tx) =>
      tx.run(
        `CREATE CONSTRAINT genre_type_unique IF NOT EXISTS FOR (g:Genre) REQUIRE (g.type) IS UNIQUE;`
      )
    );
    console.log("Constraints ensured (if supported by server).");
  } catch (e) {
    console.warn("Constraint creation warning:", e.message);
  } finally {
    await session.close();
  }
}

async function start() {
  // create driver once
  const driver = neo4j.driver(
    NEO4J_URI,
    neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
  );

  // ensure constraints
  await ensureConstraints(driver);

  // build Neo4j GraphQL schema
  const neoSchema = new Neo4jGraphQL({ typeDefs, driver });
  const schema = await neoSchema.getSchema();

  const app = express();

  // dev-friendly CORS (adjust origin list in production)
  app.use(
    cors({
      origin: (o, cb) => cb(null, true),
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    })
  );

  // short-circuit preflight OPTIONS so body parser isn't invoked for them
  app.use((req, res, next) => {
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // lightweight request logger (concise)
  app.use((req, res, next) => {
    if (req.path === "/health") return next();
    console.log(
      `[REQ] ${req.method} ${req.path} content-type=${
        req.headers["content-type"] || "-"
      } content-length=${req.headers["content-length"] || 0}`
    );
    next();
  });

  // Apollo server mounts GraphQL at /graphql and manages raw body parsing for that route
  const apolloServer = new ApolloServer({
    schema,
    context: ({ req }) => ({ driver, req }),
  });
  await apolloServer.start();
  apolloServer.applyMiddleware({ app, path: "/graphql" });

  // health
  app.get("/health", (req, res) => res.json({ ok: true, time: Date.now() }));

  // PUT /movies/:id  -> upsert scalars + relationships (coerce numeric fields properly)
  app.put(
    "/movies/:id",
    express.json({ limit: "1mb", strict: false }),
    async (req, res) => {
      const { id } = req.params;
      if (!id)
        return res.status(400).json({ error: "Missing movie id in path" });

      const {
        title = null,
        description = null,
        year = null,
        runtime = null,
        rating = null,
        votes = null,
        revenue = null,
        actors = [],
        directors = [],
        genres = [],
      } = req.body || {};

      const session = driver.session();
      try {
        const cypher = `
      MERGE (m:Movie { ids: $id })
      SET
        m.title = $title,
        m.description = $description,
        m.year = CASE WHEN $year IS NULL THEN NULL ELSE toInteger($year) END,
        m.runtime = CASE WHEN $runtime IS NULL THEN NULL ELSE toInteger($runtime) END,
        m.rating = CASE WHEN $rating IS NULL THEN NULL ELSE toFloat($rating) END,
        m.votes = CASE WHEN $votes IS NULL THEN NULL ELSE toInteger($votes) END,
        m.revenue = CASE WHEN $revenue IS NULL THEN NULL ELSE toFloat($revenue) END
      WITH m

      OPTIONAL MATCH (a:Actor)-[ra:ACTED_IN]->(m)
      OPTIONAL MATCH (d:Director)-[rd:DIRECTED]->(m)
      OPTIONAL MATCH (m)-[rg:IN]->(g:Genre)
      DELETE ra, rd, rg
      WITH m

      FOREACH (name IN coalesce($actors,[]) |
        MERGE (a2:Actor { name: name })
        MERGE (a2)-[:ACTED_IN]->(m)
      )

      FOREACH (name IN coalesce($directors,[]) |
        MERGE (d2:Director { name: name })
        MERGE (d2)-[:DIRECTED]->(m)
      )

      FOREACH (gt IN coalesce($genres,[]) |
        MERGE (g2:Genre { type: gt })
        MERGE (m)-[:IN]->(g2)
      )

      RETURN m.ids AS ids
    `;

        const params = {
          id,
          title,
          description,
          year: year === "" ? null : year,
          runtime: runtime === "" ? null : runtime,
          rating: rating === "" ? null : rating,
          votes: votes === "" ? null : votes,
          revenue: revenue === "" ? null : revenue,
          actors: Array.isArray(actors) ? actors : [],
          directors: Array.isArray(directors) ? directors : [],
          genres: Array.isArray(genres) ? genres : [],
        };

        const result = await session.executeWrite((tx) =>
          tx.run(cypher, params)
        );
        const rec = result.records && result.records[0];
        const retId = rec ? rec.get("ids") : id;

        return res.json({ ok: true, ids: retId });
      } catch (err) {
        console.error("PUT /movies/:id error:", err);
        return res.status(500).json({ error: err.message || String(err) });
      } finally {
        await session.close();
      }
    }
  );

  app.post(
    "/movies",
    express.json({ limit: "1mb", strict: false }),
    async (req, res) => {
      const {
        title = null,
        description = null,
        year = null,
        runtime = null,
        rating = null,
        votes = null,
        revenue = null,
        actors = [],
        directors = [],
        genres = [],
      } = req.body || {};

      if (!title) return res.status(400).json({ error: "title is required" });

      const session = driver.session();
      try {
        // find highest numeric id for numeric-only IDs and for 'id' prefixed IDs.
        const nextRes = await session.executeRead((tx) =>
          tx.run(`
      CALL {
        MATCH (m:Movie)
        WHERE m.ids IS NOT NULL AND m.ids =~ '^[0-9]+$'
        RETURN max(toInteger(m.ids)) AS maxNumDigits
      }
      CALL {
        MATCH (m:Movie)
        WHERE m.ids IS NOT NULL AND m.ids STARTS WITH 'id'
        RETURN max(toInteger(replace(m.ids, 'id', ''))) AS maxIdPref
      }
      RETURN coalesce(maxNumDigits, 0) AS maxNumDigits, coalesce(maxIdPref, 0) AS maxIdPref
    `)
        );

        const rec = nextRes.records && nextRes.records[0];
        const maxNumDigits = rec
          ? rec.get("maxNumDigits") &&
            typeof rec.get("maxNumDigits").toNumber === "function"
            ? rec.get("maxNumDigits").toNumber()
            : Number(rec.get("maxNumDigits"))
          : 0;
        const maxIdPref = rec
          ? rec.get("maxIdPref") &&
            typeof rec.get("maxIdPref").toNumber === "function"
            ? rec.get("maxIdPref").toNumber()
            : Number(rec.get("maxIdPref"))
          : 0;

        const nextNum = Math.max(maxNumDigits, maxIdPref) + 1;

        // choose id format: numeric-only if numeric ids already present (maxNumDigits >= maxIdPref),
        // otherwise use 'id<nextNum>' format
        const useNumeric =
          (maxNumDigits >= maxIdPref && maxNumDigits > 0) ||
          (maxNumDigits > 0 && maxIdPref === 0);
        const newId = useNumeric ? `${nextNum}` : `id${nextNum}`;

        // create node + relationships with numeric coercion for fields
        const cypher = `
      CREATE (m:Movie { ids: $id })
      SET
        m.title = $title,
        m.description = $description,
        m.year = CASE WHEN $year IS NULL THEN NULL ELSE toInteger($year) END,
        m.runtime = CASE WHEN $runtime IS NULL THEN NULL ELSE toInteger($runtime) END,
        m.rating = CASE WHEN $rating IS NULL THEN NULL ELSE toFloat($rating) END,
        m.votes = CASE WHEN $votes IS NULL THEN NULL ELSE toInteger($votes) END,
        m.revenue = CASE WHEN $revenue IS NULL THEN NULL ELSE toFloat($revenue) END
      WITH m
      FOREACH (name IN coalesce($actors,[]) |
        MERGE (a:Actor { name: name })
        MERGE (a)-[:ACTED_IN]->(m)
      )
      FOREACH (name IN coalesce($directors,[]) |
        MERGE (d:Director { name: name })
        MERGE (d)-[:DIRECTED]->(m)
      )
      FOREACH (gt IN coalesce($genres,[]) |
        MERGE (g:Genre { type: gt })
        MERGE (m)-[:IN]->(g)
      )
      RETURN m.ids AS ids
    `;

        const params = {
          id: newId,
          title,
          description,
          year: year === "" ? null : year,
          runtime: runtime === "" ? null : runtime,
          rating: rating === "" ? null : rating,
          votes: votes === "" ? null : votes,
          revenue: revenue === "" ? null : revenue,
          actors: Array.isArray(actors) ? actors : [],
          directors: Array.isArray(directors) ? directors : [],
          genres: Array.isArray(genres) ? genres : [],
        };

        const result = await session.executeWrite((tx) =>
          tx.run(cypher, params)
        );
        const createdRec = result.records && result.records[0];
        const createdId = createdRec ? createdRec.get("ids") : newId;

        return res.status(201).json({ ok: true, ids: createdId });
      } catch (err) {
        console.error("POST /movies error:", err);
        return res.status(500).json({ error: err.message || String(err) });
      } finally {
        await session.close();
      }
    }
  );

  app.post(
    "/movies/:id/relationships",
    express.json({ limit: "1mb", strict: false }),
    async (req, res) => {
      const { id } = req.params;
      const { actors = [], directors = [], genres = [] } = req.body || {};

      if (!id) return res.status(400).json({ error: "Missing id in path" });

      const session = driver.session();
      try {
        // verify movie exists
        const check = await session.executeRead((tx) =>
          tx.run("MATCH (m:Movie{ids:$id}) RETURN count(m) AS c", { id })
        );
        const rec = check.records && check.records[0];
        const count =
          rec && rec.get
            ? rec.get("c") && typeof rec.get("c").toNumber === "function"
              ? rec.get("c").toNumber()
              : Number(rec.get("c"))
            : 0;
        if (count === 0) {
          return res.status(404).json({
            ok: false,
            deleted: 0,
            message: "No movie found with that id",
          });
        }

        // Remove existing relationships of these types to avoid duplicates:
        // ACTED_IN, DIRECTED, IN
        await session.executeWrite((tx) =>
          tx.run(
            `
        MATCH (m:Movie {ids:$id})
        OPTIONAL MATCH (m)-[r]-()
        WHERE type(r) IN ['ACTED_IN','DIRECTED','IN']
        DELETE r
      `,
            { id }
          )
        );

        // Create/merge actor nodes and relationships (Actor)-[:ACTED_IN]->(Movie)
        for (const actorName of Array.isArray(actors) ? actors : []) {
          const n = String(actorName).trim();
          if (!n) continue;
          await session.executeWrite((tx) =>
            tx.run(
              `
          MERGE (a:Actor { name: $name })
          WITH a
          MATCH (m:Movie { ids: $id })
          MERGE (a)-[:ACTED_IN]->(m)
        `,
              { name: n, id }
            )
          );
        }

        // Directors: (Director)-[:DIRECTED]->(Movie)
        for (const directorName of Array.isArray(directors) ? directors : []) {
          const n = String(directorName).trim();
          if (!n) continue;
          await session.executeWrite((tx) =>
            tx.run(
              `
          MERGE (d:Director { name: $name })
          WITH d
          MATCH (m:Movie { ids: $id })
          MERGE (d)-[:DIRECTED]->(m)
        `,
              { name: n, id }
            )
          );
        }

        // Genres: (Movie)-[:IN]->(Genre)
        for (const genreType of Array.isArray(genres) ? genres : []) {
          const n = String(genreType).trim();
          if (!n) continue;
          await session.executeWrite((tx) =>
            tx.run(
              `
          MERGE (g:Genre { type: $type })
          WITH g
          MATCH (m:Movie { ids: $id })
          MERGE (m)-[:IN]->(g)
        `,
              { type: n, id }
            )
          );
        }

        return res.json({ ok: true });
      } catch (err) {
        console.error("POST /movies/:id/relationships error:", err);
        return res.status(500).json({ error: err.message || String(err) });
      } finally {
        await session.close();
      }
    }
  );

  // debug echo (route-level JSON parsing)
  app.post(
    "/debug-echo",
    express.json({ limit: "1mb", strict: false }),
    (req, res) => {
      res.json({ received: req.body || null, headers: req.headers });
    }
  );

  // LLM Stuff
  // ============================================================================
  // 1. Extract text from Ollama (robust)
  // ============================================================================
  function extractTextFromOllama(obj) {
    if (!obj) return "";
    if (typeof obj === "string") return obj;
    if (typeof obj.response === "string") return obj.response;
    if (typeof obj.output === "string") return obj.output;
    if (typeof obj.text === "string") return obj.text;

    if (Array.isArray(obj.response)) {
      for (const x of obj.response) {
        if (typeof x === "string") return x;
        if (x && typeof x.content === "string") return x.content;
      }
    }

    const q = [obj];
    while (q.length) {
      const cur = q.shift();
      if (!cur || typeof cur !== "object") continue;
      for (const k of Object.keys(cur)) {
        const v = cur[k];
        if (typeof v === "string" && v.trim()) return v;
        if (typeof v === "object") q.push(v);
      }
    }
    return "";
  }

  // ============================================================================
  // 2. Extract the FIRST balanced JSON object from LLM output
  // ============================================================================
  function extractFirstJsonObject(text) {
    if (!text || typeof text !== "string") return null;

    let start = text.indexOf("{");
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let stringChar = null;
    let escape = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        if (escape) {
          escape = false;
        } else if (ch === "\\") {
          escape = true;
        } else if (ch === stringChar) {
          inString = false;
          stringChar = null;
        }
        continue;
      }

      if (ch === '"' || ch === "'") {
        inString = true;
        stringChar = ch;
        continue;
      }

      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }

    return null;
  }

  // ============================================================================
  // 3. Auto-fix intent based on NL (this is CRITICAL to fix your bug)
  // ============================================================================
  function enrichIntent(parsedIntent, nl) {
    if (!parsedIntent || typeof parsedIntent !== "object") return parsedIntent;

    const text = String(nl || "").trim();
    const lower = text.toLowerCase();
    parsedIntent.filters = parsedIntent.filters || {};

    // --- TITLE detection (NEW) ---
    // 1) explicit: title "Some Title" or Title: "Some Title" or title is "Some Title"
    let m = text.match(/title\s*(?:is|:|=)?\s*["']([^"']+)["']/i);
    if (m && !parsedIntent.filters.title && !parsedIntent.filters.titleExact) {
      // treat explicit quoted title as an exact title match
      parsedIntent.filters.titleExact = m[1].trim();
    } else {
      // 2) fallback: any quoted string likely is the title if there is no other quoted content
      const quoted = text.match(/["']([^"']{2,200})["']/);
      if (
        quoted &&
        !parsedIntent.filters.title &&
        !parsedIntent.filters.titleExact
      ) {
        // use quoted string as titleExact only when NL contains words like "title" or "movie" nearby
        const nearTitle = /\btitle\b/i.test(text) || /\bmovie\b/i.test(text);
        if (nearTitle) parsedIntent.filters.titleExact = quoted[1].trim();
      }
    }

    // --- existing director detection ---
    const dir = text.match(/director\s+(?:is|=|:)?\s*([a-z .'\-]+)/i);
    if (dir && !parsedIntent.filters.director) {
      parsedIntent.filters.director = dir[1].trim();
    }

    // actor
    const actor = text.match(/actor\s+(?:is|=|:)?\s*([a-z .'\-]+)/i);
    if (actor && !parsedIntent.filters.actor) {
      parsedIntent.filters.actor = actor[1].trim();
    }

    // genre
    const genre = text.match(
      /\b(action|drama|comedy|thriller|horror|romance|sci[- ]?fi|adventure)\b/i
    );
    if (genre && !parsedIntent.filters.genre) {
      parsedIntent.filters.genre = genre[1];
    }

    // id
    const id = text.match(/\bid\s*([0-9]+)\b/);
    if (id && !parsedIntent.filters.ids) parsedIntent.filters.ids = id[1];

    // rating
    const rate =
      text.match(/rating\s*(>=|>|<=|<|=)\s*([0-9.]+)/i) ||
      text.match(/with\s+rating\s+(?:above|over)\s*([0-9.]+)/i);
    if (rate && !parsedIntent.filters.rating) {
      if (rate[2]) {
        const opMap = {
          ">": "GT",
          ">=": "GTE",
          "<": "LT",
          "<=": "LTE",
          "=": "EQ",
        };
        const sym = rate[1] || ">";
        parsedIntent.filters.rating = {
          op: opMap[sym] || "GT",
          value: Number(rate[2]),
        };
      } else {
        // matched the "with rating above X" variant where rate[1] may be the number
        const num = rate[1] || rate[2];
        if (num) parsedIntent.filters.rating = { op: "GT", value: Number(num) };
      }
    }

    // year after
    const after =
      text.match(/\bafter\s+(\d{4})\b/i) || text.match(/\bfrom\s+(\d{4})\b/i);
    if (after && !parsedIntent.filters.year_GTE)
      parsedIntent.filters.year_GTE = Number(after[1]);

    // top n
    const top = text.match(/\btop\s+([0-9]+)\b/i);
    if (top && !parsedIntent.top_n) parsedIntent.top_n = Number(top[1]);

    // defaults for fields if not present
    if (
      !Array.isArray(parsedIntent.fields) ||
      parsedIntent.fields.length === 0
    ) {
      parsedIntent.fields = [
        "ids",
        "title",
        "year",
        "rating",
        "directors",
        "actors",
        "genres",
      ];
    }

    return parsedIntent;
  }

  // ============================================================================
  // 4. Build GraphQL where clause
  // ============================================================================
  function buildWhereClause(filters) {
    const parts = [];
    if (!filters || typeof filters !== "object") return null;

    // ids exact
    if (filters.ids) parts.push(`ids: "${String(filters.ids)}"`);

    // title exact (preferred) or title_CONTAINS fallback
    if (filters.titleExact) {
      const safe = String(filters.titleExact).replace(/"/g, '\\"');
      parts.push(`title: "${safe}"`);
    } else if (filters.title) {
      const safe = String(filters.title).replace(/"/g, '\\"');
      parts.push(`title_CONTAINS: "${safe}"`);
    }

    // director, actor, genre
    if (filters.director) {
      const safe = String(filters.director).replace(/"/g, '\\"');
      parts.push(`directors_SOME: { name_CONTAINS: "${safe}" }`);
    }
    if (filters.actor) {
      const safe = String(filters.actor).replace(/"/g, '\\"');
      parts.push(`actors_SOME: { name_CONTAINS: "${safe}" }`);
    }
    if (filters.genre) {
      const safe = String(filters.genre).replace(/"/g, '\\"');
      parts.push(`genres_SOME: { type_CONTAINS: "${safe}" }`);
    }

    // rating filters
    if (filters.rating && typeof filters.rating === "object") {
      const op = String(filters.rating.op || "GT").toUpperCase();
      const map = { GT: "GT", GTE: "GTE", LT: "LT", LTE: "LTE", EQ: "EQ" };
      const gqlOp = map[op] || "GT";
      const val = Number(filters.rating.value);
      if (!isNaN(val)) parts.push(`rating_${gqlOp}: ${val}`);
    }

    // year
    if (filters.year_GTE) {
      const y = Number(filters.year_GTE);
      if (!isNaN(y)) parts.push(`year_GTE: ${y}`);
    }
    if (filters.year) {
      const y = Number(filters.year);
      if (!isNaN(y)) parts.push(`year: ${y}`);
    }

    if (parts.length === 0) return null;
    return `{ ${parts.join(", ")} }`;
  }

  // ============================================================================
  // 5. Fields selection
  // ============================================================================
  function buildSelection(fields) {
    const base = ["ids", "title", "year", "rating"];
    const rels = ["directors", "actors", "genres"];
    const out = [];

    if (!Array.isArray(fields) || fields.length === 0) {
      return `
      ids title year rating
      directors { name }
      actors { name }
      genres { type }
    `;
    }

    for (const f of fields) {
      if (base.includes(f)) out.push(f);
      if (rels.includes(f)) {
        if (f === "directors") out.push("directors { name }");
        if (f === "actors") out.push("actors { name }");
        if (f === "genres") out.push("genres { type }");
      }
    }

    return out.join(" ");
  }

  // ============================================================================
  // 6. Format NL output
  // ============================================================================
  function formatNL(dataObj) {
    if (!dataObj || !dataObj.movies) return "No movies found.";
    const arr = dataObj.movies;
    if (!arr.length) return "No movies found.";

    return arr
      .map((m) => {
        const d = m.directors?.map((x) => x.name).join(", ");
        const a = m.actors?.map((x) => x.name).join(", ");
        const g = m.genres?.map((x) => x.type).join(", ");
        return `- ${m.title} (${m.year}) [id: ${
          m.ids
        }] — directors: ${d} — rating: ${m.rating}${
          g ? " — genres: " + g : ""
        }${a ? " — actors: " + a : ""}`;
      })
      .join("\n");
  }

  // ============================================================================
  // 7. MAIN ENDPOINT (FINAL VERSION)
  // ============================================================================
  app.post(
    "/api/llm",
    express.json({ limit: "2mb", strict: false }),
    async (req, res) => {
      try {
        const { nl } = req.body;
        if (!nl) return res.json({ output: "Please provide input." });

        console.log("[NL] user:", nl);

        // ----------------------- Stage 1: Intent extraction -------------------
        const prompt = `
Return ONLY a single JSON object. NO explanation. NO text before or after.
Required JSON structure:
{
  "intent": "query",
  "filters": {},
  "fields": ["ids","title","year","rating","directors","actors","genres"],
  "top_n": null
}

User: ${nl}
JSON:
`;

        const r = await fetch(`${OLLAMA_HOST}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
        });

        const j = await r.json();
        let raw = extractTextFromOllama(j).trim();

        const extracted = extractFirstJsonObject(raw);
        if (!extracted) {
          return res.json({
            output: "No result — could not read intent JSON.",
          });
        }

        let intent = JSON.parse(extracted);

        // ----------------------- Enrich intent (fix your problem) ------------
        intent = enrichIntent(intent, nl);

        // ----------------------- Build GraphQL -------------------------------
        const where = buildWhereClause(intent.filters);
        const fields = buildSelection(intent.fields);

        const gql = where
          ? `query { movies(where: ${where}) { ${fields} } }`
          : `query { movies { ${fields} } }`;

        console.log("[NL] GQL built:", gql);

        // ----------------------- Execute GraphQL -----------------------------
        const exec = await fetch(`http://localhost:${PORT}/graphql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: gql }),
        });

        const rawExec = await exec.json();

        const output = formatNL(rawExec.data);

        return res.json({ output });
      } catch (err) {
        console.error(err);
        return res.json({ output: "Internal server error." });
      }
    }
  );

  // End LLM Stuff

  app.delete("/movies/:id", async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing movie id in path" });

    const session = driver.session();
    try {
      const result = await session.executeWrite((tx) =>
        tx.run(
          "MATCH (m:Movie {ids: $id}) WITH m, count(m) AS c DETACH DELETE m RETURN c AS deleted",
          { id }
        )
      );

      const rec = result.records && result.records[0];
      let deletedCount = 0;
      if (rec && rec.get) {
        const v = rec.get("deleted");
        deletedCount =
          v && typeof v.toNumber === "function" ? v.toNumber() : Number(v) || 0;
      }

      if (deletedCount === 0) {
        return res.status(404).json({
          ok: false,
          deleted: 0,
          message: "No movie found with that id",
        });
      }
      return res.json({ ok: true, deleted: deletedCount });
    } catch (err) {
      console.error("DELETE /movies/:id error:", err);
      return res.status(500).json({ error: err.message || String(err) });
    } finally {
      await session.close();
    }
  });

  // generic JSON error handler (no HTML pages)
  app.use((err, req, res, next) => {
    console.error("Unhandled error:", err && err.stack ? err.stack : err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: err?.message || "internal" });
  });

  const httpServer = app.listen(PORT, () => {
    console.log(
      `Server ready. GraphQL endpoint: http://localhost:${PORT}/graphql`
    );
    console.log(`LLM endpoint: http://localhost:${PORT}/api/llm`);
    console.log(`Health: http://localhost:${PORT}/health`);
  });

  // graceful shutdown
  const shutdown = async () => {
    console.log("Shutting down...");
    await apolloServer.stop();
    await driver.close();
    httpServer.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((err) => {
  console.error("Failed to start server", err && err.stack ? err.stack : err);
  process.exit(1);
});
