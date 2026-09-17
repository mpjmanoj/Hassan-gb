"use client";

import { useMemo } from "react";
import type { LatLng } from "@swachhata/core";
import { LiveMap } from "@/features/map/live-map";
import { LiveBadge } from "@/components/live-badge";
import { distanceMeters, formatDistance } from "@swachhata/core";
import { formatClock, relativeTime } from "@swachhata/core";
import { useCitizenPosition } from "@/features/tracking/use-citizen-position";
import type { WardTrackingResult } from "@/features/tracking/use-ward-tracking";

const EMPTY_COPY: Record<string, { title: string; body: string }> = {
  NOT_STARTED: {
    title: "Collection has not started yet",
    body: "Your vehicle is assigned for today but the crew has not begun the route. We will show it here the moment it starts.",
  },
  ABSENT: {
    title: "Today's collection vehicle is unavailable",
    body: "The municipality has marked this vehicle absent for today's route.",
  },
  NO_ROUTE: {
    title: "No collection route assigned",
    body: "No route has been assigned to this ward for today. Please check again later or contact the ward office.",
  },
  COMPLETED: {
    title: "Collection completed for today",
    body: "The vehicle has finished this route. Tracking will resume with tomorrow's collection.",
  },
};

function centroid(points: LatLng[]): LatLng | null {
  if (points.length === 0) return null;
  const sum = points.reduce(
    (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
    { lat: 0, lng: 0 },
  );
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

export function TrackingSection({ result }: { result: WardTrackingResult }) {
  const { tracking, location, status, rejectedFixes, loading, error, refresh } = result;
  const { position, permission, request } = useCitizenPosition();

  const route = tracking?.route?.routeGeometry ?? [];
  const vehicle = tracking && "vehicle" in tracking.state ? tracking.state.vehicle : null;
  const startedAt = tracking && "startedAt" in tracking.state ? tracking.state.startedAt : null;

  const distance = useMemo(() => {
    if (!location) return null;
    const from = position ?? centroid(route);
    if (!from) return null;
    return {
      label: formatDistance(distanceMeters(from, location)),
      relativeTo: position ? "from you" : "from your ward",
    };
  }, [location, position, route]);

  if (loading && !tracking) {
    return <div className="mx-4 h-[420px] animate-pulse rounded-card bg-line/40" />;
  }

  if (error) {
    return (
      <section className="mx-4 card p-6">
        <h2 className="text-[17px] font-semibold">We could not load your collection details</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{error}</p>
        <button type="button" onClick={refresh} className="btn-secondary mt-5">
          Try again
        </button>
      </section>
    );
  }

  const trackable = status === "LIVE" || status === "CONNECTION_LOST";
  const empty = EMPTY_COPY[status];

  return (
    <section className="mx-4">
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <div className="relative h-[340px] w-full sm:h-[400px]">
          {trackable && vehicle ? (
            <LiveMap location={location} route={route} vehicleNumber={vehicle.vehicleNumber} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-muted px-8 text-center">
              <LiveBadge kind={status} />
              <h2 className="text-[17px] font-semibold">{empty?.title ?? "Tracking unavailable"}</h2>
              <p className="max-w-sm text-[14px] leading-relaxed text-ink-muted">
                {empty?.body ?? "Please try again in a few minutes."}
              </p>
              {status === "ABSENT" && tracking && tracking.state.kind === "ABSENT" && tracking.state.reason ? (
                <p className="mt-1 rounded-full bg-danger-light px-3 py-1 text-[12px] font-semibold text-danger">
                  Reason: {tracking.state.reason}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="border-t border-line p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[19px] font-bold tracking-tight">
                {vehicle ? `Vehicle ${vehicle.vehicleNumber}` : "No vehicle assigned"}
              </p>
              <p className="mt-1 text-[13px] text-ink-muted">
                {tracking
                  ? `Serving Ward ${tracking.ward.wardNumber} · ${tracking.ward.name}`
                  : "—"}
              </p>
            </div>
            <LiveBadge kind={status} />
          </div>

          {trackable ? (
            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
              <div>
                <dt className="label">Started</dt>
                <dd className="mt-1 text-[15px] font-semibold">
                  {startedAt ? formatClock(startedAt) : "—"}
                </dd>
              </div>
              <div>
                <dt className="label">Last update</dt>
                <dd className="mt-1 text-[15px] font-semibold">
                  {location ? relativeTime(location.recordedAt) : "—"}
                </dd>
              </div>
              <div>
                <dt className="label">Distance</dt>
                <dd className="mt-1 text-[15px] font-semibold">
                  {distance ? distance.label : "—"}
                  {distance ? (
                    <span className="ml-1 block text-[11px] font-medium text-ink-muted">
                      {distance.relativeTo}
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>
          ) : null}

          {status === "CONNECTION_LOST" ? (
            <p className="mt-4 rounded-xl bg-warn-light px-3 py-2.5 text-[13px] leading-relaxed text-warn">
              The vehicle&apos;s connection appears unavailable. The last known position is shown —
              it may have moved since.
            </p>
          ) : null}

          {trackable && permission !== "granted" ? (
            <button
              type="button"
              onClick={request}
              className="mt-4 text-[13px] font-semibold text-brand hover:text-brand-dark"
            >
              {permission === "denied"
                ? "Location is blocked — distance is shown from your ward"
                : "Use my location for an accurate distance"}
            </button>
          ) : null}

          {rejectedFixes > 0 ? (
            <p className="mt-3 text-[12px] text-ink-muted">
              {rejectedFixes} weak GPS {rejectedFixes === 1 ? "reading was" : "readings were"}{" "}
              ignored to keep the position accurate.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
