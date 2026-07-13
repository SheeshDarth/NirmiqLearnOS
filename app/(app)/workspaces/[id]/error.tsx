"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

/**
 * Error boundary scoped to a single workspace (/workspaces/[id] and all its
 * sub-tabs: learning-map, deep-review, explain-back, dsa-bridge, logs). Keeping
 * the boundary here means a failure in one workspace pane resets just that pane
 * instead of tearing down the whole app shell, and offers a way back to the
 * workspace list rather than a dead end.
 */
export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-red-500/10 mb-4">
        <AlertCircle size={22} className="text-red-400" />
      </div>
      <h2 className="text-base font-semibold text-zinc-100 mb-1">
        Couldn&apos;t load this workspace
      </h2>
      <p className="text-sm text-zinc-500 mb-5 max-w-sm">
        {error.message ??
          "An unexpected error occurred while loading this workspace. Please try again."}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={reset}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium px-4 py-2 rounded-md transition-colors"
        >
          Try again
        </button>
        <Link
          href="/workspaces"
          className="border border-zinc-800 hover:bg-zinc-900 text-zinc-400 text-xs font-medium px-4 py-2 rounded-md transition-colors"
        >
          Back to workspaces
        </Link>
      </div>
    </div>
  );
}
