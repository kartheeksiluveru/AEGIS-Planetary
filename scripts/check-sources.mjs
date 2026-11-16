import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { urls } = require('../assets/js/sources.js');
const today = new Date().toISOString().slice(0, 10);
const nasaKey = encodeURIComponent(process.env.NASA_API_KEY || 'DEMO_KEY');
const apiBase = process.env.AEGIS_API_BASE_URL?.replace(/\/$/, '');

const checks = [
  ['NASA APOD content feed', `${urls.apod}?date=${today}&api_key=${nasaKey}`],
  ['NASA EPIC API', `${urls.apiNasa}/EPIC/api/natural?api_key=${nasaKey}`],
  ['NASA DONKI flares', `${urls.donki}/FLR?startDate=${today}&endDate=${today}`],
  ['NASA EONET events', `${urls.eonet}?status=open&limit=1`],
  ['NASA Image Library', `${urls.nasaImages}?q=Earth&page_size=1&media_type=image`],
  ['NASA GIBS capabilities', urls.gibsCapabilities],
  ['NASA CMR collections', `${urls.cmrCollections}?keyword=MODIS%20cloud%20mask&page_size=1`],
  ['NASA Worldview', urls.worldview],
  ['NASA Earthdata', urls.earthdata],
  ['NASA MODIS Atmosphere', urls.modisAtmosphere],
  ['NASA Black Marble', urls.blackMarble],
  ['Earth Observatory image feed', urls.earthObservatoryImageFeed],
  ['Earth Observatory events feed', urls.earthObservatoryEventsFeed]
];

if (apiBase) {
  checks.push(
    ['Local NASA proxy', `${apiBase}/api/nasa?service=summary`],
    ['Local GIBS proxy', `${apiBase}/api/gibs?mode=capabilities`],
    ['Local CMR proxy', `${apiBase}/api/cmr?q=MODIS%20cloud%20mask`],
    ['Local Earth Observatory proxy', `${apiBase}/api/earth-observatory`]
  );
}

let failures = 0;
await Promise.all(checks.map(async ([label, url]) => {
  const started = Date.now();
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { signal:controller.signal, headers:{ 'User-Agent':'AEGIS-source-check/1.0', Accept:'application/json, application/xml, text/xml, text/html, */*' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (apiBase && url.startsWith(apiBase)) {
        const payload = await response.json();
        if (payload.ok === false) throw new Error(`HTTP ${response.status}, API error: ${payload.error || 'unknown error'}`);
      } else {
        await response.body?.cancel();
      }
      console.log(`OK   ${label} · HTTP ${response.status}${attempt ? ' · retry 1' : ''} · ${Date.now() - started} ms`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
    } finally {
      clearTimeout(timeout);
    }
  }
  failures += 1;
  console.error(`FAIL ${label} · ${lastError?.name === 'AbortError' ? 'timeout after 8000 ms' : lastError?.message || 'unknown error'}`);
}));

console.log(`\n${checks.length - failures}/${checks.length} source checks passed.`);
if (failures) process.exitCode = 1;
