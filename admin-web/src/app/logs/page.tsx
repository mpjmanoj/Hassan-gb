"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useStore } from "@/hooks/use-store";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatClock, formatDay } from "@/lib/time";

function LogsView() {
  const state = useStore();
  const params = useSearchParams();
  const [vehicleId, setVehicleId] = useState(params.get("vehicle") ?? "");

  const logs = state.logs.filter((log) => !vehicleId || log.vehicleId === vehicleId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vehicle logs"
        description="Every operational change is recorded with who made it and when."
      />

      <div className="flex items-center gap-3">
        <label htmlFor="vehicle" className="label">
          Vehicle
        </label>
        <select
          id="vehicle"
          value={vehicleId}
          onChange={(event) => setVehicleId(event.target.value)}
          className="field w-auto"
        >
          <option value="">All vehicles</option>
          {state.vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.vehicleNumber}
            </option>
          ))}
        </select>
      </div>

      {logs.length === 0 ? (
        <EmptyState title="No log entries" description="Actions on this vehicle will be recorded here." />
      ) : (
        <ol className="card divide-y divide-line">
          {logs.map((log) => (
            <li key={log.id} className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3.5">
              <div>
                <p className="text-[14px]">{log.description}</p>
                <p className="mt-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                  {log.eventType.replace(/_/g, " ").toLowerCase()} · {log.actor}
                </p>
              </div>
              <p className="shrink-0 text-[12px] tabular-nums text-ink-muted">
                {formatDay(log.createdAt)} · {formatClock(log.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function LogsPage() {
  return (
    <Suspense fallback={<div className="h-[320px] animate-pulse rounded-card bg-line/40" />}>
      <LogsView />
    </Suspense>
  );
}
