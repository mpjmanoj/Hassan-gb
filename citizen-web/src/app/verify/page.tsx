"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthLayout } from "@/features/auth/auth-layout";
import { OtpInput } from "@/components/otp-input";
import { getDataService, messageFor } from "@/lib/data";
import { AUTH_MODE, DATA_SOURCE } from "@/lib/config";
import { useSession } from "@/features/auth/session-provider";
import { PENDING_PHONE_KEY } from "@/features/auth/keys";
import { isDemoData } from "@/lib/config";

const RESEND_SECONDS = 30;

export default function VerifyPage() {
  const router = useRouter();
  const { signIn } = useSession();
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (DATA_SOURCE === "supabase" && AUTH_MODE === "anonymous") {
      router.replace("/setup");
      return;
    }
    const pending = window.sessionStorage.getItem(PENDING_PHONE_KEY);
    if (!pending) {
      router.replace("/login");
      return;
    }
    setPhone(pending);
  }, [router]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const verify = useCallback(
    async (value: string) => {
      if (!phone || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const citizen = await getDataService().verifyOtp(phone, value);
        window.sessionStorage.removeItem(PENDING_PHONE_KEY);
        signIn(citizen);
        router.replace(citizen.wardId ? "/home" : "/setup");
      } catch (caught) {
        setError(messageFor(caught, "Unable to verify your number. Please try again."));
        setCode("");
        setSubmitting(false);
      }
    },
    [phone, submitting, signIn, router],
  );

  useEffect(() => {
    if (code.length === 6) void verify(code);
  }, [code, verify]);

  const resend = async () => {
    if (!phone || secondsLeft > 0) return;
    setError(null);
    setSecondsLeft(RESEND_SECONDS);
    await getDataService().requestOtp(phone);
  };

  const masked = phone ? `+91 ${phone.slice(0, 2)}XXXXXX${phone.slice(-2)}` : "";

  return (
    <AuthLayout
      title="Verify your number"
      subtitle={<>Enter the 6-digit code sent to <span className="font-semibold text-ink">{masked}</span></>}
      back={{ href: "/login", label: "Change number" }}
    >
      <OtpInput value={code} onChange={setCode} disabled={submitting} invalid={Boolean(error)} />

      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}

      {isDemoData ? (
        <p className="mt-4 rounded-xl bg-surface-muted px-3 py-2.5 text-[13px] text-ink-muted">
          Demo build — the code is <span className="font-semibold text-ink">123456</span>. Real
          codes are sent by SMS once the backend is connected.
        </p>
      ) : null}

      <button
        type="button"
        onClick={resend}
        disabled={secondsLeft > 0}
        className="mt-6 self-start text-[14px] font-semibold text-brand disabled:text-ink-muted"
      >
        {secondsLeft > 0 ? `Resend code in ${secondsLeft}s` : "Resend code"}
      </button>

      <div className="mt-auto pt-8">
        <button
          type="button"
          onClick={() => void verify(code)}
          disabled={code.length !== 6 || submitting}
          className="btn-primary w-full"
        >
          {submitting ? "Verifying…" : "Verify"}
        </button>
      </div>
    </AuthLayout>
  );
}
