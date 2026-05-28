import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Modal } from 'react-bootstrap';

import type { SafeQuestionsPageData } from '../../../components/QuestionsTable.shared.js';
import { getAppError } from '../../../lib/client/errors.js';
import type { PublicCourseInstance } from '../../../lib/client/safe-db-types.js';
import { useTRPC } from '../../../trpc/course/context.js';
import type { QuestionsError } from '../../../trpc/course/questions.js';

import { BulkQuestionErrorAlert } from './BulkQuestionErrorAlert.js';
import { SelectedQuestionList } from './SelectedQuestionList.js';
import { useInvalidateQuestionsList } from './useInvalidateQuestionsList.js';

export interface AssessmentTarget {
  assessmentId: string;
  courseInstanceId: string;
  label: string;
  displayLabel: string;
}

function getAssessmentTargetsForQuestion(
  question: SafeQuestionsPageData,
  courseInstanceById: Map<string, PublicCourseInstance>,
) {
  return (question.assessments ?? []).map((entry): AssessmentTarget => {
    const label = `${entry.assessment_set.abbreviation}${entry.assessment.number}`;
    const courseInstance = courseInstanceById.get(entry.assessment.course_instance_id);
    return {
      assessmentId: entry.assessment.id,
      courseInstanceId: entry.assessment.course_instance_id,
      label,
      displayLabel: courseInstance ? `${courseInstance.short_name}: ${label}` : label,
    };
  });
}

export function getSharedAssessmentTargets(
  questions: SafeQuestionsPageData[],
  courseInstances: PublicCourseInstance[],
): AssessmentTarget[] {
  if (questions.length === 0) return [];

  const courseInstanceById = new Map(courseInstances.map((ci) => [ci.id, ci]));
  const sharedTargets = new Map(
    getAssessmentTargetsForQuestion(questions[0], courseInstanceById).map((target) => [
      target.assessmentId,
      target,
    ]),
  );

  for (const question of questions.slice(1)) {
    const questionAssessmentIds = new Set(
      getAssessmentTargetsForQuestion(question, courseInstanceById).map(
        (target) => target.assessmentId,
      ),
    );
    for (const assessmentId of sharedTargets.keys()) {
      if (!questionAssessmentIds.has(assessmentId)) {
        sharedTargets.delete(assessmentId);
      }
    }
  }

  return [...sharedTargets.values()].sort((a, b) =>
    a.displayLabel.localeCompare(b.displayLabel, undefined, { numeric: true }),
  );
}

export function RemoveFromAssessmentModal({
  show,
  onHide,
  selectedQuestions,
  questionIds,
  sharedAssessmentTargets,
  urlPrefix,
  clearSelection,
}: {
  show: boolean;
  onHide: () => void;
  selectedQuestions: SafeQuestionsPageData[];
  questionIds: string[];
  sharedAssessmentTargets: AssessmentTarget[];
  urlPrefix: string;
  clearSelection: () => void;
}) {
  const trpc = useTRPC();
  const invalidateQuestionsList = useInvalidateQuestionsList();
  const [assessmentId, setAssessmentId] = useState('');
  const effectiveAssessmentId = sharedAssessmentTargets.some(
    (target) => target.assessmentId === assessmentId,
  )
    ? assessmentId
    : (sharedAssessmentTargets[0]?.assessmentId ?? '');

  const mutation = useMutation({
    ...trpc.questions.removeFromAssessment.mutationOptions(),
    onSuccess: async () => {
      await invalidateQuestionsList();
      clearSelection();
      onHide();
    },
  });
  const appError = getAppError<QuestionsError['RemoveFromAssessment']>(mutation.error);

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
          Remove selected questions from assessment
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="mb-3">
          <label className="form-label" htmlFor="bulk-remove-assessment">
            Assessment
          </label>
          <select
            id="bulk-remove-assessment"
            className="form-select"
            value={effectiveAssessmentId}
            onChange={(e) => setAssessmentId(e.target.value)}
          >
            {sharedAssessmentTargets.map((target) => (
              <option key={target.assessmentId} value={target.assessmentId}>
                {target.displayLabel}
              </option>
            ))}
          </select>
        </div>

        <SelectedQuestionList questions={selectedQuestions} />
        <BulkQuestionErrorAlert error={appError} urlPrefix={urlPrefix} />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={effectiveAssessmentId === '' || mutation.isPending}
          onClick={() => mutation.mutate({ questionIds, assessmentId: effectiveAssessmentId })}
        >
          Remove {selectedQuestions.length}{' '}
          {selectedQuestions.length === 1 ? 'question' : 'questions'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
