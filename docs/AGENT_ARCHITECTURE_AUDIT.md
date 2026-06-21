# Agent Architecture Audit — NirmiqLearn OS

**Date:** 2026-06-21
**Auditor:** Chief architect review (`/ecc:agent-architecture-audit`)
**Branch:** `feature/structural-cleanup`
**Scope:** The LLM/agent-powered surfaces only — the MCP server (`mcp-server/`), the AI analysis pipeline (`lib/services/project-analyzer.service.ts` + `mcp-server/ai-tools.ts`), and the Claude Code hook (`hooks/pre-bash.mjs`). This is **not** a general code review (see `COUNCIL_REVIEW_LOG.md` REVIEW-004 for that). This audit applies the 12-layer agent-stack model to find failures that survive lint/typecheck/build.

---

## Executive Verdict

**Overall health: HIGH RISK.**

NirmiqLearn OS is simultaneously an **agent** (it calls Claude to analyze code) and a **tool provider** (an MCP server consumed by Claude Code / Cursor / Windsurf). Both roles carry the classic wrapper-layer failures this audit hunts, and three of them are live:

- **Primary failure mode:** *Markdown prose used as an internal machine protocol.* The most important data-creating tool (`nirmiq_analyze_project`) asks Claude for a markdown-formatted answer, then **regex-parses that prose** to decide what to write to the database. Any drift in the model's formatting → silent, total data loss with a success message shown to the user.

- **Most urgent fix:** Replace regex-on-prose parsing in `analyzeProject` with structured outputs (tool-calling / `output_config.format` with a strict JSON schema), and add a post-parse count assertion so zero-extraction becomes a loud error, not a silent "success."

The product's entire tagline is *"know what your AI did."* The irony: **the MCP server does not log its own tool calls**, and the one feature built to log AI activity (Session Log) has a **severed data pipeline**.

---

## Scope

| Field | Value |
|---|---|
| Target | NirmiqLearn OS agent surfaces |
| Entrypoints | MCP stdio server (12 tools); web import Server Action; Claude Code PreToolUse hook |
| Model stack | `claude-opus-4-8` (adaptive thinking) via `@anthropic-ai/sdk`; local heuristic analyzer as no-key fallback |
| Layers audited | 6 (tool selection), 7 (tool execution), 8 (tool interpretation), 9 (answer shaping), 11 (hidden repair loops), 12 (persistence) |

---

## Severity-Ranked Findings

### 🔴 CRITICAL

---

#### C1 — `nirmiq_analyze_project` uses regex-on-LLM-markdown as its persistence protocol

**Layer:** 8 (tool interpretation)
**Evidence:** `mcp-server/ai-tools.ts:431–459`
**Confidence:** 0.90

The tool prompts Claude for an exact markdown format (`ai-tools.ts:373–408`), then extracts data to persist with two regexes:

```ts
// questions
/Q(\d+)\s*\((beginner|intermediate|advanced|expert)\):\s*(.+)/gi
// concepts — after a string split on a bold header
const conceptSection = analysis.split("**5 KEY CS CONCEPTS")[1]?.split("**")[0] ?? "";
const conceptPattern = /- ([^(]+)\s*\(([^)]+)\):\s*(.+)/g;
```

**Mechanism:** The model is a probabilistic text generator with adaptive thinking enabled. The instant it formats a question as `Q1.` instead of `Q1 (beginner):`, bolds the question, emits a difficulty outside the four-value enum, or renders the section header as `**5 KEY CS CONCEPTS IN THIS PROJECT**` with surrounding prose, the regex matches **nothing**. The `?? ""` on the section split guarantees a silent empty result. The user still sees `✅ Project analyzed and workspace created!` (`ai-tools.ts:462`) with the full analysis text — but with **zero questions and zero concepts persisted**, and no warning.

**Root cause:** Treating free-form LLM prose as a reliable data-interchange format. There is no schema, no validation, no extraction-count assertion, no fallback.

**Recommended fix:** Use structured outputs — define a Zod/JSON schema for `{ questions: [...], concepts: [...], modules: [...] }` and pass it via `output_config.format` (or a strict tool definition), then `messages.parse()`. After parsing, assert `questions.length > 0` and surface a real error if extraction yields nothing. Never `?? ""` your way past a parse failure on the critical path.

