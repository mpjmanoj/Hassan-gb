import type { Config } from "tailwindcss";

/**
 * Swachhata Hasan design tokens.
 * Green is an accent, not a wash — it is reserved for brand, live state and primary actions.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#087F5B",
          dark: "#064E3B",
          light: "#E7F5EF",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F6F7F5",
        },
        ink: {
          DEFAULT: "#10201A",
          muted: "#66736D",
        },
        line: "#DFE5E1",
        warn: "#B45309",
        "warn-light": "#FEF3C7",
        danger: "#B91C1C",
        "danger-light": "#FEE2E2",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "18px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 32, 26, 0.04), 0 8px 24px -16px rgba(16, 32, 26, 0.18)",
        panel: "0 -2px 24px -12px rgba(16, 32, 26, 0.25)",
      },
      keyframes: {
        "live-pulse": {
          "0%": { transform: "scale(1)", opacity: "0.55" },
          "70%": { transform: "scale(2.4)", opacity: "0" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        "slide-up": {
          from: { transform: "translateY(12px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        "live-pulse": "live-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-up": "slide-up 260ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 240ms ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
