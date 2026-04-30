import { useWatch } from 'react-hook-form';

import type { AccessControlFormData } from '../types.js';

/**
 * Returns true when the main rule has date control enabled or PrairieTest
 * exams configured — i.e. there is a mechanism that can complete the
 * assessment, making "after completion" settings meaningful.
 */
export function useHasCompletionMechanism(): boolean {
  const dateControlEnabled = useWatch<AccessControlFormData, 'mainRule.dateControlEnabled'>({
    name: 'mainRule.dateControlEnabled',
  });
  const prairieTestExams = useWatch<AccessControlFormData, 'mainRule.prairieTestExams'>({
    name: 'mainRule.prairieTestExams',
  });
  return dateControlEnabled || prairieTestExams.length > 0;
}
