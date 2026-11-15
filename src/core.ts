import { changedFiles, resolveRepository } from "./git.js";
import { markdownReport } from "./report.js";
import type { ReviewRequest, ReviewResult } from "./types.js";
import { runValidations } from "./validation.js";

/** Runs the review and returns it as data. */
export async function inspectRepository(request: ReviewRequest): Promise<ReviewResult> {
  const repositoryPath = resolveRepository(request.repositoryPath);
  const files = changedFiles(repositoryPath, request.baseRef);
  const validationResults = await runValidations(request.validationCommands ?? [], repositoryPath);
  return { repositoryPath, changedFiles: files, validationResults };
}

/** Runs the review and returns the Markdown report. */
export async function reviewRepository(request: ReviewRequest): Promise<string> {
  return markdownReport(await inspectRepository(request));
}

/** True when every validation command passed (or none were requested). */
export function allValidationsPassed(result: ReviewResult): boolean {
  return result.validationResults.every((validation) => validation.status === "passed");
}
