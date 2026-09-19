import Link from "next/link";
import { HowItWorks } from "@/features/landing/how-it-works";
import { LogoMark, Wordmark } from "@/components/logo";

const PROMISES = [
  { title: "Live vehicle tracking", body: "Watch your ward's vehicle move, second by second." },
  { title: "Ward-based service", body: "Pick your ward once. We work out which vehicle serves it today." },
  { title: "Honest status", body: "If a vehicle is off duty or unavailable, we say so plainly." },
  { title: "A cleaner Hassan", body: "Daily collection figures published by the municipality." },
];

const OUTCOMES = ["Clean city", "Healthy people", "Sustainable future"];

export default function LandingPage() {
  return (
    <main className="min-h-dvh bg-surface">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5">
        <Wordmark />
        <Link href="/login" className="text-[14px] font-semibold text-brand hover:text-brand-dark">
          Sign in
        </Link>
      </header>

      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-brand-light/70"
          style={{ clipPath: "ellipse(120% 100% at 50% 0%)" }}
        />
        <div className="relative mx-auto w-full max-w-5xl px-5 pb-16 pt-10 sm:pb-24 sm:pt-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-surface px-3 py-1.5 text-[12px] font-semibold text-brand-dark">
            <LogoMark size={15} />
            Hassan City Municipal Council
          </p>

          <h1 className="mt-6 max-w-2xl text-[38px] font-bold leading-[1.05] tracking-tight sm:text-[60px]">
            Track your garbage collection vehicle in real time.
          </h1>
          <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-ink-muted sm:text-[18px]">
            No more waiting for the horn. Choose your ward and see exactly where today&apos;s
            collection vehicle is — live, on a map.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className="btn-primary sm:px-8">
              Track my collection
            </Link>
            <Link href="#how-it-works" className="btn-secondary sm:px-8">
              See how it works
            </Link>
          </div>

          <dl className="mt-14 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {PROMISES.map(({ title, body }) => (
              <div key={title} className="border-t border-line pt-4">
                <dt className="text-[15px] font-semibold">{title}</dt>
                <dd className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">{body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="bg-surface-muted">
        <HowItWorks />
      </div>

      <section className="mx-auto w-full max-w-5xl px-5 py-16 sm:py-24">
        <p className="label">Swachhata impact</p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
          {OUTCOMES.map((outcome) => (
            <li
              key={outcome}
              className="rounded-card border border-line bg-surface px-6 py-8 text-[19px] font-semibold tracking-tight"
            >
              {outcome}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line bg-brand-dark">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-5 py-16 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[26px] font-bold leading-tight tracking-tight text-white sm:text-[32px]">
              Ready when your vehicle is.
            </h2>
            <p className="mt-2 text-[15px] text-white/70">
              Sign in with your mobile number. It takes under a minute.
            </p>
          </div>
          <Link
            href="/login"
            className="btn bg-white text-brand-dark hover:bg-brand-light sm:px-8"
          >
            Track my collection
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-5 py-10 text-[13px] text-ink-muted sm:flex-row sm:items-center sm:justify-between">
        <Wordmark />
        <p>Swachhata Hasan · A civic technology initiative for Hassan.</p>
      </footer>
    </main>
  );
}
