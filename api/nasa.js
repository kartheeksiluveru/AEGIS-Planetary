const { urls, ttl } = require('../assets/js/sources.js');
const { send, envelope, request, cachedRequest, daysAgo, safeDate } = require('./_shared.cjs');

const secret = () => process.env.NASA_API_KEY || 'DEMO_KEY';
const isDemo = () => !process.env.NASA_API_KEY || process.env.NASA_API_KEY === 'DEMO_KEY';

async function serviceResult(name, task) {
  try {
    const result = await task();
    return { ok: true, data: result.data, source: name, fetchedAt: result.fetchedAt, cached: Boolean(result.cached), latencyMs: result.latencyMs, rateLimitRemaining: result.rateLimitRemaining, error: result.error || null };
  } catch (error) {
    return { ok: false, data: null, source: name, fetchedAt: new Date().toISOString(), cached: false, latencyMs: null, rateLimitRemaining: null, error: error.message };
  }
}

async function cachedFetch(key, ttlSeconds, url, kind = 'json') {
  return cachedRequest(key, ttlSeconds, () => request(url, { kind }));
}

module.exports = async function nasa(req, res) {
  const service = String(req.query.service || 'summary');
  const apiKey = encodeURIComponent(secret());
  const today = new Date().toISOString().slice(0, 10);
  const startDate = safeDate(req.query.startDate, daysAgo(3));
  const endDate = safeDate(req.query.endDate, today);
  const search = String(req.query.q || 'Earth from space cloud formations').slice(0, 100);
  const date = safeDate(req.query.date, today);
  const urlsByService = {
    apod: `${urls.apod}?date=${date}&api_key=${apiKey}`,
    epic: `${urls.epic}?api_key=${apiKey}`,
    flares: `${urls.donki}/FLR?startDate=${startDate}&endDate=${endDate}`,
    storms: `${urls.donki}/GST?startDate=${startDate}&endDate=${endDate}`,
    eonet: `${urls.eonet}?status=open&limit=100`,
    images: `${urls.nasaImages}?q=${encodeURIComponent(search)}&page_size=6&media_type=image`
  };
  const sources = { apod: 'NASA Astronomy Picture of the Day', epic: 'NASA EPIC', flares: 'NASA CCMC DONKI solar flares', storms: 'NASA CCMC DONKI geomagnetic storms', eonet: 'NASA EONET', images: 'NASA Image and Video Library' };
  const keyParts = { apod: `apod:${date}`, epic: 'epic:latest', flares: `flr:${startDate}:${endDate}`, storms: `gst:${startDate}:${endDate}`, eonet: 'eonet:open', images: `images:${search.toLowerCase()}` };
  const run = (name) => serviceResult(sources[name], () => cachedFetch(keyParts[name], ttl.nasa, urlsByService[name]));

  if (service !== 'summary' && !Object.hasOwn(urlsByService, service)) {
    return send(res, 400, envelope({ ok: false, source: 'NASA Open APIs', error: 'Unknown NASA data service.' }));
  }
  if (service !== 'summary') {
    const result = await run(service);
    return send(res, 200, envelope({ ok: result.ok, data: result.data, source: result.source, fetchedAt: result.fetchedAt, cached: result.cached, error: result.error, rateLimitRemaining: result.rateLimitRemaining, latencyMs: result.latencyMs, usingDemoKey: isDemo() }), ttl.nasa);
  }

  const names = Object.keys(urlsByService);
  const results = await Promise.all(names.map((name) => run(name)));
  const services = Object.fromEntries(names.map((name, index) => [name, results[index]]));
  const rates = results.map((item) => item.rateLimitRemaining).filter((value) => value !== null);
  const successful = results.filter((item) => item.ok).length;
  return send(res, 200, envelope({
    ok: successful > 0,
    data: { services },
    source: 'NASA Open APIs, NASA CCMC DONKI, EONET, NASA Image and Video Library',
    fetchedAt: new Date().toISOString(),
    cached: results.every((item) => item.cached),
    error: successful === results.length ? null : `${successful} of ${results.length} NASA feeds responded.`,
    rateLimitRemaining: rates.length ? Math.min(...rates.map(Number)) : null,
    usingDemoKey: isDemo()
  }), ttl.nasa);
};
