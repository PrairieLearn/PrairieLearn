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

export function RemoveFromAssessmentModal({
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
  // A question can only be removed from an assessment it is actually in, so only
  // offer assessments that reference at least one of the selected questions.
  const availableAssessments = assessments.filter((assessment) => assessment.referencedCount > 0);

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
    ...trpc.questions.removeFromAssessment.mutationOptions(),
    onSuccess: async ({ results, removedAssessmentCount }) => {
      await invalidateQuestionsList();
      const parts: string[] = [];
      if (removedAssessmentCount === 0) {
        parts.push('None of the selected questions were in the chosen assessments.');
      } else {
        parts.push(
          `Removed selected questions from ${removedAssessmentCount} ${removedAssessmentCount === 1 ? 'assessment' : 'assessments'}.`,
        );
        if (results.some((result) => result.skippedCount > 0)) {
          parts.push('Some questions were not present in one or more assessments.');
        }
      }
      onActionSuccess(parts.join(' '));
      clearSelection();
      onHide();
    },
  });
  const appError = getAppError<QuestionsError['RemoveFromAssessment']>(mutation.error);
  const selectedCount = selectedAssessmentIds.size;
  const canSubmit = selectedCount > 0;

  return (
    <Modal
      show={show}
      size="lg"
      aria-labelledby="bulk-remove-assessment-modal-title"
      onHide={onHide}
      onExited={() => mutation.reset()}
    >
      <Modal.Header closeButton>
        <Modal.Title id="bulk-remove-assessment-modal-title">
          Remove selected questions from assessments
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <AppErrorAlert
          error={getAppError<QuestionsError['ListAssessments']>(assessmentsQuery.error)}
          render={{ UNKNOWN: ({ message }) => <>Error loading assessments: {message}</> }}
        />
        <div className="mb-3">
          <label className="form-label" htmlFor="bulk-remove-course-instance">
            Course instance
          </label>
          <select
            id="bulk-remove-course-instance"
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
          idPrefix="bulk-remove-assessment"
          assessments={availableAssessments}
          isLoading={assessmentsQuery.isLoading}
          selectedAssessmentIds={selectedAssessmentIds}
          emptyMessage="None of the selected questions are in an assessment in this course instance."
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
          variant="danger"
          disabled={!canSubmit || mutation.isPending}
          onClick={() =>
            mutation.mutate({ questionIds, assessmentIds: [...selectedAssessmentIds] })
          }
        >
          Remove from {selectedCount} {selectedCount === 1 ? 'assessment' : 'assessments'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
