const SOURCES = window.AEGIS_SOURCES;
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const todayUTC = new Date().toISOString().slice(0, 10);
const yesterdayUTC = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
let nasaBundle = null;
let map = null;
let activeLayer = null;
let eventLayer = null;
let availableLayers = [];
let nasaSnapshot = false;
let cmrSnapshot = false;
let observatorySnapshot = false;
let selectedLocation = null;
let tileErrorRetries = 0;
let tileErrorTimer = null;
let mapLayerDate = yesterdayUTC;

function setSourceStatus(id, status, { latencyMs, timestamp, detail } = {}) {
  const card = $(`#health-${id}`);
  const registryRow = $(`#registry-${id}`);
  const dot = card?.querySelector('.health-dot');
  if (dot) dot.dataset.status = status;
  const statusText = status === 'live' ? 'Live' : status === 'degraded' ? 'Degraded' : status === 'offline' ? 'Offline' : 'Cached / reference';
  const meta = card?.querySelector('.health-meta');
  if (meta) {
    const latency = Number.isFinite(latencyMs) ? `${Math.round(latencyMs)} ms` : '—';
    const updated = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : (status === 'cached' ? 'Reference link' : 'Waiting');
    meta.innerHTML = `<span><strong>${esc(statusText)}</strong></span><span>Latency ${esc(latency)}</span><span>${esc(updated)}</span>${detail ? `<span>${esc(detail)}</span>` : ''}`;
  }
  const label = registryRow?.querySelector('.registry-status');
  if (label) {
    label.innerHTML = `<span class="status-label"><span class="health-dot" data-status="${esc(status)}"></span>${esc(statusText)}</span>`;
  }
}

function buildHealthBoard() {
  const grid = $('#health-grid');
  const rows = $('#registry-body');
  grid.innerHTML = SOURCES.sources.map((source) => `<article class="health-card glass" id="health-${esc(source.id)}"><div class="health-top"><span class="health-dot" data-status="${esc(source.status)}" aria-hidden="true"></span><h3>${esc(source.name)}</h3></div><div class="health-meta"><span><strong>${esc(source.status === 'cached' ? 'Reference only' : 'Checking')}</strong></span><span>Latency —</span><span>${esc(source.status === 'cached' ? 'Curated link' : 'Waiting')}</span></div><a class="health-open" href="${esc(source.homepage)}" target="_blank" rel="noopener noreferrer">Open at source</a></article>`).join('');
  rows.innerHTML = SOURCES.sources.map((source) => `<tr id="registry-${esc(source.id)}"><th scope="row"><a href="${esc(source.homepage)}" target="_blank" rel="noopener noreferrer">${esc(source.name)}</a></th><td class="registry-endpoint">${esc(source.endpoint)}</td><td>${esc(source.authNeeded)}</td><td>${esc(source.rateLimit)}</td><td>${esc(source.cacheTtl)}</td><td>${esc(source.accessMethod)}</td><td class="registry-status"><span class="status-label"><span class="health-dot" data-status="${esc(source.status)}"></span>${esc(source.status === 'cached' ? 'Cached / reference' : 'Checking')}</span></td></tr>`).join('');
}

