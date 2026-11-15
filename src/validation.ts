import { spawn, type ChildProcess } from "node:child_process";
import { InspectorError } from "./errors.js";
import type { ValidationResult } from "./types.js";

export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_OUTPUT_CHARS = 20_000;

export type ValidationOptions = {
  /** Stop the command after this many milliseconds. */
  timeoutMs?: number;
  /** Keep at most this many characters of output (start and end are kept). */
  maxOutputChars?: number;
};

/**
 * Collects output without growing forever. It keeps the first half and the
 * last half of the allowed size, because the first error and the final
 * summary are usually the useful parts of a long log.
 */
class BoundedOutput {
  private head = "";
  private tail = "";
  private omitted = 0;
  private readonly headLimit: number;
  private readonly tailLimit: number;

  constructor(limit: number) {
    this.headLimit = Math.ceil(limit / 2);
    this.tailLimit = Math.floor(limit / 2);
  }

  append(chunk: string): void {
    const room = this.headLimit - this.head.length;
    if (room > 0) {
      this.head += chunk.slice(0, room);
      chunk = chunk.slice(room);
    }
    if (chunk.length === 0) return;

    this.tail += chunk;
    if (this.tail.length > this.tailLimit) {
      this.omitted += this.tail.length - this.tailLimit;
      this.tail = this.tail.slice(this.tail.length - this.tailLimit);
    }
  }

  get truncated(): boolean {
    return this.omitted > 0;
  }

  toString(): string {
    if (!this.truncated) return this.head + this.tail;
    return `${this.head}\n... [${this.omitted} characters omitted] ...\n${this.tail}`;
  }
}

function stop(child: ChildProcess): void {
  try {
    if (process.platform !== "win32" && child.pid !== undefined) {
      // The command runs in its own process group, so this also stops
      // anything the shell started.
      process.kill(-child.pid, "SIGKILL");
    } else {
      child.kill("SIGKILL");
    }
  } catch {
    // The process has already exited.
  }
}

/**
 * Runs one validation command through the shell and always resolves.
 * A command that fails, cannot start or runs too long is a result to report,
 * not a reason to abort the review.
 */
export function runValidation(
  command: string,
  cwd: string,
  options: ValidationOptions = {},
): Promise<ValidationResult> {
  if (typeof command !== "string" || command.trim() === "") {
    throw new InspectorError("A validation command must be a non-empty string.");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const output = new BoundedOutput(options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS);

  return new Promise((resolve) => {
    let timedOut = false;
    let settled = false;

    const child = spawn(command, {
      cwd,
      shell: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      stop(child);
    }, timeoutMs);

    const finish = (status: ValidationResult["status"], exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        status,
        exitCode,
        output: output.toString().trimEnd(),
        truncated: output.truncated,
      });
    };

    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => output.append(chunk));
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => output.append(chunk));

    child.on("error", (error) => {
      output.append(`Could not start command: ${error.message}`);
      finish("failed", null);
    });
    child.on("close", (code) => {
      if (timedOut) {
        output.append(`\nStopped after ${timeoutMs} ms (time limit).`);
        finish("timed_out", null);
      } else {
        finish(code === 0 ? "passed" : "failed", code);
      }
    });
  });
}

/** Runs every command in order, including the ones after a failure. */
export async function runValidations(
  commands: string[],
  cwd: string,
  options: ValidationOptions = {},
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) {
    results.push(await runValidation(command, cwd, options));
  }
  return results;
}
