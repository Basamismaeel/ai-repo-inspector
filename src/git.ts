import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { InspectorError } from "./errors.js";
import type { ChangedFile } from "./types.js";

function git(repositoryPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
    // Capture stderr instead of letting git print straight to the terminal.
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
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
  } catch {
    throw new InspectorError(`Not a Git repository: ${absolutePath}`);
  }
  return absolutePath;
}

export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  const base = baseRef ?? "main";
  const output = git(repositoryPath, ["diff", "--name-status", `${base}...HEAD`]);

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [code, ...pathParts] = line.split("\t");
      const status = code === "A" ? "added" : code === "D" ? "deleted" : "modified";
      return { path: pathParts.join("\t"), status };
    });
}
