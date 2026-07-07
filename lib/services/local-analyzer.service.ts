/**
 * NirmiqLearn OS — Local Project Analyzer
 *
 * Analyzes a project folder without any AI API call.
 * Detects the tech stack from config files, then generates structured
 * learning content (questions + CS concepts) from curated question banks.
 *
 * Same output format as the AI analyzer so the rest of the pipeline
 * (question/concept parsing + DB writes) works identically.
 */

import { readFileSync, existsSync } from "fs";
import path from "path";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DetectedStack {
  primaryFramework: string | null;
  language: "typescript" | "javascript" | "python" | "go" | "rust" | "java" | "other";
  database: string | null;
  orm: string | null;
  cssFramework: string | null;
  stateManagement: string | null;
  auth: string | null;
  allDeps: string[];
  projectName: string;
  description: string;
  readmeContent: string;
}

// ── Dependency detection ───────────────────────────────────────────────────────

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function readText(filePath: string, maxChars = 2000): string {
  try {
    return readFileSync(filePath, "utf-8").slice(0, maxChars);
  } catch {
    return "";
  }
}

function extractReadmeDescription(readme: string): string {
  if (!readme) return "";
  // Skip badge lines, headings, and empty lines — grab first real paragraph
  const lines = readme.split("\n");
  const paragraphLines: string[] = [];
  let inParagraph = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("![") || trimmed.startsWith("[![") || trimmed.startsWith(">")) {
      if (inParagraph) break;
      continue;
    }
    inParagraph = true;
    paragraphLines.push(trimmed);
    if (paragraphLines.length >= 3) break;
  }
  return paragraphLines.join(" ").slice(0, 400);
}

export function detectStack(projectPath: string, projectName: string): DetectedStack {
  const allDeps: string[] = [];
  let language: DetectedStack["language"] = "other";
  let primaryFramework: string | null = null;
  let database: string | null = null;
  let orm: string | null = null;
  let cssFramework: string | null = null;
  let stateManagement: string | null = null;
  let auth: string | null = null;
  let description = "";
  let readmeContent = "";

  // README
  for (const name of ["README.md", "readme.md", "README.txt", "README"]) {
    const p = path.join(projectPath, name);
    if (existsSync(p)) { readmeContent = readText(p, 3000); break; }
  }
  description = extractReadmeDescription(readmeContent);

  // package.json (JS/TS ecosystem)
  const pkgPath = path.join(projectPath, "package.json");
  const pkg = readJson(pkgPath);
  if (pkg) {
    language = "javascript";
    if (!description && typeof pkg.description === "string") description = pkg.description;

    const deps: string[] = [
      ...Object.keys((pkg.dependencies as Record<string, string>) ?? {}),
      ...Object.keys((pkg.devDependencies as Record<string, string>) ?? {}),
    ];
    allDeps.push(...deps);

    // Detect TypeScript
    if (deps.includes("typescript") || existsSync(path.join(projectPath, "tsconfig.json"))) {
      language = "typescript";
    }

    // Primary framework
    if (deps.includes("next")) primaryFramework = "Next.js";
    else if (deps.includes("@remix-run/react")) primaryFramework = "Remix";
    else if (deps.includes("nuxt")) primaryFramework = "Nuxt";
    else if (deps.includes("@sveltejs/kit")) primaryFramework = "SvelteKit";
    else if (deps.includes("svelte")) primaryFramework = "Svelte";
    else if (deps.includes("@angular/core")) primaryFramework = "Angular";
    else if (deps.includes("vue")) primaryFramework = "Vue";
    else if (deps.includes("react")) primaryFramework = "React";
    else if (deps.includes("express")) primaryFramework = "Express";
    else if (deps.includes("fastify")) primaryFramework = "Fastify";
    else if (deps.includes("hono")) primaryFramework = "Hono";
    else if (deps.includes("@nestjs/core")) primaryFramework = "NestJS";

    // Database
    if (deps.includes("better-sqlite3") || deps.includes("@libsql/client")) database = "SQLite";
    else if (deps.includes("pg") || deps.includes("postgres") || deps.includes("@vercel/postgres")) database = "PostgreSQL";
    else if (deps.includes("mysql2") || deps.includes("mysql")) database = "MySQL";
    else if (deps.includes("mongodb") || deps.includes("mongoose")) database = "MongoDB";
    else if (deps.includes("@planetscale/database")) database = "PlanetScale (MySQL)";
    else if (deps.includes("@upstash/redis") || deps.includes("ioredis") || deps.includes("redis")) database = "Redis";

    // ORM / query builder
    if (deps.includes("drizzle-orm")) orm = "Drizzle ORM";
    else if (deps.includes("prisma") || deps.includes("@prisma/client")) orm = "Prisma";
    else if (deps.includes("typeorm")) orm = "TypeORM";
    else if (deps.includes("sequelize")) orm = "Sequelize";
    else if (deps.includes("knex")) orm = "Knex";
    else if (deps.includes("@mikro-orm/core")) orm = "MikroORM";

    // CSS framework
    if (deps.includes("tailwindcss")) cssFramework = "Tailwind CSS";
    else if (deps.includes("bootstrap")) cssFramework = "Bootstrap";
    else if (deps.includes("@mui/material")) cssFramework = "Material UI";
    else if (deps.includes("@chakra-ui/react")) cssFramework = "Chakra UI";
    else if (deps.includes("styled-components")) cssFramework = "styled-components";
    else if (deps.includes("@emotion/react")) cssFramework = "Emotion";

    // State management
    if (deps.includes("zustand")) stateManagement = "Zustand";
    else if (deps.includes("redux") || deps.includes("@reduxjs/toolkit")) stateManagement = "Redux";
    else if (deps.includes("jotai")) stateManagement = "Jotai";
    else if (deps.includes("recoil")) stateManagement = "Recoil";
    else if (deps.includes("mobx")) stateManagement = "MobX";

    // Auth
    if (deps.includes("next-auth") || deps.includes("@auth/core")) auth = "NextAuth.js";
    else if (deps.includes("@clerk/nextjs") || deps.includes("@clerk/clerk-sdk-node")) auth = "Clerk";
    else if (deps.includes("lucia")) auth = "Lucia";
    else if (deps.includes("passport")) auth = "Passport.js";
    else if (deps.includes("jsonwebtoken")) auth = "JWT (jsonwebtoken)";
  }

  // Python ecosystem
  const reqPath = path.join(projectPath, "requirements.txt");
  const pyprojectPath = path.join(projectPath, "pyproject.toml");
  if (existsSync(reqPath) || existsSync(pyprojectPath)) {
    language = "python";
    const reqs = readText(reqPath) + readText(pyprojectPath);
    allDeps.push(...reqs.split(/[\n,\s]+/).filter(Boolean));
    if (reqs.includes("django")) primaryFramework = "Django";
    else if (reqs.includes("fastapi")) primaryFramework = "FastAPI";
    else if (reqs.includes("flask")) primaryFramework = "Flask";
    else if (reqs.includes("starlette")) primaryFramework = "Starlette";
    if (reqs.includes("sqlalchemy")) orm = "SQLAlchemy";
    if (reqs.includes("sqlite") || reqs.includes("aiosqlite")) database = "SQLite";
    else if (reqs.includes("psycopg") || reqs.includes("asyncpg")) database = "PostgreSQL";
    else if (reqs.includes("pymongo")) database = "MongoDB";
  }

  // Go
  const goModPath = path.join(projectPath, "go.mod");
  if (existsSync(goModPath)) {
    language = "go";
    const goMod = readText(goModPath);
    if (goMod.includes("gin-gonic/gin")) primaryFramework = "Gin";
    else if (goMod.includes("gofiber/fiber")) primaryFramework = "Fiber";
    else if (goMod.includes("labstack/echo")) primaryFramework = "Echo";
    else if (goMod.includes("go-chi/chi")) primaryFramework = "Chi";
    else primaryFramework = "Go (net/http)";
    if (goMod.includes("gorm.io")) orm = "GORM";
    if (goMod.includes("mattn/go-sqlite3") || goMod.includes("modernc.org/sqlite")) database = "SQLite";
    else if (goMod.includes("lib/pq") || goMod.includes("jackc/pgx")) database = "PostgreSQL";
    allDeps.push(...goMod.split("\n").filter(l => l.trim().startsWith("github.com") || l.trim().startsWith("golang.org")));
  }

  // Rust
  const cargoPath = path.join(projectPath, "Cargo.toml");
  if (existsSync(cargoPath)) {
    language = "rust";
    const cargo = readText(cargoPath);
    if (cargo.includes("axum")) primaryFramework = "Axum";
    else if (cargo.includes("actix-web")) primaryFramework = "Actix Web";
    else if (cargo.includes("rocket")) primaryFramework = "Rocket";
    if (cargo.includes("rusqlite") || cargo.includes("sqlx")) database = "SQLite";
  }

  // Java
  if (existsSync(path.join(projectPath, "pom.xml")) || existsSync(path.join(projectPath, "build.gradle"))) {
    language = "java";
    const pom = readText(path.join(projectPath, "pom.xml")) + readText(path.join(projectPath, "build.gradle"));
    if (pom.includes("spring-boot") || pom.includes("spring-web")) primaryFramework = "Spring Boot";
    else if (pom.includes("quarkus")) primaryFramework = "Quarkus";
    if (pom.includes("hibernate")) orm = "Hibernate";
    if (pom.includes("h2")) database = "H2 (embedded)";
    else if (pom.includes("postgresql")) database = "PostgreSQL";
  }

  return {
    primaryFramework,
    language,
    database,
    orm,
    cssFramework,
    stateManagement,
    auth,
    allDeps,
    projectName,
    description,
    readmeContent,
  };
}

