"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TrackingStateKind, VehicleLocation, WardTracking } from "@swachhata/core";
import { getDataService, ServiceError } from "@swachhata/core";
import { TRACKING } from "@/lib/config";
import { evaluateFix } from "@swachhata/core";

/** Drives the "updated N seconds ago" line and the live/stale flip. */
const CLOCK_MS = 1_000;

export interface WardTrackingResult {
  tracking: WardTracking | null;
  /** The freshest fix that passed the GPS filter. Rejected points never reach the map. */
  location: VehicleLocation | null;
  /** Status after applying freshness — this is what the UI shows, not the raw snapshot. */
  status: TrackingStateKind;
  /** Points dropped by the filter this session; surfaced in the panel, not as an error. */
  rejectedFixes: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useWardTracking(wardId: string | null): WardTrackingResult {
  const [tracking, setTracking] = useState<WardTracking | null>(null);
  const [location, setLocation] = useState<VehicleLocation | null>(null);
  const [rejectedFixes, setRejectedFixes] = useState(0);
  const [loading, setLoading] = useState(Boolean(wardId));
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [tick, setTick] = useState(0);
  const acceptedRef = useRef<VehicleLocation | null>(null);
  /** Set once the live subscription has delivered; the initial fetch then stands down. */
  const pushedRef = useRef(false);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  // Snapshot: ward → today's assignment → vehicle → session.
  useEffect(() => {
    if (!wardId) {
      setTracking(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    pushedRef.current = false;

    const load = async () => {
      try {
        const snapshot = await getDataService().getWardTracking(wardId);
        // A push that landed while this was in flight describes a later moment than this
        // reply does, so the reply is dropped rather than rewinding the screen.
        if (cancelled || pushedRef.current) return;
        setTracking(snapshot);
        setError(null);

        // Seed from the snapshot so the map has something to draw before the first push.
        const seeded = "location" in snapshot.state ? snapshot.state.location : null;
        if (seeded) {
          acceptedRef.current = seeded;
          setLocation(seeded);
        }
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof ServiceError
            ? caught.message
            : "We could not load collection details. Please try again.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    // Operations changes — an absence, a cancelled assignment, a session ending — arrive
    // as pushes rather than on a poll, so the citizen sees them within a frame.
    const unsubscribe = getDataService().subscribeToWardTracking(wardId, (snapshot) => {
      if (cancelled) return;
      pushedRef.current = true;
      setTracking(snapshot);
      setError(null);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [wardId, nonce]);

  const vehicleId = tracking && "vehicle" in tracking.state ? tracking.state.vehicle.id : null;

  // Realtime: only subscribe to the one vehicle serving this ward.
  useEffect(() => {
    if (!vehicleId) {
      acceptedRef.current = null;
      setLocation(null);
      return;
    }

    acceptedRef.current = null;
    setRejectedFixes(0);

    return getDataService().subscribeToVehicle(vehicleId, (fix) => {
      const verdict = evaluateFix(acceptedRef.current, fix);
      if (!verdict.accepted) {
        setRejectedFixes((n) => n + 1);
        return;
      }
      acceptedRef.current = fix;
      setLocation(fix);
    });
  }, [vehicleId]);

  // A one-second heartbeat, so staleness is noticed even when no fix arrives.
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => (t + 1) % 3600), CLOCK_MS);
    return () => clearInterval(interval);
  }, []);

  const status = useMemo<TrackingStateKind>(() => {
    if (!tracking) return "NO_ROUTE";
    const base = tracking.state.kind;
    if (base !== "LIVE" && base !== "CONNECTION_LOST") return base;
    if (!location) return "NOT_STARTED";
    const age = Date.now() - Date.parse(location.recordedAt);
    return age > TRACKING.liveWindowMs ? "CONNECTION_LOST" : "LIVE";
    // `tick` is a real dependency: it is what re-evaluates freshness when no fix arrives.
  }, [tracking, location, tick]);

  return { tracking, location, status, rejectedFixes, loading, error, refresh };
}
