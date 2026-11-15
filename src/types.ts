export type ChangedFile = {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "untracked";
  /** The old path, when the file was renamed. */
  previousPath?: string;
};

export type ValidationResult = {
  command: string;
  status: "passed" | "failed" | "timed_out";
  output: string;
  /** Exit code of the command, or null if it did not exit normally. */
  exitCode?: number | null;
  /** True when the output was longer than the limit and was shortened. */
  truncated?: boolean;
};

export type ReviewRequest = {
  repositoryPath: string;
  baseRef?: string;
  validationCommands?: string[];
  format?: "markdown" | "json";
};

/** The review as data. Reports are rendered from this. */
export type ReviewResult = {
  repositoryPath: string;
  changedFiles: ChangedFile[];
  validationResults: ValidationResult[];
};
