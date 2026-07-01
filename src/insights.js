// Derive insights from recorded samples: typical patterns, quietest times, etc.
import { db } from './db.js';

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function fmtTime(minuteOfDay) {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Average people count for every (day-of-week, 15-min slot) we have data for.
// Returns rows: { dow, minute_of_day, avg_count, avg_pct, samples }.
function averagedSlots(locationId) {
  return db
    .prepare(
      `SELECT dow, minute_of_day,
              AVG(count)      AS avg_count,
              AVG(percentage) AS avg_pct,
              COUNT(*)        AS samples
       FROM samples
       WHERE location_id = ? AND count IS NOT NULL
       GROUP BY dow, minute_of_day`
    )
    .all(locationId);
}

// Average by hour of the day, collapsed across all days of the week.
function averagedByHour(locationId) {
  return db
    .prepare(
      `SELECT (minute_of_day / 60) AS hour,
              AVG(count)      AS avg_count,
              AVG(percentage) AS avg_pct,
              COUNT(*)        AS samples
       FROM samples
       WHERE location_id = ? AND count IS NOT NULL
       GROUP BY hour
       ORDER BY hour`
    )
    .all(locationId);
}

// Average per day of the week (whole-day average).
function averagedByDay(locationId) {
  return db
    .prepare(
      `SELECT dow,
              AVG(count) AS avg_count,
              AVG(percentage) AS avg_pct,
              COUNT(*)   AS samples
       FROM samples
       WHERE location_id = ? AND count IS NOT NULL
       GROUP BY dow`
    )
    .all(locationId);
}

// A 7 x 96 grid (days x 15-min slots) of average counts for a heatmap.
export function weeklyHeatmap(locationId) {
  const slots = averagedSlots(locationId);
  // 96 fifteen-minute slots per day.
  const grid = Array.from({ length: 7 }, () => new Array(96).fill(null));
  for (const r of slots) {
    const slot = Math.floor(r.minute_of_day / 15);
    if (slot < 96) grid[r.dow][slot] = round1(r.avg_count);
  }
  return { days: DAY_NAMES, slotMinutes: 15, grid };
}

// The N quietest (day, time) slots overall.
export function quietestSlots(locationId, limit = 10) {
  const slots = averagedSlots(locationId)
    .filter((r) => r.samples >= 1)
    .sort((a, b) => a.avg_count - b.avg_count)
    .slice(0, limit);
  return slots.map((r) => ({
    day: DAY_NAMES[r.dow],
    dow: r.dow,
    time: fmtTime(r.minute_of_day),
    minuteOfDay: r.minute_of_day,
    avgCount: round1(r.avg_count),
    avgPct: r.avg_pct == null ? null : Math.round(r.avg_pct),
    samples: r.samples,
  }));
}

export function busiestSlots(locationId, limit = 10) {
  const slots = averagedSlots(locationId)
    .sort((a, b) => b.avg_count - a.avg_count)
    .slice(0, limit);
  return slots.map((r) => ({
    day: DAY_NAMES[r.dow],
    dow: r.dow,
    time: fmtTime(r.minute_of_day),
    minuteOfDay: r.minute_of_day,
    avgCount: round1(r.avg_count),
    avgPct: r.avg_pct == null ? null : Math.round(r.avg_pct),
    samples: r.samples,
  }));
}

// Quietest and busiest whole day of the week.
export function dayRanking(locationId) {
  const rows = averagedByDay(locationId).map((r) => ({
    day: DAY_NAMES[r.dow],
    dow: r.dow,
    avgCount: round1(r.avg_count),
    avgPct: r.avg_pct == null ? null : Math.round(r.avg_pct),
    samples: r.samples,
  }));
  const sorted = [...rows].sort((a, b) => a.avgCount - b.avgCount);
  return {
    perDay: rows.sort((a, b) => a.dow - b.dow),
    quietest: sorted[0] || null,
    busiest: sorted[sorted.length - 1] || null,
  };
}

// Best remaining time to visit *today* (from `now` onward, within opening
// hours we have data for). Uses this weekday's typical pattern.
export function bestTimeToday(locationId, now = new Date()) {
  const dow = now.getDay();
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const rows = averagedSlots(locationId).filter(
    (r) => r.dow === dow && r.minute_of_day >= nowMinute
  );
  if (rows.length === 0) return null;
  rows.sort((a, b) => a.avg_count - b.avg_count);
  const best = rows[0];
  return {
    day: DAY_NAMES[dow],
    time: fmtTime(best.minute_of_day),
    minuteOfDay: best.minute_of_day,
    avgCount: round1(best.avg_count),
    avgPct: best.avg_pct == null ? null : Math.round(best.avg_pct),
  };
}

export function hourlyProfile(locationId) {
  return averagedByHour(locationId).map((r) => ({
    hour: r.hour,
    label: `${String(r.hour).padStart(2, '0')}:00`,
    avgCount: round1(r.avg_count),
    avgPct: r.avg_pct == null ? null : Math.round(r.avg_pct),
    samples: r.samples,
  }));
}

// Recent raw samples for a live trend chart.
export function recentSamples(locationId, hours = 48) {
  const since = Date.now() - hours * 3600 * 1000;
  return db
    .prepare(
      `SELECT ts, count, percentage, status
       FROM samples
       WHERE location_id = ? AND ts >= ?
       ORDER BY ts ASC`
    )
    .all(locationId, since);
}

function round1(v) {
  if (v == null) return null;
  return Math.round(v * 10) / 10;
}

export { DAY_NAMES };
