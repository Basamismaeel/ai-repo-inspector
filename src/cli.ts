#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { allValidationsPassed, inspectRepository } from "./core.js";
import { describeError, InspectorError } from "./errors.js";
import { markdownReport } from "./report.js";

const USAGE = `Usage: inspector review --repo <path> [options]

Options:
  --repo <path>          Git repository to inspect (required)
  --base-ref <ref>       Branch, tag or commit to compare HEAD against
                         (default: main, then master, then origin/HEAD)
  --validate <command>   Shell command to run in the repository; repeatable
  --format markdown      Report format (only markdown is available)
  --help                 Show this help

The report is written to review-report.md in the current directory.

Exit codes: 0 = report written and all validations passed
            1 = the review could not run (bad input, not a repository, ...)
            2 = report written, but a validation command did not pass`;

type Args = {
  help: boolean;
  command?: string;
  repositoryPath?: string;
  baseRef?: string;
  validations: string[];
};

/** Reads the value that must follow an option such as `--repo`. */
function valueOf(option: string, value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new InspectorError(`${option} needs a value.`);
  }
  return value;
}

/**
 * Parses the command line strictly. A typo such as `--vaildate` is an error:
 * silently ignoring it would skip a check the user believes ran.
 */
function parseArgs(argv: string[]): Args {
  const args: Args = { help: false, validations: [] };
  if (argv.includes("--help") || argv.includes("-h")) {
    args.help = true;
    return args;
  }

  args.command = argv[0];
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (token === "--repo") {
      args.repositoryPath = valueOf(token, argv[++index]);
    } else if (token === "--base-ref") {
      args.baseRef = valueOf(token, argv[++index]);
    } else if (token === "--validate") {
      args.validations.push(valueOf(token, argv[++index]));
    } else if (token === "--format") {
      const format = valueOf(token, argv[++index]);
      if (format !== "markdown") {
        throw new InspectorError(
          `--format ${format} is not supported yet. Only "markdown" is available.`,
        );
      }
    } else {
      throw new InspectorError(`Unknown option: ${token}`);
    }
  }

  if (args.command !== "review") {
    throw new InspectorError(
      args.command === undefined ? "Missing command." : `Unknown command: ${args.command}`,
    );
  }
  if (args.repositoryPath === undefined) {
    throw new InspectorError("--repo <path> is required.");
  }
  return args;
}

async function main(): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Error: ${describeError(error)}\n\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const result = await inspectRepository({
    repositoryPath: args.repositoryPath ?? "",
    baseRef: args.baseRef,
    validationCommands: args.validations,
  });
  writeFileSync("review-report.md", markdownReport(result), "utf8");
  console.log("Review report written to review-report.md");

  if (!allValidationsPassed(result)) {
    // The review itself worked, so the report exists. Exit code 2 lets scripts
    // and CI tell "a validation failed" apart from "the tool could not run" (1).
    console.error("One or more validation commands did not pass.");
    process.exitCode = 2;
  }
}

main().catch((error) => {
  // One readable line. Stack traces are noise for someone using the tool.
  console.error(`Error: ${describeError(error)}`);
  process.exitCode = 1;
});
