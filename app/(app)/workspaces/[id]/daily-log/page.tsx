export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen } from "lucide-react";
import Link from "next/link";
import { getWorkspaceById } from "@/lib/services/workspace.service";
import { getDailyLogsByWorkspaceId } from "@/lib/services/daily-log.service";
import { CreateDailyLogForm } from "@/components/daily-log/CreateDailyLogForm";
import { DailyLogEntry } from "@/components/daily-log/DailyLogEntry";
import { createDailyLogAction, deleteDailyLogAction } from "./actions";

function todayISO(): string {
  return new Date().toISOString().split("T")[0]!;
}

export default async function DailyLogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [wsResult, logsResult] = await Promise.all([
    getWorkspaceById(id),
    getDailyLogsByWorkspaceId(id),
  ]);

  if (!wsResult.ok) notFound();

  const ws = wsResult.data;
  const logs = logsResult.ok ? logsResult.data : [];
  const today = todayISO();

  const hasLogToday = logs.some((l) => l.date === today);
  const boundCreate = createDailyLogAction.bind(null, id);

  const streakDates = new Set(logs.map((l) => l.date));
  const totalUnclear = logs.filter((l) => l.unclearTopics).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
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
          <BookOpen size={16} className="text-emerald-400" />
          <h1 className="text-lg font-semibold text-zinc-100">Daily Log</h1>
        </div>
        <p className="text-sm text-zinc-500">
          What did you build? What do you still not understand? One honest log
          per day compounds faster than any tutorial.
        </p>
      </div>

      {/* Stats */}
      {logs.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="bg-[#0d1117] border border-zinc-800 rounded-lg px-4 py-3 flex-1 text-center">
            <p className="text-2xl font-bold text-zinc-100">{logs.length}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Days Logged</p>
          </div>
          <div className="bg-[#0d1117] border border-zinc-800 rounded-lg px-4 py-3 flex-1 text-center">
            <p className="text-2xl font-bold text-emerald-400">
              {streakDates.size}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">Unique Dates</p>
          </div>
          <div className="bg-[#0d1117] border border-zinc-800 rounded-lg px-4 py-3 flex-1 text-center">
            <p className="text-2xl font-bold text-amber-400">{totalUnclear}</p>
            <p className="text-xs text-zinc-500 mt-0.5">Open Gaps</p>
          </div>
        </div>
      )}

      {/* Today banner if already logged */}
      {hasLogToday && (
        <div className="flex items-center gap-2 bg-emerald-500/5 border border-emerald-900/30 rounded-lg px-4 py-2.5">
          <span className="text-emerald-400 text-xs font-medium">
            ✓ Already logged today ({today})
          </span>
          <span className="text-xs text-zinc-600">
            — you can log again if needed
          </span>
        </div>
      )}

      {/* Create form */}
      <CreateDailyLogForm createAction={boundCreate} todayDate={today} />

      {/* Log list */}
      {logs.length === 0 ? (
        <div className="bg-[#0d1117] border border-zinc-800 border-dashed rounded-lg p-10 text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/10 mb-4">
            <BookOpen size={20} className="text-emerald-400" />
          </div>
          <h2 className="text-sm font-semibold text-zinc-100 mb-1">
            No daily logs yet
          </h2>
          <p className="text-xs text-zinc-500 max-w-xs mx-auto">
            Log today above. The habit of honest daily reflection is worth more
            than any AI shortcut.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const boundDelete = deleteDailyLogAction.bind(null, id, log.id);
            return (
              <DailyLogEntry key={log.id} log={log} deleteAction={boundDelete} />
            );
          })}
        </div>
      )}
    </div>
  );
}
