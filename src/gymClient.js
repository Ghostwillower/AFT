// Client for The Gym Group's mobile API (NetPulse/eGym platform).
//
// Flow, reverse-engineered from the public Android app:
//   1. POST exerciser/login            -> user uuid + JSESSIONID cookie
//   2. GET  company/children           -> list of all gyms (uuid + name)
//   3. GET  .../{uuid}/gym-busyness    -> live occupancy for one gym
//
// All authenticated calls reuse the JSESSIONID cookie from login.
import { config } from './config.js';

// Headers the mobile app sends. X-NP-App-Version is set high to force the
// latest API behaviour, matching the community clients.
const BASE_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'okhttp/3.12.3',
  'X-NP-API-Version': '1.5',
  'X-NP-App-Version': '9999',
  'X-NP-User-Agent':
    'clientType=MOBILE_DEVICE; devicePlatform=ANDROID; deviceUid=; ' +
    'applicationName=The Gym Group; applicationVersion=5.0; ' +
    'applicationVersionCode=38',
};

export class GymGroupClient {
  constructor({ email, pin, baseUrl } = {}) {
    this.email = email ?? config.email;
    this.pin = pin ?? config.pin;
    this.baseUrl = baseUrl ?? config.apiBaseUrl;
    this.userUuid = null;
    this.cookie = null;
  }

  #url(path) {
    return new URL(path, this.baseUrl).toString();
  }

  #authHeaders() {
    const headers = { ...BASE_HEADERS };
    if (this.cookie) headers.Cookie = this.cookie;
    return headers;
  }

  // Authenticate and capture the session cookie + user uuid.
  async login() {
    const body = new URLSearchParams({
      username: this.email,
      password: this.pin,
    }).toString();

    const res = await fetch(this.#url('exerciser/login'), {
      method: 'POST',
      headers: {
        ...BASE_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!res.ok) {
      throw new Error(
        `Login failed (${res.status} ${res.statusText}). ` +
          'Check GYM_GROUP_EMAIL / GYM_GROUP_PIN.'
      );
    }

    // Persist the session cookie for subsequent requests.
    const setCookie = res.headers.getSetCookie?.() ?? [];
    const jsession = setCookie
      .map((c) => c.split(';')[0])
      .find((c) => c.startsWith('JSESSIONID='));
    if (jsession) this.cookie = jsession;

    const data = await res.json();
    this.userUuid = data.uuid || data.userUuid || null;
    if (!this.userUuid) {
      throw new Error('Login succeeded but no user uuid was returned.');
    }
    return { userUuid: this.userUuid, homeClubUuid: data.homeClubUuid };
  }

  // Return [{ uuid, name }] for every gym in the chain.
  async listGyms() {
    const res = await fetch(
      this.#url('company/children?responseType=basic'),
      { headers: this.#authHeaders() }
    );
    if (!res.ok) {
      throw new Error(`Failed to list gyms (${res.status}).`);
    }
    const data = await res.json();
    const gyms = Array.isArray(data) ? data : data.children || data.items || [];
    return gyms.map((g) => ({
      uuid: g.uuid || g.id || g.companyUuid,
      name: g.name || g.companyName || g.locationName || '',
    }));
  }

  // Find a gym by (case-insensitive substring) name, e.g. "Chelmsford".
  async findGymByName(query) {
    const gyms = await this.listGyms();
    const q = query.toLowerCase();
    const match =
      gyms.find((g) => (g.name || '').toLowerCase() === q) ||
      gyms.find((g) => (g.name || '').toLowerCase().includes(q));
    if (!match) {
      throw new Error(
        `No gym matching "${query}". Available: ` +
          gyms.map((g) => g.name).filter(Boolean).slice(0, 60).join(', ')
      );
    }
    return match;
  }

  // Live occupancy for one gym location.
  // Returns { count, percentage, status, name, raw }.
  async getBusyness(locationId) {
    if (!this.userUuid) throw new Error('Call login() before getBusyness().');
    const url = this.#url(
      `thegymgroup/v1.0/exerciser/${this.userUuid}/gym-busyness` +
        `?gymLocationId=${encodeURIComponent(locationId)}`
    );
    const res = await fetch(url, { headers: this.#authHeaders() });
    if (!res.ok) {
      throw new Error(`Failed to fetch busyness (${res.status}).`);
    }
    const data = await res.json();
    return {
      count: numberOrNull(data.currentCapacity),
      percentage: numberOrNull(data.currentPercentage),
      status: data.status || 'UNKNOWN',
      name: data.gymLocationName || '',
      raw: data,
    };
  }
}

function numberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
