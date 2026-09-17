import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { AdminSessionProvider } from "@/features/auth/admin-session";
import { AdminShell } from "@/features/shell/admin-shell";

export const metadata: Metadata = {
  title: { default: "Swachhata Hasan — Operations", template: "%s · Swachhata Operations" },
  description: "Fleet operations dashboard for waste collection in Hassan.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#10201A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body style={{ ["--font-inter" as string]: "'Inter'" }}>
        <AdminSessionProvider>
          <AdminShell>{children}</AdminShell>
        </AdminSessionProvider>
      </body>
    </html>
  );
}
