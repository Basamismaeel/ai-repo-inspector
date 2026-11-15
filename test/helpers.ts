import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDirs: string[] = [];

/** Creates an empty temporary directory that `cleanupTempDirs` removes. */
export function makeTempDir(prefix = "inspector test "): string {
  // The prefix contains a space on purpose: real paths often do.
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

export function cleanupTempDirs(): void {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function gitIn(repo: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
}

/** Creates a repository with one commit (`a.txt`) on the given branch. */
export function initRepo(branch = "main"): string {
  const repo = makeTempDir();
  gitIn(repo, "init", "-q", "-b", branch);
  gitIn(repo, "config", "user.email", "test@example.com");
  gitIn(repo, "config", "user.name", "Test");
  gitIn(repo, "config", "commit.gpgsign", "false");

  writeFileSync(join(repo, "a.txt"), "a\n");
  commitAll(repo, "initial");
  return repo;
}

export function commitAll(repo: string, message: string): void {
  gitIn(repo, "add", "-A");
  gitIn(repo, "commit", "-q", "-m", message);
}

/**
 * A small repository with a `main` branch and a checked-out `feature` branch
 * that modifies `a.txt` and adds `c.txt`.
 */
export function makeSampleRepo(baseBranch = "main"): string {
  const repo = initRepo(baseBranch);
  gitIn(repo, "checkout", "-q", "-b", "feature");
  writeFileSync(join(repo, "a.txt"), "a changed\n");
  writeFileSync(join(repo, "c.txt"), "c\n");
  commitAll(repo, "change");
  return repo;
}
