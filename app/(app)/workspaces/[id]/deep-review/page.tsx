import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Shield,
  FlaskConical,
  Activity,
  Network,
  Monitor,
  Server,
  Package,
  Rocket,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { getWorkspaceById } from "@/lib/services/workspace.service";
import { getLearningMapByWorkspaceId } from "@/lib/services/learning-map.service";
import type { SeniorReview } from "@/lib/services/senior-review.service";
import { LensCard } from "@/components/deep-review/LensCard";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const GRADE_STYLE: Record<string, string> = {
  A: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  B: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  C: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  D: "text-red-400 bg-red-500/10 border-red-500/30",
  F: "text-red-400 bg-red-500/10 border-red-500/30",
};

export default async function DeepReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const wsResult = await getWorkspaceById(id);
  if (!wsResult.ok) notFound();
  const ws = wsResult.data;

  const mapResult = await getLearningMapByWorkspaceId(id);
  let review: SeniorReview | null = null;
  if (mapResult.ok && mapResult.data?.seniorReviewJson) {
    try {
      review = JSON.parse(mapResult.data.seniorReviewJson) as SeniorReview;
    } catch {
      review = null; // corrupt blob — show the empty state instead of crashing
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link
        href={`/workspaces/${ws.id}`}
        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft size={13} />
        {ws.title}
      </Link>

      {!review ? (
        <div className="bg-[#0d1117] border border-zinc-800 rounded-lg p-10 text-center">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-cyan-500/10 mx-auto mb-4">
            <RefreshCw size={18} className="text-cyan-400" />
          </div>
          <h1 className="text-sm font-semibold text-zinc-100 mb-1">
            No senior review yet
          </h1>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-5">
            This workspace was analysed before the Deep Review engine existed
            (or the analysis could not read the source). Run{" "}
            <span className="text-zinc-300">Refresh Analysis</span> on the
            workspace page to generate it.
          </p>
          <Link
            href={`/workspaces/${ws.id}`}
            className="text-xs text-cyan-400 font-medium hover:text-cyan-300"
          >
            Back to workspace →
          </Link>
        </div>
      ) : (
        <>
          {/* Header with overall grade */}
          <div className="bg-[#0d1117] border border-zinc-800 rounded-lg p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-zinc-100 mb-1">
                  Deep Review
                </h1>
                <p className="text-sm text-zinc-500">{review.overall.summary}</p>
                <p className="text-xs text-zinc-700 mt-2">
                  {review.fileCount} files reviewed ·{" "}
                  {formatDate(review.generatedAt, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {review.truncated &&
                    " · ⚠️ large project — some files were not scanned"}
                </p>
              </div>
              <div
                className={`flex flex-col items-center justify-center w-16 h-16 rounded-lg border shrink-0 ${GRADE_STYLE[review.overall.grade]}`}
              >
                <span className="text-2xl font-bold">{review.overall.grade}</span>
                <span className="text-[10px] opacity-80">
                  {review.overall.score}/100
                </span>
              </div>
            </div>
          </div>

          {/* Workflow & stack — the "how it works" narrative */}
          <div className="bg-[#0d1117] border border-zinc-800 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-2">
              <Network size={15} className="text-cyan-400" />
              <h2 className="text-sm font-semibold text-zinc-100">
                Workflow &amp; Stack
              </h2>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-3">
              {review.feasibility.requestFlow}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {review.feasibility.stackNotes.map((note) => (
                <span
                  key={note}
                  className="text-[11px] text-zinc-400 bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5"
                >
                  {note}
                </span>
              ))}
            </div>
          </div>

          {/* Optional AI mentor narrative */}
          {review.aiNarrative && (
            <div className="bg-[#0d1117] border border-violet-900/50 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={15} className="text-violet-400" />
                <h2 className="text-sm font-semibold text-zinc-100">
                  Mentor&apos;s Note
                </h2>
                <span className="text-xs text-violet-500 bg-violet-500/10 px-2 py-0.5 rounded ml-auto">
                  AI — from findings only
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-line">
                {review.aiNarrative}
              </p>
            </div>
          )}

          {/* Lens grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <LensCard
              title="Security"
              icon={Shield}
              accent="text-red-400"
              score={review.security.score}
              findings={review.security.findings}
              stats={[
                { label: "files scanned", value: String(review.security.stats.filesScanned) },
                { label: "secret-like", value: String(review.security.stats.secretHits) },
                { label: "injection-pattern", value: String(review.security.stats.injectionHits) },
              ]}
            />
            <LensCard
              title="Testing & QA"
              icon={FlaskConical}
              accent="text-emerald-400"
              score={review.testing.score}
              findings={review.testing.findings}
              stats={[
                { label: "runner", value: review.testing.runner ?? "none" },
                { label: "test files", value: String(review.testing.testFileCount) },
                { label: "CI", value: review.testing.ciConfigs.length > 0 ? "yes" : "no" },
                { label: "TODOs", value: String(review.testing.todoCount) },
              ]}
            />
            <LensCard
              title="Code Health"
              icon={Activity}
              accent="text-amber-400"
              score={review.codeHealth.score}
              findings={review.codeHealth.findings}
              stats={[
                { label: "total LOC", value: review.codeHealth.totalLoc.toLocaleString() },
                { label: "avg LOC/file", value: String(review.codeHealth.avgLoc) },
                {
                  label: "most complex",
                  value: review.codeHealth.complexFunctions[0]
                    ? `${review.codeHealth.complexFunctions[0].name}() (${review.codeHealth.complexFunctions[0].complexity})`
                    : "n/a",
                },
              ]}
            />
            <LensCard
              title="Architecture"
              icon={Network}
              accent="text-cyan-400"
              score={review.architecture.score}
              findings={review.architecture.findings}
              stats={[
                { label: "routes", value: String(review.architecture.routes.length) },
                { label: "import cycles", value: String(review.architecture.circularImports.length) },
                { label: "client components", value: String(review.architecture.clientComponentCount) },
              ]}
            />
            {review.frontend.present && (
              <LensCard
                title="Frontend"
                icon={Monitor}
                accent="text-violet-400"
                score={review.frontend.score}
                findings={review.frontend.findings}
                stats={[
                  { label: "UI files", value: String(review.frontend.componentCount) },
                  { label: "client share", value: `${Math.round(review.frontend.clientShare * 100)}%` },
                  { label: "imgs w/o alt", value: String(review.frontend.imgWithoutAlt.length) },
                ]}
              />
            )}
            {review.backend.present && (
              <LensCard
                title="Backend"
                icon={Server}
                accent="text-emerald-400"
                score={review.backend.score}
                findings={review.backend.findings}
                stats={[
                  { label: "endpoints", value: String(review.backend.endpointCount) },
                  {
                    label: "validated boundaries",
                    value: `${review.backend.validatedBoundaries}/${review.backend.validatedBoundaries + review.backend.unvalidatedBoundaries}`,
                  },
                  { label: "DB-access files", value: String(review.backend.dbAccessFiles.length) },
                ]}
              />
            )}
            <LensCard
              title="Dependencies"
              icon={Package}
              accent="text-amber-400"
              score={review.dependencies.score}
              findings={review.dependencies.findings}
              stats={[
                { label: "prod", value: String(review.dependencies.prodCount) },
                { label: "dev", value: String(review.dependencies.devCount) },
                { label: "lockfile", value: review.dependencies.lockfileName ?? "none" },
                { label: "license", value: review.dependencies.license ?? "none" },
              ]}
            />
            <LensCard
              title="Feasibility"
              icon={Rocket}
              accent="text-cyan-400"
              score={review.feasibility.score}
              findings={review.feasibility.findings}
              stats={[
                { label: "runnable", value: review.feasibility.runnable ? "yes" : "unclear" },
                {
                  label: "scripts",
                  value: Object.keys(review.feasibility.scripts).slice(0, 4).join(", ") || "none",
                },
              ]}
            />
          </div>
        </>
      )}
    </div>
  );
}
