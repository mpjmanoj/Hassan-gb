"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Citizen } from "@swachhata/core";
import { getDataService } from "@/lib/data";
import { AUTH_MODE, DATA_SOURCE } from "@/lib/config";
import { getSupabaseClient } from "@/lib/supabase";

const SESSION_KEY = "swachhata.session";

interface SessionValue {
  citizen: Citizen | null;
  /** False until the stored session has been read — guards must wait for this. */
  ready: boolean;
  signIn: (citizen: Citizen) => void;
  signOut: () => Promise<void>;
  update: (patch: Partial<Pick<Citizen, "name" | "areaId" | "wardId">>) => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [citizen, setCitizen] = useState<Citizen | null>(null);
  const [ready, setReady] = useState(false);

  /**
   * Who is signed in comes from Supabase when it is wired up, and from a stored id in the
   * demo build. Either way the rest of the app only ever sees a Citizen or null.
   */
  useEffect(() => {
    let cancelled = false;

    const load = async (citizenId: string | null) => {
      if (!citizenId) {
        if (!cancelled) {
          setCitizen(null);
          setReady(true);
        }
        return;
      }
      try {
        const restored = await getDataService().getCitizen(citizenId);
        if (!cancelled) setCitizen(restored);
      } catch {
        if (!cancelled) setCitizen(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    if (DATA_SOURCE !== "supabase") {
      void load(window.localStorage.getItem(SESSION_KEY));
      return () => {
        cancelled = true;
      };
    }

    const client = getSupabaseClient();

    void client.auth.getSession().then(async ({ data }) => {
      // No OTP yet: a resident is signed in anonymously and goes straight to ward selection.
      if (!data.session && AUTH_MODE === "anonymous") {
        try {
          const service = getDataService();
          if ("signInAnonymously" in service) {
            const citizen = await (
              service as { signInAnonymously: () => Promise<Citizen> }
            ).signInAnonymously();
            if (!cancelled) {
              setCitizen(citizen);
              setReady(true);
            }
            return;
          }
        } catch {
          if (!cancelled) setReady(true);
          return;
        }
      }
      await load(data.session?.user.id ?? null);
    });

    // A token refresh, a sign-out in another tab, or an expired session all land here.
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        setCitizen(null);
        setReady(true);
        return;
      }
      if (session?.user.id) void load(session.user.id);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback((next: Citizen) => {
    // In Supabase mode the session already exists; this only primes the UI.
    if (DATA_SOURCE !== "supabase") window.localStorage.setItem(SESSION_KEY, next.id);
    setCitizen(next);
    setReady(true);
  }, []);

  const signOut = useCallback(async () => {
    if (DATA_SOURCE === "supabase") {
      await getSupabaseClient().auth.signOut();
    } else {
      window.localStorage.removeItem(SESSION_KEY);
    }
    setCitizen(null);
  }, []);

  const update = useCallback<SessionValue["update"]>(async (patch) => {
    // Optimistic, so changing a ward feels instant; the saved row wins.
    setCitizen((current) => (current ? { ...current, ...patch } : current));

    const id =
      DATA_SOURCE === "supabase"
        ? (await getSupabaseClient().auth.getSession()).data.session?.user.id
        : window.localStorage.getItem(SESSION_KEY);
    if (!id) return;

    const saved = await getDataService().updateCitizen(id, patch);
    setCitizen(saved);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ citizen, ready, signIn, signOut, update }),
    [citizen, ready, signIn, signOut, update],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>.");
  return value;
}
