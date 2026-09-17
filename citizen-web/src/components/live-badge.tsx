import type { TrackingStateKind } from "@swachhata/core";

const PRESET: Record<
  TrackingStateKind,
  { label: string; dot: string; text: string; bg: string; pulse: boolean }
> = {
  LIVE: { label: "Live", dot: "bg-brand", text: "text-brand-dark", bg: "bg-brand-light", pulse: true },
  CONNECTION_LOST: { label: "Connection lost", dot: "bg-warn", text: "text-warn", bg: "bg-warn-light", pulse: false },
  NOT_STARTED: { label: "Not started", dot: "bg-ink-muted", text: "text-ink-muted", bg: "bg-surface-muted", pulse: false },
  COMPLETED: { label: "Completed", dot: "bg-ink-muted", text: "text-ink-muted", bg: "bg-surface-muted", pulse: false },
  ABSENT: { label: "Unavailable", dot: "bg-danger", text: "text-danger", bg: "bg-danger-light", pulse: false },
  NO_ROUTE: { label: "No route", dot: "bg-ink-muted", text: "text-ink-muted", bg: "bg-surface-muted", pulse: false },
};

/**
 * Status is carried by the word, not the colour — the dot is decoration for people who
 * can see it, and the label is there for everyone else.
 */
export function LiveBadge({ kind, className = "" }: { kind: TrackingStateKind; className?: string }) {
  const preset = PRESET[kind];

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.07em] ${preset.bg} ${preset.text} ${className}`}
    >
      <span className="relative flex h-[7px] w-[7px]">
        {preset.pulse ? (
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${preset.dot} animate-live-pulse`}
            aria-hidden
          />
        ) : null}
        <span className={`relative inline-flex h-[7px] w-[7px] rounded-full ${preset.dot}`} />
      </span>
      {preset.label}
    </span>
  );
}
