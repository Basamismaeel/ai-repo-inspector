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

  it("accepts a repository path that contains a space", () => {
    const repo = makeSampleRepo();
    expect(repo).toContain(" ");

    const run = runCli("review", "--repo", repo);

    expect(run.exitCode).toBe(0);
    expect(run.report).toContain(`# Review Report: ${repo}`);
  });

  it("prints usage and exits 0 for --help", () => {
    const run = runCli("--help");

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("Usage: inspector review");
  });
});

describe("inspector review (CLI) with bad input", () => {
  /** Every failure should be one clear line: exit 1, no report, no stack trace. */
  function expectCleanError(run: ReturnType<typeof runCli>, message: string) {
    expect(run.stderr).toContain(message);
    expect(run.stderr).not.toMatch(/^\s+at /m);
    expect(run.exitCode).toBe(1);
    expect(run.report).toBeUndefined();
  }

  it("rejects a misspelled option instead of ignoring it", () => {
    const run = runCli("review", "--repo", makeSampleRepo(), "--vaildate", "npm test");

    expectCleanError(run, "Unknown option: --vaildate");
  });

  it("rejects an option with no value", () => {
    const run = runCli("review", "--repo", makeSampleRepo(), "--validate");

    expectCleanError(run, "--validate needs a value.");
  });

  it("requires --repo", () => {
    expectCleanError(runCli("review"), "--repo <path> is required.");
  });

  it("rejects an unknown command", () => {
    expectCleanError(runCli("inspect", "--repo", makeSampleRepo()), "Unknown command: inspect");
  });

  it("says plainly that json output is not available", () => {
    const run = runCli("review", "--repo", makeSampleRepo(), "--format", "json");

    expectCleanError(run, "--format json is not supported yet");
  });

  it("reports a missing repository in one line", () => {
    const missing = join(makeTempDir(), "nope");

    expectCleanError(runCli("review", "--repo", missing), `Error: Repository path does not exist: ${missing}`);
  });

  it("reports a bad base ref in one line", () => {
    const run = runCli("review", "--repo", makeSampleRepo(), "--base-ref", "--output=injected.txt");

    expectCleanError(run, 'Error: Invalid base ref "--output=injected.txt"');
  });
});
