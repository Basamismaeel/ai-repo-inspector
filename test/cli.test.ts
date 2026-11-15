import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupTempDirs, makeSampleRepo, makeTempDir } from "./helpers.js";

const projectRoot = resolve(import.meta.dirname, "..");
const tsx = join(projectRoot, "node_modules", ".bin", "tsx");
const cli = join(projectRoot, "src", "cli.ts");

/** Runs the real CLI in an empty working directory and reads the report it writes. */
function runCli(...args: string[]) {
  const cwd = makeTempDir();
  const run = spawnSync(tsx, [cli, ...args], { cwd, encoding: "utf8" });
  const reportPath = join(cwd, "review-report.md");
  return {
    exitCode: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
    report: existsSync(reportPath) ? readFileSync(reportPath, "utf8") : undefined,
  };
}

afterEach(cleanupTempDirs);

describe("inspector review (CLI)", () => {
  it("writes a report and exits 0 when everything passes", () => {
    const repo = makeSampleRepo();

    const run = runCli("review", "--repo", repo, "--validate", `node -e "console.log('fine')"`);

    expect(run.exitCode).toBe(0);
    expect(run.report).toContain("c.txt (added)");
    expect(run.report).toContain("- passed");
  });

  it("still writes the report when a validation fails, and exits 2", () => {
    const repo = makeSampleRepo();

    const run = runCli("review", "--repo", repo, "--validate", "exit 1");

    expect(run.exitCode).toBe(2);
    expect(run.report).toContain("### exit 1 - failed (exit code 1)");
    expect(run.stderr).not.toContain("Fatal error");
  });
});
