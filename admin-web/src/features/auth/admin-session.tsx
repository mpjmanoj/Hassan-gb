"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Admin } from "@swachhata/core";
import { messageFor } from "@/lib/ops";
import { DATA_SOURCE } from "@/lib/config";
import { getSupabaseClient } from "@/lib/supabase";

const DEMO_KEY = "swachhata.admin";

interface AdminSessionValue {
  admin: Admin | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const Context = createContext<AdminSessionValue | null>(null);

export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [ready, setReady] = useState(false);

  /**
   * Signing in is not the same as being staff. Authentication proves who someone is;
   * the row in `admins` is what says they may run operations, and the database enforces
   * that independently through `is_admin()` in every policy.
   */
  const loadAdmin = useCallback(async (userId: string | null): Promise<Admin | null> => {
    if (!userId) return null;

    const { data } = await getSupabaseClient()
      .from("admins")
      .select("id, name, email, role")
      .eq("id", userId)
      .maybeSingle();

    if (!data) return null;
    return {
      id: data.id as string,
      name: (data.name as string) ?? "",
      email: data.email as string,
      role: (data.role as Admin["role"]) ?? "OPERATIONS",
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (DATA_SOURCE !== "supabase") {
      try {
        const raw = window.localStorage.getItem(DEMO_KEY);
        if (raw) setAdmin(JSON.parse(raw) as Admin);
      } catch {
        setAdmin(null);
      } finally {
        setReady(true);
      }
      return;
    }

    const client = getSupabaseClient();
    void client.auth
      .getSession()
      .then(({ data }) => loadAdmin(data.session?.user.id ?? null))
      .then((next) => {
        if (!cancelled) {
          setAdmin(next);
          setReady(true);
        }
      });

    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        setAdmin(null);
        return;
      }
      void loadAdmin(session?.user.id ?? null).then((next) => {
        if (!cancelled) setAdmin(next);
      });
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [loadAdmin]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (DATA_SOURCE !== "supabase") {
        const next: Admin = {
          id: "adm-1",
          email,
          name: email.split("@")[0]?.replace(/[._]/g, " ") || "Administrator",
          role: "SUPER_ADMIN",
        };
        window.localStorage.setItem(DEMO_KEY, JSON.stringify(next));
        setAdmin(next);
        return;
      }

      const client = getSupabaseClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error || !data.user) {
        throw new Error(messageFor(error, "That email and password did not match."));
      }

      const next = await loadAdmin(data.user.id);
      if (!next) {
        // Authenticated, but not staff. Do not leave a half-signed-in session behind.
        await client.auth.signOut();
        throw new Error(
          "This account is not registered for operations access. Contact your administrator.",
        );
      }
      setAdmin(next);
    },
    [loadAdmin],
  );

  const signOut = useCallback(async () => {
    if (DATA_SOURCE === "supabase") {
      await getSupabaseClient().auth.signOut();
    } else {
      window.localStorage.removeItem(DEMO_KEY);
    }
    setAdmin(null);
  }, []);

  const value = useMemo(() => ({ admin, ready, signIn, signOut }), [admin, ready, signIn, signOut]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAdminSession(): AdminSessionValue {
  const value = useContext(Context);
  if (!value) throw new Error("useAdminSession must be used inside <AdminSessionProvider>.");
  return value;
}
