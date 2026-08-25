"use client";

import { useEffect } from "react";

/**
 * The last resort: the root layout itself failed, so next-intl never ran and there is no
 * locale, no messages and no design system to lean on.
 *
 * That constraint is why this file repeats colours instead of using tokens — it must render
 * when the stylesheet may not have loaded, so everything it needs is inline. It is also
 * why the copy is English only: reaching for a translation here would mean reaching for the
 * machinery that just failed.
 *
 * `<html>` and `<body>` are required — this replaces the root layout entirely.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[root]", error.digest ?? "", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#fbf7f2",
          color: "#1f1a17",
          fontFamily: "system-ui, sans-serif",
          lineHeight: 1.5,
        }}
      >
        <main style={{ maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.625rem", margin: "0 0 8px" }}>Mandhira didn&apos;t load</h1>
          <p style={{ margin: "0 0 20px", color: "#6b625c" }}>
            Something on our side didn&apos;t answer. Your journey is saved — nothing has been lost.
          </p>

          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: "48px",
              padding: "0 16px",
              border: "none",
              borderRadius: "12px",
              background: "#ff660e",
              color: "#2b1a10",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
