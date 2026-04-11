"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-content-primary mb-2">Something went wrong</h2>
        <p className="text-sm text-content-secondary max-w-md">
          An unexpected error occurred. You can try again or navigate to a different page.
        </p>
      </div>
      <button
        onClick={reset}
        className="px-4 py-2 text-sm font-medium rounded-button bg-accent-blue text-white hover:bg-accent-blue/90 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
