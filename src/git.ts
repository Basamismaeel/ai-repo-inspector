import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { InspectorError } from "./errors.js";
import type { ChangedFile } from "./types.js";

/** Branches tried, in order, when the caller does not name a base ref. */
const DEFAULT_BASE_CANDIDATES = ["main", "master", "origin/HEAD"];

function git(repositoryPath: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: repositoryPath,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      // Capture stderr instead of letting git print straight to the terminal.
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new InspectorError("Git is not installed or is not on the PATH.");
    }
    throw error;
  }
}

/**
 * Checks that the path is an existing directory inside a Git work tree and
 * returns it as an absolute path. Both the CLI and the MCP server go through
 * this, so a bad path fails the same way in both.
 */
export function resolveRepository(repositoryPath: unknown): string {
  if (typeof repositoryPath !== "string" || repositoryPath.trim() === "") {
    throw new InspectorError("A repository path is required.");
  }
  const absolutePath = resolve(repositoryPath);

  let isDirectory = false;
  try {
    isDirectory = statSync(absolutePath).isDirectory();
  } catch {
    throw new InspectorError(`Repository path does not exist: ${absolutePath}`);
  }
  if (!isDirectory) {
    throw new InspectorError(`Repository path is not a directory: ${absolutePath}`);
  }

  try {
    git(absolutePath, ["rev-parse", "--is-inside-work-tree"]);
  } catch (error) {
    if (error instanceof InspectorError) throw error;
    throw new InspectorError(`Not a Git repository: ${absolutePath}`);
  }
  return absolutePath;
}

/** Returns the commit id a ref points to, or undefined if it does not exist. */
function commitOf(repositoryPath: string, ref: string): string | undefined {
  try {
    // --end-of-options makes git treat `ref` as a name even if it looks like
    // an option. `^{commit}` makes sure it points to a commit.
    return git(repositoryPath, [
      "rev-parse",
      "--verify",
      "--quiet",
      "--end-of-options",
      `${ref}^{commit}`,
    ]).trim();
  } catch (error) {
    if (error instanceof InspectorError) throw error;
    return undefined;
  }
}

/**
 * Turns the requested base ref into a commit id.
 *
 * The ref comes from the caller (possibly an AI agent), so it is never passed
 * to `git diff` as text: a value such as `--output=file` would be read by git
 * as an option. It is checked here, and only the resulting commit id is used.
 */
export function resolveBaseCommit(repositoryPath: string, baseRef?: string): string {
  if (baseRef !== undefined) {
    if (typeof baseRef !== "string" || baseRef.trim() === "") {
      throw new InspectorError("The base ref must be a non-empty branch, tag or commit.");
    }
    if (baseRef.startsWith("-")) {
      throw new InspectorError(`Invalid base ref ${JSON.stringify(baseRef)}: it must not start with "-".`);
    }
    const commit = commitOf(repositoryPath, baseRef);
    if (commit === undefined) {
      throw new InspectorError(`Unknown base ref ${JSON.stringify(baseRef)} in ${repositoryPath}.`);
    }
    return commit;
  }

  for (const candidate of DEFAULT_BASE_CANDIDATES) {
    const commit = commitOf(repositoryPath, candidate);
    if (commit !== undefined) return commit;
  }
  throw new InspectorError(
    `Could not find a default base branch (tried ${DEFAULT_BASE_CANDIDATES.join(", ")}). ` +
      "Name one with the base ref option.",
  );
}

/**
 * Parses `git diff --name-status -z`. With -z, fields are separated by NUL
 * bytes and file names are not quoted, so names containing spaces, tabs or
 * non-ASCII characters come through unchanged. Renames and copies carry two
 * paths (old, then new).
 */
function parseNameStatus(output: string): ChangedFile[] {
  const fields = output.split("\0");
  const files: ChangedFile[] = [];
  let index = 0;
  while (index < fields.length && fields[index] !== "") {
    const code = fields[index++][0];
    if (code === "R" || code === "C") {
      const previousPath = fields[index++];
      const path = fields[index++];
      files.push(
        code === "R" ? { path, status: "renamed", previousPath } : { path, status: "added" },
      );
    } else {
      const path = fields[index++];
      const status = code === "A" ? "added" : code === "D" ? "deleted" : "modified";
      files.push({ path, status });
    }
  }
  return files;
}

/** Lists the files that changed on HEAD since it branched off from the base ref. */
export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  if (commitOf(repositoryPath, "HEAD") === undefined) {
    throw new InspectorError(`The repository has no commits yet: ${repositoryPath}`);
  }
  const baseCommit = resolveBaseCommit(repositoryPath, baseRef);
  const output = git(repositoryPath, ["diff", "--name-status", "-z", `${baseCommit}...HEAD`, "--"]);
  return parseNameStatus(output);
}
