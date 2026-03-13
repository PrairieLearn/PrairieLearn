import { QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { RubricSettings } from '../../../components/RubricSettings.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';

import { InstanceQuestionGradingPanel } from './InstanceQuestionGradingPanel.js';
import type { GradingContextData, RubricQueryData } from './trpc.js';
import { createManualGradingInstanceQuestionTrpcClient } from './utils/trpc-client.js';
import { TRPCProvider, useTRPC } from './utils/trpc-context.js';

interface ManualGradingInstanceQuestionPageProps {
  initialRubricData: RubricQueryData;
  initialGradingContext: GradingContextData;
  trpcCsrfToken: string;
  csrfToken: string;
  hasCourseInstancePermissionEdit: boolean;
  assessmentInstanceOpen: boolean;
  breadcrumb: {
    urlPrefix: string;
    assessmentId: string;
    assessmentQuestionId: string;
    questionNumber: number;
    questionTitle: string;
  };
  aiGradingEnabled: boolean;
  aiGradingMode: boolean;
  skipGradedSubmissions: boolean;
  showSubmissionsAssignedToMeOnly: boolean;
  questionContainerHtml: string;
  personalNotesPanelHtml: string;
  instructorInfoPanelHtml: string;
}

export function ManualGradingInstanceQuestionPage({
  initialRubricData,
  initialGradingContext,
  trpcCsrfToken,
  ...rest
}: ManualGradingInstanceQuestionPageProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false } },
      }),
  );
  const [trpcClient] = useState(() => createManualGradingInstanceQuestionTrpcClient(trpcCsrfToken));

  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <ManualGradingInstanceQuestionPageInner
          initialRubricData={initialRubricData}
          initialGradingContext={initialGradingContext}
          {...rest}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

ManualGradingInstanceQuestionPage.displayName = 'ManualGradingInstanceQuestionPage';

type InnerProps = Omit<ManualGradingInstanceQuestionPageProps, 'trpcCsrfToken'>;

function ManualGradingInstanceQuestionPageInner({
  initialRubricData,
  initialGradingContext,
  csrfToken,
  hasCourseInstancePermissionEdit,
  assessmentInstanceOpen,
  breadcrumb,
  aiGradingEnabled,
  aiGradingMode,
  skipGradedSubmissions,
  showSubmissionsAssignedToMeOnly,
  questionContainerHtml,
  personalNotesPanelHtml,
  instructorInfoPanelHtml,
}: InnerProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const conflictGradingJobId =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('conflict_grading_job_id')
      : null;

  const { data: rubricData } = useQuery({
    ...trpc.rubricData.queryOptions(),
    initialData: initialRubricData,
    staleTime: Infinity,
  });

  const { data: gradingContext } = useQuery({
    ...trpc.gradingContext.queryOptions({
      conflictGradingJobId,
    }),
    initialData: initialGradingContext,
    staleTime: Infinity,
  });

  const [rubricSettingsOpen, setRubricSettingsOpen] = useState(false);

  const handleRubricSaved = useCallback(
    (_data: { rubric_data: RubricData | null; modifiedAt: string }) => {
      void queryClient.invalidateQueries({
        queryKey: trpc.rubricData.queryKey(),
      });
    },
    [queryClient, trpc],
  );

  return (
    <>
      <h1 className="visually-hidden">Instance Question Manual Grading</h1>

      {assessmentInstanceOpen && (
        <div className="alert alert-danger" role="alert">
          This assessment instance is still open. Student may still be able to submit new answers.
        </div>
      )}

      {gradingContext.hasNon100CreditSubmissions && (
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
          hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
          assessmentQuestion={rubricData.assessmentQuestion}
          rubricData={rubricData.rubricData}
          csrfToken={csrfToken}
          aiGradingStats={rubricData.aiGradingStats}
          context={gradingContext.rubricSettingsContext}
          settingsOpen={rubricSettingsOpen}
          onRubricSaved={handleRubricSaved}
          onToggleSettingsOpen={() => setRubricSettingsOpen((prev) => !prev)}
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
              csrfToken={csrfToken}
              modifiedAt={rubricData.modifiedAt}
              submissionId={gradingContext.submissionId}
              instanceQuestionId={gradingContext.instanceQuestionId}
              maxAutoPoints={gradingContext.maxAutoPoints}
              maxManualPoints={gradingContext.maxManualPoints}
              maxPoints={gradingContext.maxPoints}
              autoPoints={gradingContext.autoPoints}
              manualPoints={gradingContext.manualPoints}
              totalPoints={gradingContext.totalPoints}
              submissionFeedback={gradingContext.submissionFeedback}
              rubricData={rubricData.rubricData}
              rubricGrading={rubricData.rubricGrading}
              openIssues={gradingContext.openIssues}
              graders={gradingContext.graders}
              aiGradingInfo={gradingContext.aiGradingInfo}
              hasEditPermission={gradingContext.hasEditPermission}
              showInstanceQuestionGroup={gradingContext.showInstanceQuestionGroup}
              selectedInstanceQuestionGroup={gradingContext.selectedInstanceQuestionGroup}
              instanceQuestionGroups={gradingContext.instanceQuestionGroups}
              skipGradedSubmissions={skipGradedSubmissions}
              showSubmissionsAssignedToMeOnly={
                gradingContext.effectiveShowSubmissionsAssignedToMeOnly
                  ? showSubmissionsAssignedToMeOnly
                  : false
              }
              graderGuidelinesRendered={rubricData.graderGuidelinesRendered}
              conflictGradingJob={gradingContext.conflictGradingJob}
              conflictGradingJobDateFormatted={gradingContext.conflictGradingJobDateFormatted}
              conflictLastGraderName={gradingContext.conflictLastGraderName}
              existingDateFormatted={gradingContext.existingDateFormatted}
              displayTimezone={gradingContext.displayTimezone}
              onToggleRubricSettings={() => setRubricSettingsOpen((prev) => !prev)}
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
