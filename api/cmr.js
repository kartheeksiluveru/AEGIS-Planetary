const { urls, ttl } = require('../assets/js/sources.js');
const { send, envelope, request, cachedRequest } = require('./_shared.cjs');

function parseCollection(entry) {
  const umm = entry.umm || {};
  const temporal = umm.TemporalExtents?.[0]?.RangeDateTimes?.[0] || umm.TemporalExtents?.[0]?.RangeDateTime || {};
  const citation = umm.CollectionCitations?.[0] || {};
  const doi = citation.OnlineResource?.Linkage || umm.RelatedUrls?.find((item) => /doi\.org/i.test(item.URL || ''))?.URL || umm.RelatedUrls?.find((item) => item.Type === 'VIEW RELATED INFORMATION')?.URL || '';
  const shortName = umm.ShortName || '—';
  const entryTitle = umm.EntryTitle || citation.Title || entry.title || 'Untitled collection';
  return {
    title: `${shortName !== '—' ? `${shortName}: ` : ''}${entryTitle}`,
    shortName,
    version: umm.Version || citation.Version || '—',
    provider: entry.meta?.['provider-id'] || entry.provider_id || '—',
    temporal: [temporal.BeginningDateTime, temporal.EndingDateTime].filter(Boolean).join(' — ') || 'Temporal range not provided',
    doi,
    conceptId: entry.meta?.['concept-id'] || entry.id,
    collectionUrl: `https://search.earthdata.nasa.gov/search?q=${encodeURIComponent(shortName !== '—' ? shortName : entryTitle)}`
  };
}

module.exports = async function cmr(req, res) {
  if (String(req.query.mode || '') === 'granules') {
    const ids = String(req.query.ids || '').split(',').filter((id) => /^[A-Za-z0-9_-]{1,128}$/.test(id)).slice(0, 6);
    if (!ids.length) return send(res, 400, envelope({ ok: false, source: 'NASA Common Metadata Repository', error: 'Valid collection IDs are required.' }));
    const bounds = String(req.query.bbox || '-180,-85,180,85').split(',').map(Number);
    const bbox = bounds.length === 4 && bounds.every(Number.isFinite) && bounds[0] >= -180 && bounds[2] <= 180 && bounds[1] >= -90 && bounds[3] <= 90 && bounds[0] < bounds[2] && bounds[1] < bounds[3] ? bounds.join(',') : '-180,-85,180,85';
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.startDate || '')) ? String(req.query.startDate) : new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const endDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.endDate || '')) ? String(req.query.endDate) : new Date().toISOString().slice(0, 10);
    const cacheKey = `cmr-granules:${ids.join(',')}:${bbox}:${startDate}:${endDate}`;
    try {
      const result = await cachedRequest(cacheKey, ttl.cmr, async () => {
        const granules = await Promise.all(ids.map(async (conceptId) => {
          const granuleUrl = new URL(urls.cmrGranules);
          granuleUrl.searchParams.set('collection_concept_id', conceptId);
          granuleUrl.searchParams.set('temporal', `${startDate}T00:00:00Z,${endDate}T23:59:59Z`);
          granuleUrl.searchParams.set('bounding_box', bbox);
          granuleUrl.searchParams.set('page_size', '1');
          try {
            const response = await request(granuleUrl.toString());
            return { conceptId, count: Number(response.data.feed?.hits ?? 0) };
          } catch {
            return { conceptId, count: null };
          }
        }));
        return { data: { granules }, fetchedAt: new Date().toISOString() };
      });
      return send(res, 200, envelope({ ok: true, data: result.data, source: 'NASA Common Metadata Repository granules', fetchedAt: result.fetchedAt, cached: result.cached, error: result.error || null }), ttl.cmr);
    } catch (error) {
      return send(res, 200, envelope({ ok: false, source: 'NASA Common Metadata Repository granules', error: error.message }), ttl.cmr);
    }
  }

  const keyword = String(req.query.q || 'MODIS cloud mask').trim().slice(0, 100);
  const collectionUrl = new URL(urls.cmrCollections);
  collectionUrl.searchParams.set('keyword', keyword);
  collectionUrl.searchParams.set('page_size', '6');
  const cacheKey = `cmr:${keyword.toLowerCase()}`;
  try {
    const result = await cachedRequest(cacheKey, ttl.cmr, async () => {
      const upstream = await request(collectionUrl.toString());
      const entries = upstream.data.feed?.entry || [];
      const items = entries.map((entry) => ({ ...parseCollection(entry), granuleCount: null }));
      return { data: { items, query: keyword, collectionHits: Number(upstream.data.feed?.hits ?? items.length) }, fetchedAt: upstream.fetchedAt, latencyMs: upstream.latencyMs };
    });
    return send(res, 200, envelope({ ok: true, data: result.data, source: 'NASA Common Metadata Repository', fetchedAt: result.fetchedAt, cached: result.cached, error: result.error || null, latencyMs: result.latencyMs }), ttl.cmr);
  } catch (error) {
    return send(res, 200, envelope({ ok: false, source: 'NASA Common Metadata Repository', error: error.message }), ttl.cmr);
  }
};
