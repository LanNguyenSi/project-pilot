"use client";

import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Root error:", error);
  }, [error]);

  return (
    <html lang="en">
      {/* Inline styles mirror the design tokens (surface-base, content-primary,
          brand-500, content-secondary) since Tailwind/CSS vars are unavailable
          in a catastrophic root error boundary that renders its own html/body. */}
      <body style={{ backgroundColor: "#0c0c0f", color: "#f2f2f5", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "1rem", padding: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h2>
          <p style={{ fontSize: "0.875rem", color: "#a8a8b3", maxWidth: "28rem", textAlign: "center" }}>
            An unexpected error occurred. Please try again.
          </p>
          <button
            onClick={reset}
            style={{ padding: "0.5rem 1rem", fontSize: "0.875rem", fontWeight: 500, borderRadius: "0.625rem", backgroundColor: "#6e56f0", color: "white", border: "none", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
