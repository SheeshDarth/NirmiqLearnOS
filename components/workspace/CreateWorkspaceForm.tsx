"use client";

import { useActionState } from "react";
import { createWorkspaceAction } from "@/app/(app)/workspaces/actions";
import { FolderOpen, Code2, BookOpen, GraduationCap } from "lucide-react";
import Link from "next/link";

const TYPES = [
  {
    value: "project",
    label: "Project",
    icon: FolderOpen,
    description: "A codebase or AI-assisted build",
    color: "text-cyan-400",
    border: "border-cyan-500/40",
    bg: "bg-cyan-500/5",
  },
  {
    value: "dsa",
    label: "DSA",
    icon: Code2,
    description: "Algorithms & data structures",
    color: "text-violet-400",
    border: "border-violet-500/40",
    bg: "bg-violet-500/5",
  },
  {
    value: "exam",
    label: "Exam",
    icon: GraduationCap,
    description: "Viva, interview, or oral exam prep",
    color: "text-amber-400",
    border: "border-amber-500/40",
    bg: "bg-amber-500/5",
  },
  {
    value: "topic",
    label: "Topic",
    icon: BookOpen,
    description: "Deep-dive into a concept or library",
    color: "text-emerald-400",
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/5",
  },
] as const;

type WorkspaceType = (typeof TYPES)[number]["value"];

export default function CreateWorkspaceForm() {
  const [state, action, isPending] = useActionState(createWorkspaceAction, null);

  return (
    <form action={action} className="space-y-6">
      {state?.error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
          {state.error}
        </div>
      )}

      {/* Title */}
      <div className="space-y-1.5">
        <label htmlFor="title" className="block text-xs font-medium text-zinc-300">
          Workspace Title <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          placeholder="e.g. NirmiqLearn OS, Binary Search Trees, Viva Prep…"
          className="w-full bg-zinc-900 border border-zinc-700 focus:border-cyan-500 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors"
        />
      </div>

      {/* Workspace Type */}
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-zinc-300">
          Workspace Type <span className="text-red-500">*</span>
        </legend>
        <div className="grid grid-cols-2 gap-2 pt-1">
          {TYPES.map(({ value, label, icon: Icon, description, color, border, bg }) => (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                name="type"
                value={value}
                required
                className="sr-only peer"
              />
              <div
                className={`border rounded-md p-3 peer-checked:${border} peer-checked:${bg} border-zinc-800 hover:border-zinc-700 transition-colors`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={14} className={color} />
                  <span className={`text-xs font-semibold ${color}`}>{label}</span>
                </div>
                <p className="text-xs text-zinc-500">{description}</p>
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Goal */}
      <div className="space-y-1.5">
        <label htmlFor="goal" className="block text-xs font-medium text-zinc-300">
          Learning Goal
          <span className="text-zinc-600 font-normal ml-1">(optional)</span>
        </label>
        <input
          id="goal"
          name="goal"
          type="text"
          placeholder="e.g. Explain this project clearly in a viva"
          className="w-full bg-zinc-900 border border-zinc-700 focus:border-cyan-500 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors"
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label htmlFor="description" className="block text-xs font-medium text-zinc-300">
          Description
          <span className="text-zinc-600 font-normal ml-1">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Brief context about this workspace…"
          className="w-full bg-zinc-900 border border-zinc-700 focus:border-cyan-500 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none resize-none transition-colors"
        />
      </div>

      {/* Submit */}
      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-semibold px-5 py-2 rounded-md transition-colors"
        >
          {isPending ? "Creating…" : "Create Workspace"}
        </button>
        <Link
          href="/workspaces"
          className="text-sm text-zinc-400 hover:text-zinc-100 px-4 py-2 rounded-md hover:bg-white/5 transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
