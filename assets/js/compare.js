import { computeSubmissionStatus, findBaseline, findLatest, frameArchive, getHistory, nodes, sectors, timeSlots } from './data.js';
import { drawFrame } from './frames.js';

const CONFIG = Object.freeze({
  // Frame matching accepts a 90-minute local-time difference before widening to three hours.
  matchToleranceMinutes:90,
  widenedToleranceMinutes:180,
  // Comparability checks warn when exposure differs by more than 25%, or lunar phase by 30 points.
  exposureWarningPct:25,
  moonWarningPoints:30,
  // Metric significance thresholds are absolute points, except relative metrics marked below.
  significance:{ cloud:[5,15], skyBackground:[5,12], starCountPct:[10,25], transparency:[8,20], viirsPct:[10,20], moon:[10,25] },
  // Alert thresholds mirror the product rules and use increases/decreases in the displayed units.
  alerts:{ cloudIncrease:20, starDecreasePct:25, cloudMatchAllowance:8, skyBackgroundIncrease:15, viirsIncreasePct:20, transparencyDecrease:20, rejectionCloudPct:35 },
  // Outlook uses seven observations, an EWMA blend, and a three-night linear projection.
  forecast:{ historyNights:7, minimumNights:5, ewmaAlpha:.38, trendBlend:.45, highNoise:10, mediumNoise:22, goodCloud:20, fairCloud:45, goodStars:70, uncertaintyBase:5 },
  // Candidate-cause scores are normalized to 0–100 for confidence wording.
  reasonWeights:{ cloud:38, haze:34, moon:26, artificialLight:34, equipment:34, timing:28, normalVariation:12 },
  reasonThresholds:{ cloudLikely:20, cloudPossible:8, hazeStarsPct:25, hazeCloudAllowance:8, hazeTransparency:12, moonLikely:25, moonPossible:12, lightLikely:20, lightPossible:10, lightBackgroundRise:8, timingPossible:30 },
  canvas:{ width:320, height:200, backgroundCutoff:130, peakCutoff:76, clearSkyFraction:.8, luminanceScale:1.3, contrastScale:1.15, horizonScale:1.6, cloudCellSize:8, cloudRedCutoff:90, cloudGreenCutoff:110, cloudBlueCutoff:130, moonX:.82, moonY:.2, moonScale:.65 }
});

const $ = (selector) => document.querySelector(selector);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const state = { pair:null, result:null, busy:false, reversed:false, activeView:'slider', compareToken:0 };

function dateShift(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value, options = {}) {
  return new Date(value).toLocaleString([], { year:'numeric', month:'short', day:'numeric', ...options });
}

function frameStamp(frame) {
  return `${frame.localDate} ${frame.localTime} local (${formatDate(frame.timestampUTC, { hour:'2-digit', minute:'2-digit', timeZone:'UTC', timeZoneName:'short' })})`;
}

