/**
 * Converts a string value from an HTML textarea to a string or undefined.
 * Used as a `setValueAs` transform for react-hook-form textarea inputs
 * so that the empty-string DOM default round-trips back to `undefined`
 * (matching the `values` prop) and avoids a false-positive dirty flag.
 */
export const coerceToOptionalString = (v: unknown): string | undefined => {
  if (v === '' || v == null) return undefined;
  return String(v);
};

/**
 * Converts a string value from an HTML input to a number or undefined.
 * Used as a `setValueAs` transform for react-hook-form number inputs.
 * Handles non-string inputs (e.g. undefined/null) that can occur when
 * react-hook-form resets form values via the `values` prop.
 */
export const coerceToNumber = (v: unknown): number | undefined => {
  if (v === '' || v == null) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};

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
    const parts = v
      .split(',')
      .map((s: string) => s.trim())
      .filter((s: string) => s !== '');
    if (parts.some((s) => Number.isNaN(Number(s)))) return v;
    return parts.map(Number);
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
 * Validates that a points list is non-increasing (each value <= previous) and
 * that all values are non-negative. Returns an error message if invalid.
 */
export function validateNonIncreasingPoints(
  value: number | number[] | string | undefined,
): string | undefined {
  if (value == null || typeof value === 'string') return;
  if (typeof value === 'number') {
    return value < 0 ? 'All point values must be non-negative.' : undefined;
  }
  for (const v of value) {
    if (v < 0) return 'All point values must be non-negative.';
  }
  for (let i = 1; i < value.length; i++) {
    if (value[i] > value[i - 1]) {
      return 'Points must be non-increasing (each value must be ≤ the previous).';
    }
  }
}

/**
 * Validates that a points-list input parsed to numbers instead of an invalid string.
 */
export function validatePointsListFormat(
  value: number | number[] | string | undefined,
): string | undefined {
  if (typeof value === 'string') {
    return 'Points must be a number or a comma-separated list of numbers.';
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
 * Assessment-level default values for advanced fields that cascade
 * down through zones, alternative groups, and questions.
 */
export interface AssessmentAdvancedDefaults {
  advanceScorePerc: number | undefined;
  gradeRateMinutes: number | undefined;
  allowRealTimeGrading: boolean;
}

/**
 * Formats a points value (number or array) for display.
 */
export function formatPointsValue(value: number | number[] | undefined | null): string {
  if (value == null) return '';
  return Array.isArray(value) ? value.join(', ') : String(value);
}

/**
 * Formats a points value for use as an optional display value.
 * Returns `undefined` when the value is null/undefined (useful for `viewValue` props
 * that treat `undefined` as "no value to display").
 */
export function formatPoints(v: number | number[] | null | undefined): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v.join(', ') : String(v);
}

/**
 * Creates a callback that resets a single form field to `undefined` and saves.
 * Used by detail panels to clear an inherited field override.
 */
export function makeResetAndSave<T>(
  handleSave: (data: T) => void,
  getValues: () => T,
): (field: string) => void {
  return (field: string) => handleSave({ ...getValues(), [field]: undefined } as T);
}
