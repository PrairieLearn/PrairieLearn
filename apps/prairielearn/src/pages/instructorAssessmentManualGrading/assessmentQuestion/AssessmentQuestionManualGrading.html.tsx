import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { NuqsAdapter } from '@prairielearn/ui';

import type { AiGradingGeneralStats } from '../../../ee/lib/ai-grading/types.js';
import { AppErrorAlert, getAppError } from '../../../lib/client/errors.js';
import type { PageContext } from '../../../lib/client/page-context.js';
import type {
  StaffAssessment,
  StaffAssessmentQuestion,
  StaffInstanceQuestionGroup,
  StaffUser,
} from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { EnumAiGradingProvider } from '../../../lib/db-types.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';
import { createAssessmentQuestionTrpcClient } from '../../../trpc/assessmentQuestion/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/assessmentQuestion/context.js';
import type { ManualGradingError } from '../../../trpc/assessmentQuestion/manual-grading.js';

import type { InstanceQuestionRowWithAIGradingStats } from './assessmentQuestion.types.js';
import { AiGradingUnavailableModal } from './components/AiGradingUnavailableModal.js';
import { AssessmentQuestionTable } from './components/AssessmentQuestionTable.js';
import {
  type ConflictModalState,
  GradingConflictModal,
} from './components/GradingConflictModal.js';
import { GroupInfoModal, type GroupInfoModalState } from './components/GroupInfoModal.js';
import type { RubricSettingsContextKeys } from './queries.js';
import { useManualGradingActions } from './utils/useManualGradingActions.js';

interface AssessmentQuestionManualGradingProps {
  hasCourseInstancePermissionEdit: boolean;
  course: PageContext<'assessmentQuestion', 'instructor'>['course'];
  courseInstance: PageContext<'assessmentQuestion', 'instructor'>['course_instance'];
  csrfToken: string;
  trpcCsrfToken: string;
  instanceQuestionsInfo: InstanceQuestionRowWithAIGradingStats[];
  urlPrefix: string;
  assessment: StaffAssessment;
  assessmentQuestion: StaffAssessmentQuestion;
  questionQid: string;
  aiGradingEnabled: boolean;
  aiSubmissionGroupingEnabled: boolean;
  initialAiGradingMode: boolean;
  rubricData: RubricData | null;
  instanceQuestionGroups: StaffInstanceQuestionGroup[];
  courseStaff: StaffUser[];
  aiGradingStats: AiGradingGeneralStats | null;
  initialOngoingJobSequenceTokens: Record<string, string> | null;
  numOpenInstances: number;
  search: string;
  isDevMode: boolean;
  questionTitle: string;
  questionNumber: number;
  availableAiGradingProviders: EnumAiGradingProvider[];
  aiGradingRelativeCosts: Record<string, string>;
  rubricSettingsContextKeys: RubricSettingsContextKeys;
}

type AssessmentQuestionManualGradingInnerProps = Omit<
  AssessmentQuestionManualGradingProps,
  'search' | 'isDevMode' | 'trpcCsrfToken'
>;

