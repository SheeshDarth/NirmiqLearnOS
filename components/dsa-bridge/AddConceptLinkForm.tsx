"use client";

import { useActionState, useState } from "react";
import { Plus, ChevronDown, ChevronUp } from "lucide-react";
import { CONCEPT_TYPES } from "@/lib/validators/concept-link.schema";

type Props = {
  createAction: (
    _prevState: { error?: string } | null,
    formData: FormData
  ) => Promise<{ error?: string } | null>;
};

export function AddConceptLinkForm({ createAction }: Props) {
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
          <Plus size={14} className="text-violet-400" />
          Link a Concept
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
          <div className="pt-4">
            <label className="block text-xs text-zinc-500 mb-1.5 font-medium">
              Project Feature <span className="text-violet-500">*</span>
            </label>
            <input
              name="projectFeature"
              required
              placeholder="e.g. JWT authentication middleware"
              className="w-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder-zinc-600 px-3 py-2 rounded-md focus:outline-none focus:border-zinc-600"
            />
            <p className="text-xs text-zinc-700 mt-1">
              What specific part of your project does this link to?
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5 font-medium">
                Concept Name <span className="text-violet-500">*</span>
              </label>
              <input
                name="conceptName"
                required
                placeholder="e.g. Hash Map"
                className="w-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder-zinc-600 px-3 py-2 rounded-md focus:outline-none focus:border-zinc-600"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5 font-medium">
                Concept Type{" "}
                <span className="text-zinc-600">(optional)</span>
              </label>
              <input
                name="conceptType"
                list="concept-types"
                placeholder="e.g. HashMap"
                className="w-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder-zinc-600 px-3 py-2 rounded-md focus:outline-none focus:border-zinc-600"
              />
              <datalist id="concept-types">
                {CONCEPT_TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5 font-medium">
              Explanation{" "}
              <span className="text-zinc-600">
                (how does this concept apply here?)
              </span>
            </label>
            <textarea
              name="explanation"
              rows={3}
              placeholder="Tokens are stored as hashed strings so we can look up users in O(1) instead of scanning the whole DB..."
              className="w-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-200 placeholder-zinc-600 px-3 py-2 rounded-md focus:outline-none focus:border-zinc-600 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5 font-medium">
              Practice Task{" "}
              <span className="text-zinc-600">(optional — one actionable task)</span>
            </label>
            <input
              name="practiceTask"
              placeholder="Solve LeetCode #1 Two Sum without hints"
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
              className="bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 text-xs font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-50"
            >
              {pending ? "Saving…" : "Add Link"}
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
