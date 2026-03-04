/**
 * Converts a string value from an HTML input to a number or undefined.
 * Used as a `setValueAs` transform for react-hook-form number inputs.
 */
export const coerceToNumber = (v: string): number | undefined => (v === '' ? undefined : Number(v));

/**
 * Converts a value to a boolean or undefined.
 * Used as a `setValueAs` transform for react-hook-form checkbox inputs.
 * This is needed because InheritableCheckboxField renders a hidden input
 * when the value is inherited, and RHF treats hidden inputs as text fields,
 * reading string values instead of booleans.
 */
export const coerceToBoolean = (v: unknown): boolean | undefined => {
  if (v === '' || v === undefined || v === null) return undefined;
  if (typeof v === 'boolean') return v;
  return v === 'true' || v === 'on';
};

/**
 * Parses a points list input value into a number, array of numbers, or string.
 * Used as a `setValueAs` transform for points list inputs that accept
 * comma-separated values (e.g. "10, 5, 2, 1").
 */
export function parsePointsListValue(v: string): number | number[] | string | undefined {
  if (v === '') return undefined;
  if (!Number.isNaN(Number(v))) return Number(v);
  if (v.includes(',')) {
    return v
      .split(',')
      .map((s: string) => Number(s.trim()))
      .filter((n: number) => !Number.isNaN(n));
  }
  return v;
}

/**
 * Validates that at least one points field (auto points or manual points) is set.
 * When `parentValues` is provided (e.g. for alternatives inheriting from an alt group),
 * the parent's values also satisfy the requirement.
 * Returns an error message if all are undefined, or undefined if valid.
 */
export function validateAtLeastOnePointsField(
  values: {
    autoPoints?: number | number[];
    points?: number | number[];
    manualPoints?: number;
  },
  parentValues?: {
    autoPoints?: number | number[];
    points?: number | number[];
    manualPoints?: number;
  },
): string | undefined {
  if (
    values.points !== undefined ||
    values.autoPoints !== undefined ||
    values.manualPoints !== undefined
  ) {
    return;
  }
  if (
    parentValues?.points !== undefined ||
    parentValues?.autoPoints !== undefined ||
    parentValues?.manualPoints !== undefined
  ) {
    return;
  }
  return 'At least one of auto points or manual points must be set.';
}

/**
 * Validates that a points list is non-increasing (each value <= previous).
 * Returns an error message if invalid, or undefined if valid.
 */
export function validateNonIncreasingPoints(
  value: number | number[] | string | undefined,
): string | undefined {
  if (value == null || typeof value === 'string' || typeof value === 'number') return;
  for (let i = 1; i < value.length; i++) {
    if (value[i] > value[i - 1]) {
      return 'Points must be non-increasing (each value must be ≤ the previous).';
    }
  }
}

/**
 * Extracts a string comment from a value that may be a string or other type.
 * Returns the comment if it's a string, or undefined otherwise.
 */
export function extractStringComment(comment: unknown): string | undefined {
  return typeof comment === 'string' ? comment : undefined;
}

/**
 * Determines which points field name is set in the given sources.
 * Checks each source in order for `autoPoints` (modern) then `points` (legacy/Exam).
 * Returns the first match, defaulting to `'autoPoints'`.
 */
export function resolvePointsProperty(
  ...sources: ({ points?: unknown; autoPoints?: unknown } | undefined)[]
): 'points' | 'autoPoints' {
  for (const source of sources) {
    if (source?.autoPoints != null) return 'autoPoints';
    if (source?.points != null) return 'points';
  }
  return 'autoPoints';
}

/**
 * Determines which max points field name is set in the given sources.
 * Checks each source in order for `maxAutoPoints` then `maxPoints`.
 * Falls back based on the resolved points property name for consistency.
 */
export function resolveMaxPointsProperty(
  pointsProperty: 'points' | 'autoPoints',
  ...sources: ({ maxPoints?: unknown; maxAutoPoints?: unknown } | undefined)[]
): 'maxPoints' | 'maxAutoPoints' {
  for (const source of sources) {
    if (source?.maxAutoPoints != null) return 'maxAutoPoints';
    if (source?.maxPoints != null) return 'maxPoints';
  }
  return pointsProperty === 'points' ? 'maxPoints' : 'maxAutoPoints';
}

/**
 * Assessment-level default values for advanced fields that cascade
 * down through zones, alternative groups, and questions.
 */
export interface AssessmentAdvancedDefaults {
  advanceScorePerc: number | undefined;
  gradeRateMinutes: number | undefined;
  allowRealTimeGrading: boolean | undefined;
}

/**
 * Formats a points value (number or array) for display.
 */
export function formatPointsValue(value: number | number[] | undefined | null): string {
  if (value == null) return '';
  return Array.isArray(value) ? value.join(', ') : String(value);
}
