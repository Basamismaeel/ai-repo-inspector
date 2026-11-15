import { describe, expect, it } from "vitest";
import { markdownReport } from "../src/report.js";

describe("markdownReport", () => {
  it("lists changed files and validation output", () => {
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: [{ path: "src/index.ts", status: "modified" }],
      validationResults: [{ command: "npm test", status: "passed", output: "ok" }],
    });

    expect(report).toContain("src/index.ts (modified)");
    expect(report).toContain("npm test");
    expect(report).toContain("ok");
  });

  it("shows whether each validation passed, failed or timed out", () => {
    const report = markdownReport({
      repositoryPath: "/work/sample",
      changedFiles: [],
      validationResults: [
        { command: "npm test", status: "passed", output: "ok", exitCode: 0 },
        { command: "npm run lint", status: "failed", output: "2 errors", exitCode: 1 },
        { command: "npm run e2e", status: "timed_out", output: "", exitCode: null },
      ],
    });

    expect(report).toContain("### npm test - passed");
    expect(report).toContain("### npm run lint - failed (exit code 1)");
    expect(report).toContain("### npm run e2e - timed out");
  });
});
