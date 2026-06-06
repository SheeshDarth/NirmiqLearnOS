export const dynamic = "force-dynamic";

import { Code2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { getAllConceptLinks } from "@/lib/services/concept-link.service";
import { listWorkspaces } from "@/lib/services/workspace.service";

export default async function GlobalDSABridgePage() {
  const [linksResult, wsResult] = await Promise.all([
    getAllConceptLinks(),
    listWorkspaces(),
  ]);

  const links = linksResult.ok ? linksResult.data : [];
  const workspaces = wsResult.ok ? wsResult.data : [];
  const wsMap = new Map(workspaces.map((w) => [w.id, w]));

  // Group by concept type across all workspaces
  const grouped = links.reduce<Record<string, typeof links>>((acc, link) => {
    const key = link.conceptType ?? "Uncategorised";
    acc[key] = acc[key] ?? [];
    acc[key].push(link);
    return acc;
  }, {});

  const sortedTypes = Object.entries(grouped).sort(
    ([, a], [, b]) => b.length - a.length
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">DSA Bridge</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Connect this feature to the fundamentals behind it.
        </p>
      </div>

      {links.length === 0 ? (
        <div className="bg-[#0d1117] border border-zinc-800 border-dashed rounded-lg p-10 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-violet-500/10 mb-4">
            <Code2 size={20} className="text-violet-400" />
          </div>
          <h2 className="text-sm font-semibold text-zinc-100 mb-1">
            No concept links yet
          </h2>
          <p className="text-xs text-zinc-500 mb-5 max-w-sm mx-auto">
            DSA Bridge maps your project features to underlying algorithms and
            data structures. Go to a workspace and start linking concepts.
          </p>
          <Link
            href="/workspaces"
            className="inline-block bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium px-4 py-2 rounded-md transition-colors"
          >
            Go to Workspaces
          </Link>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="flex items-center gap-4">
            <div className="bg-[#0d1117] border border-zinc-800 rounded-lg px-4 py-3 flex-1 text-center">
              <p className="text-2xl font-bold text-zinc-100">{links.length}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Total Links</p>
            </div>
            <div className="bg-[#0d1117] border border-violet-900/40 rounded-lg px-4 py-3 flex-1 text-center">
              <p className="text-2xl font-bold text-violet-400">
                {sortedTypes.length}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">Concept Types</p>
            </div>
            <div className="bg-[#0d1117] border border-zinc-800 rounded-lg px-4 py-3 flex-1 text-center">
              <p className="text-2xl font-bold text-zinc-100">
                {links.filter((l) => l.practiceTask).length}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">Practice Tasks</p>
            </div>
          </div>

          {/* Grouped by concept type */}
          <div className="space-y-6">
            {sortedTypes.map(([type, typeLinks]) => (
              <div key={type}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <h2 className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
                    {type}
                  </h2>
                  <span className="text-xs text-zinc-700">
                    {typeLinks.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {typeLinks.map((link) => {
                    const ws = wsMap.get(link.workspaceId);
                    return (
                      <Link
                        key={link.id}
                        href={`/workspaces/${link.workspaceId}/dsa-bridge`}
                        className="group flex items-start gap-3 bg-[#0d1117] border border-zinc-800 hover:border-zinc-700 rounded-lg px-4 py-3 transition-colors block"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-zinc-500 font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 truncate max-w-[160px]">
                              {link.projectFeature}
                            </span>
                            <ArrowRight size={11} className="text-zinc-700 shrink-0" />
                            <span className="text-sm font-medium text-zinc-100 group-hover:text-white">
                              {link.conceptName}
                            </span>
                          </div>
                          {ws && (
                            <p className="text-xs text-zinc-700 mt-1 font-mono">
                              {ws.title}
                            </p>
                          )}
                          {link.explanation && (
                            <p className="text-xs text-zinc-600 mt-0.5 line-clamp-1">
                              {link.explanation}
                            </p>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
