import { z } from 'zod';

import type { AccessControlJson } from '../../../schemas/accessControl.js';

export interface AccessControlIndividual {
  enrollmentId: string;
  uid: string;
  name: string | null;
}

export interface AccessControlJsonWithId extends AccessControlJson {
  /** Database ID (undefined for new/unsaved rules) */
  id?: string;
  /** Database rule number for sorting */
  number?: number;
  /** Rule type: 'student_label' for label-based rules, 'enrollment' for individual student rules, 'none' for rules without specific targeting */
  ruleType?: 'student_label' | 'enrollment' | 'none' | null;
  individuals?: AccessControlIndividual[];
}

const OverridableFieldSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    isOverridden: z.boolean(),
    isEnabled: z.boolean(),
    value: valueSchema,
  });

export const DeadlineEntrySchema = z.object({
  date: z.string(),
  credit: z.number(),
});

export const AfterLastDeadlineValueSchema = z.object({
  allowSubmissions: z.boolean().optional(),
  credit: z.number().optional(),
});

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

const PrairieTestFormDataSchema = z.object({
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

const IntegrationsFormDataSchema = z.object({
  prairieTest: PrairieTestFormDataSchema,
});

export const QuestionVisibilityValueSchema = z.object({
  hideQuestions: z.boolean(),
  showAgainDate: z.string().optional(),
  hideAgainDate: z.string().optional(),
});

export const ScoreVisibilityValueSchema = z.object({
  hideScore: z.boolean(),
  showAgainDate: z.string().optional(),
});

const AfterCompleteFormDataSchema = z.object({
  questionVisibility: OverridableFieldSchema(QuestionVisibilityValueSchema),
  scoreVisibility: OverridableFieldSchema(ScoreVisibilityValueSchema),
});

export const IndividualTargetSchema = z.object({
  enrollmentId: z.string().optional(),
  uid: z.string(),
  name: z.string().nullable(),
});

export const StudentLabelTargetSchema = z.object({
  studentLabelId: z.string(),
  name: z.string(),
});

export const AppliesToSchema = z.object({
  targetType: z.enum(['individual', 'student_label']),
  individuals: z.array(IndividualTargetSchema),
  studentLabels: z.array(StudentLabelTargetSchema),
});

export const AccessControlRuleFormDataSchema = z.object({
  id: z.string().optional(),
  trackingId: z.string(),
  enabled: z.boolean(),
  blockAccess: z.boolean().optional(),
  listBeforeRelease: z.boolean().optional(),
  appliesTo: AppliesToSchema,
  dateControl: DateControlFormDataSchema,
  integrations: IntegrationsFormDataSchema,
  afterComplete: AfterCompleteFormDataSchema,
});

export const AccessControlFormDataSchema = z.object({
  mainRule: AccessControlRuleFormDataSchema,
  overrides: z.array(AccessControlRuleFormDataSchema),
});

export interface OverridableField<T> {
  /** Whether the field is overridden. Always true for main rule, can be false for overrides. */
  isOverridden: boolean;
  /** Whether the field is enabled (e.g., false = "release immediately", true = "release after date") */
  isEnabled: boolean;
  value: T;
}

export type DeadlineEntry = z.infer<typeof DeadlineEntrySchema>;

export type AfterLastDeadlineValue = z.infer<typeof AfterLastDeadlineValueSchema>;

export type DateControlFormData = z.infer<typeof DateControlFormDataSchema>;

export type QuestionVisibilityValue = z.infer<typeof QuestionVisibilityValueSchema>;

export type ScoreVisibilityValue = z.infer<typeof ScoreVisibilityValueSchema>;

export type TargetType = z.infer<typeof AppliesToSchema>['targetType'];

export type IndividualTarget = z.infer<typeof IndividualTargetSchema>;

export type StudentLabelTarget = z.infer<typeof StudentLabelTargetSchema>;

export type AppliesTo = z.infer<typeof AppliesToSchema>;

export type AccessControlRuleFormData = z.infer<typeof AccessControlRuleFormDataSchema>;

export type AccessControlFormData = z.infer<typeof AccessControlFormDataSchema>;

/**
 * For main rules, isOverridden is always true.
 * For override rules, isOverridden depends on whether the field has a value.
 */
function makeOverridable<T>(
  isMainRule: boolean,
  hasValue: boolean,
  isEnabled: boolean,
  value: T,
): OverridableField<T> {
  return {
    isOverridden: isMainRule || hasValue,
    isEnabled,
    value,
  };
}

export function formDataToJson(formData: AccessControlFormData): AccessControlJsonWithId[] {
  const allRules = [formData.mainRule, ...formData.overrides];
  return allRules.map((rule, index) => {
    const json = formRuleToJson(rule, index === 0);
    if (rule.appliesTo.targetType === 'individual') {
      json.ruleType = 'enrollment';
      json.individuals = rule.appliesTo.individuals.map((ind) => ({
        enrollmentId: ind.enrollmentId ?? '',
        uid: ind.uid,
        name: ind.name,
      }));
    }
    return json;
  });
}

function isDateControlActive(rule: AccessControlRuleFormData, isMainRule: boolean): boolean {
  if (isMainRule) return rule.dateControl.enabled;
  const dc = rule.dateControl;
  return (
    dc.releaseDate.isOverridden ||
    dc.dueDate.isOverridden ||
    dc.earlyDeadlines.isOverridden ||
    dc.lateDeadlines.isOverridden ||
    dc.afterLastDeadline.isOverridden ||
    dc.durationMinutes.isOverridden ||
    dc.password.isOverridden
  );
}

/**
 * @param rule The form data rule to convert
 * @param isMainRule If true, includes integrations in the output (only main rules support this)
 */
function formRuleToJson(
  rule: AccessControlRuleFormData,
  isMainRule: boolean,
): AccessControlJsonWithId {
  const labels =
    rule.appliesTo.targetType === 'student_label' && rule.appliesTo.studentLabels.length > 0
      ? rule.appliesTo.studentLabels.map((sl) => sl.name)
      : undefined;

  const output: AccessControlJsonWithId = {
    id: rule.id,
    enabled: rule.enabled,
    blockAccess: rule.blockAccess,
    listBeforeRelease: rule.listBeforeRelease ?? true,
    labels,
  };

  if (isDateControlActive(rule, isMainRule)) {
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
    output.integrations = {};
    if (rule.integrations.prairieTest.enabled) {
      output.integrations.prairieTest = {
        enabled: true,
        exams: rule.integrations.prairieTest.exams || [],
      };
    } else {
      output.integrations.prairieTest = { enabled: false };
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
 * @param json The JSON rule data to convert
 * @param isMainRule If true, all fields are marked as overridden (main rule behavior).
 * If false, only fields with values are marked as overridden (override rule behavior).
 */
export function jsonToFormData(
  json: AccessControlJsonWithId,
  isMainRule: boolean,
): AccessControlRuleFormData {
  const dc = json.dateControl;
  const ac = json.afterComplete;

  const hasQuestionVisibility = ac?.hideQuestions !== undefined;
  const hasScoreVisibility = ac?.hideScore !== undefined;

  let appliesTo: AppliesTo;
  if (json.ruleType === 'enrollment' && json.individuals && json.individuals.length > 0) {
    appliesTo = {
      targetType: 'individual',
      individuals: json.individuals.map((i) => ({
        enrollmentId: i.enrollmentId,
        uid: i.uid,
        name: i.name,
      })),
      studentLabels: [],
    };
  } else {
    appliesTo = {
      targetType: 'student_label',
      individuals: [],
      studentLabels: (json.labels ?? []).map((name: string) => ({ studentLabelId: '', name })),
    };
  }

  return {
    id: json.id,
    trackingId: json.id ?? crypto.randomUUID(),
    enabled: json.enabled ?? true,
    blockAccess: json.blockAccess ?? false,
    listBeforeRelease: json.listBeforeRelease ?? true,
    appliesTo,
    dateControl: {
      enabled: dc?.enabled ?? false,
      releaseDate: makeOverridable(
        isMainRule,
        dc?.releaseDate !== undefined,
        dc?.releaseDate != null,
        dc?.releaseDate ?? '',
      ),
      dueDate: makeOverridable(
        isMainRule,
        dc?.dueDate !== undefined,
        dc?.dueDate != null,
        dc?.dueDate ?? '',
      ),
      earlyDeadlines: makeOverridable(
        isMainRule,
        dc?.earlyDeadlines !== undefined,
        (dc?.earlyDeadlines?.length ?? 0) > 0,
        dc?.earlyDeadlines ?? [],
      ),
      lateDeadlines: makeOverridable(
        isMainRule,
        dc?.lateDeadlines !== undefined,
        (dc?.lateDeadlines?.length ?? 0) > 0,
        dc?.lateDeadlines ?? [],
      ),
      afterLastDeadline: makeOverridable(
        isMainRule,
        dc?.afterLastDeadline !== undefined,
        dc?.afterLastDeadline !== undefined,
        dc?.afterLastDeadline ?? {},
      ),
      durationMinutes: makeOverridable(
        isMainRule,
        dc?.durationMinutes !== undefined,
        dc?.durationMinutes != null,
        dc?.durationMinutes ?? 60,
      ),
      password: makeOverridable(
        isMainRule,
        dc?.password !== undefined,
        dc?.password != null,
        dc?.password ?? '',
      ),
    },
    integrations: {
      prairieTest: {
        enabled: json.integrations?.prairieTest?.enabled ?? false,
        exams: json.integrations?.prairieTest?.exams,
      },
    },
    afterComplete: {
      questionVisibility: makeOverridable(isMainRule, hasQuestionVisibility, true, {
        hideQuestions: ac?.hideQuestions ?? false,
        showAgainDate: ac?.showQuestionsAgainDate ?? undefined,
        hideAgainDate: ac?.hideQuestionsAgainDate ?? undefined,
      }),
      scoreVisibility: makeOverridable(isMainRule, hasScoreVisibility, true, {
        hideScore: ac?.hideScore ?? false,
        showAgainDate: ac?.showScoreAgainDate ?? undefined,
      }),
    },
  };
}

export function createDefaultOverrideFormData(): AccessControlRuleFormData {
  return {
    trackingId: crypto.randomUUID(),
    enabled: true,
    blockAccess: false,
    listBeforeRelease: true,
    appliesTo: {
      targetType: 'individual',
      individuals: [],
      studentLabels: [],
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
    integrations: {
      prairieTest: {
        enabled: false,
      },
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
