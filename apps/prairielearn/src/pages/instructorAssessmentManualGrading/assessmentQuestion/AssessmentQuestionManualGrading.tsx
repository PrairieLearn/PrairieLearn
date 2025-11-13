import { QueryClient } from '@tanstack/react-query';
import { useState } from 'preact/compat';
import { Alert } from 'react-bootstrap';

import type { AiGradingGeneralStats } from '../../../ee/lib/ai-grading/types.js';
import { NuqsAdapter } from '../../../lib/client/nuqs.js';
import type { StaffCourseInstanceContext } from '../../../lib/client/page-context.js';
import type {
  StaffAssessment,
  StaffAssessmentQuestion,
  StaffInstanceQuestionGroup,
} from '../../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';

import type { InstanceQuestionRowWithAIGradingStats } from './assessmentQuestion.types.js';
import { AssessmentQuestionTable } from './components/AssessmentQuestionTable.js';
import { GradingConflictModal } from './components/GradingConflictModal.js';
import { GroupInfoModal } from './components/GroupInfoModal.js';
import { useManualGradingActions } from './utils/useManualGradingActions.js';

const queryClient = new QueryClient();

export interface AssessmentQuestionManualGradingProps {
  hasCourseInstancePermissionEdit: boolean;
  course: StaffCourseInstanceContext['course'];
  courseInstance: StaffCourseInstanceContext['course_instance'];
  csrfToken: string;
  instanceQuestionsInfo: InstanceQuestionRowWithAIGradingStats[];
  urlPrefix: string;
  assessment: StaffAssessment;
  assessmentQuestion: StaffAssessmentQuestion;
  questionQid: string;
  aiGradingEnabled: boolean;
  initialAiGradingMode: boolean;
  rubricData: RubricData | null;
  instanceQuestionGroups: StaffInstanceQuestionGroup[];
  courseStaff: { user_id: string; name: string | null; uid: string }[];
  aiGradingStats: AiGradingGeneralStats | null;
  numOpenInstances: number;
  search: string;
  isDevMode: boolean;
  questionTitle: string;
  questionNumber: number | null;
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
  initialAiGradingMode,
  rubricData,
  instanceQuestionGroups,
  courseStaff,
  aiGradingStats,
  numOpenInstances,
  questionTitle,
  questionNumber,
}: AssessmentQuestionManualGradingInnerProps) {
  const [showSelectedModal, setShowSelectedModal] = useState(false);
  const [showAllModal, setShowAllModal] = useState(false);
  const [showUngroupedModal, setShowUngroupedModal] = useState(false);
  const [selectedIdsForGrouping, setSelectedIdsForGrouping] = useState<string[]>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictDetailsUrl, setConflictDetailsUrl] = useState('/');

  const handleShowSelectedModal = (ids: string[]) => {
    setSelectedIdsForGrouping(ids);
    setShowSelectedModal(true);
  };

  const handleShowConflictModal = (url: string) => {
    setConflictDetailsUrl(url);
    setShowConflictModal(true);
  };

  // State for AI grading mode (initialized from prop, managed by mutation)
  const [aiGradingMode, setAiGradingMode] = useState(initialAiGradingMode);

  // Use manual grading actions hook
  const { groupSubmissionMutation, toggleAiGradingModeMutation, ...mutations } =
    useManualGradingActions({
      csrfToken,
      courseInstanceId: courseInstance.id,
    });

  return (
    <>
      {groupSubmissionMutation.isError && (
        <Alert
          variant="danger"
          class="mb-3"
          dismissible
          onClose={() => groupSubmissionMutation.reset()}
        >
          <strong>Error:</strong> {groupSubmissionMutation.error.message}
        </Alert>
      )}
      {toggleAiGradingModeMutation.isError && (
        <Alert
          variant="danger"
          class="mb-3"
          dismissible
          onClose={() => toggleAiGradingModeMutation.reset()}
        >
          <strong>Error:</strong> {toggleAiGradingModeMutation.error.message}
        </Alert>
      )}
      <div class="d-flex flex-row justify-content-between align-items-center mb-3 gap-2">
        <nav aria-label="breadcrumb">
          <ol class="breadcrumb mb-0">
            <li class="breadcrumb-item">
              <a href={`${urlPrefix}/assessment/${assessment.id}/manual_grading`}>Manual grading</a>
            </li>
            <li class="breadcrumb-item active" aria-current="page">
              Question {questionNumber != null ? questionNumber : ''}. {questionTitle}
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
                disabled={toggleAiGradingModeMutation.isPending}
                onChange={() =>
                  toggleAiGradingModeMutation.mutate(undefined, {
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
        rubricData={rubricData}
        instanceQuestionGroups={instanceQuestionGroups}
        courseStaff={courseStaff}
        aiGradingStats={aiGradingStats}
        mutations={mutations}
        onShowGroupSelectedModal={handleShowSelectedModal}
        onShowGroupAllModal={() => setShowAllModal(true)}
        onShowGroupUngroupedModal={() => setShowUngroupedModal(true)}
        onShowConflictModal={handleShowConflictModal}
      />

      <GroupInfoModal
        modalFor="selected"
        numOpenInstances={numOpenInstances}
        show={showSelectedModal}
        onHide={() => setShowSelectedModal(false)}
        onSubmit={(closedOnly) =>
          groupSubmissionMutation.mutate({
            action: 'batch_action',
            closedOnly,
            numOpenInstances,
            instanceQuestionIds: selectedIdsForGrouping,
          })
        }
      />

      <GroupInfoModal
        modalFor="all"
        numOpenInstances={numOpenInstances}
        show={showAllModal}
        onHide={() => setShowAllModal(false)}
        onSubmit={(closedOnly) =>
          groupSubmissionMutation.mutate({
            action: 'ai_instance_question_group_assessment_all',
            closedOnly,
            numOpenInstances,
          })
        }
      />

      <GroupInfoModal
        modalFor="ungrouped"
        numOpenInstances={numOpenInstances}
        show={showUngroupedModal}
        onHide={() => setShowUngroupedModal(false)}
        onSubmit={(closedOnly) =>
          groupSubmissionMutation.mutate({
            action: 'ai_instance_question_group_assessment_ungrouped',
            closedOnly,
            numOpenInstances,
          })
        }
      />

      <GradingConflictModal
        show={showConflictModal}
        conflictDetailsUrl={conflictDetailsUrl}
        onHide={() => setShowConflictModal(false)}
      />
    </>
  );
}

export function AssessmentQuestionManualGrading({
  search,
  isDevMode,
  ...innerProps
}: AssessmentQuestionManualGradingProps) {
  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <AssessmentQuestionManualGradingInner {...innerProps} />
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

AssessmentQuestionManualGrading.displayName = 'AssessmentQuestionManualGrading';