async function readFallback(name) {
  try {
    const response = await fetch(`${SOURCES.urls.fallbackBase}${name}.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Snapshot not found');
    return { ...(await response.json()), snapshot: true };
  } catch {
    return { ok: false, data: null, source: name, cached: true, snapshot: true, error: 'No bundled snapshot is available.' };
  }
}

async function getResource(url, fallbackName) {
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return { ...payload, snapshot: false };
  } catch {
    return readFallback(fallbackName);
  }
}

function servicePayload(service) {
  return service?.data ?? null;
}

function apodRecord(value) {
  if (Array.isArray(value)) return value[0] || null;
  if (Array.isArray(value?.items)) return value.items[0] || null;
  return value;
}

function epicImageUrl(item) {
  if (item?.imageUrl) return item.imageUrl;
  if (!item?.image || !item?.date) return '';
  const [year, month, day] = item.date.slice(0, 10).split('-');
  return `https://epic.gsfc.nasa.gov/archive/natural/${year}/${month}/${day}/png/${encodeURIComponent(item.image)}.png`;
}

function contentCard({ kicker, title, image, alt, text, link, linkLabel = 'Open at source', credit, badge }) {
  return `<article class="content-card glass">${badge ? '<span class="snapshot-badge">CACHED SNAPSHOT</span>' : ''}${kicker ? `<p class="card-kicker">${esc(kicker)}</p>` : ''}${image ? `<img${image === 'lazy' ? ' loading="lazy"' : ''} class="apod-image" src="${esc(image)}" alt="${esc(alt || '')}" />` : ''}<h3>${esc(title || 'NASA source unavailable')}</h3>${text ? `<p>${text}</p>` : ''}<a class="card-link" href="${esc(link || '#')}" target="_blank" rel="noopener noreferrer">${esc(linkLabel)}</a><p class="card-credit">${esc(credit || '')}</p></article>`;
}

function normalizeImageCollection(value) {
  if (Array.isArray(value?.collection?.items)) return value.collection.items;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function renderNasaCards(bundle, snapshot) {
  const services = bundle?.services || {};
  const apodService = services.apod;
  const epicService = services.epic;
  const flareService = services.flares;
  const stormService = services.storms;
  const eonetService = services.eonet;
  const imageService = services.images;
  const apod = apodRecord(servicePayload(apodService));
  const epic = Array.isArray(servicePayload(epicService)) ? servicePayload(epicService)[0] : null;
  const apodFallback = snapshot || !apodService?.ok;
  const epicFallback = snapshot || !epicService?.ok;
  const flareData = Array.isArray(servicePayload(flareService)) ? servicePayload(flareService) : [];
  const stormData = Array.isArray(servicePayload(stormService)) ? servicePayload(stormService) : [];
  const eonetData = servicePayload(eonetService)?.events || [];
  const apodImage = apod?.media_type === 'video' ? '' : (apod?.hdurl || apod?.url || '');
  const apodText = apod?.explanation ? esc(apod.explanation.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 230)) + '…' : 'The Astronomy Picture of the Day, served by NASA.';
  const epicUrl = epicImageUrl(epic);
  const flareList = flareData.slice(0, 2).map((flare) => `<li><strong>${esc(flare.classType || flare.class || 'Solar flare')}</strong> · ${esc(flare.beginTime || flare.peakTime || 'Recent')} ${flare.link ? `· <a href="${esc(flare.link)}" target="_blank" rel="noopener noreferrer">Details</a>` : ''}</li>`).join('');
  const stormList = stormData.slice(0, 2).map((storm) => `<li><strong>${esc(storm.stormType || storm.gstID || 'Geomagnetic storm')}</strong> · ${esc(storm.startTime || storm.beginTime || 'Recent')} ${storm.link ? `· <a href="${esc(storm.link)}" target="_blank" rel="noopener noreferrer">Details</a>` : ''}</li>`).join('');
  const flareHtml = flareList || '<li>No solar flares in the recent query window.</li>';
  const stormHtml = stormList || '<li>No geomagnetic storms in the recent query window.</li>';
  const cards = [
    contentCard({ kicker: `APOD · ${apod?.date || ''}`, title: apod?.title || 'Astronomy Picture of the Day', image: apodImage, alt: apod?.title || 'NASA Astronomy Picture of the Day', text: apodText, link: apod?.url || SOURCES.urls.apod, credit: 'Image and metadata: NASA APOD · Open at source', badge: apodFallback }),
    contentCard({ kicker: `EPIC · ${epic?.date || 'Latest natural-color frame'}`, title: 'Earth from DSCOVR', image: epicUrl, alt: epic?.caption || 'NASA EPIC natural-color image of Earth', text: epic?.caption || 'Latest available natural-color image metadata from NASA’s EPIC camera.', link: SOURCES.urls.epic, credit: 'Imagery: NASA EPIC / DSCOVR · Open at source', badge: epicFallback }),
    `<article class="content-card glass">${snapshot || !flareService?.ok || !stormService?.ok ? '<span class="snapshot-badge">CACHED SNAPSHOT</span>' : ''}<p class="card-kicker">DONKI · RECENT ACTIVITY</p><h3>Space weather</h3><p>Solar activity can shape auroral visibility and sky conditions; it is not a direct night-sky brightness measurement.</p><ul class="donki-list"><li><strong>Solar flares</strong></li>${flareHtml}<li><strong>Geomagnetic storms</strong></li>${stormHtml}</ul><a class="card-link" href="${esc(SOURCES.urls.donki)}" target="_blank" rel="noopener noreferrer">Open DONKI at source</a><p class="card-credit">Data: NASA CCMC DONKI · Open at source</p></article>`
  ];
  $('#space-grid').innerHTML = cards.join('');
  $('#nasa-updated').textContent = snapshot ? 'Showing cached snapshot' : `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;
  $('#nasa-feed-note').textContent = snapshot ? 'Live feeds are temporarily unavailable; the cards below use bundled cached snapshots.' : 'Live NASA and EONET data; rendered layers and all derived values remain labeled as imagery estimates.';
  renderRelatedImages(servicePayload(imageService), snapshot || !imageService?.ok);
  renderEvents(eonetData);

  const nasaServices = [apodService, epicService, flareService, stormService];
  const openLive = nasaServices.filter((item) => item?.ok).length;
  setSourceStatus('nasa-open', snapshot ? 'cached' : openLive === nasaServices.length ? 'live' : openLive ? 'degraded' : 'offline', { latencyMs: Math.max(...nasaServices.map((item) => item?.latencyMs || 0)), timestamp: bundle?.fetchedAt, detail: bundle?.rateLimitRemaining !== null && bundle?.rateLimitRemaining !== undefined ? `Remaining ${bundle.rateLimitRemaining}` : (bundle?.usingDemoKey ? 'DEMO_KEY' : '') });
  setSourceStatus('eonet', snapshot || !eonetService?.ok ? 'cached' : 'live', { latencyMs: eonetService?.latencyMs, timestamp: eonetService?.fetchedAt, detail: `${eonetData.length} open events` });
  const keyUsed = bundle?.usingDemoKey ?? snapshot;
  $('#demo-warning').hidden = !keyUsed;
  $('#health-updated').textContent = `Checked ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`;
}

function renderRelatedImages(value, snapshot) {
  const items = normalizeImageCollection(value).slice(0, 5);
  const host = $('#related-images');
  if (!items.length) {
    host.innerHTML = `<p class="credit-line">${snapshot ? '<span class="snapshot-badge">CACHED SNAPSHOT</span> ' : ''}Related imagery search is temporarily unavailable. <a href="${esc(SOURCES.urls.nasaImages)}?q=Earth%20from%20space" target="_blank" rel="noopener noreferrer">Open NASA Image Library</a></p>`;
    return;
  }
  host.innerHTML = `<span class="sr-only">Related NASA imagery:</span>${items.map((item) => {
    const metadata = item.data?.[0] || {};
    const title = metadata.title || metadata.nasa_id || 'NASA image';
    const link = metadata.nasa_id ? `${SOURCES.urls.imagesDetails}${encodeURIComponent(metadata.nasa_id)}` : `${SOURCES.urls.imagesHome}?q=${encodeURIComponent(title)}`;
    return `<a class="related-image-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(title.slice(0, 60))} · Open at NASA</a>`;
  }).join('')}`;
}

function renderEvents(events) {
  if (!eventLayer || !window.L) return;
  eventLayer.clearLayers();
  for (const event of events.slice(0, 100)) {
    const geometry = event.geometry?.at(-1);
    const coordinates = geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2 || !Number.isFinite(Number(coordinates[0])) || !Number.isFinite(Number(coordinates[1]))) continue;
    const title = esc(event.title || 'Natural event');
    const category = esc(event.categories?.[0]?.title || 'NASA EONET');
    const source = esc(event.link || SOURCES.urls.eonet);
    const marker = window.L.circleMarker([Number(coordinates[1]), Number(coordinates[0])], { radius: 5, color: '#f5a524', weight: 1.5, fillColor: '#fb7185', fillOpacity: .8 });
    marker.bindPopup(`<strong>${title}</strong><br>${category}<br><a href="${source}" target="_blank" rel="noopener noreferrer">Open at source</a>`);
    marker.addTo(eventLayer);
  }
}

function healthFromResult(id, result, latency = result?.latencyMs) {
  const status = result?.snapshot ? 'cached' : result?.ok ? 'live' : 'offline';
  setSourceStatus(id, status, { latencyMs: latency, timestamp: result?.fetchedAt });
}

async function loadNasa() {
  const payload = await getResource(`${SOURCES.urls.apiNasaData}?service=summary`, 'nasa-open');
  nasaBundle = payload;
  nasaSnapshot = Boolean(payload.snapshot);
  renderNasaCards(payload.data, nasaSnapshot);
}

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = SOURCES.urls.leafletCss;
    document.head.append(link);
    const script = document.createElement('script');
    script.src = SOURCES.urls.leafletJs;
    script.onload = () => window.L ? resolve(window.L) : reject(new Error('Leaflet did not initialize.'));
    script.onerror = () => reject(new Error('The map library could not be loaded.'));
    document.head.append(script);
  });
}

async function loadCapabilities() {
  const result = await getResource(`${SOURCES.urls.apiGibs}?mode=capabilities`, 'gibs');
  availableLayers = result.data?.layers || [];
  healthFromResult('gibs', result);
  const select = $('#gibs-layer');
  const choices = availableLayers.filter((layer) => ['true-color', 'cloud-fraction', 'night-lights', 'night-radiance'].includes(layer.kind));
  if (!choices.length) {
    select.innerHTML = '<option value="">GIBS layers unavailable</option>';
    select.disabled = true;
    return result;
  }
  select.innerHTML = choices.map((layer) => `<option value="${esc(layer.id)}">${esc(layer.title)}${layer.kind === 'night-lights' ? ' · static' : ''}</option>`).join('');
  select.disabled = false;
  const preferred = choices.find((layer) => layer.kind === 'true-color') || choices[0];
  select.value = preferred.id;
  updateWorldviewLink();
  if (map) setMapLayer();
  return result;
}

function activeMapLayer() {
  return availableLayers.find((layer) => layer.id === $('#gibs-layer').value) || null;
}

function tileDateFor(layer, date = $('#map-date').value) {
  const defaultYear = Number(layer?.defaultTime?.slice(0, 4));
  return defaultYear && defaultYear < 2020 ? layer.defaultTime.slice(0, 10) : (date || yesterdayUTC);
}

function makeTileTemplate(layer, date) {
  return layer.template.replaceAll('{Time}', encodeURIComponent(tileDateFor(layer, date)))
    .replaceAll('{TileMatrixSet}', encodeURIComponent(layer.matrixSet))
    .replaceAll('{TileMatrix}', '{z}').replaceAll('{TileRow}', '{y}').replaceAll('{TileCol}', '{x}');
}

function updateWorldviewLink() {
  if (!map) return;
  const layer = activeMapLayer();
  const bounds = map.getBounds();
  const view = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].map((value) => value.toFixed(3)).join(',');
  const url = new URL(SOURCES.urls.worldview);
  url.searchParams.set('v', view);
  url.searchParams.set('t', $('#map-date').value || yesterdayUTC);
  if (layer) url.searchParams.set('l', layer.id);
  $('#worldview-link').href = url.toString();
}

function setMapLayer() {
  if (!map || !window.L) return;
  const layer = activeMapLayer();
  if (!layer) return;
  if (activeLayer) map.removeLayer(activeLayer);
  const opacity = Number($('#map-opacity').value) / 100;
  const zoom = Number((layer.matrixSet.match(/Level(\d+)/i) || [])[1] || 8);
  const tileTemplate = makeTileTemplate(layer, $('#map-date').value);
  activeLayer = window.L.tileLayer(tileTemplate, { opacity, maxNativeZoom: zoom, maxZoom: 18, minZoom: 0, tileSize: 256, attribution: `NASA GIBS · <a href="${SOURCES.urls.gibsCapabilities}" target="_blank" rel="noopener noreferrer">Open at source</a>` });
  activeLayer.addTo(map);
  mapLayerDate = tileDateFor(layer);
  $('#map-instructions').textContent = `Click the map to set a validation point. Imagery date: ${mapLayerDate}${layer.kind === 'night-lights' && Number(layer.defaultTime?.slice(0, 4)) < 2020 ? ' (static Black Marble layer)' : ''}.`;
  updateWorldviewLink();
  activeLayer.once('load', () => { tileErrorRetries = 0; });
  activeLayer.on('tileerror', () => {
    if (tileErrorRetries >= 3 || tileErrorTimer) return;
    tileErrorTimer = setTimeout(() => {
      tileErrorTimer = null;
      tileErrorRetries += 1;
      const next = new Date(`${$('#map-date').value || yesterdayUTC}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() - 1);
      $('#map-date').value = next.toISOString().slice(0, 10);
      setMapLayer();
    }, 250);
  });
}

