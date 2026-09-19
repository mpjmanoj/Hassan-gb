"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createWorkerService, fixFromPosition, type GpsFix } from "@swachhata/core";
import { getSupabaseClient } from "@/lib/supabase";

const QUEUE_KEY = "swachhata.worker.queue";
const UPLOAD_EVERY_MS = 10_000;

export interface TrackingStats {
  /** Readings the device has produced this shift. */
  captured: number;
  /** Readings the server stored. */
  accepted: number;
  /** Readings the server refused — too inaccurate, out of order, or already stored. */
  rejected: number;
  /** Readings waiting for a connection. */
  queued: number;
  lastFixAt: string | null;
  lastUploadAt: string | null;
  accuracy: number | null;
  speedKmh: number | null;
}

const EMPTY_STATS: TrackingStats = {
  captured: 0,
  accepted: 0,
  rejected: 0,
  queued: 0,
  lastFixAt: null,
  lastUploadAt: null,
  accuracy: null,
  speedKmh: null,
};

function loadQueue(): GpsFix[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as GpsFix[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: GpsFix[]) {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-2000)));
  } catch {
    // A full quota must not stop tracking; the newest fixes matter most.
  }
}

/**
 * Reads the device's GPS and gets it to the server.
 *
 * GPS and the network are separate systems: the phone can have a perfect fix and no signal.
 * So every reading goes into a queue that survives a reload, and the queue drains whenever
 * a connection is there. Nothing is dropped locally — the server decides what to keep.
 */
export function useGpsTracking(sessionId: string | null) {
  const [stats, setStats] = useState<TrackingStats>(EMPTY_STATS);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const queueRef = useRef<GpsFix[]>([]);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const watchRef = useRef<number | null>(null);
  const uploadingRef = useRef(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const flush = useCallback(async () => {
    if (!sessionId || uploadingRef.current || queueRef.current.length === 0) return;
    if (!navigator.onLine) return;

    uploadingRef.current = true;
    // Take a slice, not the whole queue: anything that arrives mid-upload stays queued.
    const batch = queueRef.current.slice(0, 200);

    try {
      const service = createWorkerService(getSupabaseClient());
      const result = await service.sendLocations(sessionId, batch);

      queueRef.current = queueRef.current.slice(batch.length);
      saveQueue(queueRef.current);
      setStats((current) => ({
        ...current,
        accepted: current.accepted + result.accepted,
        rejected: current.rejected + result.rejected,
        queued: queueRef.current.length,
        lastUploadAt: new Date().toISOString(),
      }));
    } catch {
      // Keep the batch. A failed upload is a connection problem, not a data problem.
      setStats((current) => ({ ...current, queued: queueRef.current.length }));
    } finally {
      uploadingRef.current = false;
    }
  }, [sessionId]);

  // Watch the device while a session is running.
  useEffect(() => {
    if (!sessionId) {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
      return;
    }

    queueRef.current = loadQueue();
    setStats((current) => ({ ...current, queued: queueRef.current.length }));

    if (!("geolocation" in navigator)) {
      setGpsError("This device cannot report its location.");
      return;
    }

    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setGpsError(null);
        const fix = fixFromPosition(position);
        lastPositionRef.current = { lat: fix.lat, lng: fix.lng };

        queueRef.current = [...queueRef.current, fix];
        saveQueue(queueRef.current);
        setStats((current) => ({
          ...current,
          captured: current.captured + 1,
          queued: queueRef.current.length,
          lastFixAt: fix.recordedAt,
          accuracy: fix.accuracy,
          speedKmh: fix.speed === null ? null : Math.round(fix.speed * 3.6),
        }));
      },
      (error) => {
        setGpsError(
          error.code === error.PERMISSION_DENIED
            ? "Location permission is switched off. Allow location for this site, then start again."
            : "Waiting for a GPS signal. Move somewhere with a clear view of the sky.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
  }, [sessionId]);

  // Upload on a timer rather than per fix: one request per batch, not one per reading.
  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(() => void flush(), UPLOAD_EVERY_MS);
    void flush();
    return () => clearInterval(interval);
  }, [sessionId, flush]);

  useEffect(() => {
    if (online) void flush();
  }, [online, flush]);

  const reset = useCallback(() => {
    queueRef.current = [];
    saveQueue([]);
    setStats(EMPTY_STATS);
  }, []);

  return {
    stats,
    gpsError,
    online,
    lastPosition: lastPositionRef.current,
    flushNow: flush,
    reset,
  };
}
