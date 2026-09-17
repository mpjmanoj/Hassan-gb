"use client";

import { useEffect, useState } from "react";
import type { LatLng, VehicleLocation } from "@swachhata/core";
import { MAPS } from "@/lib/config";
import { GoogleLiveMap } from "@/features/map/google-live-map";
import { PreviewMap } from "@/features/map/preview-map";

interface LiveMapProps {
  location: VehicleLocation | null;
  route: LatLng[];
  vehicleNumber: string;
}

/**
 * Chooses the real Google map when a key is configured and falls back to the preview
 * map otherwise, so a missing key degrades the map rather than the whole screen.
 */
export function LiveMap({ location, route, vehicleNumber }: LiveMapProps) {
  const [mapsFailed, setMapsFailed] = useState(!MAPS.apiKey);
  const [follow, setFollow] = useState(true);
  const [recenterSignal, setRecenterSignal] = useState(0);

  useEffect(() => {
    if (follow) setRecenterSignal((n) => n + 1);
  }, [follow]);

  const recenter = () => {
    setFollow(true);
    setRecenterSignal((n) => n + 1);
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      {mapsFailed ? (
        <PreviewMap location={location} route={route} vehicleNumber={vehicleNumber} />
      ) : (
        <GoogleLiveMap
          location={location}
          route={route}
          vehicleNumber={vehicleNumber}
          follow={follow}
          onFollowChange={setFollow}
          recenterSignal={recenterSignal}
          onUnavailable={() => setMapsFailed(true)}
        />
      )}

      {!mapsFailed && !follow ? (
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