function setLocation(lat, lng, name = '') {
  selectedLocation = { lat: Number(lat), lng: Number(lng), name: name || `${Number(lat).toFixed(3)}°, ${Number(lng).toFixed(3)}°` };
  $('#validation-place').value = selectedLocation.name;
  $('#place-query').value = name;
  updateWorldviewLink();
}

async function initializeMap() {
  try {
    const L = await loadLeaflet();
    map = L.map('earth-map', { center: [20, 0], zoom: 2, minZoom: 1, maxZoom: 9, keyboard: true, zoomControl: true, scrollWheelZoom: false, preferCanvas: true });
    eventLayer = L.layerGroup().addTo(map);
    map.on('click', (event) => setLocation(event.latlng.lat, event.latlng.lng));
    map.on('moveend', updateWorldviewLink);
    map.on('zoomend', updateWorldviewLink);
    $('#map-date').value = yesterdayUTC;
    await loadCapabilities();
    const nasa = nasaBundle || await getResource(`${SOURCES.urls.apiNasaData}?service=summary`, 'nasa-open');
    const events = nasa.data?.services?.eonet?.data?.events || [];
    renderEvents(events);
    setMapLayer();
  } catch (error) {
    $('#earth-map').innerHTML = `<div class="empty-message">${esc(error.message)} The rest of the hub remains available.</div>`;
  }
}

