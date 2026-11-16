const { urls, ttl } = require('../assets/js/sources.js');
const { send, envelope, request, cachedRequest, validCoordinate, safeDate } = require('./_shared.cjs');

function matchValue(text, expression) {
  const found = text.match(expression);
  return found ? found[1].trim() : '';
}

function parseCapabilities(xml) {
  const layers = [...xml.matchAll(/<Layer(?:\s[^>]*)?>([\s\S]*?)<\/Layer>/g)].map((match) => {
    const body = match[1];
    const id = matchValue(body, /<(?:ows:)?Identifier[^>]*>([^<]+)/);
    const title = matchValue(body, /<(?:ows:)?Title[^>]*>([^<]+)/);
    const matrixSet = matchValue(body, /<TileMatrixSet>\s*([^<]+)/);
    const format = matchValue(body, /<Format>\s*([^<]+)/);
    const resource = body.match(/<ResourceURL\b[^>]*template=['"]([^'"]+)['"][^>]*>/);
    const timeBlock = body.match(/<Dimension>[\s\S]*?<ows:Identifier>Time<\/ows:Identifier>([\s\S]*?)<\/Dimension>/);
    const defaultTime = timeBlock ? matchValue(timeBlock[1], /<Default>([^<]+)/) : '';
    const titleText = `${id} ${title}`;
    const kind = /true\s*color/i.test(titleText) ? 'true-color' : /cloud fraction/i.test(titleText) ? 'cloud-fraction' : /day.?night band|nighttime blue\/yellow composite/i.test(titleText) ? 'night-radiance' : /black marble/i.test(titleText) ? 'night-lights' : null;
    if (!id || !matrixSet || !format || !resource || !kind) return null;
    return { id, title: title || id, matrixSet, format, template: resource[1], defaultTime, kind };
  }).filter(Boolean);
  return layers;
}

async function capabilities() {
  return cachedRequest('gibs-capabilities-epsg3857', ttl.gibsCapabilities, async () => {
    const upstream = await request(urls.gibsCapabilities, { kind: 'text' });
    const layers = parseCapabilities(upstream.data);
    if (!layers.length) throw new Error('GIBS GetCapabilities returned no supported imagery layers.');
    return { data: { layers, layerCount: layers.length }, fetchedAt: upstream.fetchedAt, latencyMs: upstream.latencyMs, rateLimitRemaining: upstream.rateLimitRemaining };
  });
}

function ymd(value) { return value.toISOString().slice(0, 10); }
function tileCoordinates(lat, lng, zoom) {
  const scale = 2 ** zoom;
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
  return {
    x: Math.max(0, Math.min(scale - 1, Math.floor((lng + 180) / 360 * scale))),
    y: Math.max(0, Math.min(scale - 1, Math.floor((1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2 * scale)))
  };
}

module.exports = async function gibs(req, res) {
  const mode = String(req.query.mode || 'capabilities');
  if (mode === 'capabilities') {
    try {
      const result = await capabilities();
      return send(res, 200, envelope({ ok: true, data: result.data, source: 'NASA GIBS GetCapabilities', fetchedAt: result.fetchedAt, cached: result.cached, error: result.error || null, latencyMs: result.latencyMs }), ttl.gibsCapabilities);
    } catch (error) {
      return send(res, 200, envelope({ ok: false, source: 'NASA GIBS GetCapabilities', error: error.message }), ttl.gibsCapabilities);
    }
  }
  if (mode !== 'tile') return send(res, 400, envelope({ ok: false, source: 'NASA GIBS', error: 'Unknown GIBS mode.' }));

  const lat = validCoordinate(req.query.lat, -90, 90);
  const lng = validCoordinate(req.query.lng, -180, 180);
  const layerId = String(req.query.layer || '').slice(0, 160);
  if (lat === null || lng === null || !layerId) return send(res, 400, envelope({ ok: false, source: 'NASA GIBS', error: 'A valid location and discovered GIBS layer are required.' }));

  try {
    const caps = await capabilities();
    const layer = caps.data.layers.find((item) => item.id === layerId);
    if (!layer) return send(res, 400, envelope({ ok: false, source: 'NASA GIBS', error: 'The requested layer was not discovered in GetCapabilities.' }));
    const currentDate = safeDate(req.query.date, ymd(new Date(Date.now() - 86400000)));
    const zoom = layer.kind === 'night-lights' ? 6 : 6;
    const { x, y } = tileCoordinates(lat, lng, zoom);
    const requestedDays = Math.max(0, Math.min(3, Number(req.query.offset) || 0));
    const requestedDate = new Date(`${currentDate}T00:00:00Z`);
    requestedDate.setUTCDate(requestedDate.getUTCDate() - requestedDays);
    const defaultYear = Number(layer.defaultTime?.slice(0, 4));
    const tileDate = defaultYear && defaultYear < 2020 ? layer.defaultTime.slice(0, 10) : ymd(requestedDate);
    const url = layer.template
      .replaceAll('{Time}', encodeURIComponent(tileDate))
      .replaceAll('{TileMatrixSet}', encodeURIComponent(layer.matrixSet))
      .replaceAll('{TileMatrix}', String(zoom))
      .replaceAll('{TileRow}', String(y))
      .replaceAll('{TileCol}', String(x));
    const key = `gibs-tile:${layerId}:${tileDate}:${zoom}:${x}:${y}`;
    const result = await cachedRequest(key, ttl.gibsTile, async () => {
      const upstream = await request(url, { kind: 'base64' });
      return { data: { image: `data:${layer.format};base64,${upstream.data}`, contentType: layer.format, layer: layer.id, usedDate: tileDate, x, y, zoom }, fetchedAt: upstream.fetchedAt, latencyMs: upstream.latencyMs };
    });
    return send(res, 200, envelope({ ok: true, data: result.data, source: 'NASA GIBS', fetchedAt: result.fetchedAt, cached: result.cached, error: result.error || null, latencyMs: result.latencyMs }), ttl.gibsTile);
  } catch (error) {
    return send(res, 200, envelope({ ok: false, source: 'NASA GIBS', error: error.message }), ttl.gibsTile);
  }
};
