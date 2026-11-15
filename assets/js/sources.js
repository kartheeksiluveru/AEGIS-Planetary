(function attachAegisSources(root, createRegistry) {
  const registry = createRegistry();
  if (typeof module !== 'undefined' && module.exports) module.exports = registry;
  if (root) root.AEGIS_SOURCES = registry;
})(globalThis, () => {
  const urls = {
    apiNasa: 'https://api.nasa.gov',
    apod: 'https://science.nasa.gov/wp-json/wp/v2/apod-basic/',
    epic: 'https://api.nasa.gov/EPIC/api/natural',
    donki: 'https://ccmc.gsfc.nasa.gov/DONKI-API/get',
    eonet: 'https://eonet.gsfc.nasa.gov/api/v3/events',
    nasaImages: 'https://images-api.nasa.gov/search',
    imagesHome: 'https://images.nasa.gov/',
    imagesDetails: 'https://images.nasa.gov/details/',
    gibsCapabilities: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml',
    gibsTileBase: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',
    worldview: 'https://worldview.earthdata.nasa.gov/',
    cmrCollections: 'https://cmr.earthdata.nasa.gov/search/collections.json',
    cmrGranules: 'https://cmr.earthdata.nasa.gov/search/granules.json',
    earthdata: 'https://www.earthdata.nasa.gov/',
    earthdataSearch: 'https://search.earthdata.nasa.gov/',
    modisAtmosphere: 'https://atmosphere-imager.gsfc.nasa.gov/',
    blackMarble: 'https://blackmarble.gsfc.nasa.gov/',
    earthObservatory: 'https://science.nasa.gov/earth/earth-observatory/',
    earthObservatoryFeeds: 'https://science.nasa.gov/earth/earth-observatory/subscribe/feeds/',
    earthObservatoryImageFeed: 'https://science.nasa.gov/feed/earth-observatory/image-of-the-day',
    earthObservatoryEventsFeed: 'https://science.nasa.gov/feed/earth-observatory/natural-events',
    leafletCss: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    leafletJs: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    geocoder: 'https://nominatim.openstreetmap.org/search',
    apiNasaData: '/api/nasa',
    apiGibs: '/api/gibs',
    apiCmr: '/api/cmr',
    apiEarthObservatory: '/api/earth-observatory',
    fallbackBase: '/data/fallback/'
  };
  const ttl = { nasa: 300, eonet: 300, gibsCapabilities: 86400, gibsTile: 3600, cmr: 900, earthObservatory: 1800 };
  const sources = [
    { id: 'nasa-open', name: 'NASA Open APIs', homepage: urls.apiNasa, endpoint: `${urls.apiNasa} · APOD, EPIC, DONKI`, authNeeded: 'NASA_API_KEY (DEMO_KEY fallback)', rateLimit: 'Key-dependent; header monitored', cacheTtl: `${ttl.nasa}s`, accessMethod: 'API', status: 'checking' },
    { id: 'gibs', name: 'NASA GIBS', homepage: urls.gibsCapabilities, endpoint: urls.gibsCapabilities, authNeeded: 'No', rateLimit: 'Public tile service', cacheTtl: `${ttl.gibsCapabilities}s capabilities`, accessMethod: 'tiles + GetCapabilities', status: 'checking' },
    { id: 'worldview', name: 'NASA Worldview', homepage: urls.worldview, endpoint: urls.worldview, authNeeded: 'No', rateLimit: 'Web application', cacheTtl: 'Not cached', accessMethod: 'link-out', status: 'cached' },
    { id: 'cmr', name: 'Earthdata Search / CMR', homepage: urls.earthdataSearch, endpoint: urls.cmrCollections, authNeeded: 'No for metadata', rateLimit: 'Public metadata API', cacheTtl: `${ttl.cmr}s`, accessMethod: 'API + link-out', status: 'checking' },
    { id: 'earthdata', name: 'NASA Earthdata', homepage: urls.earthdata, endpoint: urls.earthdata, authNeeded: 'Login for downloads', rateLimit: 'Documentation link-out', cacheTtl: 'Not cached', accessMethod: 'link-out', status: 'cached' },
    { id: 'modis-atmosphere', name: 'NASA MODIS Atmosphere', homepage: urls.modisAtmosphere, endpoint: urls.modisAtmosphere, authNeeded: 'No for guides', rateLimit: 'Documentation link-out', cacheTtl: 'Curated guide', accessMethod: 'link-out', status: 'cached' },
    { id: 'black-marble', name: 'NASA Black Marble', homepage: urls.blackMarble, endpoint: urls.blackMarble, authNeeded: 'Earthdata Login for numeric products', rateLimit: 'Product link-out', cacheTtl: 'Curated guide', accessMethod: 'link-out', status: 'cached' },
    { id: 'earth-observatory', name: 'NASA Earth Observatory', homepage: urls.earthObservatory, endpoint: `${urls.earthObservatoryImageFeed} · ${urls.earthObservatoryEventsFeed}`, authNeeded: 'No', rateLimit: 'RSS feeds', cacheTtl: `${ttl.earthObservatory}s`, accessMethod: 'RSS feed', status: 'checking' }
  ];
  return { urls, ttl, sources };
});
