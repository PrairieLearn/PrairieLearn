import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { QueryClientProviderDebug } from '@prairielearn/trpc/react';

import { AssessmentInstanceActions } from '../../components/AssessmentInstanceActions/AssessmentInstanceActions.js';
import { createAssessmentTrpcClient } from '../../trpc/assessment/client.js';
import { TRPCProvider } from '../../trpc/assessment/context.js';
import type { AssessmentInstanceRow } from '../instructorAssessmentInstances/instructorAssessmentInstances.types.js';

export function InstructorAssessmentInstanceActions({
  instance,
  courseInstanceId,
  assessmentId,
  timezone,
  trpcCsrfToken,
  instancesUrl,
}: {
  instance: AssessmentInstanceRow;
  courseInstanceId: string;
  assessmentId: string;
  timezone: string;
  trpcCsrfToken: string;
  instancesUrl: string;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentTrpcClient({
      csrfToken: trpcCsrfToken,
      courseInstanceId,
      assessmentId,
    }),
  );

  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {/* The detail page already displays the instance log below the action menu. */}
        <AssessmentInstanceActions
          target={{ type: 'single', instance }}
          courseInstanceId={courseInstanceId}
          timezone={timezone}
          onDeleteSuccess={() => window.location.assign(instancesUrl)}
          onTimeLimitSuccess={() => window.location.reload()}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

InstructorAssessmentInstanceActions.displayName = 'InstructorAssessmentInstanceActions';
