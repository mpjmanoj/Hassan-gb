"use client";

import { useStore } from "@/hooks/use-store";
import { dashboardCounts, fleetRows } from "@swachhata/core";
import { PageHeader } from "@/components/ui";
import { StatTile } from "@/components/stat-tile";
import { formatDuration, todayIso } from "@swachhata/core";

export default function ReportsPage() {
  const state = useStore();
  const rows = fleetRows(state);
  const counts = dashboardCounts(rows, state);
  const today = todayIso();

  const todaySessions = state.sessions.filter((session) =>
    (session.startedAt ?? "").startsWith(today),
  );
  const completed = todaySessions.filter((session) => session.status === "COMPLETED");
  const utilisation =
    counts.totalVehicles === 0
      ? 0
      : Math.round(
          (rows.filter((row) => row.status !== "UNASSIGNED" && row.status !== "INACTIVE").length /
            counts.totalVehicles) *
            100,
        );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Operational summary for today. Waste quantity reporting arrives with the municipal data import."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Vehicle utilisation %" value={utilisation} />
        <StatTile label="Sessions today" value={todaySessions.length} />
        <StatTile label="Completed sessions" value={completed.length} />
        <StatTile label="Absent vehicles" value={counts.absentVehicles} tone="danger" />
      </div>

      <section className="card overflow-x-auto">
        <h2 className="border-b border-line px-5 py-3.5 text-[15px] font-semibold">
          Tracking duration by vehicle
        </h2>
        <table className="w-full min-w-[640px] text-left text-[14px]">
          <thead className="border-b border-line text-[11px] uppercase tracking-[0.07em] text-ink-muted">
            <tr>
              {["Vehicle", "Worker", "Wards", "Tracking duration"].map((head) => (
                <th key={head} scope="col" className="px-5 py-3 font-semibold">
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <tr key={row.vehicle.id}>
                <td className="px-5 py-3.5 font-semibold">{row.vehicle.vehicleNumber}</td>
                <td className="px-5 py-3.5">{row.worker?.name ?? "—"}</td>
                <td className="px-5 py-3.5">
                  {row.wards.length > 0 ? row.wards.map((w) => `Ward ${w.wardNumber}`).join(", ") : "—"}
                </td>
                <td className="px-5 py-3.5 tabular-nums text-ink-muted">
                  {row.session?.startedAt
                    ? formatDuration(
                        row.session.startedAt,
                        row.session.endedAt ? Date.parse(row.session.endedAt) : Date.now(),
                      )
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold">Waste quantity reporting</h2>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          Collected and processed quantities are not computed from tracking data. They come from
          the municipality&apos;s daily collection import, which is not connected yet — so nothing
          is shown here rather than an estimate.
        </p>
      </section>
    </div>
  );
}