// ── Question banks ─────────────────────────────────────────────────────────────
// Each entry: [difficulty, question]

type Q = [string, string];

const QUESTION_BANKS: Record<string, Q[]> = {
  "Next.js": [
    ["beginner", "What is the difference between a Server Component and a Client Component in Next.js? Which one should you use by default and why?"],
    ["beginner", "What does the `app/` folder in Next.js App Router replace, and why did the Next.js team make this change?"],
    ["intermediate", "Explain what happens step-by-step when a user navigates to a page in this Next.js app — from the HTTP request arriving to the HTML appearing in the browser."],
    ["intermediate", "What is a Server Action in Next.js? How does data flow from a form submission all the way to the database without a manual API route?"],
    ["intermediate", "What is the App Router's `layout.tsx` file and why does nesting layouts matter for performance and UX?"],
    ["advanced", "Next.js uses partial pre-rendering (PPR) and streaming. Explain what these are and how they change the traditional request-response cycle."],
    ["advanced", "What is the difference between `revalidatePath`, `revalidateTag`, and `cache()` in Next.js? When would you use each?"],
    ["advanced", "How does Next.js handle hydration, and what causes hydration errors? How would you debug one?"],
    ["expert", "Compare Next.js App Router's data fetching model to the Pages Router's `getServerSideProps`. What are the architectural trade-offs?"],
    ["expert", "If this app grew to 100,000 daily active users, what would be the first three bottlenecks to address in the Next.js layer specifically?"],
  ],
  "React": [
    ["beginner", "What is JSX and why does React use it instead of plain JavaScript strings to describe the UI?"],
    ["beginner", "Explain the difference between `props` and `state` in React. When would you store something in state vs passing it as a prop?"],
    ["intermediate", "What is the Virtual DOM and why did React's creators introduce it instead of directly updating the real DOM?"],
    ["intermediate", "Explain the React component lifecycle. When does `useEffect` run, and why does returning a cleanup function matter?"],
    ["intermediate", "What is the difference between controlled and uncontrolled components in React forms?"],
    ["advanced", "What causes unnecessary re-renders in React and how do `useMemo`, `useCallback`, and `React.memo` each address it?"],
    ["advanced", "Explain React's reconciliation algorithm (diffing). What heuristics does it use and why does `key` matter?"],
    ["advanced", "What is React's concurrent mode and how does it change the rendering behavior vs the legacy synchronous model?"],
    ["expert", "Describe the trade-offs between React Server Components and client-side rendering for a data-heavy application."],
    ["expert", "How would you architect a large React app to avoid prop drilling without reaching for global state management?"],
  ],
  "Express": [
    ["beginner", "What is middleware in Express and why is the order in which you register middleware with `app.use()` critical?"],
    ["beginner", "Explain the difference between `req.params`, `req.query`, and `req.body` in an Express route handler."],
    ["intermediate", "How does Express handle asynchronous errors? Why doesn't a `try/catch` inside an `async` route handler automatically pass errors to the error middleware?"],
    ["intermediate", "What is the difference between `express.Router()` and defining routes directly on `app`? When would you use each?"],
    ["intermediate", "Explain how CORS works and why you need to configure it in this Express app."],
    ["advanced", "How would you implement rate limiting in this Express application and where in the middleware chain should it live?"],
    ["advanced", "What are the security implications of using `req.body` without validation, and how would you add Zod or Joi validation here?"],
    ["advanced", "Explain the event loop and how Node.js handles concurrent requests despite being single-threaded. What would block the event loop in an Express app?"],
    ["expert", "Compare Express (callback/middleware model) to Fastify or Hono. What are the performance and DX trade-offs?"],
    ["expert", "How would you scale this Express application horizontally, and what session/state management problems would you need to solve?"],
  ],
  "Vue": [
    ["beginner", "What is the difference between the Options API and Composition API in Vue 3, and which should you use in a new project?"],
    ["beginner", "Explain `v-model` in Vue — what HTML attribute and event does it bind to under the hood?"],
    ["intermediate", "What is Vue's reactivity system and how does it track which components need to re-render when data changes?"],
    ["intermediate", "What is the difference between `computed` and `watch` in Vue? When should you use each?"],
    ["intermediate", "Explain the Vue component lifecycle hooks. When do `onMounted` and `onBeforeUnmount` fire?"],
    ["advanced", "How does Vue 3's `<Suspense>` component work and when would you use it?"],
    ["advanced", "What is Pinia and how does it differ from Vuex? What makes Pinia simpler to use with the Composition API?"],
    ["advanced", "Explain Vue's virtual DOM diffing and why the `key` attribute is critical in `v-for` loops."],
    ["expert", "How would you optimize a large Vue application that has performance issues — what tools would you use to diagnose and what patterns would you apply?"],
    ["expert", "Compare Vue's approach to state management and component communication to React's. What are the philosophical differences?"],
  ],
  "Django": [
    ["beginner", "What is Django's MVT (Model-View-Template) pattern? How does it differ from MVC?"],
    ["beginner", "What is a Django migration and why is it dangerous to delete migration files or edit them after they've been applied?"],
    ["intermediate", "Explain how Django's ORM generates SQL from Python model queries. What is the `queryset` lazy evaluation model?"],
    ["intermediate", "What is Django's request/response cycle — from a URL being requested to the HTTP response being sent?"],
    ["intermediate", "What is the difference between `ForeignKey`, `OneToOneField`, and `ManyToManyField` in Django models?"],
    ["advanced", "What are Django signals and when should you use them? What are the risks of overusing them?"],
    ["advanced", "How does Django's authentication system work under the hood? How are sessions stored and how does `request.user` get populated?"],
    ["advanced", "Explain Django's `select_related` and `prefetch_related`. How do they solve the N+1 query problem?"],
    ["expert", "How would you optimize a Django view that's running 50+ database queries per request?"],
    ["expert", "Compare Django's monolithic approach to FastAPI's async, schema-first approach. When would you choose each?"],
  ],
  "FastAPI": [
    ["beginner", "What is Pydantic and why does FastAPI use it for request and response models?"],
    ["beginner", "What does `async def` in a FastAPI route handler do differently from a regular `def`? When does it matter?"],
    ["intermediate", "How does FastAPI automatically generate OpenAPI (Swagger) documentation from your code? What decorators and type hints drive it?"],
    ["intermediate", "Explain dependency injection in FastAPI — what is `Depends()` and how does it let you share logic across routes?"],
    ["intermediate", "What is the difference between path parameters, query parameters, and request body in FastAPI routing?"],
    ["advanced", "How does FastAPI handle concurrent requests? Explain the relationship between async routes, threading, and the event loop."],
    ["advanced", "What is Alembic and how do you use it with FastAPI to manage database schema migrations?"],
    ["advanced", "How would you add JWT authentication to this FastAPI app using the `Depends` system?"],
    ["expert", "Compare FastAPI's async approach to Django's synchronous ORM. What problems arise when mixing async views with synchronous SQLAlchemy?"],
    ["expert", "How would you structure a large FastAPI application as the codebase grows — routers, services, repositories, schemas?"],
  ],
  "Go": [
    ["beginner", "What is a goroutine and how does it differ from a thread? Why can you spin up thousands of goroutines without running out of memory?"],
    ["beginner", "Explain Go's error handling pattern — why does Go return errors as values instead of throwing exceptions?"],
    ["intermediate", "What is a channel in Go and how do goroutines use channels to communicate safely without shared mutable state?"],
    ["intermediate", "Explain Go's interface system. How is it different from interfaces in Java or TypeScript? What is 'duck typing'?"],
    ["intermediate", "What is a Go module (`go.mod`) and how does Go's dependency management differ from npm or pip?"],
    ["advanced", "Explain the `context.Context` pattern in Go. Why is it passed as the first argument to almost every function in idiomatic Go?"],
    ["advanced", "What is Go's garbage collector and how does it affect performance in a high-throughput web server?"],
    ["advanced", "What is the difference between a mutex and a channel for synchronizing goroutines? When would you prefer each?"],
    ["expert", "How would you profile and optimize a Go HTTP handler that has high latency under load?"],
    ["expert", "Explain Go's memory model and why accessing a variable from multiple goroutines without synchronization is a data race, even if the operation seems atomic."],
  ],
  "SQLite": [
    ["beginner", "What is SQLite and how does it differ from a database like PostgreSQL or MySQL? Why would you choose SQLite for this project?"],
    ["intermediate", "What is WAL (Write-Ahead Logging) mode in SQLite and why does it improve concurrent read performance?"],
    ["intermediate", "Explain SQLite's ACID guarantees. What happens if the process crashes halfway through a write transaction?"],
    ["advanced", "What are the concurrency limitations of SQLite and how do they affect this application under high load?"],
    ["advanced", "How do SQLite indexes work (B-tree structure) and how would you decide which columns to index?"],
  ],
  "Drizzle ORM": [
    ["intermediate", "What is Drizzle ORM and what problem does it solve compared to writing raw SQL? How does it guarantee type safety?"],
    ["intermediate", "How do Drizzle migrations work? What happens when you run `drizzle-kit push` vs generating a migration file?"],
    ["advanced", "Explain how Drizzle's query builder constructs SQL. What is the difference between `db.select()`, `db.insert()`, and `db.transaction()`?"],
    ["advanced", "How would you write a Drizzle query with a join, and how does TypeScript know the shape of the result?"],
  ],
  "Prisma": [
    ["beginner", "What is a Prisma schema file and how does it differ from writing SQL CREATE TABLE statements?"],
    ["intermediate", "What is the difference between `prisma db push` and `prisma migrate dev`? When should you use each?"],
    ["intermediate", "How does Prisma Client auto-complete know the shape of every query result at compile time?"],
    ["advanced", "What is the N+1 problem in Prisma and how do you use `include` vs `select` to avoid unnecessary queries?"],
    ["advanced", "Explain Prisma's connection pooling. Why does it matter in a serverless or edge environment?"],
  ],
  "TypeScript": [
    ["beginner", "What is the difference between `interface` and `type` in TypeScript? When would you choose one over the other?"],
    ["beginner", "What does the `unknown` type mean in TypeScript and how does it differ from `any`? Why is `unknown` safer?"],
    ["intermediate", "Explain TypeScript's structural (duck) typing. How does it differ from nominal typing in Java or C#?"],
    ["intermediate", "What are generics in TypeScript? Write a simple generic function and explain what the type parameter does."],
    ["intermediate", "What is a discriminated union in TypeScript and why is it useful for modeling state (e.g., loading/success/error)?"],
    ["advanced", "What is TypeScript's `infer` keyword and how is it used in conditional types?"],
    ["advanced", "Explain how `as const`, `satisfies`, and `readonly` differ. When would you use each?"],
  ],
  "Tailwind CSS": [
    ["beginner", "What is utility-first CSS (Tailwind's approach)? How does it differ from writing traditional CSS classes?"],
    ["intermediate", "How does Tailwind's JIT (Just-In-Time) compiler work and why does it keep the production CSS bundle small?"],
    ["intermediate", "What is the `@apply` directive in Tailwind and when should you avoid it?"],
    ["advanced", "How would you create a custom design system (colors, fonts, spacing) in Tailwind without fighting the defaults?"],
  ],
  "Zustand": [
    ["beginner", "What problem does Zustand solve compared to passing state down through props? What is 'prop drilling'?"],
    ["intermediate", "How does Zustand's `set` function trigger re-renders only in components that subscribed to the changed slice of state?"],
    ["advanced", "What is the difference between Zustand and React Context for state management? When does Zustand's performance advantage matter?"],
  ],
  "general": [
    ["beginner", "What does this project do in plain English? Explain it to someone who has never seen code before."],
    ["beginner", "What is version control (Git) and why is every file in this project tracked by it?"],
    ["intermediate", "What is an API and how does data flow between the frontend and backend of this application?"],
    ["intermediate", "What is a REST API? Explain the difference between GET, POST, PUT, and DELETE requests."],
    ["intermediate", "What is a database and why does this project use one instead of storing data in a file?"],
    ["advanced", "What are the most important security risks in this application and how are they mitigated?"],
    ["advanced", "How would you add automated tests to this project? What would you test first and why?"],
    ["advanced", "What does 'deployment' mean for this project? Walk through every step needed to put it in production."],
    ["expert", "What are the scalability bottlenecks in this application's current architecture?"],
    ["expert", "If you had to refactor the most fragile part of this codebase, what would it be and why?"],
  ],
};

