import { AnimatedNumber } from "@/components/animated-number";

export function StatTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "live" | "warn" | "danger";
}) {
  const accent = {
    default: "text-ink",
    live: "text-brand",
    warn: "text-warn",
    danger: "text-danger",
  }[tone];

  return (
    <div className="card px-5 py-4">
      <p className="label">{label}</p>
      <p className={`mt-2 text-[28px] font-bold leading-none tracking-tight ${accent}`}>
        <AnimatedNumber value={value} />
      </p>
    </div>
  );
}
