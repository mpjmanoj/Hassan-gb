"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

interface ProgressRingProps {
  /** 0 to 100. */
  value: number;
  label: string;
  size?: number;
}

export function ProgressRing({ value, label, size = 104 }: ProgressRingProps) {
  const reduced = useReducedMotion();
  const [drawn, setDrawn] = useState(reduced ? value : 0);
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    if (reduced) {
      setDrawn(value);
      return;
    }
    const frame = requestAnimationFrame(() => setDrawn(value));
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} role="img" aria-label={`${label}: ${value.toFixed(1)} percent`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E7F5EF"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#087F5B"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, drawn / 100)))}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-ink text-[19px] font-bold"
        >
          {value.toFixed(1)}%
        </text>
      </svg>
      <div>
        <p className="text-[15px] font-semibold leading-snug">{label}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          Share of today&apos;s collected waste that has reached the processing site.
        </p>
      </div>
    </div>
  );
}
