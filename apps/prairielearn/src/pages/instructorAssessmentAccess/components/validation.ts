import {
  type FieldErrors,
  type FieldPath,
  type Resolver,
  type ResolverResult,
  set,
} from 'react-hook-form';

import {
  type AccessControlValidationIssue,
  type AccessControlValidationRule,
  validateAfterCompleteCrossFieldIssues,
  validateGlobalAfterCompleteIssues,
  validateGlobalCreditConsistencyIssues,
  validateGlobalDateConsistencyIssues,
  validateGlobalStructuralDependencyIssues,
  validateRuleCreditOrderingIssues,
  validateRuleDateOrderingIssues,
  validateRuleStructuralDependencyIssues,
} from '../../../lib/assessment-access-control/validation.js';
import {
  MAX_ACCESS_CONTROL_DURATION_MINUTES,
  MAX_ACCESS_CONTROL_EARLY_OR_LATE_DEADLINES_PER_RULE,
  MAX_ACCESS_CONTROL_ENROLLMENTS_PER_RULE,
  MAX_ACCESS_CONTROL_PASSWORD_LENGTH,
  MAX_ACCESS_CONTROL_PRAIRIETEST_EXAMS,
  MAX_ACCESS_CONTROL_STUDENT_LABELS_PER_RULE,
  MAX_ENROLLMENT_ACCESS_CONTROL_RULES,
  MAX_STUDENT_LABEL_ACCESS_CONTROL_RULES,
} from '../../../schemas/accessControl.js';

import { isFormFieldPathEditable, isOverrideFieldActive } from './overrideFields.js';
import {
  type AccessControlFormData,
  type AfterLastDeadlineValue,
  type DeadlineEntry,
  type DueValue,
  type QuestionVisibilityValue,
  type ScoreVisibilityValue,
  defaultRuleHasCompletionMechanism,
  formDataToJson,
  isReleasedNow,
} from './types.js';

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DATE_REQUIRED_MESSAGE = 'Date is required';

export type AccessControlFormFieldPath = FieldPath<AccessControlFormData>;

type AccessControlFormValidationPath =
  | AccessControlFormFieldPath
  | 'overrides.root'
  | `overrides.${number}.appliesTo.root`;

interface AccessControlFormValidationError {
  path: AccessControlFormValidationPath;
  message: string;
}

export interface AccessControlFormResolverContext {
  displayTimezone: string;
}

export function isDateFieldEmpty(value: string | undefined): boolean {
  return value !== undefined && !value;
}

type DateControlValidationPath =
  | 'defaultRule.release.date'
  | 'defaultRule.due.date'
  | 'defaultRule.due.credit'
  | `defaultRule.earlyDeadlines.${number}.date`
  | `defaultRule.earlyDeadlines.${number}.credit`
  | `defaultRule.lateDeadlines.${number}.date`
  | `defaultRule.lateDeadlines.${number}.credit`
  | 'defaultRule.afterLastDeadline.credit'
  | 'defaultRule.questionVisibility'
  | 'defaultRule.questionVisibility.visibleFromDate'
  | 'defaultRule.questionVisibility.visibleUntilDate'
  | 'defaultRule.scoreVisibility'
  | 'defaultRule.scoreVisibility.visibleFromDate'
  | `overrides.${number}.release.date`
  | `overrides.${number}.due.date`
  | `overrides.${number}.due.credit`
  | `overrides.${number}.earlyDeadlines.${number}.date`
  | `overrides.${number}.earlyDeadlines.${number}.credit`
  | `overrides.${number}.lateDeadlines.${number}.date`
  | `overrides.${number}.lateDeadlines.${number}.credit`
  | `overrides.${number}.afterLastDeadline.credit`
  | `overrides.${number}.questionVisibility`
  | `overrides.${number}.questionVisibility.visibleFromDate`
  | `overrides.${number}.questionVisibility.visibleUntilDate`
  | `overrides.${number}.scoreVisibility`
  | `overrides.${number}.scoreVisibility.visibleFromDate`;

function buildValidationRules(formData: AccessControlFormData): AccessControlValidationRule[] {
  return formDataToJson(formData).map((rule, index) => ({
    rule,
    targetType: index === 0 ? 'none' : (rule.ruleType ?? 'student_label'),
    ruleIndex: index,
  }));
}

