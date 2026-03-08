import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-bootstrap';

import type { PageContext } from '../../../lib/client/page-context.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { getAssessmentAccessUrl } from '../../../lib/client/url.js';
import { createAccessControlTrpcClient } from '../utils/trpc-client.js';
import { TRPCProvider, useTRPCClient } from '../utils/trpc-context.js';

import { AccessControlForm } from './AccessControlForm.js';
import type { AccessControlJsonWithId } from './types.js';

interface AccessControlProps {
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  csrfToken: string;
  origHash: string;
  assessmentId: string;
  initialData: AccessControlJsonWithId[];
}

export function AccessControlInner({
  courseInstance,
  origHash: initialOrigHash,
  initialData,
}: AccessControlProps) {
  const [origHash, setOrigHash] = useState(initialOrigHash);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const trpcClient = useTRPCClient();

  const handleFormSubmit = async (data: AccessControlJsonWithId[]) => {
    setShowSuccess(false);
    setSaveError(null);
    setIsSaving(true);

    const jsonRules = data.filter((r) => r.ruleType !== 'enrollment');
    const enrollmentRules = data
      .filter((r) => r.ruleType === 'enrollment')
      .map((r) => ({
        id: r.id,
        enrollmentIds: (r.individuals ?? []).map((i) => i.enrollmentId),
        ruleJson: { ...r, ruleType: undefined, individuals: undefined },
      }));

    try {
      const result = await trpcClient.saveAllRules.mutate({
        rules: jsonRules,
        enrollmentRules,
        origHash,
      });
      setOrigHash(result.newHash);
      setShowSuccess(true);
      void queryClient.invalidateQueries();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save access control');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      {showSuccess && (
        <Alert variant="success" dismissible onClose={() => setShowSuccess(false)}>
          Access control updated successfully.
        </Alert>
      )}
      {saveError && (
        <Alert variant="danger" dismissible onClose={() => setSaveError(null)}>
          {saveError}
        </Alert>
      )}

      <AccessControlForm
        courseInstance={courseInstance}
        initialData={initialData}
        isSaving={isSaving}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}

export function AccessControl(props: AccessControlProps) {
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
        <AccessControlInner {...props} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}
AccessControl.displayName = 'AccessControl';
