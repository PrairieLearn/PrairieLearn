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
  type AccessControlFormData,
  formDataToJson,
  isOverrideFieldActive,
  isReleasedNow,
} from './types.js';

export type AccessControlFormFieldPath =
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
  | `overrides.${number}.scoreVisibility.visibleFromDate`
  | `overrides.${number}.appliesTo`;

function buildValidationRules(formData: AccessControlFormData): AccessControlValidationRule[] {
  return formDataToJson(formData).map((rule, index) => ({
    rule,
    targetType: index === 0 ? 'none' : (rule.ruleType ?? 'student_label'),
    ruleIndex: index,
  }));
}

function mapIssueToFormFieldPath(
  issue: AccessControlValidationIssue,
  formData?: AccessControlFormData,
): AccessControlFormFieldPath | null {
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
          if (
            formData &&
            issue.ruleIndex > 0 &&
            !isOverrideFieldActive(formData, issue.ruleIndex - 1, 'questionVisibility') &&
            isOverrideFieldActive(formData, issue.ruleIndex - 1, 'scoreVisibility')
          ) {
            return `${prefix}.scoreVisibility`;
          }
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
    if (override.overriddenFields.includes('release')) {
      checkRule(override.release, `overrides.${index}.release.date`);
    }
  });

  return results;
}

function getOverrideTargetValidationErrors(
  formData: AccessControlFormData,
): { path: AccessControlFormFieldPath; message: string }[] {
  const results: { path: AccessControlFormFieldPath; message: string }[] = [];

  formData.overrides.forEach((override, index) => {
    const { targetType, enrollments, studentLabels } = override.appliesTo;
    if (targetType === 'enrollment' && enrollments.length === 0) {
      results.push({
        path: `overrides.${index}.appliesTo`,
        message: 'Select at least one student for this override.',
      });
    } else if (targetType === 'student_label' && studentLabels.length === 0) {
      results.push({
        path: `overrides.${index}.appliesTo`,
        message: 'Select at least one student label for this override.',
      });
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
      const path = mapIssueToFormFieldPath(issue, formData);
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
        const path = mapIssueToFormFieldPath(issue, formData);
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

export function getAccessControlFormValidationErrors(
  formData: AccessControlFormData,
  displayTimezone: string,
): {
  path: AccessControlFormFieldPath;
  message: string;
}[] {
  return [
    ...getOverrideTargetValidationErrors(formData),
    ...getGlobalDateValidationErrors(formData, displayTimezone),
  ];
}
