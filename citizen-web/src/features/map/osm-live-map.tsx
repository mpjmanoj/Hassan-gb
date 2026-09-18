"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, Polyline, TileLayer } from "leaflet";
import type { LatLng, VehicleLocation } from "@swachhata/core";
import { MAPS } from "@/lib/config";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { MarkerAnimator } from "@/features/map/animator";
import { createTruckMarkerElement } from "@/features/map/truck-marker";

interface OsmLiveMapProps {
  location: VehicleLocation | null;
  route: LatLng[];
  vehicleNumber: string;
  follow: boolean;
  onFollowChange: (follow: boolean) => void;
  recenterSignal: number;
  onUnavailable: (reason: string) => void;
}

/** A handful of failures means the tiles are not coming; one is just a gap in coverage. */
const TILE_FAILURE_LIMIT = 8;

/**
 * A real street map with no API key and no billing account, drawn from OpenStreetMap.
 *
 * This is what runs when no Google Maps key is configured. It is genuinely good enough to
 * drive a pilot on — the vehicle, the route and the streets are all real. Google Maps
 * remains the production path: OpenStreetMap's public tile servers are run on donated
 * capacity and their usage policy does not cover a city-wide service.
 *
 * The map, the marker and the route are created once and then mutated, exactly as in the
 * Google renderer, so a GPS update never rebuilds anything.
 */
export function OsmLiveMap({
  location,
  route,
  vehicleNumber,
  follow,
  onFollowChange,
  recenterSignal,
  onUnavailable,
}: OsmLiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const plateRef = useRef<HTMLElement | null>(null);
  const routeRef = useRef<Polyline | null>(null);
  const tilesRef = useRef<TileLayer | null>(null);
  const animatorRef = useRef<MarkerAnimator | null>(null);
  const followRef = useRef(follow);
  const tileFailuresRef = useRef(0);
  const [ready, setReady] = useState(false);
  const reducedMotion = useReducedMotion();

  followRef.current = follow;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [MAPS.defaultCenter.lat, MAPS.defaultCenter.lng],
        zoom: MAPS.defaultZoom,
        zoomControl: true,
        attributionControl: true,
      });
      mapRef.current = map;

      tilesRef.current = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        // Required by the OpenStreetMap licence. Do not remove.
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // No tiles means no map. Say so, rather than showing a grey void.
      tilesRef.current.on("tileerror", () => {
        tileFailuresRef.current += 1;
        if (tileFailuresRef.current === TILE_FAILURE_LIMIT) onUnavailable("TILES_UNAVAILABLE");
      });

      // A deliberate pan means the citizen wants to look around; stop chasing the truck.
      map.on("dragstart", () => onFollowChange(false));

      const { root, plate, setLabelVisible } = createTruckMarkerElement(vehicleNumber);
      setLabelVisible(true);

      markerRef.current = L.marker([MAPS.defaultCenter.lat, MAPS.defaultCenter.lng], {
        icon: L.divIcon({
          html: root.outerHTML,
          className: "",
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(map);

      // The icon is rebuilt from HTML by Leaflet, so take the live node it actually rendered.
      plateRef.current =
        markerRef.current.getElement()?.querySelector<HTMLElement>(".shv-marker__plate") ?? plate;

      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
      animatorRef.current?.destroy();
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
      routeRef.current = null;
    };
    // Built once on purpose; the effects below apply later prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw the service route only when the geometry itself changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;

    void (async () => {
      const L = (await import("leaflet")).default;
      routeRef.current?.remove();

      if (route.length < 2) {
        routeRef.current = null;
        return;
      }

      routeRef.current = L.polyline(
        route.map((point) => [point.lat, point.lng] as [number, number]),
        { color: "#087F5B", opacity: 0.28, weight: 6, interactive: false },
      ).addTo(map);

      map.fitBounds(routeRef.current.getBounds(), { padding: [48, 48] });
    })();
  }, [ready, route]);

  useEffect(() => {
    if (!ready) return;

    animatorRef.current?.destroy();
    animatorRef.current = new MarkerAnimator((pose) => {
      markerRef.current?.setLatLng([pose.lat, pose.lng]);
      if (plateRef.current) plateRef.current.style.transform = `rotate(${pose.heading}deg)`;
      if (followRef.current) mapRef.current?.setView([pose.lat, pose.lng], mapRef.current.getZoom());
    }, reducedMotion);

    return () => {
      animatorRef.current?.destroy();
      animatorRef.current = null;
    };
  }, [ready, reducedMotion]);

  // Every accepted fix is handed to the animator — the only per-update work.
  useEffect(() => {
    if (!ready || !location) return;
    animatorRef.current?.push(location);
  }, [ready, location]);

  useEffect(() => {
    if (!recenterSignal) return;
    const pose = animatorRef.current?.current;
    const map = mapRef.current;
    if (pose && map) map.setView([pose.lat, pose.lng], Math.max(map.getZoom(), 16));
  }, [recenterSignal]);

  return <div ref={containerRef} className="h-full w-full" aria-label="Live vehicle map" />;
}
