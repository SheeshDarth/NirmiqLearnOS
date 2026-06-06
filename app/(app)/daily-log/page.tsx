export const dynamic = "force-dynamic";

import { BookOpen, AlertCircle, ArrowRight } from "lucide-react";
import Link from "next/link";
import { getAllDailyLogs } from "@/lib/services/daily-log.service";
import { listWorkspaces } from "@/lib/services/workspace.service";

export default async function GlobalDailyLogPage() {
  const [logsResult, wsResult] = await Promise.all([
    getAllDailyLogs(),
    listWorkspaces(),
  ]);

  const logs = logsResult.ok ? logsResult.data : [];
  const workspaces = wsResult.ok ? wsResult.data : [];
  const wsMap = new Map(workspaces.map((w) => [w.id, w]));

  const unclearCount = logs.filter((l) => l.unclearTopics).length;
  const uniqueDates = new Set(logs.map((l) => l.date)).size;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-zinc-100">Daily Log</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          What did you build? What do you still not understand?
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="bg-[#0d1117] border border-zinc-800 border-dashed rounded-lg p-10 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/10 mb-4">
            <BookOpen size={20} className="text-emerald-400" />
          </div>
          <h2 className="text-sm font-semibold text-zinc-100 mb-1">
            No daily logs yet
          </h2>
          <p className="text-xs text-zinc-500 mb-5 max-w-sm mx-auto">
            Log what you built, what you understood, what is still unclear, and
            your next action. One log per day keeps the viva panic away.
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
              <p className="text-2xl font-bold text-zinc-100">{logs.length}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Total Entries</p>
            </div>
            <div className="bg-[#0d1117] border border-emerald-900/40 rounded-lg px-4 py-3 flex-1 text-center">
              <p className="text-2xl font-bold text-emerald-400">
                {uniqueDates}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">Unique Days</p>
            </div>
            <div className="bg-[#0d1117] border border-zinc-800 rounded-lg px-4 py-3 flex-1 text-center">
              <p className="text-2xl font-bold text-amber-400">{unclearCount}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Open Gaps</p>
            </div>
          </div>

          {/* Log list */}
          <div className="space-y-2">
            {logs.map((log) => {
              const ws = wsMap.get(log.workspaceId);
              return (
                <Link
                  key={log.id}
                  href={`/workspaces/${log.workspaceId}/daily-log`}
                  className="group block bg-[#0d1117] border border-zinc-800 hover:border-zinc-700 rounded-lg px-4 py-3 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-zinc-500">
                          {log.date}
                        </span>
                        {ws && (
                          <span className="text-xs text-zinc-700 font-mono truncate">
                            {ws.title}
                          </span>
                        )}
                        {log.unclearTopics && (
                          <span className="flex items-center gap-1 text-xs text-amber-500/80">
                            <AlertCircle size={11} />
                            unclear
                          </span>
                        )}
                      </div>
                      {log.builtToday && (
                        <p className="text-sm text-zinc-300 line-clamp-2 group-hover:text-zinc-100">
                          {log.builtToday}
                        </p>
                      )}
                      {log.nextAction && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <ArrowRight size={11} className="text-emerald-500 shrink-0" />
                          <p className="text-xs text-emerald-400 line-clamp-1">
                            {log.nextAction}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
