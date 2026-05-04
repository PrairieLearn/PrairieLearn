import {
  type AccessControlValidationIssue,
  type AccessControlValidationRule,
  validateGlobalAfterCompleteIssues,
  validateGlobalCreditConsistencyIssues,
  validateGlobalDateConsistencyIssues,
  validateGlobalStructuralDependencyIssues,
  validateRuleDateOrderingIssues,
  validateRuleStructuralDependencyIssues,
} from '../../../lib/assessment-access-control/validation.js';

import { type AccessControlFormData, formDataToJson, isReleasedNow } from './types.js';

export type AccessControlFormFieldPath =
  | 'defaultRule.release.date'
  | 'defaultRule.due.date'
  | 'defaultRule.due.credit'
  | `defaultRule.earlyDeadlines.${number}.date`
  | `defaultRule.lateDeadlines.${number}.date`
  | `defaultRule.lateDeadlines.${number}.credit`
  | 'defaultRule.afterLastDeadline.credit'
  | 'defaultRule.questionVisibility.visibleFromDate'
  | 'defaultRule.questionVisibility.visibleUntilDate'
  | 'defaultRule.scoreVisibility.visibleFromDate'
  | `overrides.${number}.release.date`
  | `overrides.${number}.due.date`
  | `overrides.${number}.due.credit`
  | `overrides.${number}.earlyDeadlines.${number}.date`
  | `overrides.${number}.lateDeadlines.${number}.date`
  | `overrides.${number}.lateDeadlines.${number}.credit`
  | `overrides.${number}.afterLastDeadline.credit`
  | `overrides.${number}.questionVisibility.visibleFromDate`
  | `overrides.${number}.questionVisibility.visibleUntilDate`
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
          return `${prefix}.earlyDeadlines.${issue.path[2]}.date`;
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
    validateGlobalAfterCompleteIssues(validationRules),
  ]) {
    for (const issue of issues) {
      const path = mapIssueToFormFieldPath(issue);
      if (!path || seenPaths.has(path)) continue;
      seenPaths.add(path);
      results.push({ path, message: issue.message });
    }
  }

  for (const validationRule of validationRules) {
    for (const issues of [
      validateRuleStructuralDependencyIssues(validationRule),
      validateRuleDateOrderingIssues(validationRule),
    ]) {
      for (const issue of issues) {
        const path = mapIssueToFormFieldPath(issue);
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
