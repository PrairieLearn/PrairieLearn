import type { RefObject } from 'react';
import Button from 'react-bootstrap/Button';
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import Dropdown from 'react-bootstrap/Dropdown';
import Form from 'react-bootstrap/Form';

import { AI_GRADING_MODAL_OPEN_EVENT } from '../instanceQuestion.shared.js';

import type {
  InstanceQuestionGradingPanelProps,
  ManualGradingContext,
} from './InstanceQuestionGradingPanel.types.js';

export function InstanceQuestionGradingActions({
  aiGradingMode,
  context,
  disabled,
  editShortcuts,
  gradeButtonRef,
  graders,
  nextButtonRef,
  selectedGroupId,
  showNextShortcut,
  showSubmissionsAssignedToMeOnly,
  skipGradedSubmissions,
  skipText,
  onShowSubmissionsAssignedToMeOnlyChange,
  onSkipGradedSubmissionsChange,
}: {
  aiGradingMode: boolean;
  context: ManualGradingContext;
  disabled: boolean;
  editShortcuts: boolean;
  gradeButtonRef: RefObject<HTMLButtonElement | null>;
  graders: InstanceQuestionGradingPanelProps['graders'];
  nextButtonRef: RefObject<HTMLButtonElement | null>;
  selectedGroupId: string | null;
  showNextShortcut: boolean;
  showSubmissionsAssignedToMeOnly: boolean;
  skipGradedSubmissions: boolean;
  skipText: string;
  onShowSubmissionsAssignedToMeOnlyChange: (value: boolean) => void;
  onSkipGradedSubmissionsChange: (value: boolean) => void;
}) {
  const gradeButton = (
    <Button
      ref={gradeButtonRef}
      id={context === 'main' && !selectedGroupId ? 'grade-button' : undefined}
      type="submit"
      name="__action"
      value="add_manual_grade"
    >
      Grade
      {editShortcuts && (
        <kbd className="pl-kbd kbd-semi-transparent ms-2" aria-hidden="true">
          G
        </kbd>
      )}
    </Button>
  );

  return (
    <li className="list-group-item d-flex align-items-center justify-content-end flex-wrap gap-2">
      <div>
        {context === 'main' && !disabled ? (
          <>
            <Form.Check
              type="checkbox"
              id="skip-graded-submissions"
              name="skip_graded_submissions"
              value="true"
              checked={skipGradedSubmissions}
              label="Skip graded submissions"
              onChange={(event) => onSkipGradedSubmissionsChange(event.target.checked)}
            />
            <Form.Check
              type="checkbox"
              id="show-submissions-assigned-to-me-only"
              name="show_submissions_assigned_to_me_only"
              value="true"
              checked={showSubmissionsAssignedToMeOnly}
              label="Skip submissions not assigned to me"
              onChange={(event) => onShowSubmissionsAssignedToMeOnlyChange(event.target.checked)}
            />
          </>
        ) : (
          <>
            <input
              type="hidden"
              name="skip_graded_submissions"
              value={`${skipGradedSubmissions}`}
            />
            <input
              type="hidden"
              name="show_submissions_assigned_to_me_only"
              value={`${showSubmissionsAssignedToMeOnly}`}
            />
          </>
        )}
      </div>

      <div className="ms-auto d-flex flex-wrap gap-1">
        {!disabled && (
          <>
            {context === 'main' && selectedGroupId ? (
              <Dropdown as={ButtonGroup} id="grade-button-with-options">
                {gradeButton}
                <Dropdown.Toggle aria-label="Grade options" split />
                <Dropdown.Menu align="end">
                  <Dropdown.Item as="button" type="submit" name="__action" value="add_manual_grade">
                    This instance question
                  </Dropdown.Item>
                  <Dropdown.Divider />
                  <Dropdown.Item
                    as="button"
                    type="submit"
                    name="__action"
                    value="add_manual_grade_for_instance_question_group_ungraded"
                  >
                    All ungraded instance questions in submission group
                  </Dropdown.Item>
                  <Dropdown.Item
                    as="button"
                    type="submit"
                    name="__action"
                    value="add_manual_grade_for_instance_question_group"
                  >
                    All instance questions in submission group
                  </Dropdown.Item>
                  <Dropdown.Header>
                    AI can make mistakes. Review submission groups before grading.
                  </Dropdown.Header>
                </Dropdown.Menu>
              </Dropdown>
            ) : (
              gradeButton
            )}

            {context === 'main' && aiGradingMode && (
              <Button
                id="ai-grade-button"
                type="button"
                title=""
                // The AI-grading island imperatively updates this button before this island may hydrate.
                suppressHydrationWarning
                onClick={() => document.dispatchEvent(new CustomEvent(AI_GRADING_MODAL_OPEN_EVENT))}
              >
                <i className="bi bi-stars me-1" aria-hidden="true" />
                AI grade
              </Button>
            )}
          </>
        )}

        <Dropdown as={ButtonGroup}>
          <Button
            ref={nextButtonRef}
            type="submit"
            variant="secondary"
            name="__action"
            value="next_instance_question"
          >
            {skipText}
            {showNextShortcut && (
              <kbd className="pl-kbd kbd-semi-transparent ms-2" aria-hidden="true">
                N
              </kbd>
            )}
          </Button>
          {!disabled && (
            <>
              <Dropdown.Toggle variant="secondary" aria-label="Change assigned grader" split />
              <Dropdown.Menu align="end">
                {graders.map((grader) => (
                  <Dropdown.Item
                    key={grader.id}
                    as="button"
                    type="submit"
                    name="__action"
                    value={`reassign_${grader.id}`}
                  >
                    Assign to {grader.name} ({grader.uid})
                  </Dropdown.Item>
                ))}
                <Dropdown.Item as="button" type="submit" name="__action" value="reassign_nobody">
                  Tag for grading without assigned grader
                </Dropdown.Item>
                <Dropdown.Item as="button" type="submit" name="__action" value="reassign_graded">
                  Tag as graded (keep current grade)
                </Dropdown.Item>
              </Dropdown.Menu>
            </>
          )}
        </Dropdown>
      </div>
    </li>
  );
}
