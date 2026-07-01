// Central configuration, read from environment variables.
// A tiny .env loader (no dependencies) so `.env` files work in local dev.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Minimal .env parser: KEY=VALUE lines, ignores comments/blank lines.
// Does not override variables already present in the real environment.
function loadDotEnv() {
  try {
    const raw = readFileSync(join(rootDir, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      // Strip matching surrounding quotes.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // No .env file — that's fine, rely on real environment / defaults.
  }
}

loadDotEnv();

const email = process.env.GYM_GROUP_EMAIL?.trim() || '';
const pin = process.env.GYM_GROUP_PIN?.trim() || '';

export const config = {
  rootDir,
  // The Gym Group account used to read live occupancy (any valid membership).
  email,
  pin,
  // If both credentials are provided we hit the real API, otherwise we run in
  // demo mode with realistic synthetic data so the app is usable immediately.
  demoMode: !(email && pin),

  // Which gym to track. If GYM_LOCATION_ID is set we use it directly,
  // otherwise we resolve it by matching the gym name against this query.
  locationId: process.env.GYM_LOCATION_ID?.trim() || '',
  gymNameQuery: (process.env.GYM_NAME_QUERY || 'Chelmsford').trim(),

  // How often to record a sample, in minutes (default: every 15 minutes).
  pollIntervalMinutes: Number(process.env.POLL_INTERVAL_MINUTES || 15),

  port: Number(process.env.PORT || 3000),

  dbPath: process.env.DB_PATH?.trim() || join(rootDir, 'data', 'occupancy.db'),

  apiBaseUrl:
    process.env.GYM_API_BASE_URL?.trim() ||
    'https://thegymgroup.netpulse.com/np/',
};
