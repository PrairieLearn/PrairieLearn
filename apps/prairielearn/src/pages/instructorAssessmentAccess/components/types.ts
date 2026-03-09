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

export const DeadlineEntrySchema = z.object({
  date: z.string(),
  credit: z.number(),
});

export const AfterLastDeadlineValueSchema = z.object({
  allowSubmissions: z.boolean().optional(),
  credit: z.number().optional(),
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

export const PrairieTestExamSchema = z.object({
  examUuid: z.string(),
  readOnly: z.boolean().optional(),
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

// Main rule: flat fields, null = feature off
export const MainRuleSchema = z.object({
  id: z.string().optional(),
  trackingId: z.string(),
  enabled: z.boolean(),
  blockAccess: z.boolean(),
  listBeforeRelease: z.boolean(),
  dateControlEnabled: z.boolean(),
  releaseDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  earlyDeadlines: z.array(DeadlineEntrySchema),
  lateDeadlines: z.array(DeadlineEntrySchema),
  afterLastDeadline: AfterLastDeadlineValueSchema.nullable(),
  durationMinutes: z.number().nullable(),
  password: z.string().nullable(),
  prairieTestEnabled: z.boolean(),
  prairieTestExams: z.array(PrairieTestExamSchema),
  questionVisibility: QuestionVisibilityValueSchema,
  scoreVisibility: ScoreVisibilityValueSchema,
});

// Override: flat fields, undefined = inherit from main
export const OverrideSchema = z.object({
  id: z.string().optional(),
  trackingId: z.string(),
  enabled: z.boolean(),
  blockAccess: z.boolean().optional(),
  appliesTo: AppliesToSchema,
  releaseDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  earlyDeadlines: z.array(DeadlineEntrySchema).optional(),
  lateDeadlines: z.array(DeadlineEntrySchema).optional(),
  afterLastDeadline: AfterLastDeadlineValueSchema.nullable().optional(),
  durationMinutes: z.number().nullable().optional(),
  password: z.string().nullable().optional(),
  questionVisibility: QuestionVisibilityValueSchema.optional(),
  scoreVisibility: ScoreVisibilityValueSchema.optional(),
});

export const AccessControlFormDataSchema = z.object({
  mainRule: MainRuleSchema,
  overrides: z.array(OverrideSchema),
});

export type DeadlineEntry = z.infer<typeof DeadlineEntrySchema>;

export type AfterLastDeadlineValue = z.infer<typeof AfterLastDeadlineValueSchema>;

export type QuestionVisibilityValue = z.infer<typeof QuestionVisibilityValueSchema>;

export type ScoreVisibilityValue = z.infer<typeof ScoreVisibilityValueSchema>;

export type PrairieTestExam = z.infer<typeof PrairieTestExamSchema>;

export type TargetType = z.infer<typeof AppliesToSchema>['targetType'];

export type IndividualTarget = z.infer<typeof IndividualTargetSchema>;

export type StudentLabelTarget = z.infer<typeof StudentLabelTargetSchema>;

export type AppliesTo = z.infer<typeof AppliesToSchema>;

export type MainRuleData = z.infer<typeof MainRuleSchema>;

export type OverrideData = z.infer<typeof OverrideSchema>;

export type AccessControlFormData = z.infer<typeof AccessControlFormDataSchema>;

export function jsonToMainRuleFormData(json: AccessControlJsonWithId): MainRuleData {
  const dc = json.dateControl;
  const ac = json.afterComplete;

  return {
    id: json.id,
    trackingId: json.id ?? crypto.randomUUID(),
    enabled: json.enabled ?? true,
    blockAccess: json.blockAccess ?? false,
    listBeforeRelease: json.listBeforeRelease ?? true,
    dateControlEnabled: dc?.enabled ?? false,
    releaseDate: dc?.releaseDate ?? null,
    dueDate: dc?.dueDate ?? null,
    earlyDeadlines: dc?.earlyDeadlines ?? [],
    lateDeadlines: dc?.lateDeadlines ?? [],
    afterLastDeadline: dc?.afterLastDeadline ?? null,
    durationMinutes: dc?.durationMinutes ?? null,
    password: dc?.password ?? null,
    prairieTestEnabled: json.integrations?.prairieTest?.enabled ?? false,
    prairieTestExams: json.integrations?.prairieTest?.exams ?? [],
    questionVisibility: {
      hideQuestions: ac?.hideQuestions ?? false,
      showAgainDate: ac?.showQuestionsAgainDate,
      hideAgainDate: ac?.hideQuestionsAgainDate,
    },
    scoreVisibility: {
      hideScore: ac?.hideScore ?? false,
      showAgainDate: ac?.showScoreAgainDate,
    },
  };
}

export function jsonToOverrideFormData(json: AccessControlJsonWithId): OverrideData {
  const dc = json.dateControl;
  const ac = json.afterComplete;

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

  const result: OverrideData = {
    id: json.id,
    trackingId: json.id ?? crypto.randomUUID(),
    enabled: json.enabled ?? true,
    appliesTo,
  };

  if (json.blockAccess !== undefined) result.blockAccess = json.blockAccess ?? false;

  if (dc?.releaseDate !== undefined) result.releaseDate = dc.releaseDate;
  if (dc?.dueDate !== undefined) result.dueDate = dc.dueDate;
  if (dc?.earlyDeadlines !== undefined) result.earlyDeadlines = dc.earlyDeadlines ?? [];
  if (dc?.lateDeadlines !== undefined) result.lateDeadlines = dc.lateDeadlines ?? [];
  if (dc?.afterLastDeadline !== undefined) result.afterLastDeadline = dc.afterLastDeadline;
  if (dc?.durationMinutes !== undefined) result.durationMinutes = dc.durationMinutes;
  if (dc?.password !== undefined) result.password = dc.password;

  if (ac?.hideQuestions !== undefined) {
    result.questionVisibility = {
      hideQuestions: ac.hideQuestions,
      showAgainDate: ac.showQuestionsAgainDate,
      hideAgainDate: ac.hideQuestionsAgainDate,
    };
  }
  if (ac?.hideScore !== undefined) {
    result.scoreVisibility = {
      hideScore: ac.hideScore,
      showAgainDate: ac.showScoreAgainDate,
    };
  }

  return result;
}

function mainRuleToJson(rule: MainRuleData): AccessControlJsonWithId {
  const output: AccessControlJsonWithId = {
    id: rule.id,
    enabled: rule.enabled,
    blockAccess: rule.blockAccess,
    listBeforeRelease: rule.listBeforeRelease,
  };

  if (rule.dateControlEnabled) {
    output.dateControl = { enabled: true };
    if (rule.releaseDate) output.dateControl.releaseDate = rule.releaseDate;
    if (rule.dueDate) output.dateControl.dueDate = rule.dueDate;
    if (rule.earlyDeadlines.length > 0) output.dateControl.earlyDeadlines = rule.earlyDeadlines;
    if (rule.lateDeadlines.length > 0) output.dateControl.lateDeadlines = rule.lateDeadlines;
    if (rule.afterLastDeadline) output.dateControl.afterLastDeadline = rule.afterLastDeadline;
    if (rule.durationMinutes != null) output.dateControl.durationMinutes = rule.durationMinutes;
    if (rule.password) output.dateControl.password = rule.password;
  } else {
    output.dateControl = { enabled: false };
  }

  output.integrations = {};
  if (rule.prairieTestEnabled) {
    output.integrations.prairieTest = {
      enabled: true,
      exams: rule.prairieTestExams,
    };
  } else {
    output.integrations.prairieTest = { enabled: false };
  }

  output.afterComplete = {
    hideQuestions: rule.questionVisibility.hideQuestions,
  };
  if (rule.questionVisibility.showAgainDate) {
    output.afterComplete.showQuestionsAgainDate = rule.questionVisibility.showAgainDate;
  }
  if (rule.questionVisibility.hideAgainDate) {
    output.afterComplete.hideQuestionsAgainDate = rule.questionVisibility.hideAgainDate;
  }
  output.afterComplete.hideScore = rule.scoreVisibility.hideScore;
  if (rule.scoreVisibility.showAgainDate) {
    output.afterComplete.showScoreAgainDate = rule.scoreVisibility.showAgainDate;
  }

  return output;
}

function overrideToJson(rule: OverrideData): AccessControlJsonWithId {
  const labels =
    rule.appliesTo.targetType === 'student_label' && rule.appliesTo.studentLabels.length > 0
      ? rule.appliesTo.studentLabels.map((sl) => sl.name)
      : undefined;

  const output: AccessControlJsonWithId = {
    id: rule.id,
    enabled: rule.enabled,
    labels,
  };

  if (rule.blockAccess !== undefined) output.blockAccess = rule.blockAccess;

  const hasDateControl =
    rule.releaseDate !== undefined ||
    rule.dueDate !== undefined ||
    rule.earlyDeadlines !== undefined ||
    rule.lateDeadlines !== undefined ||
    rule.afterLastDeadline !== undefined ||
    rule.durationMinutes !== undefined ||
    rule.password !== undefined;

  if (hasDateControl) {
    output.dateControl = {};
    if (rule.releaseDate !== undefined && rule.releaseDate !== null) {
      output.dateControl.releaseDate = rule.releaseDate;
    }
    if (rule.dueDate !== undefined && rule.dueDate !== null) {
      output.dateControl.dueDate = rule.dueDate;
    }
    if (rule.earlyDeadlines !== undefined && rule.earlyDeadlines.length > 0) {
      output.dateControl.earlyDeadlines = rule.earlyDeadlines;
    }
    if (rule.lateDeadlines !== undefined && rule.lateDeadlines.length > 0) {
      output.dateControl.lateDeadlines = rule.lateDeadlines;
    }
    if (rule.afterLastDeadline !== undefined && rule.afterLastDeadline !== null) {
      output.dateControl.afterLastDeadline = rule.afterLastDeadline;
    }
    if (rule.durationMinutes !== undefined && rule.durationMinutes !== null) {
      output.dateControl.durationMinutes = rule.durationMinutes;
    }
    if (rule.password !== undefined && rule.password !== null) {
      output.dateControl.password = rule.password;
    }
  }

  if (rule.questionVisibility !== undefined || rule.scoreVisibility !== undefined) {
    output.afterComplete = {};
    if (rule.questionVisibility) {
      output.afterComplete.hideQuestions = rule.questionVisibility.hideQuestions;
      if (rule.questionVisibility.showAgainDate) {
        output.afterComplete.showQuestionsAgainDate = rule.questionVisibility.showAgainDate;
      }
      if (rule.questionVisibility.hideAgainDate) {
        output.afterComplete.hideQuestionsAgainDate = rule.questionVisibility.hideAgainDate;
      }
    }
    if (rule.scoreVisibility) {
      output.afterComplete.hideScore = rule.scoreVisibility.hideScore;
      if (rule.scoreVisibility.showAgainDate) {
        output.afterComplete.showScoreAgainDate = rule.scoreVisibility.showAgainDate;
      }
    }
  }

  if (rule.appliesTo.targetType === 'individual') {
    output.ruleType = 'enrollment';
    output.individuals = rule.appliesTo.individuals.map((ind) => ({
      enrollmentId: ind.enrollmentId ?? '',
      uid: ind.uid,
      name: ind.name,
    }));
  }

  return output;
}

export function formDataToJson(formData: AccessControlFormData): AccessControlJsonWithId[] {
  return [mainRuleToJson(formData.mainRule), ...formData.overrides.map(overrideToJson)];
}

export function createDefaultOverrideFormData(): OverrideData {
  return {
    trackingId: crypto.randomUUID(),
    enabled: true,
    appliesTo: {
      targetType: 'individual',
      individuals: [],
      studentLabels: [],
    },
  };
}
