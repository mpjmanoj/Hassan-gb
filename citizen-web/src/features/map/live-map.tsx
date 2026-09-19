"use client";

import { useEffect, useState } from "react";
import type { LatLng, VehicleLocation } from "@swachhata/core";
import { MAPS } from "@/lib/config";
import { GoogleLiveMap } from "@/features/map/google-live-map";
import { OsmLiveMap } from "@/features/map/osm-live-map";
import { PreviewMap } from "@/features/map/preview-map";

interface LiveMapProps {
  location: VehicleLocation | null;
  route: LatLng[];
  vehicleNumber: string;
}

/**
 * Three renderers, one behaviour.
 *
 *   Google Maps       when a key is configured — the production path.
 *   OpenStreetMap     when there is no key. A real street map, no key, no billing.
 *   Preview           when even tiles cannot load. Schematic, and labelled as such.
 *
 * Each degrades to the next, so a missing key or a dead connection costs the map, never
 * the screen. All three animate the same marker from the same fixes.
 */
export function LiveMap({ location, route, vehicleNumber }: LiveMapProps) {
  const [googleFailed, setGoogleFailed] = useState(!MAPS.apiKey);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [follow, setFollow] = useState(true);
  const [recenterSignal, setRecenterSignal] = useState(0);

  const renderer = MAPS.apiKey && !googleFailed ? "google" : tilesFailed ? "preview" : "osm";

  useEffect(() => {
    if (follow) setRecenterSignal((n) => n + 1);
  }, [follow]);

  const recenter = () => {
    setFollow(true);
    setRecenterSignal((n) => n + 1);
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      {renderer === "preview" ? (
        <PreviewMap location={location} route={route} vehicleNumber={vehicleNumber} />
      ) : renderer === "google" ? (
        <GoogleLiveMap
          location={location}
          route={route}
          vehicleNumber={vehicleNumber}
          follow={follow}
          onFollowChange={setFollow}
          recenterSignal={recenterSignal}
          onUnavailable={() => setGoogleFailed(true)}
        />
      ) : (
        <OsmLiveMap
          location={location}
          route={route}
          vehicleNumber={vehicleNumber}
          follow={follow}
          onFollowChange={setFollow}
          recenterSignal={recenterSignal}
          onUnavailable={() => setTilesFailed(true)}
        />
      )}

      {renderer !== "preview" && !follow ? (
        <button
          type="button"
          onClick={recenter}
          className="absolute bottom-4 left-4 inline-flex items-center gap-2 rounded-full bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink shadow-card animate-fade-in"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="3" stroke="#087F5B" strokeWidth="1.6" />
            <path d="M8 1v2.2M8 12.8V15M15 8h-2.2M3.2 8H1" stroke="#087F5B" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Recentre
        </button>
      ) : null}
    </div>
  );
}
