"use client";

import { useEffect, useState } from "react";
import type { CollectionRecord } from "@swachhata/core";
import { getDataService } from "@swachhata/core";
import { useSession } from "@/features/auth/session-provider";
import { formatClock, formatDay } from "@swachhata/core";

export default function HistoryPage() {
  const { citizen } = useSession();
  const [records, setRecords] = useState<CollectionRecord[] | null>(null);

  useEffect(() => {
    if (!citizen) return;
    let cancelled = false;
    void getDataService()
      .getCollectionHistory(citizen.id)
      .then((result) => {
        if (!cancelled) setRecords(result);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      });
    return () => {
      cancelled = true;
    };
  }, [citizen]);

  return (
    <main className="px-4 pt-6">
      <h1 className="text-[26px] font-bold leading-tight tracking-tight">Your collection</h1>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
        A record of collection at your household.
      </p>

      {records === null ? (
        <div className="mt-6 h-[160px] animate-pulse rounded-card bg-line/40" />
      ) : records.length === 0 ? (
        <div className="card mt-6 p-6">
          <h2 className="text-[16px] font-semibold">No collection records yet</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            Household-level collection records will appear here once the municipality begins
            recording quantities for your address. We do not estimate figures.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {records.map((record) => (
            <li key={record.date} className="card flex items-center justify-between p-4">
              <div>
                <p className="text-[15px] font-semibold">{formatDay(record.date)}</p>
                <p className="mt-1 text-[13px] text-ink-muted">
                  Vehicle passed at {formatClock(record.collectedAt)}
                </p>
              </div>
              <p className="text-[19px] font-bold tabular-nums tracking-tight">
                {record.quantityKg.toFixed(1)}
                <span className="ml-1 text-[13px] font-semibold text-ink-muted">kg</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
