import { HIGH_RADIANCE_THRESHOLD, nodes, sectors, submissions } from './data.js';
import { drawFrame } from './frames.js';

const grid = document.querySelector('#submission-grid');
const searchInput = document.querySelector('#frame-search');
const statusSelect = document.querySelector('#status-filter');
const sortSelect = document.querySelector('#sort-filter');
const sectorFilters = document.querySelector('#sector-filters');
const resultCount = document.querySelector('#result-count');
const loadMoreButton = document.querySelector('#load-more');
const emptyState = document.querySelector('#empty-state');
const clearFiltersButton = document.querySelector('#clear-filters');
const dialog = document.querySelector('#frame-dialog');
const dialogClose = document.querySelector('#dialog-close');
const dialogCanvas = document.querySelector('#dialog-canvas');
const nodeByCallsign = new Map(nodes.map((node) => [node.callsign, node]));
const frameById = new Map(submissions.map((frame) => [frame.id, frame]));
const statusValues = new Set(['all', 'accepted', 'rejected-cloud', 'rejected-glare']);
const sortValues = new Set(['newest', 'clearest', 'lowest-radiance']);
const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const sectorBySlug = new Map(sectors.map((sector) => [slug(sector.name), sector.name]));
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const state = { query:'', sector:'', status:'all', sort:'newest', limit:12 };
let visibleFrames = [];
let activeFrameIndex = -1;
let returnFocusTarget = null;
let frameObserver;

function readFiltersFromURL() {
  const params = new URLSearchParams(location.search);
  state.query = params.get('q') || '';
  state.sector = sectorBySlug.get((params.get('sector') || '').toLowerCase()) || '';
  state.status = statusValues.has(params.get('status')) ? params.get('status') : 'all';
  state.sort = sortValues.has(params.get('sort')) ? params.get('sort') : 'newest';
  state.limit = 12;
}

function writeFiltersToURL() {
  const params = new URLSearchParams(location.search);
  for (const key of ['q', 'sector', 'status', 'sort']) params.delete(key);
  if (state.query.trim()) params.set('q', state.query.trim());
  if (state.sector) params.set('sector', slug(state.sector));
  if (state.status !== 'all') params.set('status', state.status);
  if (state.sort !== 'newest') params.set('sort', state.sort);
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
}

function statusFilterLabel(status) {
  if (status === 'accepted') return 'Accepted';
  if (status === 'rejected-cloud') return 'Rejected: cloud';
  if (status === 'rejected-glare') return 'Rejected: glare';
  return 'All statuses';
}

function matchesSearch(frame, query) {
  if (!query) return true;
  const node = nodeByCallsign.get(frame.nodeCallsign);
  return `${frame.nodeCallsign} ${frame.sector} ${node?.equipment || ''}`.toLowerCase().includes(query);
}

function compareFrames(a, b) {
  if (state.sort === 'clearest') {
    return (nodeByCallsign.get(b.nodeCallsign)?.clarityScore || 0) - (nodeByCallsign.get(a.nodeCallsign)?.clarityScore || 0)
      || Date.parse(b.timestamp) - Date.parse(a.timestamp);
  }
  if (state.sort === 'lowest-radiance') {
    return a.viirsRadiance - b.viirsRadiance || Date.parse(b.timestamp) - Date.parse(a.timestamp);
  }
  return Date.parse(b.timestamp) - Date.parse(a.timestamp);
}

function formatHoursAgo(timestamp) {
  const hours = Math.max(0, Math.floor((Date.now() - Date.parse(timestamp)) / 3600000));
  return hours < 1 ? 'Less than an hour ago' : `${hours} hours ago`;
}

function formatTimestamp(timestamp) {
  return new Intl.DateTimeFormat('en', { dateStyle:'medium', timeStyle:'short', timeZone:'UTC' }).format(new Date(timestamp)) + ' UTC';
}

function statusClass(status) {
  return status === 'Accepted' ? 'accepted' : 'rejected';
}

function renderSectorFilters(counts) {
  const options = [{ name:'All', value:'', count:counts.all }, ...sectors.map((sector) => ({ name:sector.name, value:sector.name, count:counts[sector.name] }))];
  sectorFilters.innerHTML = options.map((option) => {
    const active = option.value === state.sector;
    return `<button class="sector-chip${active ? ' is-active' : ''}" type="button" data-sector="${escapeHTML(option.value)}" aria-pressed="${active}">${escapeHTML(option.name)} <span>${option.count}</span></button>`;
  }).join('');
}

