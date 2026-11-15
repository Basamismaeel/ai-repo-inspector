#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { describeError } from "./errors.js";
import { createServer, parseServerArgs } from "./mcp.js";

try {
  const options = parseServerArgs(process.argv.slice(2));
  await createServer(options).connect(new StdioServerTransport());
} catch (error) {
  // stdout belongs to the MCP protocol, so problems go to stderr.
  console.error(describeError(error));
  process.exitCode = 1;
}
