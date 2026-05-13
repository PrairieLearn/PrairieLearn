import { QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { executeScripts } from '@prairielearn/browser-utils';

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

const OPEN_EVENT = 'open-ai-grade-modal';

declare global {
  interface Window {
    resetInstructorGradingPanel: () => any;
    mathjaxTypeset: (elements?: Element[]) => Promise<any>;
  }
}

/**
 * Fetches the current grading-rubric panels JSON and swaps the affected DOM
 * regions in place: the AI-grading explanation card inside the question
 * container (which itself wraps the student submission), and the main grading
 * panel. Falls back to a full page reload if any expected field is missing or
 * the target element can't be found, so the user always sees fresh data.
 */
async function refreshGradingPanels() {
  const reload = (reason: string) => {
    console.warn('[InstanceQuestionAiGrade] reloading page:', reason);
    window.location.reload();
  };

  try {
    const url = `${window.location.pathname.replace(/\/$/, '')}/grading_rubric_panels`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      reload(`fetch failed (status ${res.status})`);
      return;
    }
    const data = (await res.json()) as {
      gradingPanel?: string;
      questionContainer?: string;
      submissionPanel?: string;
      submissionId?: string;
      err?: string;
    };
    if (data.err) {
      reload(`server returned err: ${data.err}`);
      return;
    }
    if (!data.gradingPanel || !data.questionContainer) {
      reload('missing gradingPanel or questionContainer in response');
      return;
    }

    // The CSRF tokens embedded in the swapped HTML are signed for the
    // `/grading_rubric_panels` URL, not the base instance question URL the
    // form actually submits to. Capture the existing token before any swap so
    // we can re-apply it to all `__csrf_token` inputs afterwards (same trick
    // RubricSettings uses when it swaps the panel after saving rubric
    // settings).
    const existingCsrfToken =
      document.querySelector<HTMLInputElement>('.js-main-grading-panel input[name="__csrf_token"]')
        ?.value ?? '';

    // Swap the question container first — it wraps the freshly-rendered
    // submission panel and the AI grading explanation card (both server-
    // rendered from the same `aiGradingInfo` used to render the grading
    // panel, so the three regions stay in sync).
    const container = document.getElementById('js-question-container');
    if (!container) {
      reload('missing #js-question-container');
      return;
    }
    container.innerHTML = data.questionContainer;
    executeScripts(container);
    await window.mathjaxTypeset([container]);

    // Swap the main grading panel — score, rubric items, feedback textarea.
    const gradingPanel = document.querySelector<HTMLElement>('.js-main-grading-panel');
    if (!gradingPanel) {
      reload('missing .js-main-grading-panel');
      return;
    }
    gradingPanel.innerHTML = data.gradingPanel;
    if (typeof window.resetInstructorGradingPanel === 'function') {
      window.resetInstructorGradingPanel();
    }
    await window.mathjaxTypeset([gradingPanel]);

    if (existingCsrfToken) {
      document.querySelectorAll<HTMLInputElement>('input[name="__csrf_token"]').forEach((input) => {
        input.value = existingCsrfToken;
      });
    }
  } catch (err) {
    reload(`exception: ${String(err)}`);
  }
}

export interface InstanceQuestionAiGradeProps {
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

function InstanceQuestionAiGradeInner({
  courseInstanceId,
  instanceQuestionId,
  useCustomApiKeys,
  aiGradingSettingsUrl,
  availableAiGradingProviders,
  aiGradingRelativeCosts,
  aiGradingLastSelectedModel,
  initialOngoingJobSequenceTokens,
}: Omit<
  InstanceQuestionAiGradeProps,
  'trpcCsrfToken' | 'isDevMode' | 'assessmentId' | 'assessmentQuestionId' | 'hasRubric'
>) {
  const [modalState, setModalState] = useState<AiGradingModelSelectionModalState>(null);
  const [lastSelectedModel, setLastSelectedModel] = useState<string | null>(
    aiGradingLastSelectedModel,
  );

  const serverJobProgress = useServerJobProgress({
    enabled: true,
    initialOngoingJobSequenceTokens,
    onProgressChange: () => {},
  });

  const submissionStatus = serverJobProgress.displayedStatuses[instanceQuestionId];
  const completedJobsRef = useRef<Set<string>>(new Set());

  // When any tracked AI grading job completes, refresh the affected page
  // regions in place (submission panel, AI grading explanation, main grading
  // panel) so the user sees the new grade without losing scroll position.
  // The job-state transition only fires here once because each job_sequence_id
  // is tracked in `completedJobsRef`.
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

  // Reflect the AI grading status on the placeholder `#ai-grade-button` rendered
  // by `gradingPanel.html.ts`. The button stays disabled while an item is queued
  // or in-progress so the user can't kick off a duplicate run.
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
        onSuccess={(data, modelId) => {
          serverJobProgress.handleAddOngoingJobSequence(
            data.job_sequence_id,
            data.job_sequence_token,
          );
          setLastSelectedModel(modelId);
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
