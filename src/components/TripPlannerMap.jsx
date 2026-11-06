"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cartoTileUrl } from "@/lib/mapTiles";
import { createRouteLookup } from "@/lib/bikeRoutes";
import bundledRoutes from "@/data/bike-routes.json";

const TILE_URL = cartoTileUrl(process.env.NEXT_PUBLIC_CARTO_API_KEY);
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const INK = "#1c2b3d";

const routes = createRouteLookup({ bundled: bundledRoutes });

// A white casing under the ink line keeps the route readable over busy tiles.
function drawRoute(layer, points) {
  L.polyline(points, { color: "#fff", weight: 7, opacity: 0.9, interactive: false }).addTo(layer);
  return L.polyline(points, { color: INK, weight: 4, lineJoin: "round", interactive: false }).addTo(layer);
}

// Pins are HTML (divIcon) so they use the site's fonts and colours and avoid
// Leaflet's default marker images, which break under bundlers.
function pinIcon(number, selected) {
  return L.divIcon({
    className: "",
    html: `<span class="trip-pin${selected ? " trip-pin--selected" : ""}">${number}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const originIcon = L.divIcon({
  className: "",
  html: '<span class="trip-origin"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export default function TripPlannerMap({ origin, attractions, selectedUid, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const map = L.map(containerRef.current, { scrollWheelZoom: false });
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, subdomains: "abcd", maxZoom: 19 }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const originPoint = [origin.lat, origin.lng];
    L.marker(originPoint, { icon: originIcon, title: origin.label, keyboard: false, zIndexOffset: 500 }).addTo(layer);

    attractions.forEach((attraction) => {
      const isSelected = attraction.uid === selectedUid;
      L.marker([attraction.lat, attraction.lng], {
        icon: pinIcon(attraction.number, isSelected),
        title: attraction.title,
        riseOnHover: true,
        zIndexOffset: isSelected ? 1000 : 0,
      })
        .on("click", () => onSelectRef.current(attraction.uid))
        .addTo(layer);
    });

    const selected = attractions.find((attraction) => attraction.uid === selectedUid);
    if (!selected) {
      const points = [originPoint, ...attractions.map((a) => [a.lat, a.lng])];
      map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 14 });
      return;
    }

    // Bundled routes draw at once. Otherwise a dashed straight line holds the
    // place until the router answers, and stays if it can't.
    const routeLayer = L.layerGroup().addTo(layer);
    const fit = (bounds) => map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
    const known = routes.peek(origin, selected);
    if (known) {
      fit(drawRoute(routeLayer, known.points).getBounds());
      return;
    }

    const target = [selected.lat, selected.lng];
    L.polyline([originPoint, target], { color: INK, weight: 2, dashArray: "6 6", interactive: false }).addTo(routeLayer);
    fit(L.latLngBounds([originPoint, target]));

    let cancelled = false;
    routes.fetch(origin, selected).then((route) => {
      if (cancelled || !route) return;
      routeLayer.clearLayers();
      fit(drawRoute(routeLayer, route.points).getBounds());
    });
    return () => {
      cancelled = true;
    };
  }, [origin, attractions, selectedUid]);

  return <div ref={containerRef} className="trip-map aspect-4/3 w-full bg-cream-dark" />;
}
