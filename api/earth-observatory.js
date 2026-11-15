const { urls, ttl } = require('../assets/js/sources.js');
const { send, envelope, request, cachedRequest } = require('./_shared.cjs');

function decodeXml(value = '') {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function parseItems(xml) {
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => {
    const body = match[1];
    const text = (tag) => decodeXml(body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const encoded = body.match(/<(?:content:encoded|description)[^>]*>([\s\S]*?)<\/(?:content:encoded|description)>/i)?.[1] || '';
    const image = encoded.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || body.match(/<enclosure[^>]+url=["']([^"']+)["']/i)?.[1] || '';
    const link = text('link') || decodeXml(body.match(/<link[^>]*>([^<]+)<\/link>/i)?.[1] || '');
    const title = text('title');
    const date = text('pubDate') || text('dc:date');
    return { title, date, thumbnail: image, link };
  }).filter((item) => item.title && /^https:\/\//.test(item.link));
}

module.exports = async function earthObservatory(req, res) {
  try {
    const result = await cachedRequest('earth-observatory-feeds', ttl.earthObservatory, async () => {
      const [imageFeed, eventsFeed] = await Promise.all([
        request(urls.earthObservatoryImageFeed, { kind: 'text' }),
        request(urls.earthObservatoryEventsFeed, { kind: 'text' })
      ]);
      const imageItems = parseItems(imageFeed.data);
      const eventItems = parseItems(eventsFeed.data);
      const items = [...imageItems, ...eventItems].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 6);
      return { data: { items, feedUrls: [urls.earthObservatoryImageFeed, urls.earthObservatoryEventsFeed] }, fetchedAt: new Date().toISOString(), latencyMs: Math.max(imageFeed.latencyMs, eventsFeed.latencyMs) };
    });
    return send(res, 200, envelope({ ok: true, data: result.data, source: 'NASA Earth Observatory RSS', fetchedAt: result.fetchedAt, cached: result.cached, error: result.error || null, latencyMs: result.latencyMs }), ttl.earthObservatory);
  } catch (error) {
    return send(res, 200, envelope({ ok: false, source: 'NASA Earth Observatory RSS', error: error.message }), ttl.earthObservatory);
  }
};
