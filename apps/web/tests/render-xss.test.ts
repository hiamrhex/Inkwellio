import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import * as parse5 from "parse5";
import { describe, expect, it } from "vitest";
import { XSS_PAYLOADS } from "./fixtures/xss-payloads";
import {
  MarkdownLengthExceededError,
  MarkdownRenderer,
  MAX_MARKDOWN_BYTES,
} from "../src/modules/posts";

function renderMarkdownToHtml(
  markdown: string,
  options?: { allowImages?: boolean },
): string {
  return renderToStaticMarkup(
    React.createElement(MarkdownRenderer, {
      content: markdown,
      allowImages: options?.allowImages ?? false,
    }),
  );
}

/**
 * Mutant renderer enabling rehype-raw to verify the test suite catches real XSS.
 */
function renderMutantRawHtml(markdown: string): string {
  return renderToStaticMarkup(
    React.createElement(Markdown, { rehypePlugins: [rehypeRaw] }, markdown),
  );
}

const FORBIDDEN_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "svg",
  "style",
  "form",
  "base",
  "meta",
  "link",
  "body",
  "marquee",
]);

const DANGEROUS_SCHEMES = ["javascript:", "data:", "vbscript:"];

interface AstViolation {
  type: "forbidden-tag" | "event-handler" | "dangerous-scheme";
  detail: string;
}

function inspectNode(
  node: parse5.DefaultTreeAdapterMap["node"],
  violations: AstViolation[],
): void {
  if ("tagName" in node) {
    const tag = node.tagName.toLowerCase();
    if (FORBIDDEN_TAGS.has(tag)) {
      violations.push({ type: "forbidden-tag", detail: `<${tag}>` });
    }

    if (node.attrs) {
      for (const attr of node.attrs) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase().replace(/[\x00-\x1f\s]/g, "");

        if (name.startsWith("on")) {
          violations.push({
            type: "event-handler",
            detail: `${name}="${attr.value}"`,
          });
        }

        for (const scheme of DANGEROUS_SCHEMES) {
          if (value.startsWith(scheme)) {
            violations.push({
              type: "dangerous-scheme",
              detail: `${name}="${attr.value}"`,
            });
          }
        }
      }
    }
  }

  if ("childNodes" in node && Array.isArray(node.childNodes)) {
    for (const child of node.childNodes) {
      inspectNode(child, violations);
    }
  }
}

function findViolations(html: string): AstViolation[] {
  const fragment = parse5.parseFragment(html);
  const violations: AstViolation[] = [];
  inspectNode(fragment, violations);
  return violations;
}

describe("WP4 / A8: RSC Markdown Renderer & XSS Payload Suite", () => {
  it("XSS suite contains at least 50 grouped hostile payloads", () => {
    expect(XSS_PAYLOADS.length).toBeGreaterThanOrEqual(50);
  });

  describe("Production RSC pipeline: 0 of 56 payloads execute", () => {
    for (const item of XSS_PAYLOADS) {
      it(`[${item.id}] ${item.category} - ${item.name}`, () => {
        const html = renderMarkdownToHtml(item.payload);
        const violations = findViolations(html);
        expect(
          violations,
          `Payload ${item.id} produced XSS violations: ${html}`,
        ).toEqual([]);
      });
    }
  });

  describe("Mutation check: prove the XSS suite can fail", () => {
    it("real rehype-raw mutant triggers violations across hostile payloads", () => {
      const executed: string[] = [];
      for (const item of XSS_PAYLOADS) {
        const html = renderMutantRawHtml(item.payload);
        if (findViolations(html).length > 0) {
          executed.push(item.id);
        }
      }
      expect(executed.length).toBeGreaterThanOrEqual(25);
    });

    it("weak-assertion guard: AST inspector catches injected <script>", () => {
      const violations = findViolations("<div><script>alert(1)</script></div>");
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]!.detail).toBe("<script>");
    });
  });

  describe("A8 / ADR-008 renderer invariants", () => {
    it("enforces 100 KiB (102,400 UTF-8 bytes) limit", () => {
      expect(() => renderMarkdownToHtml("a".repeat(MAX_MARKDOWN_BYTES))).not.toThrow();
      expect(() =>
        renderMarkdownToHtml("a".repeat(MAX_MARKDOWN_BYTES + 1)),
      ).toThrowError(MarkdownLengthExceededError);
      // Multi-byte UTF-8 test (emoji = 4 bytes)
      expect(() => renderMarkdownToHtml("😀".repeat(25_601))).toThrowError(
        MarkdownLengthExceededError,
      );
    });

    it("adds rel='noopener noreferrer nofollow ugc' on links", () => {
      const html = renderMarkdownToHtml("[Read more](https://example.com/post)");
      expect(html).toContain('rel="noopener noreferrer nofollow ugc"');
      expect(html).toContain('href="https://example.com/post"');
    });

    it("neutralizes images into plain links by default", () => {
      const html = renderMarkdownToHtml(
        "![Architecture diagram](https://example.com/diagram.png)",
      );
      expect(html).not.toContain("<img");
      expect(html).toContain("<a");
      expect(html).toContain('href="https://example.com/diagram.png"');
      expect(html).toContain("Architecture diagram");
    });

    it("restricts link schemes and blocks protocol-relative //evil.com", () => {
      expect(renderMarkdownToHtml("[Archive](/archive)")).toContain('href="/archive"');
      expect(renderMarkdownToHtml("[Contact](mailto:editor@inkwellio.com)")).toContain(
        'href="mailto:editor@inkwellio.com"',
      );
      expect(renderMarkdownToHtml("[Evil](//evil.com/x)")).not.toContain("//evil.com");
      expect(renderMarkdownToHtml("[JS](javascript:alert(1))")).not.toContain(
        "javascript:",
      );
    });

    it("forbids rehype-raw imports in all non-test files under apps/web/src", () => {
      const srcDir = path.resolve(__dirname, "../src");
      function walk(dir: string): void {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, "utf8");
            expect(content, `Forbidden rehype-raw in ${fullPath}`).not.toMatch(
              /from\s+["']rehype-raw["']|require\(["']rehype-raw["']\)/,
            );
          }
        }
      }
      walk(srcDir);
    });

    it("keeps posts/render strictly server-only (zero 'use client' directives)", () => {
      const renderDir = path.resolve(__dirname, "../src/modules/posts/render");
      for (const entry of fs.readdirSync(renderDir, { withFileTypes: true })) {
        if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          const content = fs.readFileSync(path.join(renderDir, entry.name), "utf8");
          expect(content, `Unexpected 'use client' in ${entry.name}`).not.toMatch(
            /["']use client["']/,
          );
        }
      }
    });
  });
});