---

#### C2 — AI tools advertise persistence they do not perform; the contract is inconsistent across tools

**Layer:** 7 (tool execution)
**Evidence:** `mcp-server/ai-tools.ts:127, 182, 241` vs `ai-tools.ts:441–458`
**Confidence:** 0.95

Three Pro tools generate content and return prose telling the **consuming** agent to persist it:

- `generateQuestions` → `"Save these with add_question in each workspace."` (`ai-tools.ts:127`)
- `suggestConcepts` → `"Save these with add_concept_link…"` (`ai-tools.ts:182`)
- `debugAssist` → `"Save this with add_debug_log…"` (`ai-tools.ts:241`)

But the fourth, `analyzeProject`, **auto-persists** via `createQuestion`/`createConceptLink` (`ai-tools.ts:441–458`).

**Mechanism:** Persistence is gated only by a prose instruction, not by code. Whether the data actually lands in SQLite depends on the consuming LLM (Claude Code, Cursor) reliably parsing the suggestion and re-calling `add_question` N times — with no enforcement, no transaction, no confirmation. Meanwhile `analyzeProject` behaves the opposite way. An author integrating this MCP server cannot predict which tools have side effects. This is textbook tool-discipline failure: *"must use tool X" expressed in prose, never code-gated.*

**Root cause:** No declared, uniform contract for "generate" vs "generate + persist." Two mental models coexist.

**Recommended fix:** Pick one contract and make it explicit in the tool name/description. Either (a) generators return structured data and a **separate** persist tool writes it, or (b) every generator auto-persists and returns the created IDs. Do not rely on a downstream agent to re-enter data as the persistence mechanism.

---

#### C3 — The Session Log pipeline is severed; the hook runs a hidden, parallel LLM pass that writes nowhere

**Layer:** 11 (hidden repair/parallel loop) + 7 (execution)
**Evidence:** `hooks/pre-bash.mjs:80–114, 144–150` vs `mcp-server/index.ts:545–567`
**Confidence:** 1.0

The documented design (REVIEW-002/003) is: Claude Code hook → `nirmiq_explain_command` MCP tool → `createSessionLog()` → Session Log page. In reality:

- `mcp-server/index.ts:554` **does** call `createSessionLog()` — but nothing invokes this tool, because…
- `hooks/pre-bash.mjs:100–114` runs its **own** independent `claude-opus-4-8` call (`explainWithAI`) with a *different* prompt, and writes the result to **stderr** (`pre-bash.mjs:147`). It never imports or calls the MCP tool and never touches the database.

**Mechanism:** Two separate LLM code paths exist for "explain a command" — `ai-tools.ts:explainCommand` (persists) and `pre-bash.mjs:explainWithAI` (persists nothing). The one wired to the user's IDE is the one that writes nowhere. The Session Log table is therefore **always empty** for real users. This is a hidden parallel agent layer with no contract, duplicating logic and diverging in output format.

**Compounding (architectural):** `pre-bash.mjs` is a **PreToolUse** hook — it fires *before* the command runs and can block it (exit 2, `pre-bash.mjs:134–141`). Session logging ("what was built") is inherently **PostToolUse** information. You cannot log an outcome before the command executes. The hook is the wrong hook type for the feature it claims to feed.

**Root cause:** The hook was implemented as a standalone API caller instead of an MCP client, and as the wrong lifecycle event.

**Recommended fix:** Convert to a PostToolUse hook that calls the `nirmiq_explain_command` MCP tool (single LLM path, single persistence path). Delete `explainWithAI` from the hook entirely. Add a daily call/cost cap.

---

### 🟠 HIGH

---

#### H1 — Two divergent "analyze a project" pipelines with different output quality

**Layer:** 6 (tool selection / routing)
**Evidence:** `mcp-server/ai-tools.ts:329 (analyzeProject)` vs `lib/services/project-analyzer.service.ts (analyzeProject)`
**Confidence:** 0.90

There are two implementations of "analyze a project," and they produce **materially different** results:

