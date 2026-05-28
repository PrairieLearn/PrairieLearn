import { useMemo, useState } from 'react';
import { Badge, ButtonGroup, Dropdown, DropdownButton } from 'react-bootstrap';

import {
  MAX_BULK_QUESTION_SELECTION,
  type SafeQuestionsPageData,
} from '../../../components/QuestionsTable.shared.js';
import type { PublicCourseInstance } from '../../../lib/client/safe-db-types.js';

import { AddToAssessmentModal } from './AddToAssessmentModal.js';
import { DeleteQuestionsModal } from './DeleteQuestionsModal.js';
import {
  RemoveFromAssessmentModal,
  getSharedAssessmentTargets,
} from './RemoveFromAssessmentModal.js';

export function QuestionSelectionToolbar({
  selectedQuestions,
  clearSelection,
  courseInstances,
  currentCourseInstanceId,
  urlPrefix,
}: {
  selectedQuestions: SafeQuestionsPageData[];
  clearSelection: () => void;
  courseInstances: PublicCourseInstance[];
  currentCourseInstanceId?: string;
  urlPrefix: string;
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const questionIds = selectedQuestions.map((question) => question.id);
  const sharedAssessmentTargets = useMemo(
    () => getSharedAssessmentTargets(selectedQuestions, courseInstances),
    [selectedQuestions, courseInstances],
  );
  const selectionLimitExceeded = selectedQuestions.length > MAX_BULK_QUESTION_SELECTION;
  const selectionLimitMessage = `Select ${MAX_BULK_QUESTION_SELECTION} or fewer questions to use bulk actions`;

  return (
    <>
      <div className="d-flex align-items-center gap-2">
        {selectionLimitExceeded && (
          <Badge bg="warning" text="dark">
            {selectionLimitMessage}
          </Badge>
        )}
        <DropdownButton
          as={ButtonGroup}
          title="Manage questions"
          size="sm"
          variant="light"
          disabled={selectionLimitExceeded}
        >
          <Dropdown.Item onClick={() => setShowAddModal(true)}>
            <i className="bi bi-plus-square me-2" aria-hidden="true" />
            Add to assessment
          </Dropdown.Item>
          <Dropdown.Item
            disabled={sharedAssessmentTargets.length === 0}
            title={
              sharedAssessmentTargets.length === 0
                ? 'Selected questions do not share an assessment'
                : undefined
            }
            onClick={() => setShowRemoveModal(true)}
          >
            <i className="bi bi-dash-square me-2" aria-hidden="true" />
            Remove from assessment
          </Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item className="text-danger" onClick={() => setShowDeleteModal(true)}>
            <i className="bi bi-trash3 me-2" aria-hidden="true" />
            Delete
          </Dropdown.Item>
        </DropdownButton>
      </div>

      <AddToAssessmentModal
        show={showAddModal}
        selectedQuestions={selectedQuestions}
        questionIds={questionIds}
        courseInstances={courseInstances}
        currentCourseInstanceId={currentCourseInstanceId}
        urlPrefix={urlPrefix}
        clearSelection={clearSelection}
        onHide={() => setShowAddModal(false)}
      />
      <RemoveFromAssessmentModal
        show={showRemoveModal}
        selectedQuestions={selectedQuestions}
        questionIds={questionIds}
        sharedAssessmentTargets={sharedAssessmentTargets}
        urlPrefix={urlPrefix}
        clearSelection={clearSelection}
        onHide={() => setShowRemoveModal(false)}
      />
      <DeleteQuestionsModal
        show={showDeleteModal}
        selectedQuestions={selectedQuestions}
        questionIds={questionIds}
        courseInstances={courseInstances}
        urlPrefix={urlPrefix}
        clearSelection={clearSelection}
        onHide={() => setShowDeleteModal(false)}
      />
    </>
  );
}
