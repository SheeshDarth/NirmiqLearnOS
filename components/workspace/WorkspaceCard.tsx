import Link from "next/link";
import { FolderOpen, Code2, BookOpen, GraduationCap, Circle } from "lucide-react";
import type { Workspace } from "@/lib/services/workspace.service";

const TYPE_META: Record<
  Workspace["type"],
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  project: {
    label: "Project",
    icon: FolderOpen,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
  },
  dsa: {
    label: "DSA",
    icon: Code2,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
  },
  exam: {
    label: "Exam",
    icon: GraduationCap,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  topic: {
    label: "Topic",
    icon: BookOpen,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
};

const STATUS_COLOR: Record<Workspace["status"], string> = {
  active: "text-emerald-400",
  paused: "text-amber-400",
  completed: "text-cyan-400",
  archived: "text-zinc-600",
};

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function WorkspaceCard({ workspace }: { workspace: Workspace }) {
  const meta = TYPE_META[workspace.type];
  const Icon = meta.icon;

  return (
    <Link
      href={`/workspaces/${workspace.id}`}
      className="group block bg-[#0d1117] border border-zinc-800 hover:border-zinc-700 rounded-lg p-4 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-md ${meta.bg} shrink-0`}
          >
            <Icon size={15} className={meta.color} />
          </div>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded ${meta.bg} ${meta.color}`}
          >
            {meta.label}
          </span>
        </div>
        <span
          className={`flex items-center gap-1 text-xs ${STATUS_COLOR[workspace.status]}`}
        >
          <Circle size={6} fill="currentColor" />
          {workspace.status}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-white mb-1 leading-snug">
        {workspace.title}
      </h3>

      {/* Description */}
      {workspace.description && (
        <p className="text-xs text-zinc-500 line-clamp-2 mb-3">
          {workspace.description}
        </p>
      )}

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-zinc-600">Progress</span>
          <span className="text-xs text-zinc-500">{workspace.progressScore}%</span>
        </div>
        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-cyan-500 rounded-full transition-all"
            style={{ width: `${workspace.progressScore}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <p className="text-xs text-zinc-700">Created {formatDate(workspace.createdAt)}</p>
    </Link>
  );
}
