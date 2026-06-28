"use client";

import { useActionState, useState } from "react";
import { RefreshCw } from "lucide-react";
import { reanalyzeWorkspaceAction } from "@/app/(app)/workspaces/actions";

/**
 * Re-runs analysis on an imported workspace. Two-step confirm because it
 * replaces the auto-generated questions, concepts, and learning map; shows a
 * pending spinner because the analysis can take tens of seconds.
 */
export function RefreshAnalysisButton({ workspaceId }: { workspaceId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(
    reanalyzeWorkspaceAction,
    null
  );

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-cyan-300 px-3 py-2 rounded-md border border-zinc-800 hover:border-cyan-900/60 transition-colors shrink-0"
        title="Re-run analysis from the current source code (replaces auto-generated questions, concepts, and the learning map)"
      >
        <RefreshCw size={13} />
        Refresh
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1.5 shrink-0">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <span className="text-xs text-zinc-500">Regenerate analysis?</span>
      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-1.5 text-xs text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-2 rounded-md transition-colors disabled:opacity-50"
      >
        <RefreshCw size={13} className={pending ? "animate-spin" : ""} />
        {pending ? "Refreshing…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-2 transition-colors disabled:opacity-50"
      >
        Cancel
      </button>
      {state?.error && <span className="text-xs text-red-400">{state.error}</span>}
    </form>
  );
}
