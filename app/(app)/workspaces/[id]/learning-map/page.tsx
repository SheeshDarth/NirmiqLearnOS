import { getLearningMapByWorkspaceId } from "@/lib/services/learning-map.service";
import { getWorkspaceById } from "@/lib/services/workspace.service";
import { getConceptLinksByWorkspaceId } from "@/lib/services/concept-link.service";
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

export const dynamic = "force-dynamic";

export default async function LearningMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: workspaceId } = await params;

  const [wsResult, mapResult, clResult] = await Promise.all([
    getWorkspaceById(workspaceId),
    getLearningMapByWorkspaceId(workspaceId),
    getConceptLinksByWorkspaceId(workspaceId),
  ]);

  if (!wsResult.ok) notFound();

  const workspace = wsResult.data;
  const map = mapResult.ok ? mapResult.data : null;
  const conceptLinks = clResult.ok ? clResult.data : [];

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
