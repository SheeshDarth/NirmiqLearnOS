import type { NextConfig } from "next";

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
      // Next.js requires unsafe-inline for its runtime styles;
      // unsafe-eval is needed for hot-reload in dev only — acceptable for
      // a local tool that never runs in a shared/production environment.
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' ws://localhost:* ws://127.0.0.1:*",
      "frame-ancestors 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
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
