import { useState } from 'react';
import { Badge, Button, ButtonGroup, Dropdown, DropdownButton } from 'react-bootstrap';

import {
  MAX_BULK_QUESTION_SELECTION,
  type SafeQuestionsPageData,
} from '../../../components/QuestionsTable.shared.js';
import type {
  PublicCourseInstance,
  PublicTag,
  PublicTopic,
} from '../../../lib/client/safe-db-types.js';

import { AssessmentMembershipModal } from './AssessmentMembershipModal.js';
import { ChangeTopicModal } from './ChangeTopicModal.js';
import { DeleteQuestionsModal } from './DeleteQuestionsModal.js';
import { UpdateTagsModal } from './UpdateTagsModal.js';

export function QuestionSelectionToolbar({
  selectedQuestions,
  clearSelection,
  topics,
  tags,
  courseInstances,
  currentCourseInstanceId,
  trimSelection,
  urlPrefix,
  onActionSuccess,
}: {
  selectedQuestions: SafeQuestionsPageData[];
  clearSelection: () => void;
  topics: PublicTopic[];
  tags: PublicTag[];
  courseInstances: PublicCourseInstance[];
  currentCourseInstanceId?: string;
  trimSelection: (count: number) => void;
  urlPrefix: string;
  onActionSuccess: (message: string) => void;
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [showChangeTopicModal, setShowChangeTopicModal] = useState(false);
  const [showAddTagsModal, setShowAddTagsModal] = useState(false);
  const [showRemoveTagsModal, setShowRemoveTagsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const questionIds = selectedQuestions.map((question) => question.id);
  const selectionLimitExceeded = selectedQuestions.length > MAX_BULK_QUESTION_SELECTION;
  const selectionLimitMessage = `Select ${MAX_BULK_QUESTION_SELECTION} or fewer questions to use bulk actions`;

  return (
    <>
      <div className="d-flex align-items-center gap-2">
        {selectionLimitExceeded && (
          <>
            <Badge bg="warning" text="dark">
              {selectionLimitMessage}
            </Badge>
            <Button
              size="sm"
              variant="link"
              onClick={() => trimSelection(MAX_BULK_QUESTION_SELECTION)}
            >
              Trim selection to {MAX_BULK_QUESTION_SELECTION}
            </Button>
          </>
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
            Add to assessments
          </Dropdown.Item>
          <Dropdown.Item onClick={() => setShowRemoveModal(true)}>
            <i className="bi bi-dash-square me-2" aria-hidden="true" />
            Remove from assessments
          </Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item onClick={() => setShowChangeTopicModal(true)}>
            <i className="bi bi-collection me-2" aria-hidden="true" />
            Change topic
          </Dropdown.Item>
          <Dropdown.Item onClick={() => setShowAddTagsModal(true)}>
            <i className="bi bi-bookmark-plus me-2" aria-hidden="true" />
            Add tags
          </Dropdown.Item>
          <Dropdown.Item onClick={() => setShowRemoveTagsModal(true)}>
            <i className="bi bi-bookmark-dash me-2" aria-hidden="true" />
            Remove tags
          </Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item className="text-danger" onClick={() => setShowDeleteModal(true)}>
            <i className="bi bi-trash3 me-2" aria-hidden="true" />
            Delete
          </Dropdown.Item>
        </DropdownButton>
      </div>

      <AssessmentMembershipModal
        mode="add"
        show={showAddModal}
        selectedQuestions={selectedQuestions}
        questionIds={questionIds}
        courseInstances={courseInstances}
        currentCourseInstanceId={currentCourseInstanceId}
        urlPrefix={urlPrefix}
        clearSelection={clearSelection}
        onActionSuccess={onActionSuccess}
        onHide={() => setShowAddModal(false)}
      />
      <AssessmentMembershipModal
        mode="remove"
        show={showRemoveModal}
        selectedQuestions={selectedQuestions}
        questionIds={questionIds}
        courseInstances={courseInstances}
        currentCourseInstanceId={currentCourseInstanceId}
        urlPrefix={urlPrefix}
        clearSelection={clearSelection}
        onActionSuccess={onActionSuccess}
        onHide={() => setShowRemoveModal(false)}
      />
      <ChangeTopicModal
        show={showChangeTopicModal}
        selectedQuestions={selectedQuestions}
        questionIds={questionIds}
        topics={topics}
        urlPrefix={urlPrefix}
        clearSelection={clearSelection}
        onActionSuccess={onActionSuccess}
        onHide={() => setShowChangeTopicModal(false)}
      />
      <UpdateTagsModal
        mode="add"
        show={showAddTagsModal}
        selectedQuestions={selectedQuestions}
        questionIds={questionIds}
        tags={tags}
        urlPrefix={urlPrefix}
        clearSelection={clearSelection}
        onActionSuccess={onActionSuccess}
        onHide={() => setShowAddTagsModal(false)}
      />
      <UpdateTagsModal
        mode="remove"
        show={showRemoveTagsModal}
        selectedQuestions={selectedQuestions}
        questionIds={questionIds}
        tags={tags}
        urlPrefix={urlPrefix}
        clearSelection={clearSelection}
        onActionSuccess={onActionSuccess}
        onHide={() => setShowRemoveTagsModal(false)}
      />
      <DeleteQuestionsModal
        show={showDeleteModal}
        selectedQuestions={selectedQuestions}
        questionIds={questionIds}
        urlPrefix={urlPrefix}
        clearSelection={clearSelection}
        onActionSuccess={onActionSuccess}
        onHide={() => setShowDeleteModal(false)}
      />
    </>
  );
}