| Capability | Web import (`project-analyzer.service.ts`) | MCP `nirmiq_analyze_project` (`ai-tools.ts`) |
|---|---|---|
| No-API-key heuristic fallback (`detectStack`) | ✅ | ❌ (hard-requires Pro + key) |
| Code-grounded DSA findings (`analyzeCode`) | ✅ | ❌ |
| Architecture/workflow graph (`graphJson`) | ✅ | ❌ |
| Learning map with modules + checkpoints | ✅ (`createLearningMapWithContent`) | ❌ (only `createLearningMap`, no content) |
| Concept links with source file + snippet | ✅ (`createConceptLinkWithSource`) | ❌ (`createConceptLink`, no source) |

**Mechanism:** A user who imports via the web UI gets a rich workspace; a user who runs the MCP tool gets a degraded one (no graph, no code-grounded DSA, hollow learning map). Same product promise, two code paths, inconsistent outcomes — the "different agents behave inconsistently" pattern.

**Root cause:** The MCP tool was written before/parallel to the import pipeline and never refactored to call the shared service.

**Recommended fix:** Make `nirmiq_analyze_project` a thin wrapper over `lib/services/project-analyzer.service.ts:analyzeProject`. One pipeline, one quality bar.

---

#### H2 — `add_debug_log` silently discards 4 of the 8 fields it accepts

**Layer:** 7 (execution) / 9 (answer shaping)
**Evidence:** schema `mcp-server/index.ts:95–110` vs handler `mcp-server/index.ts:417–421`
**Confidence:** 1.0

The tool's input schema advertises `actual_cause`, `fix_summary`, `lesson_learned`, and `prevention_rule`. The handler passes only three fields to the service:

```ts
await createDebugLog(v.workspace_id, {
  title: v.title,
  errorMessage: v.error_message,
  suspectedCause: v.suspected_cause,
}); // actual_cause, fix_summary, lesson_learned, prevention_rule are dropped
```

**Mechanism:** `createDebugLog` (create path) only accepts those three fields; the rest live on the *update* schema. An agent that diligently fills in the root cause and the prevention rule — exactly the high-value learning content — has it validated, accepted, and **silently thrown away**. The tool advertises a contract it cannot honor.

**Root cause:** Tool schema copied from the full debug-log shape without reconciling against the service's create signature.

**Recommended fix:** Either trim the tool schema to the three fields the create path supports, or have the handler create-then-update so all eight fields persist. Do not advertise fields you drop.

---

#### H3 — `explainCommand` extracts JSON from prose with a greedy regex and never validates the risk enum

**Layer:** 8 (tool interpretation)
**Evidence:** `mcp-server/ai-tools.ts:522–541`
**Confidence:** 0.85

```ts
const jsonMatch = raw.match(/\{[\s\S]+\}/);          // greedy: first { … last }
const parsed = JSON.parse(jsonMatch[0]) as { … riskLevel: "safe"|"caution"|"risky" … };
return { …, riskLevel: parsed.riskLevel ?? "safe", … };
```

**Mechanism:** `/\{[\s\S]+\}/` is greedy and will span from the first `{` to the last `}` — if the explanation text itself contains braces, the captured substring is invalid JSON and the whole thing falls back to `basicExplain` (mislabeling, see M2). Worse, `parsed.riskLevel` is **never validated against the enum** — a model returning `"dangerous"` flows straight through to the emoji logic (`index.ts:563`) and into the `session_logs.riskLevel` column, corrupting downstream filtering.

**Root cause:** Prose-to-JSON by string matching, plus a type assertion (`as`) standing in for runtime validation.

**Recommended fix:** Use `messages.parse()` with a Zod schema (`riskLevel: z.enum([...])`). Reject/normalize out-of-enum values explicitly.

---

#### H4 — `nirmiq_analyze_project` is non-idempotent; repeated calls silently spawn duplicate workspaces

**Layer:** 12 (persistence)
**Evidence:** `mcp-server/ai-tools.ts:251 (imports listWorkspaces)`, `ai-tools.ts:417 (always createWorkspace)`
**Confidence:** 0.90

