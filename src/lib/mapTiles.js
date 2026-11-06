// CARTO Voyager raster tiles. CARTO requires a (free) API key; without one the
// tiles still load but carry an "API KEY REQUIRED" watermark.
const CARTO_VOYAGER = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

export function cartoTileUrl(apiKey) {
  const key = apiKey?.trim();
  return key ? `${CARTO_VOYAGER}?key=${encodeURIComponent(key)}` : CARTO_VOYAGER;
}
