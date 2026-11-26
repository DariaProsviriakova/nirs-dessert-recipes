import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
export function openStore(filename) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','admin')), created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      session_id TEXT NOT NULL, query_id TEXT NOT NULL, submitted_at TEXT NOT NULL,
      status TEXT NOT NULL, duration_ms INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS result_recipes (
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      recipe_id TEXT NOT NULL, PRIMARY KEY(event_id, recipe_id)
    );
    CREATE INDEX IF NOT EXISTS events_date ON events(submitted_at);
  `);
  return db;
}
export function prune(db, days) {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
  db.prepare('DELETE FROM events WHERE submitted_at < ?').run(new Date(Date.now()-days*86400000).toISOString());
}
export function snapshot(db, days, search) {
  const cutoff = new Date(Date.now()-days*86400000).toISOString();
  const requests = db.prepare('SELECT COUNT(*) AS n FROM events WHERE submitted_at >= ?').get(cutoff).n;
  const byDay = db.prepare("SELECT substr(submitted_at,1,10) AS date, COUNT(*) AS count FROM events WHERE submitted_at >= ? GROUP BY date ORDER BY date").all(cutoff);
  const counts = db.prepare(`SELECT r.recipe_id AS id, COUNT(*) AS count FROM result_recipes r
    JOIN events e ON e.id=r.event_id WHERE e.submitted_at >= ? GROUP BY r.recipe_id ORDER BY count DESC, id LIMIT 10`).all(cutoff);
  return { requests, byDay, popular: counts.map(({id,count}) => ({...search.recipe(id), requestCount:count})).filter(r=>r.id),
    period:{from:cutoff,to:new Date().toISOString(),days,timeZone:'UTC'}, catalogSize:search.size,
    noResults: db.prepare("SELECT COUNT(*) AS n FROM events WHERE submitted_at >= ? AND status='empty'").get(cutoff).n };
}
