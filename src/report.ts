import type { ChangedFile, ValidationResult } from "./types.js";

type ReportInput = {
  repositoryPath: string;
  changedFiles: ChangedFile[];
  validationResults: ValidationResult[];
};

function statusLabel(result: ValidationResult): string {
  if (result.status === "passed") return "passed";
  if (result.status === "timed_out") return "timed out";
  return result.exitCode == null ? "failed" : `failed (exit code ${result.exitCode})`;
}

/** Keeps a value on one line so it cannot start a new Markdown block. */
function oneLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, " ");
}

/**
 * Picks a code fence longer than any run of backticks inside the output.
 * Otherwise output containing ``` would close the block early, and whatever
 * follows would be read as part of the report (by a person or an AI agent).
 */
function fenceFor(output: string): string {
  const longestRun = Math.max(0, ...(output.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longestRun + 1));
}

export function markdownReport(input: ReportInput): string {
  const lines = [`# Review Report: ${oneLine(input.repositoryPath)}`, "", "## Changed files"];
  for (const file of input.changedFiles) {
    const detail =
      file.status === "renamed" && file.previousPath !== undefined
        ? `renamed from ${oneLine(file.previousPath)}`
        : file.status;
    lines.push(`- ${oneLine(file.path)} (${detail})`);
  }
  lines.push("", "## Validation output");
  for (const result of input.validationResults) {
    const fence = fenceFor(result.output);
    lines.push(`### ${oneLine(result.command)} - ${statusLabel(result)}`, fence, result.output, fence);
  }
  return lines.join("\n");
}
