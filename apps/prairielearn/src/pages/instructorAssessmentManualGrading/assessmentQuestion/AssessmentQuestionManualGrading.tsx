import { QueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'preact/compat';

import type { AiGradingGeneralStats } from '../../../ee/lib/ai-grading/types.js';
import { NuqsAdapter } from '../../../lib/client/nuqs.js';
import type {
  PageContextWithAuthzData,
  StaffCourseInstanceContext,
} from '../../../lib/client/page-context.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import type { AssessmentQuestion, InstanceQuestionGroup } from '../../../lib/db-types.js';
import type { RubricData } from '../../../lib/manualGrading.types.js';

import { GroupInfoModal } from './GroupInfoModal.js';
import type { InstanceQuestionRowWithAIGradingStats as InstanceQuestionRow } from './assessmentQuestion.types.js';
import { AssessmentQuestionTable } from './assessmentQuestionTable.js';

const queryClient = new QueryClient();

export interface AssessmentQuestionManualGradingProps {
  authzData: PageContextWithAuthzData['authz_data'];
  course: StaffCourseInstanceContext['course'];
  courseInstance: StaffCourseInstanceContext['course_instance'];
  csrfToken: string;
  instanceQuestions: InstanceQuestionRow[];
  urlPrefix: string;
  assessmentId: string;
  assessmentQuestionId: string;
  assessmentQuestion: AssessmentQuestion;
  assessmentTid: string;
  questionQid: string;
  aiGradingMode: boolean;
  groupWork: boolean;
  rubricData: RubricData | null;
  instanceQuestionGroups: InstanceQuestionGroup[];
  courseStaff: { user_id: string; name: string | null; uid: string }[];
  aiGradingStats: AiGradingGeneralStats | null;
  numOpenInstances: number;
  search: string;
  isDevMode: boolean;
}

type AssessmentQuestionManualGradingInnerProps = Omit<
  AssessmentQuestionManualGradingProps,
  'search' | 'isDevMode'
>;

function AssessmentQuestionManualGradingInner({
  authzData,
  instanceQuestions,
  course,
  courseInstance,
  urlPrefix,
  csrfToken,
  assessmentId,
  assessmentQuestionId,
  assessmentQuestion,
  assessmentTid,
  questionQid,
  aiGradingMode,
  groupWork,
  rubricData,
  instanceQuestionGroups,
  courseStaff,
  aiGradingStats,
  numOpenInstances,
}: AssessmentQuestionManualGradingInnerProps) {
  const [showSelectedModal, setShowSelectedModal] = useState(false);
  const [showAllModal, setShowAllModal] = useState(false);
  const [showUngroupedModal, setShowUngroupedModal] = useState(false);
  const [selectedIdsForGrouping, setSelectedIdsForGrouping] = useState<string[]>([]);

  const handleShowSelectedModal = (ids: string[]) => {
    setSelectedIdsForGrouping(ids);
    setShowSelectedModal(true);
  };

  const groupSubmissionMutation = useMutation<
    { jobSequenceId?: string; success: boolean },
    Error,
    { action: string; closedOnly: boolean; instanceQuestionIds?: string[] }
  >({
    mutationFn: async ({ action, closedOnly, instanceQuestionIds }) => {
      const requestBody: Record<string, any> = {
        __csrf_token: csrfToken,
        __action: action,
      };

      if (action === 'batch_action') {
        requestBody.batch_action = 'ai_instance_question_group_selected';
        requestBody.instance_question_id = instanceQuestionIds || [];
      }

      if (numOpenInstances > 0) {
        requestBody.closed_instance_questions_only = closedOnly;
      }

      const response = await fetch('', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error('Request failed with status ' + response.status);
      }

      const data = await response.json();
      return data as { jobSequenceId?: string; success: boolean };
    },
    onSuccess: (data) => {
      if (data.jobSequenceId) {
        window.location.href = `${urlPrefix}/jobSequence/${data.jobSequenceId}`;
      }
    },
    onError: (error) => {
      console.error('Group submission failed:', error);
    },
  });

  return (
    <>
      <AssessmentQuestionTable
        authzData={authzData}
        course={course}
        courseInstance={courseInstance}
        csrfToken={csrfToken}
        instanceQuestions={instanceQuestions}
        urlPrefix={urlPrefix}
        assessmentId={assessmentId}
        assessmentQuestionId={assessmentQuestionId}
        assessmentQuestion={assessmentQuestion}
        assessmentTid={assessmentTid}
        questionQid={questionQid}
        aiGradingMode={aiGradingMode}
        groupWork={groupWork}
        rubricData={rubricData}
        instanceQuestionGroups={instanceQuestionGroups}
        courseStaff={courseStaff}
        aiGradingStats={aiGradingStats}
        onShowGroupSelectedModal={handleShowSelectedModal}
        onShowGroupAllModal={() => setShowAllModal(true)}
        onShowGroupUngroupedModal={() => setShowUngroupedModal(true)}
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
          })
        }
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
