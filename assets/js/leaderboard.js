import { calculateScore, nodes, sectors, submissions } from './data.js';

const numberFormat = new Intl.NumberFormat('en');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const searchInput = document.querySelector('#node-search');
const sectorFilters = document.querySelector('#sector-filters');
const tableBody = document.querySelector('#leaderboard-body');
const rankingCount = document.querySelector('#ranking-count');
const pageStatus = document.querySelector('#page-status');
const previousPageButton = document.querySelector('#page-previous');
const nextPageButton = document.querySelector('#page-next');
const rankingEmpty = document.querySelector('#ranking-empty');
const podium = document.querySelector('#podium');
const perPage = 10;
const state = { period: 'week', sector: 'all', page: 0, sortKey: 'totalScore', sortDirection: 'descending' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function readRegistration() {
  try {
    const registration = JSON.parse(localStorage.getItem('aegis_registered_node') || 'null');
    if (!registration || typeof registration.callsign !== 'string' || typeof registration.nodeId !== 'string') return null;
    return registration;
  } catch {
    return null;
  }
}

const registration = readRegistration();
const registeredNode = registration ? {
  nodeId: registration.nodeId,
  callsign: registration.callsign,
  sector: registration.sector || 'Not specified',
  streakDays: null,
  clarityScore: null,
  blindSpotsFilled: null,
  totalScore: null,
  trendDelta: 0,
  isYou: true,
} : null;

function stableNumber(value) {
  return [...String(value)].reduce((total, character) => total + character.charCodeAt(0), 0);
}

function buildRankings() {
  return nodes.map((node, index) => {
    const seed = stableNumber(node.callsign);
    const metrics = state.period === 'all' ? {
      streakDays: node.streakDays,
      clarityScore: node.clarityScore,
      blindSpotsFilled: node.blindSpotsFilled,
    } : {
      streakDays: Math.min(node.streakDays, 7),
      clarityScore: Math.max(55, Math.min(100, node.clarityScore + (seed % 9) - 4)),
      blindSpotsFilled: Math.floor(node.blindSpotsFilled / 3),
    };
    return {
      ...node,
      ...metrics,
      id: node.callsign,
      totalScore: calculateScore(metrics),
      trendDelta: (seed % 7) - 3,
      sourceIndex: index,
      isYou: false,
    };
  });
}

function rankedEntries() {
  const entries = buildRankings();
  const ranked = [...entries].sort((left, right) => right.totalScore - left.totalScore || left.callsign.localeCompare(right.callsign));
  const globalRanks = new Map(ranked.map((entry, index) => [entry.id, index + 1]));
  const withUser = registeredNode ? [...entries, registeredNode] : entries;
  return withUser.map((entry) => ({ ...entry, rank: entry.isYou ? null : globalRanks.get(entry.id) }));
}

function formatScore(value) {
  return value == null ? '—' : Number(value).toFixed(1);
}

function updateKpis() {
  const latestTime = Math.max(...submissions.map((item) => Date.parse(item.timestamp)));
  const fourDaysMs = 4 * 24 * 60 * 60 * 1000;
  const acceptedFrames = submissions.filter((item) => item.status === 'Accepted' && latestTime - Date.parse(item.timestamp) <= fourDaysMs).length;
  const values = {
    activeNodes: nodes.filter((node) => node.status === 'online').length,
    acceptedFrames,
    blindSpots: nodes.reduce((total, node) => total + node.blindSpotsFilled, 0),
    avgClarity: nodes.reduce((total, node) => total + node.clarityScore, 0) / nodes.length,
  };
  document.querySelectorAll('[data-kpi]').forEach((element) => {
    const key = element.dataset.kpi;
    const target = values[key] ?? 0;
    const decimals = Number(element.dataset.decimals || 0);
    const draw = (value) => { element.textContent = new Intl.NumberFormat('en', { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(value); };
    if (reducedMotion.matches) {
      draw(target);
      return;
    }
    const start = performance.now();
    const duration = 700;
    function animate(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      draw(target * eased);
      if (progress < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  });
}

const flameIcon = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8.4 1.5c.4 2.2-1.4 3-1.4 4.7 0 .7.4 1.2 1 1.4-.1-1.5 1.3-2.3 2.2-3.7 2.3 2.1 3.6 4.2 3.1 6.4-.5 2.4-2.6 4-5.3 4-3.2 0-5.5-2-5.5-5 0-2.1 1.2-3.9 3.7-5.8-.1 1.6.3 2.2.9 2.6.1-1.8 1.2-2.8 1.3-4.6Z" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/></svg>';

function renderPodium(entries) {
  const leaders = entries.filter((entry) => !entry.isYou).sort((left, right) => right.totalScore - left.totalScore).slice(0, 3);
  const classes = ['podium-first', 'podium-second', 'podium-third'];
  const labels = ['01 / GOLD', '02 / SILVER', '03 / BRONZE'];
  podium.innerHTML = leaders.map((entry, index) => `<article class="podium-card ${classes[index]}"><span class="podium-rank">${index + 1}</span><span class="podium-medal">${labels[index]}</span><h3>${escapeHtml(entry.callsign)}</h3><span class="podium-sector">${escapeHtml(entry.sector)}</span><div class="podium-bottom"><div class="podium-score"><strong>${formatScore(entry.totalScore)}</strong><span>total score</span></div><span class="podium-streak">${flameIcon}${entry.streakDays} day streak</span></div></article>`).join('');
}

function renderSectorFilters() {
  const allSectors = ['all', ...sectors.map((sector) => sector.name)];
  sectorFilters.innerHTML = allSectors.map((sector) => {
    const label = sector === 'all' ? 'All sectors' : sector;
    return `<button class="sector-chip" type="button" data-sector="${escapeHtml(sector)}" aria-pressed="${state.sector === sector}">${escapeHtml(label)}</button>`;
  }).join('');
}

function trendMarkup(delta) {
  if (delta > 0) return `<span class="trend-cell trend-up" aria-label="Up ${delta} places in simulated trend"><span aria-hidden="true">↑</span><span class="visually-hidden">Up ${delta} places</span></span>`;
  if (delta < 0) return `<span class="trend-cell trend-down" aria-label="Down ${Math.abs(delta)} places in simulated trend"><span aria-hidden="true">↓</span><span class="visually-hidden">Down ${Math.abs(delta)} places</span></span>`;
  return '<span class="trend-cell trend-flat" aria-label="No change in simulated trend"><span aria-hidden="true">—</span></span>';
}

function rowMarkup(entry) {
  const classes = entry.isYou ? 'you-row' : '';
  const rank = entry.rank == null ? '—' : String(entry.rank).padStart(2, '0');
  const streak = entry.streakDays == null ? '—' : `<span class="streak-cell">${flameIcon}${entry.streakDays}<span class="visually-hidden"> days</span></span>`;
  const clarity = entry.clarityScore == null ? '—' : `<span class="clarity-cell"><span>${entry.clarityScore}</span><span class="clarity-track" aria-hidden="true"><span class="clarity-fill" style="--clarity:${entry.clarityScore}%"></span></span></span>`;
  const trend = entry.isYou ? '<span class="trend-cell trend-flat" aria-label="No trend data"><span aria-hidden="true">—</span><span class="visually-hidden">No trend data</span></span>' : trendMarkup(entry.trendDelta);
  return `<tr class="${classes}"${entry.isYou ? ' id="you-row" data-you-row="true" tabindex="-1"' : ''}><td data-label="Rank"><span class="rank-number">${rank}</span></td><td data-label="Callsign"><span class="node-callsign">${entry.isYou ? escapeHtml(entry.callsign) : escapeHtml(entry.callsign)}${entry.isYou ? '<span class="you-tag">YOU</span>' : ''}</span></td><td data-label="Sector">${escapeHtml(entry.sector)}</td><td data-label="Streak">${streak}</td><td data-label="Clarity">${clarity}</td><td data-label="Blind spots">${entry.blindSpotsFilled == null ? '—' : numberFormat.format(entry.blindSpotsFilled)}</td><td data-label="Total score" class="score-cell">${formatScore(entry.totalScore)}</td><td data-label="Trend">${trend}</td></tr>`;
}

function filteredEntries() {
  const search = searchInput.value.trim().toLocaleLowerCase();
  const sorted = rankedEntries().filter((entry) => {
    const matchesSearch = !search || `${entry.callsign} ${entry.sector}`.toLocaleLowerCase().includes(search);
    const matchesSector = state.sector === 'all' || entry.sector === state.sector;
    return matchesSearch && matchesSector;
  });
  const key = state.sortKey;
  const direction = state.sortDirection === 'ascending' ? 1 : -1;
  sorted.sort((left, right) => {
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue == null && rightValue == null) return 0;
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;
    if (typeof leftValue === 'string') return direction * leftValue.localeCompare(rightValue);
    return direction * (leftValue - rightValue);
  });
  return sorted;
}

function updateSortHeaders() {
  document.querySelectorAll('.ranking-table th[data-column]').forEach((header) => {
    const key = header.dataset.column;
    const button = header.querySelector('.sort-button');
    if (key === state.sortKey) {
      header.setAttribute('aria-sort', state.sortDirection);
      button.querySelector('span').textContent = state.sortDirection === 'ascending' ? '↑' : '↓';
    } else {
      header.setAttribute('aria-sort', 'none');
      button.querySelector('span').textContent = '';
    }
  });
}

function renderRankings() {
  const entries = filteredEntries();
  const totalPages = Math.max(1, Math.ceil(entries.length / perPage));
  state.page = Math.max(0, Math.min(state.page, totalPages - 1));
  const pageEntries = entries.slice(state.page * perPage, (state.page + 1) * perPage);
  tableBody.innerHTML = pageEntries.map(rowMarkup).join('');
  const start = entries.length ? state.page * perPage + 1 : 0;
  const end = Math.min((state.page + 1) * perPage, entries.length);
  rankingCount.textContent = `${entries.length} nodes · showing ${start}–${end}`;
  pageStatus.textContent = `Page ${state.page + 1} of ${totalPages}`;
  previousPageButton.disabled = state.page === 0;
  nextPageButton.disabled = state.page >= totalPages - 1;
  rankingEmpty.hidden = entries.length > 0;
  document.querySelector('.ranking-table-wrap').hidden = entries.length === 0;
  document.querySelector('.pagination').hidden = entries.length === 0;
  updateSortHeaders();
}

function updateScoreCards() {
  const entries = buildRankings();
  renderPodium(entries);
  const badges = [
    { title: 'Dark-Sky Keeper', copy: 'Clarity score of 90 or higher.', count: nodes.filter((node) => node.clarityScore >= 90).length, icon: '<path d="M8 1.8 9.8 6l4.5.3-3.4 2.9 1.1 4.4L8 11.2l-4 2.4 1.1-4.4L1.7 6.3 6.2 6 8 1.8Z"/>' },
    { title: '7-Day Streak', copy: 'At least seven consecutive days of activity.', count: nodes.filter((node) => node.streakDays >= 7).length, icon: '<path d="M8.4 1.5c.4 2.2-1.4 3-1.4 4.7 0 .7.4 1.2 1 1.4-.1-1.5 1.3-2.3 2.2-3.7 2.3 2.1 3.6 4.2 3.1 6.4-.5 2.4-2.6 4-5.3 4-3.2 0-5.5-2-5.5-5 0-2.1 1.2-3.9 3.7-5.8-.1 1.6.3 2.2.9 2.6.1-1.8 1.2-2.8 1.3-4.6Z"/>' },
    { title: 'Blind Spot Filler', copy: 'At least three filled blind spots.', count: nodes.filter((node) => node.blindSpotsFilled >= 3).length, icon: '<path d="M8 1.5v13M1.5 8h13M3.4 3.4l9.2 9.2m0-9.2-9.2 9.2"/>' },
  ];
  document.querySelector('#achievements').innerHTML = badges.map((badge) => `<article class="achievement-card"><span class="achievement-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round">${badge.icon}</svg></span><div><h3>${badge.title}</h3><p>${badge.copy}</p><span class="achievement-count">${badge.count} simulated nodes earned</span></div></article>`).join('');
}

function renderSectorHealth() {
  const health = sectors.map((sector) => {
    const sectorNodes = nodes.filter((node) => node.sector === sector.name);
    const average = sectorNodes.reduce((sum, node) => sum + node.clarityScore, 0) / Math.max(1, sectorNodes.length);
    return { name: sector.name, count: sectorNodes.length, average };
  });
  document.querySelector('#sector-health').innerHTML = health.map((sector) => `<div class="health-row"><div class="health-topline"><span class="health-name">${escapeHtml(sector.name)}</span><span class="health-meta">${sector.count} nodes · ${sector.average.toFixed(1)} clarity</span></div><div class="health-track" role="img" aria-label="${escapeHtml(sector.name)} average clarity ${sector.average.toFixed(1)} out of 100"><div class="health-fill" style="--health:${sector.average}%"></div></div></div>`).join('');
}

function displayRegistration() {
  const emptyState = document.querySelector('#your-node-empty');
  const nodeCard = document.querySelector('#your-node-card');
  const badge = document.querySelector('#you-badge');
  if (!registration) return;
  document.querySelector('#your-callsign').textContent = registration.callsign;
  document.querySelector('#your-node-id').textContent = registration.nodeId;
  document.querySelector('#your-sector').textContent = registration.sector || 'Not specified';
  document.querySelector('#your-town').textContent = registration.town || 'Not specified';
  const equipment = registration.equipment || {};
  document.querySelector('#your-equipment').textContent = [equipment.camera, equipment.telescope, equipment.mount, equipment.filter, equipment.typicalExposureSeconds ? `${equipment.typicalExposureSeconds}s exposure` : ''].filter(Boolean).join(' · ') || 'Not specified';
  emptyState.hidden = true;
  nodeCard.hidden = false;
  badge.hidden = false;
  document.querySelector('#scroll-to-me').hidden = false;
}

function focusRegisteredNode() {
  if (!registeredNode) return;
  searchInput.value = '';
  state.sector = 'all';
  state.page = 0;
  renderSectorFilters();
  const entries = filteredEntries();
  const index = entries.findIndex((entry) => entry.isYou);
  state.page = Math.floor(Math.max(0, index) / perPage);
  renderRankings();
  requestAnimationFrame(() => {
    const row = document.querySelector('#you-row');
    row?.scrollIntoView({ behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'center' });
    row?.focus({ preventScroll: true });
  });
}

document.querySelectorAll('.sort-button').forEach((button) => {
  button.addEventListener('click', () => {
    const key = button.dataset.sort;
    if (state.sortKey === key) state.sortDirection = state.sortDirection === 'ascending' ? 'descending' : 'ascending';
    else {
      state.sortKey = key;
      state.sortDirection = ['callsign', 'sector'].includes(key) ? 'ascending' : 'descending';
    }
    state.page = 0;
    renderRankings();
  });
});

sectorFilters.addEventListener('click', (event) => {
  const button = event.target.closest('[data-sector]');
  if (!button) return;
  state.sector = button.dataset.sector;
  state.page = 0;
  renderSectorFilters();
  renderRankings();
});

searchInput.addEventListener('input', () => { state.page = 0; renderRankings(); });
document.querySelectorAll('[data-period]').forEach((button) => {
  button.addEventListener('click', () => {
    state.period = button.dataset.period;
    state.page = 0;
    document.querySelectorAll('[data-period]').forEach((periodButton) => periodButton.setAttribute('aria-pressed', String(periodButton === button)));
    updateScoreCards();
    renderRankings();
  });
});
previousPageButton.addEventListener('click', () => { state.page -= 1; renderRankings(); });
nextPageButton.addEventListener('click', () => { state.page += 1; renderRankings(); });
document.querySelector('#scroll-to-me').addEventListener('click', focusRegisteredNode);

updateKpis();
updateScoreCards();
renderSectorFilters();
renderRankings();
renderSectorHealth();
displayRegistration();
