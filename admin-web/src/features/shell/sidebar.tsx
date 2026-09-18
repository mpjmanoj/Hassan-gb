"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/logo";
import { useAdminSession } from "@/features/auth/admin-session";

const SECTIONS: { heading: string; items: { href: Route; label: string }[] }[] = [
  {
    heading: "Operations",
    items: [
      { href: "/" as Route, label: "Dashboard" },
      { href: "/live-map" as Route, label: "Live map" },
      { href: "/assignments" as Route, label: "Assignments" },
      { href: "/sessions" as Route, label: "Work sessions" },
    ],
  },
  {
    heading: "Fleet",
    items: [
      { href: "/vehicles" as Route, label: "Vehicles" },
      { href: "/workers" as Route, label: "Workers" },
    ],
  },
  {
    heading: "Service area",
    items: [
      { href: "/areas" as Route, label: "Areas" },
      { href: "/wards" as Route, label: "Wards & routes" },
    ],
  },
  {
    heading: "Records",
    items: [
      { href: "/logs" as Route, label: "Vehicle logs" },
      { href: "/reports" as Route, label: "Reports" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { admin, signOut } = useAdminSession();

  return (
    <aside className="flex w-[248px] shrink-0 flex-col bg-ink text-white/80">
      <div className="px-5 py-6">
        <Wordmark inverted />
      </div>

      <nav aria-label="Dashboard" className="flex-1 overflow-y-auto px-3 pb-6">
        {SECTIONS.map((section) => (
          <div key={section.heading} className="mb-6">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
              {section.heading}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-lg px-3 py-2 text-[14px] font-medium transition-colors
                        ${active ? "bg-white/12 text-white" : "hover:bg-white/6 hover:text-white"}`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="truncate text-[13px] font-semibold capitalize text-white">{admin?.name}</p>
        <p className="truncate text-[12px] text-white/45">{admin?.email}</p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-3 text-[13px] font-semibold text-white/65 hover:text-white"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
