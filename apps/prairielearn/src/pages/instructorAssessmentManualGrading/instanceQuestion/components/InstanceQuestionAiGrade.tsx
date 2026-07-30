import { QueryClient, useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-bootstrap';

import { useModalState } from '@prairielearn/ui';

import { AiGradingProgressInfo } from '../../../../components/ServerJobProgress/AiGradingProgressInfo.js';
import { useServerJobProgress } from '../../../../components/ServerJobProgress/useServerJobProgress.js';
import { QueryClientProviderDebug } from '../../../../lib/client/tanstackQuery.js';
import type { EnumAiGradingProvider } from '../../../../lib/db-types.js';
import { JobItemStatus } from '../../../../lib/serverJobProgressSocket.shared.js';
import { createAssessmentQuestionTrpcClient } from '../../../../trpc/assessmentQuestion/client.js';
import { TRPCProvider, useTRPC } from '../../../../trpc/assessmentQuestion/context.js';
import {
  AiGradingModelSelectionModal,
  type AiGradingModelSelectionModalState,
} from '../../assessmentQuestion/components/AiGradingModelSelectionModal.js';
import { AI_GRADING_MODAL_OPEN_EVENT } from '../instanceQuestion.shared.js';

import { reloadGradingPanel } from './reloadGradingPanel.js';

interface InstanceQuestionAiGradeInnerProps {
  courseInstanceId: string;
  assessmentId: string;
  instanceQuestionId: string;
  hasRubric: boolean;
  useCustomApiKeys: boolean;
  aiGradingSettingsUrl: string;
  availableAiGradingProviders: EnumAiGradingProvider[];
  aiGradingRelativeCosts: Record<string, string>;
  aiGradingLastSelectedModel: string | null;
  initialOngoingJobSequenceTokens: Record<string, string> | null;
  hasCourseInstancePermissionEdit: boolean;
}

export interface InstanceQuestionAiGradeProps extends InstanceQuestionAiGradeInnerProps {
  assessmentQuestionId: string;
  trpcCsrfToken: string;
  isDevMode: boolean;
}

function InstanceQuestionAiGradeInner({
  courseInstanceId,
  assessmentId,
  instanceQuestionId,
  hasRubric,
  useCustomApiKeys,
  aiGradingSettingsUrl,
  availableAiGradingProviders,
  aiGradingRelativeCosts,
  aiGradingLastSelectedModel,
  initialOngoingJobSequenceTokens,
  hasCourseInstancePermissionEdit,
}: InstanceQuestionAiGradeInnerProps) {
  const trpc = useTRPC();
  const modelSelectionModalState = useModalState<AiGradingModelSelectionModalState>();
  const [lastSelectedModel, setLastSelectedModel] = useState<string | null>(
    aiGradingLastSelectedModel,
  );
  const [showReloadError, setShowReloadError] = useState(false);

  const stopAiGradingJobMutation = useMutation(
    trpc.manualGrading.stopAiGradingJob.mutationOptions(),
  );

  const serverJobProgress = useServerJobProgress({
    enabled: true,
    initialOngoingJobSequenceTokens,
    onProgressChange: () => {},
  });

  const submissionStatus = serverJobProgress.displayedStatuses[instanceQuestionId];

  // Refresh the grading panel once when a job we're watching reaches a
  // terminal state. A previous-vs-current comparison misses the case where
  // the job completes between page render and the WebSocket join, so we
  // explicitly mark whether there's a pending reload to wait for instead.
  // Tracked via ref (not state) to avoid render churn.
  const expectReloadRef = useRef(
    initialOngoingJobSequenceTokens != null &&
      Object.keys(initialOngoingJobSequenceTokens).length > 0,
  );
  useEffect(() => {
    if (submissionStatus !== JobItemStatus.complete && submissionStatus !== JobItemStatus.failed) {
      return;
    }
    if (!expectReloadRef.current) return;
    expectReloadRef.current = false;
    if (submissionStatus === JobItemStatus.complete) {
      void reloadGradingPanel({ courseInstanceId, assessmentId, instanceQuestionId }).then((ok) => {
        if (!ok) setShowReloadError(true);
      });
    }
  }, [submissionStatus, courseInstanceId, assessmentId, instanceQuestionId]);

  // Imperatively toggle the AI grade button's disabled state because the
  // button lives in the server-rendered grading panel — making this
  // declarative would require porting the entire grading panel to React.
  useEffect(() => {
    const button = document.getElementById('ai-grade-button') as HTMLButtonElement | null;
    if (!button) return;
    const inProgress =
      submissionStatus === JobItemStatus.queued || submissionStatus === JobItemStatus.in_progress;
    button.disabled = inProgress;
    button.title = inProgress ? 'AI grading in progress…' : '';
  }, [submissionStatus]);

  useEffect(() => {
    const handler = () => {
      modelSelectionModalState.showWithData({
        type: 'selected',
        ids: [instanceQuestionId],
        numToGrade: 1,
      });
    };
    document.addEventListener(AI_GRADING_MODAL_OPEN_EVENT, handler);
    return () => document.removeEventListener(AI_GRADING_MODAL_OPEN_EVENT, handler);
  }, [instanceQuestionId, modelSelectionModalState]);

  return (
    <>
      <AiGradingProgressInfo
        jobsProgress={Object.values(serverJobProgress.jobsProgress)}
        courseInstanceId={courseInstanceId}
        hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
        onDismissCompleteJobSequence={serverJobProgress.handleDismissCompleteJobSequence}
        onStopJobSequence={(jobSequenceId) =>
          stopAiGradingJobMutation.mutate({ job_sequence_id: jobSequenceId })
        }
      />
      <Alert
        show={showReloadError}
        variant="warning"
        dismissible
        onClose={() => setShowReloadError(false)}
      >
        <div className="d-flex flex-wrap align-items-center gap-2">
          <i className="bi bi-exclamation-triangle-fill fs-5" aria-hidden="true" />
          <strong>Failed to refresh grading panel</strong>
          <span className="text-body-secondary opacity-50" aria-hidden="true">
            &middot;
          </span>
          <button
            type="button"
            className="btn btn-link p-0 align-baseline border-0 text-decoration-none"
            style={{ fontSize: 'inherit' }}
            onClick={() => window.location.reload()}
          >
            Refresh
          </button>
        </div>
      </Alert>
      <AiGradingModelSelectionModal
        key={lastSelectedModel ?? 'default'}
        show={modelSelectionModalState.show}
        data={modelSelectionModalState.data}
        availableProviders={availableAiGradingProviders}
        aiGradingLastSelectedModel={lastSelectedModel}
        relativeCosts={aiGradingRelativeCosts}
        useCustomApiKeys={useCustomApiKeys}
        aiGradingSettingsUrl={aiGradingSettingsUrl}
        hasRubric={hasRubric}
        totalSubmissionCount={1}
        onHide={modelSelectionModalState.onHide}
        onExited={modelSelectionModalState.onExited}
        onSuccess={(data, modelId) => {
          serverJobProgress.handleAddOngoingJobSequence(
            data.job_sequence_id,
            data.job_sequence_token,
          );
          expectReloadRef.current = true;
          setLastSelectedModel(modelId);
        }}
      />
    </>
  );
}

export function InstanceQuestionAiGrade(props: InstanceQuestionAiGradeProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentQuestionTrpcClient({
      csrfToken: props.trpcCsrfToken,
      courseInstanceId: props.courseInstanceId,
      assessmentId: props.assessmentId,
      assessmentQuestionId: props.assessmentQuestionId,
    }),
  );

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={props.isDevMode}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <InstanceQuestionAiGradeInner {...props} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

InstanceQuestionAiGrade.displayName = 'InstanceQuestionAiGrade';