// ── CS concept maps ────────────────────────────────────────────────────────────

interface Concept {
  name: string;
  type: string;
  explanation: string;
}

const CONCEPT_MAPS: Record<string, Concept[]> = {
  "Next.js": [
    { name: "Server-Side Rendering (SSR)", type: "Web Architecture", explanation: "The server generates complete HTML for each request — this project's dynamic pages use SSR so the browser receives rendered content instantly without waiting for JavaScript" },
    { name: "Static Site Generation (SSG)", type: "Performance Pattern", explanation: "Pages are pre-built at compile time as static HTML files, served from CDN with zero server computation — the fastest possible page load" },
    { name: "Hydration", type: "Browser/Runtime", explanation: "After the server sends HTML, React 'hydrates' it by attaching event listeners — this is why Client Components ship JavaScript to the browser but Server Components don't" },
    { name: "File-Based Routing", type: "Framework Convention", explanation: "The folder structure inside `app/` directly maps to URL paths — creating a file at `app/users/page.tsx` automatically creates the `/users` route" },
    { name: "Server Actions", type: "Data Fetching Pattern", explanation: "Functions marked `'use server'` run on the server when called from a form or button — eliminating the need for a separate API endpoint for mutations" },
  ],
  "React": [
    { name: "Virtual DOM", type: "Rendering Algorithm", explanation: "React keeps an in-memory copy of the UI tree and only updates the real DOM where things changed — avoiding expensive full-page repaints on every state change" },
    { name: "Unidirectional Data Flow", type: "Architecture Pattern", explanation: "Data flows down from parent to child via props, events flow up via callbacks — this predictable one-way flow makes debugging easier than two-way binding" },
    { name: "Component Composition", type: "Design Pattern", explanation: "Complex UIs are built from small, reusable components — like Lego bricks — rather than monolithic templates, making it easier to test and reuse UI logic" },
    { name: "Reconciliation", type: "Diffing Algorithm", explanation: "React's algorithm for comparing the old and new virtual DOM trees to find the minimum set of real DOM changes — the `key` prop helps it identify list items correctly" },
    { name: "Hooks (useState/useEffect)", type: "State Management", explanation: "Functions that let functional components use React features like state and lifecycle — replacing the need for class components" },
  ],
  "Express": [
    { name: "Middleware Pattern", type: "Software Architecture", explanation: "Each Express middleware is a function that receives (req, res, next) and either responds or passes control to the next function — this composes authentication, logging, and validation as independent layers" },
    { name: "Event Loop (Node.js)", type: "Runtime / Concurrency", explanation: "Node.js handles concurrent requests on a single thread using non-blocking I/O — database queries and file reads are async so the event loop can serve other requests while waiting" },
    { name: "REST (Representational State Transfer)", type: "API Design", explanation: "This API uses HTTP methods (GET/POST/PUT/DELETE) and status codes (200/404/500) as a convention — making it predictable for any client to consume" },
    { name: "JSON Serialization", type: "Data Format", explanation: "Data sent over HTTP is serialized to JSON text and deserialized back to objects — `express.json()` middleware does this automatically for request bodies" },
    { name: "HTTP Request/Response Cycle", type: "Networking", explanation: "Every client interaction follows: request arrives → middleware chain runs → route handler executes → response sent — understanding this chain explains every Express behavior" },
  ],
  "Django": [
    { name: "ORM (Object-Relational Mapping)", type: "Database Abstraction", explanation: "Django's ORM lets you query the database using Python objects instead of SQL strings — `User.objects.filter(active=True)` generates the correct SQL automatically" },
    { name: "MVT (Model-View-Template)", type: "Architecture Pattern", explanation: "Models define data structure, Views contain business logic, Templates render HTML — separating concerns so each can be changed independently" },
    { name: "Migrations", type: "Schema Management", explanation: "Django tracks every change to your models as a numbered migration file — applying them in order ensures every environment (dev/staging/prod) has the same schema" },
    { name: "HTTP Request/Response Cycle", type: "Web Framework", explanation: "Django routes each URL to a view function that receives a request object and must return a response — middleware wraps this cycle adding authentication, sessions, and CSRF protection" },
    { name: "QuerySet Lazy Evaluation", type: "Performance Pattern", explanation: "Django ORM queries aren't executed until you iterate them — you can chain `.filter()`, `.exclude()`, `.order_by()` without hitting the database until the final moment" },
  ],
  "FastAPI": [
    { name: "Async/Await (Coroutines)", type: "Concurrency Model", explanation: "FastAPI route handlers marked `async def` can pause while waiting for I/O (database, network) and serve other requests in the meantime — without extra threads" },
    { name: "Pydantic Validation", type: "Data Validation", explanation: "Every request body and response is validated against a Pydantic model at runtime — invalid data returns a 422 error with field-level detail before your code even runs" },
    { name: "Dependency Injection", type: "Design Pattern", explanation: "FastAPI's `Depends()` system auto-resolves shared dependencies (database session, current user) and injects them into route handlers — eliminating boilerplate" },
    { name: "OpenAPI Schema", type: "API Specification", explanation: "FastAPI auto-generates an OpenAPI JSON schema from your route definitions and Pydantic models — powering the `/docs` interactive UI and enabling client code generation" },
    { name: "ASGI (Async Server Gateway Interface)", type: "Web Standard", explanation: "FastAPI runs on ASGI (via Uvicorn) instead of WSGI — enabling async/await, WebSockets, and streaming responses that traditional WSGI servers cannot handle" },
  ],
  "Go": [
    { name: "Goroutines", type: "Concurrency Primitive", explanation: "Goroutines are cheap, cooperatively-scheduled green threads — you can run thousands concurrently where operating-system threads would exhaust memory" },
    { name: "Channels", type: "Communication Primitive", explanation: "Go's motto: 'Do not communicate by sharing memory; share memory by communicating.' Channels pass data between goroutines safely without locks" },
    { name: "Interfaces (Implicit)", type: "Type System", explanation: "Go types automatically satisfy an interface if they implement all its methods — no `implements` keyword needed, enabling loose coupling and easy testing with mocks" },
    { name: "Defer", type: "Resource Management", explanation: "`defer` schedules a function to run when the surrounding function returns — used for closing files, releasing locks, and logging, ensuring cleanup even on errors" },
    { name: "Error Values", type: "Error Handling", explanation: "Go functions return errors as plain values instead of throwing exceptions — callers must explicitly check `if err != nil`, making error paths visible in the code" },
  ],
  "SQLite": [
    { name: "ACID Transactions", type: "Database Guarantees", explanation: "Atomicity, Consistency, Isolation, Durability — SQLite wraps every write in a transaction that either completes fully or rolls back entirely, preventing partial writes" },
    { name: "B-Tree Indexes", type: "Data Structures", explanation: "SQLite stores index data in a balanced B-tree — allowing O(log n) lookups instead of O(n) full-table scans, critical for performance as the table grows" },
    { name: "WAL Mode", type: "Concurrency Pattern", explanation: "Write-Ahead Logging lets readers and writers operate simultaneously — writers append to a log file while readers see a consistent snapshot of the main database" },
  ],
  "Drizzle ORM": [
    { name: "Type-Safe Query Builder", type: "ORM Pattern", explanation: "Drizzle generates TypeScript types from your schema — the return type of every query is known at compile time, so TypeScript catches shape mismatches before runtime" },
    { name: "Schema as Source of Truth", type: "Data Modeling", explanation: "Your Drizzle schema file is the single definition of your database tables — migrations are generated from schema diffs, keeping TypeScript types and SQL schema in sync" },
  ],
  "Prisma": [
    { name: "Schema-First Design", type: "Data Modeling", explanation: "The Prisma schema file defines models in a DSL that generates both the database tables (via migrations) and the TypeScript client — one source of truth for both" },
    { name: "Auto-generated Client", type: "Code Generation", explanation: "Prisma generates a fully-typed Client from your schema — `prisma.user.findMany({ where: { active: true } })` has TypeScript types for every field and relation" },
  ],
  "TypeScript": [
    { name: "Static Type System", type: "Language Feature", explanation: "TypeScript catches type errors at compile time instead of runtime — a mistake like passing a string where a number is expected fails before the code runs" },
    { name: "Structural Typing", type: "Type System", explanation: "TypeScript checks types by shape, not name — any object with the right fields satisfies an interface, making the system flexible while still catching real errors" },
    { name: "Generics", type: "Abstraction Pattern", explanation: "Generic types let you write code that works for many types while staying type-safe — like a `ServiceResult<T>` that can be `ServiceResult<User>` or `ServiceResult<Post>`" },
    { name: "Discriminated Unions", type: "Type Pattern", explanation: "A union type with a shared literal field (e.g. `status: 'ok' | 'error'`) lets TypeScript narrow the type in each branch, ensuring you handle both cases" },
  ],
  "Tailwind CSS": [
    { name: "Utility-First CSS", type: "CSS Methodology", explanation: "Instead of writing `.card { padding: 16px; border-radius: 8px; }`, you compose pre-built utilities like `p-4 rounded-lg` directly in HTML — eliminating CSS file bloat" },
    { name: "JIT Compilation", type: "Build Optimization", explanation: "Tailwind scans your source files and generates only the CSS classes you actually used — a production Tailwind bundle is often under 10KB vs 300KB+ for a full CSS framework" },
    { name: "Design Tokens", type: "Design System", explanation: "Tailwind's `tailwind.config` lets you define brand colors, spacing, and fonts as tokens — `bg-brand-500` means the same thing everywhere, enforcing visual consistency" },
  ],
  "general": [
    { name: "Separation of Concerns", type: "Architecture Principle", explanation: "Each layer of this project has one responsibility — the UI doesn't know about the database, the database layer doesn't know about HTTP — making each part easier to change" },
    { name: "CRUD Operations", type: "Data Patterns", explanation: "Create, Read, Update, Delete — the four fundamental operations this project performs on its data. Every feature maps to one or more of these verbs" },
    { name: "Environment Variables", type: "Configuration", explanation: "Secrets and environment-specific config live in `.env.local` instead of code — so the same codebase works in development, staging, and production without changes" },
    { name: "HTTP Status Codes", type: "Web Standard", explanation: "200 = OK, 201 = Created, 400 = Bad Request, 401 = Unauthorized, 404 = Not Found, 500 = Server Error — this project's API uses these to signal what happened" },
    { name: "Async/Await", type: "Concurrency Pattern", explanation: "I/O operations (database, network) are non-blocking — `await` pauses that function but lets other code run, preventing the server from freezing on slow operations" },
  ],
};

