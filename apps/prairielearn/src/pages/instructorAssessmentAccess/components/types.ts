import { z } from 'zod';

import type { AccessControlJson } from '../../../schemas/accessControl.js';

/** Individual student for enrollment-based rules */
export interface AccessControlIndividual {
  enrollmentId: string;
  uid: string;
  name: string | null;
}

/** AccessControlJson with optional database ID and rule information for tracking */
export interface AccessControlJsonWithId extends AccessControlJson {
  /** Database ID (undefined for new/unsaved rules) */
  id?: string;
  /** Database rule number for sorting */
  number?: number;
  /** Rule type: 'student_label' for group-based rules, 'enrollment' for individual student rules, 'none' for rules without specific targeting */
  ruleType?: 'student_label' | 'enrollment' | 'none' | null;
  /** Individual students (for enrollment-based rules) */
  individuals?: AccessControlIndividual[];
}

// ============================================================================
// Zod Schemas for form data validation
// ============================================================================

/** Schema for overridable fields */
export const OverridableFieldSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    isOverridden: z.boolean(),
    isEnabled: z.boolean(),
    value: valueSchema,
  });

/** Schema for deadline entries */
export const DeadlineEntrySchema = z.object({
  date: z.string(),
  credit: z.number(),
});

/** Schema for after last deadline settings */
export const AfterLastDeadlineValueSchema = z.object({
  allowSubmissions: z.boolean().optional(),
  credit: z.number().optional(),
});

/** Schema for date control form data */
export const DateControlFormDataSchema = z.object({
  enabled: z.boolean(),
  releaseDate: OverridableFieldSchema(z.string()),
  dueDate: OverridableFieldSchema(z.string()),
  earlyDeadlines: OverridableFieldSchema(z.array(DeadlineEntrySchema)),
  lateDeadlines: OverridableFieldSchema(z.array(DeadlineEntrySchema)),
  afterLastDeadline: OverridableFieldSchema(AfterLastDeadlineValueSchema),
  durationMinutes: OverridableFieldSchema(z.number()),
  password: OverridableFieldSchema(z.string()),
});

/** Schema for PrairieTest control form data */
export const PrairieTestControlFormDataSchema = z.object({
  enabled: z.boolean(),
  exams: z
    .array(
      z.object({
        examUuid: z.string(),
        readOnly: z.boolean().optional(),
      }),
    )
    .optional(),
});

/** Schema for question visibility settings */
export const QuestionVisibilityValueSchema = z.object({
  hideQuestions: z.boolean(),
  showAgainDate: z.string().optional(),
  hideAgainDate: z.string().optional(),
});

/** Schema for score visibility settings */
export const ScoreVisibilityValueSchema = z.object({
  hideScore: z.boolean(),
  showAgainDate: z.string().optional(),
});

/** Schema for after complete form data */
export const AfterCompleteFormDataSchema = z.object({
  questionVisibility: OverridableFieldSchema(QuestionVisibilityValueSchema),
  scoreVisibility: OverridableFieldSchema(ScoreVisibilityValueSchema),
});

/** Schema for individual student in form */
export const IndividualTargetSchema = z.object({
  enrollmentId: z.string().optional(),
  uid: z.string(),
  name: z.string().nullable(),
});

/** Schema for group target */
export const GroupTargetSchema = z.object({
  groupId: z.string(),
  name: z.string(),
});

/** Schema for applies to configuration */
export const AppliesToSchema = z.object({
  targetType: z.enum(['individual', 'group']),
  individuals: z.array(IndividualTargetSchema),
  groups: z.array(GroupTargetSchema),
});

/** Schema for a single access control rule form data */
export const AccessControlRuleFormDataSchema = z.object({
  id: z.string().optional(),
  enabled: z.boolean(),
  blockAccess: z.boolean().optional(),
  listBeforeRelease: z.boolean().optional(),
  appliesTo: AppliesToSchema,
  dateControl: DateControlFormDataSchema,
  prairieTestControl: PrairieTestControlFormDataSchema,
  afterComplete: AfterCompleteFormDataSchema,
});

