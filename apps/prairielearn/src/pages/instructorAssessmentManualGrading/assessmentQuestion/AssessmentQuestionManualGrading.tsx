import { QueryClient } from '@tanstack/react-query';
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

export function AssessmentQuestionManualGrading({
  authzData,
  search,
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
  isDevMode,
}: AssessmentQuestionManualGradingProps) {
  const [showSelectedModal, setShowSelectedModal] = useState(false);
  const [showAllModal, setShowAllModal] = useState(false);
  const [showUngroupedModal, setShowUngroupedModal] = useState(false);
  const [selectedIdsForGrouping, setSelectedIdsForGrouping] = useState<string[]>([]);

  const handleShowSelectedModal = (ids: string[]) => {
    setSelectedIdsForGrouping(ids);
    setShowSelectedModal(true);
  };

  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
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
            csrfToken={csrfToken}
            show={showSelectedModal}
            selectedIds={selectedIdsForGrouping}
            onHide={() => setShowSelectedModal(false)}
          />

          <GroupInfoModal
            modalFor="all"
            numOpenInstances={numOpenInstances}
            csrfToken={csrfToken}
            show={showAllModal}
            onHide={() => setShowAllModal(false)}
          />

          <GroupInfoModal
            modalFor="ungrouped"
            numOpenInstances={numOpenInstances}
            csrfToken={csrfToken}
            show={showUngroupedModal}
            onHide={() => setShowUngroupedModal(false)}
          />
        </>
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

AssessmentQuestionManualGrading.displayName = 'AssessmentQuestionManualGrading';
