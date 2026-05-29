import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Modal } from 'react-bootstrap';

import type { SafeQuestionsPageData } from '../../../components/QuestionsTable.shared.js';
import { AppErrorAlert, getAppError } from '../../../lib/client/errors.js';
import type { PublicCourseInstance } from '../../../lib/client/safe-db-types.js';
import { useTRPC } from '../../../trpc/course/context.js';
import type { QuestionsError } from '../../../trpc/course/questions.js';

import { BulkQuestionErrorAlert } from './BulkQuestionErrorAlert.js';
import { SelectedQuestionList } from './SelectedQuestionList.js';
import { useInvalidateQuestionsList } from './useInvalidateQuestionsList.js';

interface AssessmentTarget {
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
  const [assessmentId, setAssessmentId] = useState('');

  const assessmentsQuery = useQuery({
    ...trpc.questions.listAssessments.queryOptions(
      { courseInstanceId, questionIds },
      { enabled: show && courseInstanceId !== '' },
    ),
  });
  const assessments = assessmentsQuery.data ?? [];
  const effectiveAssessmentId = assessments.some(
    (assessment) => assessment.id === assessmentId && assessment.allQuestionsPresent,
  )
    ? assessmentId
    : (assessments.find((assessment) => assessment.allQuestionsPresent)?.id ?? '');

  const mutation = useMutation({
    ...trpc.questions.removeFromAssessment.mutationOptions(),
    onSuccess: async ({ removedCount }) => {
      await invalidateQuestionsList();
      const assessmentLabel =
        assessments.find((assessment) => assessment.id === effectiveAssessmentId)?.label ??
        'assessment';
      onActionSuccess(
        `Removed ${removedCount} ${removedCount === 1 ? 'question' : 'questions'} from ${assessmentLabel}.`,
      );
      clearSelection();
      onHide();
    },
  });
  const appError = getAppError<QuestionsError['RemoveFromAssessment']>(mutation.error);
  const canSubmit = effectiveAssessmentId !== '';

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
              setAssessmentId('');
            }}
          >
            {courseInstances.map((courseInstance) => (
              <option key={courseInstance.id} value={courseInstance.id}>
                {courseInstance.short_name}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className="form-label" htmlFor="bulk-remove-assessment">
            Assessment
          </label>
          <select
            id="bulk-remove-assessment"
            className="form-select"
            value={effectiveAssessmentId}
            disabled={assessmentsQuery.isLoading || assessments.length === 0}
            onChange={(e) => setAssessmentId(e.target.value)}
          >
            {assessments.map((assessment) => (
              <option
                key={assessment.id}
                value={assessment.id}
                disabled={!assessment.allQuestionsPresent}
              >
                {assessment.label}
                {assessment.title ? `: ${assessment.title}` : ''}
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
          disabled={!canSubmit || mutation.isPending}
          onClick={() => mutation.mutate({ questionIds, assessmentId: effectiveAssessmentId })}
        >
          Remove {selectedQuestions.length}{' '}
          {selectedQuestions.length === 1 ? 'question' : 'questions'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