function renderCard(frame) {
  const node = nodeByCallsign.get(frame.nodeCallsign);
  const id = escapeHTML(frame.id);
  return `<article class="frame-card-shell"><button class="frame-card" type="button" data-frame-id="${id}" aria-label="Open simulated frame from ${escapeHTML(frame.nodeCallsign)}, ${escapeHTML(frame.sector)}">
    <span class="frame-image-wrap"><canvas class="frame-canvas" data-frame-id="${id}" width="840" height="560" aria-hidden="true"></canvas><span class="frame-image-tag">SIMULATED FRAME</span></span>
    <span class="frame-card-body"><span class="frame-card-heading"><span><strong>${escapeHTML(frame.nodeCallsign)}</strong><span class="frame-sector">${escapeHTML(frame.sector)}</span></span><time datetime="${escapeHTML(frame.timestamp)}">${formatHoursAgo(frame.timestamp)}</time></span>
      <span class="frame-equipment">${escapeHTML(node?.equipment || 'Equipment not listed')}</span>
      <span class="frame-exposure">Exposure <strong>${frame.exposureSeconds}s</strong></span>
      <span class="metric-row"><span class="metric-chip metric-cloud">Cloud ${frame.cloudFractionPct.toFixed(1)}%</span><span class="metric-chip metric-radiance">VIIRS ${frame.viirsRadiance.toFixed(1)} nW/cm²/sr</span></span>
      <span class="badge ${statusClass(frame.status)} frame-status">${escapeHTML(frame.status)}</span>
    </span>
  </button></article>`;
}

function observeCanvases() {
  frameObserver?.disconnect();
  const canvases = grid.querySelectorAll('canvas[data-frame-id]');
  if (!('IntersectionObserver' in window)) {
    canvases.forEach(drawCardCanvas);
    return;
  }
  frameObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      drawCardCanvas(entry.target);
      observer.unobserve(entry.target);
    });
  }, { rootMargin:'180px 0px' });
  canvases.forEach((canvas) => frameObserver.observe(canvas));
}

function drawCardCanvas(canvas) {
  const frame = frameById.get(canvas.dataset.frameId);
  if (!frame) return;
  const node = nodeByCallsign.get(frame.nodeCallsign);
  drawFrame(canvas, {
    seed:Number(frame.id.slice(-4)),
    cloud:frame.cloudFractionPct,
    glow:.16 + (node?.clarityScore || 70) / 240,
    size:{ width:840, height:560 }
  });
}

function getVisibleFrameData() {
  const query = state.query.trim().toLowerCase();
  const withoutSector = submissions.filter((frame) => matchesSearch(frame, query)
    && (state.status === 'all' || (state.status === 'accepted' && frame.status === 'Accepted')
      || (state.status === 'rejected-cloud' && frame.status === 'Rejected: cloud')
      || (state.status === 'rejected-glare' && frame.status === 'Rejected: glare')));
  const counts = { all:withoutSector.length };
  sectors.forEach((sector) => { counts[sector.name] = withoutSector.filter((frame) => frame.sector === sector.name).length; });
  const filtered = withoutSector.filter((frame) => !state.sector || frame.sector === state.sector).sort(compareFrames);
  return { counts, filtered };
}

function render() {
  const { counts, filtered } = getVisibleFrameData();
  visibleFrames = filtered;
  const shown = filtered.slice(0, state.limit);
  renderSectorFilters(counts);
  grid.innerHTML = shown.length ? shown.map(renderCard).join('') : '';
  emptyState.hidden = filtered.length > 0;
  loadMoreButton.hidden = shown.length >= filtered.length || filtered.length === 0;
  resultCount.textContent = state.sector || state.status !== 'all' || state.query.trim()
    ? `Showing ${shown.length} of ${filtered.length} matching frames · ${submissions.length} simulated demo frames total`
    : `Showing ${shown.length} of ${filtered.length} simulated demo frames`;
  observeCanvases();
}

function qualityExplanation(frame) {
  if (frame.cloudFractionPct > 35) {
    return `Cloud fraction ${frame.cloudFractionPct.toFixed(1)}% is above the 35% MODIS threshold, so this frame is excluded from the 4-day window.`;
  }
  if (frame.viirsRadiance > HIGH_RADIANCE_THRESHOLD) {
    return `VIIRS night-light radiance ${frame.viirsRadiance.toFixed(1)} nW/cm²/sr is above the ${HIGH_RADIANCE_THRESHOLD} nW/cm²/sr demo glare threshold, so this frame is excluded from the 4-day window.`;
  }
  return `Cloud fraction is at or below 35%, and VIIRS radiance is at or below the ${HIGH_RADIANCE_THRESHOLD} nW/cm²/sr demo threshold. This simulated frame passes these checks for the 4-day window.`;
}

function metadataItem(label, value) {
  return `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value)}</dd></div>`;
}

