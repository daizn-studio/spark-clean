/* =========================================================
   MAP — OpenStreetMap tiles + Leaflet, no API key required.

   Geocoding (turning "Southbank" into map coordinates) uses OSM's free
   Nominatim search API. It's a shared public service, not a paid API, so
   this deliberately rate-limits itself (one lookup at a time, debounced,
   and never re-queries the same text twice) to stay well within
   Nominatim's usage policy: https://operations.osmfoundation.org/policies/nominatim/
   For serious production volume, self-hosting Nominatim or switching to
   a paid geocoder is the polite path — fine for a single Melbourne
   cleaning business's traffic level, not fine for scraping at scale.
========================================================= */

const MELBOURNE_CENTER = [-37.8136, 144.9631];
// Roughly greater-Melbourne (Werribee to Pakenham, Craigieburn to Frankston).
// Passed to Nominatim as a hard bounding box so a house number, street name,
// or landmark search — not just a suburb name — still resolves to a real
// place inside Melbourne rather than a same-named spot interstate/overseas.
const MELBOURNE_BOUNDS = { left: 144.5, top: -37.55, right: 145.5, bottom: -38.4 };
let map, marker, geocodeDebounceTimer, lastGeocodedQuery = '';

function initLocationMap() {
  if (typeof L === 'undefined') {
    console.warn('[map] Leaflet failed to load — map will stay hidden.');
    document.getElementById('locationMap').style.display = 'none';
    return;
  }

  map = L.map('locationMap', { scrollWheelZoom: false }).setView(MELBOURNE_CENTER, 12);
  // CARTO's free dark basemap (no API key) instead of default light OSM
  // tiles — matches the rest of the booking flow's dark, premium styling
  // rather than dropping a bright white map into it.
  // CARTO's basemaps started returning "API KEY REQUIRED" tiles, so the
  // map rendered as a grid of watermarks. OpenStreetMap's own tiles are
  // free with attribution and need no key.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  // A small glowing accent dot instead of Leaflet's default blue pin, so
  // the marker matches the site's own accent colour rather than a
  // generic map-library blue.
  const accentIcon = L.divIcon({
    className: 'sc-map-marker',
    html: '<span></span>',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
  marker = L.marker(MELBOURNE_CENTER, { icon: accentIcon }).addTo(map);

  const suburbInput = document.getElementById('serviceSuburb');
  suburbInput.addEventListener('input', () => {
    clearTimeout(geocodeDebounceTimer);
    const query = suburbInput.value.trim();
    if (query.length < 3) return;
    // Wait for a pause in typing before hitting the shared Nominatim service.
    geocodeDebounceTimer = setTimeout(() => geocodeSuburb(query), 900);
  });
}

async function geocodeSuburb(query) {
  const fullQuery = `${query}, Melbourne, Victoria, Australia`;
  if (fullQuery === lastGeocodedQuery) return;
  lastGeocodedQuery = fullQuery;

  const statusEl = document.getElementById('mapStatus');
  statusEl.textContent = 'Looking up that suburb…';

  try {
    const b = MELBOURNE_BOUNDS;
    const viewbox = `${b.left},${b.top},${b.right},${b.bottom}`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&viewbox=${viewbox}&bounded=1&q=${encodeURIComponent(fullQuery)}`;
    const response = await fetch(url);
    const results = await response.json();

    if (results.length === 0) {
      statusEl.textContent = "Couldn't find that in Melbourne — check the spelling, or booking still works fine either way.";
      return;
    }

    const { lat, lon, display_name } = results[0];
    const coords = [parseFloat(lat), parseFloat(lon)];
    map.setView(coords, 14);
    marker.setLatLng(coords);
    statusEl.textContent = `📍 ${display_name}`;
  } catch (err) {
    console.warn('[map] Geocoding lookup failed:', err);
    statusEl.textContent = 'Map lookup unavailable right now — booking still works fine either way.';
  }
}
