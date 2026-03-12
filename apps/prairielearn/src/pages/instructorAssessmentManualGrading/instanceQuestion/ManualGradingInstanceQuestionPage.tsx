import { useCallback, useState } from 'react';

import { RubricSettings } from '../../../components/RubricSettings.js';
import type {
  AiGradingGeneralStats,
  InstanceQuestionAIGradingInfo,
} from '../../../ee/lib/ai-grading/types.js';
import type {
  StaffAssessmentQuestion,
  StaffInstanceQuestionGroup,
  StaffUser,
} from '../../../lib/client/safe-db-types.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';

import { InstanceQuestionGradingPanel } from './InstanceQuestionGradingPanel.js';

interface ManualGradingInstanceQuestionPageProps {
  /** Shared state (lifted from children) */
  initialRubricData: RubricData | null;
  initialModifiedAt: string;

  /** RubricSettings props */
  rubricSettings: {
    hasCourseInstancePermissionEdit: boolean;
    assessmentQuestion: StaffAssessmentQuestion;
    csrfToken: string;
    aiGradingStats: AiGradingGeneralStats | null;
    context: Record<string, any>;
  };

  /** InstanceQuestionGradingPanel props (minus rubricData/modifiedAt) */
  gradingPanel: {
    csrfToken: string;
    submissionId: string;
    instanceQuestionId: string;
    maxAutoPoints: number;
    maxManualPoints: number;
    maxPoints: number;
    autoPoints: number;
    manualPoints: number;
    totalPoints: number;
    submissionFeedback: string | null;
    rubricGrading: {
      adjust_points: number;
      rubric_items: Record<string, { score: number }> | null;
    } | null;
    openIssues: { id: string; open: boolean | null }[];
    graders: StaffUser[] | null;
    aiGradingInfo?: InstanceQuestionAIGradingInfo;
    hasEditPermission: boolean;
    showInstanceQuestionGroup: boolean;
    selectedInstanceQuestionGroup: StaffInstanceQuestionGroup | null;
    instanceQuestionGroups?: StaffInstanceQuestionGroup[];
    skipGradedSubmissions: boolean;
    showSubmissionsAssignedToMeOnly: boolean;
    graderGuidelinesRendered: string | null;
    conflictGradingJob: {
      grader_name: string | null;
      auto_points: number | null;
      manual_points: number | null;
      score: number | null;
      feedback: Record<string, any> | null;
    } | null;
    conflictGradingJobDateFormatted: string | null;
    conflictLastGraderName: string | null;
    existingDateFormatted: string | null;
    displayTimezone: string;
  };

  /** Page-level content */
  assessmentInstanceOpen: boolean;
  hasNon100CreditSubmissions: boolean;
  breadcrumb: {
    urlPrefix: string;
    assessmentId: string;
    assessmentQuestionId: string;
    questionNumber: number;
    questionTitle: string;
  };
  aiGradingEnabled: boolean;
  aiGradingMode: boolean;
  csrfToken: string;

  /** Pre-rendered HTML strings */
  questionContainerHtml: string;
  personalNotesPanelHtml: string;
  instructorInfoPanelHtml: string;
}

export function ManualGradingInstanceQuestionPage({
  initialRubricData,
  initialModifiedAt,
  rubricSettings,
  gradingPanel,
  assessmentInstanceOpen,
  hasNon100CreditSubmissions,
  breadcrumb,
  aiGradingEnabled,
  aiGradingMode,
  csrfToken,
  questionContainerHtml,
  personalNotesPanelHtml,
  instructorInfoPanelHtml,
}: ManualGradingInstanceQuestionPageProps) {
  const [rubricData, setRubricData] = useState(initialRubricData);
  const [modifiedAt, setModifiedAt] = useState(initialModifiedAt);

  const handleRubricSaved = useCallback(
    (data: { rubric_data: RubricData | null; modifiedAt: string }) => {
      setRubricData(data.rubric_data);
      setModifiedAt(data.modifiedAt);
    },
    [],
  );

  return (
    <>
      <h1 className="visually-hidden">Instance Question Manual Grading</h1>

      {assessmentInstanceOpen && (
        <div className="alert alert-danger" role="alert">
          This assessment instance is still open. Student may still be able to submit new answers.
        </div>
      )}

      {hasNon100CreditSubmissions && (
        <div className="alert alert-warning" role="alert">
          There are submissions in this assessment instance with credit different than 100%.
          Submitting a manual grade will override any credit limits set for this assessment
          instance.
        </div>
      )}

      <div className="d-flex flex-row justify-content-between align-items-center mb-3 gap-2">
        <nav aria-label="breadcrumb">
          <ol className="breadcrumb mb-0">
            <li className="breadcrumb-item">
              <a
                href={`${breadcrumb.urlPrefix}/assessment/${breadcrumb.assessmentId}/manual_grading`}
              >
                Manual grading
              </a>
            </li>
            <li className="breadcrumb-item">
              <a
                href={`${breadcrumb.urlPrefix}/assessment/${breadcrumb.assessmentId}/manual_grading/assessment_question/${breadcrumb.assessmentQuestionId}`}
              >
                Question {breadcrumb.questionNumber}. {breadcrumb.questionTitle}
              </a>
            </li>
            <li className="breadcrumb-item active" aria-current="page">
              Student submission
            </li>
          </ol>
        </nav>

        {aiGradingEnabled && (
          <form method="POST" className="card px-3 py-2 mb-0">
            <input type="hidden" name="__action" value="toggle_ai_grading_mode" />
            <input type="hidden" name="__csrf_token" value={csrfToken} />
            <div className="form-check form-switch mb-0">
              <input
                className="form-check-input"
                type="checkbox"
                role="switch"
                id="switchCheckDefault"
                defaultChecked={aiGradingMode}
                onChange={(e) => {
                  setTimeout(() => e.target.form?.submit(), 150);
                }}
              />
              <label className="form-check-label" htmlFor="switchCheckDefault">
                <i className="bi bi-stars" /> AI grading mode
              </label>
            </div>
          </form>
        )}
      </div>

      <div className="mb-3">
        <RubricSettings
          hasCourseInstancePermissionEdit={rubricSettings.hasCourseInstancePermissionEdit}
          assessmentQuestion={rubricSettings.assessmentQuestion}
          rubricData={rubricData}
          csrfToken={rubricSettings.csrfToken}
          aiGradingStats={rubricSettings.aiGradingStats}
          context={rubricSettings.context}
          onRubricSaved={handleRubricSaved}
        />
      </div>

      <div className="row">
        <div className="col-lg-8 col-12">
          {/* eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml -- server-side pre-rendered HTML */}
          <div dangerouslySetInnerHTML={{ __html: questionContainerHtml }} />
        </div>

        <div className="col-lg-4 col-12">
          <div className="card mb-4 border-info">
            <div className="card-header bg-info">Grading</div>
            <InstanceQuestionGradingPanel
              {...gradingPanel}
              rubricData={rubricData}
              modifiedAt={modifiedAt}
            />
          </div>

          {personalNotesPanelHtml && (
            // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml -- server-side pre-rendered HTML
            <div dangerouslySetInnerHTML={{ __html: personalNotesPanelHtml }} />
          )}

          {/* eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml -- server-side pre-rendered HTML */}
          <div dangerouslySetInnerHTML={{ __html: instructorInfoPanelHtml }} />
        </div>
      </div>
    </>
  );
}

ManualGradingInstanceQuestionPage.displayName = 'ManualGradingInstanceQuestionPage';
