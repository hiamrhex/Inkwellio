import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

// A virtual path, so the shipped config resolves it without a file on disk.
const fixturePath = "apps/web/src/kernel/raw-html-fixture.tsx";

const eslint = new ESLint({ cwd: repoRoot });

async function ruleIdsFor(code: string): Promise<Array<string | null>> {
  const [result] = await eslint.lintText(code, { filePath: fixturePath });
  return result.messages.map((message) => message.ruleId);
}

describe("raw HTML ban", () => {
  it(
    "rejects dangerouslySetInnerHTML through the shipped config",
    { timeout: 30_000 },
    async () => {
      const ruleIds = await ruleIdsFor(
        'export const Raw = () => <div dangerouslySetInnerHTML={{ __html: "<b>x</b>" }} />;\n',
      );

      expect(ruleIds).toContain("react/no-danger");
    },
  );

  it("allows ordinary JSX", { timeout: 30_000 }, async () => {
    const ruleIds = await ruleIdsFor(
      'export const Plain = () => <div>{"x"}</div>;\n',
    );

    expect(ruleIds).not.toContain("react/no-danger");
  });
});
