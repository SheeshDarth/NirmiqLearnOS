"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ArrowLeft,
  GitBranch,
  FolderOpen,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { importProjectAction, type ImportState } from "./actions";

const INITIAL: ImportState = { status: "idle" };

const EXAMPLES = [
  "https://github.com/your-username/your-repo",
  "https://github.com/vercel/next.js",
  "C:\\Users\\you\\Projects\\my-app",
];

export default function ImportProjectPage() {
  const router = useRouter();
  const [state, action, pending] = useActionState(importProjectAction, INITIAL);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Derive GitHub detection directly — no effect needed
  const isGitHub: boolean | null = inputValue
    ? inputValue.startsWith("https://github.com/") || inputValue.startsWith("github.com/")
    : null;

  // Redirect immediately on success — the action already returns the workspaceId.
  useEffect(() => {
    if (state.status === "success") {
      router.push(`/workspaces/${state.workspaceId}`);
    }
  }, [state, router]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back */}
      <Link
        href="/workspaces"
        className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <ArrowLeft size={13} />
        Workspaces
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={16} className="text-violet-400" />
          <h1 className="text-lg font-semibold text-zinc-100">Import Project</h1>
        </div>
        <p className="text-sm text-zinc-500">
          Paste a GitHub URL or a local folder path. NirmiqLearn reads the
          codebase and generates a full learning breakdown — what it does, how it
          works, and what you need to understand to own it.
        </p>
        <p className="text-xs text-zinc-600 mt-1.5">
          Works offline — no API key needed. Add <code className="text-zinc-500 bg-zinc-900 px-1 rounded">ANTHROPIC_API_KEY</code> to <code className="text-zinc-500 bg-zinc-900 px-1 rounded">.env.local</code> for deeper AI analysis.
        </p>
      </div>

      {/* Success state */}
      {state.status === "success" && (
        <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-lg p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-300 mb-1">
                Analysis complete — workspace created!
              </p>
              <p className="text-xs text-emerald-400/80 mb-3">
                <strong>{state.workspaceName}</strong> · {state.questionsCreated} questions
                · {state.conceptsCreated} concepts saved
              </p>
              <p className="text-xs text-zinc-500">Redirecting to your workspace…</p>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {state.status === "error" && (
        <div className="bg-red-950/40 border border-red-800/50 rounded-lg p-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{state.message}</p>
          </div>
        </div>
      )}

      {/* Form */}
      {state.status !== "success" && (
        <form action={action} className="space-y-5">
          {/* Main input */}
          <div className="bg-[#0d1117] border border-zinc-800 rounded-lg p-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">
                GitHub URL or local folder path
              </label>

              {/* Type indicator */}
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  {isGitHub === null ? (
                    <FolderOpen size={14} className="text-zinc-600" />
                  ) : isGitHub ? (
                    <GitBranch size={14} className="text-violet-400" />
                  ) : (
                    <FolderOpen size={14} className="text-cyan-400" />
                  )}
                </div>
                <input
                  ref={inputRef}
                  name="projectInput"
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="https://github.com/username/repo  or  C:\Projects\my-app"
                  autoFocus
                  disabled={pending}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-colors font-mono disabled:opacity-50"
                />
              </div>

              {/* Hint */}
              {isGitHub === true && (
                <p className="text-xs text-violet-400 mt-1.5 flex items-center gap-1">
                  <GitBranch size={11} />
                  GitHub repo detected — will be cloned automatically
                </p>
              )}
              {isGitHub === false && (
                <p className="text-xs text-cyan-400 mt-1.5 flex items-center gap-1">
                  <FolderOpen size={11} />
                  Local path detected — will read directly from disk
                </p>
              )}
            </div>

            {/* Optional name */}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">
                Workspace name{" "}
                <span className="text-zinc-600 font-normal">(optional — defaults to repo/folder name)</span>
              </label>
              <input
                name="workspaceName"
                type="text"
                placeholder="My Project"
                disabled={pending}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition-colors disabled:opacity-50"
              />
            </div>
          </div>

          {/* What will happen */}
          <div className="bg-[#0d1117] border border-zinc-800 rounded-lg p-5">
            <p className="text-xs font-medium text-zinc-400 mb-3">
              What NirmiqLearn will generate:
            </p>
            <div className="space-y-2">
              {[
                ["Plain-English overview", "What this project does and why"],
                ["Tech stack breakdown", "Every library and tool, explained simply"],
                ["Architecture map", "How the pieces connect"],
                ["10 explain-back questions", "From beginner to expert — can you answer them?"],
                ["5 CS concepts", "The fundamentals hiding inside your code"],
                ["Fragility map", "What could break and exactly why"],
              ].map(([title, desc]) => (
                <div key={title} className="flex items-start gap-2.5">
                  <span className="text-emerald-500 text-xs mt-0.5 shrink-0">✓</span>
                  <div>
                    <span className="text-xs font-medium text-zinc-300">{title}</span>
                    <span className="text-xs text-zinc-600"> — {desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={pending || !inputValue.trim()}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              {pending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Sparkles size={14} />
                  Analyze Project
                </>
              )}
            </button>

            {pending && (
              <p className="text-xs text-zinc-500 animate-pulse">
                Reading your codebase and generating analysis… usually 30–60 seconds
              </p>
            )}
          </div>

          {/* Examples */}
          {!inputValue && (
            <div className="pt-2">
              <p className="text-xs text-zinc-600 mb-2">Examples:</p>
              <div className="space-y-1">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => { setInputValue(ex); inputRef.current?.focus(); }}
                    className="block text-xs font-mono text-zinc-600 hover:text-zinc-400 transition-colors text-left"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
