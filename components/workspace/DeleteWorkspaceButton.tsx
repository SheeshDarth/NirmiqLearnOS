"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteWorkspaceAction } from "@/app/(app)/workspaces/actions";

/**
 * Two-step delete: the first click reveals a confirm/cancel pair so a single
 * misclick can never destroy a workspace. Confirm submits the Server Action,
 * which cascade-deletes every child row and redirects to /workspaces.
 */
export function DeleteWorkspaceButton({ workspaceId }: { workspaceId: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 px-3 py-2 rounded-md border border-zinc-800 hover:border-red-900/60 transition-colors shrink-0"
        title="Delete this workspace and all its data"
      >
        <Trash2 size={13} />
        Delete
      </button>
    );
  }

  return (
    <form
      action={deleteWorkspaceAction}
      className="flex items-center gap-1.5 shrink-0"
    >
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <span className="text-xs text-zinc-500">Delete everything?</span>
      <button
        type="submit"
        className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-3 py-2 rounded-md transition-colors"
      >
        <Trash2 size={13} />
        Confirm
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-2 transition-colors"
      >
        Cancel
      </button>
    </form>
  );
}
