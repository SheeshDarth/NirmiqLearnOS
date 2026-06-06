# Graphify Knowledge Graph — NirmiqLearn OS

> This file is the living codebase map. Update it whenever a new file, module, or feature is added.
> AI tools should read this file INSTEAD of scanning the whole repo.
> Graphify MCP populates and queries this graph as code grows.

---

## How to Use This File

**Before coding:**
```
Read docs/GRAPHIFY_MAP.md.
Find the relevant node(s) for your task.
Read only those files. Do not load unrelated files.
```

**After coding:**
```
Update docs/GRAPHIFY_MAP.md with any new files or changed relationships.
```

---

## Phase Progress Graph

```mermaid
graph LR
    P0["✅ Phase 0\nRepo + Docs Setup"]
    P1["✅ Phase 1\nApp Shell"]
    P2["✅ Phase 2\nDatabase"]
    P3["✅ Phase 3\nWorkspaces"]
    P4["🔄 Phase 4\nLearning Maps"]
    P5["⬜ Phase 5\nExplain-Back"]
    P6["⬜ Phase 6\nDebug Lab"]
    P7["⬜ Phase 7\nDSA Bridge"]
    P8["⬜ Phase 8\nExport"]
    P9["⬜ Phase 9\nPolish"]

    P0 --> P1 --> P2 --> P3
    P3 --> P4
    P3 --> P5
    P3 --> P6
    P4 --> P5
    P5 --> P7
    P6 --> P7
    P7 --> P8
    P8 --> P9
```

---

## App Route Graph

```mermaid
graph TD
    Root["app/\nlayout.tsx"]
    Home["/ (Home)\napp/page.tsx"]
    Dashboard["  /dashboard\n  app/dashboard/page.tsx"]
    Workspaces["/workspaces\napp/workspaces/page.tsx"]
    WorkspaceDetail["/workspaces/[id]\napp/workspaces/[id]/page.tsx"]
    ExplainBack["/explain-back\napp/explain-back/page.tsx"]
    DebugLab["/debug-lab\napp/debug-lab/page.tsx"]
    DSABridge["/dsa-bridge\napp/dsa-bridge/page.tsx"]
    Settings["/settings\napp/settings/page.tsx"]

    Root --> Home
    Root --> Dashboard
    Root --> Workspaces
    Workspaces --> WorkspaceDetail
    Root --> ExplainBack
    Root --> DebugLab
    Root --> DSABridge
    Root --> Settings
```

---

## Component Dependency Graph

```mermaid
graph TD
    Layout["components/layout/\nAppShell, Sidebar, Topbar"]
    UI["components/ui/\nshadcn: Button Card Badge\nInput Textarea Tabs Dialog"]
    WorkspaceC["components/workspace/\nWorkspaceCard, CreateForm\nWorkspaceDetail"]
    LearningMapC["components/learning-map/\nMapView, ModuleCard\nCheckpointList"]
    ExplainBackC["components/explain-back/\nQuestionCard, AnswerBox\nConfidenceBadge"]
    DebugC["components/debug-lab/\nDebugLogCard, LogForm\nLessonView"]
    DashboardC["components/dashboard/\nStatsCard, ProgressRing\nWeakConceptsList"]

    Layout --> UI
    WorkspaceC --> UI
    LearningMapC --> UI
    ExplainBackC --> UI
    DebugC --> UI
    DashboardC --> UI
```

---

## Service + Database Graph

```mermaid
graph TD
    DB[("data/\nnirmiqlearn.db\nSQLite")]

    Schema["lib/db/schema.ts\nDrizzle table definitions"]
    Client["lib/db/client.ts\nDrizzle client instance"]
    Migrations["lib/db/migrations/\nSQL migration files"]

    WS["lib/services/\nworkspace.service.ts"]
    LM["lib/services/\nlearning-map.service.ts"]
    EB["lib/services/\nexplain-back.service.ts"]
    DL["lib/services/\ndebug-log.service.ts"]
    EX["lib/services/\nexport.service.ts"]

    ZWS["lib/validators/\nworkspace.schema.ts"]
    ZDL["lib/validators/\ndebug-log.schema.ts"]

    DB --> Client
    Schema --> Client
    Migrations --> DB
    Client --> WS
    Client --> LM
    Client --> EB
    Client --> DL
    Client --> EX
    ZWS --> WS
    ZDL --> DL
```

---

## Database Schema Graph

