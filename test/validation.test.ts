import { afterEach, describe, expect, it } from "vitest";
import { InspectorError } from "../src/errors.js";
import { runValidation, runValidations } from "../src/validation.js";
import { cleanupTempDirs, makeTempDir } from "./helpers.js";

afterEach(cleanupTempDirs);

describe("runValidation", () => {
  it("reports a passing command", async () => {
    const result = await runValidation(`node -e "console.log('ok')"`, makeTempDir());

    expect(result).toMatchObject({ status: "passed", exitCode: 0, output: "ok", truncated: false });
  });

  it("reports a failing command instead of throwing", async () => {
    const result = await runValidation(`node -e "process.exit(3)"`, makeTempDir());

    expect(result).toMatchObject({ status: "failed", exitCode: 3 });
  });

  it("reports a command that does not exist as failed", async () => {
    const result = await runValidation("this-command-does-not-exist-xyz", makeTempDir());

    expect(result.status).toBe("failed");
    expect(result.exitCode).not.toBe(0);
  });

  it("keeps both standard output and standard error", async () => {
    const result = await runValidation(
      `node -e "console.log('to-stdout'); console.error('to-stderr')"`,
      makeTempDir(),
    );

    expect(result.output).toContain("to-stdout");
    expect(result.output).toContain("to-stderr");
  });

  it("stops a command that runs past the time limit", async () => {
    const started = Date.now();

    const result = await runValidation(`node -e "setTimeout(() => {}, 30000)"`, makeTempDir(), {
      timeoutMs: 300,
    });

    expect(result.status).toBe("timed_out");
    expect(result.output).toContain("time limit");
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("shortens very long output and says so", async () => {
    const result = await runValidation(
      `node -e "process.stdout.write('START' + 'x'.repeat(200000) + 'END')"`,
      makeTempDir(),
      { maxOutputChars: 1000 },
    );

    expect(result.status).toBe("passed");
    expect(result.truncated).toBe(true);
    expect(result.output.length).toBeLessThan(1100);
    expect(result.output.startsWith("START")).toBe(true);
    expect(result.output.endsWith("END")).toBe(true);
    expect(result.output).toContain("characters omitted");
  });

  it("rejects an empty command as bad input", () => {
    expect(() => runValidation("   ", makeTempDir())).toThrow(InspectorError);
  });
});

describe("runValidations", () => {
  it("runs the remaining commands after one fails", async () => {
    const results = await runValidations(
      [`node -e "process.exit(1)"`, `node -e "console.log('second')"`],
      makeTempDir(),
    );

    expect(results.map((r) => r.status)).toEqual(["failed", "passed"]);
    expect(results[1].output).toBe("second");
  });
});
