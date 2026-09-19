"use client";

import { useEffect, useState } from "react";
import { AUTH_MODE, DATA_SOURCE, MAPS } from "@/lib/config";

/**
 * A page whose only job is to answer "why isn't it working".
 *
 * Every check runs in the browser and reports what it found, so a screenshot of this page
 * is enough to diagnose a deployment without access to its logs. It prints whether values
 * are present, never the values themselves.
 */

type Check = { label: string; value: string; ok: boolean | null; hint?: string };

export default function StatusPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

    const results: Check[] = [
      {
        label: "Data source",
        value: DATA_SOURCE,
        ok: DATA_SOURCE === "supabase",
        hint: DATA_SOURCE === "supabase" ? undefined : "Set NEXT_PUBLIC_DATA_SOURCE=supabase",
      },
      { label: "Sign-in mode", value: AUTH_MODE, ok: true },
      {
        label: "Supabase URL",
        value: url ? url.replace(/^https:\/\//, "") : "missing",
        ok: Boolean(url),
        hint: url ? undefined : "NEXT_PUBLIC_SUPABASE_URL is not set on this deployment",
      },
      {
        label: "Supabase key",
        value: key ? `present (${key.slice(0, 12)}…)` : "missing",
        ok: Boolean(key),
        hint: key ? undefined : "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set on this deployment",
      },
      {
        label: "Google Maps key",
        value: MAPS.apiKey ? "present" : "not set — using OpenStreetMap",
        ok: true,
      },
    ];

    setChecks(results);

    // Only worth testing the connection if there is something to connect with.
    if (!url || !key) {
      setRunning(false);
      return;
    }

    void (async () => {
      const extra: Check[] = [];

      try {
        const response = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } });
        extra.push({
          label: "Reaches Supabase",
          value: response.ok ? "yes" : `no (HTTP ${response.status})`,
          ok: response.ok,
        });
      } catch {
        extra.push({
          label: "Reaches Supabase",
          value: "no — network or CORS",
          ok: false,
          hint: "The phone could not reach the project URL at all",
        });
      }

      try {
        const { getSupabaseClient } = await import("@/lib/supabase");
        const client = getSupabaseClient();
        const { data, error } = await client.auth.signInAnonymously();

        if (error) {
          extra.push({
            label: "Anonymous sign-in",
            value: error.message,
            ok: false,
            hint: "Supabase → Authentication → Providers → Anonymous sign-ins → ON",
          });
        } else {
          extra.push({
            label: "Anonymous sign-in",
            value: data.user ? "works" : "no user returned",
            ok: Boolean(data.user),
          });
        }
      } catch (caught) {
        extra.push({
          label: "Anonymous sign-in",
          value: caught instanceof Error ? caught.message : "failed",
          ok: false,
        });
      }

      setChecks((current) => [...current, ...extra]);
      setRunning(false);
    })();
  }, []);

  return (
    <main className="mx-auto max-w-[520px] px-5 py-10">
      <h1 className="text-[24px] font-bold tracking-tight">Status</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
        What this deployment is configured with, and whether it can reach the database.
      </p>

      <div className="card mt-6 divide-y divide-line">
        {checks.map((check) => (
          <div key={check.label} className="px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[13px] text-ink-muted">{check.label}</span>
              <span
                className={`text-right text-[13px] font-semibold ${
                  check.ok === false ? "text-danger" : check.ok ? "text-brand" : ""
                }`}
              >
                {check.ok === false ? "✕ " : check.ok ? "✓ " : ""}
                {check.value}
              </span>
            </div>
            {check.hint ? (
              <p className="mt-1.5 text-[12px] leading-relaxed text-warn">{check.hint}</p>
            ) : null}
          </div>
        ))}
        {running ? <p className="px-4 py-3.5 text-[13px] text-ink-muted">Checking…</p> : null}
      </div>

      <p className="mt-6 text-[13px] text-ink-muted">Screenshot this page if something is red.</p>
    </main>
  );
}
