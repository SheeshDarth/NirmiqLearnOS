import { Shield, Database, Wifi, Eye, Code2, Lock } from "lucide-react";

const SECTIONS = [
  {
    icon: Database,
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    title: "All data is stored locally",
    body: "NirmiqLearn OS stores everything in a single SQLite database file at data/nirmiqlearn.db inside the project directory. No cloud database. No remote sync. Your data never leaves your machine.",
  },
  {
    icon: Wifi,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    title: "Zero network calls",
    body: "The application makes no outbound network requests. There are no analytics SDKs, no error tracking services, no telemetry, no beacon calls, and no third-party CDN resources loaded at runtime. Everything runs from localhost.",
  },
  {
    icon: Lock,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    title: "Localhost-only server",
    body: "The web server binds to 127.0.0.1 only (not 0.0.0.0). The app is not accessible from other devices on your local network. The MCP server uses stdio transport — it opens no network socket.",
  },
  {
    icon: Eye,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    title: "No authentication needed",
    body: "Because the app is single-user and local-only, there is no login system. Access is controlled by your operating system — only processes running as you can reach the server. Do not expose port 3000 to the internet.",
  },
  {
    icon: Code2,
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    title: "MCP server data access",
    body: "When you connect NirmiqLearn via MCP to an AI coding tool (Claude Code, Cursor, Windsurf), the AI assistant can read and write to your NirmiqLearn data (workspaces, questions, debug logs, concept links, daily logs). This happens locally — the MCP server runs as a local process with stdio transport. No data is sent to any AI provider beyond what you explicitly ask the AI assistant about.",
  },
  {
    icon: Shield,
    color: "text-red-400",
    bg: "bg-red-500/10",
    title: "What we recommend you do NOT store",
    body: "Do not paste API keys, passwords, authentication tokens, or other secrets into debug log error messages or workspace descriptions. While the database is local-only, it is stored as a plain SQLite file with no encryption-at-rest. Treat it like a plaintext file in your home directory.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Shield size={16} className="text-cyan-400" />
          <h1 className="text-lg font-semibold text-zinc-100">
            Privacy Policy
          </h1>
        </div>
        <p className="text-sm text-zinc-500">
          NirmiqLearn OS is a local-first tool. This is what that means in practice.
        </p>
        <p className="text-xs text-zinc-700 mt-1">
          Last updated: June 2026 · Version 0.1.0
        </p>
      </div>

      {/* TL;DR banner */}
      <div className="bg-cyan-500/5 border border-cyan-900/40 rounded-lg px-5 py-4">
        <p className="text-sm font-semibold text-zinc-100 mb-1">
          TL;DR — Your data never leaves your machine.
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          No accounts. No cloud. No telemetry. No analytics. The entire
          application runs on localhost and stores everything in a local SQLite
          file. We collect nothing because there is no &ldquo;we&rdquo; with
          access to your machine.
        </p>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {SECTIONS.map(({ icon: Icon, color, bg, title, body }) => (
          <div
            key={title}
            className="bg-[#0d1117] border border-zinc-800 rounded-lg p-5"
          >
            <div className="flex items-start gap-3">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-lg ${bg} shrink-0 mt-0.5`}
              >
                <Icon size={15} className={color} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100 mb-1.5">
                  {title}
                </h2>
                <p className="text-sm text-zinc-400 leading-relaxed">{body}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Data stored */}
      <div className="bg-[#0d1117] border border-zinc-800 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-zinc-100 mb-3">
          Data stored locally
        </h2>
        <div className="space-y-2 text-xs text-zinc-500 font-mono">
          {[
            ["workspaces", "Title, description, type, goal, progress score"],
            ["learning_maps", "Map title, summary, modules (JSON), checkpoints (JSON)"],
            ["explain_back_questions", "Questions, expected key points, your answers, confidence ratings"],
            ["debug_logs", "Bug title, error message, cause, fix, lesson learned"],
            ["concept_links", "Feature↔concept mappings, explanations, practice tasks"],
            ["daily_logs", "Date, what you built, what you understood, unclear topics"],
          ].map(([table, desc]) => (
            <div key={table} className="flex gap-3">
              <span className="text-cyan-600 shrink-0">{table}</span>
              <span>{desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-zinc-700 mt-3">
          Location:{" "}
          <span className="font-mono text-zinc-600">data/nirmiqlearn.db</span>{" "}
          (relative to project root)
        </p>
      </div>

      {/* Contact / open source */}
      <div className="bg-[#0d1117] border border-zinc-800 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-zinc-100 mb-2">
          Open Source
        </h2>
        <p className="text-sm text-zinc-400 leading-relaxed">
          NirmiqLearn OS is open source. You can read every line of code that
          handles your data at{" "}
          <span className="text-cyan-400 font-mono text-xs">
            github.com/SheeshDarth/NirmiqLearnOS
          </span>
          . If you find a security issue, open a GitHub issue or contact the
          maintainer directly.
        </p>
      </div>
    </div>
  );
}
