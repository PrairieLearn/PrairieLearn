import { useState } from 'react';
import { Badge, Button } from 'react-bootstrap';

import {
  MAX_BULK_QUESTION_SELECTION,
  type SafeQuestionsPageData,
} from '../../../components/QuestionsTable.shared.js';

import { DeleteQuestionsModal } from './DeleteQuestionsModal.js';

export function QuestionSelectionToolbar({
  selectedQuestions,
  clearSelection,
  trimSelection,
  urlPrefix,
  onActionSuccess,
}: {
  selectedQuestions: SafeQuestionsPageData[];
  clearSelection: () => void;
  trimSelection: (count: number) => void;
  urlPrefix: string;
  onActionSuccess: (message: string) => void;
}) {
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
        <Button
          size="sm"
          variant="light"
          className="text-danger"
          disabled={selectionLimitExceeded}
          onClick={() => setShowDeleteModal(true)}
        >
          <i className="bi bi-trash3 me-2" aria-hidden="true" />
          Delete
        </Button>
      </div>

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
