"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, Polyline, TileLayer } from "leaflet";
import type { FleetRow } from "@swachhata/core";
import { MAPS } from "@/lib/config";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { MarkerAnimator } from "@/features/map/animator";
import { createTruckMarkerElement } from "@/features/map/truck-marker";

interface OsmFleetMapProps {
  rows: FleetRow[];
  onSelect?: (vehicleId: string) => void;
  onUnavailable: () => void;
}

const TILE_FAILURE_LIMIT = 8;

interface VehicleVisual {
  marker: Marker;
  plate: HTMLElement | null;
  animator: MarkerAnimator;
}

function trackable(rows: FleetRow[]): FleetRow[] {
  return rows.filter(
    (row) => row.location && (row.status === "LIVE" || row.status === "CONNECTION_LOST"),
  );
}

/**
 * The fleet on a real street map, with no API key. See the citizen renderer for why this
 * exists and why Google Maps stays the production path.
 */
export function OsmFleetMap({ rows, onSelect, onUnavailable }: OsmFleetMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const tilesRef = useRef<TileLayer | null>(null);
  const visualsRef = useRef<Map<string, VehicleVisual>>(new Map());
  const routesRef = useRef<Polyline[]>([]);
  const tileFailuresRef = useRef(0);
  const fittedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const reducedMotion = useReducedMotion();
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [MAPS.defaultCenter.lat, MAPS.defaultCenter.lng],
        zoom: 13,
        zoomControl: true,
      });
      mapRef.current = map;

      tilesRef.current = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      tilesRef.current.on("tileerror", () => {
        tileFailuresRef.current += 1;
        if (tileFailuresRef.current === TILE_FAILURE_LIMIT) onUnavailable();
      });

      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
      visualsRef.current.forEach((visual) => visual.animator.destroy());
      visualsRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Routes: redrawn only when the set of routes changes, not on every position.
  const routeKey = rows
    .map((row) => (row.route?.routeGeometry.length ? row.route.id : ""))
    .join("|");

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    void (async () => {
      const L = (await import("leaflet")).default;
      routesRef.current.forEach((line) => line.remove());
      routesRef.current = [];

      rows.forEach((row) => {
        if (!row.route || row.route.routeGeometry.length < 2) return;
        routesRef.current.push(
          L.polyline(
            row.route.routeGeometry.map((point) => [point.lat, point.lng] as [number, number]),
            { color: "#087F5B", opacity: 0.2, weight: 6, interactive: false },
          ).addTo(map),
        );
      });
    })();
    // `rows` changes on every fix; the routes only need redrawing when the routes change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, routeKey]);

  // One marker per tracked vehicle, created on first sight and mutated from then on.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    void (async () => {
      const L = (await import("leaflet")).default;
      const visible = trackable(rows);
      const seen = new Set(visible.map((row) => row.vehicle.id));

      visible.forEach((row) => {
        let visual = visualsRef.current.get(row.vehicle.id);

        if (!visual) {
          const { root } = createTruckMarkerElement(row.vehicle.vehicleNumber);
          const marker = L.marker([row.location!.lat, row.location!.lng], {
            icon: L.divIcon({
              html: root.outerHTML,
              className: "",
              iconSize: [34, 34],
              iconAnchor: [17, 17],
            }),
          }).addTo(map);

          marker.on("click", () => onSelectRef.current?.(row.vehicle.id));
          const plate = marker.getElement()?.querySelector<HTMLElement>(".shv-marker__plate") ?? null;

          visual = {
            marker,
            plate,
            animator: new MarkerAnimator((pose) => {
              marker.setLatLng([pose.lat, pose.lng]);
              if (plate) plate.style.transform = `rotate(${pose.heading}deg)`;
            }, reducedMotion),
          };
          visualsRef.current.set(row.vehicle.id, visual);
        }

        if (row.location) visual.animator.push(row.location);
      });

      // A vehicle that stopped tracking loses its marker rather than freezing on the map.
      visualsRef.current.forEach((visual, vehicleId) => {
        if (seen.has(vehicleId)) return;
        visual.animator.destroy();
        visual.marker.remove();
        visualsRef.current.delete(vehicleId);
      });

      // Frame the fleet once, then leave the camera to the operator.
      if (!fittedRef.current && visible.length > 0) {
        fittedRef.current = true;
        map.fitBounds(
          visible.map((row) => [row.location!.lat, row.location!.lng] as [number, number]),
          { padding: [60, 60], maxZoom: 16 },
        );
      }
    })();
  }, [ready, rows, reducedMotion]);

  return <div ref={containerRef} className="h-full w-full" aria-label="Fleet live map" />;
}
