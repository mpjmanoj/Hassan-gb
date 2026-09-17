interface LogoProps {
  size?: number;
  className?: string;
  /** Renders the mark on a dark surface. */
  inverted?: boolean;
}

/**
 * A leaf held inside an open collection loop: environment, movement, route.
 */
export function LogoMark({ size = 32, className, inverted = false }: LogoProps) {
  const ring = inverted ? "#FFFFFF" : "#087F5B";
  const leaf = inverted ? "#E7F5EF" : "#087F5B";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="Swachhata Hasan"
    >
      <path
        d="M26.5 11.4A12 12 0 1 0 28 17"
        stroke={ring}
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M16 23c-1.4-5 1.2-9.6 7.4-11.4C23 17.9 20.6 21.6 16 23Z"
        fill={leaf}
      />
      <path
        d="M16 23c.6-3.4 2.4-6.3 5-8.2"
        stroke={inverted ? "#087F5B" : "#FFFFFF"}
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="26.6" cy="11.4" r="2.6" fill={ring} />
    </svg>
  );
}

export function Wordmark({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={28} inverted={inverted} />
      <span className="flex flex-col leading-none">
        <span
          className={`text-[15px] font-bold tracking-tight ${inverted ? "text-white" : "text-ink"}`}
        >
          Swachhata Hasan
        </span>
        <span
          className={`mt-1 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.1em] ${
            inverted ? "text-white/60" : "text-ink-muted"
          }`}
        >
          Smart Waste Collection
        </span>
      </span>
    </span>
  );
}
