import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button, Modal } from 'react-bootstrap';

import { NuqsAdapter } from '@prairielearn/ui';

import { QuestionsTable } from '../../components/QuestionsTable.js';
import type { SafeQuestionsPageData } from '../../components/QuestionsTable.shared.js';
import { AppErrorAlert, getAppError, syncJobFailedRenderer } from '../../lib/client/errors.js';
import type { PublicCourseInstance } from '../../lib/client/safe-db-types.js';
import { QueryClientProviderDebug } from '../../lib/client/tanstackQuery.js';
import { createCourseTrpcClient } from '../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../trpc/course/context.js';
import type { QuestionsError } from '../../trpc/course/questions.js';

interface InstructorQuestionsTableProps {
  questions: SafeQuestionsPageData[];
  courseInstances: PublicCourseInstance[];
  courseId: string;
  currentCourseInstanceId?: string;
  showAddQuestionButton: boolean;
  showImportQuestionsButton: boolean;
  showAiGenerateQuestionButton: boolean;
  showSharingSets: boolean;
  canEditQuestions: boolean;
  urlPrefix: string;
  qidPrefix?: string;
  trpcCsrfToken: string;
  search: string;
  isDevMode: boolean;
}

type InstructorQuestionsTableInnerProps = Omit<
  InstructorQuestionsTableProps,
  'search' | 'isDevMode' | 'trpcCsrfToken'
>;

interface AssessmentTarget {
  assessmentId: string;
  courseInstanceId: string;
  label: string;
  displayLabel: string;
}

function useInvalidateQuestionsList() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  return () => queryClient.invalidateQueries(trpc.questions.list.queryFilter());
}

