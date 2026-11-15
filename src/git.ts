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

  let insideWorkTree = false;
  try {
    insideWorkTree = git(absolutePath, ["rev-parse", "--is-inside-work-tree"]).trim() === "true";
  } catch (error) {
    if (error instanceof InspectorError) throw error;
  }
  if (!insideWorkTree) {
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

/**
 * Lists everything that differs from the base ref right now:
 *
 * - changes committed on HEAD since it branched off from the base,
 * - changes to tracked files that are staged or not yet committed,
 * - new files Git does not track yet (reported as "untracked").
 *
 * Files matched by .gitignore are left out. Paths are relative to the
 * repository root.
 */
export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  if (commitOf(repositoryPath, "HEAD") === undefined) {
    throw new InspectorError(`The repository has no commits yet: ${repositoryPath}`);
  }
  const baseCommit = resolveBaseCommit(repositoryPath, baseRef);

  // Run from the repository root so both commands report root-relative paths
  // even when the caller pointed at a sub-directory.
  const root = git(repositoryPath, ["rev-parse", "--show-toplevel"]).trim();

  let forkPoint: string;
  try {
    forkPoint = git(root, ["merge-base", baseCommit, "HEAD"]).trim();
  } catch (error) {
    if (error instanceof InspectorError) throw error;
    throw new InspectorError("HEAD and the base ref have no common history to compare.");
  }

  // Comparing the fork point with the working tree (no second commit given)
  // covers committed, staged and unstaged changes to tracked files in one go.
  const tracked = parseNameStatus(git(root, ["diff", "--name-status", "-z", forkPoint, "--"]));

  const untracked: ChangedFile[] = git(root, ["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter((path) => path !== "")
    .map((path) => ({ path, status: "untracked" }));

  return [...tracked, ...untracked];
}
