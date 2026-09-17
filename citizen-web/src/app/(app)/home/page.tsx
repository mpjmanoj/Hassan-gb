"use client";

import Link from "next/link";
import { useSession } from "@/features/auth/session-provider";
import { useWardTracking } from "@/features/tracking/use-ward-tracking";
import { TrackingSection } from "@/features/tracking/tracking-section";
import { StatsSection } from "@/features/stats/stats-section";
import { LogoMark } from "@/components/logo";
import { greeting } from "@/lib/time";

const HEADLINE: Record<string, string> = {
  LIVE: "Your collection vehicle is on the route now.",
  CONNECTION_LOST: "Your vehicle's connection has dropped.",
  NOT_STARTED: "Collection has not started in your ward yet.",
  COMPLETED: "Today's collection is finished in your ward.",
  ABSENT: "Today's collection vehicle is unavailable.",
  NO_ROUTE: "No collection route is assigned to your ward today.",
};

export default function HomePage() {
  const { citizen } = useSession();
  const result = useWardTracking(citizen?.wardId ?? null);
  const { tracking, status } = result;

  const firstName = citizen?.name?.trim().split(" ")[0] ?? "";

  return (
    <main>
      <header className="px-4 pb-5 pt-6">
        <div className="flex items-center justify-between">
          <LogoMark size={26} />
          <Link
            href="/profile"
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold"
          >
            {tracking ? `Ward ${tracking.ward.wardNumber}` : "Set ward"}
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="m6 3.5 4.5 4.5L6 12.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        <h1 className="mt-5 text-[26px] font-bold leading-tight tracking-tight">
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
          {tracking ? `${tracking.area.name} · Ward ${tracking.ward.wardNumber}` : "Loading your area…"}
        </p>
        <p className="mt-3 text-[15px] font-semibold leading-snug">
          {HEADLINE[status] ?? ""}
        </p>
      </header>

      <TrackingSection result={result} />
      <StatsSection />
    </main>
  );
}