function observeMap() {
  const target = $('#map-section');
  if (!('IntersectionObserver' in window)) { initializeMap(); return; }
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect();
      initializeMap();
    }
  }, { rootMargin: '300px 0px' });
  observer.observe(target);
}

function dateDaysBefore(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function readImageMetrics(dataUri) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0, 128, 128);
        const pixels = context.getImageData(0, 0, 128, 128).data;
        let samples = 0, clouds = 0, lightTotal = 0;
        for (let i = 0; i < pixels.length; i += 4 * 8) {
          if (pixels[i + 3] < 32) continue;
          const red = pixels[i], green = pixels[i + 1], blue = pixels[i + 2];
          const brightness = (red * .2126 + green * .7152 + blue * .0722);
          const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
          samples += 1;
          if (brightness >= 155 && saturation <= 48) clouds += 1;
          lightTotal += brightness;
        }
        if (!samples) return resolve({ blank: true });
        resolve({ blank: false, cloudFractionPct: Math.round(clouds / samples * 1000) / 10, relativeBrightness: Math.round(Math.min(100, lightTotal / samples / 1.8)), sampleCount: samples });
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error('NASA imagery could not be decoded.'));
    image.src = dataUri;
  });
}

async function getValidationTile(layer, date, location) {
  for (let offset = 0; offset <= 3; offset += 1) {
    const requestedDate = dateDaysBefore(date, offset);
    const params = new URLSearchParams({ mode: 'tile', layer: layer.id, lat: location.lat, lng: location.lng, date: requestedDate });
    const response = await fetch(`${SOURCES.urls.apiGibs}?${params}`);
    const result = await response.json();
    if (!response.ok || !result.ok || !result.data?.image) throw new Error(result.error || 'NASA GIBS tile is temporarily unavailable.');
    const metrics = await readImageMetrics(result.data.image);
    if (!metrics.blank) return { ...metrics, usedDate: result.data.usedDate || requestedDate, cached: result.cached };
  }
  throw new Error('No non-blank NASA tile was available for this location in the requested date window.');
}

