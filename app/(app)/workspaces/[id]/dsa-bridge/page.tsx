export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { ArrowLeft, Code2, BookOpen } from "lucide-react";
import Link from "next/link";
import { getWorkspaceById } from "@/lib/services/workspace.service";
import { getConceptLinksByWorkspaceId } from "@/lib/services/concept-link.service";
import { getLearningMapByWorkspaceId } from "@/lib/services/learning-map.service";
import { AddConceptLinkForm } from "@/components/dsa-bridge/AddConceptLinkForm";
import { ConceptLinkCard } from "@/components/dsa-bridge/ConceptLinkCard";
import {
  createConceptLinkAction,
  deleteConceptLinkAction,
} from "./actions";

export default async function DSABridgePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [wsResult, linksResult, mapResult] = await Promise.all([
    getWorkspaceById(id),
    getConceptLinksByWorkspaceId(id),
    getLearningMapByWorkspaceId(id),
  ]);

  if (!wsResult.ok) notFound();

  const ws = wsResult.data;
  const links = linksResult.ok ? linksResult.data : [];
  const howItWorksModule = mapResult.ok && mapResult.data
    ? mapResult.data.modules.find((m) => m.title.toLowerCase().includes("how it works"))
    : null;

  // Code-grounded findings (real DSA detected in the source, carrying a file
  // reference) are the point of this page — lead with them. Generic CS/stack
  // concepts (no source file) are demoted to a secondary section below.
  const codeGrounded = links.filter((l) => l.sourceFile);
  const conceptual = links.filter((l) => !l.sourceFile);

  // Group the code-grounded findings by concept type (Data Structure, Algorithm…)
  const grouped = codeGrounded.reduce<Record<string, typeof links>>((acc, link) => {
    const key = link.conceptType ?? "Uncategorised";
    acc[key] = acc[key] ?? [];
    acc[key].push(link);
    return acc;
  }, {});

  const hasPracticeTasks = links.some((l) => l.practiceTask);
  const boundCreateAction = createConceptLinkAction.bind(null, id);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <Link
        href={`/workspaces/${id}`}
        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft size={13} />
        {ws.title}
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Code2 size={16} className="text-violet-400" />
          <h1 className="text-lg font-semibold text-zinc-100">DSA Bridge</h1>
        </div>
        <p className="text-sm text-zinc-500">
          The data structures &amp; algorithms actually detected in your code — each paired with
          the core CS concept behind it and the exact spot it shows up. Own the theory, not just the code.
        </p>
      </div>

      {/* Architecture context from project analysis */}
      {howItWorksModule && (
        <details className="group bg-[#0d1117] border border-violet-900/30 rounded-lg overflow-hidden">
          <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none hover:bg-zinc-900/50 transition-colors list-none">
            <Code2 size={13} className="text-violet-400 shrink-0" />
            <span className="text-xs font-medium text-violet-300">Architecture Context — how this project works</span>
            <span className="ml-auto text-xs text-zinc-600 group-open:hidden">show</span>
            <span className="ml-auto text-xs text-zinc-600 hidden group-open:block">hide</span>
          </summary>
          <div className="px-4 pb-4 border-t border-violet-900/30">
            <p className="mt-3 text-xs text-zinc-400 whitespace-pre-line leading-relaxed">
              {howItWorksModule.summary}
            </p>
          </div>
        </details>
      )}

      {/* Stats row */}
      {links.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="bg-[#0d1117] border border-zinc-800 rounded-lg px-4 py-3 flex-1 text-center">
            <p className="text-2xl font-bold text-zinc-100">{codeGrounded.length}</p>
            <p className="text-xs text-zinc-500 mt-0.5">DSA in your code</p>
          </div>
          <div className="bg-[#0d1117] border border-violet-900/40 rounded-lg px-4 py-3 flex-1 text-center">
            <p className="text-2xl font-bold text-violet-400">
              {Object.keys(grouped).length}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">Categories</p>
          </div>
          <div className="bg-[#0d1117] border border-zinc-800 rounded-lg px-4 py-3 flex-1 text-center">
            <p className="text-2xl font-bold text-zinc-100">
              {links.filter((l) => l.practiceTask).length}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">Practice Tasks</p>
          </div>
        </div>
      )}

      {/* Link list */}
      {links.length === 0 ? (
        <div className="bg-[#0d1117] border border-zinc-800 border-dashed rounded-lg p-10 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-violet-500/10 mb-4">
            <Code2 size={20} className="text-violet-400" />
          </div>
          <h2 className="text-sm font-semibold text-zinc-100 mb-1">
            No concept links yet
          </h2>
          <p className="text-xs text-zinc-500 max-w-xs mx-auto">
            Re-import this project to auto-generate concept links, or add your own in the
            &ldquo;Add your own&rdquo; section below.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Primary: real DSA found in the code */}
          {codeGrounded.length > 0 && (
            <div className="space-y-6">
              {Object.entries(grouped).map(([type, typeLinks]) => (
                <div key={type}>
                  <h2 className="text-xs text-zinc-600 uppercase tracking-wide font-medium mb-2 px-1">
                    {type}
                  </h2>
                  <div className="space-y-2">
                    {typeLinks.map((link) => {
                      const boundDelete = deleteConceptLinkAction.bind(null, id, link.id);
                      return (
                        <ConceptLinkCard
                          key={link.id}
                          link={link}
                          deleteAction={boundDelete}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {codeGrounded.length === 0 && (
            <p className="text-xs text-zinc-500 bg-[#0d1117] border border-zinc-800 border-dashed rounded-lg p-4">
              No data structures or algorithms were auto-detected in this project&apos;s source.
              Re-import to re-scan, or add your own concept links below.
            </p>
          )}

          {/* Secondary: generic CS/stack concepts, not tied to a specific line */}
          {conceptual.length > 0 && (
            <details className="group bg-[#0d1117] border border-zinc-800 rounded-lg overflow-hidden">
              <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none hover:bg-zinc-900/50 transition-colors list-none">
                <BookOpen size={13} className="text-zinc-500 shrink-0" />
                <span className="text-xs font-medium text-zinc-300">
                  CS concepts from your stack ({conceptual.length})
                </span>
                <span className="ml-auto text-xs text-zinc-600 group-open:hidden">show</span>
                <span className="ml-auto text-xs text-zinc-600 hidden group-open:block">hide</span>
              </summary>
              <div className="px-4 pb-4 pt-1 space-y-2 border-t border-zinc-800">
                {conceptual.map((link) => {
                  const boundDelete = deleteConceptLinkAction.bind(null, id, link.id);
                  return (
                    <ConceptLinkCard
                      key={link.id}
                      link={link}
                      deleteAction={boundDelete}
                    />
                  );
                })}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Practice task list */}
      {hasPracticeTasks && (
        <div className="bg-[#0d1117] border border-violet-900/30 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <Code2 size={14} className="text-violet-400" />
            <h2 className="text-sm font-semibold text-zinc-100">
              Your Practice Queue
            </h2>
          </div>
          <div className="space-y-2">
            {links
              .filter((l) => l.practiceTask)
              .map((l) => (
                <div
                  key={l.id}
                  className="flex items-start gap-2 text-xs text-zinc-400"
                >
                  <span className="text-violet-500 mt-0.5 shrink-0">→</span>
                  <span>
                    <span className="text-zinc-600 font-mono mr-1.5">
                      [{l.conceptName}]
                    </span>
                    {l.practiceTask}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Add your own — optional manual concept links on top of the auto-generated ones */}
      <div className="space-y-3 pt-4 border-t border-zinc-800/60">
        <div>
          <h2 className="text-sm font-medium text-zinc-400">Add your own</h2>
          <p className="text-xs text-zinc-600 mt-0.5">
            Concept links are generated from the project automatically. Optionally link your own.
          </p>
        </div>
        <AddConceptLinkForm createAction={boundCreateAction} />
      </div>
    </div>
  );
}
