import type { AccessControlJson } from '../../../schemas/accessControl.js';

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

export interface AccessControlRuleFormData {
  enabled: boolean;
  blockAccess?: boolean;
  listBeforeRelease?: boolean;
  targets?: string[];
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
export function formDataToJson(formData: AccessControlFormData): AccessControlJson[] {
  return [formData.mainRule, ...formData.overrides].map((rule) => transformRule(rule));
}

function transformRule(rule: AccessControlRuleFormData): AccessControlJson {
  const output: AccessControlJson = {
    enabled: rule.enabled,
    blockAccess: rule.blockAccess,
    listBeforeRelease: rule.listBeforeRelease || true,
    targets: rule.targets,
  };

  // Handle dateControl
  if (rule.dateControl.enabled) {
    output.dateControl = {
      enabled: true,
    };

    // Only include fields where isOverridden && isEnabled are true
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
    // When disabled, only output { enabled: false }
    output.dateControl = { enabled: false };
  }

  // Handle prairieTestControl
  if (rule.prairieTestControl.enabled) {
    output.prairieTestControl = {
      enabled: true,
      exams: rule.prairieTestControl.exams || [],
    };
  } else {
    // When disabled, only output { enabled: false }
    output.prairieTestControl = { enabled: false };
  }

  // Handle afterComplete - only include sections that are overridden
  const { questionVisibility, scoreVisibility } = rule.afterComplete;

  if (questionVisibility.isOverridden || scoreVisibility.isOverridden) {
    output.afterComplete = {};

    if (questionVisibility.isOverridden) {
      output.afterComplete.hideQuestions = questionVisibility.value.hideQuestions;
      if (questionVisibility.value.showAgainDate) {
        output.afterComplete.showQuestionsAgainDate = true;
      }
      if (questionVisibility.value.hideAgainDate) {
        output.afterComplete.hideQuestionsAgainDate = true;
      }
    }

    if (scoreVisibility.isOverridden) {
      output.afterComplete.hideScore = scoreVisibility.value.hideScore;
      if (scoreVisibility.value.showAgainDate) {
        output.afterComplete.showScoreAgainDate = true;
      }
    }
  }

  return output;
}

/**
 * Convert JSON to form data structure.
 * @param json The access control JSON
 * @param isMainRule If true, all fields are marked as overridden (main rule behavior).
 * If false, only fields with values are marked as overridden (override rule behavior).
 */
export function jsonToFormData(
  json: AccessControlJson,
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

  return {
    enabled: json.enabled ?? true,
    blockAccess: json.blockAccess ?? false,
    listBeforeRelease: json.listBeforeRelease ?? true,
    targets: json.targets,
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
    targets: [],
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
