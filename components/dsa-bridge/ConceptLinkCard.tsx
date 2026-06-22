"use client";

import { useState } from "react";
import { Trash2, ChevronDown, ChevronUp, ArrowRight, BookOpen, Code } from "lucide-react";
import type { ConceptLink } from "@/lib/services/concept-link.service";

type Props = {
  link: ConceptLink;
  deleteAction: () => Promise<void>;
};

const TYPE_COLOR: Record<string, { bg: string; text: string }> = {
  Array: { bg: "bg-cyan-500/10", text: "text-cyan-400" },
  HashMap: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  Tree: { bg: "bg-green-500/10", text: "text-green-400" },
  Graph: { bg: "bg-blue-500/10", text: "text-blue-400" },
  Stack: { bg: "bg-orange-500/10", text: "text-orange-400" },
  Queue: { bg: "bg-orange-500/10", text: "text-orange-400" },
  Heap: { bg: "bg-rose-500/10", text: "text-rose-400" },
  Recursion: { bg: "bg-purple-500/10", text: "text-purple-400" },
  "Dynamic Programming": { bg: "bg-violet-500/10", text: "text-violet-400" },
  Sorting: { bg: "bg-amber-500/10", text: "text-amber-400" },
  "Binary Search": { bg: "bg-sky-500/10", text: "text-sky-400" },
  "Two Pointers": { bg: "bg-teal-500/10", text: "text-teal-400" },
  "Sliding Window": { bg: "bg-teal-500/10", text: "text-teal-400" },
  Greedy: { bg: "bg-yellow-500/10", text: "text-yellow-400" },
};

function getTypeColor(type: string | null): { bg: string; text: string } {
  if (!type) return { bg: "bg-zinc-800", text: "text-zinc-400" };
  return TYPE_COLOR[type] ?? { bg: "bg-violet-500/10", text: "text-violet-400" };
}

export function ConceptLinkCard({ link, deleteAction }: Props) {
  const [expanded, setExpanded] = useState(false);
  const typeStyle = getTypeColor(link.conceptType);

  return (
    <div className="bg-[#0d1117] border border-zinc-800 hover:border-zinc-700 rounded-lg overflow-hidden transition-colors">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          {/* Feature → Concept mapping */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-zinc-400 font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 truncate max-w-[180px]">
              {link.projectFeature}
            </span>
            <ArrowRight size={12} className="text-zinc-600 shrink-0" />
            <span className="text-sm font-semibold text-zinc-100">
              {link.conceptName}
            </span>
            {link.astConfidence === "ast" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-900/40 font-medium tracking-wide shrink-0">
                AST
              </span>
            )}
            {link.conceptType && (
              <span
                className={`text-xs px-2 py-0.5 rounded font-medium ${typeStyle.bg} ${typeStyle.text}`}
              >
                {link.conceptType}
              </span>
            )}
          </div>

          {/* Quick preview of explanation */}
          {link.explanation && !expanded && (
            <p className="text-xs text-zinc-600 mt-1 line-clamp-1">
              {link.explanation}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {(link.explanation || link.practiceTask) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
          <form action={deleteAction}>
            <button
              type="submit"
              className="p-1.5 text-zinc-700 hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          </form>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
          {link.codeSnippet && (
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-1 flex items-center gap-1.5">
                <Code size={12} className="text-cyan-400" />
                Found in your code
                {link.sourceFile && (
                  <span className="text-zinc-600 normal-case font-mono">— {link.sourceFile}</span>
                )}
              </p>
              <pre className="text-xs text-cyan-200/90 bg-black/40 border border-zinc-800 rounded px-3 py-2 overflow-x-auto font-mono whitespace-pre-wrap">
                {link.codeSnippet}
              </pre>
            </div>
          )}

          {link.explanation && (
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-1">
                How it applies
              </p>
              <p className="text-sm text-zinc-300 leading-relaxed">
                {link.explanation}
              </p>
            </div>
          )}

          {link.practiceTask && (
            <div className="bg-violet-500/5 border border-violet-900/30 rounded px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <BookOpen size={12} className="text-violet-400" />
                <p className="text-xs text-violet-400 uppercase tracking-wide font-medium">
                  Practice Task
                </p>
              </div>
              <p className="text-sm text-violet-200">{link.practiceTask}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