function validationMessage(state, title, text) {
  const result = $('#validation-result');
  result.dataset.state = state;
  result.setAttribute('aria-busy', 'false');
  result.innerHTML = `<span class="result-icon" aria-hidden="true">${state === 'accepted' ? '✓' : state === 'rejected' ? '×' : state === 'loading' ? '…' : '!'}</span><div><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`;
}

async function runValidation() {
  if (!selectedLocation) {
    validationMessage('error', 'Choose a place first', 'Click a location on the NASA map to set the validation point.');
    return;
  }
  const trueColor = availableLayers.find((layer) => layer.kind === 'true-color');
  const nightLayer = availableLayers.find((layer) => layer.kind === 'night-lights') || availableLayers.find((layer) => layer.kind === 'night-radiance');
  if (!trueColor || !nightLayer) {
    validationMessage('error', 'Required imagery unavailable', 'GIBS did not advertise a true-color and night-lights layer for this session.');
    return;
  }
  const date = $('#validation-date').value || yesterdayUTC;
  $('#run-validation').disabled = true;
  $('#validation-metrics').hidden = true;
  $('#validation-result').setAttribute('aria-busy', 'true');
  validationMessage('loading', 'Sampling NASA imagery…', 'Fetching one true-color tile and one VIIRS night-lights tile for the selected point.');
  try {
    const [cloud, light] = await Promise.all([
      getValidationTile(trueColor, date, selectedLocation),
      getValidationTile(nightLayer, date, selectedLocation)
    ]);
    const accepted = cloud.cloudFractionPct <= 35;
    const verdict = accepted ? 'Accepted' : 'Rejected: cloud';
    const lightDateNote = Number(nightLayer.defaultTime?.slice(0, 4)) < 2020 ? `Static Black Marble imagery (${light.usedDate})` : `Night-lights imagery (${light.usedDate})`;
    validationMessage(accepted ? 'accepted' : 'rejected', verdict, `AEGIS cloud threshold: 35%. This estimate is derived from rendered NASA imagery and is not an official MODIS cloud fraction.`);
    $('#validation-metrics').innerHTML = `<div class="validation-metric"><span>Estimated cloud pixels</span><strong>${cloud.cloudFractionPct}%</strong></div><div class="validation-metric"><span>Relative night-tile brightness</span><strong>${light.relativeBrightness}/100</strong></div><div class="validation-metric"><span>Imagery dates</span><strong>${esc(cloud.usedDate)} · ${esc(lightDateNote)}</strong></div>`;
    $('#validation-metrics').hidden = false;
  } catch (error) {
    validationMessage('error', 'Imagery estimate unavailable', `${error.message} No acceptance verdict was issued.`);
  } finally {
    $('#run-validation').disabled = false;
  }
}

