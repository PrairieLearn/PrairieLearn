import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { QueryClientProviderDebug } from '@prairielearn/trpc/react';

import { getAssessmentStudentsUrl } from '../../../lib/client/url.js';
import { createAssessmentTrpcClient } from '../../../trpc/assessment/client.js';
import { TRPCProvider } from '../../../trpc/assessment/context.js';
import { InstanceSelectionToolbar } from '../../instructorAssessmentInstances/components/InstanceSelectionToolbar.js';
import type { AssessmentInstanceActionRow } from '../../instructorAssessmentInstances/instructorAssessmentInstances.types.js';

export function InstructorAssessmentInstanceActions({
  instance,
  courseInstanceId,
  assessmentId,
  trpcCsrfToken,
  timezone,
  groupWork,
}: {
  instance: AssessmentInstanceActionRow;
  courseInstanceId: string;
  assessmentId: string;
  trpcCsrfToken: string;
  timezone: string;
  groupWork: boolean;
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
        <InstanceSelectionToolbar
          selectedRows={[instance]}
          courseInstanceId={courseInstanceId}
          assessmentId={assessmentId}
          timezone={timezone}
          groupWork={groupWork}
          isDevMode={false}
          showUploadDropdown={false}
          showLogsLink={false}
          singleInstanceMode
          onActionSuccess={(_message, action) => {
            if (action === 'delete') {
              window.location.assign(getAssessmentStudentsUrl({ courseInstanceId, assessmentId }));
            } else {
              window.location.reload();
            }
          }}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

InstructorAssessmentInstanceActions.displayName = 'InstructorAssessmentInstanceActions';
