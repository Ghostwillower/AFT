// Realistic synthetic occupancy so the app is fully functional without a
// Gym Group account. Models a typical 24-hour gym: quiet overnight, a morning
// peak, a lunch bump, a large early-evening peak, calmer weekends.
const CAPACITY = 220;

// Base multiplier for each hour (0..23), shaped like a real gym day.
const HOURLY_SHAPE = [
  0.05, 0.03, 0.02, 0.02, 0.03, 0.08, // 00-05
  0.30, 0.55, 0.60, 0.45, 0.35, 0.40, // 06-11
  0.55, 0.50, 0.38, 0.40, 0.55, 0.85, // 12-17
  0.95, 0.80, 0.60, 0.40, 0.22, 0.10, // 18-23
];

// Whole-day multiplier by weekday (0=Sun .. 6=Sat).
const DAY_SHAPE = [0.6, 1.0, 0.95, 0.95, 0.9, 0.75, 0.55];

function interpHour(minuteOfDay) {
  const h = minuteOfDay / 60;
  const i = Math.floor(h) % 24;
  const next = (i + 1) % 24;
  const frac = h - Math.floor(h);
  return HOURLY_SHAPE[i] * (1 - frac) + HOURLY_SHAPE[next] * frac;
}

// Deterministic pseudo-random noise so seeded history is stable per bucket.
function noise(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x); // 0..1
}

// Expected people count at a given moment. `jitter` adds variability.
export function demoCount(date, { jitter = true } = {}) {
  const dow = date.getDay();
  const minuteOfDay = date.getHours() * 60 + date.getMinutes();
  const base = CAPACITY * interpHour(minuteOfDay) * DAY_SHAPE[dow];
  let n = base;
  if (jitter) {
    const seed = dow * 1440 + minuteOfDay + date.getDate() * 97;
    n = base * (0.85 + noise(seed) * 0.3);
  }
  return Math.max(0, Math.round(n));
}

export function demoSample(date) {
  const count = demoCount(date);
  return {
    count,
    percentage: Math.round((count / CAPACITY) * 100),
    status: 'OPEN',
    capacity: CAPACITY,
  };
}

export const DEMO_CAPACITY = CAPACITY;