function ageLabel(frame) {
  const hours = Math.max(0, Math.floor((Date.now() - Date.parse(frame.timestampUTC)) / 3600000));
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function localMismatchMinutes(frame, slotId) {
  const slot = timeSlots.find((item) => item.id === slotId);
  if (!slot) return Infinity;
  const [hour, minute] = frame.localTime.split(':').map(Number);
  return Math.abs(hour * 60 + minute - slot.minuteOfDay);
}

function getLatestAfter(baseline, sector, slotId, tolerance, nodeCallsign) {
  const direct = findLatest(sector, slotId, tolerance, nodeCallsign ? { nodeCallsign } : {});
  if (direct && Date.parse(direct.timestampUTC) > Date.parse(baseline.timestampUTC) && direct.id !== baseline.id) return direct;
  return frameArchive
    .filter((frame) => frame.sector === sector && frame.timeSlot === slotId
      && Date.parse(frame.timestampUTC) > Date.parse(baseline.timestampUTC)
      && frame.id !== baseline.id
      && localMismatchMinutes(frame, slotId) <= tolerance
      && (!nodeCallsign || frame.nodeCallsign === nodeCallsign))
    .sort((a, b) => Date.parse(b.timestampUTC) - Date.parse(a.timestampUTC))[0] || null;
}

function nearestBaseline(sector, date, slotId, nodeCallsign) {
  const candidateFrames = frameArchive.filter((frame) => frame.sector === sector && frame.timeSlot === slotId
    && (!nodeCallsign || frame.nodeCallsign === nodeCallsign));
  return candidateFrames.sort((a, b) => {
    const dayDistance = Math.abs(Date.parse(`${a.localDate}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`));
    const otherDistance = Math.abs(Date.parse(`${b.localDate}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`));
    return dayDistance - otherDistance || localMismatchMinutes(a, slotId) - localMismatchMinutes(b, slotId);
  })[0] || null;
}

function resolvePair({ allowWiden = true } = {}) {
  const sector = $('#region-select').value;
  const date = $('#baseline-date').value;
  const slotId = $('#time-slot').value;
  const sameNode = $('#same-node').checked;
  const selectedNode = sameNode ? $('#node-select').value : '';
  let tolerance = CONFIG.matchToleranceMinutes;
  let widened = false;
  let baseline = findBaseline(sector, date, slotId, tolerance, selectedNode ? { nodeCallsign:selectedNode } : {});
  if (!baseline && allowWiden) {
    tolerance = CONFIG.widenedToleranceMinutes;
    baseline = findBaseline(sector, date, slotId, tolerance, selectedNode ? { nodeCallsign:selectedNode } : {});
    widened = Boolean(baseline);
  }
  if (!baseline) return { baseline:null, latest:null, widened:false, tolerance, nearest:nearestBaseline(sector, date, slotId, selectedNode) || nearestBaseline(sector, date, slotId) };
  let latest = getLatestAfter(baseline, sector, slotId, tolerance, sameNode ? baseline.nodeCallsign : '');
  if (!latest && allowWiden && tolerance < CONFIG.widenedToleranceMinutes) {
    tolerance = CONFIG.widenedToleranceMinutes;
    latest = getLatestAfter(baseline, sector, slotId, tolerance, sameNode ? baseline.nodeCallsign : '');
    widened = Boolean(latest);
  }
  return { baseline, latest, widened, tolerance, nearest:null };
}

function updateNodeOptions(preferredNode) {
  const sector = $('#region-select').value;
  const sectorNodes = nodes.filter((node) => node.sector === sector);
  $('#node-select').innerHTML = sectorNodes.map((node) => `<option value="${escapeHTML(node.callsign)}">${escapeHTML(node.callsign)} · ${escapeHTML(node.equipment)}</option>`).join('');
  if (preferredNode && sectorNodes.some((node) => node.callsign === preferredNode)) $('#node-select').value = preferredNode;
  $('#node-select').disabled = !$('#same-node').checked;
}

function updateSelectionSummary() {
  const result = resolvePair();
  const host = $('#selection-summary');
  const empty = $('#selection-empty');
  empty.hidden = true;
  host.innerHTML = '';
  if (!result.baseline) {
    host.innerHTML = '<p class="empty-state">No frame is available for this date and time.</p>';
    if (result.nearest) {
      empty.hidden = false;
      empty.innerHTML = `No frame for <strong>${escapeHTML($('#baseline-date').value)}</strong> at this time. Nearest available: <strong>${escapeHTML(result.nearest.localDate)} · ${escapeHTML(result.nearest.localTime)} local · ${escapeHTML(result.nearest.nodeCallsign)}</strong>. <button class="btn-ghost" id="use-nearest" type="button">Use nearest date</button>`;
      $('#use-nearest').addEventListener('click', () => {
        $('#baseline-date').value = result.nearest.localDate;
        if ($('#same-node').checked) updateNodeOptions(result.nearest.nodeCallsign);
        updateSelectionSummary();
        updateUrl();
      }, { once:true });
    } else {
      empty.hidden = false;
      empty.textContent = 'No frames exist in the archive for this region and time window.';
    }
    updateUrl();
    return result;
  }
  const baselineText = `<article class="frame-match"><strong>Baseline · ${escapeHTML(result.baseline.localDate)}</strong><p>${escapeHTML(frameStamp(result.baseline))} · ${escapeHTML(ageLabel(result.baseline))}</p><p class="frame-meta">Node ${escapeHTML(result.baseline.nodeCallsign)} · ${result.baseline.exposureSeconds}s · time mismatch ${localMismatchMinutes(result.baseline, $('#time-slot').value)} min</p></article>`;
  const latestText = result.latest
    ? `<article class="frame-match"><strong>Latest · ${escapeHTML(result.latest.localDate)}</strong><p>${escapeHTML(frameStamp(result.latest))} · ${escapeHTML(ageLabel(result.latest))}</p><p class="frame-meta">Node ${escapeHTML(result.latest.nodeCallsign)} · ${result.latest.exposureSeconds}s · time mismatch ${localMismatchMinutes(result.latest, $('#time-slot').value)} min</p></article>`
    : '<article class="frame-match"><strong>Latest</strong><p>No later matching frame was found. Choose an earlier baseline date.</p></article>';
  host.innerHTML = baselineText + latestText;
  if (result.widened) {
    empty.hidden = false;
    empty.textContent = 'A matching frame was found only after widening the local-time tolerance to ±3 hours.';
  } else if (!result.latest) {
    empty.hidden = false;
    empty.textContent = 'No later frame matched this region, time, and node. Choose an earlier baseline or turn off same-node matching.';
  } else if (Date.parse(result.latest.timestampUTC) <= Date.parse(result.baseline.timestampUTC)) {
    empty.hidden = false;
    empty.textContent = 'The baseline must be older than the latest frame. Choose an earlier date.';
  }
  updateUrl();
  return result;
}

function queryState() {
  const params = new URLSearchParams(location.search);
  return {
    sector:params.get('sector'), date:params.get('date'), slot:params.get('slot'), node:params.get('node'),
    sameNode:params.get('sameNode') === '1', compare:params.get('compare') === '1'
  };
}

function updateUrl() {
  const params = new URLSearchParams();
  params.set('sector', $('#region-select').value);
  params.set('date', $('#baseline-date').value);
  params.set('slot', $('#time-slot').value);
  if ($('#same-node').checked) {
    params.set('sameNode', '1');
    params.set('node', $('#node-select').value);
  }
  if (state.result) params.set('compare', '1');
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
}

function renderSelectionOptions() {
  $('#region-select').innerHTML = sectors.map((sector) => `<option value="${escapeHTML(sector.name)}">${escapeHTML(sector.name)}</option>`).join('');
  $('#time-slot').innerHTML = timeSlots.map((slot) => `<option value="${escapeHTML(slot.id)}">${escapeHTML(slot.label)} · ${String(Math.floor(slot.minuteOfDay / 60)).padStart(2, '0')}:${String(slot.minuteOfDay % 60).padStart(2, '0')} local</option>`).join('');
  const dates = [...new Set(frameArchive.map((frame) => frame.localDate))].sort();
  $('#baseline-date').min = dates[0];
  $('#baseline-date').max = dates.at(-1);
  const params = queryState();
  const validSector = sectors.some((sector) => sector.name === params.sector);
  const validSlot = timeSlots.some((slot) => slot.id === params.slot);
  const validDate = dates.includes(params.date);
  const invalidSharedSelection = Boolean((params.sector && !validSector) || (params.slot && !validSlot) || (params.date && !validDate));
  $('#region-select').value = validSector ? params.sector : sectors[0].name;
  $('#time-slot').value = validSlot ? params.slot : 'late-evening';
  updateNodeOptions(params.node);
  $('#same-node').checked = params.sameNode;
  $('#node-select').disabled = !params.sameNode;
  const latestArchiveDate = dates.at(-1);
  $('#baseline-date').value = validDate ? params.date : dateShift(latestArchiveDate, -7);
  updateSelectionSummary();
  if (invalidSharedSelection) {
    const notice = $('#selection-empty');
    notice.hidden = false;
    notice.append(document.createTextNode(' A value in this shared link is no longer available; valid archive selections were substituted.'));
  }
  return params;
}

function exposureNormalize(canvas, frame, targetExposure) {
  const context = canvas.getContext('2d');
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const factor = clamp(targetExposure / frame.exposureSeconds, .55, 1.8);
  for (let index = 0; index < image.data.length; index += 4) {
    image.data[index] = Math.min(255, image.data[index] * factor);
    image.data[index + 1] = Math.min(255, image.data[index + 1] * factor);
    image.data[index + 2] = Math.min(255, image.data[index + 2] * factor);
  }
  context.putImageData(image, 0, 0);
}

function seededCanvasRandom(seed) {
  let value = Number(seed) >>> 0 || 1;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function addCloudTexture(canvas, frame) {
  const cellSize = 8;
  const columns = Math.ceil(canvas.width / cellSize);
  const rows = Math.floor(canvas.height * CONFIG.canvas.clearSkyFraction / cellSize);
  const cells = [];
  const random = seededCanvasRandom(frame.seed ^ 0x5f3759df);
  const noise = Array.from({ length:rows }, () => Array.from({ length:columns }, () => random()));
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      let weightedValue = noise[row][column] * 4;
      let totalWeight = 4;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const neighborRow = row + dy;
          const neighborColumn = column + dx;
          if (noise[neighborRow]?.[neighborColumn] === undefined) continue;
          weightedValue += noise[neighborRow][neighborColumn];
          totalWeight += 1;
        }
      }
      cells.push({ row, column, value:weightedValue / totalWeight });
    }
  }
  cells.sort((a, b) => b.value - a.value);
  const cloudCellCount = Math.round(cells.length * frame.cloudFractionPct / 100);
  const context = canvas.getContext('2d');
  context.save();
  context.filter = 'blur(1px)';
  context.fillStyle = 'rgba(190, 207, 226, .76)';
  cells.slice(0, cloudCellCount).forEach(({ row, column }) => {
    context.fillRect(column * cellSize, row * cellSize, cellSize, cellSize);
  });
  context.restore();
}

