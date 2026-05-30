import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-bootstrap';

import { NuqsAdapter } from '@prairielearn/ui';

import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import { createAssessmentTrpcClient } from '../../trpc/assessment/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/assessment/context.js';

import { AssessmentInstancesTable } from './components/AssessmentInstancesTable.js';
import type { AssessmentInstanceRow } from './instructorAssessmentInstances.types.js';

interface InstructorAssessmentInstancesProps {
  initialRows: AssessmentInstanceRow[];
  courseInstanceId: string;
  assessmentId: string;
  urlPrefix: string;
  assessmentSetAbbr: string;
  assessmentNumber: string;
  groupWork: boolean;
  multipleInstance: boolean;
  timezone: string;
  canEdit: boolean;
  trpcCsrfToken: string;
  search: string;
  isDevMode: boolean;
}

type InnerProps = Omit<
  InstructorAssessmentInstancesProps,
  'trpcCsrfToken' | 'search' | 'isDevMode' | 'courseInstanceId' | 'assessmentId'
>;

function InstructorAssessmentInstancesInner({
  initialRows,
  urlPrefix,
  assessmentSetAbbr,
  assessmentNumber,
  groupWork,
  multipleInstance,
  timezone,
  canEdit,
}: InnerProps) {
  const trpc = useTRPC();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  return (
    <>
      {successMessage && (
        <Alert
          variant="success"
          className="mb-3"
          dismissible
          onClose={() => setSuccessMessage(null)}
        >
          {successMessage}
        </Alert>
      )}
      <AssessmentInstancesTable
        initialRows={initialRows}
        listQueryOptions={trpc.assessmentInstances.list.queryOptions()}
        urlPrefix={urlPrefix}
        assessmentSetAbbr={assessmentSetAbbr}
        assessmentNumber={assessmentNumber}
        groupWork={groupWork}
        multipleInstance={multipleInstance}
        timezone={timezone}
        canEdit={canEdit}
        onActionSuccess={setSuccessMessage}
      />
    </>
  );
}

export function InstructorAssessmentInstances({
  trpcCsrfToken,
  search,
  isDevMode,
  courseInstanceId,
  assessmentId,
  ...innerProps
}: InstructorAssessmentInstancesProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentTrpcClient({ csrfToken: trpcCsrfToken, courseInstanceId, assessmentId }),
  );

  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <InstructorAssessmentInstancesInner {...innerProps} />
        </TRPCProvider>
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

InstructorAssessmentInstances.displayName = 'InstructorAssessmentInstances';
