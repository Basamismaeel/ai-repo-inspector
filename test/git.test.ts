import { readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { InspectorError } from "../src/errors.js";
import { changedFiles } from "../src/git.js";
import { cleanupTempDirs, commitAll, gitIn, initRepo, makeSampleRepo, makeTempDir } from "./helpers.js";

afterEach(cleanupTempDirs);

describe("changedFiles", () => {
  it("lists what changed since the branch left main", () => {
    const repo = makeSampleRepo();

    expect(changedFiles(repo)).toEqual([
      { path: "a.txt", status: "modified" },
      { path: "c.txt", status: "added" },
    ]);
  });

  it("compares against an explicit branch, tag or commit", () => {
    const repo = makeSampleRepo();
    gitIn(repo, "tag", "v1");
    writeFileSync(join(repo, "d.txt"), "d\n");
    commitAll(repo, "after tag");

    expect(changedFiles(repo, "v1")).toEqual([{ path: "d.txt", status: "added" }]);
    expect(changedFiles(repo, gitIn(repo, "rev-parse", "v1"))).toEqual([
      { path: "d.txt", status: "added" },
    ]);
  });

  it("falls back to master when there is no main branch", () => {
    const repo = makeSampleRepo("master");

    expect(changedFiles(repo).map((file) => file.path)).toEqual(["a.txt", "c.txt"]);
  });

  it("explains when no default base branch can be found", () => {
    const repo = makeSampleRepo("trunk");

    expect(() => changedFiles(repo)).toThrow(/Could not find a default base branch/);
    expect(changedFiles(repo, "trunk")).toHaveLength(2);
  });

  it("reports deleted and renamed files", () => {
    const repo = initRepo();
    writeFileSync(join(repo, "old-name.txt"), "some content that stays the same\n".repeat(5));
    writeFileSync(join(repo, "gone.txt"), "bye\n");
    commitAll(repo, "more files");
    gitIn(repo, "checkout", "-q", "-b", "feature");
    renameSync(join(repo, "old-name.txt"), join(repo, "new-name.txt"));
    rmSync(join(repo, "gone.txt"));
    commitAll(repo, "rename and delete");

    expect(changedFiles(repo)).toEqual([
      { path: "gone.txt", status: "deleted" },
      { path: "new-name.txt", status: "renamed", previousPath: "old-name.txt" },
    ]);
  });

  it("keeps file names with spaces and non-ASCII characters intact", () => {
    const repo = initRepo();
    gitIn(repo, "checkout", "-q", "-b", "feature");
    writeFileSync(join(repo, "my file ü.txt"), "x\n");
    commitAll(repo, "odd name");

    expect(changedFiles(repo)).toEqual([{ path: "my file ü.txt", status: "added" }]);
  });
});

describe("changedFiles with a bad base ref", () => {
  it("refuses a ref that looks like a git option and writes no file", () => {
    const repo = makeSampleRepo();

    expect(() => changedFiles(repo, "--output=injected.txt")).toThrow(InspectorError);
    expect(() => changedFiles(repo, "--output=injected.txt")).toThrow(/must not start with "-"/);
    expect(readdirSync(repo).filter((name) => name.startsWith("injected"))).toEqual([]);
  });

  it("reports an unknown ref clearly", () => {
    const repo = makeSampleRepo();

    expect(() => changedFiles(repo, "no-such-branch")).toThrow(/Unknown base ref "no-such-branch"/);
  });

  it("rejects an empty ref", () => {
    expect(() => changedFiles(makeSampleRepo(), "  ")).toThrow(InspectorError);
  });

  it("explains when the repository has no commits", () => {
    const repo = makeTempDir();
    gitIn(repo, "init", "-q", "-b", "main");

    expect(() => changedFiles(repo)).toThrow(/no commits yet/);
  });
});