function makeFrameCanvas(frame, targetExposure) {
  const canvas = document.createElement('canvas');
  canvas.width = CONFIG.canvas.width;
  canvas.height = CONFIG.canvas.height;
  drawFrame(canvas, {
    seed:frame.seed,
    cloud:0,
    glow:frame.skyBackground / 100,
    size:CONFIG.canvas,
    starCount:frame.starCount,
    transparency:frame.transparency,
    moonIllumination:frame.moonIllumination,
    haze:100 - frame.transparency,
    lightPollution:frame.viirsRadiance
  });
  exposureNormalize(canvas, frame, targetExposure);
  addCloudTexture(canvas, frame);
  return canvas;
}

function luminance(data, index) {
  return .2126 * data[index] + .7152 * data[index + 1] + .0722 * data[index + 2];
}

function inspectCanvas(canvas) {
  const { width, height } = canvas;
  const context = canvas.getContext('2d', { willReadFrequently:true });
  const pixels = context.getImageData(0, 0, width, height);
  let backgroundTotal = 0;
  let backgroundCount = 0;
  let horizonTotal = 0;
  let horizonCount = 0;
  const peaks = [];
  const sample = (x, y) => luminance(pixels.data, (y * width + x) * 4);
  for (let y = 4; y < height * CONFIG.canvas.clearSkyFraction; y += 1) {
    for (let x = 4; x < width - 4; x += 1) {
      const value = sample(x, y);
      if (value < CONFIG.canvas.backgroundCutoff) { backgroundTotal += value; backgroundCount += 1; }
      if (y > height * .68 && x % 3 === 0 && y % 3 === 0) { horizonTotal += value; horizonCount += 1; }
      if (value < CONFIG.canvas.peakCutoff) continue;
      let isPeak = true;
      for (let dy = -2; dy <= 2 && isPeak; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          if (!dx && !dy) continue;
          if (sample(x + dx, y + dy) > value) { isPeak = false; break; }
        }
      }
      if (isPeak && !(x > width * .76 && x < width * .9 && y > height * .1 && y < height * .3)) peaks.push(value);
    }
  }
  const backgroundMean = backgroundCount ? backgroundTotal / backgroundCount : 0;
  const horizonMean = horizonCount ? horizonTotal / horizonCount : 0;
  const meanPeak = peaks.length ? peaks.reduce((sum, value) => sum + value, 0) / peaks.length : 0;
  const cellSize = CONFIG.canvas.cloudCellSize;
  const columns = Math.ceil(width / cellSize);
  const rows = Math.floor(height * CONFIG.canvas.clearSkyFraction / cellSize);
  let cloudCells = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = Math.min(width - 1, column * cellSize + Math.floor(cellSize / 2));
      const y = Math.min(height - 1, row * cellSize + Math.floor(cellSize / 2));
      const index = (y * width + x) * 4;
      if (pixels.data[index] > CONFIG.canvas.cloudRedCutoff && pixels.data[index + 1] > CONFIG.canvas.cloudGreenCutoff && pixels.data[index + 2] > CONFIG.canvas.cloudBlueCutoff) cloudCells += 1;
    }
  }
  const moonX = Math.round(width * CONFIG.canvas.moonX);
  const moonY = Math.round(height * CONFIG.canvas.moonY);
  const moonCenter = sample(moonX, moonY);
  const surroundingMoon = [[-18,0],[18,0],[0,-18],[0,18],[-14,-14],[14,14]].reduce((sum, [dx, dy]) => sum + sample(moonX + dx, moonY + dy), 0) / 6;
  return {
    pixels,
    starCount:peaks.length,
    skyBackground:Number(clamp(Math.round(backgroundMean * CONFIG.canvas.luminanceScale), 0, 100).toFixed(0)),
    transparency:Number(clamp(Math.round((meanPeak - backgroundMean) * CONFIG.canvas.contrastScale), 0, 100).toFixed(0)),
    viirsRadiance:Number(clamp(Math.round(horizonMean * CONFIG.canvas.horizonScale), 0, 180).toFixed(0)),
    cloudFractionPct:Number((cloudCells / (columns * rows) * 100).toFixed(1)),
    moonIllumination:Number(clamp(Math.round((moonCenter - surroundingMoon) * CONFIG.canvas.moonScale), 0, 100).toFixed(0))
  };
}

function renderCanvas(frame) {
  const baseline = state.pair.baseline;
  const latest = state.pair.latest;
  const targetExposure = Math.sqrt(baseline.exposureSeconds * latest.exposureSeconds);
  const before = makeFrameCanvas(baseline, targetExposure);
  const after = makeFrameCanvas(latest, targetExposure);
  const beforeMeasurements = inspectCanvas(before);
  const afterMeasurements = inspectCanvas(after);
  const metricsBefore = {
    cloud:beforeMeasurements.cloudFractionPct,
    skyBackground:beforeMeasurements.skyBackground,
    starCount:beforeMeasurements.starCount,
    transparency:beforeMeasurements.transparency,
    viirsRadiance:beforeMeasurements.viirsRadiance,
    moon:beforeMeasurements.moonIllumination,
    status:computeSubmissionStatus({ cloudFractionPct:beforeMeasurements.cloudFractionPct, viirsRadiance:beforeMeasurements.viirsRadiance })
  };
  const metricsAfter = {
    cloud:afterMeasurements.cloudFractionPct,
    skyBackground:afterMeasurements.skyBackground,
    starCount:afterMeasurements.starCount,
    transparency:afterMeasurements.transparency,
    viirsRadiance:afterMeasurements.viirsRadiance,
    moon:afterMeasurements.moonIllumination,
    status:computeSubmissionStatus({ cloudFractionPct:afterMeasurements.cloudFractionPct, viirsRadiance:afterMeasurements.viirsRadiance })
  };
  return { before, after, beforeMeasurements, afterMeasurements, metricsBefore, metricsAfter };
}

