import { QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-bootstrap';

import type { PageContext } from '../../../lib/client/page-context.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { getAssessmentAccessUrl } from '../../../lib/client/url.js';
import { createAccessControlTrpcClient } from '../utils/trpc-client.js';
import { TRPCProvider, useTRPC } from '../utils/trpc-context.js';

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
    trpc.saveAllRules.mutationOptions({
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

  return (
    <div style={{ height: '100%' }} data-split-pane-page>
      {saveMutation.isSuccess && (
        <Alert variant="success" dismissible onClose={() => saveMutation.reset()}>
          Access control updated successfully.
        </Alert>
      )}
      {saveMutation.isError && (
        <Alert variant="danger" dismissible onClose={() => saveMutation.reset()}>
          {saveMutation.error instanceof Error
            ? saveMutation.error.message
            : 'Failed to save access control'}
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
  const [trpcClient] = useState(() => {
    const accessUrl = getAssessmentAccessUrl({
      courseInstanceId: props.courseInstance.id,
      assessmentId: props.assessmentId,
    });
    return createAccessControlTrpcClient(props.csrfToken, `${accessUrl}/trpc`);
  });
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <AssessmentAccessControlInner {...props} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}
AssessmentAccessControl.displayName = 'AssessmentAccessControl';
