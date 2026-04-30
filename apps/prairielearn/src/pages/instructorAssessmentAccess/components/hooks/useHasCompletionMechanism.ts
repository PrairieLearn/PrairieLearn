import { useWatch } from 'react-hook-form';

import { type AccessControlFormData, DATE_CONTROL_FIELD_NAMES } from '../types.js';

/**
 * Returns true when there is a mechanism that can complete the assessment,
 * making "after completion" settings meaningful.
 *
 * For the main rule (`'main'`), this checks the main rule's own dateControl
 * and PrairieTest exams.
 *
 * For overrides (`'override'`), this additionally checks whether any rule
 * (main or override) has dateControl fields, matching the server-side
 * validation which allows afterComplete on overrides when any rule provides
 * a timeline.
 */
export function useHasCompletionMechanism(context: 'main' | 'override' = 'main'): boolean {
  const dateControlEnabled = useWatch<AccessControlFormData, 'mainRule.dateControlEnabled'>({
    name: 'mainRule.dateControlEnabled',
  });
  const prairieTestExams = useWatch<AccessControlFormData, 'mainRule.prairieTestExams'>({
    name: 'mainRule.prairieTestExams',
  });
  const overrides = useWatch<AccessControlFormData, 'overrides'>({
    name: 'overrides',
  });

  const mainHas = dateControlEnabled || prairieTestExams.length > 0;
  if (context === 'main') return mainHas;

  const anyOverrideHasDateControl = overrides.some((o) =>
    DATE_CONTROL_FIELD_NAMES.some((f) => o.overriddenFields.includes(f)),
  );
  return mainHas || anyOverrideHasDateControl;
}
