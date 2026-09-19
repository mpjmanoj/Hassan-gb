"use client";

import Link from "next/link";
import { useStore } from "@/hooks/use-store";
import { dashboardCounts, fleetRows } from "@swachhata/core";
import { StatTile } from "@/components/stat-tile";
import { StatusPill } from "@/components/status-pill";
import { PageHeader } from "@/components/ui";
import { FleetMap } from "@/features/map/fleet-map";
import { formatClock, relativeTime } from "@swachhata/core";

export default function DashboardPage() {
  const state = useStore();
  const rows = fleetRows(state);
  const counts = dashboardCounts(rows, state);
  const activity = state.logs.slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Today's operations"
        description="Live status of every collection vehicle, worker and route across Hassan."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatTile label="Vehicles" value={counts.totalVehicles} />
        <StatTile label="Live now" value={counts.liveVehicles} tone="live" />
        <StatTile label="Connection lost" value={counts.offlineVehicles} tone="warn" />
        <StatTile label="Absent" value={counts.absentVehicles} tone="danger" />
        <StatTile label="Workers on duty" value={counts.activeWorkers} />
        <StatTile label="Wards served" value={counts.wardsServed} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="text-[15px] font-semibold">Live map</h2>
            <Link href="/live-map" className="text-[13px] font-semibold text-brand hover:text-brand-dark">
              Open full map
            </Link>
          </div>
          <div className="h-[420px]">
            <FleetMap rows={rows} />
          </div>
        </section>

        <section className="card overflow-hidden">
          <h2 className="border-b border-line px-5 py-3.5 text-[15px] font-semibold">
            Vehicle activity
          </h2>
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.vehicle.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold">{row.vehicle.vehicleNumber}</p>
                  <p className="truncate text-[12px] text-ink-muted">
                    {row.wards.length > 0
                      ? `Ward ${row.wards.map((w) => w.wardNumber).join(", ")}`
                      : "No ward assigned"}
                    {row.worker ? ` · ${row.worker.name}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <StatusPill status={row.status} />
                  <p className="mt-1 text-[11px] text-ink-muted">
                    {row.location ? relativeTime(row.location.recordedAt) : "No GPS"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">Recent activity</h2>
          <Link href="/logs" className="text-[13px] font-semibold text-brand hover:text-brand-dark">
            View all logs
          </Link>
        </div>
        <ul className="divide-y divide-line">
          {activity.map((entry) => (
            <li key={entry.id} className="flex items-baseline justify-between gap-4 px-5 py-3">
              <p className="text-[14px]">{entry.description}</p>
              <p className="shrink-0 text-[12px] tabular-nums text-ink-muted">
                {formatClock(entry.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