function AssessmentQuestionManualGradingInner({
  hasCourseInstancePermissionEdit,
  instanceQuestionsInfo,
  course,
  courseInstance,
  urlPrefix,
  csrfToken,
  assessment,
  assessmentQuestion,
  questionQid,
  aiGradingEnabled,
  aiSubmissionGroupingEnabled,
  initialAiGradingMode,
  rubricData: initialRubricData,
  instanceQuestionGroups,
  courseStaff,
  aiGradingStats: initialAiGradingStats,
  initialOngoingJobSequenceTokens,
  numOpenInstances,
  questionTitle,
  questionNumber,
  availableAiGradingProviders,
  aiGradingRelativeCosts,
  rubricSettingsContextKeys,
}: AssessmentQuestionManualGradingInnerProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [groupInfoModalState, setGroupInfoModalState] = useState<GroupInfoModalState>(null);
  const [conflictModalState, setConflictModalState] = useState<ConflictModalState>(null);
  const [showAiGradingUnavailableModal, setShowAiGradingUnavailableModal] = useState(false);

  const [aiGradingMode, setAiGradingMode] = useState(initialAiGradingMode);
  const [rubricData, setRubricData] = useState(initialRubricData);
  const [aiGradingStats, setAiGradingStats] = useState(initialAiGradingStats);

  // AI grading is available only if the question uses manual grading.
  const isAiGradingAvailable = (assessmentQuestion.max_manual_points ?? 0) > 0;

  const mutations = useManualGradingActions();
  const { setAiGradingModeMutation, groupSubmissionMutation } = mutations;
  const setAiGradingModeError = getAppError<ManualGradingError['SetAiGradingMode']>(
    setAiGradingModeMutation.error,
  );

  return (
    <>
      <AppErrorAlert
        error={setAiGradingModeError}
        className="mb-3"
        render={{
          UNKNOWN: ({ message }) => (
            <>
              <strong>Error:</strong> {message}
            </>
          ),
        }}
        onDismiss={() => setAiGradingModeMutation.reset()}
      />
      <div className="d-flex flex-row justify-content-between align-items-center mb-3 gap-2">
        <nav aria-label="breadcrumb">
          <ol className="breadcrumb mb-0">
            <li className="breadcrumb-item">
              <a href={`${urlPrefix}/assessment/${assessment.id}/manual_grading`}>Manual grading</a>
            </li>
            <li className="breadcrumb-item active" aria-current="page">
              Question {questionNumber}. {questionTitle}
            </li>
          </ol>
        </nav>
        {aiGradingEnabled && (
          <div className="card px-3 py-2 mb-0">
            <div
              className={`form-check form-switch mb-0 ${isAiGradingAvailable ? 'opacity-100' : 'opacity-75'}`}
            >
              <input
                className="form-check-input"
                type="checkbox"
                role="switch"
                id="switchCheckDefault"
                checked={aiGradingMode}
                onChange={() => {
                  if (!isAiGradingAvailable) {
                    setShowAiGradingUnavailableModal(true);
                    return;
                  }
                  setAiGradingModeMutation.mutate(
                    { enabled: !aiGradingMode },
                    {
                      onSuccess: () => {
                        setAiGradingMode((prev) => !prev);
                      },
                    },
                  );
                }}
              />
              <label className="form-check-label" htmlFor="switchCheckDefault">
                <i className="bi bi-stars" />
                AI grading mode
              </label>
            </div>
          </div>
        )}
      </div>
      <AssessmentQuestionTable
        hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
        course={course}
        courseInstance={courseInstance}
        csrfToken={csrfToken}
        instanceQuestionsInfo={instanceQuestionsInfo}
        urlPrefix={urlPrefix}
        assessment={assessment}
        assessmentQuestion={assessmentQuestion}
        questionQid={questionQid}
        aiGradingMode={aiGradingMode}
        aiSubmissionGroupingEnabled={aiSubmissionGroupingEnabled}
        rubricData={rubricData}
        instanceQuestionGroups={instanceQuestionGroups}
        courseStaff={courseStaff}
        aiGradingStats={aiGradingStats}
        mutations={mutations}
        initialOngoingJobSequenceTokens={initialOngoingJobSequenceTokens}
        availableAiGradingProviders={availableAiGradingProviders}
        aiGradingRelativeCosts={aiGradingRelativeCosts}
        rubricSettingsContextKeys={rubricSettingsContextKeys}
        onSetGroupInfoModalState={setGroupInfoModalState}
        onSetConflictModalState={setConflictModalState}
        onRubricSettingsSaved={({ rubric_data, aiGradingStats: newAiGradingStats }) => {
          setRubricData(rubric_data);
          setAiGradingStats(newAiGradingStats);
          void queryClient.invalidateQueries({
            queryKey: trpc.manualGrading.instances.queryKey(),
          });
        }}
      />

      <GroupInfoModal
        modalState={groupInfoModalState}
        numOpenInstances={numOpenInstances}
        mutation={groupSubmissionMutation}
        onHide={() => setGroupInfoModalState(null)}
      />

      <GradingConflictModal
        modalState={conflictModalState}
        onHide={() => {
          setConflictModalState(null);
          // Refetch the table data to show the latest state.
          void queryClient.invalidateQueries({
            queryKey: trpc.manualGrading.instances.queryKey(),
          });
        }}
      />

      <AiGradingUnavailableModal
        show={showAiGradingUnavailableModal}
        onHide={() => setShowAiGradingUnavailableModal(false)}
      />
    </>
  );
}

export function AssessmentQuestionManualGrading({
  search,
  isDevMode,
  trpcCsrfToken,
  ...innerProps
}: AssessmentQuestionManualGradingProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentQuestionTrpcClient({
      csrfToken: trpcCsrfToken,
      courseInstanceId: innerProps.courseInstance.id,
      assessmentId: innerProps.assessment.id,
      assessmentQuestionId: innerProps.assessmentQuestion.id,
    }),
  );
  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <AssessmentQuestionManualGradingInner {...innerProps} />
        </TRPCProvider>
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

AssessmentQuestionManualGrading.displayName = 'AssessmentQuestionManualGrading';
