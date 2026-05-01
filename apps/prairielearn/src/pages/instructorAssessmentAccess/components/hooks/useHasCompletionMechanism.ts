import { useWatch } from 'react-hook-form';

import { type AccessControlFormData, DATE_CONTROL_FIELD_NAMES } from '../types.js';

/**
 * Returns true when the default rule has a mechanism that can complete the
 * assessment (date control enabled or PrairieTest exams configured), making
 * "after completion" settings meaningful on the default rule. Mirrors
 * defaultRuleHasCompletionMechanism in types.ts.
 */
export function useDefaultRuleHasCompletionMechanism(): boolean {
  const dateControlEnabled = useWatch<AccessControlFormData, 'defaultRule.dateControlEnabled'>({
    name: 'defaultRule.dateControlEnabled',
  });
  const prairieTestExams = useWatch<AccessControlFormData, 'defaultRule.prairieTestExams'>({
    name: 'defaultRule.prairieTestExams',
  });
  return dateControlEnabled || prairieTestExams.length > 0;
}

/**
 * Returns true when the override at `index` has a completion mechanism for
 * its students: dateControl on the override itself, or a completion mechanism
 * on the defaults (dateControl inherited, or PrairieTest exams). Mirrors
 * overrideHasCompletionMechanism in types.ts and the server-side
 * validateGlobalAfterCompleteOverrideIssues.
 */
export function useOverrideHasCompletionMechanism(index: number): boolean {
  const defaultHas = useDefaultRuleHasCompletionMechanism();
  const overriddenFields = useWatch<AccessControlFormData, `overrides.${number}.overriddenFields`>({
    name: `overrides.${index}.overriddenFields`,
  });
  if (DATE_CONTROL_FIELD_NAMES.some((f) => overriddenFields.includes(f))) return true;
  return defaultHas;
}