function drawDialogFrame(frame) {
  const node = nodeByCallsign.get(frame.nodeCallsign);
  drawFrame(dialogCanvas, {
    seed:Number(frame.id.slice(-4)),
    cloud:frame.cloudFractionPct,
    glow:.2 + (node?.clarityScore || 70) / 210,
    size:{ width:1280, height:853 }
  });
}

function showFrame(frame, trigger) {
  activeFrameIndex = visibleFrames.findIndex((item) => item.id === frame.id);
  if (activeFrameIndex < 0) return;
  const shouldOpenDialog = !dialog.open;
  if (shouldOpenDialog) returnFocusTarget = trigger || document.activeElement;
  const node = nodeByCallsign.get(frame.nodeCallsign);
  document.querySelector('#dialog-title').textContent = frame.nodeCallsign;
  document.querySelector('#dialog-subtitle').textContent = `${frame.sector} · ${formatTimestamp(frame.timestamp)}`;
  const status = document.querySelector('#dialog-status');
  status.textContent = frame.status;
  status.className = `badge ${statusClass(frame.status)}`;
  document.querySelector('#dialog-metadata').innerHTML = [
    metadataItem('Equipment', node?.equipment || 'Not listed'),
    metadataItem('Exposure', `${frame.exposureSeconds} seconds`),
    metadataItem('Cloud fraction', `${frame.cloudFractionPct.toFixed(1)}%`),
    metadataItem('VIIRS radiance', `${frame.viirsRadiance.toFixed(1)} nW/cm²/sr`),
    metadataItem('Node clarity score', node ? `${node.clarityScore}/100 · simulated` : 'Not available'),
    metadataItem('Frame ID', frame.id)
  ].join('');
  document.querySelector('#quality-explanation').textContent = qualityExplanation(frame);
  drawDialogFrame(frame);
  if (shouldOpenDialog) {
    dialog.showModal();
    dialogClose.focus();
  }
}

function showFrameAt(index) {
  if (!visibleFrames.length) return;
  const nextIndex = (index + visibleFrames.length) % visibleFrames.length;
  const frame = visibleFrames[nextIndex];
  activeFrameIndex = nextIndex;
  const currentCard = grid.querySelector(`[data-frame-id="${CSS.escape(frame.id)}"]`);
  showFrame(frame, currentCard);
}

function clearAllFilters() {
  state.query = '';
  state.sector = '';
  state.status = 'all';
  state.sort = 'newest';
  state.limit = 12;
  searchInput.value = '';
  statusSelect.value = 'all';
  sortSelect.value = 'newest';
  writeFiltersToURL();
  render();
}

readFiltersFromURL();
searchInput.value = state.query;
statusSelect.value = state.status;
sortSelect.value = state.sort;
render();

searchInput.addEventListener('input', () => {
  state.query = searchInput.value;
  state.limit = 12;
  writeFiltersToURL();
  render();
});
statusSelect.addEventListener('change', () => {
  state.status = statusValues.has(statusSelect.value) ? statusSelect.value : 'all';
  state.limit = 12;
  writeFiltersToURL();
  render();
});
sortSelect.addEventListener('change', () => {
  state.sort = sortValues.has(sortSelect.value) ? sortSelect.value : 'newest';
  state.limit = 12;
  writeFiltersToURL();
  render();
});
sectorFilters.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-sector]');
  if (!button) return;
  state.sector = button.dataset.sector;
  state.limit = 12;
  writeFiltersToURL();
  render();
});
grid.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-frame-id]');
  if (!button) return;
  const frame = frameById.get(button.dataset.frameId);
  if (frame) showFrame(frame, button);
});
loadMoreButton.addEventListener('click', () => { state.limit += 12; render(); });
clearFiltersButton.addEventListener('click', clearAllFilters);
dialogClose.addEventListener('click', () => dialog.close());
document.querySelector('#frame-previous').addEventListener('click', () => showFrameAt(activeFrameIndex - 1));
document.querySelector('#frame-next').addEventListener('click', () => showFrameAt(activeFrameIndex + 1));
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') { event.preventDefault(); showFrameAt(activeFrameIndex - 1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); showFrameAt(activeFrameIndex + 1); }
  if (event.key !== 'Tab') return;
  const focusable = [...dialog.querySelectorAll('button:not([disabled])')];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
dialog.addEventListener('close', () => {
  returnFocusTarget?.isConnected && returnFocusTarget.focus();
  returnFocusTarget = null;
  activeFrameIndex = -1;
});
window.addEventListener('popstate', () => {
  readFiltersFromURL();
  searchInput.value = state.query;
  statusSelect.value = state.status;
  sortSelect.value = state.sort;
  render();
});
