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
  const [assessmentId, setAssessmentId] = useState('');
  const [zoneNumber, setZoneNumber] = useState('');

  const assessmentsQuery = useQuery({
    ...trpc.questions.listAssessments.queryOptions(
      { courseInstanceId },
      { enabled: show && courseInstanceId !== '' },
    ),
  });
  const assessments = assessmentsQuery.data ?? [];
  const effectiveAssessmentId = assessments.some((assessment) => assessment.id === assessmentId)
    ? assessmentId
    : (assessments.at(0)?.id ?? '');

  const zonesQuery = useQuery({
    ...trpc.questions.listZones.queryOptions(
      { assessmentId: effectiveAssessmentId },
      { enabled: show && effectiveAssessmentId !== '' },
    ),
  });
  const zones = zonesQuery.data ?? [];
  const effectiveZoneNumber = zones.some((zone) => String(zone.number) === zoneNumber)
    ? Number(zoneNumber)
    : zones.at(0)?.number;

  const mutation = useMutation({
    ...trpc.questions.addToAssessment.mutationOptions(),
    onSuccess: async ({ addedCount, skippedCount }) => {
      await invalidateQuestionsList();
      const assessmentLabel =
        assessments.find((assessment) => assessment.id === effectiveAssessmentId)?.label ??
        'assessment';
      const parts: string[] = [
        `Added ${addedCount} ${addedCount === 1 ? 'question' : 'questions'} to ${assessmentLabel}.`,
      ];
      if (skippedCount > 0) {
        parts.push(
          `${skippedCount} ${skippedCount === 1 ? 'question was' : 'questions were'} already in the assessment.`,
        );
      }
      onActionSuccess(parts.join(' '));
      clearSelection();
      onHide();
    },
  });
  const appError = getAppError<QuestionsError['AddToAssessment']>(mutation.error);
  const canSubmit = effectiveAssessmentId !== '' && effectiveZoneNumber != null;

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
          Add selected questions to assessment
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <AppErrorAlert
          error={getAppError<QuestionsError['ListAssessments']>(assessmentsQuery.error)}
          render={{ UNKNOWN: ({ message }) => <>Error loading assessments: {message}</> }}
        />
        <AppErrorAlert
          error={getAppError<QuestionsError['ListZones']>(zonesQuery.error)}
          render={{ UNKNOWN: ({ message }) => <>Error loading zones: {message}</> }}
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
              setAssessmentId('');
              setZoneNumber('');
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
          <label className="form-label" htmlFor="bulk-add-assessment">
            Assessment
          </label>
          <select
            id="bulk-add-assessment"
            className="form-select"
            value={effectiveAssessmentId}
            disabled={assessmentsQuery.isLoading || assessments.length === 0}
            onChange={(e) => {
              setAssessmentId(e.target.value);
              setZoneNumber('');
            }}
          >
            {assessments.map((assessment) => (
              <option key={assessment.id} value={assessment.id}>
                {assessment.label}
                {assessment.title ? `: ${assessment.title}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3">
          <label className="form-label" htmlFor="bulk-add-zone">
            Zone
          </label>
          <select
            id="bulk-add-zone"
            className="form-select"
            value={effectiveZoneNumber?.toString() ?? ''}
            disabled={zonesQuery.isLoading || zones.length === 0}
            onChange={(e) => setZoneNumber(e.target.value)}
          >
            {zones.map((zone) => (
              <option key={zone.number} value={zone.number}>
                {zone.title || `Zone ${zone.number}`}
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
          variant="primary"
          disabled={!canSubmit || mutation.isPending}
          onClick={() => {
            if (effectiveZoneNumber === undefined) return;
            mutation.mutate({
              questionIds,
              assessmentId: effectiveAssessmentId,
              zoneNumber: effectiveZoneNumber,
            });
          }}
        >
          Add {selectedQuestions.length} {selectedQuestions.length === 1 ? 'question' : 'questions'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
