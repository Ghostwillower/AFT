// The collector: resolves the target gym, then records one occupancy sample
// per poll interval, aligned to the wall-clock quarter hour.
import { config } from './config.js';
import { GymGroupClient } from './gymClient.js';
import { recordSample, setMeta, getMeta } from './db.js';
import { demoSample } from './demo.js';

export class Collector {
  constructor() {
    this.client = null;
    this.locationId = null;
    this.locationName = null;
    this.timer = null;
    this.lastError = null;
    this.lastSampleAt = null;
  }

  get mode() {
    return config.demoMode ? 'demo' : 'live';
  }

  // Resolve credentials + target gym once at startup.
  async init() {
    if (config.demoMode) {
      // Stable synthetic identity for the Chelmsford gym.
      this.locationId = config.locationId || 'demo-chelmsford';
      this.locationName = `${config.gymNameQuery} (demo)`;
      this.#persistTarget();
      return;
    }

    this.client = new GymGroupClient();
    await this.client.login();

    if (config.locationId) {
      this.locationId = config.locationId;
      this.locationName = getMeta('location_name') || config.gymNameQuery;
    } else {
      const gym = await this.client.findGymByName(config.gymNameQuery);
      this.locationId = gym.uuid;
      this.locationName = gym.name;
    }
    this.#persistTarget();
  }

  #persistTarget() {
    setMeta('location_id', this.locationId);
    setMeta('location_name', this.locationName);
    setMeta('mode', this.mode);
  }

  // Fetch + store a single sample for `when` (defaults to now).
  async collectOnce(when = new Date()) {
    let sample;
    try {
      if (config.demoMode) {
        sample = demoSample(when);
      } else {
        if (!this.client) await this.init();
        // Re-login transparently if the session expired.
        try {
          sample = await this.client.getBusyness(this.locationId);
        } catch (err) {
          await this.client.login();
          sample = await this.client.getBusyness(this.locationId);
        }
      }

      recordSample({
        locationId: this.locationId,
        locationName: this.locationName,
        ts: when.getTime(),
        count: sample.count,
        percentage: sample.percentage,
        status: sample.status,
        source: this.mode,
      });

      this.lastError = null;
      this.lastSampleAt = when.getTime();
      setMeta('last_sample_at', String(this.lastSampleAt));
      return sample;
    } catch (err) {
      this.lastError = err.message;
      setMeta('last_error', err.message);
      throw err;
    }
  }

  // Start the recurring collection loop, aligned to the interval boundary.
  start() {
    const intervalMs = config.pollIntervalMinutes * 60 * 1000;

    const tick = () => {
      this.collectOnce().catch((err) => {
        console.error('[collector] sample failed:', err.message);
      });
    };

    // Take one immediately, then align to the next quarter-hour boundary.
    tick();
    const now = Date.now();
    const msToNext = intervalMs - (now % intervalMs);
    setTimeout(() => {
      tick();
      this.timer = setInterval(tick, intervalMs);
    }, msToNext);

    console.log(
      `[collector] running in ${this.mode} mode, every ` +
        `${config.pollIntervalMinutes} min for "${this.locationName}".`
    );
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