`listWorkspaces` is imported but never used for deduplication. Every invocation calls `createWorkspace`, which always inserts. An agent that calls `nirmiq_analyze_project` twice on the same path — a very common agent retry behavior — creates two workspaces with identical content and burns a second full Opus analysis.

**Root cause:** No idempotency key (e.g., on resolved path) and no pre-check despite the import being present.

**Recommended fix:** Look up an existing workspace by resolved project path (store it on the workspace) and update-or-return instead of blindly inserting.

---

### 🟡 MEDIUM

---

#### M1 — The MCP server does not log its own tool invocations

**Layer:** 12 (persistence / observability)
**Evidence:** `mcp-server/index.ts:324–584` — only `nirmiq_explain_command` writes to `session_logs`
**Confidence:** 0.80

For a product whose differentiator is *"know what your AI did,"* the MCP server records none of its own activity. Eleven of twelve tools leave no audit trail. There is no way to answer "what did the agent do in this workspace via MCP."

**Recommended fix:** Wrap the `CallToolRequestSchema` handler so every tool call appends a `session_logs` row (tool name, args summary, outcome). This is the feature the product literally sells.

---

#### M2 — Free-tier `explainCommand` labels every command `riskLevel: "safe"`, including destructive ones

**Layer:** 9 (answer shaping)
**Evidence:** `mcp-server/ai-tools.ts:489–495`
**Confidence:** 1.0

```ts
const basicExplain = { explanation: `Running: ${command}`, riskLevel: "safe" as const, … };
if (gate) return basicExplain; // no pro key → everything is "safe"
```

