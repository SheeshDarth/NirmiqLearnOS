# Launch Copy — NirmiqLearn OS

Use this file for Gumroad, Reddit, Hacker News, and Twitter/X launches.
Update version numbers and links before each post.

---

## Gumroad Product Page

**Product name:** NirmiqLearn OS — Local Learning OS for AI-assisted developers

**Tagline:** Build with AI, but learn like a real engineer.

**Price:** ₹999 / $12 (suggest: start here, raise after 50 sales)

**Product description:**

---

You use Cursor, Claude Code, or Copilot to build faster. The code works. But when someone asks you to explain it — in an interview, a viva, a code review, or just to yourself — you realise you don't actually know why it works.

**NirmiqLearn OS is a local-first learning OS that sits inside your IDE and makes you prove you understand what you ship.**

It connects to Claude Code, Cursor, and Windsurf via MCP (Model Context Protocol). While you build, your AI assistant can automatically:

- Log debug sessions with structured root cause and fix
- Generate progressive explain-back questions from your code
- Identify the DSA/CS concepts hidden inside what you built
- Track daily logs: what did I build, understand, and still need to learn?
- Surface your weakest areas over time

**Everything is local.** SQLite on your machine. No cloud. No account. No telemetry. Your code never leaves your device.

---

**What you get:**

