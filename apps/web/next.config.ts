import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  /**
   * Cache ages as failure policy (A1, A6, A9):
   * - Published post: revalidate 60 s, expire 1 h (bounds deleted-page residue)
   * - Feeds: revalidate 60 s, expire 5 min
   */
  cacheLife: {
    post: {
      stale: 60,
      revalidate: 60,
      expire: 3600,
    },
    feed: {
      stale: 60,
      revalidate: 60,
      expire: 300,
    },
  },
  /**
   * Disclosure, not security (docs/DISCLOSURE.md). The `x-powered-by` banner
   * names the framework on every response; it is removed because removing it
   * costs one line and a test keeps it removed.
   */
  poweredByHeader: false,
  /**
   * Set explicitly even though `false` is the documented production default:
   * the default is a framework decision this repository cannot see, and a
   * change to it would ship this source to every browser. The build-output
   * test fails on any `.map` file under `.next/static`.
   */
  productionBrowserSourceMaps: false,
  /**
   * Turbopack cannot create Windows junction points for the `pg` native addon
   * when run from certain user contexts (os error 5 / Access denied).
   * Keeping `pg` external avoids the junction entirely.
   */
  serverExternalPackages: ["pg"],
  transpilePackages: ["@inkwellio/ui"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  /** Public `/@handle` and `/@handle/slug` URLs per ADR-011. */
  async rewrites() {
    return [
      { source: "/@:handle", destination: "/p/:handle" },
      { source: "/@:handle/:slug", destination: "/p/:handle/:slug" },
    ];
  },
  /** Browser security headers and CSP per A13. */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
          {
            // Report-Only on cached public routes per A13 (no script-src 'unsafe-inline')
            key: "Content-Security-Policy-Report-Only",
            value:
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
          },
        ],
      },
      {
        // Enforced strict CSP on API routes (A13)
        source: "/api/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
          },
        ],
      },
      {
        // Allow static assets to be fetched cross-origin where needed
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cross-Origin-Resource-Policy",
            value: "cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
