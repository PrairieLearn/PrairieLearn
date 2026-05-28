import { useMutation } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Button, Modal } from 'react-bootstrap';

import { AssessmentBadge } from '../../../components/AssessmentBadge.js';
import type { SafeQuestionsPageData } from '../../../components/QuestionsTable.shared.js';
import { getAppError } from '../../../lib/client/errors.js';
import type { PublicCourseInstance } from '../../../lib/client/safe-db-types.js';
import { useTRPC } from '../../../trpc/course/context.js';
import type { QuestionsError } from '../../../trpc/course/questions.js';

import { BulkQuestionErrorAlert } from './BulkQuestionErrorAlert.js';
import { SelectedQuestionList } from './SelectedQuestionList.js';
import { useInvalidateQuestionsList } from './useInvalidateQuestionsList.js';

interface AssessmentReference {
  assessment_id: string;
  color: string;
  label: string;
}

interface AssessmentsByCourseInstance {
  courseInstance: PublicCourseInstance;
  assessments: AssessmentReference[];
}

function getAssessmentsByCourseInstance(
  questions: SafeQuestionsPageData[],
  courseInstances: PublicCourseInstance[],
): AssessmentsByCourseInstance[] {
  const courseInstanceById = new Map(courseInstances.map((ci) => [ci.id, ci]));
  const grouped = new Map<string, Map<string, AssessmentReference>>();
  for (const question of questions) {
    for (const entry of question.assessments ?? []) {
      const ciId = entry.assessment.course_instance_id;
      let assessmentsById = grouped.get(ciId);
      if (!assessmentsById) {
        assessmentsById = new Map();
        grouped.set(ciId, assessmentsById);
      }
      assessmentsById.set(entry.assessment.id, {
        assessment_id: entry.assessment.id,
        color: entry.assessment_set.color,
        label: `${entry.assessment_set.abbreviation}${entry.assessment.number}`,
      });
    }
  }

  return [...grouped.entries()]
    .flatMap(([ciId, assessmentsById]) => {
      const courseInstance = courseInstanceById.get(ciId);
      if (!courseInstance) return [];
      const assessments = [...assessmentsById.values()].sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true }),
      );
      return [{ courseInstance, assessments }];
    })
    .sort((a, b) =>
      a.courseInstance.short_name.localeCompare(b.courseInstance.short_name, undefined, {
        numeric: true,
      }),
    );
}

export function DeleteQuestionsModal({
  show,
  onHide,
  selectedQuestions,
  questionIds,
  courseInstances,
  urlPrefix,
  clearSelection,
}: {
  show: boolean;
  onHide: () => void;
  selectedQuestions: SafeQuestionsPageData[];
  questionIds: string[];
  courseInstances: PublicCourseInstance[];
  urlPrefix: string;
  clearSelection: () => void;
}) {
  const trpc = useTRPC();
  const invalidateQuestionsList = useInvalidateQuestionsList();
  const mutation = useMutation({
    ...trpc.questions.deleteQuestions.mutationOptions(),
    onSuccess: async () => {
      await invalidateQuestionsList();
      clearSelection();
      onHide();
    },
  });
  const appError = getAppError<QuestionsError['DeleteQuestions']>(mutation.error);
  const assessmentsByCourseInstance = useMemo(
    () => getAssessmentsByCourseInstance(selectedQuestions, courseInstances),
    [selectedQuestions, courseInstances],
  );
  const isPlural = selectedQuestions.length !== 1;

  return (
    <Modal
      show={show}
      size="lg"
      aria-labelledby="bulk-delete-questions-modal-title"
      onHide={onHide}
      onExited={() => mutation.reset()}
    >
      <Modal.Header closeButton>
        <Modal.Title id="bulk-delete-questions-modal-title">Delete selected questions</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Are you sure you want to delete{' '}
          <strong>
            {selectedQuestions.length} {isPlural ? 'questions' : 'question'}
          </strong>
          ?
        </p>
        <SelectedQuestionList questions={selectedQuestions} />
        {assessmentsByCourseInstance.length > 0 && (
          <>
            <p className="mt-3 mb-2">
              {isPlural ? 'These questions' : 'This question'} will also be removed from these
              assessments:
            </p>
            <ul className="list-group mb-0">
              {assessmentsByCourseInstance.map(({ courseInstance, assessments }) => (
                <li key={courseInstance.id} className="list-group-item">
                  <div className="fw-semibold">
                    {courseInstance.short_name}
                    {courseInstance.long_name && (
                      <span className="text-muted fw-normal"> ({courseInstance.long_name})</span>
                    )}
                  </div>
                  <div className="d-flex flex-wrap gap-1 mt-1">
                    {assessments.map((assessment) => (
                      <AssessmentBadge
                        key={assessment.assessment_id}
                        assessment={assessment}
                        courseInstanceId={courseInstance.id}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <BulkQuestionErrorAlert error={appError} urlPrefix={urlPrefix} />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ questionIds })}
        >
          Delete {selectedQuestions.length}{' '}
          {selectedQuestions.length === 1 ? 'question' : 'questions'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
