import { getLearningMapByWorkspaceId } from "@/lib/services/learning-map.service";
import { getWorkspaceById } from "@/lib/services/workspace.service";
import { getConceptLinksByWorkspaceId } from "@/lib/services/concept-link.service";
import { getQuestionsByWorkspaceId } from "@/lib/services/explain-back.service";
import { buildKnowledgeGraph, type KnowledgeGraphData } from "@/lib/services/knowledge-graph.service";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckSquare, Square, Sparkles, FileText } from "lucide-react";
import Link from "next/link";
import CreateMapForm from "@/components/learning-map/CreateMapForm";
import AddModuleForm from "@/components/learning-map/AddModuleForm";
import ModuleCard from "@/components/learning-map/ModuleCard";
import AddCheckpointForm from "@/components/learning-map/AddCheckpointForm";
import KnowledgeGraphLoader from "@/components/learning-map/KnowledgeGraphLoader";
import {
  createMapAction,
  addModuleAction,
  addCheckpointAction,
  toggleCheckpointAction,
} from "./actions";
import { searchWorkspace, hasSearchIndex } from "@/lib/services/search.service";
import { Search } from "lucide-react";

const READING_ORDER_MAX = 12;

export const dynamic = "force-dynamic";

export default async function LearningMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { id: workspaceId } = await params;
  const { q } = await searchParams;

  const [wsResult, mapResult, clResult, qResult, indexed] = await Promise.all([
    getWorkspaceById(workspaceId),
    getLearningMapByWorkspaceId(workspaceId),
    getConceptLinksByWorkspaceId(workspaceId),
    getQuestionsByWorkspaceId(workspaceId),
    hasSearchIndex(workspaceId),
  ]);

  const searchResults =
    indexed && q && q.trim().length >= 2
      ? await searchWorkspace(workspaceId, q.trim())
      : null;

  if (!wsResult.ok) notFound();

  const workspace = wsResult.data;
  const map = mapResult.ok ? mapResult.data : null;
  const conceptLinks = clResult.ok ? clResult.data : [];
  const questions = qResult.ok ? qResult.data : [];

  // Per-module related counts (#27/#28) — group the flat question/concept lists
  // by moduleKey so each module card shows what belongs to it.
  const relatedByModule = new Map<string, { questions: number; concepts: number }>();
  const bump = (key: string | null, kind: "questions" | "concepts") => {
    if (!key) return;
    const cur = relatedByModule.get(key) ?? { questions: 0, concepts: 0 };
    cur[kind]++;
    relatedByModule.set(key, cur);
  };
  for (const q of questions) bump(q.moduleKey, "questions");
  for (const cl of conceptLinks) bump(cl.moduleKey, "concepts");

  const completedCheckpoints = map?.checkpoints.filter((c) => c.completed).length ?? 0;
  const totalCheckpoints = map?.checkpoints.length ?? 0;

  // Prefer the real architecture/workflow graph built from source code at
  // import time; fall back to the module-derived graph for older workspaces.
  let graph: KnowledgeGraphData;
  if (map?.graphJson) {
    try {
      graph = JSON.parse(map.graphJson) as KnowledgeGraphData;
    } catch {
      graph = buildKnowledgeGraph(workspace.title, map, conceptLinks);
    }
  } else {
    graph = buildKnowledgeGraph(workspace.title, map, conceptLinks);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back */}
      <Link
        href={`/workspaces/${workspaceId}`}
        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft size={13} />
        {workspace.title}
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Learning Map</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Project workflow, technical areas, and understanding checkpoints.
        </p>
      </div>

      {/* No map yet — create it */}
      {!map ? (
        <div className="bg-[#0d1117] border border-zinc-800 rounded-lg p-6 max-w-xl">
          <h2 className="text-sm font-semibold text-zinc-100 mb-1">
            Create Learning Map
          </h2>
          <p className="text-xs text-zinc-500 mb-4">
            Start by giving this map a name. Then add modules one by one.
            Tip: Import a project to get an auto-generated map instantly.
          </p>
          <CreateMapForm workspaceId={workspaceId} action={createMapAction} />
        </div>
      ) : (
        <>
          {/* Auto-generated notice */}
          {map.analysisRaw && (
            <div className="flex items-center gap-2 bg-violet-500/5 border border-violet-900/30 rounded-lg px-4 py-2.5">
              <Sparkles size={13} className="text-violet-400 shrink-0" />
              <span className="text-xs text-violet-300">
                Auto-generated from project analysis — modules show your project&apos;s technical structure and risk areas.
              </span>
            </div>
          )}

          {/* Map header */}
          <div className="bg-[#0d1117] border border-zinc-800 rounded-lg p-4">
            <h2 className="text-base font-semibold text-zinc-100">{map.title}</h2>
            {map.summary && (
              <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{map.summary}</p>
            )}
            {totalCheckpoints > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 rounded-full transition-all"
                    style={{
                      width: `${Math.round((completedCheckpoints / totalCheckpoints) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-zinc-500 shrink-0">
                  {completedCheckpoints}/{totalCheckpoints} checkpoints
                </span>
              </div>
            )}
          </div>

          {/* Interactive knowledge graph */}
          <KnowledgeGraphLoader data={graph} />

          {/* BM25 code search — only for code-analyzed projects */}
          {indexed && (
            <div className="space-y-2">
              <form method="GET" className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                  <input
                    name="q"
                    type="text"
                    defaultValue={q ?? ""}
                    placeholder="Search files — e.g. &quot;authentication&quot; or &quot;database query&quot;"
                    className="w-full bg-[#0a0c10] border border-zinc-800 rounded-lg pl-8 pr-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-700"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors shrink-0"
                >
                  Search
                </button>
                {q && (
                  <a
                    href={`/workspaces/${workspaceId}/learning-map`}
                    className="px-3 py-2 text-xs text-zinc-600 hover:text-zinc-400 rounded-lg transition-colors shrink-0 self-center"
                  >
                    clear
                  </a>
                )}
              </form>

              {searchResults && q && (
                <div className="bg-[#0a0c10] border border-zinc-800 rounded-lg overflow-hidden">
                  {searchResults.ok && searchResults.data.length > 0 ? (
                    <ul className="divide-y divide-zinc-800/60">
                      {searchResults.data.map((r) => (
                        <li key={r.filePath} className="px-4 py-2.5 flex items-center gap-3">
                          <span className="text-xs font-mono text-zinc-300 flex-1 truncate">{r.filePath}</span>
                          {r.layer && (
                            <span className="text-[10px] text-zinc-600 shrink-0">{r.layer}</span>
                          )}
                          <span className="text-[10px] text-cyan-700 font-mono shrink-0">
                            {r.score.toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-4 py-3 text-xs text-zinc-600">
                      No files matched &ldquo;{q}&rdquo; — try broader terms.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Suggested reading order (from topological sort — only for code-analyzed projects) */}
          {graph.readingOrder && graph.readingOrder.length > 0 && (
            <details className="group bg-[#0d1117] border border-zinc-800 rounded-lg overflow-hidden">
              <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none hover:bg-zinc-900/50 transition-colors list-none">
                <FileText size={13} className="text-cyan-500 shrink-0" />
                <span className="text-xs font-medium text-zinc-400">
                  Suggested Reading Order
                  <span className="ml-2 text-zinc-600 font-normal">
                    — start here when exploring this codebase
                  </span>
                </span>
                <span className="ml-auto text-xs text-zinc-600 group-open:hidden">show</span>
                <span className="ml-auto text-xs text-zinc-600 hidden group-open:block">hide</span>
              </summary>
              <div className="px-4 pb-4 border-t border-zinc-800">
                {graph.cycles && graph.cycles.length > 0 && (
                  <div className="mt-3 flex items-start gap-2 bg-amber-500/5 border border-amber-900/30 rounded px-3 py-2 text-xs text-amber-400/80">
                    <span className="shrink-0 mt-0.5">⚠</span>
                    <span>
                      {graph.cycles.length} circular import{graph.cycles.length > 1 ? "s" : ""} detected
                      — those files are excluded from the order below.
                    </span>
                  </div>
                )}
                <ol className="mt-3 space-y-1.5">
                  {graph.readingOrder.slice(0, READING_ORDER_MAX).map((file, i) => (
                    <li key={file} className="flex items-start gap-2.5 text-xs">
                      <span className="text-zinc-700 font-mono w-5 shrink-0 text-right">{i + 1}.</span>
                      <span className="text-zinc-400 font-mono">{file}</span>
                    </li>
                  ))}
                  {graph.readingOrder.length > READING_ORDER_MAX && (
                    <li className="flex items-start gap-2.5 text-xs">
                      <span className="text-zinc-700 font-mono w-5 shrink-0 text-right">…</span>
                      <span className="text-zinc-600">
                        and {graph.readingOrder.length - READING_ORDER_MAX} more files
                      </span>
                    </li>
                  )}
                </ol>
              </div>
            </details>
          )}

          {/* Modules */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-300">
                Modules
                <span className="ml-2 text-zinc-600 font-normal">
                  ({map.modules.length})
                </span>
              </h3>
            </div>

            {map.modules.length === 0 && (
              <p className="text-xs text-zinc-600 py-2">
                No modules yet — re-import this project to auto-generate them, or add your own in the
                &ldquo;Add your own&rdquo; section below.
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {map.modules.map((mod) => (
                <ModuleCard
                  key={mod.id}
                  module={mod}
                  mapId={map.id}
                  workspaceId={workspaceId}
                  related={relatedByModule.get(mod.key)}
                />
              ))}
            </div>
          </div>

          {/* Checkpoints */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-300">
              Understanding Checkpoints
              <span className="ml-2 text-zinc-600 font-normal text-xs">
                — what you must be able to explain
              </span>
            </h3>

            {map.checkpoints.length > 0 && (
              <ul className="space-y-2">
                {map.checkpoints.map((cp) => (
                  <li key={cp.id}>
                    <form action={toggleCheckpointAction} className="flex items-start gap-2">
                      <input type="hidden" name="mapId" value={map.id} />
                      <input type="hidden" name="checkpointId" value={cp.id} />
                      <input
                        type="hidden"
                        name="workspaceId"
                        value={workspaceId}
                      />
                      <button
                        type="submit"
                        className="shrink-0 mt-0.5 text-zinc-500 hover:text-cyan-400 transition-colors"
                      >
                        {cp.completed ? (
                          <CheckSquare size={15} className="text-emerald-400" />
                        ) : (
                          <Square size={15} />
                        )}
                      </button>
                      <span
                        className={`text-sm leading-relaxed ${
                          cp.completed
                            ? "line-through text-zinc-600"
                            : "text-zinc-300"
                        }`}
                      >
                        {cp.question}
                      </span>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Full analysis reference */}
          {map.analysisRaw && (
            <details className="group bg-[#0d1117] border border-zinc-800 rounded-lg overflow-hidden">
              <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none hover:bg-zinc-900/50 transition-colors list-none">
                <FileText size={13} className="text-zinc-500 shrink-0" />
                <span className="text-xs font-medium text-zinc-400">Full Project Analysis</span>
                <span className="ml-auto text-xs text-zinc-600 group-open:hidden">show</span>
                <span className="ml-auto text-xs text-zinc-600 hidden group-open:block">hide</span>
              </summary>
              <div className="px-4 pb-4 border-t border-zinc-800">
                <pre className="mt-3 text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed font-mono overflow-x-auto">
                  {map.analysisRaw}
                </pre>
              </div>
            </details>
          )}

          {/* Add your own — optional manual additions on top of the auto-generated map */}
          <div className="space-y-3 pt-4 border-t border-zinc-800/60">
            <div>
              <h3 className="text-sm font-medium text-zinc-400">Add your own</h3>
              <p className="text-xs text-zinc-600 mt-0.5">
                The map above is generated from the project automatically. Optionally add your own
                modules or checkpoints.
              </p>
            </div>
            <AddModuleForm
              workspaceId={workspaceId}
              mapId={map.id}
              action={addModuleAction}
            />
            <AddCheckpointForm
              workspaceId={workspaceId}
              mapId={map.id}
              action={addCheckpointAction}
            />
          </div>
        </>
      )}
    </div>
  );
}
