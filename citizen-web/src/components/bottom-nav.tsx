"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  {
    href: "/home",
    label: "Home",
    icon: (
      <path d="M3 9.2 10 3.8l7 5.4V16a1 1 0 0 1-1 1h-3.4v-4.2H7.4V17H4a1 1 0 0 1-1-1V9.2Z" />
    ),
  },
  {
    href: "/history",
    label: "History",
    icon: (
      <>
        <circle cx="10" cy="10" r="7" />
        <path d="M10 5.8V10l2.8 1.8" />
      </>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    icon: (
      <>
        <circle cx="10" cy="7.2" r="3" />
        <path d="M4 16.4c.8-2.7 3.1-4.2 6-4.2s5.2 1.5 6 4.2" />
      </>
    ),
  },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur
                 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex w-full max-w-[560px]">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[58px] flex-col items-center justify-center gap-1 text-[11px] font-semibold
                  ${active ? "text-brand" : "text-ink-muted"}`}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2 : 1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  {item.icon}
                </svg>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