✅ The full NirmiqLearn OS app (Next.js, runs locally on http://127.0.0.1:3000)
✅ 10 MCP tools for Claude Code, Cursor, and Windsurf
✅ 7 free tools (always work, no API key needed)
✅ 3 AI-powered Pro tools (BYOK — uses your own Anthropic key)
✅ Markdown export for every workspace
✅ Setup guide + MCP config snippets for all major IDEs
✅ MIT licence — use it on any project, forever

---

**Who this is for:**

- Engineering students who vibe-code projects and need to explain them in vivas/interviews
- Developers who want to build a habit of understanding, not just shipping
- Bootcamp students whose curriculum uses AI-assisted coding
- Self-taught developers building their portfolio

**Who this is NOT for:**
- Anyone who wants a cloud-hosted SaaS tool
- Anyone not willing to run a local Next.js server

---

**Setup takes under 5 minutes:**

```
git clone https://github.com/SheeshDarth/NirmiqLearnOS
cd NirmiqLearnOS && npm install
npm run db:generate && npm run db:migrate
npm run dev
```

Then add the MCP config to your IDE (full instructions included).

---

**FAQ**

*Does it need an Anthropic API key?*
No. The 7 free tools work without any API key. The 3 AI-powered tools (question generator, concept identifier, debug analyser) use your own Anthropic key if you choose to add it.

*Does it send my code anywhere?*
Only when you use the 3 AI Pro tools — your code snippet goes directly to Anthropic's API using your own key. The NirmiqLearn app itself has zero network calls.

*Which IDEs does it support?*
Claude Code, Cursor, Windsurf. Any IDE that supports MCP stdio servers.

*Is it open source?*
Yes — MIT licence on GitHub. Buying on Gumroad supports continued development.

---

## Reddit Post — r/learnprogramming

**Title:**
I built a local learning OS that connects to Cursor/Claude Code and forces you to actually understand the AI-generated code you ship

**Body:**

I've been building projects with AI assistants for a while and noticed a pattern: the code works, I ship it, but if someone asks me to explain it a week later — or in an interview — I realise I don't actually know why it works. I just know that it does.

So I built something to fix that.

**NirmiqLearn OS** is a local-first app that connects to Claude Code, Cursor, or Windsurf via MCP. While you build, your AI assistant can:

- Log debug sessions (what was the error, root cause, fix)
- Generate progressive explain-back questions from your code
- Identify the DSA/CS concepts in what you just built
- Track daily learning logs (what did I build, what's still unclear)
- Surface your weakest questions over time

The whole thing runs on your machine. SQLite. Zero telemetry. No account. No cloud. Your code never leaves your device.

**How it works in practice:**

You finish a feature. You tell your Claude Code / Cursor session: *"use nirmiq_generate_questions on this code"*. It comes back with 5 questions:

- Q1: What does this function return if the input is empty?
- Q3: What is the time complexity and why?
- Q5: How would you refactor this if the dataset grew to 10M records?

You try to answer them. If you can't, you know what to study. If you can, you're ready for any interview or viva on this code.

**GitHub:** https://github.com/SheeshDarth/NirmiqLearnOS
**Gumroad (setup guide + support):** [link]

It's MIT licence — free to clone and use. Gumroad is just if you want the setup guide and to support development.

Happy to answer questions about how it works or how to connect it to your IDE.

---

## Reddit Post — r/cursor (shorter)

**Title:**
Built a local MCP server that tracks your learning while you build — 10 tools for Claude Code/Cursor/Windsurf

**Body:**

Quick share: I built **NirmiqLearn OS**, a local MCP server that gives your AI assistant 10 tools for tracking what you learn while you build.

Free tools: log debug sessions, add explain-back questions, link DSA concepts, track daily logs, surface weak spots.

Pro tools (BYOK — uses your own Anthropic key): generate questions from code, identify concepts, structured debug analysis.

Everything local. SQLite. No cloud.

MCP config is 5 lines. Works with Claude Code, Cursor, Windsurf.

GitHub: https://github.com/SheeshDarth/NirmiqLearnOS

---

## Hacker News — Show HN

**Title:**
Show HN: NirmiqLearn OS — local MCP server that forces you to understand AI-generated code

**Body:**

NirmiqLearn OS is a local-first learning OS that connects to Claude Code, Cursor, and Windsurf via MCP. The idea: if you're building with AI assistants, you should still be able to explain what you shipped.

It gives your AI assistant 10 MCP tools:

- Log debug sessions with structured root cause
- Add explain-back questions to any workspace
- Link DSA/CS concepts to what you built
- Generate questions, identify concepts, analyse errors (AI-powered, BYOK)

The whole thing runs on your machine — Next.js 16 app, SQLite via Drizzle ORM, MCP server over stdio. Zero telemetry, zero cloud, zero network calls by default.

GitHub: https://github.com/SheeshDarth/NirmiqLearnOS
MIT licence.

The immediate use case is engineering students who build with Cursor/Claude Code for assignments and then struggle to explain the code in vivas or interviews. But it's also useful for any developer who wants to build a habit of understanding, not just shipping.

Happy to discuss the MCP architecture or the local-first storage model.

---

## Twitter/X Thread

**Tweet 1:**
I built a local MCP server that sits inside Cursor/Claude Code and makes you prove you understand the AI-generated code you ship.

It's called NirmiqLearn OS. Thread 🧵

**Tweet 2:**
The problem: you use AI to build faster. The code works. But in an interview or viva, someone asks WHY it works — and you realise you don't actually know.

NirmiqLearn is built for this exact problem.

**Tweet 3:**
It gives your AI assistant 10 MCP tools:

🔍 Log debug sessions (error → root cause → fix)
❓ Add explain-back questions
🔗 Link DSA concepts to what you built
🧠 AI: generate questions from code (BYOK)
📊 Track daily learning logs

**Tweet 4:**
Everything is LOCAL.

SQLite on your machine.
No cloud. No account. No telemetry.
MCP over stdio — no network socket opened.
Server binds to 127.0.0.1 only.

Your code never leaves your device unless you use the AI Pro tools (with your own Anthropic key).

**Tweet 5:**
Setup: clone → npm install → npm run dev → add 5 lines of MCP config to your IDE.

Works with Claude Code, Cursor, Windsurf.

GitHub (MIT): https://github.com/SheeshDarth/NirmiqLearnOS

**Tweet 6:**
Who it's for:
→ Engineering students who vibe-code projects and need to explain them
→ Developers who want to build a habit of actually understanding their code
→ Bootcamp students using AI-assisted IDEs

Not for: people who want a cloud tool. This is local-first, always.

---

## MCP Directory Listings

### mcp.so

**Name:** NirmiqLearn OS
**Category:** Education / Developer Tools
**Description:** Local-first learning OS for AI-assisted developers. 10 MCP tools for Claude Code, Cursor, and Windsurf. Log debug sessions, generate explain-back questions, map DSA concepts, track daily learning — entirely on your machine.
**GitHub:** https://github.com/SheeshDarth/NirmiqLearnOS
**Transport:** stdio
**Install command:** `npm run mcp` (after cloning + `npm install`)

### Anthropic MCP Directory (submit via console.anthropic.com/mcp)

Same as mcp.so. Use `mcp-manifest.json` from the repo root.

### Cursor MCP Marketplace

**Server name:** nirmiqlearn
**Display name:** NirmiqLearn OS — Learning OS for developers
**Short description:** Log what you learn while you build. Debug sessions, explain-back questions, DSA concept mapping — all local, all in your IDE.
**Config:**
```json
{
  "nirmiqlearn": {
    "command": "npm",
    "args": ["run", "mcp"],
    "cwd": "/path/to/NirmiqLearnOS"
  }
}
```
