# NirmiqCodeSensei

> **Build with AI, but learn like a real engineer.**
>
> _Formerly NirmiqLearn OS._

A local-first learning OS that turns any project into deep understanding. Point it at a folder (or a GitHub URL) and it reads the real code and gives you a senior-engineer-grade breakdown — architecture, security, code health, the DSA hiding in your code, how it all fits together — plus an Obsidian-style map of the project and explain-back questions to prove you actually get it. **No cloud, no telemetry, 127.0.0.1 only** — your source never leaves your machine.

---

## The problem

You use Cursor, Claude Code, or Copilot to build faster. Your code works. But when someone asks *why* you made a design decision, or *what* the time complexity is, or *how* you'd extend it — the answer isn't there. The AI wrote it. You shipped it. But you didn't learn it.

NirmiqCodeSensei fixes this without slowing you down.

---

## How it works

**Import a project** (local path or GitHub URL) and NirmiqCodeSensei analyses the real source **entirely on your machine** — the offline analyzer is the default; an Anthropic key is optional and only ever enriches a narrative. From one import you get:

- **Deep Review** — an eight-lens, senior-engineer report: security, testing/QA, code health (LOC + cyclomatic complexity), architecture (routes, import cycles, coupling), frontend, backend, dependencies, and feasibility — each graded A–F with file-and-line findings.
- **Learning Map** — an Obsidian-style force graph of the architecture: hover to highlight a file's neighbourhood, search, filter by layer, focus a node, or view its local neighbourhood; files with security/complexity findings are badged.
- **Code-grounded DSA** — the data structures & algorithms actually present in your code, each linked to the exact file, line, and a practice task.
- **Explain-Back questions** — progressively harder questions that make you prove you understand what was built.

It also **connects to your AI coding assistant** (Claude Code, Cursor, Windsurf) over MCP, so while you build your assistant can log debug sessions, add questions, and map concepts as you go.

Everything is stored locally in SQLite. Nothing leaves your machine.

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/SheeshDarth/NirmiqCodeSensei.git
cd NirmiqCodeSensei
npm install
```

### 2. Run the app

```bash
npm run dev
```

Database migrations are applied automatically on first start — no manual setup needed. Requires Node.js 20+.

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) — the app binds to localhost only.

---

## Connect to your IDE (MCP)

Start the MCP server:

```bash
npm run mcp
```

### Claude Code

Add to `.claude/mcp.json` in your project (or user MCP settings):

```json
{
  "mcpServers": {
    "nirmiqcodesensei": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/absolute/path/to/NirmiqCodeSensei"
    }
  }
}
```

### Cursor

Add to Cursor MCP settings (`Settings → Features → MCP`):

```json
{
  "nirmiqcodesensei": {
    "command": "npm",
    "args": ["run", "mcp"],
    "cwd": "/absolute/path/to/NirmiqCodeSensei"
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "nirmiqcodesensei": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/absolute/path/to/NirmiqCodeSensei"
    }
  }
}
```

---

## MCP Tools

### Free (always available)

| Tool | What it does |
|------|-------------|
| `list_workspaces` | Show all your project workspaces |
| `get_workspace_summary` | Full summary of a workspace — questions, concepts, debug logs, daily logs |
| `add_debug_log` | Log a debug session with error, root cause, and fix |
| `add_question` | Add an explain-back question to a workspace |
| `add_concept_link` | Link a DSA/CS concept to a workspace |
| `add_daily_log` | Log what you built, understood, and what's still unclear |
| `get_weak_questions` | Surface questions you've been avoiding or haven't answered |
| `ncs_explain_command` | Explain a shell command in plain English with a risk level |

### AI-Powered (Pro — requires `ANTHROPIC_API_KEY`)

| Tool | What it does |
|------|-------------|
| `ncs_generate_questions` | Paste code → get 5 progressive explain-back questions (beginner to advanced) |
| `ncs_suggest_concepts` | Paste code → get 3–5 underlying DSA/CS concepts with 30-min practice tasks |
| `ncs_debug_assist` | Paste an error → get root cause, top 3 checks, fix, and prevention rule |
| `ncs_analyze_project` | Analyze a local project → auto-populated workspace with the Deep Review, learning-map graph, code-grounded DSA, questions, and concepts |

AI tools use your own Anthropic API key (BYOK). Add it to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Then restart the MCP server. The 3 AI tools appear automatically.

---

## Features

- **Deep Review** — eight-lens senior-engineer report (security, testing, code health, architecture, frontend, backend, dependencies, feasibility) computed locally from your real code, graded A–F with file:line findings.
- **Learning Map** — Obsidian-style architecture graph with hover-highlight, search, layer filters, focus/local views, and 2D/3D — badged with the review's security & complexity findings.
- **DSA Bridge** — the data structures & algorithms actually in your code, mapped to file, line, and a practice task.
- **Explain-Back** — questions that force you to prove you understand, not just that it runs.
- **Workspaces** — one workspace per project; log everything in one place.
- **Debug Lab** — structured debug logs so you stop making the same mistakes twice.
- **Daily Log** — what did you build today? what's still unclear? what next?
- **Markdown Export** — export any workspace as a clean Markdown file.
- **MCP Server** — 12 tools your AI assistant can call while you work.

---

## Privacy and security

- **All data is local** — SQLite file at `data/nirmiqcodesensei.db`. Never leaves your machine.
- **Zero telemetry** — no analytics, no network calls, no tracking.
- **Localhost only** — server binds to `127.0.0.1`. Not accessible from your LAN.
- **MCP uses stdio** — no network socket. Your IDE spawns the server as a child process.
- **BYOK** — AI tools use your own Anthropic key. Not routed through any NirmiqCodeSensei server.

See [SECURITY.md](SECURITY.md) for the full threat model.

---

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 (hand-rolled components) · SQLite · Drizzle ORM · Zod · MCP SDK · Anthropic SDK

---

## Roadmap

The road to a deployed 1.0 is tracked as focused megasprints in
[docs/MEGASPRINT_ROADMAP.md](docs/MEGASPRINT_ROADMAP.md): identity ✅, security ✅,
then architecture & data integrity, analysis depth, QA, framework/perf, and
distribution (`npx nirmiqcodesensei` + versioned releases). Architecture
decisions are logged in [docs/COUNCIL_REVIEW_LOG.md](docs/COUNCIL_REVIEW_LOG.md).

---

## Contributing

This is an MVP. Issues and PRs welcome. See [docs/TRD.md](docs/TRD.md) for architecture decisions.

---

## License

**PolyForm Noncommercial 1.0.0** — free for personal, educational, and research use. Commercial use requires permission from the author. See [LICENSE.md](LICENSE.md).

Required Notice: Copyright © 2026 Siddharth Prashoo (https://github.com/SheeshDarth/NirmiqCodeSensei)

If NirmiqCodeSensei helps you, please ⭐ star the repo and credit the project when you share or build on it.

---

*Built for engineers who want to actually understand what they ship.*
