import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { reviewRepository } from "./core.js";
import { describeError } from "./errors.js";

/**
 * Builds the MCP server without connecting it to anything, so tests can talk
 * to it in memory and `mcp-server.ts` can attach it to stdio.
 *
 * Input names are snake_case and are read with exactly the names that are
 * advertised in the schema.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });

  server.registerTool(
    "review_repository",
    {
      description:
        "Lists the files changed between a base ref and HEAD in a local Git repository " +
        "and returns a Markdown review report.",
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
        validation_commands: z.array(z.string()).optional(),
      },
    },
    async ({ repo_path, base_ref, validation_commands }) => {
      try {
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