function deltaMetric(key, before, after) {
  if (key === 'status') return { delta:before === after ? 'No change' : `${before} → ${after}`, magnitude:before === after ? 0 : 3, significance:before === after ? 0 : 2, direction:before === after ? '↔' : '↗', deltaLabel:before === after ? 'No change' : 'Changed' };
  const delta = after - before;
  const relative = before === 0 ? (after === 0 ? 0 : 100) : Math.abs(delta / before) * 100;
  const thresholds = CONFIG.significance[key];
  const magnitude = key === 'starCountPct' || key === 'viirsPct' ? relative : Math.abs(delta);
  const significance = magnitude <= thresholds[0] ? 0 : magnitude <= thresholds[1] ? 1 : 2;
  return { delta, magnitude, significance, direction:delta > 0 ? '↑' : delta < 0 ? '↓' : '↔', deltaLabel:`${delta > 0 ? '+' : ''}${Number(delta.toFixed(1))}` };
}

function makeMetrics(pair, images) {
  const items = [
    { key:'cloud', label:'Cloud fraction', unit:'%', before:images.metricsBefore.cloud, after:images.metricsAfter.cloud, thresholdKey:'cloud' },
    { key:'skyBackground', label:'Sky background brightness', unit:' / 100', before:images.metricsBefore.skyBackground, after:images.metricsAfter.skyBackground, thresholdKey:'skyBackground' },
    { key:'starCountPct', label:'Visible star peaks', unit:'stars', before:images.metricsBefore.starCount, after:images.metricsAfter.starCount, thresholdKey:'starCountPct' },
    { key:'transparency', label:'Transparency estimate', unit:' / 100', before:images.metricsBefore.transparency, after:images.metricsAfter.transparency, thresholdKey:'transparency' },
    { key:'viirsPct', label:'VIIRS radiance proxy (simulated)', unit:' / 180', before:images.metricsBefore.viirsRadiance, after:images.metricsAfter.viirsRadiance, thresholdKey:'viirsPct' },
    { key:'moon', label:'Moon illumination', unit:'%', before:images.metricsBefore.moon, after:images.metricsAfter.moon, thresholdKey:'moon' },
    { key:'status', label:'Accept / reject status', unit:'', before:images.metricsBefore.status, after:images.metricsAfter.status, thresholdKey:'status' }
  ].map((item) => {
    const deltaInfo = item.key === 'starCountPct'
      ? { ...deltaMetric(item.thresholdKey, item.before, item.after), deltaLabel:`${item.after - item.before > 0 ? '+' : ''}${item.after - item.before} (${item.before ? ((item.after - item.before) / item.before * 100).toFixed(0) : 0}%)` }
      : item.key === 'viirsPct'
        ? { ...deltaMetric(item.thresholdKey, item.before, item.after), deltaLabel:`${item.after - item.before > 0 ? '+' : ''}${Number((item.after - item.before).toFixed(1))} (${item.before ? ((item.after - item.before) / item.before * 100).toFixed(0) : 0}%)` }
        : deltaMetric(item.thresholdKey, item.before, item.after);
    return { ...item, ...deltaInfo };
  });
  return items.sort((a, b) => (b.significance ?? 0) - (a.significance ?? 0) || b.magnitude - a.magnitude);
}

function formatMetric(value, item) {
  if (item.key === 'status') return escapeHTML(value);
  return `${Number(value).toLocaleString([], { maximumFractionDigits:1 })}${item.unit}`;
}

function significanceName(score = 0) {
  return score >= 2 ? 'Major' : score === 1 ? 'Notable' : 'Minor';
}

function renderMetrics(metrics) {
  const notableOnly = $('#notable-filter').checked;
  const visible = metrics.filter((item) => !notableOnly || (item.significance || 0) > 0);
  const rows = visible.map((item) => `<tr><td>${escapeHTML(item.label)}</td><td>${formatMetric(item.before, item)}</td><td>${formatMetric(item.after, item)}</td><td class="metric-delta"><span class="direction" aria-hidden="true">${escapeHTML(item.direction)}</span> ${escapeHTML(item.deltaLabel)}</td><td><span class="significance ${significanceName(item.significance).toLowerCase()}">${significanceName(item.significance)}</span></td></tr>`).join('');
  $('#metric-table-wrap').innerHTML = `<table class="table metric-table"><thead><tr><th scope="col">Measure</th><th scope="col">Baseline</th><th scope="col">Latest</th><th scope="col">Delta</th><th scope="col">Significance</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No notable or major changes in this view.</td></tr>'}</tbody></table>`;
  $('#metric-cards').innerHTML = visible.map((item) => `<article class="metric-card"><h3>${escapeHTML(item.label)} <span class="significance ${significanceName(item.significance).toLowerCase()}">${significanceName(item.significance)}</span></h3><dl><div><dt>Baseline</dt><dd>${formatMetric(item.before, item)}</dd></div><div><dt>Latest</dt><dd>${formatMetric(item.after, item)}</dd></div><div><dt>Delta</dt><dd>${escapeHTML(item.direction)} ${escapeHTML(item.deltaLabel)}</dd></div></dl></article>`).join('') || '<p class="empty-state">No notable or major changes in this view.</p>';
}

function localMinuteOfNight(frame) {
  const [hour, minute] = frame.localTime.split(':').map(Number);
  return hour * 60 + minute;
}

function comparability(pair) {
  const before = pair.baseline;
  const after = pair.latest;
  const exposureDiff = Math.abs(after.exposureSeconds - before.exposureSeconds) / Math.max(before.exposureSeconds, 1) * 100;
  const timeDiff = Math.abs(localMinuteOfNight(before) - localMinuteOfNight(after));
  const checks = [
    { label:'Same observing node', value:before.nodeCallsign === after.nodeCallsign, detail:`${before.nodeCallsign} · ${after.nodeCallsign}` },
    { label:'Exposure within 25%', value:exposureDiff <= CONFIG.exposureWarningPct, detail:`${before.exposureSeconds}s · ${after.exposureSeconds}s (${exposureDiff.toFixed(0)}% difference)` },
    { label:'Same camera profile', value:before.cameraProfile === after.cameraProfile, detail:before.cameraProfile === after.cameraProfile ? 'Profiles match' : 'Profiles differ' },
    { label:'Time of night within 90 min', value:timeDiff <= CONFIG.matchToleranceMinutes, detail:`${timeDiff} min difference` },
    { label:'Moon illumination within 30 points', value:Math.abs(after.moonIllumination - before.moonIllumination) < CONFIG.moonWarningPoints, detail:`${before.moonIllumination}% · ${after.moonIllumination}%` }
  ];
  return { checks, hasWarning:checks.some((check) => !check.value), exposureDiff, timeDiff };
}

