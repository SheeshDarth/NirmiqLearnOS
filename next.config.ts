import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  // Prevent browsers from sniffing MIME types
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Block the app from being embedded in iframes on other origins
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Don't send Referer to cross-origin requests
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Disable browser features the app does not use
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Basic CSP — local-only app, no CDN resources
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js requires unsafe-inline for its runtime styles. unsafe-eval is
      // only needed for dev hot-reload — it is dropped from production builds so
      // a distributed 1.0 never ships an eval-permitting CSP.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' ws://localhost:* ws://127.0.0.1:*",
      "frame-ancestors 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Self-contained production server (.next/standalone/server.js) with only the
  // traced runtime deps — the basis for MS7 distribution (`npx`, single-folder
  // deploy). Native better-sqlite3 is traced via serverExternalPackages below.
  output: "standalone",

  // The Drizzle migration files are read from disk at runtime (instrumentation.ts
  // runs the migrator on boot), so dependency tracing — which only follows
  // imports — can't see them. Force them into the standalone bundle, or a
  // distributed build boots against an unmigrated database.
  outputFileTracingIncludes: {
    "/**": ["./lib/db/migrations/**/*"],
  },

  // NOTE: tracing sweeps data/ into .next/standalone — the local database *and*
  // the user's imported source projects (their code, their .git history). The
  // cause is lib/db/client.ts resolving path.join(process.cwd(), "data"): the
  // tracer sees a literal directory and pulls the whole thing in.
  //
  // outputFileTracingExcludes does NOT stop this — it was tried here for
  // data/docs/tests/scripts and had zero effect on the standalone copy (Next
  // 16.2.7). Do not re-add it expecting protection. The real guard is
  // scripts/pack-standalone.mjs, which strips these from dist/ and then hard-fails
  // if any database, dotenv or native binary survives into the publishable bundle.
  // package.json "files" is the second layer: it allowlists dist/ and bin/ only.

  // better-sqlite3 is a native addon — it must be require()'d at runtime, not
  // bundled. Without this, Turbopack tries to bundle it into its render/
  // static-path worker processes, which crashes them (WorkerError) on the
  // dynamic /workspaces/[id] routes.
  serverExternalPackages: [
    "better-sqlite3",
    "@typescript-eslint/typescript-estree",
    "@typescript-eslint/scope-manager",
    "@typescript-eslint/visitor-keys",
  ],

  // Apply security headers to every route
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
