"use client";

import { useState } from "react";
import { useStore } from "@/hooks/use-store";
import { fleetRows } from "@swachhata/core";
import { StatusPill } from "@/components/status-pill";
import { EmptyState, PageHeader } from "@/components/ui";
import { FleetMap } from "@/features/map/fleet-map";
import { formatClock, relativeTime } from "@swachhata/core";

export default function LiveMapPage() {
  const state = useStore();
  const rows = fleetRows(state);
  const tracked = rows.filter((row) => row.location && (row.status === "LIVE" || row.status === "CONNECTION_LOST"));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = tracked.find((row) => row.vehicle.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Live map"
        description="Every vehicle currently reporting a position. Select a vehicle for its session detail."
      />

      {tracked.length === 0 ? (
        <EmptyState
          title="No vehicles are currently tracking"
          description="Vehicles appear here once a worker starts a route and the device begins reporting its position."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <div className="card h-[620px] overflow-hidden">
            <FleetMap rows={rows} onSelect={setSelectedId} selectedVehicleId={selectedId} />
          </div>

          <div className="space-y-4">
            {selected ? (
              <section className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[18px] font-bold tracking-tight">
                      {selected.vehicle.vehicleNumber}
                    </h2>
                    <p className="mt-0.5 text-[13px] text-ink-muted">
                      {selected.vehicle.displayName}
                    </p>
                  </div>
                  <StatusPill status={selected.status} />
                </div>

                <dl className="mt-5 space-y-3 border-t border-line pt-4 text-[13px]">
                  {[
                    ["Worker", selected.worker?.name ?? "—"],
                    ["Route", selected.route?.routeName ?? "—"],
                    [
                      "Wards",
                      selected.wards.length > 0
                        ? selected.wards.map((w) => `Ward ${w.wardNumber}`).join(", ")
                        : "—",
                    ],
                    [
                      "Speed",
                      selected.location?.speed != null
                        ? `${(selected.location.speed * 3.6).toFixed(0)} km/h`
                        : "—",
                    ],
                    [
                      "GPS accuracy",
                      selected.location?.accuracy != null ? `±${selected.location.accuracy} m` : "—",
                    ],
                    [
                      "Started",
                      selected.session?.startedAt ? formatClock(selected.session.startedAt) : "—",
                    ],
                    [
                      "Last update",
                      selected.location ? relativeTime(selected.location.recordedAt) : "—",
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4">
                      <dt className="text-ink-muted">{label}</dt>
                      <dd className="text-right font-semibold">{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : (
              <section className="card p-5">
                <h2 className="text-[15px] font-semibold">Select a vehicle</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
                  Choose a vehicle from the list or the map to see its worker, route, speed and
                  GPS detail.
                </p>
              </section>
            )}

            <section className="card overflow-hidden">
              <h2 className="border-b border-line px-5 py-3 text-[14px] font-semibold">
                Tracking now ({tracked.length})
              </h2>
              <ul className="divide-y divide-line">
                {tracked.map((row) => (
                  <li key={row.vehicle.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.vehicle.id)}
                      aria-current={selectedId === row.vehicle.id ? "true" : undefined}
                      className={`flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors
                        ${selectedId === row.vehicle.id ? "bg-brand-light/60" : "hover:bg-surface-muted"}`}
                    >
                      <span className="min-w-0">
                        <span className="block text-[14px] font-semibold">
                          {row.vehicle.vehicleNumber}
                        </span>
                        <span className="block truncate text-[12px] text-ink-muted">
                          {row.worker?.name ?? "Unassigned"} · {row.route?.routeName ?? "No route"}
                        </span>
                      </span>
                      <StatusPill status={row.status} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
