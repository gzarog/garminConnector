/**
 * Shared helpers for tool registration.
 */

import type { GarminClient } from "../services/garmin-client.js";
import { GarminApiError } from "../types.js";

/** MCP tool result content shape. */
type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

/**
 * Context passed to every tool registrar: the Garmin client plus a function
 * that derives the per-user identity from the MCP request's auth info.
 */
export interface ToolContext {
  client: GarminClient;
  /** Resolve the stable user id for the current request. */
  resolveUserId: (extra: unknown) => string;
}

/** Wrap arbitrary data as a pretty-printed JSON text result. */
export function jsonResult(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

/** Wrap an error as a tool error result with a helpful message. */
export function errorResult(err: unknown): ToolResult {
  let message: string;
  if (err instanceof GarminApiError) {
    message = `Garmin API error (${err.status}): ${err.message}`;
  } else if (err instanceof Error) {
    message = err.message;
  } else {
    message = String(err);
  }
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

/**
 * Run a tool handler, translating thrown errors into MCP error results so the
 * model receives an actionable message instead of an exception.
 */
export async function runTool(
  fn: () => Promise<unknown>,
): Promise<ToolResult> {
  try {
    return jsonResult(await fn());
  } catch (err) {
    return errorResult(err);
  }
}
