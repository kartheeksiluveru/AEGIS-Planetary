const { urls, ttl } = require('../assets/js/sources.js');
const { send, envelope, request, cachedRequest, daysAgo, safeDate } = require('./_shared.cjs');

function parseCollection(entry) {
  const umm = entry.umm || {};
  const temporal = umm.TemporalExtents?.[0]?.RangeDateTime || {};
  const doi = umm.RelatedUrls?.find((item) => /doi\.org/i.test(item.URL || ''))?.URL || umm.RelatedUrls?.find((item) => item.Type === 'VIEW RELATED INFORMATION')?.URL || '';
  return {
    title: umm.ShortName ? `${umm.ShortName}: ${umm.EntryTitle || entry.title || 'Untitled collection'}` : (umm.EntryTitle || entry.title || 'Untitled collection'),
    shortName: umm.ShortName || '—',
    version: umm.Version || '—',
    provider: entry.provider_id || '—',
    temporal: [temporal.BeginningDateTime, temporal.EndingDateTime].filter(Boolean).join(' — ') || 'Temporal range not provided',
    doi,
    conceptId: entry.id,
    collectionUrl: `https://search.earthdata.nasa.gov/search?q=${encodeURIComponent(umm.ShortName || entry.title || '')}`
  };
}

module.exports = async function cmr(req, res) {
  const keyword = String(req.query.q || 'MODIS cloud mask').trim().slice(0, 100);
  const bboxParts = String(req.query.bbox || '').split(',').map(Number);
  const bbox = bboxParts.length === 4 && bboxParts.every(Number.isFinite) && bboxParts[0] >= -180 && bboxParts[2] <= 180 && bboxParts[1] >= -90 && bboxParts[3] <= 90 && bboxParts[0] < bboxParts[2] && bboxParts[1] < bboxParts[3] ? bboxParts.join(',') : '-180,-85,180,85';
  const startDate = safeDate(req.query.startDate, daysAgo(3));
  const endDate = safeDate(req.query.endDate, new Date().toISOString().slice(0, 10));
  const collectionUrl = new URL(urls.cmrCollections);
  collectionUrl.searchParams.set('keyword', keyword);
  collectionUrl.searchParams.set('page_size', '6');
  collectionUrl.searchParams.set('include_facets', 'false');
  const cacheKey = `cmr:${keyword.toLowerCase()}:${bbox}:${startDate}:${endDate}`;
  try {
    const result = await cachedRequest(cacheKey, ttl.cmr, async () => {
      const upstream = await request(collectionUrl.toString());
      const entries = upstream.data.feed?.entry || [];
      const items = await Promise.all(entries.map(async (entry) => {
        const collection = parseCollection(entry);
        const granuleUrl = new URL(urls.cmrGranules);
        granuleUrl.searchParams.set('collection_concept_id', collection.conceptId);
        granuleUrl.searchParams.set('temporal', `${startDate}T00:00:00Z,${endDate}T23:59:59Z`);
        granuleUrl.searchParams.set('bounding_box', bbox);
        granuleUrl.searchParams.set('page_size', '1');
        try {
          const granules = await request(granuleUrl.toString());
          collection.granuleCount = Number(granules.data.feed?.hits ?? 0);
        } catch {
          collection.granuleCount = null;
        }
        return collection;
      }));
      return { data: { items, query: keyword, bbox, startDate, endDate, collectionHits: Number(upstream.data.feed?.hits ?? items.length) }, fetchedAt: upstream.fetchedAt, latencyMs: upstream.latencyMs };
    });
    return send(res, 200, envelope({ ok: true, data: result.data, source: 'NASA Common Metadata Repository', fetchedAt: result.fetchedAt, cached: result.cached, error: result.error || null, latencyMs: result.latencyMs }), ttl.cmr);
  } catch (error) {
    return send(res, 200, envelope({ ok: false, source: 'NASA Common Metadata Repository', error: error.message }), ttl.cmr);
  }
};
