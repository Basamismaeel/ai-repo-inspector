# Repository Inspector

This is a small TypeScript developer tool that inspects changes in a Git
repository, runs optional validation commands, and produces a Markdown report.
It can be used from a command line or exposed to AI clients through MCP.

## Your task

Investigate the repository and improve it as you judge best. The starter works
for a narrow happy path, but production use may expose correctness, safety,
reliability, contract, output, documentation, or testing weaknesses.

You are not expected to finish everything. We care about how you investigate,
prioritize, implement, verify, and explain a meaningful scope.

## Product decision

This tool may be used directly by developers and by AI coding agents. Decide
whether its production interface should be **CLI-first**, **MCP-first**, or
**hybrid**. Implement improvements consistent with your decision.

There is no preferred label. Explain:

- The primary user and execution environment you assumed.
- The trust boundary and allowed capabilities.
- Reliability, discoverability, latency/context, and output-size tradeoffs.
- How the interfaces you continue to advertise stay behaviorally consistent.
- What evidence would change your decision.

## Time and rules

- Maximum **90 focused minutes** within 48 hours of receiving the invitation.
- Use AI coding tools freely. Verify their work and document at least one
  suggestion you corrected or rejected.
- Work in your own repository created from this template.
- Commit as you work and complete `SUBMISSION.md` in your final commit.
- Completion is not required. Accurate scope and verification matter more than
  a large diff.

## Setup

```bash
npm install
npm run typecheck
npm test
```

## CLI

```bash
npm run inspector -- review --repo ./path/to/repo
npm run inspector -- review --repo ./path/to/repo --base-ref develop
npm run inspector -- review --repo ./path/to/repo --validate "npm test"
npm run inspector -- --help
```

The report is written to `review-report.md` in the current directory.

| Option | Meaning |
| --- | --- |
| `--repo <path>` | Git repository to inspect (required). Paths with spaces are fine. |
| `--base-ref <ref>` | Branch, tag or commit to compare against. Default: `main`, then `master`, then `origin/HEAD`. |
| `--validate <command>` | Shell command to run in the repository. Repeatable. |
| `--format markdown` | Only Markdown is available. `--format json` is rejected, not ignored. |

Unknown options and options without a value are errors.

| Exit code | Meaning |
| --- | --- |
| 0 | Report written and every validation passed. |
| 1 | The review could not run (bad input, not a repository, unknown ref). |
| 2 | Report written, but a validation command failed or timed out. |

## What the report contains

- **Changed files**: everything that differs from the base ref right now.
  That is commits on `HEAD` since it branched off, plus staged and unstaged
  edits, plus new files Git does not track (`untracked`). Files matched by
  `.gitignore` are left out. Renames are shown as `renamed from <old path>`.
- **Validation output**: one section per command with its status (`passed`,
  `failed (exit code N)` or `timed out`) and its combined stdout and stderr.
  A failing command does not stop the review; later commands still run.
  Each command is stopped after 120 seconds, and output longer than 20,000
  characters is shortened in the middle and marked as such.

## MCP

Start the stdio server with:

```bash
npm run mcp-server
npm run mcp-server -- --allow-validation "npm test" --allow-validation "npm run lint"
```

It exposes one tool, `review_repository`:

| Input | Meaning |
| --- | --- |
| `repo_path` | Absolute path to the repository (required). |
| `base_ref` | Same as `--base-ref`. |
| `validation_commands` | Commands to run. Each must exactly match one passed to `--allow-validation` when the server was started. |

Problems are returned as tool errors with a one-line message.

## Trust model (hybrid interface)

Both interfaces call the same core (`src/core.ts`), so they report the same
changed files and format validation results the same way. They differ only in
what the caller is allowed to run:

- **CLI**: the caller is a person or CI job that typed the command. Any
  `--validate` command is run through the shell.
- **MCP**: the caller is an AI agent that may be acting on text it read in a
  file or web page. It cannot supply shell commands. It can only pick from the
  list the person who started the server approved, and with no list the tool
  is read-only.

The approved list limits *which* command runs. It does not sandbox it:
`npm test` still runs whatever the repository's own scripts contain.

## Project layout

```text
src/core.ts         shared review orchestration
src/cli.ts          command-line adapter
src/mcp.ts          MCP tool definition and approved-command check
src/mcp-server.ts   MCP stdio entry point
src/git.ts          Git inspection and input checks
src/validation.ts   validation execution (time and output limits)
src/report.ts       Markdown report generation
src/errors.ts       user-facing errors
test/               tests (temporary Git repositories, in-memory MCP client)
```

When finished, submit via **Security → Report a vulnerability** on this
repo — see `SECURITY.md` for exactly what to include. Do not reply by email;
that submission channel is not monitored.