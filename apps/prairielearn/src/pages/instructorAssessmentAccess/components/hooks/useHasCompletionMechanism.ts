import { useWatch } from 'react-hook-form';

import { type AccessControlFormData, DATE_CONTROL_FIELD_NAMES } from '../types.js';

/**
 * Returns true when there is a mechanism that can complete the assessment,
 * making "after completion" settings meaningful.
 *
 * For the default rule (`'default'`), this checks the default rule's own
 * dateControl and PrairieTest exams.
 *
 * For overrides (`'override'`), this additionally checks whether any rule
 * (default or override) has dateControl fields, matching the server-side
 * validation which allows afterComplete on overrides when any rule provides
 * a timeline.
 */
export function useHasCompletionMechanism(context: 'default' | 'override' = 'default'): boolean {
  const dateControlEnabled = useWatch<AccessControlFormData, 'defaultRule.dateControlEnabled'>({
    name: 'defaultRule.dateControlEnabled',
  });
  const prairieTestExams = useWatch<AccessControlFormData, 'defaultRule.prairieTestExams'>({
    name: 'defaultRule.prairieTestExams',
  });
  const overrides = useWatch<AccessControlFormData, 'overrides'>({
    name: 'overrides',
  });

  const defaultHas = dateControlEnabled || prairieTestExams.length > 0;
  if (context === 'default') return defaultHas;

  const anyOverrideHasDateControl = overrides.some((o) =>
    DATE_CONTROL_FIELD_NAMES.some((f) => o.overriddenFields.includes(f)),
  );
  return defaultHas || anyOverrideHasDateControl;
}
