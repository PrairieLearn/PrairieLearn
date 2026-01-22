import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Dropdown } from 'react-bootstrap';

import { NuqsAdapter } from '@prairielearn/ui';

import {
  AI_GRADING_MODELS,
  AI_GRADING_MODEL_ID_TO_NAME,
  type AiGradingModelId,
  DEFAULT_AI_GRADING_MODEL,
} from '../../../ee/lib/ai-grading/ai-grading-models.shared.js';
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
  initialOngoingJobSequenceTokens,
  numOpenInstances,
  questionTitle,
  questionNumber,
}: AssessmentQuestionManualGradingInnerProps) {
  const queryClient = useQueryClient();
  const [groupInfoModalState, setGroupInfoModalState] = useState<GroupInfoModalState>(null);
  const [conflictModalState, setConflictModalState] = useState<ConflictModalState>(null);

  const [aiGradingMode, setAiGradingMode] = useState(initialAiGradingMode);
  const [aiGradingModel, setAiGradingModel] = useState<AiGradingModelId>(
    (assessmentQuestion.ai_grading_model as AiGradingModelId | null) ?? DEFAULT_AI_GRADING_MODEL,
  );

  const {
    groupSubmissionMutation,
    setAiGradingModeMutation,
    setAiGradingModelMutation,
    ...mutations
  } = useManualGradingActions({
    csrfToken,
    courseInstanceId: courseInstance.id,
  });

  return (
    <>
      {setAiGradingModeMutation.error && (
        <Alert
          variant="danger"
          className="mb-3"
          dismissible
          onClose={() => setAiGradingModeMutation.reset()}
        >
          <strong>Error:</strong> {setAiGradingModeMutation.error.message}
        </Alert>
      )}

      {setAiGradingModelMutation.error && (
        <Alert
          variant="danger"
          className="mb-3"
          dismissible
          onClose={() => setAiGradingModelMutation.reset()}
        >
          <strong>Error:</strong> {setAiGradingModelMutation.error.message}
        </Alert>
      )}

      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
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
          <div className="d-flex flex-wrap gap-2 justify-content-end">
            {aiGradingMode && (
              <Dropdown>
                <Dropdown.Toggle
                  variant="light"
                  className="card px-3 py-2 mb-0 d-flex flex-row align-items-center text-decoration-none text-body"
                >
                  <i className="bi bi-stars" aria-hidden="true" />
                  <span className="ms-1 text-wrap text-left">
                    {AI_GRADING_MODEL_ID_TO_NAME[aiGradingModel]}
                  </span>
                </Dropdown.Toggle>
                <Dropdown.Menu align="end">
                  <p className="my-0 text-muted px-3">AI grader model</p>
                  <Dropdown.Divider />
                  {AI_GRADING_MODELS.map((model) => (
                    <Dropdown.Item
                      key={model.modelId}
                      active={aiGradingModel === model.modelId}
                      onClick={() =>
                        setAiGradingModelMutation.mutate(model.modelId, {
                          onSuccess: () => {
                            setAiGradingModel(model.modelId);
                          },
                        })
                      }
                    >
                      {model.name}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>
            )}
            <div className="card px-3 py-2 mb-0">
              <div className="form-check form-switch mb-0">
                <input
                  className="form-check-input"
                  type="checkbox"
                  role="switch"
                  id="switchCheckDefault"
                  checked={aiGradingMode}
                  disabled={setAiGradingModeMutation.isPending || !hasCourseInstancePermissionEdit}
                  onChange={() =>
                    setAiGradingModeMutation.mutate(!aiGradingMode, {
                      onSuccess: () => {
                        setAiGradingMode((prev) => !prev);
                      },
                    })
                  }
                />
                <label className="form-check-label" htmlFor="switchCheckDefault">
                  <i className="bi bi-stars" />
                  AI grading mode
                </label>
              </div>
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
        aiGradingModel={aiGradingModel}
        rubricData={rubricData}
        instanceQuestionGroups={instanceQuestionGroups}
        courseStaff={courseStaff}
        aiGradingStats={aiGradingStats}
        mutations={mutations}
        initialOngoingJobSequenceTokens={initialOngoingJobSequenceTokens}
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
