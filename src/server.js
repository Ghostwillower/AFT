// Zero-dependency HTTP server: JSON API + static dashboard.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { config } from './config.js';
import { getMeta, latestSample, countSamples } from './db.js';
import { Collector } from './collector.js';
import {
  weeklyHeatmap,
  quietestSlots,
  busiestSlots,
  dayRanking,
  bestTimeToday,
  hourlyProfile,
  recentSamples,
} from './insights.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const collector = new Collector();

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function locationId() {
  return collector.locationId || getMeta('location_id');
}

async function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  // Prevent path traversal.
  const safePath = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
    });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

const routes = {
  // Overview: current status + headline insights.
  '/api/status': () => {
    const loc = locationId();
    const latest = loc ? latestSample(loc) : null;
    return {
      gym: getMeta('location_name') || config.gymNameQuery,
      locationId: loc,
      mode: getMeta('mode') || collector.mode,
      pollIntervalMinutes: config.pollIntervalMinutes,
      totalSamples: loc ? countSamples(loc) : 0,
      lastError: getMeta('last_error'),
      current: latest
        ? {
            count: latest.count,
            percentage: latest.percentage,
            status: latest.status,
            at: latest.ts,
          }
        : null,
    };
  },

  '/api/insights': () => {
    const loc = locationId();
    if (!loc) return { available: false };
    return {
      available: countSamples(loc) > 0,
      bestTimeToday: bestTimeToday(loc),
      quietestSlots: quietestSlots(loc, 10),
      busiestSlots: busiestSlots(loc, 10),
      days: dayRanking(loc),
      hourly: hourlyProfile(loc),
    };
  },

  '/api/heatmap': () => {
    const loc = locationId();
    return loc ? weeklyHeatmap(loc) : { grid: [] };
  },

  '/api/recent': (req) => {
    const loc = locationId();
    const hours = Number(new URL(req.url, 'http://x').searchParams.get('hours')) || 48;
    return { hours, samples: loc ? recentSamples(loc, hours) : [] };
  },
};

const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://x').pathname;

  // Manual "collect now" trigger (handy for demos/testing).
  if (pathname === '/api/collect' && req.method === 'POST') {
    try {
      const sample = await collector.collectOnce();
      return sendJson(res, 200, { ok: true, sample });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  const handler = routes[pathname];
  if (handler) {
    try {
      return sendJson(res, 200, await handler(req));
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  return serveStatic(req, res);
});

async function main() {
  try {
    await collector.init();
  } catch (err) {
    console.error(
      '[startup] could not initialise collector:',
      err.message,
      '\nThe dashboard will still start; fix credentials and restart.'
    );
  }

  collector.start();

  server.listen(config.port, () => {
    console.log(
      `AFT gym tracker on http://localhost:${config.port} ` +
        `(${collector.mode} mode)`
    );
  });
}

main();
