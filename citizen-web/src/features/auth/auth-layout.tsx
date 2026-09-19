import Link from "next/link";
import type { Route } from "next";
import { LogoMark } from "@/components/logo";

interface AuthLayoutProps {
  title: string;
  subtitle: React.ReactNode;
  children: React.ReactNode;
  back?: { href: Route; label: string };
}

export function AuthLayout({ title, subtitle, children, back }: AuthLayoutProps) {
  return (
    <main className="flex min-h-dvh flex-col bg-surface">
      <header className="flex items-center gap-3 px-5 pt-6">
        {back ? (
          <Link
            href={back.href}
            aria-label={back.label}
            className="-ml-2 grid h-10 w-10 place-items-center rounded-full text-ink-muted hover:bg-surface-muted"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
              <path d="M11 3.5 5.5 9l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        ) : (
          <LogoMark size={30} />
        )}
      </header>

      <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col px-5 pb-10 pt-10">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">{title}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{subtitle}</p>
        <div className="mt-8 flex flex-1 flex-col">{children}</div>
      </div>
    </main>
  );
}
