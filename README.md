# NirmiqLearn OS

> **Build with AI, but learn like a real engineer.**

A local-first learning OS that sits inside your IDE and makes sure you actually understand the code you ship — not just that it works.

---

## The problem

You use Cursor, Claude Code, or Copilot to build faster. Your code works. But when someone asks *why* you made a design decision, or *what* the time complexity is, or *how* you'd extend it — the answer isn't there. The AI wrote it. You shipped it. But you didn't learn it.

NirmiqLearn OS fixes this without slowing you down.

---

## How it works

NirmiqLearn connects to your AI coding assistant (Claude Code, Cursor, Windsurf) via MCP. While you build, your assistant can automatically:

- Log debug sessions with root cause and fix
- Generate explain-back questions from your code *(Pro)*
- Identify DSA/CS concepts hidden in what you built *(Pro)*
- Analyse errors and produce structured debug breakdowns *(Pro)*
- Track daily learning logs and surface weak spots over time

Everything is stored locally in SQLite. Nothing leaves your machine.

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/SheeshDarth/NirmiqLearnOS.git
cd NirmiqLearnOS
npm install
```

### 2. Set up the database

```bash
npm run db:generate
npm run db:migrate
```

### 3. Run the app

```bash
npm run dev
```

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
    "nirmiqlearn": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/absolute/path/to/NirmiqLearnOS"
    }
  }
}
```

### Cursor

Add to Cursor MCP settings (`Settings → Features → MCP`):

```json
{
  "nirmiqlearn": {
    "command": "npm",
    "args": ["run", "mcp"],
    "cwd": "/absolute/path/to/NirmiqLearnOS"
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "nirmiqlearn": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/absolute/path/to/NirmiqLearnOS"
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

### AI-Powered (Pro — requires `ANTHROPIC_API_KEY`)

| Tool | What it does |
|------|-------------|
| `nirmiq_generate_questions` | Paste code → get 5 progressive explain-back questions (beginner to advanced) |
| `nirmiq_suggest_concepts` | Paste code → get 3–5 underlying DSA/CS concepts with 30-min practice tasks |
| `nirmiq_debug_assist` | Paste an error → get root cause, top 3 checks, fix, and prevention rule |

AI tools use your own Anthropic API key (BYOK). Add it to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Then restart the MCP server. The 3 AI tools appear automatically.

---

## Features

- **Workspaces** — one workspace per project. Log everything in one place.
- **Explain-Back** — questions that force you to prove you understand, not just that it runs.
- **DSA Bridge** — connects what you built to the CS concepts underneath it.
- **Debug Lab** — structured debug logs so you stop making the same mistakes twice.
- **Daily Log** — what did you build today? what's still unclear? what next?
- **Learning Map** — visual graph of concepts across all workspaces.
- **Markdown Export** — export any workspace as a clean Markdown file.
- **MCP Server** — 10 tools your AI assistant can call while you work.

---

## Privacy and security

- **All data is local** — SQLite file at `data/nirmiqlearn.db`. Never leaves your machine.
- **Zero telemetry** — no analytics, no network calls, no tracking.
- **Localhost only** — server binds to `127.0.0.1`. Not accessible from your LAN.
- **MCP uses stdio** — no network socket. Your IDE spawns the server as a child process.
- **BYOK** — AI tools use your own Anthropic key. Not routed through any NirmiqLearn server.

See [SECURITY.md](SECURITY.md) for the full threat model.

---

## Stack

Next.js 16 · TypeScript · Tailwind CSS 4 · shadcn/ui · SQLite · Drizzle ORM · Zod · Zustand · MCP SDK · Anthropic SDK

---

## Roadmap

- [ ] License key system for Pro tier
- [ ] Team workspaces (shared SQLite over network drive)
- [ ] Progress analytics dashboard
- [ ] SQLite encryption at rest
- [ ] VS Code sidebar panel (native extension)
- [ ] Workspace templates (pre-filled question packs per domain)

---

## Contributing

This is an MVP. Issues and PRs welcome. See [docs/TRD.md](docs/TRD.md) for architecture decisions.

---

## License

MIT — use it, fork it, sell your own builds. Attribution appreciated.

---

*Built for engineers who want to actually understand what they ship.*
