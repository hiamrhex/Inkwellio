import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
