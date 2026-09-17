import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { SessionProvider } from "@/features/auth/session-provider";

export const metadata: Metadata = {
  metadataBase: new URL("https://swachhata-hasan.example.gov.in"),
  title: {
    default: "Swachhata Hasan — Smart Waste Collection Tracking",
    template: "%s · Swachhata Hasan",
  },
  description:
    "Track garbage collection vehicles in Hassan in real time. Select your ward and see when your collection vehicle is on the way.",
  applicationName: "Swachhata Hasan",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Swachhata Hasan", statusBarStyle: "default" },
  openGraph: {
    title: "Swachhata Hasan — Smart Waste Collection Tracking",
    description: "Track garbage collection vehicles in Hassan in real time.",
    type: "website",
    locale: "en_IN",
  },
};

export const viewport: Viewport = {
  themeColor: "#087F5B",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
