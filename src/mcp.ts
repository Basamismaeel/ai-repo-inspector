import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { reviewRepository } from "./core.js";
import { describeError, InspectorError } from "./errors.js";

export type ServerOptions = {
  /**
   * The only validation commands an MCP client may ask for. They are chosen by
   * the person who starts the server, never by the client. Empty by default,
   * which makes the tool read-only.
   */
  allowedValidations?: string[];
};

/**
 * Reads the server's own command line: `--allow-validation "<command>"`,
 * repeated once per approved command.
 */
export function parseServerArgs(argv: string[]): Required<ServerOptions> {
  const allowedValidations: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (token !== "--allow-validation") {
      throw new InspectorError(
        `Unknown option: ${token}. Usage: mcp-server [--allow-validation "<command>"]...`,
      );
    }
    const command = argv[++index];
    if (command === undefined || command.trim() === "") {
      throw new InspectorError("--allow-validation needs a command, for example \"npm test\".");
    }
    allowedValidations.push(command);
  }
  return { allowedValidations };
}

/**
 * An MCP client is an AI agent that may be acting on text it read somewhere,
 * so it is not allowed to supply shell commands. It may only pick, by exact
 * match, from the list the operator approved.
 */
function checkAllowed(requested: string[], allowed: string[]): void {
  const refused = requested.filter((command) => !allowed.includes(command));
  if (refused.length === 0) return;

  const allowedText =
    allowed.length === 0
      ? "This server was started without any approved validation commands."
      : `Approved commands: ${allowed.map((command) => JSON.stringify(command)).join(", ")}.`;
  throw new InspectorError(
    `Validation command not allowed: ${refused.map((command) => JSON.stringify(command)).join(", ")}. ` +
      `${allowedText} Nothing was run.`,
  );
}

/**
 * Builds the MCP server without connecting it to anything, so tests can talk
 * to it in memory and `mcp-server.ts` can attach it to stdio.
 *
 * Input names are snake_case and are read with exactly the names that are
 * advertised in the schema.
 */
export function createServer(options: ServerOptions = {}): McpServer {
  const allowed = options.allowedValidations ?? [];
  const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });

  const validationHelp =
    allowed.length === 0
      ? "Not available: this server has no approved validation commands. Leave this out."
      : `Validation commands to run. Each must be exactly one of: ${allowed
          .map((command) => JSON.stringify(command))
          .join(", ")}.`;

  server.registerTool(
    "review_repository",
    {
      description:
        "Lists the files changed between a base ref and HEAD in a local Git repository " +
        "and returns a Markdown review report. It cannot run arbitrary commands.",
      inputSchema: {
        repo_path: z
          .string()
          .min(1)
          .describe("Absolute path to the Git repository to inspect."),
        base_ref: z
          .string()
          .min(1)
          .optional()
          .describe("Branch, tag or commit to compare HEAD against. Defaults to main."),
        validation_commands: z.array(z.string()).optional().describe(validationHelp),
      },
    },
    async ({ repo_path, base_ref, validation_commands }) => {
      try {
        checkAllowed(validation_commands ?? [], allowed);
        const report = await reviewRepository({
          repositoryPath: repo_path,
          baseRef: base_ref,
          validationCommands: validation_commands,
        });
        return { content: [{ type: "text", text: report }] };
      } catch (error) {
        // Tell the agent what went wrong instead of returning an empty report.
        return { isError: true, content: [{ type: "text", text: describeError(error) }] };
      }
    },
  );

  return server;
}
