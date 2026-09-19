"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

interface AnimatedNumberProps {
  value: number;
  durationMs?: number;
  decimals?: number;
  suffix?: string;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Counts up once, quickly, and then stops. No bouncing, no looping. */
export function AnimatedNumber({
  value,
  durationMs = 900,
  decimals = 0,
  suffix = "",
}: AnimatedNumberProps) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }

    const from = 0;
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setDisplay(from + (value - from) * easeOut(t));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, durationMs, reduced]);

  const formatted = display.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className="tabular-nums">
      {formatted}
      {suffix}
    </span>
  );
}
