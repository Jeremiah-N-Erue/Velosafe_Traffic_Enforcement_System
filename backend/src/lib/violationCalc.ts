import { ViolationSeverity } from "../types";

export interface ViolationCalcResult {
  overLimitKph: number;
  severity: ViolationSeverity;
  fineAmount: number;
}

/**
 * Determines severity + fine from how far a recorded speed is over the
 * posted limit. Bands and base fine loosely modeled on common municipal
 * speed-enforcement fine schedules (percentage-over-limit banding).
 */
export function calculateViolation(recordedSpeedKph: number, speedLimitKph: number): ViolationCalcResult {
  const overLimitKph = Math.max(0, round1(recordedSpeedKph - speedLimitKph));

  let severity: ViolationSeverity;
  let fineAmount: number;

  if (overLimitKph <= 0) {
    severity = "minor";
    fineAmount = 0;
  } else if (overLimitKph <= 10) {
    severity = "minor";
    fineAmount = 50 + overLimitKph * 4;
  } else if (overLimitKph <= 20) {
    severity = "moderate";
    fineAmount = 120 + (overLimitKph - 10) * 8;
  } else if (overLimitKph <= 40) {
    severity = "severe";
    fineAmount = 220 + (overLimitKph - 20) * 12;
  } else {
    severity = "extreme";
    fineAmount = 460 + (overLimitKph - 40) * 18;
  }

  return {
    overLimitKph,
    severity,
    fineAmount: round2(fineAmount),
  };
}

/**
 * Determines severity + fine from how long after the signal turned red a
 * vehicle entered the intersection. Bands loosely modeled on common
 * red-light-camera fine schedules (time-after-red banding).
 */
export function calculateRedLightViolation(secondsAfterRed: number): ViolationCalcResult {
  const seconds = Math.max(0, round1(secondsAfterRed));

  let severity: ViolationSeverity;
  let fineAmount: number;

  if (seconds <= 1) {
    severity = "minor";
    fineAmount = 150 + seconds * 50;
  } else if (seconds <= 2.5) {
    severity = "moderate";
    fineAmount = 250 + (seconds - 1) * 80;
  } else if (seconds <= 5) {
    severity = "severe";
    fineAmount = 400 + (seconds - 2.5) * 100;
  } else {
    severity = "extreme";
    fineAmount = 650 + (seconds - 5) * 60;
  }

  return {
    overLimitKph: seconds, // reused field: "how far over the line", in seconds for this type
    severity,
    fineAmount: round2(fineAmount),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