```mermaid
erDiagram
    workspaces {
        text id PK
        text title
        text description
        text type
        text goal
        text status
        integer progress_score
        integer created_at
        integer updated_at
    }
    learning_maps {
        text id PK
        text workspace_id FK
        text title
        text summary
        text modules_json
        text concepts_json
        text checkpoints_json
        integer created_at
        integer updated_at
    }
    explain_back_questions {
        text id PK
        text workspace_id FK
        text learning_map_id FK
        text question
        text difficulty
        text expected_points_json
        text user_answer
        integer score
        text confidence
        integer created_at
        integer updated_at
    }
    debug_logs {
        text id PK
        text workspace_id FK
        text title
        text error_message
        text suspected_cause
        text actual_cause
        text fix_summary
        text lesson_learned
        text prevention_rule
        integer created_at
        integer updated_at
    }
    daily_logs {
        text id PK
        text workspace_id FK
        text date
        text built_today
        text understood_today
        text unclear_topics
        text bugs_faced
        text next_action
        integer created_at
        integer updated_at
    }
    concept_links {
        text id PK
        text workspace_id FK
        text project_feature
        text concept_name
        text concept_type
        text explanation
        text practice_task
        integer created_at
        integer updated_at
    }

    workspaces ||--o{ learning_maps : "has"
    workspaces ||--o{ explain_back_questions : "has"
    workspaces ||--o{ debug_logs : "has"
    workspaces ||--o{ daily_logs : "has"
    workspaces ||--o{ concept_links : "has"
    learning_maps ||--o{ explain_back_questions : "generates"
```

---

## Feature → File Map (Quick Reference)

| Feature | Files to Read |
|---------|--------------|
| Workspace CRUD | `lib/services/workspace.service.ts`, `lib/db/schema.ts`, `app/workspaces/page.tsx`, `components/workspace/` |
| Learning Map | `lib/services/learning-map.service.ts`, `components/learning-map/`, `app/workspaces/[id]/page.tsx` |
| Explain-Back | `lib/services/explain-back.service.ts`, `components/explain-back/`, `app/explain-back/page.tsx` |
| Debug Lab | `lib/services/debug-log.service.ts`, `components/debug-lab/`, `app/debug-lab/page.tsx` |
| Dashboard | `components/dashboard/`, `app/dashboard/page.tsx` |
| Export | `lib/services/export.service.ts` |
| Layout / Navigation | `components/layout/`, `app/layout.tsx` |
| DB Schema | `lib/db/schema.ts`, `lib/db/client.ts` |
| Validation | `lib/validators/` |

---

## Current File Status

| File | Phase | Status |
|------|-------|--------|
| `app/page.tsx` | 0 | ✅ Done |
| `app/layout.tsx` | 0 | ✅ Done |
| `app/globals.css` | 0 | ✅ Done |
| `app/(app)/layout.tsx` | 1 | ✅ Done |
| `app/(app)/dashboard/page.tsx` | 1 | ✅ Done |
| `app/(app)/workspaces/page.tsx` | 1 | ✅ Done |
| `app/(app)/explain-back/page.tsx` | 1 | ✅ Done |
| `app/(app)/debug-lab/page.tsx` | 1 | ✅ Done |
| `app/(app)/dsa-bridge/page.tsx` | 1 | ✅ Done |
| `app/(app)/daily-log/page.tsx` | 1 | ✅ Done |
| `app/(app)/settings/page.tsx` | 1 | ✅ Done |
| `components/layout/AppShell.tsx` | 1 | ✅ Done |
| `components/layout/Sidebar.tsx` | 1 | ✅ Done |
| `components/layout/Topbar.tsx` | 1 | ✅ Done |
| `lib/db/schema.ts` | 2 | ✅ Done |
| `lib/db/client.ts` | 2 | ✅ Done |
| `lib/db/migrate.ts` | 2 | ✅ Done |
| `lib/db/migrations/` | 2 | ✅ Done |
| `lib/types.ts` | 2 | ✅ Done |
| `drizzle.config.ts` | 2 | ✅ Done |
| `instrumentation.ts` | 2 | ✅ Done |
| `lib/validators/workspace.schema.ts` | 3 | ✅ Done |
| `lib/services/workspace.service.ts` | 3 | ✅ Done |
| `app/(app)/workspaces/page.tsx` | 3 | ✅ Done |
| `app/(app)/workspaces/new/page.tsx` | 3 | ✅ Done |
| `app/(app)/workspaces/[id]/page.tsx` | 3 | ✅ Done |
| `app/(app)/workspaces/actions.ts` | 3 | ✅ Done |
| `components/workspace/WorkspaceCard.tsx` | 3 | ✅ Done |
| `components/workspace/CreateWorkspaceForm.tsx` | 3 | ✅ Done |
| `lib/services/learning-map.service.ts` | 4 | ⬜ Todo |
| `lib/services/explain-back.service.ts` | 5 | ⬜ Todo |
| `lib/services/debug-log.service.ts` | 6 | ⬜ Todo |
| `lib/services/export.service.ts` | 8 | ⬜ Todo |

> Update this table after completing each file.
