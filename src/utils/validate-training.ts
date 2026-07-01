/**
 * Semantic validation for training/course write payloads.
 *
 * Zod enforces the shape of the input; these checks enforce cross-field rules
 * that Zod cannot easily express (e.g. a timed step must carry a duration).
 * Violations throw a 400 {@link GarminApiError} with an actionable message.
 */

import { GarminApiError } from "../types.js";

interface WorkoutStep {
  type: string;
  durationType: "time" | "distance" | "open";
  durationValue?: number;
  targetType?: string;
  targetLow?: number;
  targetHigh?: number;
}

interface Workout {
  name: string;
  steps: WorkoutStep[];
}

interface CoursePoint {
  lat: number;
  lng: number;
}

interface Course {
  points: CoursePoint[];
}

function fail(message: string): never {
  throw new GarminApiError(message, 400);
}

/** Validate a structured workout's steps. */
export function validateWorkout(workout: Workout): void {
  workout.steps.forEach((step, i) => {
    const at = `step ${i + 1}`;
    if (step.durationType !== "open") {
      if (step.durationValue === undefined) {
        fail(
          `Workout ${at}: durationValue is required when durationType is "${step.durationType}".`,
        );
      }
      if (step.durationValue <= 0) {
        fail(`Workout ${at}: durationValue must be greater than 0.`);
      }
    }
    if (
      step.targetType &&
      step.targetType !== "none" &&
      step.targetLow !== undefined &&
      step.targetHigh !== undefined &&
      step.targetLow > step.targetHigh
    ) {
      fail(
        `Workout ${at}: targetLow (${step.targetLow}) must not exceed targetHigh (${step.targetHigh}).`,
      );
    }
  });
}

/** Validate a GPS course has at least two distinct points. */
export function validateCourse(course: Course): void {
  const distinct = new Set(
    course.points.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`),
  );
  if (distinct.size < 2) {
    fail("Course must contain at least two distinct GPS points.");
  }
}
