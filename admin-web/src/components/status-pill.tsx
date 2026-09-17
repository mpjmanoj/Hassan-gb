import type { FleetStatus } from "@swachhata/core";
import { FLEET_STATUS_LABEL } from "@swachhata/core";

const TONE: Record<FleetStatus, { dot: string; text: string; bg: string; pulse: boolean }> = {
  LIVE: { dot: "bg-brand", text: "text-brand-dark", bg: "bg-brand-light", pulse: true },
  CONNECTION_LOST: { dot: "bg-warn", text: "text-warn", bg: "bg-warn-light", pulse: false },
  NOT_STARTED: { dot: "bg-ink-muted", text: "text-ink-muted", bg: "bg-surface-muted", pulse: false },
  COMPLETED: { dot: "bg-ink-muted", text: "text-ink-muted", bg: "bg-surface-muted", pulse: false },
  ABSENT: { dot: "bg-danger", text: "text-danger", bg: "bg-danger-light", pulse: false },
  UNASSIGNED: { dot: "bg-ink-muted", text: "text-ink-muted", bg: "bg-surface-muted", pulse: false },
  INACTIVE: { dot: "bg-ink-muted", text: "text-ink-muted", bg: "bg-surface-muted", pulse: false },
};

/** Status is always spelled out; the dot only reinforces it. */
export function StatusPill({ status }: { status: FleetStatus }) {
  const tone = TONE[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${tone.bg} ${tone.text}`}
    >
      <span className="relative flex h-[6px] w-[6px]">
        {tone.pulse ? (
          <span className={`absolute inline-flex h-full w-full rounded-full ${tone.dot} animate-live-pulse`} aria-hidden />
        ) : null}
        <span className={`relative inline-flex h-[6px] w-[6px] rounded-full ${tone.dot}`} />
      </span>
      {FLEET_STATUS_LABEL[status]}
    </span>
  );
}
