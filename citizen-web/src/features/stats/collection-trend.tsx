"use client";

import { formatDay } from "@/lib/time";

interface CollectionTrendProps {
  data: { date: string; collectedKg: number }[];
}

/** Seven days of collection, read left to right. Values are labelled, not just coloured. */
function shortDay(date: string): string {
  const label = formatDay(date);
  if (label === "Yesterday") return "Yest.";
  return label;
}

export function CollectionTrend({ data }: CollectionTrendProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.collectedKg), 1);

  // Bars are sized in pixels: a percentage height would collapse inside an auto-height row.
  const TRACK_PX = 96;

  return (
    <div>
      <p className="label">Last 7 days · kg collected</p>
      <ul className="mt-4 flex items-end gap-1.5">
        {data.map((entry, index) => {
          const height = Math.max(6, Math.round((entry.collectedKg / max) * TRACK_PX));
          const latest = index === data.length - 1;
          return (
            <li key={entry.date} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-[10px] font-semibold tabular-nums text-ink-muted">
                {entry.collectedKg.toLocaleString("en-IN")}
              </span>
              <div
                className={`w-full rounded-t-md ${latest ? "bg-brand" : "bg-brand/25"}`}
                style={{
                  height: `${height}px`,
                  transition: "height 700ms cubic-bezier(0.22,1,0.36,1)",
                }}
              />
              <span className="text-[10px] text-ink-muted">{shortDay(entry.date)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
