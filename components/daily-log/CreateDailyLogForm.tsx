"use client";

import { useActionState, useState } from "react";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";

type Props = {
  createAction: (
    _prevState: { error?: string } | null,
    formData: FormData
  ) => Promise<{ error?: string } | null>;
  todayDate: string;
};

export function CreateDailyLogForm({ createAction, todayDate }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createAction, null);

  return (
    <div className="bg-[#0d1117] border border-zinc-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900/40 transition-colors"
      >
        <span className="flex items-center gap-2 font-medium">
          <Plus size={14} className="text-emerald-400" />
          Log Today
        </span>
        {open ? (
          <ChevronUp size={14} className="text-zinc-600" />
        ) : (
          <ChevronDown size={14} className="text-zinc-600" />
        )}
      </button>

      {open && (
        <form
          action={formAction}
          className="px-5 pb-5 space-y-4 border-t border-zinc-800"
        >
          <input type="hidden" name="date" value={todayDate} />

          <div className="pt-4">
            <p className="text-xs text-zinc-600 font-mono mb-4">{todayDate}</p>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5 font-medium">
              What did you build today?
            </label>
            <textarea
              name="builtToday"
              rows={3}
              placeholder="Implemented JWT auth middleware, wired up the login route..."
              className="w-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder-zinc-600 px-3 py-2 rounded-md focus:outline-none focus:border-zinc-600 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5 font-medium">
              What do you now actually understand?
            </label>
            <textarea
              name="understoodToday"
              rows={3}
              placeholder="How bcrypt hashing works, why salts prevent rainbow table attacks..."
              className="w-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder-zinc-600 px-3 py-2 rounded-md focus:outline-none focus:border-zinc-600 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5 font-medium">
              What is still unclear?{" "}
              <span className="text-zinc-600">(be honest)</span>
            </label>
            <textarea
              name="unclearTopics"
              rows={2}
              placeholder="Refresh token rotation — not sure when to invalidate..."
              className="w-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder-zinc-600 px-3 py-2 rounded-md focus:outline-none focus:border-zinc-600 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5 font-medium">
              Bugs faced today?{" "}
              <span className="text-zinc-600">(optional)</span>
            </label>
            <input
              name="bugsFaced"
              placeholder="CORS error on /api/auth, took 2 hrs to trace to missing origin header"
              className="w-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder-zinc-600 px-3 py-2 rounded-md focus:outline-none focus:border-zinc-600"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5 font-medium">
              Next action — one concrete step
            </label>
            <input
              name="nextAction"
              placeholder="Implement /refresh endpoint with token rotation"
              className="w-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder-zinc-600 px-3 py-2 rounded-md focus:outline-none focus:border-zinc-600"
            />
          </div>

          {state?.error && (
            <p className="text-xs text-red-400">{state.error}</p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save Log"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-zinc-500 hover:text-zinc-300 text-xs px-3 py-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