/** Schema for the complete access control form data */
export const AccessControlFormDataSchema = z.object({
  mainRule: AccessControlRuleFormDataSchema,
  overrides: z.array(AccessControlRuleFormDataSchema),
});

/** Navigation view state for access control form */
export type AccessControlView =
  | { type: 'summary' }
  | { type: 'edit-main' }
  | { type: 'edit-override'; index: number };

/** Generic type for fields that can be overridden in override rules */
export interface OverridableField<T> {
  /** Whether the field is overridden. Always true for main rule, can be false for overrides. */
  isOverridden: boolean;
  /** Whether the field is enabled (e.g., false = "release immediately", true = "release after date") */
  isEnabled: boolean;
  /** The actual value of the field */
  value: T;
}

/** Deadline entry for early/late deadlines */
export interface DeadlineEntry {
  date: string;
  credit: number;
}

/** After last deadline settings */
export interface AfterLastDeadlineValue {
  allowSubmissions?: boolean;
  credit?: number;
}

// Internal form data structure that maintains all field data even when disabled
export interface DateControlFormData {
  enabled: boolean;
  releaseDate: OverridableField<string>;
  dueDate: OverridableField<string>;
  earlyDeadlines: OverridableField<DeadlineEntry[]>;
  lateDeadlines: OverridableField<DeadlineEntry[]>;
  afterLastDeadline: OverridableField<AfterLastDeadlineValue>;
  durationMinutes: OverridableField<number>;
  password: OverridableField<string>;
}

export interface PrairieTestControlFormData {
  enabled: boolean;
  exams?: { examUuid: string; readOnly?: boolean }[];
}

/** Question visibility settings after completion */
export interface QuestionVisibilityValue {
  hideQuestions: boolean;
  showAgainDate?: string;
  hideAgainDate?: string;
}

/** Score visibility settings after completion */
export interface ScoreVisibilityValue {
  hideScore: boolean;
  showAgainDate?: string;
}

/** After completion form data with separate overridable sections */
export interface AfterCompleteFormData {
  questionVisibility: OverridableField<QuestionVisibilityValue>;
  scoreVisibility: OverridableField<ScoreVisibilityValue>;
}

/** Target type for access control rules */
export type TargetType = 'individual' | 'group';

/** Individual student in form */
export interface IndividualTarget {
  enrollmentId?: string;
  uid: string;
  name: string | null;
}

/** Student group target */
export interface GroupTarget {
  groupId: string;
  name: string;
}

/** Applies to configuration for access control rules */
export interface AppliesTo {
  targetType: TargetType;
  individuals: IndividualTarget[];
  groups: GroupTarget[];
}

export interface AccessControlRuleFormData {
  /** Database ID (undefined for new/unsaved rules) */
  id?: string;
  enabled: boolean;
  blockAccess?: boolean;
  listBeforeRelease?: boolean;
  appliesTo: AppliesTo;
  dateControl: DateControlFormData;
  prairieTestControl: PrairieTestControlFormData;
  afterComplete: AfterCompleteFormData;
}

// Interface for the form data structure that includes nested paths
export interface AccessControlFormData {
  mainRule: AccessControlRuleFormData;
  overrides: AccessControlRuleFormData[];
}

/** Helper function to transform form data to JSON output */
export function formDataToJson(formData: AccessControlFormData): AccessControlJsonWithId[] {
  // Filter out individual/enrollment rules - they should not be written to JSON
  const jsonRules = [formData.mainRule, ...formData.overrides].filter(
    (rule) => rule.appliesTo.targetType !== 'individual' || rule.appliesTo.individuals.length === 0,
  );
  return jsonRules.map((rule, index) => formRuleToJson(rule, index === 0));
}

/**
 * Transforms a single access control rule form data to JSON format for writing to infoAssessment.json.
 * This function is shared between client-side summary saves and server-side individual rule saves.
 *
 * @param rule The form data for the rule
 * @param isMainRule If true, includes prairieTestControl in the output (only main rules support this)
 */
