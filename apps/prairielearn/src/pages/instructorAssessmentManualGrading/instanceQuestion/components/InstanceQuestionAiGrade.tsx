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
import { OPEN_AI_GRADE_MODAL_EVENT } from '../instanceQuestionAiGradeEvent.js';

declare global {
  interface Window {
    resetInstructorGradingPanel: () => any;
    mathjaxTypeset: (elements?: Element[]) => Promise<any>;
  }
}

function isInFlight(status: JobItemStatus | undefined) {
  return status === JobItemStatus.queued || status === JobItemStatus.in_progress;
}

function isDone(status: JobItemStatus | undefined) {
  return status === JobItemStatus.complete || status === JobItemStatus.failed;
}

async function refreshGradingPanels(): Promise<boolean> {
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
      return false;
    }
    const data = (await res.json()) as {
      gradingPanel?: string;
      questionContainer?: string;
      err?: string;
    };
    if (data.err) {
      reload(`server returned err: ${data.err}`);
      return false;
    }
    if (!data.gradingPanel || !data.questionContainer) {
      reload('missing gradingPanel or questionContainer in response');
      return false;
    }

    // The CSRF tokens embedded in the swapped HTML are signed for
    // `/grading_rubric_panels`, not the base URL the form actually posts to,
    // so reuse the existing token afterwards (same as `RubricSettings`).
    const existingCsrfToken =
      document.querySelector<HTMLInputElement>('.js-main-grading-panel input[name="__csrf_token"]')
        ?.value ?? '';

    const container = document.getElementById('js-question-container');
    if (!container) {
      reload('missing #js-question-container');
      return false;
    }
    container.innerHTML = data.questionContainer;
    executeScripts(container);
    await window.mathjaxTypeset([container]);

    const gradingPanel = document.querySelector<HTMLElement>('.js-main-grading-panel');
    if (!gradingPanel) {
      reload('missing .js-main-grading-panel');
      return false;
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
    return true;
  } catch (err) {
    reload(`exception: ${String(err)}`);
    return false;
  }
}

interface InstanceQuestionAiGradeInnerProps {
  courseInstanceId: string;
  instanceQuestionId: string;
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
  useCustomApiKeys,
  aiGradingSettingsUrl,
  availableAiGradingProviders,
  aiGradingRelativeCosts,
  aiGradingLastSelectedModel,
  initialOngoingJobSequenceTokens,
}: InstanceQuestionAiGradeInnerProps) {
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

  // The CustomEvent listener below closes over `submissionStatus` once at mount;
  // mirror it into a ref so the click handler always sees the live value
  // without re-binding the listener on every status change.
  const submissionStatusRef = useRef(submissionStatus);
  submissionStatusRef.current = submissionStatus;

  // Tracks whether the user has touched any input inside the grading panel
  // since the last server-rendered HTML was applied. Used to guard against
  // wiping in-flight manual grading work when an AI job completes.
  const formDirtyRef = useRef(false);
  useEffect(() => {
    const handler = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.js-main-grading-panel')) {
        formDirtyRef.current = true;
      }
    };
    document.addEventListener('input', handler);
    document.addEventListener('change', handler);
    return () => {
      document.removeEventListener('input', handler);
      document.removeEventListener('change', handler);
    };
  }, []);

  // Refresh the grading panel only when *this* instance question's per-item
  // status transitions from in-flight to done, not when any unrelated job
  // completes for the same assessment question.
  const prevSubmissionStatusRef = useRef<JobItemStatus | undefined>(undefined);
  useEffect(() => {
    const prev = prevSubmissionStatusRef.current;
    prevSubmissionStatusRef.current = submissionStatus;
    if (!isInFlight(prev) || !isDone(submissionStatus)) return;
    if (formDirtyRef.current) {
      console.warn(
        '[InstanceQuestionAiGrade] AI grading complete but the grading panel has unsaved edits; not refreshing in place. Reload to see the new state.',
      );
      return;
    }
    void refreshGradingPanels().then((swapped) => {
      if (swapped) formDirtyRef.current = false;
    });
  }, [submissionStatus]);

  useEffect(() => {
    const button = document.getElementById('ai-grade-button') as HTMLButtonElement | null;
    if (!button) return;
    const inProgress = isInFlight(submissionStatus);
    button.disabled = inProgress;
    button.title = inProgress ? 'AI grading in progress…' : '';
  }, [submissionStatus]);

  useEffect(() => {
    const handler = () => {
      if (isInFlight(submissionStatusRef.current)) return;
      setModalState({ type: 'selected', ids: [instanceQuestionId], numToGrade: 1 });
    };
    document.addEventListener(OPEN_AI_GRADE_MODAL_EVENT, handler);
    return () => document.removeEventListener(OPEN_AI_GRADE_MODAL_EVENT, handler);
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
