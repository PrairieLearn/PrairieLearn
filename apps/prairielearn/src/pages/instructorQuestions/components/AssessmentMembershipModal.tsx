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

type Mode = 'add' | 'remove';

interface ModeConfig {
  idPrefix: string;
  title: string;
  submitVariant: 'primary' | 'danger';
  submitVerb: string;
  emptyMessage: string;
  /** Whether to offer assessments the selected questions are not yet in. */
  includeAssessmentsWithoutQuestions: boolean;
  /** Message when no assessment was actually changed. */
  noChangeMessage: string;
  /** Leading clause of the success message, completed with the affected count. */
  successVerb: string;
  /** Appended when some assessments skipped some questions. */
  partialSkipMessage: string;
}

const MODE_CONFIG: Record<Mode, ModeConfig> = {
  add: {
    idPrefix: 'bulk-add-assessment',
    title: 'Add selected questions to assessments',
    submitVariant: 'primary',
    submitVerb: 'Add to',
    emptyMessage: 'This course instance has no assessments.',
    includeAssessmentsWithoutQuestions: true,
    noChangeMessage: 'All selected questions were already present in the chosen assessments.',
    successVerb: 'Added selected questions to',
    partialSkipMessage: 'Some questions were already present in one or more assessments.',
  },
  remove: {
    idPrefix: 'bulk-remove-assessment',
    title: 'Remove selected questions from assessments',
    submitVariant: 'danger',
    submitVerb: 'Remove from',
    emptyMessage: 'None of the selected questions are in an assessment in this course instance.',
    includeAssessmentsWithoutQuestions: false,
    noChangeMessage: 'None of the selected questions were in the chosen assessments.',
    successVerb: 'Removed selected questions from',
    partialSkipMessage: 'Some questions were not present in one or more assessments.',
  },
};

/**
 * Add or remove the selected questions to/from assessments in a chosen course
 * instance. The add and remove flows are structurally identical — they differ
 * only in which mutation runs, which assessments are offered, and the wording —
 * so they share this component, parameterized by `mode`.
 */
export function AssessmentMembershipModal({
  mode,
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
  mode: Mode;
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
  const config = MODE_CONFIG[mode];
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
  // For removal, only offer assessments that reference at least one selected
  // question, since a question can only be removed from an assessment it is in.
  const assessments = (assessmentsQuery.data ?? []).filter(
    (assessment) => config.includeAssessmentsWithoutQuestions || assessment.referencedCount > 0,
  );

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

  const mutationOptions =
    mode === 'add'
      ? trpc.questions.addToAssessment.mutationOptions()
      : trpc.questions.removeFromAssessment.mutationOptions();
  const mutation = useMutation({
    ...mutationOptions,
    onSuccess: async ({ results, affectedAssessmentCount }) => {
      await invalidateQuestionsList();
      const parts: string[] = [];
      if (affectedAssessmentCount === 0) {
        parts.push(config.noChangeMessage);
      } else {
        parts.push(
          `${config.successVerb} ${affectedAssessmentCount} ${affectedAssessmentCount === 1 ? 'assessment' : 'assessments'}.`,
        );
        if (results.some((result) => result.skippedCount > 0)) {
          parts.push(config.partialSkipMessage);
        }
      }
      onActionSuccess(parts.join(' '));
      clearSelection();
      onHide();
    },
  });
  const appError = getAppError<
    QuestionsError['AddToAssessment'] | QuestionsError['RemoveFromAssessment']
  >(mutation.error);
  const selectedCount = selectedAssessmentIds.size;
  const canSubmit = selectedCount > 0;

  return (
    <Modal
      show={show}
      size="lg"
      aria-labelledby={`${config.idPrefix}-modal-title`}
      onHide={onHide}
      onExited={() => mutation.reset()}
    >
      <Modal.Header closeButton>
        <Modal.Title id={`${config.idPrefix}-modal-title`}>{config.title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <AppErrorAlert
          error={getAppError<QuestionsError['ListAssessments']>(assessmentsQuery.error)}
          render={{ UNKNOWN: ({ message }) => <>Error loading assessments: {message}</> }}
        />
        <div className="mb-3">
          <label className="form-label" htmlFor={`${config.idPrefix}-course-instance`}>
            Course instance
          </label>
          <select
            id={`${config.idPrefix}-course-instance`}
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
          idPrefix={config.idPrefix}
          assessments={assessments}
          isLoading={assessmentsQuery.isLoading}
          selectedAssessmentIds={selectedAssessmentIds}
          emptyMessage={config.emptyMessage}
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
          variant={config.submitVariant}
          disabled={!canSubmit || mutation.isPending}
          onClick={() =>
            mutation.mutate({ questionIds, assessmentIds: [...selectedAssessmentIds] })
          }
        >
          {config.submitVerb} {selectedCount} {selectedCount === 1 ? 'assessment' : 'assessments'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