function earthdataLink(query) {
  return `${SOURCES.urls.earthdataSearch}?q=${encodeURIComponent(query)}`;
}

function renderCollections(payload) {
  const host = $('#dataset-results');
  const items = payload.data?.items || [];
  const snapshotBadge = cmrSnapshot ? '<span class="snapshot-badge">CACHED SNAPSHOT</span>' : '';
  if (!items.length) {
    host.innerHTML = `<div class="empty-message">${snapshotBadge}No collection records are available in this response. <a href="${esc(earthdataLink($('#dataset-query').value))}" target="_blank" rel="noopener noreferrer">Continue in Earthdata Search</a>.</div>`;
    return;
  }
  host.innerHTML = items.map((item) => `<article class="dataset-result">${snapshotBadge}<div class="dataset-result-top"><h3>${esc(item.title)}</h3><a class="text-link" href="${esc(item.collectionUrl || earthdataLink(item.shortName))}" target="_blank" rel="noopener noreferrer">Open at source</a></div><dl><div><dt>Short name</dt><dd>${esc(item.shortName)}</dd></div><div><dt>Version</dt><dd>${esc(item.version)}</dd></div><div><dt>Provider</dt><dd>${esc(item.provider)}</dd></div><div><dt>Temporal range</dt><dd>${esc(item.temporal)}</dd></div><div><dt>Granules · map bounds · last 4 days</dt><dd>${item.granuleCount === null ? 'Count unavailable' : esc(item.granuleCount)}</dd></div><div><dt>DOI</dt><dd>${item.doi ? `<a href="${esc(item.doi)}" target="_blank" rel="noopener noreferrer">${esc(item.doi)}</a>` : 'Not supplied'}</dd></div></dl></article>`).join('');
}

