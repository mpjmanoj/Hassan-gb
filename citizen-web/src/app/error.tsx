"use client";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-[520px] px-5 py-12">
      <h1 className="text-[22px] font-bold tracking-tight">This screen could not load</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
        The reason is below. Nothing is broken on your phone.
      </p>
      <pre className="mt-4 whitespace-pre-wrap break-words rounded-xl bg-danger-light px-3 py-3 text-[12px] text-danger">
        {error.message}
      </pre>
      <button type="button" onClick={reset} className="btn-primary mt-5 w-full">
        Try again
      </button>
      <p className="mt-6 text-[13px]">
        <a href="/status" className="font-semibold text-brand">
          Open the status page
        </a>
      </p>
    </main>
  );
}
