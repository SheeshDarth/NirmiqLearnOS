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
} from "lucide-react";
import Link from "next/link";

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

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

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

          <button
            disabled
            title="Export — available in Phase 8"
            className="flex items-center gap-1.5 text-xs text-zinc-600 px-3 py-2 rounded-md border border-zinc-800 cursor-not-allowed shrink-0"
          >
            <Download size={13} />
            Export
          </button>
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

        <p className="text-xs text-zinc-700 mt-3">Created {formatDate(ws.createdAt)}</p>
      </div>

      {/* Sections */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Learning Map */}
        <div className="bg-[#0d1117] border border-zinc-800 border-dashed rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Map size={15} className="text-cyan-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Learning Map</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Break this workspace into modules, concepts, and checkpoints.
          </p>
          <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-1 rounded">
            Available in Phase 4
          </span>
        </div>

        {/* Explain-Back */}
        <div className="bg-[#0d1117] border border-zinc-800 border-dashed rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare size={15} className="text-violet-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Explain-Back</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Answer questions about this workspace until you can explain it cold.
          </p>
          <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-1 rounded">
            Available in Phase 5
          </span>
        </div>

        {/* Debug Lab */}
        <div className="bg-[#0d1117] border border-zinc-800 border-dashed rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <Bug size={15} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Debug Lab</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            Log every bug, record the fix, and extract the lesson so it never costs twice.
          </p>
          <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-1 rounded">
            Available in Phase 6
          </span>
        </div>

        {/* Daily Log */}
        <div className="bg-[#0d1117] border border-zinc-800 border-dashed rounded-lg p-5">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={15} className="text-emerald-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Daily Log</h2>
          </div>
          <p className="text-xs text-zinc-500 mb-3">
            What did you build? What is still unclear? What is next?
          </p>
          <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-1 rounded">
            Available in Phase 6
          </span>
        </div>
      </div>
    </div>
  );
}
