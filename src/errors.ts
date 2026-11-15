/**
 * An error caused by bad input or an unusable repository, with a message that
 * is safe and useful to show to the caller (a person or an AI agent).
 */
export class InspectorError extends Error {
  override name = "InspectorError";
}

/** Turns any thrown value into one short line, without a stack trace. */
export function describeError(error: unknown): string {
  if (error instanceof InspectorError) {
    return error.message;
  }
  const message = error instanceof Error ? error.message : String(error);
  return `Review failed: ${message}`;
}
