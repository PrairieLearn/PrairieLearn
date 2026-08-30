import { useState } from 'react';
import FormLabel from 'react-bootstrap/FormLabel';

import { RichSelect, type RichSelectItem } from '@prairielearn/ui';

import type {
  StaffAssessmentQuestion,
  StaffInstanceQuestion,
  StaffInstanceQuestionGroup,
  StaffSubmission,
} from '../../../../lib/client/safe-db-types.js';

type ManualGradingContext = 'conflicting' | 'existing' | 'main';

export function InstanceQuestionGradingPanel({
  context,
  assessmentQuestion,
  instanceQuestion,
  submission,

  showInstanceQuestionGroup,
  instanceQuestionGroups,
  selectedInstanceQuestionGroup,

  csrfToken,
}: {
  context: ManualGradingContext;
  assessmentQuestion: StaffAssessmentQuestion;
  instanceQuestion: StaffInstanceQuestion;
  submission: StaffSubmission;

  showInstanceQuestionGroup: boolean;
  instanceQuestionGroups: StaffInstanceQuestionGroup[];
  selectedInstanceQuestionGroup: StaffInstanceQuestionGroup | null;

  csrfToken: string;
}) {
  const [selectedGroupId, setSelectedGroupId] = useState(selectedInstanceQuestionGroup?.id ?? null);

  return (
    <form method="POST">
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <input type="hidden" name="modified_at" value={instanceQuestion.modified_at.toISOString()} />
      <input type="hidden" name="submissions_id" value={submission.id} />

      <ul className="list-group list-group-flush">
        {
          // Percentage-based grading is only suitable if the question has points.
          assessmentQuestion.max_points && (
            <li className="list-group-item d-flex justify-content-center">
              <span>Points</span>
              <div className="form-check form-switch mx-2">
                <input className="form-check-input" name="use_score_perc" type="checkbox" />
              </div>
              <span>Percentage</span>
            </li>
          )
        }

        {showInstanceQuestionGroup && context === 'main' && (
          <InstanceQuestionGroup
            assessmentQuestion={assessmentQuestion}
            instanceQuestionGroups={instanceQuestionGroups}
            selectedGroupId={selectedGroupId}
            setSelectedGroupId={setSelectedGroupId}
          />
        )}
      </ul>
    </form>
  );
}

InstanceQuestionGradingPanel.displayName = 'InstanceQuestionGradingPanel';

function InstanceQuestionGroup({
  assessmentQuestion,
  instanceQuestionGroups,
  selectedGroupId,
  setSelectedGroupId,
}: {
  assessmentQuestion: StaffAssessmentQuestion;
  instanceQuestionGroups: StaffInstanceQuestionGroup[];
  selectedGroupId: string | null;
  setSelectedGroupId: (id: string | null) => void;
}) {
  const displayedGroups = [
    ...instanceQuestionGroups,
    {
      assessment_question_id: assessmentQuestion.id,
      instance_question_group_name: 'No group',
      instance_question_group_description: 'No group assigned',
      id: null,
    },
  ];

  const groupItems: RichSelectItem[] = displayedGroups.map((group) => ({
    value: group.id ?? 'null',
    label: group.instance_question_group_name,
    description: group.instance_question_group_description,
  }));

  return (
    <li className="list-group-item align-items-center">
      <FormLabel htmlFor="instance-question-group-toggle">Submission Group</FormLabel>
      <RichSelect
        items={groupItems}
        value={selectedGroupId ?? 'null'}
        onChange={(selected) => setSelectedGroupId(selected === 'null' ? null : selected)}
      />
    </li>
  );
}
