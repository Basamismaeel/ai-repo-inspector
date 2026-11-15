import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { InspectorError } from "../src/errors.js";
import { createServer, parseServerArgs, type ServerOptions } from "../src/mcp.js";
import { cleanupTempDirs, makeSampleRepo, makeTempDir } from "./helpers.js";

type ToolResult = { isError?: boolean; text: string };

async function connect(options: ServerOptions = {}): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer(options).connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

/** Calls the tool the way an AI client would and flattens the result. */
async function callReview(
  args: Record<string, unknown>,
  options: ServerOptions = {},
): Promise<ToolResult> {
  const client = await connect(options);
  try {
    const result = await client.callTool({ name: "review_repository", arguments: args });
    const content = result.content as Array<{ type: string; text?: string }>;
    return { isError: result.isError === true, text: content.map((c) => c.text ?? "").join("\n") };
  } catch (error) {
    // Older SDK versions reject invalid arguments by throwing.
    return { isError: true, text: error instanceof Error ? error.message : String(error) };
  } finally {
    await client.close();
  }
}

afterEach(cleanupTempDirs);

describe("MCP review_repository", () => {
  it("advertises repo_path as its required input", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    await client.close();

    const tool = tools.find((t) => t.name === "review_repository");
    expect(tool?.inputSchema.required).toEqual(["repo_path"]);
    expect(Object.keys(tool?.inputSchema.properties ?? {})).toContain("base_ref");
  });

  it("inspects the repository named in repo_path, not the server's own folder", async () => {
    const repo = makeSampleRepo();

    const result = await callReview({ repo_path: repo });

    expect(result.isError).toBe(false);
    expect(result.text).toContain(`# Review Report: ${repo}`);
    expect(result.text).toContain("a.txt (modified)");
    expect(result.text).toContain("c.txt (added)");
  });

  it("returns an error when repo_path is missing", async () => {
    const result = await callReview({ repoPath: makeSampleRepo() });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("repo_path");
  });

  it("returns a clear error when the path does not exist", async () => {
    const missing = `${makeTempDir()}/nope`;

    const result = await callReview({ repo_path: missing });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("does not exist");
  });

  it("returns a clear error when the path is not a Git repository", async () => {
    const result = await callReview({ repo_path: makeTempDir() });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Not a Git repository");
  });
});

describe("MCP base_ref", () => {
  it("refuses a base_ref that looks like a git option and writes no file", async () => {
    const repo = makeSampleRepo();

    const result = await callReview({ repo_path: repo, base_ref: "--output=injected.txt" });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Invalid base ref");
    expect(readdirSync(repo).filter((name) => name.startsWith("injected"))).toEqual([]);
  });
});

describe("MCP validation commands", () => {
  // A command that leaves a file behind, so a test can prove it never ran.
  const leaveMarker = `node -e "require('fs').writeFileSync('marker.txt', 'ran')"`;
  const sayHello = `node -e "console.log('hello from validation')"`;

  it("refuses every command when the server has no approved list", async () => {
    const repo = makeSampleRepo();

    const result = await callReview({ repo_path: repo, validation_commands: [leaveMarker] });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("not allowed");
    expect(existsSync(join(repo, "marker.txt"))).toBe(false);
  });

  it("runs a command that is on the approved list", async () => {
    const repo = makeSampleRepo();

    const result = await callReview(
      { repo_path: repo, validation_commands: [sayHello] },
      { allowedValidations: [sayHello] },
    );

    expect(result.isError).toBe(false);
    expect(result.text).toContain("hello from validation");
    expect(result.text).toContain("- passed");
  });

  it("refuses a command that only starts with an approved one", async () => {
    const repo = makeSampleRepo();

    const result = await callReview(
      { repo_path: repo, validation_commands: [`${sayHello} && ${leaveMarker}`] },
      { allowedValidations: [sayHello] },
    );

    expect(result.isError).toBe(true);
    expect(existsSync(join(repo, "marker.txt"))).toBe(false);
  });

  it("runs nothing at all when one command in the request is refused", async () => {
    const repo = makeSampleRepo();

    const result = await callReview(
      { repo_path: repo, validation_commands: [leaveMarker, "echo not-approved"] },
      { allowedValidations: [leaveMarker] },
    );

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Nothing was run");
    expect(existsSync(join(repo, "marker.txt"))).toBe(false);
  });

  it("tells the agent which commands are approved", async () => {
    const client = await connect({ allowedValidations: ["npm test"] });
    const { tools } = await client.listTools();
    await client.close();

    const properties = tools[0].inputSchema.properties as Record<string, { description?: string }>;
    expect(properties.validation_commands.description).toContain('"npm test"');
  });
});

describe("parseServerArgs", () => {
  it("has no approved commands by default", () => {
    expect(parseServerArgs([])).toEqual({ allowedValidations: [] });
  });

  it("collects each --allow-validation value", () => {
    expect(parseServerArgs(["--allow-validation", "npm test", "--allow-validation", "npm run lint"])).toEqual({
      allowedValidations: ["npm test", "npm run lint"],
    });
  });

  it("rejects unknown options and missing values", () => {
    expect(() => parseServerArgs(["--allow-everything"])).toThrow(InspectorError);
    expect(() => parseServerArgs(["--allow-validation"])).toThrow(InspectorError);
  });
});
