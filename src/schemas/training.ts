/**
 * Zod schemas for training / courses tool inputs (write operations).
 */

import { z } from "zod";

/** A single step within a structured workout. */
export const workoutStep = z.object({
  type: z
    .enum(["warmup", "interval", "recovery", "rest", "cooldown", "other"])
    .describe("Step intent."),
  durationType: z
    .enum(["time", "distance", "open"])
    .describe("How the step's end is measured."),
  /** Seconds when durationType=time, meters when durationType=distance. */
  durationValue: z
    .number()
    .positive()
    .optional()
    .describe("Seconds (time) or meters (distance). Omit for 'open'."),
  targetType: z
    .enum(["none", "pace", "heart_rate", "power", "cadence"])
    .optional()
    .describe("Optional target metric for the step."),
  targetLow: z.number().optional().describe("Lower bound of the target range."),
  targetHigh: z.number().optional().describe("Upper bound of the target range."),
  notes: z.string().optional().describe("Free-text step description."),
});

export const pushWorkoutShape = {
  name: z.string().min(1).describe("Workout name shown on the device."),
  sport: z
    .enum(["running", "cycling", "swimming", "cardio", "strength", "other"])
    .describe("Workout sport type."),
  steps: z
    .array(workoutStep)
    .min(1)
    .describe("Ordered list of workout steps."),
  description: z.string().optional().describe("Optional workout description."),
};

export const pushTrainingPlanShape = {
  name: z.string().min(1).describe("Training plan name."),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
    .describe("Plan start date (YYYY-MM-DD)."),
  workouts: z
    .array(
      z.object({
        dayOffset: z
          .number()
          .int()
          .nonnegative()
          .describe("Days after startDate this workout is scheduled."),
        workout: z.object(pushWorkoutShape),
      }),
    )
    .min(1)
    .describe("Workouts that make up the plan."),
};

/** A GPS coordinate for a course. */
export const coursePoint = z.object({
  lat: z.number().min(-90).max(90).describe("Latitude in decimal degrees."),
  lng: z.number().min(-180).max(180).describe("Longitude in decimal degrees."),
  elevation: z.number().optional().describe("Elevation in meters."),
});

export const pushCourseShape = {
  name: z.string().min(1).describe("Course name shown on the device."),
  sport: z
    .enum(["running", "cycling", "hiking", "walking", "other"])
    .describe("Course sport type."),
  points: z
    .array(coursePoint)
    .min(2)
    .describe("Ordered GPS points defining the route."),
  description: z.string().optional().describe("Optional course description."),
};
