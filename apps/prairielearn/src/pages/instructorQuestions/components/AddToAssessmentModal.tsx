import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Modal } from 'react-bootstrap';

import type { SafeQuestionsPageData } from '../../../components/QuestionsTable.shared.js';
import { AppErrorAlert, getAppError } from '../../../lib/client/errors.js';
import type { PublicCourseInstance } from '../../../lib/client/safe-db-types.js';
import { useTRPC } from '../../../trpc/course/context.js';
import type { QuestionsError } from '../../../trpc/course/questions.js';

import { AssessmentChecklist } from './AssessmentChecklist.js';
import { BulkQuestionErrorAlert } from './BulkQuestionErrorAlert.js';
import { SelectedQuestionList } from './SelectedQuestionList.js';
import { useInvalidateQuestionsList } from './useInvalidateQuestionsList.js';

export function AddToAssessmentModal({
  show,
  onHide,
  selectedQuestions,
  questionIds,
  courseInstances,
  currentCourseInstanceId,
  urlPrefix,
  clearSelection,
  onActionSuccess,
}: {
  show: boolean;
  onHide: () => void;
  selectedQuestions: SafeQuestionsPageData[];
  questionIds: string[];
  courseInstances: PublicCourseInstance[];
  currentCourseInstanceId?: string;
  urlPrefix: string;
  clearSelection: () => void;
  onActionSuccess: (message: string) => void;
}) {
  const trpc = useTRPC();
  const invalidateQuestionsList = useInvalidateQuestionsList();
  const [courseInstanceId, setCourseInstanceId] = useState(
    () => currentCourseInstanceId ?? courseInstances.at(0)?.id ?? '',
  );
  const [selectedAssessmentIds, setSelectedAssessmentIds] = useState<Set<string>>(() => new Set());

  const assessmentsQuery = useQuery({
    ...trpc.questions.listAssessments.queryOptions(
      { courseInstanceId, questionIds },
      { enabled: show && courseInstanceId !== '' },
    ),
  });
  const assessments = assessmentsQuery.data ?? [];

  const toggleAssessment = (assessmentId: string) => {
    setSelectedAssessmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(assessmentId)) {
        next.delete(assessmentId);
      } else {
        next.add(assessmentId);
      }
      return next;
    });
  };

  const mutation = useMutation({
    ...trpc.questions.addToAssessment.mutationOptions(),
    onSuccess: async ({ results, addedAssessmentCount }) => {
      await invalidateQuestionsList();
      const parts: string[] = [];
      if (addedAssessmentCount === 0) {
        parts.push('All selected questions were already present in the chosen assessments.');
      } else {
        parts.push(
          `Added selected questions to ${addedAssessmentCount} ${addedAssessmentCount === 1 ? 'assessment' : 'assessments'}.`,
        );
        if (results.some((result) => result.skippedCount > 0)) {
          parts.push('Some questions were already present in one or more assessments.');
        }
      }
      onActionSuccess(parts.join(' '));
      clearSelection();
      onHide();
    },
  });
  const appError = getAppError<QuestionsError['AddToAssessment']>(mutation.error);
  const selectedCount = selectedAssessmentIds.size;
  const canSubmit = selectedCount > 0;

  return (
    <Modal
      show={show}
      size="lg"
      aria-labelledby="bulk-add-assessment-modal-title"
      onHide={onHide}
      onExited={() => mutation.reset()}
    >
      <Modal.Header closeButton>
        <Modal.Title id="bulk-add-assessment-modal-title">
          Add selected questions to assessments
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <AppErrorAlert
          error={getAppError<QuestionsError['ListAssessments']>(assessmentsQuery.error)}
          render={{ UNKNOWN: ({ message }) => <>Error loading assessments: {message}</> }}
        />
        <div className="mb-3">
          <label className="form-label" htmlFor="bulk-add-course-instance">
            Course instance
          </label>
          <select
            id="bulk-add-course-instance"
            className="form-select"
            value={courseInstanceId}
            onChange={(e) => {
              setCourseInstanceId(e.target.value);
              setSelectedAssessmentIds(new Set());
            }}
          >
            {courseInstances.map((courseInstance) => (
              <option key={courseInstance.id} value={courseInstance.id}>
                {courseInstance.short_name}
              </option>
            ))}
          </select>
        </div>

        <AssessmentChecklist
          idPrefix="bulk-add-assessment"
          assessments={assessments}
          isLoading={assessmentsQuery.isLoading}
          selectedAssessmentIds={selectedAssessmentIds}
          emptyMessage="This course instance has no assessments."
          onToggle={toggleAssessment}
        />

        <SelectedQuestionList questions={selectedQuestions} />
        <BulkQuestionErrorAlert error={appError} urlPrefix={urlPrefix} />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!canSubmit || mutation.isPending}
          onClick={() => {
            mutation.mutate({ questionIds, assessmentIds: [...selectedAssessmentIds] });
          }}
        >
          Add to {selectedCount} {selectedCount === 1 ? 'assessment' : 'assessments'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
