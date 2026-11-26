"use client";

import { useEffect } from "react";

/**
 * Activates the deferred Newsreader editorial voice on dedicated reading routes
 * (`/p/[handle]/[slug]`) after hydration without eager-preloading serif weights on `/`.
 */
export function EditorialFontReady() {
  useEffect(() => {
    document.documentElement.classList.add("editorial-font-ready");
  }, []);
  return null;
}
