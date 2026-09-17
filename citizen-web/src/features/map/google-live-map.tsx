"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLng, VehicleLocation } from "@/types/domain";
import { MAPS } from "@/lib/config";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { MarkerAnimator } from "@/features/map/animator";
import { loadGoogleMaps } from "@/features/map/loader";
import { MAP_STYLE } from "@/features/map/map-style";
import { createTruckMarkerElement } from "@/features/map/truck-marker";

interface GoogleLiveMapProps {
  location: VehicleLocation | null;
  route: LatLng[];
  vehicleNumber: string;
  /** Keeps the camera on the vehicle until the citizen pans the map themselves. */
  follow: boolean;
  onFollowChange: (follow: boolean) => void;
  /** Incrementing this value re-centres the map on the vehicle. */
  recenterSignal: number;
  onUnavailable: (reason: string) => void;
}

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

/**
 * The map, the marker and the route polyline are created once and then mutated.
 * Nothing here re-renders React on a GPS update, and nothing reloads the map.
 */
export function GoogleLiveMap({
  location,
  route,
  vehicleNumber,
  follow,
  onFollowChange,
  recenterSignal,
  onUnavailable,
}: GoogleLiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const plateRef = useRef<HTMLDivElement | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const animatorRef = useRef<MarkerAnimator | null>(null);
  const followRef = useRef(follow);
  const [ready, setReady] = useState(false);
  const reducedMotion = useReducedMotion();

  followRef.current = follow;

  // Create the map once.
  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps()
      .then(async (maps) => {
        if (cancelled || !containerRef.current || mapRef.current) return;

        const map = new maps.Map(containerRef.current, {
          center: MAPS.defaultCenter,
          zoom: MAPS.defaultZoom,
          mapId: MAP_ID,
          styles: MAP_ID === "DEMO_MAP_ID" ? undefined : MAP_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: maps.ControlPosition.RIGHT_BOTTOM },
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        mapRef.current = map;

        // A deliberate pan means the citizen wants to look around; stop chasing the truck.
        map.addListener("dragstart", () => onFollowChange(false));

        const { AdvancedMarkerElement } = (await maps.importLibrary(
          "marker",
        )) as google.maps.MarkerLibrary;

        if (cancelled) return;
        const { root, plate, setLabelVisible } = createTruckMarkerElement(vehicleNumber);
        plateRef.current = plate;
        setLabelVisible(true);

        markerRef.current = new AdvancedMarkerElement({
          map,
          content: root,
          position: MAPS.defaultCenter,
          zIndex: 10,
        });

        setReady(true);
      })
      .catch((error: Error) => {
        if (!cancelled) onUnavailable(error.message);
      });

    return () => {
      cancelled = true;
      animatorRef.current?.destroy();
      polylineRef.current?.setMap(null);
      if (markerRef.current) markerRef.current.map = null;
      mapRef.current = null;
      markerRef.current = null;
    };
    // The map is intentionally built once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw (and redraw) the service route only when the geometry itself changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !window.google?.maps) return;

    polylineRef.current?.setMap(null);
    if (route.length < 2) {
      polylineRef.current = null;
      return;
    }

    polylineRef.current = new google.maps.Polyline({
      map,
      path: route,
      strokeColor: "#087F5B",
      strokeOpacity: 0.28,
      strokeWeight: 6,
      clickable: false,
    });

    const bounds = new google.maps.LatLngBounds();
    route.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 48);
  }, [ready, route]);

  // Rebuild the animator when the motion preference changes, so the setting applies at once.
  useEffect(() => {
    if (!ready) return;

    animatorRef.current?.destroy();
    animatorRef.current = new MarkerAnimator((pose) => {
      const marker = markerRef.current;
      if (!marker) return;
      marker.position = { lat: pose.lat, lng: pose.lng };
      if (plateRef.current) {
        plateRef.current.style.transform = `rotate(${pose.heading}deg)`;
      }
      if (followRef.current) mapRef.current?.setCenter({ lat: pose.lat, lng: pose.lng });
    }, reducedMotion);

    return () => {
      animatorRef.current?.destroy();
      animatorRef.current = null;
    };
  }, [ready, reducedMotion]);

  // Every accepted fix is handed to the animator — this is the only per-update work.
  useEffect(() => {
    if (!ready || !location) return;
    animatorRef.current?.push(location);
  }, [ready, location]);

  useEffect(() => {
    if (!recenterSignal) return;
    const pose = animatorRef.current?.current;
    if (pose && mapRef.current) {
      mapRef.current.panTo({ lat: pose.lat, lng: pose.lng });
      mapRef.current.setZoom(Math.max(mapRef.current.getZoom() ?? 16, 16));
    }
  }, [recenterSignal]);

  return <div ref={containerRef} className="h-full w-full" aria-label="Live vehicle map" />;
}
