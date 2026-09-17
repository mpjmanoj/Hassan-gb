"use client";

import { useStore } from "@/hooks/use-store";
import { store } from "@swachhata/core";
import { EmptyState, PageHeader } from "@/components/ui";
import { formatClock, formatDuration } from "@swachhata/core";

const TONE: Record<string, string> = {
  ACTIVE: "bg-brand-light text-brand-dark",
  COMPLETED: "bg-surface-muted text-ink-muted",
  CANCELLED: "bg-danger-light text-danger",
  SCHEDULED: "bg-surface-muted text-ink-muted",
  OFFLINE: "bg-warn-light text-warn",
};

export default function SessionsPage() {
  const state = useStore();
  const sessions = [...state.sessions].sort((a, b) =>
    (b.startedAt ?? "").localeCompare(a.startedAt ?? ""),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work sessions"
        description="Each session is one worker running one route on one vehicle, from Start Work to End Work."
      />

      {sessions.length === 0 ? (
        <EmptyState
          title="No work sessions yet"
          description="Sessions appear here once workers begin starting their routes."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[14px]">
            <thead className="border-b border-line text-[11px] uppercase tracking-[0.07em] text-ink-muted">
              <tr>
                {["Vehicle", "Worker", "Route", "Started", "Ended", "Duration", "Status", ""].map((head) => (
                  <th key={head} scope="col" className="px-5 py-3 font-semibold">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sessions.map((session) => {
                const vehicle = state.vehicles.find((v) => v.id === session.vehicleId);
                const worker = state.workers.find((w) => w.id === session.workerId);
                const route = state.routes.find((r) => r.id === session.routeId);
                const duration = session.startedAt
                  ? formatDuration(
                      session.startedAt,
                      session.endedAt ? Date.parse(session.endedAt) : Date.now(),
                    )
                  : "—";

                return (
                  <tr key={session.id} className="hover:bg-surface-muted/60">
                    <td className="px-5 py-3.5 font-semibold">{vehicle?.vehicleNumber ?? "—"}</td>
                    <td className="px-5 py-3.5">{worker?.name ?? "—"}</td>
                    <td className="px-5 py-3.5">{route?.routeName ?? "—"}</td>
                    <td className="px-5 py-3.5 tabular-nums">
                      {session.startedAt ? formatClock(session.startedAt) : "—"}
                    </td>
                    <td className="px-5 py-3.5 tabular-nums">
                      {session.endedAt ? formatClock(session.endedAt) : "—"}
                    </td>
                    <td className="px-5 py-3.5 tabular-nums text-ink-muted">{duration}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${
                          TONE[session.status] ?? "bg-surface-muted text-ink-muted"
                        }`}
                      >
                        {session.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {session.status === "ACTIVE" ? (
                        <button
                          type="button"
                          onClick={() => store.endSession(session.id)}
                          className="text-[13px] font-semibold text-danger hover:underline"
                        >
                          End session
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
