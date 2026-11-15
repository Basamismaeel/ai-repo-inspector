import { changedFiles, resolveRepository } from "./git.js";
import { markdownReport } from "./report.js";
import type { ReviewRequest } from "./types.js";
import { runValidations } from "./validation.js";

export async function reviewRepository(request: ReviewRequest): Promise<string> {
  const repositoryPath = resolveRepository(request.repositoryPath);
  const files = changedFiles(repositoryPath, request.baseRef);
  const validations = await runValidations(request.validationCommands ?? [], repositoryPath);
  return markdownReport({
    repositoryPath,
    changedFiles: files,
    validationResults: validations,
  });
}