async function searchDatasets(query) {
  const q = query.trim() || 'MODIS cloud mask';
  $('#dataset-query').value = q;
  $('#dataset-results').setAttribute('aria-busy', 'true');
  $('#dataset-results').innerHTML = '<div class="dataset-skeleton skeleton"></div><div class="dataset-skeleton skeleton"></div>';
  $('#dataset-summary').textContent = `Searching NASA CMR for “${q}”…`;
  try {
    const bbox = map?.getBounds();
    const bounds = bbox ? [bbox.getWest(), bbox.getSouth(), bbox.getEast(), bbox.getNorth()].map((value) => value.toFixed(4)).join(',') : '-180,-85,180,85';
    const params = new URLSearchParams({ q, bbox: bounds, startDate: dateDaysBefore(todayUTC, 3), endDate: todayUTC });
    const response = await fetch(`${SOURCES.urls.apiCmr}?${params}`);
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'NASA CMR is temporarily unavailable.');
    cmrSnapshot = false;
    renderCollections(payload);
    $('#dataset-summary').textContent = `${payload.data?.collectionHits ?? payload.data?.items?.length ?? 0} matching collections · granule counts scoped to current map bounds and the last 4 days.`;
    setSourceStatus('cmr', 'live', { latencyMs: payload.latencyMs, timestamp: payload.fetchedAt });
  } catch {
    const payload = await readFallback('cmr');
    cmrSnapshot = true;
    renderCollections(payload);
    $('#dataset-summary').textContent = 'NASA CMR is temporarily unavailable. Showing bundled collection metadata where available.';
    setSourceStatus('cmr', 'cached', { timestamp: payload.fetchedAt });
  } finally {
    $('#dataset-results').setAttribute('aria-busy', 'false');
  }
}

function renderStories(payload) {
  const host = $('#story-grid');
  const items = payload.data?.items || [];
  const badge = observatorySnapshot ? '<span class="snapshot-badge">CACHED SNAPSHOT</span>' : '';
  if (!items.length) {
    host.innerHTML = `<div class="empty-message">${badge}The feed did not return story cards. Visit the current Earth Observatory at <a href="${esc(SOURCES.urls.earthObservatory)}" target="_blank" rel="noopener noreferrer">NASA Science</a>.</div>`;
    return;
  }
  host.innerHTML = items.slice(0, 6).map((item) => `<article class="story-card">${item.thumbnail ? `<a href="${esc(item.link)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="${esc(item.thumbnail)}" alt="" /></a>` : ''}<div class="story-content">${badge}<h3><a href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3><time datetime="${esc(item.date)}">${esc(item.date ? new Date(item.date).toLocaleDateString() : 'Latest')}</time><a class="card-link" href="${esc(item.link)}" target="_blank" rel="noopener noreferrer">Open at source</a></div></article>`).join('');
}

async function loadEarthObservatory() {
  const payload = await getResource(SOURCES.urls.apiEarthObservatory, 'earth-observatory');
  observatorySnapshot = Boolean(payload.snapshot);
  renderStories(payload);
  healthFromResult('earth-observatory', payload);
}

function observeStories() {
  const target = $('#stories-section');
  if (!('IntersectionObserver' in window)) { loadEarthObservatory(); return; }
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect();
      loadEarthObservatory();
    }
  }, { rootMargin: '250px 0px' });
  observer.observe(target);
}

