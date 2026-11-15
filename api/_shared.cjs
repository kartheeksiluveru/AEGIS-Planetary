const cache = new Map();
const pending = new Map();
const DEFAULT_TIMEOUT_MS = 3500;

function send(res, statusCode, payload, maxAge = 60) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=${Math.max(maxAge, 60)}`);
  res.status(statusCode).json(payload);
}

function envelope({ ok, data = null, source, fetchedAt = new Date().toISOString(), cached = false, error = null, ...extra }) {
  return { ok, data, source, fetchedAt, cached, error, ...extra };
}

async function request(url, { kind = 'json', timeoutMs = DEFAULT_TIMEOUT_MS, headers = {} } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'AEGIS-NASA-Data-Hub/1.0', ...headers } });
      if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}`);
      let data;
      if (kind === 'text') data = await response.text();
      else if (kind === 'base64') data = Buffer.from(await response.arrayBuffer()).toString('base64');
      else data = await response.json();
      return {
        data,
        status: response.status,
        contentType: response.headers.get('content-type') || '',
        rateLimitRemaining: response.headers.get('x-ratelimit-remaining'),
        fetchedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 180));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('Upstream request failed');
}

async function cachedRequest(key, ttlSeconds, fetcher) {
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now()) return { ...existing.value, cached: true };
  if (pending.has(key)) return { ...(await pending.get(key)), cached: true };
  const task = (async () => {
    try {
      const value = await fetcher();
      const saved = { ...value, cached: false };
      cache.set(key, { value: saved, expiresAt: Date.now() + ttlSeconds * 1000 });
      return saved;
    } catch (error) {
      if (existing) return { ...existing.value, cached: true, stale: true, error: error.message };
      throw error;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, task);
  return task;
}

function safeDate(value, fallback) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : fallback;
}

function daysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function validCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

module.exports = { send, envelope, request, cachedRequest, safeDate, daysAgo, validCoordinate };
