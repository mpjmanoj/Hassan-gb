"use client";

import { useState } from "react";
import { Sidebar } from "@/features/shell/sidebar";
import { useAdminSession } from "@/features/auth/admin-session";
import { LogoMark, Wordmark } from "@/components/logo";
import { ErrorNote } from "@/components/ui";
import { isDemoData } from "@/lib/config";

function SignIn() {
  const { signIn } = useAdminSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter the email address issued to you by the municipality.");
      return;
    }
    if (password.length < 6) {
      setError("Enter your password.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not sign you in.");
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-surface-muted px-4">
      <form onSubmit={(event) => void submit(event)} className="card w-full max-w-[400px] p-8">
        <Wordmark />
        <h1 className="mt-7 text-[22px] font-bold tracking-tight">Operations sign in</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
          For municipal staff managing vehicles, routes and assignments.
        </p>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="label">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              placeholder="name@hassancity.gov.in"
              className="field mt-1.5"
            />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="field mt-1.5"
            />
          </label>
          <ErrorNote message={error} />
        </div>

        <button type="submit" disabled={submitting} className="btn-primary mt-6 w-full">
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        {isDemoData ? (
          <p className="mt-4 text-[12px] leading-relaxed text-ink-muted">
            Demo build — any valid email and a 6-character password opens the dashboard.
            Against the real database, only accounts registered for operations get in.
          </p>
        ) : null}
      </form>
    </main>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { admin, ready } = useAdminSession();

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-surface-muted">
        <LogoMark size={36} />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  if (!admin) return <SignIn />;

  return (
    <div className="flex min-h-dvh bg-surface-muted">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1280px] px-6 py-8 lg:px-10">{children}</div>
      </div>
    </div>
  );
}