function renderComparability(pair) {
  const result = comparability(pair);
  $('#condition-list').innerHTML = result.checks.map((check) => `<div class="condition-item ${check.value ? '' : 'warning'}"><span class="condition-mark" aria-hidden="true">${check.value ? '✓' : '!'}</span><span><strong>${escapeHTML(check.label)}</strong>${escapeHTML(check.detail)}</span></div>`).join('');
  $('#condition-warning').hidden = !result.hasWarning;
  return result;
}

function buildDifferenceMap(before, after) {
  const sourceBefore = before.getContext('2d').getImageData(0, 0, before.width, before.height).data;
  const sourceAfter = after.getContext('2d').getImageData(0, 0, after.width, after.height).data;
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = before.width;
  outputCanvas.height = before.height;
  const context = outputCanvas.getContext('2d');
  const output = context.createImageData(outputCanvas.width, outputCanvas.height);
  for (let index = 0; index < sourceBefore.length; index += 4) {
    const difference = (Math.abs(sourceBefore[index] - sourceAfter[index]) + Math.abs(sourceBefore[index + 1] - sourceAfter[index + 1]) + Math.abs(sourceBefore[index + 2] - sourceAfter[index + 2])) / 3;
    const intensity = clamp((difference - 7) * 4, 0, 255);
    output.data[index] = Math.min(255, intensity * 1.25);
    output.data[index + 1] = Math.max(0, 185 - intensity * .45);
    output.data[index + 2] = Math.max(0, 255 - intensity * 1.05);
    output.data[index + 3] = intensity > 10 ? 255 : 25;
  }
  context.putImageData(output, 0, 0);
  return outputCanvas;
}

function displayCanvas(target, source) {
  target.width = source.width;
  target.height = source.height;
  target.getContext('2d').drawImage(source, 0, 0);
}

function paintViewer() {
  if (!state.result) return;
  const { before, after, diff } = state.result;
  const left = state.reversed ? after : before;
  const right = state.reversed ? before : after;
  displayCanvas($('#slider-baseline'), left);
  displayCanvas($('#slider-latest'), right);
  displayCanvas($('#side-baseline'), left);
  displayCanvas($('#side-latest'), right);
  $('#side-baseline-caption').textContent = state.reversed ? `Latest · ${frameStamp(state.pair.latest)}` : `Baseline · ${frameStamp(state.pair.baseline)}`;
  $('#side-latest-caption').textContent = state.reversed ? `Baseline · ${frameStamp(state.pair.baseline)}` : `Latest · ${frameStamp(state.pair.latest)}`;
  const reveal = Number($('#slider-range').value);
  $('#slider-latest').style.clipPath = `inset(0 0 0 ${100 - reveal}%)`;
  $('#slider-divider').style.left = `${reveal}%`;
  $('#slider-value').textContent = `${reveal}%`;
  $('#slider-range').setAttribute('aria-valuetext', `${reveal} percent ${state.reversed ? 'baseline' : 'latest'} frame visible`);
  displayCanvas($('#difference-background'), state.reversed ? after : before);
  displayCanvas($('#difference-map'), diff);
  $('#difference-map').style.opacity = `${Number($('#difference-opacity').value) / 100}`;
  $('#difference-opacity-value').textContent = `${$('#difference-opacity').value}%`;
  $('#slider-view').querySelector('.before-label').textContent = state.reversed ? 'Latest' : 'Baseline';
  $('#slider-view').querySelector('.after-label').textContent = state.reversed ? 'Baseline' : 'Latest';
}

function metricValue(metrics, key) {
  return metrics.find((item) => item.key === key);
}

function buildAlerts(pair, metrics) {
  const before = pair.baseline;
  const after = pair.latest;
  const cloud = metricValue(metrics, 'cloud');
  const stars = metricValue(metrics, 'starCountPct');
  const sky = metricValue(metrics, 'skyBackground');
  const transparency = metricValue(metrics, 'transparency');
  const viirs = metricValue(metrics, 'viirsPct');
  const alerts = [];
  const add = (severity, title, evidence) => alerts.push({ severity, title, evidence, timestamp:after.timestampUTC, isNew:true });
  if (cloud.after - cloud.before > CONFIG.alerts.cloudIncrease || (cloud.before <= CONFIG.alerts.rejectionCloudPct && cloud.after > CONFIG.alerts.rejectionCloudPct)) {
    add(cloud.after > CONFIG.alerts.rejectionCloudPct ? 'critical' : 'warning', cloud.after > CONFIG.alerts.rejectionCloudPct ? 'Cloud cover crossed the rejection threshold' : 'Cloud cover increased sharply', `Cloud fraction ${cloud.before.toFixed(1)}% → ${cloud.after.toFixed(1)}% (+${(cloud.after - cloud.before).toFixed(1)} points).`);
  }
  if (before.status === 'Accepted' && after.status !== 'Accepted') add('critical', 'Observation status changed to rejected', `${before.status} → ${after.status}; the shared rule rejects cloud above 35% or VIIRS radiance above 75.`);
  const starDropPct = stars.before ? (stars.before - stars.after) / stars.before * 100 : 0;
  if (starDropPct > CONFIG.alerts.starDecreasePct && cloud.after - cloud.before < CONFIG.alerts.cloudMatchAllowance) add('warning', 'Fewer visible stars without a matching cloud increase', `${stars.before} → ${stars.after} detected peaks (${starDropPct.toFixed(0)}% decrease); cloud changed ${(cloud.after - cloud.before).toFixed(1)} points. Possible haze, dust, or smoke.`);
  if (sky.after - sky.before > CONFIG.alerts.skyBackgroundIncrease) add('warning', 'Sky background became brighter', `${sky.before} → ${sky.after} / 100 (+${sky.after - sky.before} points); moonlight or a new light source may contribute.`);
  const viirsRise = viirs.before ? (viirs.after - viirs.before) / viirs.before * 100 : 0;
  if (viirsRise > CONFIG.alerts.viirsIncreasePct) add('warning', 'Simulated VIIRS radiance increased', `${viirs.before.toFixed(1)} → ${viirs.after.toFixed(1)} (${viirsRise.toFixed(0)}% increase).`);
  if (transparency.before - transparency.after > CONFIG.alerts.transparencyDecrease) add('warning', 'Transparency estimate decreased', `${transparency.before} → ${transparency.after} / 100 (−${transparency.before - transparency.after} points).`);
  return alerts;
}

