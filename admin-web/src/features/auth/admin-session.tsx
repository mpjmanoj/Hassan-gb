"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Admin } from "@/types/domain";

const KEY = "swachhata.admin";

interface AdminSessionValue {
  admin: Admin | null;
  ready: boolean;
  signIn: (email: string) => Admin;
  signOut: () => void;
}

const Context = createContext<AdminSessionValue | null>(null);

/**
 * Front-end sign-in gate only.
 *
 * It exists so the dashboard can be navigated during design work. Real authentication and
 * every authorisation decision belong on the server — nothing here is a security boundary.
 */
export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) setAdmin(JSON.parse(raw) as Admin);
    } catch {
      setAdmin(null);
    } finally {
      setReady(true);
    }
  }, []);

  const signIn = useCallback((email: string) => {
    const next: Admin = {
      id: "adm-1",
      email,
      name: email.split("@")[0]?.replace(/[._]/g, " ") || "Administrator",
      role: "SUPER_ADMIN",
    };
    window.localStorage.setItem(KEY, JSON.stringify(next));
    setAdmin(next);
    return next;
  }, []);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(KEY);
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