// ── Failure modes / fragility ──────────────────────────────────────────────────

const RISK_MAPS: Record<string, string[]> = {
  "Next.js": [
    "Server Components accidentally importing browser-only code (window, document) — will crash at build time with a confusing error",
    "Missing `'use client'` on components that use hooks like useState or useEffect — will throw runtime errors that look like server errors",
    "Forgetting `export const dynamic = 'force-dynamic'` on pages that read from the database — Next.js may cache the page and serve stale data",
    "Server Actions not validating input before writing to the database — a malicious user can send any data shape",
  ],
  "Express": [
    "Unhandled promise rejections in async route handlers — Express won't catch them without `express-async-errors` or explicit try/catch",
    "Missing input validation on request bodies — any data shape can reach your database without Zod or Joi",
    "Storing session state in-memory — crashes lose all sessions, and horizontal scaling breaks without a shared session store (Redis)",
    "Blocking the event loop with CPU-intensive synchronous operations — will freeze the server for all users",
  ],
  "Django": [
    "N+1 queries — a loop that accesses a related object triggers one SQL query per iteration instead of one total query with `select_related`",
    "Forgetting `ALLOWED_HOSTS` in production — allows HTTP host header injection attacks",
    "Running migrations without a backup in production — a bad migration can corrupt or delete data",
    "Debug mode (`DEBUG=True`) leaking full stack traces with environment variables to users in production",
  ],
  "SQLite": [
    "Write contention — SQLite only allows one writer at a time; under concurrent writes without WAL mode, requests queue up and timeout",
    "The database file growing unboundedly without periodic `VACUUM` — deleted rows leave gaps that aren't reclaimed automatically",
    "No connection pooling — every connection opens the file from disk; too many connections degrade performance",
  ],
  "general": [
    "Environment variable missing in production — features that work locally fail silently or crash in production",
    "No error boundary — one unhandled exception can bring down the entire application instead of just the affected feature",
    "Secrets committed to git history — even if removed later, the secret is permanently exposed in the git log",
    "No input validation — user-supplied data that reaches the database or file system can cause injection attacks or data corruption",
  ],
};