function mapIssueToFormFieldPath(
  issue: AccessControlValidationIssue,
): DateControlValidationPath | null {
  const prefix: 'defaultRule' | `overrides.${number}` =
    issue.ruleIndex === 0 ? 'defaultRule' : `overrides.${issue.ruleIndex - 1}`;

  switch (issue.path[0]) {
    case 'dateControl':
      switch (issue.path[1]) {
        case 'release':
          return `${prefix}.release.date`;
        case 'due':
          return issue.path[2] === 'credit' ? `${prefix}.due.credit` : `${prefix}.due.date`;
        case 'earlyDeadlines':
          return issue.path[3] === 'credit'
            ? `${prefix}.earlyDeadlines.${issue.path[2]}.credit`
            : `${prefix}.earlyDeadlines.${issue.path[2]}.date`;
        case 'lateDeadlines':
          return issue.path[3] === 'credit'
            ? `${prefix}.lateDeadlines.${issue.path[2]}.credit`
            : `${prefix}.lateDeadlines.${issue.path[2]}.date`;
        case 'afterLastDeadline':
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          return issue.path[2] === 'credit' ? `${prefix}.afterLastDeadline.credit` : null;
        default:
          return null;
      }
    case 'afterComplete':
      if (issue.path[1] === 'questions') {
        if (issue.path.length === 2) {
          return `${prefix}.questionVisibility`;
        }
        switch (issue.path[2]) {
          case 'visibleFromDate':
            return `${prefix}.questionVisibility.visibleFromDate`;
          case 'visibleUntilDate':
            return `${prefix}.questionVisibility.visibleUntilDate`;
          default:
            return null;
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (issue.path[1] === 'score') {
        if (issue.path.length === 2) return `${prefix}.scoreVisibility`;
        switch (issue.path[2]) {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          case 'visibleFromDate':
            return `${prefix}.scoreVisibility.visibleFromDate`;
          default:
            return null;
        }
      }
      return null;
    default:
      return null;
  }
}

function mapIssueToEditableFormFieldPath(
  issue: AccessControlValidationIssue,
  formData: AccessControlFormData,
): AccessControlFormFieldPath | null {
  const path = mapIssueToFormFieldPath(issue);
  if (!path) return null;
  if (isFormFieldPathEditable(formData, path)) return path;

  // The "score hidden while questions visible" rule is a cross-field
  // constraint between question and score visibility. The default mapping
  // attaches the issue to question visibility, but on an override the user
  // can resolve it by editing whichever of the two fields they have
  // overridden. If only score visibility is overridden, redirect the error
  // there so it lands on an input the user can actually edit.
  if (
    issue.path[0] === 'afterComplete' &&
    issue.path[1] === 'questions' &&
    issue.path.length === 2 &&
    issue.ruleIndex > 0
  ) {
    const scorePath: AccessControlFormFieldPath = `overrides.${issue.ruleIndex - 1}.scoreVisibility`;
    if (isFormFieldPathEditable(formData, scorePath)) return scorePath;
  }

  return null;
}

/**
 * Surface inconsistencies between the "Released" / "Scheduled for release"
 * radio choice and the chosen date. The radio reflects the user's intent;
 * if the date contradicts that intent we want a form error rather than
 * silently flipping the radio.
 */
function getReleaseStateValidationErrors(
  formData: AccessControlFormData,
  displayTimezone: string,
): { path: AccessControlFormFieldPath; message: string }[] {
  const results: { path: AccessControlFormFieldPath; message: string }[] = [];

  const checkRule = (
    release: AccessControlFormData['defaultRule']['release'],
    path: AccessControlFormFieldPath,
  ) => {
    if (!release.date) return;
    const dateIsPast = isReleasedNow(release.date, displayTimezone);
    if (release.released && !dateIsPast) {
      results.push({
        path,
        message: 'Release date must not be in the future when state is Released.',
      });
    } else if (!release.released && dateIsPast) {
      results.push({
        path,
        message: 'Release date must be in the future when scheduled for release.',
      });
    }
  };

  if (formData.defaultRule.dateControlEnabled) {
    checkRule(formData.defaultRule.release, 'defaultRule.release.date');
  }

  formData.overrides.forEach((override, index) => {
    if (isOverrideFieldActive(formData, index, 'release')) {
      checkRule(override.release, `overrides.${index}.release.date`);
    }
  });

  return results;
}

export function getGlobalDateValidationErrors(
  formData: AccessControlFormData,
  displayTimezone: string,
): {
  path: AccessControlFormFieldPath;
  message: string;
}[] {
  const seenPaths = new Set<AccessControlFormFieldPath>();
  const results: { path: AccessControlFormFieldPath; message: string }[] = [];

  const validationRules = buildValidationRules(formData);

  for (const issues of [
    validateGlobalDateConsistencyIssues(validationRules),
    validateGlobalCreditConsistencyIssues(validationRules),
    validateGlobalStructuralDependencyIssues(validationRules),
    // Run the "no completion mechanism" check before the cross-field check —
    // both target the same questionVisibility path, but the mechanism error
    // is more fundamental (cross-field consistency is moot when there's no
    // mechanism at all).
    validateGlobalAfterCompleteIssues(validationRules),
    validateAfterCompleteCrossFieldIssues(validationRules),
  ]) {
    for (const issue of issues) {
      const path = mapIssueToEditableFormFieldPath(issue, formData);
      if (!path || seenPaths.has(path)) continue;
      seenPaths.add(path);
      results.push({ path, message: issue.message });
    }
  }

  for (const validationRule of validationRules) {
    const dateIssues = validateRuleDateOrderingIssues(validationRule);
    const issueGroups = [validateRuleStructuralDependencyIssues(validationRule), dateIssues];
    // Credit ordering assumes deadlines are chronological; skip if dates are
    // out of order to avoid misleading "credits must strictly decrease" errors.
    if (dateIssues.length === 0) {
      issueGroups.push(validateRuleCreditOrderingIssues(validationRule));
    }
    for (const issues of issueGroups) {
      for (const issue of issues) {
        const path = mapIssueToEditableFormFieldPath(issue, formData);
        if (!path || seenPaths.has(path)) continue;
        seenPaths.add(path);
        results.push({ path, message: issue.message });
      }
    }
  }

  for (const error of getReleaseStateValidationErrors(formData, displayTimezone)) {
    if (seenPaths.has(error.path)) continue;
    seenPaths.add(error.path);
    results.push(error);
  }

  return results;
}

function addValidationError(
  errors: AccessControlFormValidationError[],
  seenPaths: Set<AccessControlFormValidationPath>,
  path: AccessControlFormValidationPath,
  message: string | undefined,
) {
  if (!message || seenPaths.has(path)) return;
  seenPaths.add(path);
  errors.push({ path, message });
}

function toDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validateReleaseDate(value: string | null): string | undefined {
  if (!value) return 'Release date is required';
  return undefined;
}

function validateDueDate(
  date: string | null,
  releaseDate: string | null | undefined,
): string | undefined {
  if (date === null) return undefined;
  if (!date) return DATE_REQUIRED_MESSAGE;
  if (releaseDate) {
    const dueDate = toDate(date);
    const release = toDate(releaseDate);
    if (dueDate && release && dueDate <= release) {
      return 'Due date must be after the release date';
    }
  }
  return undefined;
}

function validateDueCredit(credit: number | null, customCredit: boolean): string | undefined {
  if (credit === null) {
    if (customCredit) return 'Credit is required';
    return undefined;
  }
  if (!Number.isFinite(credit)) return 'Credit must be a finite number';
  if (!Number.isInteger(credit)) return 'Credit must be an integer';
  if (credit < 0 || credit > 200) return 'Credit must be between 0% and 200%';
  return undefined;
}

function validateDuration(value: number | null): string | undefined {
  if (value !== null && value < 1) return 'Duration must be at least 1 minute';
  if (value !== null && value > MAX_ACCESS_CONTROL_DURATION_MINUTES) {
    return `Duration must be at most ${MAX_ACCESS_CONTROL_DURATION_MINUTES} minutes`;
  }
  return undefined;
}

function validatePassword(value: string | null): string | undefined {
  if (value === '') return 'Password is required';
  if (value !== null && value.length > MAX_ACCESS_CONTROL_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_ACCESS_CONTROL_PASSWORD_LENGTH} characters`;
  }
  return undefined;
}

function validateQuestionVisibility(
  value: QuestionVisibilityValue,
  prefix: 'defaultRule' | `overrides.${number}`,
  addError: (path: AccessControlFormFieldPath, message: string | undefined) => void,
) {
  if (!value.hidden) return;
  addError(
    `${prefix}.questionVisibility.visibleFromDate`,
    isDateFieldEmpty(value.visibleFromDate) ? DATE_REQUIRED_MESSAGE : undefined,
  );
  addError(
    `${prefix}.questionVisibility.visibleUntilDate`,
    isDateFieldEmpty(value.visibleUntilDate) ? DATE_REQUIRED_MESSAGE : undefined,
  );
}

function validateScoreVisibility(
  value: ScoreVisibilityValue,
  prefix: 'defaultRule' | `overrides.${number}`,
  addError: (path: AccessControlFormFieldPath, message: string | undefined) => void,
) {
  if (!value.hidden) return;
  addError(
    `${prefix}.scoreVisibility.visibleFromDate`,
    isDateFieldEmpty(value.visibleFromDate) ? DATE_REQUIRED_MESSAGE : undefined,
  );
}

function validateDeadlineDate({
  type,
  value,
  index,
  deadlines,
  releaseDate,
  dueDate,
}: {
  type: 'early' | 'late';
  value: string;
  index: number;
  deadlines: DeadlineEntry[];
  releaseDate: string | null | undefined;
  dueDate: string | null | undefined;
}): string | undefined {
  const isEarly = type === 'early';
  if (!value) return DATE_REQUIRED_MESSAGE;

  const currentDueDate = dueDate ? toDate(dueDate) : null;
  if (!currentDueDate && !isEarly) return 'Late deadlines require a due date';

  for (let i = 0; i < deadlines.length; i++) {
    if (i !== index && deadlines[i]?.date === value) return 'Duplicate deadline date';
  }

  const deadlineDate = toDate(value);
  if (!deadlineDate) return undefined;

  const currentReleaseDate = releaseDate ? toDate(releaseDate) : null;
  if (isEarly) {
    if (currentDueDate && deadlineDate > currentDueDate) {
      return 'Early deadline must be on or before the due date';
    }
    if (index > 0 && deadlines[index - 1]?.date) {
      const previousDeadline = toDate(deadlines[index - 1].date);
      if (previousDeadline && deadlineDate <= previousDeadline) {
        return 'Must be after the previous deadline';
      }
    }
    if (currentReleaseDate && deadlineDate <= currentReleaseDate) {
      return 'Early deadline must be after the release date';
    }
  } else {
    if (currentReleaseDate && deadlineDate <= currentReleaseDate) {
      return 'Late deadline must be after the release date';
    }
    if (currentDueDate && deadlineDate < currentDueDate) {
      return 'Late deadline must be on or after the due date';
    }
    if (index > 0 && deadlines[index - 1]?.date) {
      const previousDeadline = toDate(deadlines[index - 1].date);
      if (previousDeadline && deadlineDate <= previousDeadline) {
        return 'Must be after the previous deadline';
      }
    }
  }

  return undefined;
}

function validateDeadlineCredit({
  type,
  value,
  index,
  deadlines,
  dueCredit,
}: {
  type: 'early' | 'late';
  value: number;
  index: number;
  deadlines: DeadlineEntry[];
  dueCredit: number;
}): string | undefined {
  const isEarly = type === 'early';
  if (Number.isNaN(value)) return 'Credit is required';
  if (!Number.isFinite(value)) return 'Credit must be a finite number';
  if (!Number.isInteger(value)) return 'Credit must be an integer';
  if (isEarly) {
    if (value < 0 || value > 200) return 'Credit must be 0-200%';
    if (value <= dueCredit) return 'Credit must be greater than due credit';
  } else if (value < 0 || value >= 100) {
    return 'Credit after the due date must be 0-99%';
  }
  if (index > 0 && value >= (deadlines[index - 1]?.credit ?? 0)) {
    return 'Credit must be less than previous deadline';
  }
  if (!isEarly && index === 0 && value >= dueCredit) {
    return 'Credit must be less than due credit';
  }
  return undefined;
}

function validateDeadlineArray({
  prefix,
  fieldName,
  type,
  deadlines,
  releaseDate,
  dueDate,
  dueCredit,
  addError,
}: {
  prefix: 'defaultRule' | `overrides.${number}`;
  fieldName: 'earlyDeadlines' | 'lateDeadlines';
  type: 'early' | 'late';
  deadlines: DeadlineEntry[];
  releaseDate: string | null | undefined;
  dueDate: string | null | undefined;
  dueCredit: number;
  addError: (path: AccessControlFormFieldPath, message: string | undefined) => void;
}) {
  if (deadlines.length > MAX_ACCESS_CONTROL_EARLY_OR_LATE_DEADLINES_PER_RULE) {
    addError(
      `${prefix}.${fieldName}.${MAX_ACCESS_CONTROL_EARLY_OR_LATE_DEADLINES_PER_RULE}.date`,
      `A rule can have at most ${MAX_ACCESS_CONTROL_EARLY_OR_LATE_DEADLINES_PER_RULE} ${type} deadlines.`,
    );
  }

  deadlines.forEach((deadline, index) => {
    addError(
      `${prefix}.${fieldName}.${index}.date`,
      validateDeadlineDate({ type, value: deadline.date, index, deadlines, releaseDate, dueDate }),
    );
    addError(
      `${prefix}.${fieldName}.${index}.credit`,
      validateDeadlineCredit({ type, value: deadline.credit, index, deadlines, dueCredit }),
    );
  });
}

function validateAfterLastDeadlineCredit({
  value,
  due,
  lateDeadlines,
}: {
  value: AfterLastDeadlineValue | null;
  due: DueValue;
  lateDeadlines: DeadlineEntry[];
}): string | undefined {
  if (value?.credit === undefined) return undefined;
  const credit = value.credit;
  if (Number.isNaN(credit)) return 'Credit is required';
  if (!Number.isFinite(credit)) return 'Credit must be a finite number';
  if (!Number.isInteger(credit)) return 'Credit must be an integer';
  if (credit < 0 || credit >= 100) return 'Credit after the due date must be 0-99%';
  const dueDate = due.date;
  const dueCredit = due.credit ?? 100;
  const precedingCredit = lateDeadlines.at(-1)?.credit ?? (dueDate != null ? dueCredit : undefined);
  if (precedingCredit != null && credit >= precedingCredit) {
    return `Must be less than ${precedingCredit}% (the preceding deadline's credit)`;
  }
  return undefined;
}

function validatePrairieTestExams(
  formData: AccessControlFormData,
  addError: (path: AccessControlFormFieldPath, message: string | undefined) => void,
) {
  if (formData.defaultRule.prairieTestExams.length > MAX_ACCESS_CONTROL_PRAIRIETEST_EXAMS) {
    addError(
      `defaultRule.prairieTestExams.${MAX_ACCESS_CONTROL_PRAIRIETEST_EXAMS}.examUuid`,
      `A rule can have at most ${MAX_ACCESS_CONTROL_PRAIRIETEST_EXAMS} PrairieTest exams.`,
    );
  }

  const examUuidCounts = new Map<string, number>();
  for (const exam of formData.defaultRule.prairieTestExams) {
    if (UUID_PATTERN.test(exam.examUuid)) {
      const normalizedUuid = exam.examUuid.toLowerCase();
      examUuidCounts.set(normalizedUuid, (examUuidCounts.get(normalizedUuid) ?? 0) + 1);
    }
  }

  formData.defaultRule.prairieTestExams.forEach((exam, index) => {
    const path: AccessControlFormFieldPath = `defaultRule.prairieTestExams.${index}.examUuid`;
    if (!exam.examUuid) {
      addError(path, 'Exam UUID is required');
    } else if (!UUID_PATTERN.test(exam.examUuid)) {
      addError(path, 'Invalid UUID format');
    } else if ((examUuidCounts.get(exam.examUuid.toLowerCase()) ?? 0) > 1) {
      addError(path, 'Duplicate exam UUID');
    }
  });
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

function validateRuleCounts(
  formData: AccessControlFormData,
  addError: (path: AccessControlFormValidationPath, message: string | undefined) => void,
) {
  const studentLabelOverrideCount = formData.overrides.filter(
    (override) => override.appliesTo.targetType === 'student_label',
  ).length;
  const enrollmentRuleCount = formData.overrides.filter(
    (override) => override.appliesTo.targetType === 'enrollment',
  ).length;

  const messages: string[] = [];
  if (studentLabelOverrideCount > MAX_STUDENT_LABEL_ACCESS_CONTROL_RULES) {
    const excess = studentLabelOverrideCount - MAX_STUDENT_LABEL_ACCESS_CONTROL_RULES;
    messages.push(
      `At most ${MAX_STUDENT_LABEL_ACCESS_CONTROL_RULES} student-label overrides are allowed. Remove ${excess} student-label ${pluralize(excess, 'override', 'overrides')} before saving.`,
    );
  }
  if (enrollmentRuleCount > MAX_ENROLLMENT_ACCESS_CONTROL_RULES) {
    const excess = enrollmentRuleCount - MAX_ENROLLMENT_ACCESS_CONTROL_RULES;
    messages.push(
      `At most ${MAX_ENROLLMENT_ACCESS_CONTROL_RULES} student-specific overrides are allowed. Remove ${excess} student-specific ${pluralize(excess, 'override', 'overrides')} before saving.`,
    );
  }

  addError('overrides.root', messages.join(' '));
}

function validateDefaultRule(
  formData: AccessControlFormData,
  addError: (path: AccessControlFormFieldPath, message: string | undefined) => void,
) {
  const rule = formData.defaultRule;

  if (rule.dateControlEnabled) {
    addError('defaultRule.release.date', validateReleaseDate(rule.release.date));
    addError('defaultRule.due.date', validateDueDate(rule.due.date, rule.release.date));
    addError('defaultRule.due.credit', validateDueCredit(rule.due.credit, rule.due.customCredit));
    validateDeadlineArray({
      prefix: 'defaultRule',
      fieldName: 'earlyDeadlines',
      type: 'early',
      deadlines: rule.earlyDeadlines,
      releaseDate: rule.release.date,
      dueDate: rule.due.date,
      dueCredit: rule.due.credit ?? 100,
      addError,
    });
    validateDeadlineArray({
      prefix: 'defaultRule',
      fieldName: 'lateDeadlines',
      type: 'late',
      deadlines: rule.lateDeadlines,
      releaseDate: rule.release.date,
      dueDate: rule.due.date,
      dueCredit: rule.due.credit ?? 100,
      addError,
    });
    addError(
      'defaultRule.afterLastDeadline.credit',
      validateAfterLastDeadlineCredit({
        value: rule.afterLastDeadline,
        due: rule.due,
        lateDeadlines: rule.lateDeadlines,
      }),
    );
    addError('defaultRule.durationMinutes', validateDuration(rule.durationMinutes));
    addError('defaultRule.password', validatePassword(rule.password));
  }

  validatePrairieTestExams(formData, addError);
  if (defaultRuleHasCompletionMechanism(rule)) {
    validateQuestionVisibility(rule.questionVisibility, 'defaultRule', addError);
    validateScoreVisibility(rule.scoreVisibility, 'defaultRule', addError);
  }
}

function validateOverrideRule(
  formData: AccessControlFormData,
  index: number,
  addError: (path: AccessControlFormValidationPath, message: string | undefined) => void,
) {
  const override = formData.overrides[index];
  const prefix = `overrides.${index}` as const;
  const fieldActive = (fieldName: Parameters<typeof isOverrideFieldActive>[2]) =>
    isOverrideFieldActive(formData, index, fieldName);
  const effectiveReleaseDate = fieldActive('release')
    ? override.release.date
    : formData.defaultRule.release.date;
  const effectiveDue = fieldActive('due') ? override.due : formData.defaultRule.due;
  const effectiveLateDeadlines = fieldActive('lateDeadlines')
    ? override.lateDeadlines
    : formData.defaultRule.lateDeadlines;

  if (
    override.appliesTo.targetType === 'student_label' &&
    override.appliesTo.studentLabels.length > MAX_ACCESS_CONTROL_STUDENT_LABELS_PER_RULE
  ) {
    addError(
      `${prefix}.appliesTo.root`,
      `At most ${MAX_ACCESS_CONTROL_STUDENT_LABELS_PER_RULE} student labels can be selected.`,
    );
  }
  if (
    override.appliesTo.targetType === 'enrollment' &&
    override.appliesTo.enrollments.length > MAX_ACCESS_CONTROL_ENROLLMENTS_PER_RULE
  ) {
    addError(
      `${prefix}.appliesTo.root`,
      `At most ${MAX_ACCESS_CONTROL_ENROLLMENTS_PER_RULE} students can be selected.`,
    );
  }

  if (fieldActive('release')) {
    addError(`${prefix}.release.date`, validateReleaseDate(override.release.date));
  }
  if (fieldActive('due')) {
    addError(`${prefix}.due.date`, validateDueDate(override.due.date, effectiveReleaseDate));
    addError(
      `${prefix}.due.credit`,
      validateDueCredit(override.due.credit, override.due.customCredit),
    );
  }
  if (fieldActive('earlyDeadlines')) {
    validateDeadlineArray({
      prefix,
      fieldName: 'earlyDeadlines',
      type: 'early',
      deadlines: override.earlyDeadlines,
      releaseDate: effectiveReleaseDate,
      dueDate: effectiveDue.date,
      dueCredit: effectiveDue.credit ?? 100,
      addError,
    });
  }
  if (fieldActive('lateDeadlines')) {
    validateDeadlineArray({
      prefix,
      fieldName: 'lateDeadlines',
      type: 'late',
      deadlines: override.lateDeadlines,
      releaseDate: effectiveReleaseDate,
      dueDate: effectiveDue.date,
      dueCredit: effectiveDue.credit ?? 100,
      addError,
    });
  }
  if (fieldActive('afterLastDeadline')) {
    addError(
      `${prefix}.afterLastDeadline.credit`,
      validateAfterLastDeadlineCredit({
        value: override.afterLastDeadline,
        due: effectiveDue,
        lateDeadlines: effectiveLateDeadlines,
      }),
    );
  }
  if (fieldActive('durationMinutes')) {
    addError(`${prefix}.durationMinutes`, validateDuration(override.durationMinutes));
  }
  if (fieldActive('password')) {
    addError(`${prefix}.password`, validatePassword(override.password));
  }
  if (fieldActive('questionVisibility')) {
    validateQuestionVisibility(override.questionVisibility, prefix, addError);
  }
  if (fieldActive('scoreVisibility')) {
    validateScoreVisibility(override.scoreVisibility, prefix, addError);
  }
}

export function getAccessControlFormValidationErrors(
  formData: AccessControlFormData,
  displayTimezone: string,
): AccessControlFormValidationError[] {
  const errors: AccessControlFormValidationError[] = [];
  const seenPaths = new Set<AccessControlFormValidationPath>();
  const addError = (path: AccessControlFormValidationPath, message: string | undefined) =>
    addValidationError(errors, seenPaths, path, message);

  validateRuleCounts(formData, addError);
  validateDefaultRule(formData, addError);
  formData.overrides.forEach((_override, index) => validateOverrideRule(formData, index, addError));

  for (const error of getGlobalDateValidationErrors(formData, displayTimezone)) {
    addError(error.path, error.message);
  }

  return errors;
}

function validationErrorsToFieldErrors(
  validationErrors: AccessControlFormValidationError[],
): FieldErrors<AccessControlFormData> {
  const errors: FieldErrors<AccessControlFormData> = {};
  for (const error of validationErrors) {
    set(errors, error.path, { type: 'validate', message: error.message });
  }
  return errors;
}

export const accessControlFormResolver: Resolver<
  AccessControlFormData,
  AccessControlFormResolverContext
> = (values, context): ResolverResult<AccessControlFormData> => {
  const validationErrors = getAccessControlFormValidationErrors(
    values,
    context?.displayTimezone ?? 'UTC',
  );

  if (validationErrors.length === 0) {
    return { values, errors: {} };
  }

  return { values: {}, errors: validationErrorsToFieldErrors(validationErrors) };
};
