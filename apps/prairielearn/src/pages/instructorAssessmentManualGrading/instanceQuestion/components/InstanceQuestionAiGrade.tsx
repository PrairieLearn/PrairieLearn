import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { executeScripts, parseHTMLElement } from '@prairielearn/browser-utils';

import { ServerJobsProgressInfo } from '../../../../components/ServerJobProgress/ServerJobProgressBars.js';
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

const OPEN_EVENT = 'open-ai-grade-modal';
const BROADCAST_CHANNEL_NAME = 'pl-ai-grading';

interface BroadcastJobMessage {
  type: 'job-started';
  assessmentQuestionId: string;
  jobSequenceId: string;
  jobSequenceToken: string;
}

declare global {
  interface Window {
    resetInstructorGradingPanel: () => any;
    mathjaxTypeset: (elements?: Element[]) => Promise<any>;
  }
}

interface InstanceQuestionAiGradeProps {
  courseInstanceId: string;
  assessmentId: string;
  assessmentQuestionId: string;
  instanceQuestionId: string;
  trpcCsrfToken: string;
  isDevMode: boolean;
  hasRubric: boolean;
  useCustomApiKeys: boolean;
  aiGradingSettingsUrl: string;
  availableAiGradingProviders: EnumAiGradingProvider[];
  aiGradingRelativeCosts: Record<string, string>;
  aiGradingLastSelectedModel: string | null;
  initialOngoingJobSequenceTokens: Record<string, string> | null;
}

async function refreshGradingPanels() {
  try {
    const url = `${window.location.pathname.replace(/\/$/, '')}/grading_rubric_panels`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      gradingPanel?: string;
      submissionPanel?: string;
      submissionId?: string;
      reviewAiAlert?: string;
    };

    if (data.submissionPanel && data.submissionId) {
      const oldSubmission = document.getElementById(`submission-${data.submissionId}`);
      if (oldSubmission) {
        const newSubmission = parseHTMLElement(document, data.submissionPanel);
        oldSubmission.replaceWith(newSubmission);
        executeScripts(newSubmission);
        await window.mathjaxTypeset([newSubmission]);
      }
    }

    if (data.gradingPanel) {
      const gradingPanel = document.querySelector<HTMLElement>('.js-main-grading-panel');
      if (gradingPanel) {
        gradingPanel.innerHTML = data.gradingPanel;
        window.resetInstructorGradingPanel();
        await window.mathjaxTypeset([gradingPanel]);
      }
    }

    if (data.reviewAiAlert !== undefined) {
      const alertContainer = document.getElementById('js-review-ai-grading-alert');
      if (alertContainer) {
        alertContainer.innerHTML = data.reviewAiAlert;
      }
    }
  } catch {
    // If the refresh fails for any reason, leave the page as-is. The user
    // can manually reload to see the updated state.
  }
}