// ── Learning areas ─────────────────────────────────────────────────────────────

const LEARNING_AREAS: Record<string, string[]> = {
  "Next.js": [
    "Server vs Client Components — understanding the boundary is the most critical Next.js concept; getting it wrong causes build failures and security issues",
    "Data fetching with Server Actions and `fetch()` — how data flows from the database to the UI without a separate REST API",
    "Routing and layouts — how the `app/` folder structure creates nested routes with shared UI",
    "Caching and revalidation — Next.js caches aggressively by default; knowing when to opt out prevents stale data bugs",
    "TypeScript strict mode — this codebase uses strict types throughout; understanding type errors is essential to making changes safely",
  ],
  "Express": [
    "Middleware chain — every request flows through middleware in order; understanding this explains authentication, CORS, and error handling",
    "Async error handling — async route handlers need explicit error forwarding; this is the most common Express bug in the wild",
    "HTTP methods and REST conventions — GET, POST, PUT, DELETE each have a semantic meaning that this API follows",
    "Input validation and sanitization — every endpoint that accepts user data should validate it before touching the database",
    "Node.js event loop — understanding why blocking operations are dangerous in a Node server helps you write performant routes",
  ],
  "Django": [
    "Django's ORM — QuerySets are lazy, chainable, and generate SQL; understanding them prevents N+1 bugs and enables complex queries",
    "URL routing and views — how Django maps a URL to a Python function and what the request/response cycle looks like",
    "Migrations — every schema change needs a migration; knowing how to create, apply, and rollback them safely is essential",
    "Django's authentication system — sessions, middleware, `request.user`, and the permission system are all connected",
    "Django admin — auto-generated CRUD admin for your models; powerful for internal tools but needs customization for production use",
  ],
  "FastAPI": [
    "Pydantic models — every request and response is validated against a schema; understanding Pydantic's type system is fundamental",
    "Dependency injection with `Depends` — FastAPI's DI system handles database sessions, authentication, and shared logic cleanly",
    "Async vs sync route handlers — when to use `async def` vs `def` and how mixing them affects performance",
    "SQLAlchemy sessions — async sessions require careful lifecycle management to avoid stale data and connection leaks",
    "OpenAPI documentation — FastAPI generates docs from your code; keeping your Pydantic schemas accurate is what keeps the docs useful",
  ],
  "Go": [
    "Goroutines and channels — the core of Go's concurrency model; understanding them prevents data races and deadlocks",
    "Error handling — Go's explicit `error` return values require every caller to decide what to do with failures",
    "Interfaces — Go's implicit interface satisfaction enables loose coupling and makes unit testing straightforward",
    "Context propagation — passing `context.Context` through call chains enables cancellation and deadline enforcement across the whole request",
    "Struct embedding and methods — Go's alternative to inheritance; knowing how method sets work prevents subtle bugs",
  ],
  "general": [
    "Project architecture — how the codebase is organized into layers (UI, business logic, data) and why that structure was chosen",
    "Data model — what data this application stores, how it's structured, and what the relationships between entities mean",
    "Authentication and authorization — if the app has users, how it knows who's logged in and what they're allowed to do",
    "Error handling strategy — how errors are caught, logged, and communicated to the user throughout the application",
    "Deployment and environment — what environment variables, secrets, and infrastructure the app needs to run in production",
  ],
};

