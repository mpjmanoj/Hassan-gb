"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Citizen } from "@/types/domain";
import { getDataService } from "@/lib/data";

const SESSION_KEY = "swachhata.session";

interface SessionValue {
  citizen: Citizen | null;
  /** False until the stored session has been read — guards must wait for this. */
  ready: boolean;
  signIn: (citizen: Citizen) => void;
  signOut: () => void;
  update: (patch: Partial<Pick<Citizen, "name" | "areaId" | "wardId">>) => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [citizen, setCitizen] = useState<Citizen | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const citizenId = window.localStorage.getItem(SESSION_KEY);
      if (!citizenId) {
        if (!cancelled) setReady(true);
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
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback((next: Citizen) => {
    window.localStorage.setItem(SESSION_KEY, next.id);
    setCitizen(next);
  }, []);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(SESSION_KEY);
    setCitizen(null);
  }, []);

  const update = useCallback<SessionValue["update"]>(
    async (patch) => {
      setCitizen((current) => (current ? { ...current, ...patch } : current));
      const id = window.localStorage.getItem(SESSION_KEY);
      if (!id) return;
      const saved = await getDataService().updateCitizen(id, patch);
      setCitizen(saved);
    },
    [],
  );

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