function InstanceQuestionAiGradeInner({
  courseInstanceId,
  assessmentQuestionId,
  instanceQuestionId,
  hasRubric,
  useCustomApiKeys,
  aiGradingSettingsUrl,
  availableAiGradingProviders,
  aiGradingRelativeCosts,
  aiGradingLastSelectedModel,
  initialOngoingJobSequenceTokens,
}: Omit<InstanceQuestionAiGradeProps, 'trpcCsrfToken' | 'isDevMode'>) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [modalState, setModalState] = useState<AiGradingModelSelectionModalState>(null);
  const [lastSelectedModel, setLastSelectedModel] = useState<string | null>(
    aiGradingLastSelectedModel,
  );

  const serverJobProgress = useServerJobProgress({
    enabled: true,
    initialOngoingJobSequenceTokens,
    onProgressChange: () => {
      void queryClient.invalidateQueries({
        queryKey: trpc.manualGrading.aiGradingAvailabilityInfo.queryKey(),
      });
    },
  });

  const submissionStatus = serverJobProgress.displayedStatuses[instanceQuestionId];
  const completedJobsRef = useRef<Set<string>>(new Set());

  // Cross-page sync: poll for ongoing AI grading jobs every 30s and on window
  // focus. Picks up jobs started from other pages (e.g., the manual grading
  // list page).
  const ongoingJobsQuery = useQuery({
    ...trpc.manualGrading.ongoingAiGradingJobs.queryOptions(),
    refetchOnWindowFocus: 'always',
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!ongoingJobsQuery.data) return;
    for (const [jobSequenceId, jobSequenceToken] of Object.entries(ongoingJobsQuery.data)) {
      if (!(jobSequenceId in serverJobProgress.jobsProgress)) {
        serverJobProgress.handleAddOngoingJobSequence(jobSequenceId, jobSequenceToken);
      }
    }
    // Intentionally not depending on serverJobProgress.* — we only want to
    // react to server data changes, not to internal state changes.
    // eslint-disable-next-line @eslint-react/exhaustive-deps
  }, [ongoingJobsQuery.data]);

  // Cross-page sync: BroadcastChannel for instant same-browser sync. When
  // another page (in the same browser) starts an AI grading job for this
  // assessment question, pick up the new job sequence right away.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    const handler = (event: MessageEvent) => {
      const msg = event.data as Partial<BroadcastJobMessage> | null | undefined;
      if (msg?.type !== 'job-started') return;
      if (msg.assessmentQuestionId !== assessmentQuestionId) return;
      if (!msg.jobSequenceId || !msg.jobSequenceToken) return;
      serverJobProgress.handleAddOngoingJobSequence(msg.jobSequenceId, msg.jobSequenceToken);
    };
    channel.addEventListener('message', handler);
    return () => {
      channel.removeEventListener('message', handler);
      channel.close();
    };
    // eslint-disable-next-line @eslint-react/exhaustive-deps
  }, [assessmentQuestionId]);

  // When any tracked AI grading job completes, refresh the grading panel and
  // submission panel in place. This covers:
  // - Jobs the user kicked off from this page.
  // - Jobs the user kicked off from another page (picked up via the cross-page
  //   poll/BroadcastChannel sync above).
  // We watch overall job completion (not per-item status) because some AI
  // grading jobs don't emit `item_statuses`. Tracking which jobs we've already
  // refreshed for prevents repeat fetches across re-renders.
  // The job state comes from a WebSocket subscription via `useServerJobProgress`,
  // so observing the transition requires an effect.
  useEffect(() => {
    let shouldRefresh = false;
    for (const job of Object.values(serverJobProgress.jobsProgress)) {
      const isComplete = job.num_total > 0 && job.num_complete >= job.num_total;
      if (isComplete && !completedJobsRef.current.has(job.job_sequence_id)) {
        completedJobsRef.current.add(job.job_sequence_id);
        shouldRefresh = true;
      }
    }
    if (shouldRefresh) {
      void refreshGradingPanels();
    }
  }, [serverJobProgress.jobsProgress]);

  // Reflect the AI grading status on the placeholder #ai-grade-button (which
  // lives inside the server-rendered grading panel form). Re-runs on
  // submissionStatus change AND after panel swap (since innerHTML replacement
  // creates a new button element).
  useEffect(() => {
    const button = document.getElementById('ai-grade-button') as HTMLButtonElement | null;
    if (!button) return;
    const inProgress =
      submissionStatus === JobItemStatus.queued || submissionStatus === JobItemStatus.in_progress;
    button.disabled = inProgress;
    button.title = inProgress ? 'AI grading in progress…' : '';
  }, [submissionStatus]);

  // Listen for click events from the server-rendered AI grade button.
  useEffect(() => {
    const handler = () =>
      setModalState({ type: 'selected', ids: [instanceQuestionId], numToGrade: 1 });
    document.addEventListener(OPEN_EVENT, handler);
    return () => document.removeEventListener(OPEN_EVENT, handler);
  }, [instanceQuestionId]);

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
        modalState={modalState}
        availableProviders={availableAiGradingProviders}
        aiGradingLastSelectedModel={lastSelectedModel}
        relativeCosts={aiGradingRelativeCosts}
        useCustomApiKeys={useCustomApiKeys}
        aiGradingSettingsUrl={aiGradingSettingsUrl}
        hasRubric={hasRubric}
        totalSubmissionCount={1}
        onAutoSelectForTest={() => {}}
        onSuccess={(data, modelId) => {
          serverJobProgress.handleAddOngoingJobSequence(
            data.job_sequence_id,
            data.job_sequence_token,
          );
          setLastSelectedModel(modelId);
          // Broadcast to other open pages in the same browser so they can
          // start tracking this job immediately.
          if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
            const message: BroadcastJobMessage = {
              type: 'job-started',
              assessmentQuestionId,
              jobSequenceId: data.job_sequence_id,
              jobSequenceToken: data.job_sequence_token,
            };
            channel.postMessage(message);
            channel.close();
          }
        }}
        onHide={() => setModalState(null)}
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
