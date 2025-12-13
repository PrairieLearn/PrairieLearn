import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { useState } from 'preact/compat';
import { Alert } from 'react-bootstrap';

import { NuqsAdapter } from '@prairielearn/ui';

import type { AiGradingGeneralStats } from '../../../ee/lib/ai-grading/types.js';
import type { PageContext } from '../../../lib/client/page-context.js';
import type {
  StaffAssessment,
  StaffAssessmentQuestion,
  StaffInstanceQuestionGroup,
  StaffUser,
} from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';

import type { InstanceQuestionRowWithAIGradingStats } from './assessmentQuestion.types.js';
import { AssessmentQuestionTable } from './components/AssessmentQuestionTable.js';
import {
  type ConflictModalState,
  GradingConflictModal,
} from './components/GradingConflictModal.js';
import { GroupInfoModal, type GroupInfoModalState } from './components/GroupInfoModal.js';
import { useManualGradingActions } from './utils/useManualGradingActions.js';

export interface AssessmentQuestionManualGradingProps {
  hasCourseInstancePermissionEdit: boolean;
  course: PageContext<'assessmentQuestion', 'instructor'>['course'];
  courseInstance: PageContext<'assessmentQuestion', 'instructor'>['course_instance'];
  csrfToken: string;
  instanceQuestionsInfo: InstanceQuestionRowWithAIGradingStats[];
  urlPrefix: string;
  assessment: StaffAssessment;
  assessmentQuestion: StaffAssessmentQuestion;
  questionQid: string;
  aiGradingEnabled: boolean;
  aiGradingModelSelectionEnabled: boolean;
  initialAiGradingMode: boolean;
  rubricData: RubricData | null;
  instanceQuestionGroups: StaffInstanceQuestionGroup[];
  courseStaff: StaffUser[];
  aiGradingStats: AiGradingGeneralStats | null;
  numOpenInstances: number;
  search: string;
  isDevMode: boolean;
  questionTitle: string;
  questionNumber: number;
}

type AssessmentQuestionManualGradingInnerProps = Omit<
  AssessmentQuestionManualGradingProps,
  'search' | 'isDevMode'
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
  aiGradingModelSelectionEnabled,
  initialAiGradingMode,
  rubricData,
  instanceQuestionGroups,
  courseStaff,
  aiGradingStats,
  numOpenInstances,
  questionTitle,
  questionNumber,
}: AssessmentQuestionManualGradingInnerProps) {
  const queryClient = useQueryClient();
  const [groupInfoModalState, setGroupInfoModalState] = useState<GroupInfoModalState>(null);
  const [conflictModalState, setConflictModalState] = useState<ConflictModalState>(null);

  const [aiGradingMode, setAiGradingMode] = useState(initialAiGradingMode);

  const mutations = useManualGradingActions({ courseInstanceId: courseInstance.id });
  const { setAiGradingModeMutation, groupSubmissionMutation } = mutations;

  return (
    <>
      {setAiGradingModeMutation.isError && (
        <Alert
          variant="danger"
          class="mb-3"
          dismissible
          onClose={() => setAiGradingModeMutation.reset()}
        >
          <strong>Error:</strong> {setAiGradingModeMutation.error.message}
        </Alert>
      )}
      <div class="d-flex flex-row justify-content-between align-items-center mb-3 gap-2">
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0">
            <li class="breadcrumb-item">
              <a href={`${urlPrefix}/assessment/${assessment.id}/manual_grading`}>Manual grading</a>
            </li>
            <li class="breadcrumb-item active" aria-current="page">
              Question {questionNumber}. {questionTitle}
            </li>
          </ol>
        </nav>
        {aiGradingEnabled && (
          <div class="card px-3 py-2 mb-0">
            <div class="form-check form-switch mb-0">
              <input
                class="form-check-input"
                type="checkbox"
                role="switch"
                id="switchCheckDefault"
                checked={aiGradingMode}
                disabled={setAiGradingModeMutation.isPending}
                onChange={() =>
                  setAiGradingModeMutation.mutate(!aiGradingMode, {
                    onSuccess: () => {
                      setAiGradingMode((prev) => !prev);
                    },
                  })
                }
              />
              <label class="form-check-label" for="switchCheckDefault">
                <i class="bi bi-stars" />
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
        aiGradingModelSelectionEnabled={aiGradingModelSelectionEnabled}
        rubricData={rubricData}
        instanceQuestionGroups={instanceQuestionGroups}
        courseStaff={courseStaff}
        aiGradingStats={aiGradingStats}
        mutations={mutations}
        onSetGroupInfoModalState={setGroupInfoModalState}
        onSetConflictModalState={setConflictModalState}
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
            queryKey: ['instance-questions'],
          });
        }}
      />
    </>
  );
}

export function AssessmentQuestionManualGrading({
  search,
  isDevMode,
  ...innerProps
}: AssessmentQuestionManualGradingProps) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <AssessmentQuestionManualGradingInner {...innerProps} />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

AssessmentQuestionManualGrading.displayName = 'AssessmentQuestionManualGrading';
