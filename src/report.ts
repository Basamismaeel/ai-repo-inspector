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

export function markdownReport(input: ReportInput): string {
  const lines = [`# Review Report: ${input.repositoryPath}`, "", "## Changed files"];
  for (const file of input.changedFiles) {
    const detail =
      file.status === "renamed" && file.previousPath !== undefined
        ? `renamed from ${file.previousPath}`
        : file.status;
    lines.push(`- ${file.path} (${detail})`);
  }
  lines.push("", "## Validation output");
  for (const result of input.validationResults) {
    lines.push(`### ${result.command} - ${statusLabel(result)}`, "```", result.output, "```");
  }
  return lines.join("\n");
}