// ── Main generator ─────────────────────────────────────────────────────────────

export function generateLocalAnalysisText(
  stack: DetectedStack,
  fileTree: string
): string {
  const fw = stack.primaryFramework;
  const lang = stack.language;
  const db = stack.database;
  const orm = stack.orm;

  // ── WHAT THIS PROJECT DOES ─────────────────────────────────────
  let overview = stack.description;
  if (!overview) {
    const langLabel = lang === "typescript" ? "TypeScript" : lang === "javascript" ? "JavaScript" : lang === "python" ? "Python" : lang === "go" ? "Go" : "code";
    overview = fw
      ? `${stack.projectName} is a ${fw} application written in ${langLabel}. Based on the project structure, it appears to be a web application${db ? ` using ${db} for data storage` : ""}.`
      : `${stack.projectName} is a ${langLabel} project. Review the file tree and README below for a more detailed description of what it does.`;
  }

  // ── TECH STACK ─────────────────────────────────────────────────
  const stackLines: string[] = [];
  if (fw) stackLines.push(`- ${fw}: The primary framework powering this application's routing, rendering, and request handling`);
  if (lang === "typescript") stackLines.push(`- TypeScript: Adds static types to JavaScript — catches bugs at compile time instead of runtime`);
  else if (lang === "python") stackLines.push(`- Python: The programming language this application is written in`);
  else if (lang === "go") stackLines.push(`- Go: A compiled, statically-typed language designed for high-performance server applications`);
  if (db) stackLines.push(`- ${db}: The database where this application stores and retrieves its data`);
  if (orm) stackLines.push(`- ${orm}: A library that lets you interact with ${db ?? "the database"} using ${lang === "python" ? "Python" : "TypeScript"} code instead of raw SQL`);
  if (stack.cssFramework) stackLines.push(`- ${stack.cssFramework}: The CSS library used to style the UI components`);
  if (stack.stateManagement) stackLines.push(`- ${stack.stateManagement}: Manages shared UI state that needs to be accessed across multiple components`);
  if (stack.auth) stackLines.push(`- ${stack.auth}: Handles user authentication — login, sessions, and protecting routes`);
  if (stackLines.length === 0) stackLines.push(`- ${lang}: The programming language this project is written in`);

  // ── HOW IT WORKS ──────────────────────────────────────────────
  let howItWorks = "";
  if (fw === "Next.js") {
    howItWorks = `When a user visits a page, Next.js decides whether to render it on the server (Server Component) or send JavaScript to the browser (Client Component). Server Components run on the server and send ready-made HTML — faster and more secure. Client Components run in the browser and enable interactivity. ${orm ? `Data is stored in ${db ?? "a database"} via ${orm}, which translates TypeScript code into SQL queries. ` : ""}Server Actions handle form submissions and data mutations without needing a separate API endpoint.`;
  } else if (fw === "Express") {
    howItWorks = `Every HTTP request flows through a chain of middleware functions before reaching a route handler. Each middleware can read and modify the request, then pass it to the next function or return a response early. ${db ? `Data is persisted in ${db}${orm ? ` via ${orm}` : ""}, which handles querying and writing. ` : ""}Route handlers are responsible for reading the request, performing business logic, and sending a JSON response.`;
  } else if (fw === "Django") {
    howItWorks = `Django follows the MVT pattern — a URL is matched to a View function, which queries the database through Models, and returns either a Template (HTML) or JSON. ${orm ? `Django's built-in ORM (${orm}) generates SQL from Python model queries. ` : ""}Migrations track every schema change as a versioned file, ensuring the database always matches the code.`;
  } else if (fw === "FastAPI") {
    howItWorks = `Each URL is mapped to a Python function (route handler) that FastAPI calls with validated, typed parameters. Pydantic validates incoming JSON against a schema before your code runs, automatically returning a 422 error for invalid data. ${orm ? `${orm} manages database queries${db ? ` against ${db}` : ""}, often in an async context. ` : ""}FastAPI generates interactive API documentation automatically from your route definitions.`;
  } else if (fw && lang === "go") {
    howItWorks = `The ${fw} router maps HTTP paths to handler functions written in Go. Handlers receive a request context, parse inputs, call service functions, and write a response. Go's goroutine model means each request can be handled concurrently without blocking. ${orm ? `${orm} provides database access${db ? ` to ${db}` : ""}. ` : ""}Error values are returned explicitly — every operation that can fail must be checked.`;
  } else {
    howItWorks = `The application is structured as a ${lang} project${fw ? ` using ${fw}` : ""}. Look at the file tree to understand the major areas: source code, configuration, tests, and assets. ${db ? `Data is stored in ${db}${orm ? ` via ${orm}` : ""}. ` : ""}Tracing the flow from a user action to a data change is the best way to understand how the pieces connect.`;
  }

  // ── KEY FILES ─────────────────────────────────────────────────
  const keyFileLines: string[] = [];
  // Describe well-known files
  const knownFiles: Record<string, string> = {
    "package.json": "Node.js project manifest — lists all dependencies and npm scripts (start, build, lint, etc.)",
    "tsconfig.json": "TypeScript compiler configuration — controls which files to compile and how strict the type checking is",
    "next.config.ts": "Next.js configuration — customizes build behavior, environment variables, and experimental features",
    "next.config.js": "Next.js configuration — customizes build behavior, environment variables, and experimental features",
    "tailwind.config.ts": "Tailwind CSS configuration — defines custom colors, fonts, spacing, and plugins",
    "drizzle.config.ts": "Drizzle ORM configuration — points the migration tool at your schema and database file",
    "schema.ts": "Database schema — defines every table and column in TypeScript that Drizzle uses to generate SQL",
    "prisma/schema.prisma": "Prisma schema — defines your data models, relations, and which database to connect to",
    "requirements.txt": "Python dependencies — every package this project depends on and its version",
    "go.mod": "Go module file — declares the module name and all external package dependencies",
    "Cargo.toml": "Rust project manifest — package metadata and all crate (library) dependencies",
    "README.md": "Project documentation — should explain what this project does, how to run it, and how to contribute",
    ".env.local": "Local environment variables — secrets and config that must NOT be committed to git",
    ".gitignore": "Tells git which files to never track — node_modules, .env files, build outputs, and database files",
    "middleware.ts": "Next.js middleware — runs before every request, commonly used for authentication and redirects",
  };

  for (const [file, desc] of Object.entries(knownFiles)) {
    if (fileTree.includes(file)) {
      keyFileLines.push(`- ${file}: ${desc}`);
    }
  }
  if (keyFileLines.length === 0) {
    keyFileLines.push("- Review the file tree above to identify the main source files for this project");
  }

  // ── WHAT YOU NEED TO UNDERSTAND ───────────────────────────────
  const areas: string[] = (fw ? LEARNING_AREAS[fw] : undefined) ?? LEARNING_AREAS["general"] ?? [];
  const areaLines = areas.map((a, i) => `${i + 1}. ${a}`);

  // ── 10 QUESTIONS ──────────────────────────────────────────────
  const questionPool: Q[] = [
    ...(fw ? QUESTION_BANKS[fw] ?? [] : []),
    ...(db === "SQLite" ? QUESTION_BANKS["SQLite"] ?? [] : []),
    ...(orm === "Drizzle ORM" ? QUESTION_BANKS["Drizzle ORM"] ?? [] : []),
    ...(orm === "Prisma" ? QUESTION_BANKS["Prisma"] ?? [] : []),
    ...(lang === "typescript" ? QUESTION_BANKS["TypeScript"] ?? [] : []),
    ...(stack.cssFramework === "Tailwind CSS" ? QUESTION_BANKS["Tailwind CSS"] ?? [] : []),
    ...(stack.stateManagement === "Zustand" ? QUESTION_BANKS["Zustand"] ?? [] : []),
  ];

  // Ensure we have all 4 difficulty levels represented
  const picked: Q[] = [];
  const byLevel: Record<string, Q[]> = { beginner: [], intermediate: [], advanced: [], expert: [] };
  for (const q of questionPool) {
    byLevel[q[0]]?.push(q);
  }
  // Pick 2 beginner, 3 intermediate, 3 advanced, 2 expert; fill from general if short
  const general = QUESTION_BANKS["general"] ?? [];
  const targets: [string, number][] = [["beginner", 2], ["intermediate", 3], ["advanced", 3], ["expert", 2]];
  for (const [level, count] of targets) {
    const pool = byLevel[level]?.length ? byLevel[level] : general.filter(q => q[0] === level);
    picked.push(...pool.slice(0, count));
  }
  // Pad with general if still short
  while (picked.length < 10) {
    const missing = general[picked.length % general.length];
    if (missing) picked.push(missing);
    else break;
  }

  const questionLines = picked.slice(0, 10).map((q, i) => {
    const num = i + 1;
    const lvl = q[0];
    return `Q${num} (${lvl}): ${q[1]}`;
  });

  // ── 5 CS CONCEPTS ─────────────────────────────────────────────
  const conceptPool: Concept[] = [
    ...(fw ? CONCEPT_MAPS[fw] ?? [] : []),
    ...(db === "SQLite" ? CONCEPT_MAPS["SQLite"] ?? [] : []),
    ...(orm === "Drizzle ORM" ? CONCEPT_MAPS["Drizzle ORM"] ?? [] : []),
    ...(orm === "Prisma" ? CONCEPT_MAPS["Prisma"] ?? [] : []),
    ...(lang === "typescript" ? CONCEPT_MAPS["TypeScript"] ?? [] : []),
    ...(stack.cssFramework === "Tailwind CSS" ? CONCEPT_MAPS["Tailwind CSS"] ?? [] : []),
  ];
  // Deduplicate by name, then take up to 5
  const seenNames = new Set<string>();
  const concepts: Concept[] = [];
  for (const c of [...conceptPool, ...CONCEPT_MAPS["general"]]) {
    if (!seenNames.has(c.name) && concepts.length < 5) {
      seenNames.add(c.name);
      concepts.push(c);
    }
  }

  const conceptLines = concepts.map(c => `- ${c.name} (${c.type}): ${c.explanation}`);

  // ── WHAT COULD BREAK ──────────────────────────────────────────
  const risks = [
    ...((fw && RISK_MAPS[fw]) ?? []),
    ...(db === "SQLite" ? RISK_MAPS["SQLite"] ?? [] : []),
    ...RISK_MAPS["general"],
  ].slice(0, 5);
  const riskLines = risks.map(r => `- ${r}`);

  // ── Assemble final text ────────────────────────────────────────
  return [
    "**WHAT THIS PROJECT DOES**",
    overview,
    "",
    "**TECH STACK**",
    stackLines.join("\n"),
    "",
    "**HOW IT WORKS**",
    howItWorks,
    "",
    "**KEY FILES AND WHAT THEY DO**",
    keyFileLines.join("\n"),
    "",
    "**WHAT YOU NEED TO UNDERSTAND** (5 areas, ordered by importance)",
    areaLines.join("\n"),
    "",
    "**10 EXPLAIN-BACK QUESTIONS**",
    questionLines.join("\n"),
    "",
    "**5 KEY CS CONCEPTS IN THIS PROJECT**",
    conceptLines.join("\n"),
    "",
    "**WHAT COULD BREAK AND WHY**",
    riskLines.join("\n"),
    "",
    "---",
    "_Analysis generated locally — no AI API used. For deeper AI-powered analysis, add ANTHROPIC_API_KEY to .env.local._",
  ].join("\n");
}