export function formRuleToJson(
  rule: AccessControlRuleFormData,
  isMainRule: boolean,
): AccessControlJsonWithId {
  const groups =
    rule.appliesTo.targetType === 'group' && rule.appliesTo.groups.length > 0
      ? rule.appliesTo.groups.map((g) => g.name)
      : undefined;

  const output: AccessControlJsonWithId = {
    enabled: rule.enabled,
    blockAccess: rule.blockAccess,
    listBeforeRelease: rule.listBeforeRelease || true,
    groups,
  };

  if (rule.dateControl.enabled) {
    output.dateControl = {
      enabled: true,
    };

    const {
      releaseDate,
      dueDate,
      earlyDeadlines,
      lateDeadlines,
      afterLastDeadline,
      durationMinutes,
      password,
    } = rule.dateControl;

    if (releaseDate.isOverridden && releaseDate.isEnabled && releaseDate.value) {
      output.dateControl.releaseDate = releaseDate.value;
    }
    if (dueDate.isOverridden && dueDate.isEnabled && dueDate.value) {
      output.dateControl.dueDate = dueDate.value;
    }
    if (
      earlyDeadlines.isOverridden &&
      earlyDeadlines.isEnabled &&
      earlyDeadlines.value.length > 0
    ) {
      output.dateControl.earlyDeadlines = earlyDeadlines.value;
    }
    if (lateDeadlines.isOverridden && lateDeadlines.isEnabled && lateDeadlines.value.length > 0) {
      output.dateControl.lateDeadlines = lateDeadlines.value;
    }
    if (afterLastDeadline.isOverridden && afterLastDeadline.isEnabled) {
      output.dateControl.afterLastDeadline = afterLastDeadline.value;
    }
    if (durationMinutes.isOverridden && durationMinutes.isEnabled) {
      output.dateControl.durationMinutes = durationMinutes.value;
    }
    if (password.isOverridden && password.isEnabled && password.value) {
      output.dateControl.password = password.value;
    }
  } else {
    output.dateControl = { enabled: false };
  }

  if (isMainRule) {
    if (rule.prairieTestControl.enabled) {
      output.prairieTestControl = {
        enabled: true,
        exams: rule.prairieTestControl.exams || [],
      };
    } else {
      output.prairieTestControl = { enabled: false };
    }
  }

  const { questionVisibility, scoreVisibility } = rule.afterComplete;

  if (questionVisibility.isOverridden || scoreVisibility.isOverridden) {
    output.afterComplete = {};

    if (questionVisibility.isOverridden) {
      output.afterComplete.hideQuestions = questionVisibility.value.hideQuestions;
      if (questionVisibility.value.showAgainDate) {
        output.afterComplete.showQuestionsAgainDate = questionVisibility.value.showAgainDate;
      }
      if (questionVisibility.value.hideAgainDate) {
        output.afterComplete.hideQuestionsAgainDate = questionVisibility.value.hideAgainDate;
      }
    }

    if (scoreVisibility.isOverridden) {
      output.afterComplete.hideScore = scoreVisibility.value.hideScore;
      if (scoreVisibility.value.showAgainDate) {
        output.afterComplete.showScoreAgainDate = scoreVisibility.value.showAgainDate;
      }
    }
  }

  return output;
}

/**
 * Convert JSON to form data structure.
 * @param json The access control JSON (optionally with ID)
 * @param isMainRule If true, all fields are marked as overridden (main rule behavior).
 * If false, only fields with values are marked as overridden (override rule behavior).
 */
