/**
 * Minimal leveled logger.
 *
 * All output goes to stderr so it never corrupts the stdio JSON-RPC channel.
 * The threshold is read from LOG_LEVEL (debug | info | warn | error).
 */

import process from "node:process";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

function resolveThreshold(): number {
  const configured = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return LEVELS[configured as LogLevel] ?? LEVELS.info;
}

let threshold = resolveThreshold();

/** Re-read the threshold from the environment (useful after config load). */
export function setLogLevel(level: LogLevel): void {
  threshold = LEVELS[level] ?? LEVELS.info;
}

function emit(level: LogLevel, message: string, meta?: unknown): void {
  if (LEVELS[level] < threshold) {
    return;
  }
  const ts = new Date().toISOString();
  const prefix = `${ts} [${level}]`;
  if (meta !== undefined) {
    console.error(prefix, message, meta);
  } else {
    console.error(prefix, message);
  }
}

export const logger = {
  debug: (message: string, meta?: unknown) => emit("debug", message, meta),
  info: (message: string, meta?: unknown) => emit("info", message, meta),
  warn: (message: string, meta?: unknown) => emit("warn", message, meta),
  error: (message: string, meta?: unknown) => emit("error", message, meta),
};
