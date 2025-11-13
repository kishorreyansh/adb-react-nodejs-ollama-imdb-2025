// verify_pretty.js
import neo4j from "neo4j-driver";
import dotenv from "dotenv";
dotenv.config();

const driver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

async function main() {
  const session = driver.session();
  try {
    // counts
    const countsRes = await session.run(`
      MATCH (m:Movie)
      MATCH (a:Actor)
      MATCH (d:Director)
      MATCH (g:Genre)
      RETURN count(DISTINCT m) AS movies, count(DISTINCT a) AS actors, count(DISTINCT d) AS directors, count(DISTINCT g) AS genres
    `);
    const rec = countsRes.records[0].toObject();
    // convert neo4j Integer -> JS number
    const movies = rec.movies.toNumber();
    const actors = rec.actors.toNumber();
    const directors = rec.directors.toNumber();
    const genres = rec.genres.toNumber();

    console.log(
      `Counts -> movies: ${movies}, actors: ${actors}, directors: ${directors}, genres: ${genres}`
    );

    // sample movie titles
    const sample = await session.run(`
      MATCH (m:Movie)
      RETURN m.ids AS id, m.title AS title, m.year AS year, m.rating AS rating
      LIMIT 10
    `);
    console.log("Sample movies:");
    for (const r of sample.records) {
      const obj = r.toObject();
      console.log({
        id: String(obj.id),
        title: obj.title,
        year: obj.year ? obj.year.toNumber() : null,
        rating:
          obj.rating !== null && obj.rating !== undefined ? obj.rating : null,
      });
    }
  } catch (err) {
    console.error("Error verifying DB:", err);
  } finally {
    await session.close();
    await driver.close();
  }
}

main();
