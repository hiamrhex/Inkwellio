import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface TestNode {
  type?: string;
  name?: string;
  filepath?: string;
  moduleId?: string;
  children?: Iterable<TestNode>;
  result?: () => { state?: string } | undefined;
}

function collectCounts(node: TestNode): { passed: number; failed: number; skipped: number; total: number } {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let total = 0;

  if (node.type === "test") {
    total++;
    const res = typeof node.result === "function" ? node.result() : undefined;
    const state = res?.state;
    if (state === "passed" || state === "pass") {
      passed++;
    } else if (state === "failed" || state === "fail") {
      failed++;
    } else {
      skipped++;
    }
  }

  const children = node.children ? Array.from(node.children) : [];
  for (const child of children) {
    const sub = collectCounts(child);
    passed += sub.passed;
    failed += sub.failed;
    skipped += sub.skipped;
    total += sub.total;
  }

  return { passed, failed, skipped, total };
}

const perFileTestCountReporter = {
  reported: false,
  onFinished(files: unknown[] = []) {
    this.report(files as TestNode[]);
  },
  onTestRunEnd(testModules: unknown[] = []) {
    this.report(testModules as TestNode[]);
  },
  report(files: TestNode[] = []) {
    if (this.reported || !files || files.length === 0) return;
    this.reported = true;

    process.stdout.write("\n=================== Per-File Test Counts ===================\n");
    const zeroTestDbFiles: string[] = [];

    for (const file of files) {
      const filepath = file.filepath || file.moduleId || file.name || "";
      const relPath = path.relative(__dirname, filepath).replace(/\\/g, "/");
      const counts = collectCounts(file);

      process.stdout.write(
        `[test-count] ${relPath}: ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped (total: ${counts.total})\n`
      );

      const isDbFile = relPath.includes("tests/db/") || relPath.endsWith("postgres.test.ts");
      if (isDbFile) {
        if (counts.passed === 0 || (process.env.REQUIRE_DB === "1" && counts.skipped > 0)) {
          zeroTestDbFiles.push(
            `${relPath} (passed: ${counts.passed}, skipped: ${counts.skipped}, total: ${counts.total})`
          );
        }
      }
    }
    process.stdout.write("============================================================\n\n");

    if (zeroTestDbFiles.length > 0) {
      const msg = `FATAL: Database test file ran zero passed tests:\n` + zeroTestDbFiles.map((f) => `  - ${f}`).join("\n");
      process.stderr.write(msg + "\n");
      process.exitCode = 1;
      throw new Error(msg);
    }
  },
};

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "apps/web/tests/**/*.test.ts",
      "packages/*/tests/**/*.test.ts",
    ],
    reporters: ["default", perFileTestCountReporter],
    restoreMocks: true,
  },
  resolve: {
    alias: {
      "@": path.join(__dirname, "apps", "web", "src"),
    },
  },
});
