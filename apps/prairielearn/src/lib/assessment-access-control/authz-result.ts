import {
  type SprocAuthzAssessment,
  type SprocAuthzAssessmentInstance,
  SprocAuthzAssessmentInstanceSchema,
  SprocAuthzAssessmentSchema,
} from '../db-types.js';

// Both access-control implementations currently produce the sproc result shape.
// These application-level names keep consumers independent of the implementation used.
export const AssessmentAuthzResultSchema = SprocAuthzAssessmentSchema;
export type AssessmentAuthzResult = SprocAuthzAssessment;

export const AssessmentInstanceAuthzResultSchema = SprocAuthzAssessmentInstanceSchema;
export type AssessmentInstanceAuthzResult = SprocAuthzAssessmentInstance;

export type LegacyAssessmentAccessRuleResult = AssessmentAuthzResult['access_rules'][number];
