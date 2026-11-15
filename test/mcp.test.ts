import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../src/mcp.js";
import { cleanupTempDirs, makeSampleRepo, makeTempDir } from "./helpers.js";

type ToolResult = { isError?: boolean; text: string };

async function connect(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

/** Calls the tool the way an AI client would and flattens the result. */
async function callReview(args: Record<string, unknown>): Promise<ToolResult> {
  const client = await connect();
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
