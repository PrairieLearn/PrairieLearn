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
import { UUID_REGEXP } from '../../../lib/string-util.js';
import {
  MAX_ACCESS_CONTROL_DURATION_MINUTES,
  MAX_ACCESS_CONTROL_EARLY_OR_LATE_DEADLINES_PER_RULE,
  MAX_ACCESS_CONTROL_PASSWORD_LENGTH,
  MAX_ACCESS_CONTROL_PRAIRIETEST_EXAMS,
} from '../../../schemas/accessControl.js';

import { isFormFieldPathEditable, isOverrideFieldActive } from './overrideFields.js';
import {
  type AccessControlFormData,
  type AfterLastDeadlineValue,
  type DeadlineEntry,
  type OverridableFieldName,
  type QuestionVisibilityValue,
  type ScoreVisibilityValue,
  defaultRuleHasCompletionMechanism,
  formDataToJson,
  isReleasedNow,
} from './types.js';

export const DATE_REQUIRED_MESSAGE = 'Date is required';

export type AccessControlFormFieldPath = FieldPath<AccessControlFormData>;

interface AccessControlFormValidationError {
  path: AccessControlFormFieldPath;
  message: string;
}

type RulePrefix = 'defaultRule' | `overrides.${number}`;

type RuleValidationFieldPath =
  | 'release.date'
  | 'due.date'
  | 'due.credit'
  | `earlyDeadlines.${number}.date`
  | `earlyDeadlines.${number}.credit`
  | `lateDeadlines.${number}.date`
  | `lateDeadlines.${number}.credit`
  | 'afterLastDeadline.credit'
  | 'durationMinutes'
  | 'password'
  | 'questionVisibility'
  | 'questionVisibility.visibleFromDate'
  | 'questionVisibility.visibleUntilDate'
  | 'scoreVisibility'
  | 'scoreVisibility.visibleFromDate';

type DateControlValidationPath =
  | `defaultRule.${RuleValidationFieldPath}`
  | `overrides.${number}.${RuleValidationFieldPath}`;

type RuleFormFields = Pick<AccessControlFormData['defaultRule'], OverridableFieldName>;

type AddValidationError = (path: AccessControlFormFieldPath, message: string | undefined) => void;

export interface AccessControlFormResolverContext {
  displayTimezone: string;
}

export function isDateFieldEmpty(value: string | undefined): boolean {
  return value !== undefined && !value;
}

