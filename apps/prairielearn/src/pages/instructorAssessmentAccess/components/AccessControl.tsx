import { QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-bootstrap';

import { ServerJobsProgressInfo } from '../../../components/ServerJobProgress/ServerJobProgressBars.js';
import { useServerJobProgress } from '../../../components/ServerJobProgress/useServerJobProgress.js';
import type { PageContext } from '../../../lib/client/page-context.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { getCourseInstanceJobSequenceUrl } from '../../../lib/client/url.js';

import { AccessControlForm } from './AccessControlForm.js';
import type { AccessControlJsonWithId } from './types.js';

interface AccessControlProps {
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  csrfToken: string;
  origHash: string;
  urlPrefix: string;
  assessmentId: string;
  initialData: AccessControlJsonWithId[];
}

export function AccessControlInner({
  courseInstance,
  csrfToken,
  origHash: initialOrigHash,
  urlPrefix,
  assessmentId,
  initialData,
}: AccessControlProps) {
  const [origHash, setOrigHash] = useState(initialOrigHash);
  const [showSuccess, setShowSuccess] = useState(false);
  const [jobSequenceId, setJobSequenceId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Progress tracking for save operations
  const onProgressChange = useCallback(() => {
    void queryClient.invalidateQueries();
  }, [queryClient]);

  const { jobsProgress, handleAddOngoingJobSequence, handleDismissCompleteJobSequence } =
    useServerJobProgress({
      enabled: true,
      initialOngoingJobSequenceTokens: null,
      onProgressChange,
    });

  // Convert jobsProgress object to array for display
  const jobProgressArray = useMemo(() => Object.values(jobsProgress), [jobsProgress]);

  const saveMutation = useMutation({
    mutationKey: ['save-access-control'],
    mutationFn: async (accessControl: AccessControlJsonWithId[]) => {
      setJobSequenceId(null);

      const body = new URLSearchParams({
        __action: 'update_access_control',
        __csrf_token: csrfToken,
        access_control: JSON.stringify(accessControl),
        orig_hash: origHash,
      });

      const res = await fetch(window.location.href, {
        method: 'POST',
        body,
      });

      const result = await res.json();
      if (!res.ok) {
        if (result.job_sequence_id) {
          setJobSequenceId(result.job_sequence_id);
        }

        throw new Error(result.error || 'Failed to save access control');
      }

      // Check if this is a pending (background) job
      if (result.pending && result.job_sequence_id && result.job_sequence_token) {
        // Add to progress tracking
        handleAddOngoingJobSequence(result.job_sequence_id, result.job_sequence_token);
        return { pending: true };
      }

      return { pending: false, newHash: result.newHash };
    },
    onSuccess: (result) => {
      // Only show success immediately if not pending (i.e., synchronous completion)
      if (!result.pending && result.newHash) {
        setOrigHash(result.newHash);
        setShowSuccess(true);
      }
      // For pending jobs, success will be shown via progress tracking
    },
  });

  const handleFormSubmit = (data: AccessControlJsonWithId[]) => {
    setShowSuccess(false);
    saveMutation.mutate(data);
  };

  return (
    <div>
      {showSuccess && (
        <Alert variant="success" dismissible onClose={() => setShowSuccess(false)}>
          Access control updated successfully.
        </Alert>
      )}
      {saveMutation.isError && (
        <Alert
          variant="danger"
          dismissible
          onClose={() => {
            saveMutation.reset();
            setJobSequenceId(null);
          }}
        >
          {saveMutation.error.message}
          {jobSequenceId && (
            <>
              {' '}
              <Alert.Link href={getCourseInstanceJobSequenceUrl(courseInstance.id, jobSequenceId)}>
                View job logs
              </Alert.Link>
            </>
          )}
        </Alert>
      )}

      {/* Progress bar for save operations */}
      {jobProgressArray.length > 0 && (
        <ServerJobsProgressInfo
          itemNames="sync stages"
          jobsProgress={jobProgressArray}
          courseInstanceId={courseInstance.id}
          statusText={{
            inProgress: 'Saving access control...',
            complete: 'Save complete',
            failed: 'Save failed',
          }}
          onDismissCompleteJobSequence={handleDismissCompleteJobSequence}
        />
      )}

      <AccessControlForm
        assessmentId={assessmentId}
        courseInstance={courseInstance}
        initialData={initialData}
        isSaving={saveMutation.isPending}
        urlPrefix={urlPrefix}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}

export function AccessControl(props: AccessControlProps) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProviderDebug client={queryClient}>
      <AccessControlInner {...props} />
    </QueryClientProviderDebug>
  );
}
AccessControl.displayName = 'AccessControl';
