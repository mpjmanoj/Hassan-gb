"use client";

import { useRef } from "react";

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
}

/** Six boxes that behave like one field: paste, backspace and arrow keys all work. */
export function OtpInput({ value, onChange, length = 6, disabled, invalid }: OtpInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const setDigit = (index: number, digit: string) => {
    const next = value.padEnd(length, " ").split("");
    next[index] = digit || " ";
    onChange(next.join("").replace(/ /g, "").slice(0, length));
  };

  const handleChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      setDigit(index, "");
      return;
    }
    if (digits.length > 1) {
      onChange((value.slice(0, index) + digits).slice(0, length));
      refs.current[Math.min(index + digits.length, length - 1)]?.focus();
      return;
    }
    const next = (value.slice(0, index) + digits + value.slice(index + 1)).slice(0, length);
    onChange(next);
    refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !value[index] && index > 0) {
      refs.current[index - 1]?.focus();
      onChange(value.slice(0, index - 1));
    }
    if (event.key === "ArrowLeft") refs.current[index - 1]?.focus();
    if (event.key === "ArrowRight") refs.current[index + 1]?.focus();
  };

  return (
    <div className="flex gap-2" role="group" aria-label="One-time password">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          value={value[index] ?? ""}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${index + 1}`}
          aria-invalid={invalid || undefined}
          className={`h-[58px] w-full rounded-2xl border bg-surface text-center text-[22px] font-semibold
            text-ink transition-colors focus:border-brand disabled:opacity-50
            ${invalid ? "border-danger" : "border-line"}`}
        />
      ))}
    </div>
  );
}
