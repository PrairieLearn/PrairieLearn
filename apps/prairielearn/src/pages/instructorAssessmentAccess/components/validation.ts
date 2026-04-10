import {
  type AccessControlValidationIssue,
  type AccessControlValidationRule,
  validateGlobalDateConsistencyIssues,
  validateRuleCreditMonotonicityIssues,
  validateRuleDateOrderingIssues,
  validateRuleDuplicateDateIssues,
  validateRuleStructuralDependencyIssues,
} from '../../../lib/assessment-access-control/validation.js';

import { type AccessControlFormData, formDataToJson } from './types.js';

export type AccessControlFormFieldPath =
  | 'mainRule.releaseDate'
  | 'mainRule.dueDate'
  | `mainRule.earlyDeadlines.${number}.date`
  | `mainRule.earlyDeadlines.${number}.credit`
  | `mainRule.lateDeadlines.${number}.date`
  | `mainRule.lateDeadlines.${number}.credit`
  | 'mainRule.afterLastDeadline.credit'
  | 'mainRule.questionVisibility.showAgainDate'
  | 'mainRule.questionVisibility.hideAgainDate'
  | 'mainRule.scoreVisibility.showAgainDate'
  | `overrides.${number}.releaseDate`
  | `overrides.${number}.dueDate`
  | `overrides.${number}.earlyDeadlines.${number}.date`
  | `overrides.${number}.earlyDeadlines.${number}.credit`
  | `overrides.${number}.lateDeadlines.${number}.date`
  | `overrides.${number}.lateDeadlines.${number}.credit`
  | `overrides.${number}.afterLastDeadline.credit`
  | `overrides.${number}.questionVisibility.showAgainDate`
  | `overrides.${number}.questionVisibility.hideAgainDate`
  | `overrides.${number}.scoreVisibility.showAgainDate`;

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
  const prefix: 'mainRule' | `overrides.${number}` =
    issue.ruleIndex === 0 ? 'mainRule' : `overrides.${issue.ruleIndex - 1}`;

  switch (issue.path[0]) {
    case 'dateControl':
      switch (issue.path[1]) {
        case 'releaseDate':
          return `${prefix}.releaseDate`;
        case 'dueDate':
          return `${prefix}.dueDate`;
        case 'earlyDeadlines':
          if (issue.path[3] === 'credit') {
            return `${prefix}.earlyDeadlines.${issue.path[2]}.credit`;
          }
          return `${prefix}.earlyDeadlines.${issue.path[2]}.date`;
        case 'lateDeadlines':
          if (issue.path[3] === 'credit') {
            return `${prefix}.lateDeadlines.${issue.path[2]}.credit`;
          }
          return `${prefix}.lateDeadlines.${issue.path[2]}.date`;
        case 'afterLastDeadline':
          return `${prefix}.afterLastDeadline.credit`;
        default:
          return null;
      }
    case 'afterComplete':
      switch (issue.path[1]) {
        case 'showQuestionsAgainDate':
          return `${prefix}.questionVisibility.showAgainDate`;
        case 'hideQuestionsAgainDate':
          return `${prefix}.questionVisibility.hideAgainDate`;
        case 'showScoreAgainDate':
          return `${prefix}.scoreVisibility.showAgainDate`;
        default:
          return null;
      }
    default:
      return null;
  }
}

export function getGlobalDateValidationErrors(formData: AccessControlFormData): {
  path: AccessControlFormFieldPath;
  message: string;
}[] {
  const seenPaths = new Set<AccessControlFormFieldPath>();
  const results: { path: AccessControlFormFieldPath; message: string }[] = [];

  const validationRules = buildValidationRules(formData);

  for (const issue of validateGlobalDateConsistencyIssues(validationRules)) {
    const path = mapIssueToFormFieldPath(issue);
    if (!path || seenPaths.has(path)) continue;
    seenPaths.add(path);
    results.push({ path, message: issue.message });
  }

  for (const validationRule of validationRules) {
    const dateOrderingIssues = validateRuleDateOrderingIssues(validationRule);

    for (const issues of [
      validateRuleStructuralDependencyIssues(validationRule),
      dateOrderingIssues,
      validateRuleDuplicateDateIssues(validationRule),
    ]) {
      for (const issue of issues) {
        const path = mapIssueToFormFieldPath(issue);
        if (!path || seenPaths.has(path)) continue;
        seenPaths.add(path);
        results.push({ path, message: issue.message });
      }
    }

    // Credit monotonicity assumes deadlines are chronological; skip if dates
    // are out of order to avoid misleading errors.
    if (dateOrderingIssues.length === 0) {
      for (const issue of validateRuleCreditMonotonicityIssues(validationRule)) {
        const path = mapIssueToFormFieldPath(issue);
        if (!path || seenPaths.has(path)) continue;
        seenPaths.add(path);
        results.push({ path, message: issue.message });
      }
    }
  }

  return results;
}
