// Take a single occupancy reading and exit. Useful for cron-driven collection
// (e.g. an external */15 * * * * job) instead of the built-in scheduler.
import { Collector } from './collector.js';

const collector = new Collector();
try {
  await collector.init();
  const sample = await collector.collectOnce();
  console.log(
    `[${new Date().toISOString()}] ${collector.locationName}: ` +
      `${sample.count} people (${sample.percentage ?? '?'}%) — ${sample.status}`
  );
  process.exit(0);
} catch (err) {
  console.error('collect-once failed:', err.message);
  process.exit(1);
}
