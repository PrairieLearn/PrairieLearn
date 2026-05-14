import { QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { useModalState } from '@prairielearn/ui';

import { ServerJobsProgressInfo } from '../../../../components/ServerJobProgress/ServerJobProgressBars.js';
import { useServerJobProgress } from '../../../../components/ServerJobProgress/useServerJobProgress.js';
import { QueryClientProviderDebug } from '../../../../lib/client/tanstackQuery.js';
import type { EnumAiGradingProvider } from '../../../../lib/db-types.js';
import { JobItemStatus } from '../../../../lib/serverJobProgressSocket.shared.js';
import { createAssessmentQuestionTrpcClient } from '../../../../trpc/assessmentQuestion/client.js';
import { TRPCProvider } from '../../../../trpc/assessmentQuestion/context.js';
import {
  AiGradingModelSelectionModal,
  type AiGradingModelSelectionModalState,
} from '../../assessmentQuestion/components/AiGradingModelSelectionModal.js';
import { AI_GRADING_MODAL_OPEN_EVENT } from '../instanceQuestion.shared.js';

import { reloadGradingPanel } from './reloadGradingPanel.js';

function isInFlight(status: JobItemStatus | undefined) {
  return status === JobItemStatus.queued || status === JobItemStatus.in_progress;
}

interface InstanceQuestionAiGradeInnerProps {
  courseInstanceId: string;
  instanceQuestionId: string;
  hasRubric: boolean;
  useCustomApiKeys: boolean;
  aiGradingSettingsUrl: string;
  availableAiGradingProviders: EnumAiGradingProvider[];
  aiGradingRelativeCosts: Record<string, string>;
  aiGradingLastSelectedModel: string | null;
  initialOngoingJobSequenceTokens: Record<string, string> | null;
}

export interface InstanceQuestionAiGradeProps extends InstanceQuestionAiGradeInnerProps {
  assessmentId: string;
  assessmentQuestionId: string;
  trpcCsrfToken: string;
  isDevMode: boolean;
}

function InstanceQuestionAiGradeInner({
  courseInstanceId,
  instanceQuestionId,
  hasRubric,
  useCustomApiKeys,
  aiGradingSettingsUrl,
  availableAiGradingProviders,
  aiGradingRelativeCosts,
  aiGradingLastSelectedModel,
  initialOngoingJobSequenceTokens,
}: InstanceQuestionAiGradeInnerProps) {
  const modelSelectionModalState = useModalState<AiGradingModelSelectionModalState>();
  const [lastSelectedModel, setLastSelectedModel] = useState<string | null>(
    aiGradingLastSelectedModel,
  );

  const serverJobProgress = useServerJobProgress({
    enabled: true,
    initialOngoingJobSequenceTokens,
    onProgressChange: () => {},
  });

  const submissionStatus = serverJobProgress.displayedStatuses[instanceQuestionId];

  // Refresh the grading panel on transition from in-flight to complete.
  // Tracked via ref (not state) so the comparison doesn't trigger renders.
  // Failures are surfaced by the progress row below.
  const prevSubmissionStatusRef = useRef<JobItemStatus | undefined>(undefined);
  useEffect(() => {
    const prev = prevSubmissionStatusRef.current;
    prevSubmissionStatusRef.current = submissionStatus;
    if (!isInFlight(prev) || submissionStatus !== JobItemStatus.complete) return;
    void reloadGradingPanel();
  }, [submissionStatus]);

  // Imperatively toggle the AI grade button's disabled state because the
  // button lives in the server-rendered grading panel — making this
  // declarative would require porting the entire grading panel to React.
  useEffect(() => {
    const button = document.getElementById('ai-grade-button') as HTMLButtonElement | null;
    if (!button) return;
    const inProgress = isInFlight(submissionStatus);
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
      <ServerJobsProgressInfo
        itemNames="submissions graded"
        jobsProgress={Object.values(serverJobProgress.jobsProgress)}
        courseInstanceId={courseInstanceId}
        statusIcons={{ inProgress: 'bi-stars' }}
        statusText={{
          inProgress: 'AI grading in progress',
          complete: 'AI grading complete',
          failed: 'AI grading failed',
        }}
        onDismissCompleteJobSequence={serverJobProgress.handleDismissCompleteJobSequence}
      />
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
        onSelectFirstSubmissions={() => {
          // No-op: this modal is opened for a single instance question, so there
          // is no "first N submissions" reduction to make.
        }}
        onHide={modelSelectionModalState.onHide}
        onExited={modelSelectionModalState.onExited}
        onSuccess={(data, modelId) => {
          serverJobProgress.handleAddOngoingJobSequence(
            data.job_sequence_id,
            data.job_sequence_token,
          );
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
