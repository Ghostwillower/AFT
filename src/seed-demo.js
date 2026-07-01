// Backfill the database with several weeks of demo samples so insights are
// immediately meaningful. Safe to run repeatedly (upserts by time bucket).
import { config } from './config.js';
import { recordSample, countSamples, setMeta, bucketFor } from './db.js';
import { demoSample } from './demo.js';

const WEEKS = Number(process.env.SEED_WEEKS || 4);
const locationId = config.locationId || 'demo-chelmsford';
const locationName = `${config.gymNameQuery} (demo)`;

const intervalMs = config.pollIntervalMinutes * 60 * 1000;
const now = Date.now();
// Align to clean interval boundaries so slots read 02:30, not 02:28.
const start = bucketFor(now - WEEKS * 7 * 24 * 3600 * 1000, config.pollIntervalMinutes);

let n = 0;
for (let t = start; t <= now; t += intervalMs) {
  const when = new Date(t);
  const s = demoSample(when);
  recordSample({
    locationId,
    locationName,
    ts: t,
    count: s.count,
    percentage: s.percentage,
    status: s.status,
    source: 'demo',
  });
  n++;
}

setMeta('location_id', locationId);
setMeta('location_name', locationName);
setMeta('mode', 'demo');
setMeta('seeded_at', String(now));

console.log(
  `Seeded ${n} demo samples over ${WEEKS} week(s). ` +
    `Total samples for ${locationName}: ${countSamples(locationId)}.`
);
