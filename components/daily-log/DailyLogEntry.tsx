"use client";

import { useState } from "react";
import { Trash2, ChevronDown, ChevronUp, AlertCircle, ArrowRight } from "lucide-react";
import type { DailyLog } from "@/lib/services/daily-log.service";

type Props = {
  log: DailyLog;
  deleteAction: () => Promise<void>;
};

export function DailyLogEntry({ log, deleteAction }: Props) {
  const [expanded, setExpanded] = useState(false);

  const hasDetails =
    log.understoodToday || log.unclearTopics || log.bugsFaced || log.nextAction;

  return (
    <div className="bg-[#0d1117] border border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-zinc-500">{log.date}</span>
            {log.unclearTopics && (
              <span className="flex items-center gap-1 text-xs text-amber-500/80">
                <AlertCircle size={11} />
                unclear
              </span>
            )}
          </div>
          {log.builtToday ? (
            <p className="text-sm text-zinc-200 leading-relaxed line-clamp-2">
              {log.builtToday}
            </p>
          ) : (
            <p className="text-sm text-zinc-600 italic">No build notes</p>
          )}
          {log.nextAction && !expanded && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <ArrowRight size={11} className="text-emerald-500 shrink-0" />
              <p className="text-xs text-emerald-400 line-clamp-1">
                {log.nextAction}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasDetails && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
          <form action={deleteAction}>
            <button
              type="submit"
              className="p-1.5 text-zinc-700 hover:text-red-400 transition-colors"
              title="Delete"
            >
              <Trash2 size={13} />
            </button>
          </form>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
          {log.understoodToday && (
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-1">
                Understood
              </p>
              <p className="text-sm text-zinc-300 leading-relaxed">
                {log.understoodToday}
              </p>
            </div>
          )}
          {log.unclearTopics && (
            <div className="bg-amber-500/5 border border-amber-900/30 rounded px-3 py-2.5">
              <p className="text-xs text-amber-400 uppercase tracking-wide font-medium mb-1">
                Still Unclear
              </p>
              <p className="text-sm text-amber-200/80">{log.unclearTopics}</p>
            </div>
          )}
          {log.bugsFaced && (
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-1">
                Bugs Faced
              </p>
              <p className="text-sm text-zinc-400">{log.bugsFaced}</p>
            </div>
          )}
          {log.nextAction && (
            <div className="flex items-start gap-2">
              <ArrowRight size={13} className="text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wide font-medium mb-0.5">
                  Next Action
                </p>
                <p className="text-sm text-emerald-300">{log.nextAction}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