function renderLearnCards() {
  const cards = [
    { title: 'MODIS cloud mask', text: 'Cloud-mask products classify each satellite pixel as cloudy, clear, or uncertain; they are not the same as a simple brightness estimate from a rendered map tile.', link: SOURCES.urls.modisAtmosphere, label: 'Explore MODIS Atmosphere', credit: 'NASA MODIS Atmosphere · Curated guide, not scraped' },
    { title: 'Cloud fraction', text: 'Gridded cloud-fraction products summarize the share of cloudy observations over an area and time window. Use the source product for scientific measurements.', link: SOURCES.urls.cmrCollections + '?keyword=MODIS%20cloud%20fraction', label: 'Search CMR products', credit: 'NASA CMR and MODIS Atmosphere' },
    { title: 'VIIRS Black Marble', text: 'Black Marble maps nighttime radiance and helps researchers study human settlement and light pollution. Numeric radiance values require product data, not display-tile pixels.', link: SOURCES.urls.blackMarble, label: 'Explore Black Marble', credit: 'NASA Black Marble · Product guide' },
    { title: 'Night-light imagery', text: 'GIBS offers a browsable Black Marble layer and daily day/night-band imagery. This hub reports only relative display brightness, never calibrated radiance.', link: SOURCES.urls.gibsCapabilities, label: 'Browse GIBS layers', credit: 'NASA GIBS · Rendered imagery' }
  ];
  $('#learn-grid').innerHTML = cards.map((card) => `<article class="learn-card glass"><p class="section-eyebrow">NASA DATA GUIDE</p><h3>${esc(card.title)}</h3><p>${esc(card.text)}</p><a href="${esc(card.link)}" target="_blank" rel="noopener noreferrer">${esc(card.label)} · Open at source</a><p class="learn-meta">${esc(card.credit)} · Last verified 2026-11-15</p></article>`).join('');
}

async function geocode(event) {
  event.preventDefault();
  const query = $('#place-query').value.trim();
  if (query.length < 2) return;
  const submit = $('#place-search button');
  submit.disabled = true;
  submit.textContent = 'Searching…';
  try {
    const url = new URL(SOURCES.urls.geocoder);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' }, referrerPolicy: 'strict-origin-when-cross-origin' });
    if (!response.ok) throw new Error('Place search is temporarily unavailable.');
    const results = await response.json();
    if (!results.length) throw new Error('No matching place found.');
    const place = results[0];
    setLocation(Number(place.lat), Number(place.lon), place.display_name || place.name || query);
    map?.setView([selectedLocation.lat, selectedLocation.lng], Math.max(map.getZoom(), 6));
  } catch (error) {
    $('#validation-place').value = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = 'Locate';
  }
}

function bindControls() {
  $('#map-date').value = yesterdayUTC;
  $('#validation-date').value = yesterdayUTC;
  $('#gibs-layer').addEventListener('change', () => { tileErrorRetries = 0; setMapLayer(); });
  $('#map-date').addEventListener('change', () => { tileErrorRetries = 0; setMapLayer(); });
  $('#map-opacity').addEventListener('input', (event) => {
    $('#opacity-value').textContent = `${event.target.value}%`;
    activeLayer?.setOpacity(Number(event.target.value) / 100);
  });
  $('#run-validation').addEventListener('click', runValidation);
  $('#place-search').addEventListener('submit', geocode);
  $('#dataset-search').addEventListener('submit', (event) => { event.preventDefault(); searchDatasets($('#dataset-query').value); });
  document.querySelectorAll('.preset-chip').forEach((button) => button.addEventListener('click', () => searchDatasets(button.dataset.query)));
}

buildHealthBoard();
renderLearnCards();
bindControls();
observeMap();
observeStories();
loadNasa();
const datasetObserver = new IntersectionObserver((entries) => {
  if (entries.some((entry) => entry.isIntersecting)) {
    datasetObserver.disconnect();
    searchDatasets($('#dataset-query').value);
  }
}, { rootMargin: '250px 0px' });
datasetObserver.observe($('#dataset-section'));
