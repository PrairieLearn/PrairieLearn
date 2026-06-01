import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';

import type { SafeQuestionsPageData } from '../../../components/QuestionsTable.shared.js';
import { AppErrorAlert, getAppError } from '../../../lib/client/errors.js';
import { useTRPC } from '../../../trpc/course/context.js';
import type { QuestionsError } from '../../../trpc/course/questions.js';

import { BulkQuestionErrorAlert } from './BulkQuestionErrorAlert.js';
import {
  type QuestionCourseInstanceMembership,
  SelectedQuestionList,
} from './SelectedQuestionList.js';
import { useInvalidateQuestionsList } from './useInvalidateQuestionsList.js';

export function DeleteQuestionsModal({
  show,
  onHide,
  selectedQuestions,
  questionIds,
  urlPrefix,
  clearSelection,
  onActionSuccess,
}: {
  show: boolean;
  onHide: () => void;
  selectedQuestions: SafeQuestionsPageData[];
  questionIds: string[];
  urlPrefix: string;
  clearSelection: () => void;
  onActionSuccess: (message: string) => void;
}) {
  const trpc = useTRPC();
  const invalidateQuestionsList = useInvalidateQuestionsList();

  const previewQuery = useQuery({
    ...trpc.questions.previewDeletion.queryOptions(
      { questionIds },
      { enabled: show && questionIds.length > 0 },
    ),
  });
  const preview = previewQuery.data;
  const affectedAssessmentCount = preview?.affectedAssessmentCount ?? 0;
  const emptiedZoneCount = preview?.emptiedZoneCount ?? 0;
  const lockpointsMovedOrRemoved = preview?.lockpointsMovedOrRemoved ?? 0;
  const membershipsByQid = useMemo<Map<string, QuestionCourseInstanceMembership[]>>(
    () => new Map((preview?.questionMemberships ?? []).map((m) => [m.qid, m.courseInstances])),
    [preview],
  );
  const previewError = getAppError<QuestionsError['PreviewDeletion']>(previewQuery.error);
  const previewLoaded = previewQuery.isSuccess && !previewQuery.isFetching;

  const mutation = useMutation({
    ...trpc.questions.deleteQuestions.mutationOptions(),
    onSuccess: async ({ deletedCount }) => {
      await invalidateQuestionsList();
      onActionSuccess(`Deleted ${deletedCount} ${deletedCount === 1 ? 'question' : 'questions'}.`);
      clearSelection();
      onHide();
    },
  });
  const appError = getAppError<QuestionsError['DeleteQuestions']>(mutation.error);
  const isPlural = selectedQuestions.length !== 1;

  // Questions used by other courses can never be deleted, so once that error
  // stands the deletion can't succeed; hide the delete action and steer the
  // user to deselect those questions.
  const isBlocked = appError?.code === 'QUESTIONS_USED_IN_OTHER_COURSES';

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
        {affectedAssessmentCount > 0 && (
          <Alert variant="info" className="mb-3">
            <strong>{affectedAssessmentCount}</strong>{' '}
            {affectedAssessmentCount === 1 ? 'assessment' : 'assessments'} will be affected.
            {emptiedZoneCount > 0 && (
              <>
                {' '}
                <strong>{emptiedZoneCount}</strong> empty{' '}
                {emptiedZoneCount === 1 ? 'zone' : 'zones'} will be removed.
              </>
            )}
            {lockpointsMovedOrRemoved > 0 && (
              <>
                {' '}
                <strong>{lockpointsMovedOrRemoved}</strong>{' '}
                {lockpointsMovedOrRemoved === 1 ? 'lockpoint' : 'lockpoints'} will be moved or
                removed.
              </>
            )}
          </Alert>
        )}
        <SelectedQuestionList questions={selectedQuestions} membershipsByQid={membershipsByQid} />
        <AppErrorAlert
          error={previewError}
          className="mt-3 mb-0"
          render={{
            UNKNOWN: ({ message }) => <>Failed to load deletion preview: {message}</>,
          }}
        />
        <BulkQuestionErrorAlert error={appError} urlPrefix={urlPrefix} />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        {!isBlocked && (
          <Button
            variant="danger"
            disabled={!previewLoaded || mutation.isPending}
            onClick={() => mutation.mutate({ questionIds })}
          >
            {mutation.isPending
              ? 'Deleting...'
              : previewQuery.isFetching
                ? 'Loading preview...'
                : `Delete ${selectedQuestions.length} ${
                    selectedQuestions.length === 1 ? 'question' : 'questions'
                  }`}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
