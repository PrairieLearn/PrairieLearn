import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { NuqsAdapter } from '@prairielearn/ui';

import type {
  StaffAssessment,
  StaffAssessmentSet,
  StaffCourseInstance,
} from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import { createAssessmentTrpcClient } from '../../trpc/assessment/client.js';
import { TRPCProvider } from '../../trpc/assessment/context.js';

import { AssessmentInstancesTable } from './components/AssessmentInstancesTable.js';
import type { AssessmentInstanceRow } from './instructorAssessmentInstances.types.js';

export function InstructorAssessmentInstances({
  initialRows,
  assessment,
  assessmentSet,
  courseInstance,
  canEdit,
  trpcCsrfToken,
  search,
  isDevMode,
}: {
  initialRows: AssessmentInstanceRow[];
  assessment: StaffAssessment;
  assessmentSet: StaffAssessmentSet;
  courseInstance: StaffCourseInstance;
  canEdit: boolean;
  trpcCsrfToken: string;
  search: string;
  isDevMode: boolean;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentTrpcClient({
      csrfToken: trpcCsrfToken,
      courseInstanceId: courseInstance.id,
      assessmentId: assessment.id,
    }),
  );

  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <AssessmentInstancesTable
            initialRows={initialRows}
            assessment={assessment}
            assessmentSet={assessmentSet}
            courseInstance={courseInstance}
            canEdit={canEdit}
          />
        </TRPCProvider>
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

InstructorAssessmentInstances.displayName = 'InstructorAssessmentInstances';
