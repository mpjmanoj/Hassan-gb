"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createWorkerService,
  messageFor,
  type WorkerAssignment,
} from "@swachhata/core";
import { DATA_SOURCE } from "@/lib/config";
import { getSupabaseClient } from "@/lib/supabase";
import { useGpsTracking } from "@/features/worker/use-gps-tracking";
import { formatClock, formatDuration } from "@swachhata/core";
import { LogoMark } from "@/components/logo";

/**
 * The interim worker tracker.
 *
 * This is a web page standing in for the Flutter app, so a real phone in a real vehicle can
 * drive a real route before the mobile app exists. It talks to the same RPCs the Flutter app
 * will, which is the point: what works here is proven for the app.
 *
 * What a browser cannot do, and the Flutter app must: keep reporting with the screen locked.
 * Leave this page open and the screen on for a test drive.
 */
export default function WorkerPage() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workers, setWorkers] = useState<{ id: string; name: string }[]>([]);
  const [assignment, setAssignment] = useState<WorkerAssignment | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  const tracking = useGpsTracking(sessionId);
  const supabaseMode = DATA_SOURCE === "supabase";

  const refresh = useCallback(async () => {
    const service = createWorkerService(getSupabaseClient());
    const current = await service.getAssignment();
    setAssignment(current);

    if (current?.session?.status === "ACTIVE") {
      setSessionId(current.session.id);
      setStartedAt(current.session.startedAt);
    }
    if (!current) setWorkers(await service.listPairableWorkers());
  }, []);

  useEffect(() => {
    if (!supabaseMode) {
      setReady(true);
      return;
    }
    let cancelled = false;

    void (async () => {
      try {
        const service = createWorkerService(getSupabaseClient());
        await service.ensureSession();
        if (!cancelled) await refresh();
      } catch (caught) {
        if (!cancelled) setError(messageFor(caught, "Could not reach the server."));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabaseMode, refresh]);

  // Keeps the shift clock moving.
  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(() => setTick((t) => (t + 1) % 3600), 1000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(messageFor(caught, fallback));
    } finally {
      setBusy(false);
    }
  };

  const pair = (workerId: string) =>
    run(async () => {
      const service = createWorkerService(getSupabaseClient());
      await service.pairWithWorker(workerId);
      await refresh();
    }, "Could not pair this device.");

  const startWork = () =>
    run(async () => {
      if (!assignment) return;
      const service = createWorkerService(getSupabaseClient());
      const session = await service.startWork(assignment.assignmentId);
      tracking.reset();
      setSessionId(session.id);
      setStartedAt(session.startedAt);
    }, "Could not start work.");

  const endWork = () =>
    run(async () => {
      if (!sessionId) return;
      const service = createWorkerService(getSupabaseClient());
      await tracking.flushNow();
      await service.endWork(sessionId, tracking.lastPosition);
      setSessionId(null);
      setStartedAt(null);
      tracking.reset();
      await refresh();
    }, "Could not end work.");

  if (!supabaseMode) {
    return (
      <Shell>
        <Notice
          title="Connect the database first"
          body="GPS testing writes to the server, so it needs NEXT_PUBLIC_DATA_SOURCE=supabase and the project keys in .env.local."
        />
      </Shell>
    );
  }

  if (!ready) {
    return (
      <Shell>
        <p className="text-[14px] text-ink-muted">Starting…</p>
      </Shell>
    );
  }

  // ------------------------------------------------------------------ pairing
  if (!assignment) {
    return (
      <Shell>
        <h1 className="text-[24px] font-bold tracking-tight">Pair this device</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
          Choose who is driving. This is what the OTP sign-in will do once SMS is connected.
        </p>

        {error ? <ErrorNote message={error} /> : null}

        {workers.length === 0 ? (
          <Notice
            className="mt-6"
            title="No workers to pair with"
            body="Either device pairing is switched off, or no active workers exist yet. Add a worker in the dashboard, and switch on allow_worker_self_link in app_settings."
          />
        ) : (
          <ul className="mt-6 space-y-3">
            {workers.map((worker) => (
              <li key={worker.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void pair(worker.id)}
                  className="btn-secondary w-full justify-between"
                >
                  <span>{worker.name}</span>
                  <span className="text-[13px] text-ink-muted">Pair</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Shell>
    );
  }

  // ------------------------------------------------------------------ off duty
  if (!sessionId) {
    return (
      <Shell>
        <p className="label">Swachhata Hasan · Worker</p>
        <h1 className="mt-3 text-[26px] font-bold tracking-tight">
          Good day, {assignment.worker.name}
        </h1>

        <div className="card mt-6 p-5">
          <p className="label">Assigned vehicle</p>
          <p className="mt-1.5 text-[32px] font-bold leading-none tracking-tight">
            {assignment.vehicle.vehicleNumber}
          </p>

          <div className="mt-5 border-t border-line pt-4">
            <p className="label">Route</p>
            <p className="mt-1.5 text-[15px] font-semibold">
              {assignment.route.routeName} · Ward {assignment.ward.wardNumber}
            </p>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
            <span className="label">Status</span>
            <span className="text-[13px] font-semibold text-ink-muted">
              {assignment.isAbsent ? "Marked unavailable today" : "Off duty"}
            </span>
          </div>
        </div>

        {error ? <ErrorNote message={error} /> : null}

        <button
          type="button"
          disabled={busy || assignment.isAbsent}
          onClick={() => void startWork()}
          className="btn-primary mt-6 h-[84px] w-full text-[20px]"
        >
          {busy ? "Starting…" : "START WORK"}
        </button>

        <p className="mt-4 text-[12px] leading-relaxed text-ink-muted">
          Your phone will ask for location permission. Choose <b>Allow while using the app</b>,
          keep this page open and the screen on. A browser stops reporting when the screen
          locks — the Flutter app is what fixes that.
        </p>
      </Shell>
    );
  }

  // ------------------------------------------------------------------ tracking
  const { stats, gpsError, online } = tracking;
  const hasFix = stats.lastFixAt !== null;

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <p className="label">Tracking active</p>
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-light px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-brand-dark">
          <span className="relative flex h-[7px] w-[7px]">
            <span className="absolute inline-flex h-full w-full animate-live-pulse rounded-full bg-brand" />
            <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-brand" />
          </span>
          Live
        </span>
      </div>

      <p className="mt-3 text-[34px] font-bold leading-none tracking-tight">
        {assignment.vehicle.vehicleNumber}
      </p>
      <p className="mt-2 text-[14px] text-ink-muted">
        {assignment.route.routeName} · Ward {assignment.ward.wardNumber}
      </p>

      <div className="card mt-6 divide-y divide-line">
        <Row label="GPS" value={hasFix ? "Connected" : "Searching…"} tone={hasFix ? "good" : "warn"} />
        <Row label="Internet" value={online ? "Connected" : "Offline"} tone={online ? "good" : "warn"} />
        <Row
          label="Accuracy"
          value={stats.accuracy === null ? "—" : `±${Math.round(stats.accuracy)} m`}
        />
        <Row label="Speed" value={stats.speedKmh === null ? "—" : `${stats.speedKmh} km/h`} />
        <Row label="Started" value={startedAt ? formatClock(startedAt) : "—"} />
        <Row label="Duration" value={startedAt ? formatDuration(startedAt) : "—"} />
      </div>

      <div className="card mt-4 divide-y divide-line">
        <Row label="Readings taken" value={String(stats.captured)} />
        <Row label="Stored by server" value={String(stats.accepted)} tone="good" />
        <Row label="Refused by server" value={String(stats.rejected)} />
        <Row
          label="Waiting to upload"
          value={String(stats.queued)}
          tone={stats.queued > 20 ? "warn" : undefined}
        />
        <Row
          label="Last upload"
          value={stats.lastUploadAt ? formatClock(stats.lastUploadAt) : "—"}
        />
      </div>

      {gpsError ? <ErrorNote message={gpsError} /> : null}
      {error ? <ErrorNote message={error} /> : null}

      {!online ? (
        <p className="mt-4 rounded-xl bg-warn-light px-3 py-2.5 text-[13px] leading-relaxed text-warn">
          No connection. Readings are being saved on this phone and will upload by themselves
          when the signal returns.
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => void endWork()}
        className="btn mt-6 h-[84px] w-full border-2 border-danger bg-surface text-[20px] text-danger"
      >
        {busy ? "Ending…" : "END WORK"}
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-[520px] bg-surface-muted px-5 pb-12 pt-7">
      <div className="mb-6 flex items-center gap-2.5">
        <LogoMark size={26} />
        <span className="text-[13px] font-bold">Swachhata Hasan</span>
      </div>
      {children}
    </main>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn";
}) {
  const color = tone === "good" ? "text-brand" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className={`text-[15px] font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="mt-4 rounded-xl bg-danger-light px-3 py-2.5 text-[13px] font-medium text-danger">
      {message}
    </p>
  );
}

function Notice({ title, body, className = "" }: { title: string; body: string; className?: string }) {
  return (
    <div className={`card p-5 ${className}`}>
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{body}</p>
    </div>
  );
}
