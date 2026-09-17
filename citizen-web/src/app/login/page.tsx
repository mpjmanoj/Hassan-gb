"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "@/features/auth/auth-layout";
import { getDataService, ServiceError } from "@swachhata/core";
import { PENDING_PHONE_KEY } from "@/features/auth/keys";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const valid = /^[6-9]\d{9}$/.test(phone);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await getDataService().requestOtp(phone);
      window.sessionStorage.setItem(PENDING_PHONE_KEY, phone);
      router.push("/verify");
    } catch (caught) {
      setError(
        caught instanceof ServiceError
          ? caught.message
          : "We could not send the code right now. Please try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Track your collection vehicle"
      subtitle="Sign in with your mobile number to see the vehicle serving your ward."
      back={{ href: "/", label: "Back to home" }}
    >
      <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
        <label htmlFor="phone" className="label">
          Mobile number
        </label>
        <div className="mt-2 flex items-center gap-2 rounded-2xl border border-line bg-surface pl-4 focus-within:border-brand">
          <span className="text-[16px] font-semibold text-ink-muted">+91</span>
          <input
            id="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="98XXXXXXXX"
            aria-describedby={error ? "phone-error" : undefined}
            aria-invalid={error ? true : undefined}
            className="h-[52px] flex-1 bg-transparent pr-4 text-[16px] tracking-[0.02em] outline-none placeholder:text-ink-muted/60"
          />
        </div>

        {error ? (
          <p id="phone-error" role="alert" className="mt-3 text-[13px] font-medium text-danger">
            {error}
          </p>
        ) : null}

        <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
          We send a 6-digit code to confirm it is you. Your number is used only for collection
          updates.
        </p>

        <div className="mt-auto pt-8">
          <button type="submit" disabled={!valid || submitting} className="btn-primary w-full">
            {submitting ? "Sending code…" : "Continue"}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
