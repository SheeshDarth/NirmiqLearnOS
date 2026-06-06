import CreateWorkspaceForm from "@/components/workspace/CreateWorkspaceForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NewWorkspacePage() {
  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        href="/workspaces"
        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft size={13} />
        Back to Workspaces
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">New Workspace</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          A workspace is your learning environment for one project, topic, or
          goal.
        </p>
      </div>

      {/* Form */}
      <div className="bg-[#0d1117] border border-zinc-800 rounded-lg p-6">
        <CreateWorkspaceForm />
      </div>
    </div>
  );
}
