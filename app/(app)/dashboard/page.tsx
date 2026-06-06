export const dynamic = "force-dynamic";

import {
  FolderOpen,
  MessageSquare,
  Bug,
  TrendingUp,
  AlertCircle,
  Code2,
  BookOpen,
  ArrowRight,
  Circle,
} from "lucide-react";
import Link from "next/link";
import { listWorkspaces } from "@/lib/services/workspace.service";
import { getAllQuestions } from "@/lib/services/explain-back.service";
import { getAllDebugLogs } from "@/lib/services/debug-log.service";
import { getAllConceptLinks } from "@/lib/services/concept-link.service";

const STATUS_COLOR = {
  active: "text-emerald-400",
  paused: "text-amber-400",
  completed: "text-cyan-400",
  archived: "text-zinc-600",
} as const;

const TYPE_COLOR: Record<string, string> = {
  project: "text-cyan-400",
  dsa: "text-violet-400",
  exam: "text-amber-400",
  topic: "text-emerald-400",
};

export default async function DashboardPage() {
  const [wsResult, qResult, dbResult, dlResult] = await Promise.all([
    listWorkspaces(),
    getAllQuestions(),
    getAllDebugLogs(),
    getAllConceptLinks(),
  ]);

  const workspaces = wsResult.ok ? wsResult.data : [];
  const questions = qResult.ok ? qResult.data : [];
  const debugLogs = dbResult.ok ? dbResult.data : [];
  const conceptLinks = dlResult.ok ? dlResult.data : [];

  const activeWs = workspaces.filter((w) => w.status === "active");
  const answeredQs = questions.filter((q) => q.userAnswer);
  const confidentQs = questions.filter((q) => q.confidence === "green");
  const weakQs = questions.filter((q) => q.confidence === "red");
  const confPct =
    answeredQs.length > 0
      ? Math.round((confidentQs.length / answeredQs.length) * 100)
      : null;

  const recentWs = workspaces.slice(0, 4);
  const isEmpty = workspaces.length === 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Your project is not mastered until you can explain it without AI.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Active Workspaces */}
        <Link
          href="/workspaces"
          className="group bg-[#0d1117] border border-zinc-800 hover:border-zinc-700 rounded-lg p-4 space-y-2 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
              Active Workspaces
            </span>
            <FolderOpen size={14} className="text-cyan-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-cyan-400">
            {activeWs.length}
            <span className="text-sm text-zinc-600 font-normal ml-1">
              / {workspaces.length}
            </span>
          </p>
          <p className="text-xs text-zinc-600">
            {workspaces.length === 0
              ? "No workspaces yet"
              : `${workspaces.length} total workspace${workspaces.length !== 1 ? "s" : ""}`}
          </p>
        </Link>

        {/* Explain-Back */}
        <Link
          href="/explain-back"
          className="group bg-[#0d1117] border border-zinc-800 hover:border-zinc-700 rounded-lg p-4 space-y-2 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
              Explain-Back
            </span>
            <MessageSquare size={14} className="text-violet-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-violet-400">
            {questions.length > 0 ? `${answeredQs.length}/${questions.length}` : "—"}
          </p>
          <p className="text-xs text-zinc-600">
            {questions.length === 0
              ? "No questions yet"
              : `${answeredQs.length} answered`}
          </p>
        </Link>

        {/* Confidence */}
        <div className="bg-[#0d1117] border border-zinc-800 rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
              Confidence
            </span>
            <TrendingUp size={14} className="text-emerald-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-emerald-400">
            {confPct !== null ? `${confPct}%` : "—"}
          </p>
          <p className="text-xs text-zinc-600">
            {answeredQs.length === 0
              ? "Answer questions to score"
              : `${confidentQs.length} confident, ${weakQs.length} weak`}
          </p>
        </div>

        {/* Weak Concepts */}
        <Link
          href="/explain-back"
          className="group bg-[#0d1117] border border-zinc-800 hover:border-zinc-700 rounded-lg p-4 space-y-2 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
              Weak Areas
            </span>
            <AlertCircle size={14} className="text-red-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-red-400">
            {weakQs.length > 0 ? weakQs.length : questions.length > 0 ? "0" : "—"}
          </p>
          <p className="text-xs text-zinc-600">
            {weakQs.length === 0 && questions.length === 0
              ? "No questions yet"
              : weakQs.length === 0
              ? "All clear"
              : `${weakQs.length} question${weakQs.length !== 1 ? "s" : ""} need work`}
          </p>
        </Link>

        {/* Debug Lessons */}
        <Link
          href={activeWs[0] ? `/workspaces/${activeWs[0].id}/debug-lab` : "/workspaces"}
          className="group bg-[#0d1117] border border-zinc-800 hover:border-zinc-700 rounded-lg p-4 space-y-2 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
              Debug Lessons
            </span>
            <Bug size={14} className="text-amber-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-amber-400">
            {debugLogs.length}
          </p>
          <p className="text-xs text-zinc-600">
            {debugLogs.length === 0
              ? "No bugs logged yet"
              : `${debugLogs.length} bug${debugLogs.length !== 1 ? "s" : ""} documented`}
          </p>
        </Link>

        {/* DSA Bridge */}
        <Link
          href="/dsa-bridge"
          className="group bg-[#0d1117] border border-zinc-800 hover:border-zinc-700 rounded-lg p-4 space-y-2 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
              DSA Links
            </span>
            <Code2 size={14} className="text-violet-400" />
          </div>
          <p className="text-2xl font-bold tracking-tight text-violet-400">
            {conceptLinks.length}
          </p>
          <p className="text-xs text-zinc-600">
            {conceptLinks.length === 0
              ? "No concepts linked yet"
              : `${conceptLinks.length} concept${conceptLinks.length !== 1 ? "s" : ""} mapped`}
          </p>
        </Link>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="bg-[#0d1117] border border-zinc-800 border-dashed rounded-lg p-10 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-cyan-500/10 mb-4">
            <FolderOpen size={20} className="text-cyan-400" />
          </div>
          <h2 className="text-sm font-semibold text-zinc-100 mb-1">
            Create your first workspace
          </h2>
          <p className="text-xs text-zinc-500 mb-5 max-w-sm mx-auto">
            A workspace is your learning environment for one project, topic, or
            exam. Once created it becomes your full study system.
          </p>
          <Link
            href="/workspaces/new"
            className="inline-block bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-semibold px-4 py-2 rounded-md transition-colors"
          >
            New Workspace
          </Link>
        </div>
      )}

      {/* Recent workspaces */}
      {recentWs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs text-zinc-500 uppercase tracking-wide font-medium">
              Recent Workspaces
            </h2>
            <Link
              href="/workspaces"
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1"
            >
              All <ArrowRight size={11} />
            </Link>
          </div>
          <div className="space-y-2">
            {recentWs.map((ws) => (
              <Link
                key={ws.id}
                href={`/workspaces/${ws.id}`}
                className="group flex items-center justify-between bg-[#0d1117] border border-zinc-800 hover:border-zinc-700 rounded-lg px-4 py-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Circle
                    size={7}
                    className={STATUS_COLOR[ws.status]}
                    fill="currentColor"
                  />
                  <div>
                    <p className="text-sm text-zinc-200 font-medium group-hover:text-white">
                      {ws.title}
                    </p>
                    {ws.description && (
                      <p className="text-xs text-zinc-600 mt-0.5 line-clamp-1">
                        {ws.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`text-xs font-medium ${TYPE_COLOR[ws.type] ?? "text-zinc-400"}`}
                  >
                    {ws.type}
                  </span>
                  {ws.progressScore > 0 && (
                    <span className="text-xs text-zinc-600">
                      {ws.progressScore}%
                    </span>
                  )}
                  <BookOpen
                    size={13}
                    className="text-zinc-700 group-hover:text-zinc-500 transition-colors"
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Weak questions callout */}
      {weakQs.length > 0 && (
        <div className="bg-red-500/5 border border-red-900/30 rounded-lg px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle size={14} className="text-red-400" />
                <p className="text-sm font-semibold text-zinc-100">
                  {weakQs.length} weak area{weakQs.length !== 1 ? "s" : ""} need attention
                </p>
              </div>
              <p className="text-xs text-zinc-500">
                You marked these explain-back questions as not confident. Go back and nail them before your viva.
              </p>
            </div>
            <Link
              href="/explain-back"
              className="text-xs text-red-400 hover:text-red-300 font-medium whitespace-nowrap shrink-0 transition-colors"
            >
              Review →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