function SelectedQuestionList({ questions }: { questions: SafeQuestionsPageData[] }) {
  return (
    <ul className="mb-0" style={{ maxHeight: '200px', overflowY: 'auto' }}>
      {questions.map((question) => (
        <li key={question.id}>
          <code>{question.qid}</code>
          {question.title && <span className="ms-2">{question.title}</span>}
        </li>
      ))}
    </ul>
  );
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

function getSharedAssessmentTargets(
  questions: SafeQuestionsPageData[],
  courseInstances: PublicCourseInstance[],
) {
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

function AddToAssessmentModal({
  show,
  onHide,
  selectedQuestions,
  courseInstances,
  currentCourseInstanceId,
  urlPrefix,
  clearSelection,
}: {
  show: boolean;
  onHide: () => void;
  selectedQuestions: SafeQuestionsPageData[];
  courseInstances: PublicCourseInstance[];
  currentCourseInstanceId?: string;
  urlPrefix: string;
  clearSelection: () => void;
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
    onSuccess: async () => {
      await invalidateQuestionsList();
      clearSelection();
      onHide();
    },
  });
  const appError = getAppError<QuestionsError['AddToAssessment']>(mutation.error);
  const questionIds = selectedQuestions.map((question) => question.id);
  const canSubmit = effectiveAssessmentId !== '' && effectiveZoneNumber != null;

  return (
    <Modal
      show={show}
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
        <AppErrorAlert
          error={appError}
          className="mt-3 mb-0"
          render={{
            SYNC_JOB_FAILED: syncJobFailedRenderer(urlPrefix),
            UNKNOWN: ({ message }) => message,
          }}
        />
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

function RemoveFromAssessmentModal({
  show,
  onHide,
  selectedQuestions,
  sharedAssessmentTargets,
  urlPrefix,
  clearSelection,
}: {
  show: boolean;
  onHide: () => void;
  selectedQuestions: SafeQuestionsPageData[];
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
  const questionIds = selectedQuestions.map((question) => question.id);

  return (
    <Modal
      show={show}
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
        <AppErrorAlert
          error={appError}
          className="mt-3 mb-0"
          render={{
            SYNC_JOB_FAILED: syncJobFailedRenderer(urlPrefix),
            UNKNOWN: ({ message }) => message,
          }}
        />
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

function DeleteQuestionsModal({
  show,
  onHide,
  selectedQuestions,
  urlPrefix,
  clearSelection,
}: {
  show: boolean;
  onHide: () => void;
  selectedQuestions: SafeQuestionsPageData[];
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
  const questionIds = selectedQuestions.map((question) => question.id);

  return (
    <Modal
      show={show}
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
            {selectedQuestions.length} {selectedQuestions.length === 1 ? 'question' : 'questions'}
          </strong>
          ?
        </p>
        <SelectedQuestionList questions={selectedQuestions} />
        <AppErrorAlert
          error={appError}
          className="mt-3 mb-0"
          render={{
            SYNC_JOB_FAILED: syncJobFailedRenderer(urlPrefix),
            UNKNOWN: ({ message }) => message,
          }}
        />
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

function QuestionSelectionToolbar({
  selectedQuestions,
  clearSelection,
  courseInstances,
  currentCourseInstanceId,
  urlPrefix,
}: {
  selectedQuestions: SafeQuestionsPageData[];
  clearSelection: () => void;
  courseInstances: PublicCourseInstance[];
  currentCourseInstanceId?: string;
  urlPrefix: string;
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const sharedAssessmentTargets = useMemo(
    () => getSharedAssessmentTargets(selectedQuestions, courseInstances),
    [selectedQuestions, courseInstances],
  );

  return (
    <>
      <div className="d-flex align-items-center gap-2">
        <Button variant="light" size="sm" onClick={() => setShowAddModal(true)}>
          <i className="bi bi-plus-square me-1" aria-hidden="true" />
          Add to assessment
        </Button>
        <Button
          variant="light"
          size="sm"
          disabled={sharedAssessmentTargets.length === 0}
          title={
            sharedAssessmentTargets.length === 0
              ? 'Selected questions do not share an assessment'
              : undefined
          }
          onClick={() => setShowRemoveModal(true)}
        >
          <i className="bi bi-dash-square me-1" aria-hidden="true" />
          Remove from assessment
        </Button>
        <Button
          variant="light"
          size="sm"
          className="text-danger"
          onClick={() => setShowDeleteModal(true)}
        >
          <i className="bi bi-trash3 me-1" aria-hidden="true" />
          Delete
        </Button>
      </div>

      <AddToAssessmentModal
        show={showAddModal}
        selectedQuestions={selectedQuestions}
        courseInstances={courseInstances}
        currentCourseInstanceId={currentCourseInstanceId}
        urlPrefix={urlPrefix}
        clearSelection={clearSelection}
        onHide={() => setShowAddModal(false)}
      />
      <RemoveFromAssessmentModal
        show={showRemoveModal}
        selectedQuestions={selectedQuestions}
        sharedAssessmentTargets={sharedAssessmentTargets}
        urlPrefix={urlPrefix}
        clearSelection={clearSelection}
        onHide={() => setShowRemoveModal(false)}
      />
      <DeleteQuestionsModal
        show={showDeleteModal}
        selectedQuestions={selectedQuestions}
        urlPrefix={urlPrefix}
        clearSelection={clearSelection}
        onHide={() => setShowDeleteModal(false)}
      />
    </>
  );
}

function InstructorQuestionsTableInner({
  questions,
  courseInstances,
  courseId,
  currentCourseInstanceId,
  showAddQuestionButton,
  showImportQuestionsButton,
  showAiGenerateQuestionButton,
  showSharingSets,
  canEditQuestions,
  urlPrefix,
  qidPrefix,
}: InstructorQuestionsTableInnerProps) {
  const trpc = useTRPC();

  return (
    <QuestionsTable
      questions={questions}
      courseInstances={courseInstances}
      courseId={courseId}
      currentCourseInstanceId={currentCourseInstanceId}
      showAiGenerateQuestionButton={showAiGenerateQuestionButton}
      showSharingSets={showSharingSets}
      urlPrefix={urlPrefix}
      qidPrefix={qidPrefix}
      questionsQueryOptions={trpc.questions.list.queryOptions()}
      addQuestionUrl={
        showAddQuestionButton ? `${urlPrefix}/course_admin/questions/create` : undefined
      }
      showImportQuestionsButton={showImportQuestionsButton}
      renderSelectionToolbar={
        canEditQuestions
          ? ({ selectedQuestions, clearSelection }) => (
              <QuestionSelectionToolbar
                selectedQuestions={selectedQuestions}
                clearSelection={clearSelection}
                courseInstances={courseInstances}
                currentCourseInstanceId={currentCourseInstanceId}
                urlPrefix={urlPrefix}
              />
            )
          : undefined
      }
    />
  );
}

export function InstructorQuestionsTable({
  search,
  isDevMode,
  trpcCsrfToken,
  courseId,
  ...innerProps
}: InstructorQuestionsTableProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ csrfToken: trpcCsrfToken, courseId }),
  );

  return (
    <NuqsAdapter search={search}>
      <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <InstructorQuestionsTableInner courseId={courseId} {...innerProps} />
        </TRPCProvider>
      </QueryClientProviderDebug>
    </NuqsAdapter>
  );
}

InstructorQuestionsTable.displayName = 'InstructorQuestionsTable';
