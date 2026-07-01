// SQLite storage using Node's built-in node:sqlite (no native build needed).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

mkdirSync(dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS samples (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id   TEXT    NOT NULL,
    location_name TEXT,
    -- Actual moment the sample was taken (unix ms).
    ts            INTEGER NOT NULL,
    -- ts rounded down to the poll interval, so re-polls in the same window
    -- overwrite rather than duplicate.
    bucket_ts     INTEGER NOT NULL,
    -- Local-time breakdown, precomputed for fast insight queries.
    dow           INTEGER NOT NULL,  -- 0=Sunday .. 6=Saturday
    minute_of_day INTEGER NOT NULL,  -- 0..1439
    count         INTEGER,           -- people currently in the gym
    percentage    INTEGER,           -- % of capacity
    status        TEXT,
    source        TEXT NOT NULL DEFAULT 'live', -- 'live' or 'demo'
    UNIQUE (location_id, bucket_ts)
  );

  CREATE INDEX IF NOT EXISTS idx_samples_loc_time
    ON samples (location_id, dow, minute_of_day);

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

const upsertStmt = db.prepare(`
  INSERT INTO samples
    (location_id, location_name, ts, bucket_ts, dow, minute_of_day,
     count, percentage, status, source)
  VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (location_id, bucket_ts) DO UPDATE SET
    count      = excluded.count,
    percentage = excluded.percentage,
    status     = excluded.status,
    ts         = excluded.ts,
    location_name = excluded.location_name
`);

// Round a timestamp down to the nearest interval boundary.
export function bucketFor(ts, intervalMinutes) {
  const ms = intervalMinutes * 60 * 1000;
  return Math.floor(ts / ms) * ms;
}

// Insert or update one sample. `ts` is unix ms.
export function recordSample({
  locationId,
  locationName,
  ts,
  count,
  percentage,
  status,
  source = 'live',
  intervalMinutes = config.pollIntervalMinutes,
}) {
  const d = new Date(ts);
  const bucket = bucketFor(ts, intervalMinutes);
  upsertStmt.run(
    locationId,
    locationName ?? null,
    ts,
    bucket,
    d.getDay(),
    d.getHours() * 60 + d.getMinutes(),
    count ?? null,
    percentage ?? null,
    status ?? null,
    source
  );
}

export function setMeta(key, value) {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

export function getMeta(key) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function latestSample(locationId) {
  return db
    .prepare(
      `SELECT * FROM samples
       WHERE location_id = ?
       ORDER BY ts DESC LIMIT 1`
    )
    .get(locationId);
}

export function countSamples(locationId) {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM samples WHERE location_id = ?')
    .get(locationId);
  return row.n;
}