function rulePath(prefix: RulePrefix, suffix: RuleValidationFieldPath): DateControlValidationPath {
  return `${prefix}.${suffix}`;
}

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
  const prefix: RulePrefix =
    issue.ruleIndex === 0 ? 'defaultRule' : `overrides.${issue.ruleIndex - 1}`;

  switch (issue.path[0]) {
    case 'dateControl':
      switch (issue.path[1]) {
        case 'release':
          return rulePath(prefix, 'release.date');
        case 'due':
          return rulePath(prefix, issue.path[2] === 'credit' ? 'due.credit' : 'due.date');
        case 'earlyDeadlines':
          return issue.path[3] === 'credit'
            ? rulePath(prefix, `earlyDeadlines.${issue.path[2]}.credit`)
            : rulePath(prefix, `earlyDeadlines.${issue.path[2]}.date`);
        case 'lateDeadlines':
          return issue.path[3] === 'credit'
            ? rulePath(prefix, `lateDeadlines.${issue.path[2]}.credit`)
            : rulePath(prefix, `lateDeadlines.${issue.path[2]}.date`);
        case 'afterLastDeadline':
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          return issue.path[2] === 'credit' ? rulePath(prefix, 'afterLastDeadline.credit') : null;
        default:
          return null;
      }
    case 'afterComplete':
      if (issue.path[1] === 'questions') {
        if (issue.path.length === 2) {
          return rulePath(prefix, 'questionVisibility');
        }
        switch (issue.path[2]) {
          case 'visibleFromDate':
            return rulePath(prefix, 'questionVisibility.visibleFromDate');
          case 'visibleUntilDate':
            return rulePath(prefix, 'questionVisibility.visibleUntilDate');
          default:
            return null;
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (issue.path[1] === 'score') {
        if (issue.path.length === 2) return rulePath(prefix, 'scoreVisibility');
        switch (issue.path[2]) {
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          case 'visibleFromDate':
            return rulePath(prefix, 'scoreVisibility.visibleFromDate');
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
  seenPaths: Set<AccessControlFormFieldPath>,
  path: AccessControlFormFieldPath,
  message: string | undefined,
) {
  if (!message || seenPaths.has(path)) return;
  seenPaths.add(path);
  errors.push({ path, message });
}

function validateReleaseDate(value: string | null): string | undefined {
  if (!value) return 'Release date is required';
  return undefined;
}

function validateDueDate(date: string | null): string | undefined {
  if (date === null) return undefined;
  if (!date) return DATE_REQUIRED_MESSAGE;
  return undefined;
}

function validateIntegerCredit(
  credit: number,
  { max, rangeMessage }: { max: number; rangeMessage: string },
): string | undefined {
  if (Number.isNaN(credit)) return 'Credit is required';
  if (!Number.isFinite(credit)) return 'Credit must be a finite number';
  if (!Number.isInteger(credit)) return 'Credit must be an integer';
  if (credit < 0 || credit > max) return rangeMessage;
  return undefined;
}

function validateDueCredit(value: number | null, customCredit: boolean): string | undefined {
  if (value === null) {
    if (customCredit) return 'Credit is required';
    return undefined;
  }
  return validateIntegerCredit(value, {
    max: 200,
    rangeMessage: 'Credit must be between 0% and 200%',
  });
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
  prefix: RulePrefix,
  addError: AddValidationError,
) {
  if (!value.hidden) return;
  addError(
    rulePath(prefix, 'questionVisibility.visibleFromDate'),
    isDateFieldEmpty(value.visibleFromDate) ? DATE_REQUIRED_MESSAGE : undefined,
  );
  addError(
    rulePath(prefix, 'questionVisibility.visibleUntilDate'),
    isDateFieldEmpty(value.visibleUntilDate) ? DATE_REQUIRED_MESSAGE : undefined,
  );
}

function validateScoreVisibility(
  value: ScoreVisibilityValue,
  prefix: RulePrefix,
  addError: AddValidationError,
) {
  if (!value.hidden) return;
  addError(
    rulePath(prefix, 'scoreVisibility.visibleFromDate'),
    isDateFieldEmpty(value.visibleFromDate) ? DATE_REQUIRED_MESSAGE : undefined,
  );
}

function validateDeadlineDate({
  value,
  index,
  deadlines,
}: {
  value: string;
  index: number;
  deadlines: DeadlineEntry[];
}): string | undefined {
  if (!value) return DATE_REQUIRED_MESSAGE;

  for (let i = 0; i < deadlines.length; i++) {
    if (i !== index && deadlines[i]?.date === value) return 'Duplicate deadline date';
  }
  return undefined;
}

function validateDeadlineCredit({
  type,
  value,
}: {
  type: 'early' | 'late';
  value: number;
}): string | undefined {
  return validateIntegerCredit(value, {
    max: type === 'early' ? 200 : 99,
    rangeMessage:
      type === 'early' ? 'Credit must be 0-200%' : 'Credit after the due date must be 0-99%',
  });
}

function validateDeadlineArray({
  prefix,
  fieldName,
  type,
  deadlines,
  addError,
}: {
  prefix: RulePrefix;
  fieldName: 'earlyDeadlines' | 'lateDeadlines';
  type: 'early' | 'late';
  deadlines: DeadlineEntry[];
  addError: AddValidationError;
}) {
  if (deadlines.length > MAX_ACCESS_CONTROL_EARLY_OR_LATE_DEADLINES_PER_RULE) {
    addError(
      rulePath(prefix, `${fieldName}.${MAX_ACCESS_CONTROL_EARLY_OR_LATE_DEADLINES_PER_RULE}.date`),
      `A rule can have at most ${MAX_ACCESS_CONTROL_EARLY_OR_LATE_DEADLINES_PER_RULE} ${type} deadlines.`,
    );
  }

  deadlines.forEach((deadline, index) => {
    addError(
      rulePath(prefix, `${fieldName}.${index}.date`),
      validateDeadlineDate({ value: deadline.date, index, deadlines }),
    );
    addError(
      rulePath(prefix, `${fieldName}.${index}.credit`),
      validateDeadlineCredit({ type, value: deadline.credit }),
    );
  });
}

function validateAfterLastDeadlineCredit(value: AfterLastDeadlineValue): string | undefined {
  if (!value.allowSubmissions) return undefined;
  return validateIntegerCredit(value.credit, {
    max: 99,
    rangeMessage: 'Credit after the due date must be 0-99%',
  });
}

function validatePrairieTestExams(
  exams: AccessControlFormData['defaultRule']['prairieTestExams'],
  addError: AddValidationError,
) {
  if (exams.length > MAX_ACCESS_CONTROL_PRAIRIETEST_EXAMS) {
    addError(
      `defaultRule.prairieTestExams.${MAX_ACCESS_CONTROL_PRAIRIETEST_EXAMS}.examUuid`,
      `A rule can have at most ${MAX_ACCESS_CONTROL_PRAIRIETEST_EXAMS} PrairieTest exams.`,
    );
  }

  const examUuidCounts = new Map<string, number>();
  for (const exam of exams) {
    if (UUID_REGEXP.test(exam.examUuid)) {
      const normalizedUuid = exam.examUuid.toLowerCase();
      examUuidCounts.set(normalizedUuid, (examUuidCounts.get(normalizedUuid) ?? 0) + 1);
    }
  }

  exams.forEach((exam, index) => {
    const path: AccessControlFormFieldPath = `defaultRule.prairieTestExams.${index}.examUuid`;
    if (!exam.examUuid) {
      addError(path, 'Exam UUID is required');
    } else if (!UUID_REGEXP.test(exam.examUuid)) {
      addError(path, 'Invalid UUID format');
    } else if ((examUuidCounts.get(exam.examUuid.toLowerCase()) ?? 0) > 1) {
      addError(path, 'Duplicate exam UUID');
    }
  });
}

function validateRuleFields(
  rule: RuleFormFields,
  prefix: RulePrefix,
  fieldActive: (fieldName: OverridableFieldName) => boolean,
  addError: AddValidationError,
) {
  if (fieldActive('release')) {
    addError(rulePath(prefix, 'release.date'), validateReleaseDate(rule.release.date));
  }
  if (fieldActive('due')) {
    addError(rulePath(prefix, 'due.date'), validateDueDate(rule.due.date));
    addError(
      rulePath(prefix, 'due.credit'),
      validateDueCredit(rule.due.credit, rule.due.customCredit),
    );
  }
  if (fieldActive('earlyDeadlines')) {
    validateDeadlineArray({
      prefix,
      fieldName: 'earlyDeadlines',
      type: 'early',
      deadlines: rule.earlyDeadlines,
      addError,
    });
  }
  if (fieldActive('lateDeadlines')) {
    validateDeadlineArray({
      prefix,
      fieldName: 'lateDeadlines',
      type: 'late',
      deadlines: rule.lateDeadlines,
      addError,
    });
  }
  if (fieldActive('afterLastDeadline')) {
    addError(
      rulePath(prefix, 'afterLastDeadline.credit'),
      validateAfterLastDeadlineCredit(rule.afterLastDeadline),
    );
  }
  if (fieldActive('durationMinutes')) {
    addError(rulePath(prefix, 'durationMinutes'), validateDuration(rule.durationMinutes));
  }
  if (fieldActive('password')) {
    addError(rulePath(prefix, 'password'), validatePassword(rule.password));
  }
  if (fieldActive('questionVisibility')) {
    validateQuestionVisibility(rule.questionVisibility, prefix, addError);
  }
  if (fieldActive('scoreVisibility')) {
    validateScoreVisibility(rule.scoreVisibility, prefix, addError);
  }
}

function validateDefaultRule(formData: AccessControlFormData, addError: AddValidationError) {
  const rule = formData.defaultRule;
  const hasCompletionMechanism = defaultRuleHasCompletionMechanism(rule);

  validateRuleFields(
    rule,
    'defaultRule',
    (fieldName) =>
      fieldName === 'questionVisibility' || fieldName === 'scoreVisibility'
        ? hasCompletionMechanism
        : rule.dateControlEnabled,
    addError,
  );
  validatePrairieTestExams(rule.prairieTestExams, addError);
}

function validateOverrideRule(
  formData: AccessControlFormData,
  index: number,
  addError: AddValidationError,
) {
  const override = formData.overrides[index];
  const prefix = `overrides.${index}` as const;

  validateRuleFields(
    override,
    prefix,
    (fieldName) => isOverrideFieldActive(formData, index, fieldName),
    addError,
  );
}

/**
 * Validates a complete access control form data structure.
 *
 * There are certain things which we choose not to validate here. Namely, we don't validate
 * overall rule count, nor do we validate that an override doesn't have too many targets.
 * The UI makes it impossible to exceed those limits, so we don't gain anything by
 * trying to compute and surface such validation errors. If the UI does for some reason
 * permit such invalid data, the server will catch it and surface it to the user. While
 * it won't be pretty, it's good enough, and at any rate would indicate a bug in the UI
 * that should be fixed, rather than a user error that we need to handle gracefully.
 */
export function getAccessControlFormValidationErrors(
  formData: AccessControlFormData,
  displayTimezone: string,
): AccessControlFormValidationError[] {
  const errors: AccessControlFormValidationError[] = [];
  const seenPaths = new Set<AccessControlFormFieldPath>();
  const addError = (path: AccessControlFormFieldPath, message: string | undefined) =>
    addValidationError(errors, seenPaths, path, message);

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
