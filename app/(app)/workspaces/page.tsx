import { listWorkspaces } from "@/lib/services/workspace.service";

export const dynamic = "force-dynamic";
import WorkspaceCard from "@/components/workspace/WorkspaceCard";
import { Plus, FolderOpen } from "lucide-react";
import Link from "next/link";

export default async function WorkspacesPage() {
  const result = await listWorkspaces();
  const items = result.ok ? result.data : [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Workspaces</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {items.length > 0
              ? `${items.length} workspace${items.length === 1 ? "" : "s"}`
              : "Each workspace is a learning environment for one project, topic, or goal."}
          </p>
        </div>
        <Link
          href="/workspaces/new"
          className="flex items-center gap-1.5 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-semibold px-3 py-2 rounded-md transition-colors"
        >
          <Plus size={13} />
          New Workspace
        </Link>
      </div>

      {/* Workspace grid */}
      {items.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((ws) => (
            <WorkspaceCard key={ws.id} workspace={ws} />
          ))}
        </div>
      ) : (
        <div className="bg-[#0d1117] border border-zinc-800 border-dashed rounded-lg p-10 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-800 mb-4">
            <FolderOpen size={20} className="text-zinc-500" />
          </div>
          <h2 className="text-sm font-semibold text-zinc-100 mb-1">
            No workspaces yet
          </h2>
          <p className="text-xs text-zinc-500 mb-5 max-w-xs mx-auto">
            Create your first workspace to start turning a project, topic, or
            exam into a structured study system.
          </p>
          <Link
            href="/workspaces/new"
            className="inline-block bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-semibold px-4 py-2 rounded-md transition-colors"
          >
            Create Workspace
          </Link>
        </div>
      )}
    </div>
  );
}
