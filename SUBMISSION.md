# Submission

## What did you investigate first, and why?

I ran `npm install`, `npm run typecheck` and `npm test` to see the starting
state. Everything passed, but there was only one test.

Then I ran the tool with bad inputs: a failing command, a folder with a space
in its name, a branch name that looks like a git option, and a real MCP call.
I started with the MCP tool, because its input comes from an AI agent, which
is the caller I trust the least.

## What did you choose to implement or fix?

1. **MCP tool ignored its path.** The schema said `repo_path` but the code read
   `repoPath`, so it silently inspected the wrong folder.
2. **A failing validation crashed the tool.** It is now reported as `failed`.
   Added a time limit and an output size limit.
3. **MCP accepted any shell command.** It can now only run commands approved
   by the person who starts the server. With no list, it is read-only.
4. **The base ref could be used as a git option.** `--base-ref "--output=x"`
   made git write a file. The ref is now checked first.
5. **CLI input handling.** Paths with spaces work. Typos and missing values
   are errors. Errors are one clear line.
6. **Uncommitted and untracked files are now in the report.**
7. **Small ones:** output cannot break the report layout, the `bin` path is
   correct, tests no longer run twice after a build, README updated.

Tests went from 1 to 53.

## What did you intentionally not do?

- JSON output (`--format json` now gives a clear error).
- Sandboxing: an approved command like `npm test` still runs the repository's
  own scripts.
- The 15 dependency vulnerabilities reported by `npm install`.
- Choosing the report file name.

I ran out of time for these. I fixed the dangerous problems and the wrong
results first, because they matter more than missing features.

## Interface decision

- Decision: hybrid

  The README says the tool is used by developers and by AI coding agents. Both
  are real users, so I kept both interfaces. But I did not give them the same
  permissions.

- Primary user and execution environment:

  1. A developer, or a CI job, running the command line.
  2. An AI coding agent calling the tool through MCP.

  Both run on the developer's own machine, against a local repository.

- Trust boundary and allowed capabilities:

  A person at the command line typed the command themselves, on their own
  machine. I trust them, so the CLI can run any validation command.

  An AI agent is different. It reads files, web pages and tool output, and
  that text can contain hidden instructions that trick it. So I do not trust
  it to choose commands. Through MCP it can:

  - read which files changed, and
  - run only the commands the person who started the server approved.

  If the server is started with no approved commands, the agent can only read.

- Reliability, discoverability, latency/context, and output tradeoffs:

  - **CLI:** simple, reliable, and works in any terminal or CI system. The
    weak point is that an agent has to guess the options from the help text.
  - **MCP:** the tool describes its own inputs to the agent, including which
    commands are approved, so the agent does not have to guess. The weak
    point is that everything it returns goes into the agent's limited memory.

  Because of that, validation output is cut at 20,000 characters and marked as
  shortened, and each command is stopped after 120 seconds so a call cannot
  hang. The same limits apply to the CLI.

- How supported interfaces remain consistent:

  Both interfaces call the same core function and use the same report code,
  so they find the same changed files and show results the same way. The only
  difference is the approved-command check in the MCP layer. The tests run the
  real CLI and a real MCP client against the same kind of test repository.

- Evidence that would change this decision:

  - If agents mostly call the CLI through a shell anyway, I would remove MCP
    and maintain one interface.
  - If nobody uses the CLI, I would make MCP the main interface and return
    structured data instead of Markdown.
  - If the tool had to run on a shared server instead of a developer's own
    machine, I would not allow free commands from the CLI either.

## How did you use an AI coding agent?

I used Claude Code as my main way of working for the whole task. I directed
it and checked its work; it did the investigation and the typing.

What I did:

- **Set the plan and the scope.** I agreed the order of the first five fixes,
  then decided to add one larger fix and three small ones with the time left,
  and decided what to leave out.
- **Reproduced the bugs myself.** I ran the commands and watched the tool
  crash on a failing command, and saw git create a file it should never have
  created.
- **Verified every fix.** I ran the tests for each fix, and ran the same
  commands again to see the bug was gone.
- **Caught the failing CI check.** I noticed the red check on GitHub and had
  the agent find and fix the cause.
- **Challenged the agent.** I asked whether one of its "issues" was really an
  issue, and it turned out to be a design choice (see the next section).
- **Controlled what went into the repository.** I rewrote a commit message I
  did not like, and held this file back until I was happy with its wording.

What the agent did: it read the code, ran the tool with bad inputs, proposed
the fixes, and wrote the code and the tests.

I did not accept a result because the agent said it worked. Each fix had to
be shown working: by a test, by a before-and-after command, and by CI.

## Where did you check, correct, or reject an AI suggestion? (required)

### 1. The agent pushed code that failed in CI

