import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Dropdown from 'react-bootstrap/Dropdown';
import DropdownItem from 'react-bootstrap/DropdownItem';
import FormLabel from 'react-bootstrap/FormLabel';

import { RichSelect, type RichSelectItem } from '@prairielearn/ui';

import type {
  StaffAssessmentQuestion,
  StaffInstanceQuestion,
  StaffInstanceQuestionGroup,
  StaffSubmission,
  StaffUser,
} from '../../../../lib/client/safe-db-types.js';

type ManualGradingContext = 'conflicting' | 'existing' | 'main';

export function InstanceQuestionGradingPanel({
  context,
  aiGradingMode,
  assessmentQuestion,
  instanceQuestion,
  submission,
  graders,

  showInstanceQuestionGroup,
  instanceQuestionGroups,
  selectedInstanceQuestionGroup,

  csrfToken,
}: {
  context: ManualGradingContext;
  aiGradingMode: boolean;
  assessmentQuestion: StaffAssessmentQuestion;
  instanceQuestion: StaffInstanceQuestion;
  submission: StaffSubmission;
  graders: StaffUser[];

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

        <div className="ms-auto">
          <ButtonGroup>
            <Button type="submit" variant="primary" name="__action" value="add_manual_grade">
              Grade
              <kbd className="pl-kbd kbd-semi-transparent ms-2" aria-hidden="true">
                G
              </kbd>
            </Button>
            {selectedGroupId && (
              <Button
                className="dropdown-toggle dropdown-toggle-split"
                aria-label="Grade options"
              />
            )}
          </ButtonGroup>

          {context === 'main' && aiGradingMode && (
            <Button>
              <i className="bi bi-stars me-1" aria-hidden="true" />
              AI grade
            </Button>
          )}

          <ButtonGroup>
            <Button
              variant="secondary"
              type="submit"
              name="__action"
              value="next_instance_question"
            >
              Next
              <kbd className="pl-kbd kbd-semi-transparent ms-2">N</kbd>
            </Button>
            <Dropdown>
              <Dropdown.Toggle
                variant="secondary"
                className="dropdown-toggle dropdown-toggle-split"
                aria-label="Change assigned grader"
              />
              <Dropdown.Menu>
                {graders.map((grader) => (
                  <DropdownItem
                    key={grader.id}
                    as="button"
                    type="submit"
                    name="__action"
                    value={`reassign_${grader.id}`}
                  >
                    Assign to {grader.name} ({grader.uid})
                  </DropdownItem>
                ))}
                <DropdownItem as="button" type="submit" name="__action" value="reassign_nobody">
                  Tag for grading without assigned grader
                </DropdownItem>
                <DropdownItem as="button" type="submit" name="__action" value="reassign_graded">
                  Tag as graded (keep current grade)
                </DropdownItem>
              </Dropdown.Menu>
            </Dropdown>
          </ButtonGroup>
        </div>
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
        id="instance-question-group-toggle"
        items={groupItems}
        value={selectedGroupId ?? 'null'}
        onChange={(selected) => setSelectedGroupId(selected === 'null' ? null : selected)}
      />
    </li>
  );
}
