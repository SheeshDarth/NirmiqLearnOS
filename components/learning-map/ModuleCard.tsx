import {
  updateConfidenceAction,
  deleteModuleAction,
} from "@/app/(app)/workspaces/[id]/learning-map/actions";
import type { LearningModule } from "@/lib/services/learning-map.service";
import Link from "next/link";
import { Trash2, HelpCircle, Lightbulb } from "lucide-react";

const DIFFICULTY_COLOR = {
  beginner: "text-emerald-400 bg-emerald-500/10",
  intermediate: "text-amber-400 bg-amber-500/10",
  advanced: "text-red-400 bg-red-500/10",
} as const;

const CONFIDENCE = {
  red: { label: "Cannot explain", color: "text-red-400 bg-red-500/10 border-red-500/30" },
  yellow: { label: "Partial", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  green: { label: "Confident", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
} as const;

interface ModuleCardProps {
  module: LearningModule;
  mapId: string;
  workspaceId: string;
  /** Cross-surface counts (#27/#28): questions + concepts tagged to this module. */
  related?: { questions: number; concepts: number };
}

export default function ModuleCard({
  module,
  mapId,
  workspaceId,
  related,
}: ModuleCardProps) {
  return (
    <div className="bg-[#0d1117] border border-zinc-800 rounded-lg p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded ${
              DIFFICULTY_COLOR[module.difficulty]
            }`}
          >
            {module.difficulty}
          </span>
          <h3 className="text-sm font-semibold text-zinc-100">{module.title}</h3>
        </div>

        {/* Delete */}
        <form action={deleteModuleAction} className="shrink-0">
          <input type="hidden" name="mapId" value={mapId} />
          <input type="hidden" name="moduleId" value={module.id} />
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <button
            type="submit"
            title="Delete module"
            className="text-zinc-700 hover:text-red-400 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </form>
      </div>

      {/* Summary */}
      {module.summary && (
        <p className="text-xs text-zinc-500 leading-relaxed whitespace-pre-line">{module.summary}</p>
      )}

      {/* Concept chips */}
      {module.concepts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {module.concepts.map((c) => (
            <span
              key={c}
              className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {/* File chips */}
      {module.files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {module.files.map((f) => (
            <span
              key={f}
              className="text-xs font-mono bg-zinc-900 text-zinc-500 border border-zinc-800 px-2 py-0.5 rounded"
            >
              {f}
            </span>
          ))}
        </div>
      )}

      {/* Related surfaces (#27/#28) — this module's questions + concepts */}
      {related && (related.questions > 0 || related.concepts > 0) && (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {related.questions > 0 && (
            <Link
              href={`/workspaces/${workspaceId}/explain-back`}
              className="inline-flex items-center gap-1 text-cyan-500 hover:text-cyan-300 transition-colors"
            >
              <HelpCircle size={12} />
              {related.questions} question{related.questions === 1 ? "" : "s"}
            </Link>
          )}
          {related.concepts > 0 && (
            <Link
              href={`/workspaces/${workspaceId}/dsa-bridge`}
              className="inline-flex items-center gap-1 text-violet-400 hover:text-violet-300 transition-colors"
            >
              <Lightbulb size={12} />
              {related.concepts} concept{related.concepts === 1 ? "" : "s"}
            </Link>
          )}
        </div>
      )}

      {/* Confidence row */}
      <div className="pt-1 border-t border-zinc-800">
        <p className="text-xs text-zinc-600 mb-2">Understanding level</p>
        <div className="flex gap-2">
          {(["red", "yellow", "green"] as const).map((level) => {
            const meta = CONFIDENCE[level];
            const active = module.confidence === level;
            return (
              <form key={level} action={updateConfidenceAction}>
                <input type="hidden" name="mapId" value={mapId} />
                <input type="hidden" name="moduleId" value={module.id} />
                <input type="hidden" name="confidence" value={level} />
                <input type="hidden" name="workspaceId" value={workspaceId} />
                <button
                  type="submit"
                  title={meta.label}
                  className={`text-xs px-2 py-1 rounded border transition-colors ${
                    active
                      ? meta.color
                      : "text-zinc-600 border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  {meta.label}
                </button>
              </form>
            );
          })}
        </div>
      </div>
    </div>
  );
}