**Mechanism:** Without a Pro key, `rm -rf`, `dd`, and `format` all return `riskLevel: "safe"`. If the session-log pipeline were wired (it isn't — C3), the log would actively *mislabel* dangerous commands as safe. A wrong risk signal is worse than none.

**Recommended fix:** Run the static `BLOCK_PATTERNS`/risk heuristics from `pre-bash.mjs` in the free path so destructive commands are at least flagged `risky` without an API call.

---

#### M3 — `get_workspace_summary` surfaces `progressScore` (always 0) to external agents as a real signal

**Layer:** 8 (tool interpretation)
**Evidence:** `mcp-server/index.ts:338, 368`
**Confidence:** 0.90

`progressScore` is never written anywhere in the codebase (see REVIEW-004 #1). The MCP summary reports `Progress: 0%` to the consuming agent as if it were meaningful. An agent reasoning over the summary may conclude the student has made no progress and act on a false signal.

**Recommended fix:** Either implement a real progress value or omit the field from the MCP summary until it means something.

---

#### M4 — `analyzeProject` gathers context synchronously and trusts slice caps to bound the prompt

**Layer:** performance / context budgeting
**Evidence:** `mcp-server/ai-tools.ts:270–327, 344–367`
**Confidence:** 0.70

`getFileTree` (depth 3) and `readKeyFiles` run synchronous `readdirSync`/`readFileSync` and rely on `.slice(0, N)` caps to bound the prompt. On a large monorepo the tree walk blocks, and the caps silently truncate context mid-file, degrading analysis quality with no signal to the user.

**Recommended fix:** Stream/limit file collection, count tokens (`messages.count_tokens`) before sending, and tell the user when input was truncated.

---

### 🟢 LOW

---

#### L1 — `extractText` returns `""` when a response is all thinking/no text, and callers proceed silently

**Layer:** 8/9
**Evidence:** `mcp-server/ai-tools.ts:50–56`
**Confidence:** 0.60

With adaptive thinking enabled and text omitted, an empty `extractText` result is treated as a valid (empty) answer everywhere downstream. Add an explicit "no text content" guard.

#### L2 — The header comment claims "no user-controlled injection," but user input is interpolated into every prompt

**Layer:** 1 (prompt assembly) / documentation honesty
**Evidence:** `mcp-server/ai-tools.ts:13` vs `ai-tools.ts:100, 157, 508`
**Confidence:** 0.70

`code_snippet`, `error_message`, and `command` are user-controlled and embedded directly into prompts. This isn't a classic security hole (BYOK, the user's own key), but the comment "no user-controlled injection" is false and will mislead a future maintainer. Correct the comment; note that prompt-injection via analyzed code is possible and the output should not be trusted to drive privileged actions.

---

## Architecture Diagnosis — which layer corrupted what

```
Layer 6  Tool selection ......... TWO analyze pipelines, divergent quality .......... H1
Layer 7  Tool execution ......... persistence advertised, not enforced .............. C2
                                   add_debug_log drops 4 accepted fields ............ H2
                                   session-log tool never invoked ................... C3
Layer 8  Tool interpretation .... regex-on-markdown as data protocol ............... C1
                                   greedy-regex JSON + no enum validation .......... H3
                                   progressScore=0 surfaced as a real signal ....... M3
Layer 9  Answer shaping ......... free-tier risk always "safe" .................... M2
Layer 11 Hidden parallel loop ... hook runs its own LLM pass to stderr ............ C3
Layer 12 Persistence ............ no tool-call audit trail ....................... M1
                                   non-idempotent workspace creation .............. H4
```

**The through-line:** this system trusts LLM prose as if it were a typed API. C1, H3, and C2 are the same root disease — *no structured contract between the model and the code that consumes it.* Fix that one pattern and three findings collapse.

---

## Ordered Fix Plan (code-first, not prompt-first)

| # | Goal | Why now | Expected effect |
|---|---|---|---|
| 1 | **Code-gate extraction in `analyzeProject`** — structured outputs + Zod schema + post-parse count assertion | C1 silently destroys the product's core data on any format drift | Import either persists real data or fails loudly; no more hollow "success" workspaces |
| 2 | **Unify the analyze pipelines** — make `nirmiq_analyze_project` call `lib/services/project-analyzer.service.ts` | H1: MCP users get a degraded product | One quality bar; graph + code-grounded DSA + full map everywhere |
| 3 | **Repair the session-log path** — convert `pre-bash.mjs` to a PostToolUse hook that calls the MCP tool; delete `explainWithAI` | C3: the flagship "know what your AI did" feature writes nothing | Single LLM path, single persistence path, correct lifecycle |
| 4 | **Make every MCP tool log itself** — wrap the call handler to append a `session_logs` row | M1: the audit product has no audit trail | The feature the product sells actually works |
| 5 | **Honor or trim `add_debug_log`'s schema; validate `riskLevel` enum; dedupe workspaces by path** | H2/H3/H4: silent data loss, enum corruption, duplicate state | Tool contracts become truthful and idempotent |
| 6 | **Fix free-tier risk labeling + truncation honesty** | M2/M4: mislabeled risk, silent context loss | Safer defaults; user knows when analysis was partial |

**What NOT to do:** Do not "fix" C1/H3 by adding more instructions to the prompt asking the model to "please format exactly." That is prompt-first whack-a-mole. The fix is a typed envelope the code can rely on.

---

## Structured Report (`ecc.agent-architecture-audit.report.v1`)

```json
{
  "schema_version": "ecc.agent-architecture-audit.report.v1",
  "executive_verdict": {
    "overall_health": "high_risk",
    "primary_failure_mode": "Markdown LLM prose used as an internal machine protocol; no structured contract between model output and the code that persists it.",
    "most_urgent_fix": "Replace regex-on-prose extraction in nirmiq_analyze_project with structured outputs + a post-parse count assertion."
  },
  "scope": {
    "target_name": "NirmiqLearn OS — agent surfaces (MCP server, AI analysis pipeline, Claude Code hook)",
    "model_stack": ["claude-opus-4-8 (adaptive thinking)", "local heuristic analyzer (no-key fallback)"],
    "layers_to_audit": ["6 tool-selection", "7 tool-execution", "8 tool-interpretation", "9 answer-shaping", "11 hidden-repair-loops", "12 persistence"]
  },
  "findings": [
    { "severity": "critical", "title": "Regex-on-markdown as persistence protocol in analyzeProject", "mechanism": "Model formats output as prose; regex extracts questions/concepts; any drift yields empty result with ?? '' swallowing the failure while a success message is shown.", "source_layer": "8 tool-interpretation", "root_cause": "Free-form LLM prose treated as a typed data-interchange format with no schema/validation.", "evidence_refs": ["mcp-server/ai-tools.ts:431", "mcp-server/ai-tools.ts:449", "mcp-server/ai-tools.ts:462"], "confidence": 0.90, "recommended_fix": "Structured outputs (output_config.format / strict tool) + Zod schema + assert extraction count > 0." },
    { "severity": "critical", "title": "AI tools advertise persistence they do not perform; inconsistent contract", "mechanism": "generateQuestions/suggestConcepts/debugAssist return prose telling the consuming agent to persist; analyzeProject auto-persists. Persistence depends on un-gated downstream re-calls.", "source_layer": "7 tool-execution", "root_cause": "No uniform generate-vs-persist contract across tools.", "evidence_refs": ["mcp-server/ai-tools.ts:127", "mcp-server/ai-tools.ts:182", "mcp-server/ai-tools.ts:241", "mcp-server/ai-tools.ts:441"], "confidence": 0.95, "recommended_fix": "Choose one contract: separate persist tool, or every generator auto-persists and returns IDs." },
    { "severity": "critical", "title": "Session-log pipeline severed; hook runs hidden parallel LLM pass to stderr", "mechanism": "pre-bash.mjs runs its own claude-opus-4-8 call and writes to stderr, never invoking the MCP tool that calls createSessionLog; also wrong hook lifecycle (PreToolUse for post-outcome data).", "source_layer": "11 hidden-repair-loops", "root_cause": "Hook implemented as standalone API caller and as the wrong event type.", "evidence_refs": ["hooks/pre-bash.mjs:100", "hooks/pre-bash.mjs:147", "mcp-server/index.ts:554"], "confidence": 1.0, "recommended_fix": "Convert to PostToolUse hook calling nirmiq_explain_command; delete explainWithAI; add daily cost cap." },
    { "severity": "high", "title": "Two divergent analyze-project pipelines with different output quality", "mechanism": "MCP analyzeProject lacks analyzeCode, graphJson, learning-map content, and source-grounded concept links that the web import pipeline produces.", "source_layer": "6 tool-selection", "root_cause": "MCP tool never refactored onto the shared service.", "evidence_refs": ["mcp-server/ai-tools.ts:329", "lib/services/project-analyzer.service.ts"], "confidence": 0.90, "recommended_fix": "Make nirmiq_analyze_project a thin wrapper over project-analyzer.service.ts." },
    { "severity": "high", "title": "add_debug_log silently discards 4 of 8 accepted fields", "mechanism": "Tool schema accepts actual_cause/fix_summary/lesson_learned/prevention_rule; handler passes only title/errorMessage/suspectedCause to createDebugLog.", "source_layer": "7 tool-execution", "root_cause": "Tool schema not reconciled with the service create signature.", "evidence_refs": ["mcp-server/index.ts:95", "mcp-server/index.ts:417"], "confidence": 1.0, "recommended_fix": "Trim the schema or create-then-update so all fields persist." },
    { "severity": "high", "title": "explainCommand greedy-regex JSON extraction with no enum validation", "mechanism": "/\\{[\\s\\S]+\\}/ spans first-to-last brace; riskLevel cast with `as` and never validated, corrupting downstream emoji + session_logs.", "source_layer": "8 tool-interpretation", "root_cause": "Prose-to-JSON by string match + type assertion instead of runtime validation.", "evidence_refs": ["mcp-server/ai-tools.ts:524", "mcp-server/ai-tools.ts:538"], "confidence": 0.85, "recommended_fix": "messages.parse() with Zod enum for riskLevel; normalize out-of-enum." },
    { "severity": "high", "title": "nirmiq_analyze_project is non-idempotent; duplicate workspaces on retry", "mechanism": "listWorkspaces imported but unused; every call createWorkspace inserts.", "source_layer": "12 persistence", "root_cause": "No idempotency key on resolved project path.", "evidence_refs": ["mcp-server/ai-tools.ts:251", "mcp-server/ai-tools.ts:417"], "confidence": 0.90, "recommended_fix": "Look up existing workspace by resolved path; update-or-return." },
    { "severity": "medium", "title": "MCP server does not log its own tool invocations", "mechanism": "Only nirmiq_explain_command writes session_logs; 11/12 tools leave no trail.", "source_layer": "12 persistence", "root_cause": "No call-handler-level audit wrapper.", "evidence_refs": ["mcp-server/index.ts:324"], "confidence": 0.80, "recommended_fix": "Wrap CallToolRequestSchema handler to append a session_logs row per call." },
    { "severity": "medium", "title": "Free-tier explainCommand labels every command riskLevel safe", "mechanism": "basicExplain hardcodes riskLevel:'safe' and is returned whenever Pro gate fails.", "source_layer": "9 answer-shaping", "root_cause": "No static risk heuristic in the free path.", "evidence_refs": ["mcp-server/ai-tools.ts:489"], "confidence": 1.0, "recommended_fix": "Apply static BLOCK/risk patterns in the free path." },
    { "severity": "medium", "title": "get_workspace_summary surfaces progressScore (always 0) as a real signal", "mechanism": "progressScore is never written; MCP summary reports Progress: 0% to consuming agents.", "source_layer": "8 tool-interpretation", "root_cause": "Dead metric exposed via tool output.", "evidence_refs": ["mcp-server/index.ts:338", "mcp-server/index.ts:368"], "confidence": 0.90, "recommended_fix": "Implement a real progress value or omit the field." },
    { "severity": "medium", "title": "Synchronous context gathering bounded only by slice caps", "mechanism": "getFileTree/readKeyFiles run sync IO and silently truncate with .slice; large repos block and lose context.", "source_layer": "performance", "root_cause": "No token counting or truncation signaling.", "evidence_refs": ["mcp-server/ai-tools.ts:270", "mcp-server/ai-tools.ts:344"], "confidence": 0.70, "recommended_fix": "Count tokens before send; tell the user when input was truncated." },
    { "severity": "low", "title": "extractText returns empty string when response has no text block", "mechanism": "All-thinking/no-text responses become a silent empty answer downstream.", "source_layer": "8 tool-interpretation", "root_cause": "No empty-content guard.", "evidence_refs": ["mcp-server/ai-tools.ts:50"], "confidence": 0.60, "recommended_fix": "Guard for empty text content and error explicitly." },
    { "severity": "low", "title": "Header comment claims no user-controlled injection while user input is interpolated into prompts", "mechanism": "code_snippet/error_message/command embedded into prompts; comment is false and misleads maintainers.", "source_layer": "1 prompt-assembly", "root_cause": "Inaccurate documentation.", "evidence_refs": ["mcp-server/ai-tools.ts:13", "mcp-server/ai-tools.ts:100", "mcp-server/ai-tools.ts:508"], "confidence": 0.70, "recommended_fix": "Correct the comment; do not let analyzed-code output drive privileged actions." }
  ],
  "ordered_fix_plan": [
    { "order": 1, "goal": "Code-gate extraction in analyzeProject with structured outputs + count assertion", "why_now": "C1 silently destroys core data on any format drift", "expected_effect": "Import persists real data or fails loudly" },
    { "order": 2, "goal": "Unify MCP analyze onto project-analyzer.service.ts", "why_now": "H1 gives MCP users a degraded product", "expected_effect": "One quality bar across entrypoints" },
    { "order": 3, "goal": "Repair session-log path (PostToolUse hook → MCP tool)", "why_now": "C3 means the flagship feature writes nothing", "expected_effect": "Single LLM + persistence path, correct lifecycle" },
    { "order": 4, "goal": "Audit-wrap every MCP tool call", "why_now": "M1: the audit product has no audit trail", "expected_effect": "The feature the product sells works" },
    { "order": 5, "goal": "Honor add_debug_log schema, validate risk enum, dedupe by path", "why_now": "H2/H3/H4 cause silent loss, enum corruption, duplicate state", "expected_effect": "Truthful, idempotent tool contracts" },
    { "order": 6, "goal": "Fix free-tier risk labeling + truncation honesty", "why_now": "M2/M4 mislabel risk and lose context silently", "expected_effect": "Safer defaults; partial-analysis transparency" }
  ]
}
```
