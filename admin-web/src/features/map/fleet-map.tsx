"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LatLng } from "@swachhata/core";
import type { FleetRow } from "@swachhata/core";
import { MAPS } from "@/lib/config";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { MarkerAnimator } from "@/features/map/animator";
import { loadGoogleMaps } from "@/features/map/loader";
import { MAP_STYLE } from "@/features/map/map-style";
import { createTruckMarkerElement, TRUCK_SVG } from "@/features/map/truck-marker";
import { makeProjection, VIEW } from "@/features/map/projection";
import { OsmFleetMap } from "@/features/map/osm-fleet-map";

interface FleetMapProps {
  rows: FleetRow[];
  onSelect?: (vehicleId: string) => void;
  selectedVehicleId?: string | null;
}

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

interface VehicleVisual {
  animator: MarkerAnimator;
  marker: google.maps.marker.AdvancedMarkerElement;
  plate: HTMLDivElement;
}

/** Trackable rows are the only ones with a position worth drawing. */
function trackable(rows: FleetRow[]): FleetRow[] {
  return rows.filter(
    (row) => row.location && (row.status === "LIVE" || row.status === "CONNECTION_LOST"),
  );
}

function GoogleFleetMap({ rows, onSelect }: FleetMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const visualsRef = useRef<Map<string, VehicleVisual>>(new Map());
  const [ready, setReady] = useState(false);
  const reducedMotion = useReducedMotion();
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps()
      .then((maps) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        mapRef.current = new maps.Map(containerRef.current, {
          center: MAPS.defaultCenter,
          zoom: 13,
          mapId: MAP_ID,
          styles: MAP_ID === "DEMO_MAP_ID" ? undefined : MAP_STYLE,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        });
        setReady(true);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      visualsRef.current.forEach((visual) => {
        visual.animator.destroy();
        visual.marker.map = null;
      });
      visualsRef.current.clear();
      mapRef.current = null;
    };
  }, []);

  // One marker per tracked vehicle, created on first sight and reused from then on.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !window.google?.maps?.marker) return;

    const visible = trackable(rows);
    const seen = new Set(visible.map((row) => row.vehicle.id));

    visible.forEach((row) => {
      let visual = visualsRef.current.get(row.vehicle.id);

      if (!visual) {
        const { root, plate } = createTruckMarkerElement(row.vehicle.vehicleNumber);
        root.addEventListener("click", () => onSelectRef.current?.(row.vehicle.id));

        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          content: root,
          position: { lat: row.location!.lat, lng: row.location!.lng },
        });

        const animator = new MarkerAnimator((pose) => {
          marker.position = { lat: pose.lat, lng: pose.lng };
          plate.style.transform = `rotate(${pose.heading}deg)`;
        }, reducedMotion);

        visual = { animator, marker, plate };
        visualsRef.current.set(row.vehicle.id, visual);
      }

      if (row.location) visual.animator.push(row.location);
    });

    // Vehicles that stopped tracking lose their marker rather than freezing on the map.
    visualsRef.current.forEach((visual, vehicleId) => {
      if (seen.has(vehicleId)) return;
      visual.animator.destroy();
      visual.marker.map = null;
      visualsRef.current.delete(vehicleId);
    });
  }, [ready, rows, reducedMotion]);

  return <div ref={containerRef} className="h-full w-full" aria-label="Fleet live map" />;
}

function PreviewFleetMap({ rows, onSelect, selectedVehicleId }: FleetMapProps) {
  const visible = trackable(rows);

  const project = useMemo(() => {
    const points: LatLng[] = rows.flatMap((row) => row.route?.routeGeometry ?? []);
    visible.forEach((row) => {
      if (row.location) points.push({ lat: row.location.lat, lng: row.location.lng });
    });
    return makeProjection(points);
  }, [rows, visible]);

  return (
    <div className="relative h-full w-full bg-[#eef1ee]">
      <svg
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label={`Preview fleet map showing ${visible.length} tracked vehicles`}
      >
        <defs>
          <pattern id="fleet-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M48 0H0V48" fill="none" stroke="#dfe5e1" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={VIEW.width} height={VIEW.height} fill="url(#fleet-grid)" />

        {rows.map((row) =>
          row.route && row.route.routeGeometry.length > 1 ? (
            <polyline
              key={row.route.id + row.vehicle.id}
              points={row.route.routeGeometry.map(project).map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="#087F5B"
              strokeOpacity="0.18"
              strokeWidth="10"
              strokeLinejoin="round"
            />
          ) : null,
        )}

        {visible.map((row) => {
          const { x, y } = project(row.location!);
          const selected = selectedVehicleId === row.vehicle.id;
          return (
            <g
              key={row.vehicle.id}
              transform={`translate(${x} ${y})`}
              onClick={() => onSelect?.(row.vehicle.id)}
              className="cursor-pointer"
            >
              {selected ? <circle r="26" fill="#087F5B" fillOpacity="0.14" /> : null}
              <g
                transform={`rotate(${row.location!.heading ?? 0}) scale(1.05) translate(-17 -17)`}
                dangerouslySetInnerHTML={{ __html: TRUCK_SVG }}
              />
              <g transform="translate(0 -30)">
                <rect x="-32" y="-10" width="64" height="20" rx="10" fill="#10201A" />
                <text
                  x="0"
                  y="1"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#FFFFFF"
                  fontSize="11"
                  fontWeight="600"
                >
                  {row.vehicle.vehicleNumber}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      <p className="absolute bottom-3 left-3 rounded-lg bg-surface/92 px-2.5 py-1.5 text-[11px] font-medium text-ink-muted shadow-card">
        Preview map · add a Google Maps API key for the live street map
      </p>
    </div>
  );
}

/**
 * Google Maps when a key is configured, OpenStreetMap when there is none, and the
 * schematic preview when even tiles cannot load. All three animate the same markers.
 */
export function FleetMap(props: FleetMapProps) {
  const [tilesFailed, setTilesFailed] = useState(false);

  if (MAPS.apiKey) return <GoogleFleetMap {...props} />;
  if (tilesFailed) return <PreviewFleetMap {...props} />;
  return <OsmFleetMap {...props} onUnavailable={() => setTilesFailed(true)} />;
}
