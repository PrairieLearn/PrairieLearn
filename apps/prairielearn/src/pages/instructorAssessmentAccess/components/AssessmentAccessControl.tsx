import { QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-bootstrap';

import { getAppError } from '../../../lib/client/errors.js';
import type { PageContext } from '../../../lib/client/page-context.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { AccessControlError } from '../../../trpc/assessment/access-control.js';
import { createAssessmentTrpcClient } from '../../../trpc/assessment/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/assessment/context.js';

import { AccessControlForm } from './AccessControlForm.js';
import type { AccessControlJsonWithId } from './types.js';

interface AssessmentAccessControlProps {
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  csrfToken: string;
  origHash: string;
  assessmentId: string;
  initialData: AccessControlJsonWithId[];
}

function AssessmentAccessControlInner({
  courseInstance,
  origHash: initialOrigHash,
  initialData,
}: AssessmentAccessControlProps) {
  const [origHash, setOrigHash] = useState(initialOrigHash);
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const saveMutation = useMutation(
    trpc.accessControl.saveAllRules.mutationOptions({
      onSuccess: (result) => {
        setOrigHash(result.newHash);
        void queryClient.invalidateQueries();
      },
    }),
  );

  const handleFormSubmit = (data: AccessControlJsonWithId[]) => {
    const jsonRules = data.filter((r) => r.ruleType !== 'enrollment');
    const enrollmentRules = data
      .filter((r) => r.ruleType === 'enrollment')
      .map(({ ruleType: _, individuals, ...ruleJson }) => ({
        id: ruleJson.id,
        enrollmentIds: (individuals ?? []).map((i) => i.enrollmentId),
        ruleJson,
      }));

    saveMutation.mutate({
      rules: jsonRules,
      enrollmentRules,
      origHash,
    });
  };

  const saveError = getAppError<AccessControlError>(saveMutation.error);

  return (
    <div style={{ height: '100%' }} data-split-pane-page>
      {saveMutation.isSuccess && (
        <Alert variant="success" dismissible onClose={() => saveMutation.reset()}>
          Access control updated successfully.
        </Alert>
      )}
      {saveError && (
        <Alert variant="danger" dismissible onClose={() => saveMutation.reset()}>
          {saveError.message}
        </Alert>
      )}

      <AccessControlForm
        courseInstance={courseInstance}
        initialData={initialData}
        isSaving={saveMutation.isPending}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}

export function AssessmentAccessControl(props: AssessmentAccessControlProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentTrpcClient({
      csrfToken: props.csrfToken,
      courseInstanceId: props.courseInstance.id,
      assessmentId: props.assessmentId,
    }),
  );
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <AssessmentAccessControlInner {...props} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}
AssessmentAccessControl.displayName = 'AssessmentAccessControl';
