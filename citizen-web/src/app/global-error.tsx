"use client";

/**
 * The last line of defence. Without it, an exception during render leaves a blank white
 * page and nothing to act on — which is indistinguishable from "the site is down".
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "#F6F7F5",
          color: "#10201A",
        }}
      >
        <main style={{ maxWidth: 520, margin: "0 auto", padding: "48px 20px" }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#66736D", lineHeight: 1.6 }}>
            The app could not start. The message below says why.
          </p>
          <pre
            style={{
              marginTop: 16,
              padding: 14,
              background: "#FEE2E2",
              color: "#B91C1C",
              borderRadius: 12,
              fontSize: 12,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {error.message}
          </pre>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              height: 48,
              width: "100%",
              border: 0,
              borderRadius: 12,
              background: "#087F5B",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            Try again
          </button>
          <p style={{ marginTop: 24, fontSize: 13 }}>
            <a href="/status" style={{ color: "#087F5B" }}>
              Open the status page
            </a>{" "}
            to see what is configured.
          </p>
        </main>
      </body>
    </html>
  );
}