- **What went wrong:** the agent pushed fix 2 (commit `5e9953b`) after running
  only typecheck and tests on my machine. The GitHub Actions check failed.
- **How it was caught:** I saw the red check on GitHub and asked the agent to
  find the cause.
- **The cause:** CI runs `npm run build` before `npm test`. The build leaves
  compiled copies of the tests in `dist/test/`, and vitest ran both sets: 34
  tests instead of 17. The compiled copies of the two new CLI tests failed,
  because from inside `dist/` they looked for the CLI in the wrong folder.
- **What changed:** added `vitest.config.ts` so only `test/**/*.test.ts` runs
  (commit `664f5a3`). From then on, typecheck, build and test were run in
  CI's order before each code commit.
- **Evidence:** on my machine, build then test gave 2 failed / 32 passed
  before the change and 17 passed after it. The next CI run passed, and every
  run since.

### 2. A claim made from reading the code was wrong when run

- **What went wrong:** from reading `src/git.ts`, the agent expected
  `--base-ref "--output=hacked.txt"` to make git write a file called
  `hacked.txt`.
- **How it was caught:** by running it. Git created `hacked.txt...HEAD`,
  because the code glues `...HEAD` onto whatever it is given. I ran the
  command myself and saw the same file in `ls`.
- **What changed:** the tests for this bug do not look for one exact file
  name. They check that no file starting with `injected` exists after the
  call, so they cannot pass by accident.
- **Evidence:** before the fix, the command printed "Review report written"
  and the file appeared. After it (commit `af122a7`), it prints
  `Error: Invalid base ref` and `ls` shows no new file.

### 3. I questioned something the agent called a bug

- **What the agent said:** that leaving uncommitted and untracked files out of
  the report was an issue to fix.
- **How it was caught:** I asked "is this really an issue?".
- **The answer:** it is a design choice. Comparing only commits is also a
  valid design, and the agent agreed when asked.
- **What I decided:** keep the change (commit `3556021`), because the starter
  types already had an unused `untracked` status and an agent calling the
  tool mid-task needs to see uncommitted work. I describe it as a decision,
  not a bug fix.
- **Evidence:** 6 tests cover it. One of them checks that a clean checkout
  still gives an empty list, so nothing changes for a repository with no
  uncommitted work.

## Commands used to verify the result, with outcomes

Automated, run in CI's order:

| Command | Outcome |
| --- | --- |
| `npm run typecheck` | no errors |
| `npm run build` | no errors |
| `npm test` | 5 files, 53 tests passed (started at 1) |
| GitHub Actions "Public checks" | passing on the latest commit; one earlier run failed, see point 1 above |
| Fresh clone from GitHub (commit `dce77d0`), then `npm ci`, typecheck, build, test | all passed, 53 tests |

Tests per area: MCP tool 14, git 16, CLI 11, validation 8, report 4.

By hand, before and after each fix:

| Command | Before | After |
| --- | --- | --- |
| `npm run inspector -- review --repo . --validate "exit 1"` | `Fatal error` with a stack trace, no report | report written, shows `exit 1 - failed (exit code 1)` |
| `npm run inspector -- review --repo . --base-ref "--output=hacked.txt"` | "Review report written", and a file `hacked.txt...HEAD` appeared | `Error: Invalid base ref "--output=hacked.txt": it must not start with "-".` and no file |
| `npm run inspector -- review --repo . --vaildate "npm test"` | the starter code skipped unknown options silently | `Error: Unknown option: --vaildate` |
| `npm run inspector -- review --repo .` with two uncommitted files | "Changed files" empty | both files listed as `modified` |

MCP server, checked for real. I had the agent start the actual server
(`npm run mcp-server -- --allow-validation "node --version"`) and call it with
a real MCP client over stdio:

| Call | Result |
| --- | --- |
| `repo_path` only | report for the right folder, with the real changed files (the starter returned `Review Report: undefined`) |
| approved command `node --version` | ran, shown as `passed` |
| unapproved command `echo pwned > pwned.txt` | error: `Validation command not allowed ... Nothing was run.` No `pwned.txt` was created (the starter ran any command) |
| `base_ref` set to `--output=pwned.txt` | error: `Invalid base ref`, no file created |

## A blocker you hit and how you approached it

The tests for fix 2 failed because of a different bug: the CLI cut the folder
path at the first space, and the test folders have a space in their name. I
fixed that bug first, because nothing could be tested until it worked.

## Known limitations and the next three things you would do

Limitations: approved commands are not sandboxed, and a very large change
still produces a long report.

Next:

1. JSON output, with each file marked as committed or uncommitted.
2. Run validation commands in an isolated container.
3. Update the vulnerable dependencies.

## Approximate focused-work time

- Start: 15 November 2026, 20:13 (Baku time)
- Finish: 15 November 2026, 21:36 (Baku time)