export function jsonToFormData(
  json: AccessControlJsonWithId,
  isMainRule: boolean,
): AccessControlRuleFormData {
  const dc = json.dateControl;
  const ac = json.afterComplete;

  // For main rule: isOverridden is always true
  // For override rules: isOverridden depends on whether the field has a value in JSON
  const makeOverridable = <T>(
    hasValue: boolean,
    isEnabled: boolean,
    value: T,
  ): OverridableField<T> => ({
    isOverridden: isMainRule || hasValue,
    isEnabled,
    value,
  });

  const hasQuestionVisibility = ac?.hideQuestions !== undefined;
  const hasScoreVisibility = ac?.hideScore !== undefined;

  // Convert groups/individuals to appliesTo structure based on rule type
  let appliesTo: AppliesTo;
  if (json.ruleType === 'enrollment' && json.individuals && json.individuals.length > 0) {
    appliesTo = {
      targetType: 'individual',
      individuals: json.individuals.map((i) => ({
        enrollmentId: i.enrollmentId,
        uid: i.uid,
        name: i.name,
      })),
      groups: [],
    };
  } else {
    appliesTo = {
      targetType: 'group',
      individuals: [],
      groups: (json.groups ?? []).map((name) => ({ groupId: '', name })),
    };
  }

  return {
    id: json.id,
    enabled: json.enabled ?? true,
    blockAccess: json.blockAccess ?? false,
    listBeforeRelease: json.listBeforeRelease ?? true,
    appliesTo,
    dateControl: {
      enabled: dc?.enabled ?? false,
      releaseDate: makeOverridable(
        dc?.releaseDate !== undefined,
        dc?.releaseDate != null,
        dc?.releaseDate ?? '',
      ),
      dueDate: makeOverridable(dc?.dueDate !== undefined, dc?.dueDate != null, dc?.dueDate ?? ''),
      earlyDeadlines: makeOverridable(
        dc?.earlyDeadlines !== undefined,
        (dc?.earlyDeadlines?.length ?? 0) > 0,
        dc?.earlyDeadlines ?? [],
      ),
      lateDeadlines: makeOverridable(
        dc?.lateDeadlines !== undefined,
        (dc?.lateDeadlines?.length ?? 0) > 0,
        dc?.lateDeadlines ?? [],
      ),
      afterLastDeadline: makeOverridable(
        dc?.afterLastDeadline !== undefined,
        dc?.afterLastDeadline !== undefined,
        dc?.afterLastDeadline ?? {},
      ),
      durationMinutes: makeOverridable(
        dc?.durationMinutes !== undefined,
        dc?.durationMinutes != null,
        dc?.durationMinutes ?? 60,
      ),
      password: makeOverridable(
        dc?.password !== undefined,
        dc?.password != null,
        dc?.password ?? '',
      ),
    },
    prairieTestControl: {
      enabled: json.prairieTestControl?.enabled ?? false,
      exams: json.prairieTestControl?.exams,
    },
    afterComplete: {
      questionVisibility: makeOverridable(hasQuestionVisibility, true, {
        hideQuestions: ac?.hideQuestions ?? false,
        showAgainDate: ac?.showQuestionsAgainDate ? '' : undefined,
        hideAgainDate: ac?.hideQuestionsAgainDate ? '' : undefined,
      }),
      scoreVisibility: makeOverridable(hasScoreVisibility, true, {
        hideScore: ac?.hideScore ?? false,
        showAgainDate: ac?.showScoreAgainDate ? '' : undefined,
      }),
    },
  };
}

/** Create default form data for a new override rule */
export function createDefaultOverrideFormData(): AccessControlRuleFormData {
  return {
    enabled: true,
    blockAccess: false,
    listBeforeRelease: true,
    appliesTo: {
      targetType: 'individual',
      individuals: [],
      groups: [],
    },
    dateControl: {
      enabled: false,
      releaseDate: { isOverridden: false, isEnabled: false, value: '' },
      dueDate: { isOverridden: false, isEnabled: false, value: '' },
      earlyDeadlines: { isOverridden: false, isEnabled: false, value: [] },
      lateDeadlines: { isOverridden: false, isEnabled: false, value: [] },
      afterLastDeadline: { isOverridden: false, isEnabled: false, value: {} },
      durationMinutes: { isOverridden: false, isEnabled: false, value: 60 },
      password: { isOverridden: false, isEnabled: false, value: '' },
    },
    prairieTestControl: {
      enabled: false,
    },
    afterComplete: {
      questionVisibility: {
        isOverridden: false,
        isEnabled: true,
        value: { hideQuestions: false },
      },
      scoreVisibility: {
        isOverridden: false,
        isEnabled: true,
        value: { hideScore: false },
      },
    },
  };
}
