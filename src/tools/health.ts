/**
 * Health API tools (read-only).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  bodyBatteryShape,
  bodyCompositionShape,
  dailySummaryShape,
  heartRateShape,
  hrvShape,
  hydrationShape,
  pulseOxShape,
  respirationShape,
  sleepShape,
  stressShape,
} from "../schemas/health.js";
import { runTool, type ToolContext } from "./helpers.js";

const readOnly = { readOnlyHint: true, destructiveHint: false } as const;

export function registerHealthTools(
  server: McpServer,
  ctx: ToolContext,
): void {
  server.registerTool(
    "garmin_get_daily_summary",
    {
      title: "Get Daily Summary",
      description:
        "Steps, calories, distance, intensity minutes, and floors for a date range.",
      inputSchema: dailySummaryShape,
      annotations: { title: "Get Daily Summary", ...readOnly },
    },
    (args, extra) =>
      runTool(() =>
        ctx.client.getDailySummary(
          ctx.resolveUserId(extra),
          args.startDate,
          args.endDate,
        ),
      ),
  );

  server.registerTool(
    "garmin_get_heart_rate",
    {
      title: "Get Heart Rate",
      description:
        "Resting heart rate, HR zones, and optional timestamped HR samples.",
      inputSchema: heartRateShape,
      annotations: { title: "Get Heart Rate", ...readOnly },
    },
    (args, extra) =>
      runTool(() =>
        ctx.client.getHeartRate(
          ctx.resolveUserId(extra),
          args.startDate,
          args.endDate,
          args.includeSamples,
        ),
      ),
  );

  server.registerTool(
    "garmin_get_sleep",
    {
      title: "Get Sleep",
      description:
        "Sleep stages, duration, score, sleep/wake times, and optional SpO2/respiration.",
      inputSchema: sleepShape,
      annotations: { title: "Get Sleep", ...readOnly },
    },
    (args, extra) =>
      runTool(() =>
        ctx.client.getSleep(ctx.resolveUserId(extra), args.startDate, args.endDate, {
          includeSpo2: args.includeSpo2,
          includeRespiration: args.includeRespiration,
        }),
      ),
  );

  server.registerTool(
    "garmin_get_stress",
    {
      title: "Get Stress",
      description: "Stress level summaries and optional timestamped samples.",
      inputSchema: stressShape,
      annotations: { title: "Get Stress", ...readOnly },
    },
    (args, extra) =>
      runTool(() =>
        ctx.client.getStress(
          ctx.resolveUserId(extra),
          args.startDate,
          args.endDate,
          args.includeSamples,
        ),
      ),
  );

  server.registerTool(
    "garmin_get_body_battery",
    {
      title: "Get Body Battery",
      description: "Body Battery charged and drained values over time.",
      inputSchema: bodyBatteryShape,
      annotations: { title: "Get Body Battery", ...readOnly },
    },
    (args, extra) =>
      runTool(() =>
        ctx.client.getBodyBattery(
          ctx.resolveUserId(extra),
          args.startDate,
          args.endDate,
        ),
      ),
  );

  server.registerTool(
    "garmin_get_pulse_ox",
    {
      title: "Get Pulse Ox",
      description: "Blood oxygen (SpO2) readings, both sleep and on-demand.",
      inputSchema: pulseOxShape,
      annotations: { title: "Get Pulse Ox", ...readOnly },
    },
    (args, extra) =>
      runTool(() =>
        ctx.client.getPulseOx(
          ctx.resolveUserId(extra),
          args.startDate,
          args.endDate,
        ),
      ),
  );

  server.registerTool(
    "garmin_get_respiration",
    {
      title: "Get Respiration",
      description: "Breathing rate summaries over a date range.",
      inputSchema: respirationShape,
      annotations: { title: "Get Respiration", ...readOnly },
    },
    (args, extra) =>
      runTool(() =>
        ctx.client.getRespiration(
          ctx.resolveUserId(extra),
          args.startDate,
          args.endDate,
        ),
      ),
  );

  server.registerTool(
    "garmin_get_hrv",
    {
      title: "Get HRV",
      description: "Heart-rate variability status and readings.",
      inputSchema: hrvShape,
      annotations: { title: "Get HRV", ...readOnly },
    },
    (args, extra) =>
      runTool(() =>
        ctx.client.getHrv(ctx.resolveUserId(extra), args.startDate, args.endDate),
      ),
  );

  server.registerTool(
    "garmin_get_hydration",
    {
      title: "Get Hydration",
      description: "Daily hydration intake.",
      inputSchema: hydrationShape,
      annotations: { title: "Get Hydration", ...readOnly },
    },
    (args, extra) =>
      runTool(() =>
        ctx.client.getHydration(
          ctx.resolveUserId(extra),
          args.startDate,
          args.endDate,
        ),
      ),
  );

  server.registerTool(
    "garmin_get_body_composition",
    {
      title: "Get Body Composition",
      description: "Weight, BMI, body fat %, muscle mass, and bone mass.",
      inputSchema: bodyCompositionShape,
      annotations: { title: "Get Body Composition", ...readOnly },
    },
    (args, extra) =>
      runTool(() =>
        ctx.client.getBodyComposition(
          ctx.resolveUserId(extra),
          args.startDate,
          args.endDate,
          args.limit,
        ),
      ),
  );
}
