import { getWorkspaceById } from "@/lib/services/workspace.service";

export const dynamic = "force-dynamic";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  FolderOpen,
  Code2,
  BookOpen,
  GraduationCap,
  Circle,
  Map,
  MessageSquare,
  Bug,
  Download,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { DeleteWorkspaceButton } from "@/components/workspace/DeleteWorkspaceButton";
import { RefreshAnalysisButton } from "@/components/workspace/RefreshAnalysisButton";

const TYPE_META = {
  project: { label: "Project", icon: FolderOpen, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  dsa: { label: "DSA", icon: Code2, color: "text-violet-400", bg: "bg-violet-500/10" },
  exam: { label: "Exam", icon: GraduationCap, color: "text-amber-400", bg: "bg-amber-500/10" },
  topic: { label: "Topic", icon: BookOpen, color: "text-emerald-400", bg: "bg-emerald-500/10" },
} as const;

const STATUS_COLOR = {
  active: "text-emerald-400",
  paused: "text-amber-400",
  completed: "text-cyan-400",
  archived: "text-zinc-600",
} as const;

export default async function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getWorkspaceById(id);

  if (!result.ok) notFound();

  const ws = result.data;
  const meta = TYPE_META[ws.type];
  const Icon = meta.icon;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back */}
      <Link
        href="/workspaces"
        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft size={13} />
        All Workspaces
      </Link>

      {/* Header */}
      <div className="bg-[#0d1117] border border-zinc-800 rounded-lg p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${meta.bg} shrink-0`}>
              <Icon size={18} className={meta.color} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${meta.bg} ${meta.color}`}>
                  {meta.label}
                </span>
                <span className={`flex items-center gap-1 text-xs ${STATUS_COLOR[ws.status]}`}>
                  <Circle size={6} fill="currentColor" />
                  {ws.status}
                </span>
              </div>
              <h1 className="text-xl font-bold text-zinc-100">{ws.title}</h1>
              {ws.description && (
                <p className="text-sm text-zinc-500 mt-1">{ws.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={`/workspaces/${ws.id}/export`}
              download
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 px-3 py-2 rounded-md border border-zinc-800 hover:border-zinc-600 transition-colors shrink-0"
              title="Download workspace as Markdown"
            >
              <Download size={13} />
              Export
            </a>
            {ws.description?.startsWith("Imported from: ") && (
              <RefreshAnalysisButton workspaceId={ws.id} />
            )}
            <DeleteWorkspaceButton workspaceId={ws.id} />
          </div>
        </div>

        {ws.goal && (
          <div className="mt-4 pt-4 border-t border-zinc-800">
            <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-1">
              Goal
            </p>
            <p className="text-sm text-zinc-300">{ws.goal}</p>
          </div>
        )}

        {/* Progress */}
        <div className="mt-4 pt-4 border-t border-zinc-800">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-zinc-500">Overall Progress</span>
            <span className="text-xs font-semibold text-zinc-300">{ws.progressScore}%</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 rounded-full transition-all"
              style={{ width: `${ws.progressScore}%` }}
            />
          </div>
        </div>

        <p className="text-xs text-zinc-700 mt-3">Created {formatDate(ws.createdAt, { month: "long", day: "numeric", year: "numeric" })}</p>
      </div>

      {/* Sections */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Learning Map — live */}
        <Link
          href={`/workspaces/${ws.id}/learning-map`}
          className="group bg-[#0d1117] border border-zinc-800 hover:border-zinc-700 rounded-lg p-5 transition-colors block"
        >
          <div className="flex items-center gap-2 mb-2">
            <Map size={15} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-zinc-100 group-hover:text-white">
              Learning Map
            </h2>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Break this workspace into modules, concepts, and checkpoints.
          </p>
          <span className="text-xs text-cyan-400 font-medium">
            Open →
          </span>
        </Link>

        {/* Explain-Back — live */}
        <Link
          href={`/workspaces/${ws.id}/explain-back`}
          className="group bg-[#0d1117] border border-zinc-800 hover:border-zinc-700 rounded-lg p-5 transition-colors block"
        >
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare size={15} className="text-violet-400" />
            <h2 className="text-sm font-semibold text-zinc-100 group-hover:text-white">
              Explain-Back
            </h2>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Answer questions about this workspace until you can explain it cold.
          </p>
          <span className="text-xs text-violet-400 font-medium">Open →</span>
        </Link>

        {/* Debug Lab — live */}
        <Link
          href={`/workspaces/${ws.id}/debug-lab`}
          className="group bg-[#0d1117] border border-zinc-800 hover:border-zinc-700 rounded-lg p-5 transition-colors block"
        >
          <div className="flex items-center gap-2 mb-2">
            <Bug size={15} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-zinc-100 group-hover:text-white">
              Debug Lab
            </h2>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Log every bug, record the fix, and extract the lesson so it never costs twice.
          </p>
          <span className="text-xs text-amber-400 font-medium">Open →</span>
        </Link>

        {/* Daily Log — live */}
        <Link
          href={`/workspaces/${ws.id}/daily-log`}
          className="group bg-[#0d1117] border border-zinc-800 hover:border-zinc-700 rounded-lg p-5 transition-colors block"
        >
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={15} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-zinc-100 group-hover:text-white">
              Daily Log
            </h2>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            What did you build? What is still unclear? What is next?
          </p>
          <span className="text-xs text-emerald-400 font-medium">Open →</span>
        </Link>

        {/* DSA Bridge — live */}
        <Link
          href={`/workspaces/${ws.id}/dsa-bridge`}
          className="group bg-[#0d1117] border border-zinc-800 hover:border-zinc-700 rounded-lg p-5 transition-colors block"
        >
          <div className="flex items-center gap-2 mb-2">
            <Code2 size={15} className="text-violet-400" />
            <h2 className="text-sm font-semibold text-zinc-100 group-hover:text-white">
              DSA Bridge
            </h2>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Map every feature to its underlying concept, and build a personal practice queue.
          </p>
          <span className="text-xs text-violet-400 font-medium">Open →</span>
        </Link>

        {/* Session Log — vibe coding companion */}
        <Link
          href={`/workspaces/${ws.id}/session-log`}
          className="group bg-[#0d1117] border border-cyan-900/40 hover:border-cyan-800/60 rounded-lg p-5 transition-colors block sm:col-span-2"
        >
          <div className="flex items-center gap-2 mb-2">
            <Activity size={15} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-zinc-100 group-hover:text-white">
              Session Log
            </h2>
            <span className="text-xs text-cyan-600 bg-cyan-500/10 px-2 py-0.5 rounded ml-auto">
              vibe coding companion
            </span>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Every command your AI assistant ran — explained in plain English. Know what was built and why,
            even if you just clicked &ldquo;Allow&rdquo; without reading it.
          </p>
          <span className="text-xs text-cyan-400 font-medium">Open →</span>
        </Link>
      </div>
    </div>
  );
}
