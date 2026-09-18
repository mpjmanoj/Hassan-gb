"use client";

import { useEffect, useState } from "react";
import type { SwachhataStats } from "@swachhata/core";
import { AnimatedNumber } from "@/components/animated-number";
import { getDataService } from "@/lib/data";
import { ProgressRing } from "@/features/stats/progress-ring";
import { CollectionTrend } from "@/features/stats/collection-trend";

export function StatsSection() {
  const [stats, setStats] = useState<SwachhataStats | null>(null);
  const [trend, setTrend] = useState<{ date: string; collectedKg: number }[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const service = getDataService();

    void Promise.all([service.getStats(), service.getCollectionTrend()])
      .then(([statsResult, trendResult]) => {
        if (cancelled) return;
        setStats(statsResult);
        setTrend(trendResult);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;

  if (!stats) {
    return <div className="mx-4 mt-6 h-[220px] animate-pulse rounded-card bg-line/40" />;
  }

  const hasCollectionData = stats.collectedKg !== null && stats.disposedKg !== null;
  const processed =
    hasCollectionData && stats.collectedKg
      ? (stats.disposedKg! / stats.collectedKg) * 100
      : 0;

  return (
    <section className="mx-4 mt-6 space-y-3" aria-labelledby="swachhata-today">
      <h2 id="swachhata-today" className="px-1 text-[19px] font-bold tracking-tight">
        Swachhata today
      </h2>

      {hasCollectionData ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4">
              <p className="label">Collected</p>
              <p className="mt-2 text-[26px] font-bold leading-none tracking-tight">
                <AnimatedNumber value={stats.collectedKg ?? 0} />
                <span className="ml-1 text-[14px] font-semibold text-ink-muted">kg</span>
              </p>
            </div>
            <div className="card p-4">
              <p className="label">Processed</p>
              <p className="mt-2 text-[26px] font-bold leading-none tracking-tight">
                <AnimatedNumber value={stats.disposedKg ?? 0} />
                <span className="ml-1 text-[14px] font-semibold text-ink-muted">kg</span>
              </p>
            </div>
          </div>

          <div className="card p-4">
            <ProgressRing value={processed} label="Collection progress" />
          </div>

          <div className="card p-4">
            <CollectionTrend data={trend} />
          </div>
        </>
      ) : (
        <div className="card p-5">
          <p className="text-[15px] font-semibold">Collection figures are not published yet</p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
            Daily collected and processed quantities appear here once the municipality publishes
            today&apos;s figures.
          </p>
        </div>
      )}

      <div className="card divide-y divide-line">
        <p className="px-4 pb-1 pt-4 label">Across the network</p>
        <dl className="grid grid-cols-3 divide-x divide-line">
          {[
            { label: "Vehicles", value: stats.totalVehicles },
            { label: "Active now", value: stats.activeVehicles },
            { label: "Residents", value: stats.activeUsers },
          ].map((item) => (
            <div key={item.label} className="px-4 py-4">
              <dd className="text-[22px] font-bold leading-none tracking-tight">
                <AnimatedNumber value={item.value} />
              </dd>
              <dt className="mt-1.5 text-[12px] font-medium text-ink-muted">{item.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