function renderAlerts(alerts) {
  $('#alert-count').textContent = `${alerts.length} new alert${alerts.length === 1 ? '' : 's'}`;
  $('#alerts-list').innerHTML = alerts.length ? alerts.map((alert) => `<article class="alert-card ${alert.severity}"><h3>${escapeHTML(alert.title)} <span class="new-tag">NEW</span></h3><p><strong>${alert.severity.toUpperCase()}</strong> · ${escapeHTML(alert.evidence)}</p><time datetime="${escapeHTML(alert.timestamp)}">Since baseline · ${escapeHTML(formatDate(alert.timestamp, { hour:'2-digit', minute:'2-digit', timeZone:'UTC' }))} UTC</time></article>`).join('') : '<p class="calm-state">No new alerts. The measured changes stayed within the configured alert rules.</p>';
}

function linearProjection(values) {
  const count = values.length;
  const meanX = (count - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / count;
  let numerator = 0;
  let denominator = 0;
  values.forEach((value, index) => { numerator += (index - meanX) * (value - meanY); denominator += (index - meanX) ** 2; });
  const slope = denominator ? numerator / denominator : 0;
  let ewma = values[0];
  for (let index = 1; index < count; index += 1) ewma = CONFIG.forecast.ewmaAlpha * values[index] + (1 - CONFIG.forecast.ewmaAlpha) * ewma;
  return { slope, ewma, last:values.at(-1), mean:meanY };
}

function standardDeviation(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

function qualityFor(cloud, stars) {
  if (cloud <= CONFIG.forecast.goodCloud && stars >= CONFIG.forecast.goodStars) return 'Good';
  if (cloud < CONFIG.forecast.fairCloud && stars >= 28) return 'Fair';
  return 'Poor';
}

function makeForecast(sector, slotId) {
  const history = getHistory(sector, slotId, CONFIG.forecast.historyNights);
  if (history.length < CONFIG.forecast.minimumNights) return { history, projections:[], insufficient:true };
  const clouds = history.map((frame) => frame.cloudFractionPct);
  const stars = history.map((frame) => frame.starCount);
  const cloudTrend = linearProjection(clouds);
  const starTrend = linearProjection(stars);
  const noise = (standardDeviation(clouds) + standardDeviation(stars.map((value) => value / 2))) / 2;
  const confidence = noise <= CONFIG.forecast.highNoise ? 'High' : noise <= CONFIG.forecast.mediumNoise ? 'Medium' : 'Low';
  const projections = [1, 2, 3].map((days) => {
    const cloudLinear = cloudTrend.last + cloudTrend.slope * days;
    const starLinear = starTrend.last + starTrend.slope * days;
    const cloud = clamp((1 - CONFIG.forecast.trendBlend) * cloudTrend.ewma + CONFIG.forecast.trendBlend * cloudLinear, 0, 100);
    const star = clamp((1 - CONFIG.forecast.trendBlend) * starTrend.ewma + CONFIG.forecast.trendBlend * starLinear, 0, 240);
    return { hours:days * 24, cloud, stars:star, quality:qualityFor(cloud, star), confidence, uncertainty:CONFIG.forecast.uncertaintyBase + noise * days * .35 };
  });
  return { history, projections, confidence, noise, insufficient:false };
}

function renderForecast(forecast) {
  const host = $('#forecast-summary');
  const canvas = $('#forecast-chart');
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (forecast.insufficient) {
    host.innerHTML = '<p class="empty-state">Not enough data to predict. At least five nights are required.</p>';
    context.fillStyle = '#8492B1';
    context.font = '14px Inter, sans-serif';
    context.fillText('Not enough recent nights for a projection.', 18, 40);
    return forecast;
  }
  host.innerHTML = forecast.projections.map((item) => `<article class="forecast-card ${item.quality.toLowerCase()}"><strong>${item.hours} h · ${item.quality}</strong><span>${item.confidence} confidence · cloud ${item.cloud.toFixed(0)}% · stars ${item.stars.toFixed(0)}</span></article>`).join('');
  const width = canvas.width;
  const height = canvas.height;
  const pad = { left:44, right:16, top:18, bottom:32 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const historyCount = forecast.history.length;
  const totalPoints = historyCount + forecast.projections.length;
  const x = (index) => pad.left + index / (totalPoints - 1) * plotWidth;
  const y = (value) => pad.top + (100 - clamp(value, 0, 100)) / 100 * plotHeight;
  context.font = '10px Inter, sans-serif';
  context.fillStyle = '#8492B1';
  context.strokeStyle = 'rgba(190,219,255,.12)';
  context.lineWidth = 1;
  [0, 25, 50, 75, 100].forEach((tick) => {
    const tickY = y(tick);
    context.beginPath(); context.moveTo(pad.left, tickY); context.lineTo(width - pad.right, tickY); context.stroke();
    context.fillText(String(tick), 10, tickY + 3);
  });
  const cloudValues = forecast.history.map((frame) => frame.cloudFractionPct);
  const starValues = forecast.history.map((frame) => frame.starCount / 2.4);
  const cloudLine = linearProjection(cloudValues);
  const starLine = linearProjection(starValues);
  const projectedClouds = forecast.projections.map((item) => item.cloud);
  const projectedStars = forecast.projections.map((item) => item.stars / 2.4);
  const drawLine = (values, startIndex, color, dashed = false) => {
    context.beginPath();
    values.forEach((value, index) => index ? context.lineTo(x(startIndex + index), y(value)) : context.moveTo(x(startIndex + index), y(value)));
    context.strokeStyle = color; context.lineWidth = 2; context.setLineDash(dashed ? [5, 4] : []); context.stroke(); context.setLineDash([]);
  };
  const cloudBand = forecast.projections.map((item, index) => ({ center:item.cloud, spread:item.uncertainty * (index + 1) }));
  context.beginPath();
  cloudBand.forEach((item, index) => index ? context.lineTo(x(historyCount + index - 1), y(item.center + item.spread)) : context.moveTo(x(historyCount - 1), y(item.center + item.spread)));
  [...cloudBand].reverse().forEach((item, index) => context.lineTo(x(historyCount + cloudBand.length - 1 - index), y(item.center - item.spread)));
  context.closePath(); context.fillStyle = 'rgba(245,165,36,.12)'; context.fill();
  drawLine(cloudValues, 0, '#F5A524');
  drawLine([cloudValues.at(-1), ...projectedClouds], historyCount - 1, '#F5A524', true);
  drawLine(starValues, 0, '#38BDF8');
  drawLine([starValues.at(-1), ...projectedStars], historyCount - 1, '#38BDF8', true);
  context.fillStyle = '#F5A524'; context.fillText('Cloud %', pad.left, height - 9);
  context.fillStyle = '#38BDF8'; context.fillText('Star count ÷ 2.4', pad.left + 70, height - 9);
  context.fillStyle = '#8492B1'; context.fillText('Recent', pad.left, 13); context.fillText('Projection →', width - 82, 13);
  return forecast;
}

function reasonConfidence(score) {
  return score >= 65 ? 'Likely' : score >= 35 ? 'Possible' : 'Can’t rule out';
}

function rankReasons(pair, metrics, checks) {
  const value = (key) => metricValue(metrics, key);
  const cloud = value('cloud');
  const stars = value('starCountPct');
  const sky = value('skyBackground');
  const viirs = value('viirsPct');
  const moon = value('moon');
  const transparency = value('transparency');
  const cloudRise = cloud.after - cloud.before;
  const starDrop = stars.before ? (stars.before - stars.after) / stars.before * 100 : 0;
  const moonRise = moon.after - moon.before;
  const lightRise = viirs.before ? (viirs.after - viirs.before) / viirs.before * 100 : 0;
  const reasons = [
    { title:'Increased cloud cover', score:cloudRise > CONFIG.reasonThresholds.cloudLikely ? 82 : cloudRise > CONFIG.reasonThresholds.cloudPossible ? 52 : 12, evidence:`Cloud fraction changed ${cloud.before.toFixed(1)}% → ${cloud.after.toFixed(1)}% (${cloudRise > 0 ? '+' : ''}${cloudRise.toFixed(1)} points).`, verify:'Compare another clear-sky frame and check cloud products for the same local time.' },
    { title:'Atmospheric haze, dust, or smoke', score:starDrop > CONFIG.reasonThresholds.hazeStarsPct && cloudRise < CONFIG.reasonThresholds.hazeCloudAllowance ? 76 : transparency.before - transparency.after > CONFIG.reasonThresholds.hazeTransparency ? 48 : 10, evidence:`Detected stars changed ${stars.before} → ${stars.after}; transparency estimate changed ${transparency.before} → ${transparency.after}.`, verify:'Check aerosol optical depth, visibility reports, and local dust or smoke advisories.' },
    { title:'Brighter moon', score:moonRise > CONFIG.reasonThresholds.moonLikely ? 68 : moonRise > CONFIG.reasonThresholds.moonPossible ? 42 : 10, evidence:`Moon illumination changed ${moon.before}% → ${moon.after}%; sky background changed ${sky.before} → ${sky.after} / 100.`, verify:'Compare observations at similar lunar phase or inspect a moonrise / moonset ephemeris.' },
    { title:'Increased artificial light', score:lightRise > CONFIG.reasonThresholds.lightLikely && sky.after - sky.before > CONFIG.reasonThresholds.lightBackgroundRise ? 78 : lightRise > CONFIG.reasonThresholds.lightPossible ? 44 : 8, evidence:`Simulated VIIRS radiance changed ${viirs.before.toFixed(1)} → ${viirs.after.toFixed(1)}; background brightness changed ${sky.before} → ${sky.after}.`, verify:'Review independent night-lights composites and check for new construction or lighting.' },
    { title:'Equipment or timing difference', score:checks.hasWarning ? CONFIG.reasonWeights.equipment + 25 : 8, evidence:`Node ${pair.baseline.nodeCallsign} → ${pair.latest.nodeCallsign}; camera profile ${pair.baseline.cameraProfile} → ${pair.latest.cameraProfile}; local-time difference ${checks.timeDiff} min.`, verify:'Repeat with the same node, camera profile, local observing window, and normalized exposure.' },
    { title:'Time-of-night mismatch', score:checks.timeDiff > CONFIG.matchToleranceMinutes ? CONFIG.reasonWeights.timing + 25 : checks.timeDiff > CONFIG.reasonThresholds.timingPossible ? 40 : 8, evidence:`Matched local-time difference: ${checks.timeDiff} minutes.`, verify:'Choose the same local observing window and compare again.' },
    { title:'Normal night-to-night variation', score:CONFIG.reasonWeights.normalVariation, evidence:'Clouds, transparency, and sky brightness naturally vary from night to night.', verify:'Collect several more comparable nights before treating a single change as persistent.' }
  ];
  return reasons.sort((a, b) => b.score - a.score);
}

function renderReasons(reasons) {
  $('#reasons-list').innerHTML = reasons.map((reason) => `<li><div class="reason-top"><strong>${escapeHTML(reason.title)}</strong><span class="confidence">${reasonConfidence(reason.score)} · ${reason.score}%</span></div><p><strong>Evidence:</strong> ${escapeHTML(reason.evidence)}</p><p><strong>How to verify:</strong> ${escapeHTML(reason.verify)}</p></li>`).join('');
}

function makeSummary(pair, metrics, alerts, forecast) {
  const cloud = metricValue(metrics, 'cloud');
  const stars = metricValue(metrics, 'starCountPct');
  const cloudChange = cloud.after - cloud.before;
  const starChangePct = stars.before ? (stars.after - stars.before) / stars.before * 100 : 0;
  const quality = forecast.projections[0]?.quality || 'not available';
  const confidence = forecast.projections[0]?.confidence || 'not available';
  const condition = cloudChange > 5 || starChangePct < -10 ? 'Conditions got worse' : cloudChange < -5 || starChangePct > 10 ? 'Conditions improved' : 'Conditions were broadly steady';
  const changes = [];
  if (Math.abs(cloudChange) >= 1) changes.push(`cloud ${cloudChange > 0 ? '+' : ''}${cloudChange.toFixed(0)} points`);
  if (Math.abs(starChangePct) >= 1) changes.push(`${Math.abs(starChangePct).toFixed(0)}% ${starChangePct < 0 ? 'fewer' : 'more'} detected stars`);
  const detail = changes.length ? changes.join(' and ') : 'only small measured differences';
  return `${condition}: ${detail}. ${alerts.length} new alert${alerts.length === 1 ? '' : 's'}. Outlook for the next night: ${quality}${quality === 'not available' ? '' : ` (${confidence.toLowerCase()} confidence)`}.`;
}

function updateWorldview(pair) {
  const sector = sectors.find((item) => item.name === pair.sector);
  const params = new URLSearchParams();
  params.set('v', `${(sector.lng - 3).toFixed(2)},${(sector.lat - 2).toFixed(2)},${(sector.lng + 3).toFixed(2)},${(sector.lat + 2).toFixed(2)}`);
  params.set('t', pair.latest.localDate);
  params.set('compareFrom', pair.baseline.localDate);
  params.set('compareTo', pair.latest.localDate);
  $('#worldview-link').href = `https://worldview.earthdata.nasa.gov/?${params.toString()}`;
}

function renderResult(pair, images) {
  state.pair = pair;
  const checkResult = renderComparability(pair);
  const metrics = makeMetrics(pair, images);
  const alerts = buildAlerts(pair, metrics);
  const forecast = renderForecast(makeForecast(pair.sector, pair.slotId));
  const reasons = rankReasons(pair, metrics, checkResult);
  const summary = makeSummary(pair, metrics, alerts, forecast);
  state.result = { ...images, diff:buildDifferenceMap(images.before, images.after), metrics, alerts, forecast, reasons, summary };
  renderMetrics(metrics);
  renderAlerts(alerts);
  renderReasons(reasons);
  $('#result-summary').textContent = summary;
  $('#result-period').textContent = `${pair.sector} · ${pair.baseline.localDate} → ${pair.latest.localDate}`;
  $('#frame-labels').textContent = `Baseline: ${pair.baseline.localDate}, ${pair.baseline.localTime} · Latest: ${pair.latest.localDate}, ${pair.latest.localTime}`;
  updateWorldview(pair);
  $('#results').hidden = false;
  paintViewer();
  $('#results-title').focus?.({ preventScroll:true });
  updateUrl();
}

async function runComparison(event) {
  event?.preventDefault();
  if (state.busy) return;
  const resolved = resolvePair();
  if (!resolved.baseline || !resolved.latest || resolved.baseline.id === resolved.latest.id || Date.parse(resolved.baseline.timestampUTC) >= Date.parse(resolved.latest.timestampUTC)) {
    updateSelectionSummary();
    $('#selection-empty').hidden = false;
    $('#selection-empty').textContent = !resolved.baseline ? 'Choose a date with an available baseline frame.' : 'The baseline must be older than a distinct latest frame. Choose an earlier date.';
    return;
  }
  state.busy = true;
  const token = ++state.compareToken;
  $('#compare-button').disabled = true;
  $('#compare-progress').hidden = false;
  $('#results').hidden = true;
  await new Promise((resolve) => setTimeout(resolve, 140));
  if (token !== state.compareToken) return;
  try {
    const pair = { ...resolved, sector:$('#region-select').value, slotId:$('#time-slot').value };
    const images = renderCanvas(pair);
    renderResult(pair, images);
  } catch {
    $('#selection-empty').hidden = false;
    $('#selection-empty').textContent = 'The frames could not be measured. Try another date or observing window.';
  } finally {
    $('#compare-progress').hidden = true;
    $('#compare-button').disabled = false;
    state.busy = false;
  }
}

function selectView(view) {
  state.activeView = view;
  document.querySelectorAll('.viewer-tab').forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('.viewer-panel').forEach((panel) => { panel.hidden = panel.id !== `view-${view}`; });
  if (state.result) paintViewer();
}

function bindEvents() {
  $('#selection-form').addEventListener('submit', runComparison);
  ['#region-select', '#baseline-date', '#time-slot', '#same-node', '#node-select'].forEach((selector) => {
    $(selector).addEventListener('change', () => {
      if (selector === '#region-select') updateNodeOptions();
      if (selector === '#same-node') $('#node-select').disabled = !$('#same-node').checked;
      state.result = null;
      $('#results').hidden = true;
      updateSelectionSummary();
    });
  });
  document.querySelectorAll('.preset-button').forEach((button) => button.addEventListener('click', () => {
    const latestDate = $('#baseline-date').max;
    const age = Math.min(Number(button.dataset.daysAgo), archiveConfigurationDays() - 1);
    $('#baseline-date').value = dateShift(latestDate, -age);
    state.result = null;
    $('#results').hidden = true;
    updateSelectionSummary();
  }));
  $('#swap-button').addEventListener('click', () => {
    state.reversed = !state.reversed;
    $('#swap-button').setAttribute('aria-pressed', String(state.reversed));
    if (state.result) paintViewer();
  });
  $('#reset-button').addEventListener('click', () => {
    $('#region-select').value = sectors[0].name;
    $('#time-slot').value = 'late-evening';
    $('#same-node').checked = false;
    updateNodeOptions();
    $('#baseline-date').value = dateShift($('#baseline-date').max, -7);
    state.reversed = false;
    state.result = null;
    $('#results').hidden = true;
    $('#selection-empty').hidden = true;
    updateSelectionSummary();
  });
  $('#slider-range').addEventListener('input', paintViewer);
  $('#difference-opacity').addEventListener('input', paintViewer);
  $('#notable-filter').addEventListener('change', () => state.result && renderMetrics(state.result.metrics));
  document.querySelectorAll('.viewer-tab').forEach((tab) => {
    tab.addEventListener('click', () => selectView(tab.dataset.view));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = [...document.querySelectorAll('.viewer-tab')];
      const index = tabs.indexOf(tab);
      const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[nextIndex].focus();
      selectView(tabs[nextIndex].dataset.view);
    });
  });
  $('#copy-summary').addEventListener('click', async () => {
    if (!state.result) return;
    try {
      await navigator.clipboard.writeText(`${state.result.summary}\n${$('#result-period').textContent}\nSIMULATED DEMO DATA`);
      $('#copy-feedback').textContent = 'Summary copied to clipboard.';
    } catch {
      $('#copy-feedback').textContent = 'Clipboard access is unavailable in this browser context.';
    }
  });
  $('#download-report').addEventListener('click', () => window.print());
}

function archiveConfigurationDays() {
  return new Set(frameArchive.map((frame) => frame.localDate)).size;
}

const initParams = renderSelectionOptions();
bindEvents();
if (initParams.compare) void runComparison();
