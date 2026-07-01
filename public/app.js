// Dashboard logic: fetch API data and render status, insights, heatmap, charts.
const $ = (id) => document.getElementById(id);
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const tooltip = document.createElement('div');
tooltip.className = 'tooltip';
document.body.appendChild(tooltip);

function showTip(html, x, y) {
  tooltip.innerHTML = html;
  tooltip.style.left = x + 12 + 'px';
  tooltip.style.top = y + 12 + 'px';
  tooltip.style.opacity = '1';
}
function hideTip() {
  tooltip.style.opacity = '0';
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' -> ' + res.status);
  return res.json();
}

// Map a normalised value 0..1 to a colour ramp (dark -> green -> amber -> red).
function heatColor(t) {
  if (t == null) return '#10151d';
  t = Math.max(0, Math.min(1, t));
  const stops = [
    [16, 21, 29],
    [22, 78, 55],
    [74, 222, 128],
    [250, 204, 21],
    [251, 113, 133],
  ];
  const seg = t * (stops.length - 1);
  const i = Math.floor(seg);
  const f = seg - i;
  const a = stops[i];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function fmtClock(ts) {
  return new Date(ts).toLocaleString('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function renderStatus() {
  const s = await getJSON('/api/status');
  $('gym-name').textContent =
    `The Gym Group · ${s.gym} — recorded every ${s.pollIntervalMinutes} min` +
    (s.mode === 'demo' ? '  ·  DEMO DATA' : '');

  if (s.current) {
    $('current-count').textContent = s.current.count ?? '—';
    const pct = s.current.percentage ?? 0;
    $('current-bar').style.width = Math.min(100, pct) + '%';
    $('current-meta').textContent =
      `${pct}% full · ${s.current.status} · ${fmtClock(s.current.at)}`;
  } else {
    $('current-count').textContent = '—';
    $('current-meta').textContent = 'No samples yet';
  }

  $('footer-meta').textContent =
    `${s.totalSamples} samples recorded · ${s.mode} mode` +
    (s.lastError ? ` · last error: ${s.lastError}` : '');
  return s;
}

async function renderInsights() {
  const d = await getJSON('/api/insights');
  if (!d.available) {
    $('best-time').textContent = '—';
    $('best-time-meta').textContent = 'Collecting data…';
    return;
  }

  if (d.bestTimeToday) {
    $('best-time').textContent = d.bestTimeToday.time;
    $('best-time-meta').textContent =
      `~${d.bestTimeToday.avgCount} people (${d.bestTimeToday.avgPct ?? '?'}%) · ${d.bestTimeToday.day}`;
  } else {
    $('best-time').textContent = '—';
    $('best-time-meta').textContent = 'No more slots today';
  }

  if (d.days?.quietest) {
    $('quiet-day').textContent = d.days.quietest.day;
    $('quiet-day-meta').textContent = `~${d.days.quietest.avgCount} avg people`;
  }
  if (d.days?.busiest) {
    $('busy-day').textContent = d.days.busiest.day;
    $('busy-day-meta').textContent = `~${d.days.busiest.avgCount} avg people`;
  }

  const list = $('quietest-list');
  list.innerHTML = '';
  for (const q of d.quietestSlots) {
    const li = document.createElement('li');
    li.innerHTML =
      `<span class="slot">${q.day} ${q.time}</span>` +
      `<span class="val">${q.avgCount} people${q.avgPct != null ? ` · ${q.avgPct}%` : ''}</span>`;
    list.appendChild(li);
  }

  renderHourly(d.hourly);
}

// --- Heatmap ---------------------------------------------------------------
async function renderHeatmap() {
  const d = await getJSON('/api/heatmap');
  const container = $('heatmap');
  container.innerHTML = '';
  if (!d.grid || d.grid.length === 0) return;

  let max = 0;
  for (const row of d.grid) for (const v of row) if (v != null && v > max) max = v;
  max = max || 1;

  d.grid.forEach((row, dow) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'hm-row';
    const day = document.createElement('span');
    day.className = 'hm-day';
    day.textContent = DAY_ABBR[dow];
    const cells = document.createElement('div');
    cells.className = 'hm-cells';

    row.forEach((val, slot) => {
      const cell = document.createElement('div');
      cell.className = 'hm-cell';
      cell.style.background = heatColor(val == null ? null : val / max);
      const mins = slot * 15;
      const hh = String(Math.floor(mins / 60)).padStart(2, '0');
      const mm = String(mins % 60).padStart(2, '0');
      cell.addEventListener('mousemove', (e) =>
        showTip(
          `<b>${DAY_ABBR[dow]} ${hh}:${mm}</b><br>` +
            (val == null ? 'no data' : `~${val} people`),
          e.clientX,
          e.clientY
        )
      );
      cell.addEventListener('mouseleave', hideTip);
      cells.appendChild(cell);
    });

    rowEl.append(day, cells);
    container.appendChild(rowEl);
  });

  // Hour axis.
  const axis = document.createElement('div');
  axis.className = 'hm-hours';
  const spacer = document.createElement('span');
  const scale = document.createElement('div');
  scale.className = 'hm-scale';
  for (let h = 0; h < 24; h += 1) {
    const s = document.createElement('span');
    s.textContent = h % 3 === 0 ? String(h) : '';
    scale.appendChild(s);
  }
  axis.append(spacer, scale);
  container.appendChild(axis);

  // Legend gradient.
  const legend = $('legend-scale');
  legend.innerHTML = '';
  for (let i = 0; i <= 10; i += 1) {
    const s = document.createElement('span');
    s.style.background = heatColor(i / 10);
    legend.appendChild(s);
  }
}

// --- Simple canvas charts --------------------------------------------------
function drawBarChart(canvas, points, { color = '#4ade80', valueKey = 'avgCount' }) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 220;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { l: 34, r: 10, t: 10, b: 22 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const max = Math.max(1, ...points.map((p) => p[valueKey] || 0));
  const bw = plotW / points.length;

  ctx.strokeStyle = '#2a313d';
  ctx.fillStyle = '#93a0b1';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'right';
  for (let g = 0; g <= 4; g += 1) {
    const y = pad.t + (plotH * g) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
    ctx.fillText(Math.round(max - (max * g) / 4), pad.l - 5, y + 3);
  }

  points.forEach((p, i) => {
    const val = p[valueKey] || 0;
    const bh = (val / max) * plotH;
    const x = pad.l + i * bw;
    ctx.fillStyle = color;
    ctx.fillRect(x + bw * 0.15, pad.t + plotH - bh, bw * 0.7, bh);
  });

  ctx.fillStyle = '#93a0b1';
  ctx.textAlign = 'center';
  points.forEach((p, i) => {
    if (i % 3 === 0) {
      const x = pad.l + i * bw + bw / 2;
      ctx.fillText(p.label ?? p.hour ?? '', x, h - 7);
    }
  });
}

function drawLineChart(canvas, samples) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 220;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = { l: 34, r: 10, t: 10, b: 22 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  if (samples.length === 0) {
    ctx.fillStyle = '#93a0b1';
    ctx.textAlign = 'center';
    ctx.fillText('No recent samples yet', w / 2, h / 2);
    return;
  }

  const counts = samples.map((s) => s.count || 0);
  const max = Math.max(1, ...counts);
  const t0 = samples[0].ts;
  const t1 = samples[samples.length - 1].ts || t0 + 1;
  const span = Math.max(1, t1 - t0);

  ctx.strokeStyle = '#2a313d';
  ctx.fillStyle = '#93a0b1';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'right';
  for (let g = 0; g <= 4; g += 1) {
    const y = pad.t + (plotH * g) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
    ctx.fillText(Math.round(max - (max * g) / 4), pad.l - 5, y + 3);
  }

  const xFor = (ts) => pad.l + ((ts - t0) / span) * plotW;
  const yFor = (v) => pad.t + plotH - (v / max) * plotH;

  ctx.beginPath();
  samples.forEach((s, i) => {
    const x = xFor(s.ts);
    const y = yFor(s.count || 0);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.lineTo(xFor(t1), pad.t + plotH);
  ctx.lineTo(xFor(t0), pad.t + plotH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(56,189,248,0.12)';
  ctx.fill();

  // Time labels at start / middle / end.
  ctx.fillStyle = '#93a0b1';
  ctx.textAlign = 'center';
  [0, 0.5, 1].forEach((f) => {
    const ts = t0 + span * f;
    ctx.fillText(
      new Date(ts).toLocaleString('en-GB', {
        weekday: 'short',
        hour: '2-digit',
      }),
      pad.l + plotW * f,
      h - 7
    );
  });
}

function renderHourly(hourly) {
  if (!hourly || hourly.length === 0) return;
  drawBarChart($('hourly-chart'), hourly, { color: '#4ade80', valueKey: 'avgCount' });
}

async function renderRecent() {
  const d = await getJSON('/api/recent?hours=48');
  drawLineChart($('recent-chart'), d.samples);
}

async function refreshAll() {
  try {
    await renderStatus();
    await Promise.all([renderInsights(), renderHeatmap(), renderRecent()]);
  } catch (err) {
    console.error(err);
  }
}

$('refresh-btn').addEventListener('click', async () => {
  $('refresh-btn').textContent = 'Collecting…';
  try {
    await fetch('/api/collect', { method: 'POST' });
  } catch {}
  await refreshAll();
  $('refresh-btn').textContent = 'Collect now';
});

window.addEventListener('resize', () => {
  renderInsights();
  renderRecent();
});

refreshAll();
setInterval(refreshAll, 60_000); // auto-refresh every minute
