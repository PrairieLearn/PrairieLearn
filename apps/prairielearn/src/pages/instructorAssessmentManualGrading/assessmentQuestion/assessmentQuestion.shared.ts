// Shared constants and types for assessment question manual grading

// Grading status values for filtering
export const GRADING_STATUS_VALUES = ['Requires grading', 'Graded'] as const;
export type GradingStatusValue = (typeof GRADING_STATUS_VALUES)[number];

// Writable version for state management
export const GRADING_STATUS_VALUES_ARRAY: readonly GradingStatusValue[] = GRADING_STATUS_VALUES;
