"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { useSession } from "@/features/auth/session-provider";
import { LogoMark } from "@/components/logo";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { citizen, ready } = useSession();

  useEffect(() => {
    if (!ready) return;
    if (!citizen) router.replace("/login");
    else if (!citizen.wardId) router.replace("/setup");
  }, [ready, citizen, router]);

  if (!ready || !citizen?.wardId) {
    return (
      <div className="grid min-h-dvh place-items-center bg-surface-muted">
        <LogoMark size={40} className="animate-fade-in" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface-muted">
      <div className="mx-auto w-full max-w-[560px] flex-1 pb-6">{children}</div>
      <BottomNav />
    </div>
  );
}
