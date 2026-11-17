import { Badge, Button, ButtonGroup, Dropdown, DropdownButton } from 'react-bootstrap';

import { useModalState } from '@prairielearn/ui';

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
  const addAssessmentModal = useModalState<SafeQuestionsPageData[]>();
  const removeAssessmentModal = useModalState<SafeQuestionsPageData[]>();
  const changeTopicModal = useModalState<SafeQuestionsPageData[]>();
  const addTagsModal = useModalState<SafeQuestionsPageData[]>();
  const removeTagsModal = useModalState<SafeQuestionsPageData[]>();
  const deleteModal = useModalState<SafeQuestionsPageData[]>();
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
          <Dropdown.Item onClick={() => addAssessmentModal.showWithData(selectedQuestions)}>
            <i className="bi bi-plus-square me-2" aria-hidden="true" />
            Add to assessments
          </Dropdown.Item>
          <Dropdown.Item onClick={() => removeAssessmentModal.showWithData(selectedQuestions)}>
            <i className="bi bi-dash-square me-2" aria-hidden="true" />
            Remove from assessments
          </Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item onClick={() => changeTopicModal.showWithData(selectedQuestions)}>
            <i className="bi bi-collection me-2" aria-hidden="true" />
            Change topic
          </Dropdown.Item>
          <Dropdown.Item onClick={() => addTagsModal.showWithData(selectedQuestions)}>
            <i className="bi bi-bookmark-plus me-2" aria-hidden="true" />
            Add tags
          </Dropdown.Item>
          <Dropdown.Item onClick={() => removeTagsModal.showWithData(selectedQuestions)}>
            <i className="bi bi-bookmark-dash me-2" aria-hidden="true" />
            Remove tags
          </Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item
            className="text-danger"
            onClick={() => deleteModal.showWithData(selectedQuestions)}
          >
            <i className="bi bi-trash3 me-2" aria-hidden="true" />
            Delete
          </Dropdown.Item>
        </DropdownButton>
      </div>

      {addAssessmentModal.data && (
        <AssessmentMembershipModal
          mode="add"
          show={addAssessmentModal.show}
          selectedQuestions={addAssessmentModal.data}
          questionIds={addAssessmentModal.data.map((q) => q.id)}
          courseInstances={courseInstances}
          currentCourseInstanceId={currentCourseInstanceId}
          urlPrefix={urlPrefix}
          clearSelection={clearSelection}
          onActionSuccess={onActionSuccess}
          onHide={addAssessmentModal.hide}
        />
      )}
      {removeAssessmentModal.data && (
        <AssessmentMembershipModal
          mode="remove"
          show={removeAssessmentModal.show}
          selectedQuestions={removeAssessmentModal.data}
          questionIds={removeAssessmentModal.data.map((q) => q.id)}
          courseInstances={courseInstances}
          currentCourseInstanceId={currentCourseInstanceId}
          urlPrefix={urlPrefix}
          clearSelection={clearSelection}
          onActionSuccess={onActionSuccess}
          onHide={removeAssessmentModal.hide}
        />
      )}
      {changeTopicModal.data && (
        <ChangeTopicModal
          show={changeTopicModal.show}
          selectedQuestions={changeTopicModal.data}
          questionIds={changeTopicModal.data.map((q) => q.id)}
          topics={topics}
          urlPrefix={urlPrefix}
          clearSelection={clearSelection}
          onActionSuccess={onActionSuccess}
          onHide={changeTopicModal.hide}
        />
      )}
      {addTagsModal.data && (
        <UpdateTagsModal
          mode="add"
          show={addTagsModal.show}
          selectedQuestions={addTagsModal.data}
          questionIds={addTagsModal.data.map((q) => q.id)}
          tags={tags}
          urlPrefix={urlPrefix}
          clearSelection={clearSelection}
          onActionSuccess={onActionSuccess}
          onHide={addTagsModal.hide}
        />
      )}
      {removeTagsModal.data && (
        <UpdateTagsModal
          mode="remove"
          show={removeTagsModal.show}
          selectedQuestions={removeTagsModal.data}
          questionIds={removeTagsModal.data.map((q) => q.id)}
          tags={tags}
          urlPrefix={urlPrefix}
          clearSelection={clearSelection}
          onActionSuccess={onActionSuccess}
          onHide={removeTagsModal.hide}
        />
      )}
      {deleteModal.data && (
        <DeleteQuestionsModal
          show={deleteModal.show}
          selectedQuestions={deleteModal.data}
          questionIds={deleteModal.data.map((q) => q.id)}
          urlPrefix={urlPrefix}
          clearSelection={clearSelection}
          onActionSuccess={onActionSuccess}
          onHide={deleteModal.hide}
        />
      )}
    </>
  );
}
