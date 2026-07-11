import type { LucideIcon } from "lucide-react";
import type { LensFinding, LensScore } from "@/lib/services/senior-review.service";

const GRADE_STYLE: Record<LensScore["grade"], string> = {
  A: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  B: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  C: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  D: "text-red-400 bg-red-500/10 border-red-500/30",
  F: "text-red-400 bg-red-500/10 border-red-500/30",
};

const SEVERITY_STYLE: Record<LensFinding["severity"], string> = {
  critical: "text-red-400 bg-red-500/10",
  high: "text-red-400 bg-red-500/10",
  medium: "text-amber-400 bg-amber-500/10",
  low: "text-zinc-400 bg-zinc-500/10",
  info: "text-cyan-400 bg-cyan-500/10",
};

function FindingRow({ finding }: { finding: LensFinding }) {
  return (
    <div className="border border-zinc-800/70 rounded-md p-3 space-y-1.5">
      <div className="flex items-start gap-2">
        <span
          className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${SEVERITY_STYLE[finding.severity]}`}
        >
          {finding.severity}
        </span>
        <p className="text-xs font-medium text-zinc-200 leading-snug">
          {finding.title}
        </p>
      </div>
      <p className="text-xs text-zinc-500 leading-relaxed">{finding.detail}</p>
      {finding.file && (
        <p className="text-[11px] font-mono text-zinc-600">
          {finding.file}
          {finding.line ? `:${finding.line}` : ""}
        </p>
      )}
      {finding.snippet && (
        <pre className="text-[11px] font-mono text-zinc-400 bg-zinc-900/80 border border-zinc-800 rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
          {finding.snippet}
        </pre>
      )}
      {finding.recommendation && (
        <p className="text-xs text-emerald-500/90">→ {finding.recommendation}</p>
      )}
    </div>
  );
}

export function LensCard({
  title,
  icon: Icon,
  accent,
  score,
  findings,
  stats,
}: {
  title: string;
  icon: LucideIcon;
  accent: string; // tailwind text color class, e.g. "text-red-400"
  score: LensScore;
  findings: LensFinding[];
  stats: Array<{ label: string; value: string }>;
}) {
  const topFindings = findings.slice(0, 5);
  const rest = findings.slice(5);

  return (
    <div className="bg-[#0d1117] border border-zinc-800 rounded-lg p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon size={15} className={accent} />
        <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
        <span
          className={`ml-auto text-sm font-bold w-8 h-8 flex items-center justify-center rounded-md border ${GRADE_STYLE[score.grade]}`}
          title={`${score.score}/100`}
        >
          {score.grade}
        </span>
      </div>

      <p className="text-xs text-zinc-500">{score.summary}</p>

      {stats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {stats.map((s) => (
            <span
              key={s.label}
              className="text-[11px] text-zinc-400 bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5"
            >
              <span className="text-zinc-600">{s.label}:</span> {s.value}
            </span>
          ))}
        </div>
      )}

      {topFindings.length > 0 && (
        <div className="space-y-2">
          {topFindings.map((f, i) => (
            <FindingRow key={`${f.id}-${i}`} finding={f} />
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <details className="group">
          <summary className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer select-none">
            {rest.length} more finding(s) …
          </summary>
          <div className="space-y-2 mt-2">
            {rest.map((f, i) => (
              <FindingRow key={`${f.id}-rest-${i}`} finding={f} />
            ))}
          </div>
        </details>
      )}

      {findings.length === 0 && (
        <p className="text-xs text-emerald-500/80">
          ✓ Nothing flagged by this lens.
        </p>
      )}
    </div>
  );
}
