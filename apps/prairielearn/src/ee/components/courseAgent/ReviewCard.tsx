import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Button, Modal, Spinner } from 'react-bootstrap';

import {
  type RequestChangesResult,
  RequestChangesResultSchema,
} from '@prairielearn/course-agent-types';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';

import { useTRPC } from '../../../trpc/course/context.js';
import type { CourseAgentError } from '../../../trpc/course/course-agent.js';

export function ReviewCard({
  conversationId,
  messageId,
  partId,
  output,
  canReview,
}: {
  conversationId: string;
  messageId: string;
  partId: string;
  output: unknown;
  canReview: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showChanges, setShowChanges] = useState(false);
  const [startedJob, setStartedJob] = useState<string | null>(null);
  const reviewInput = { conversationId, callId: partId };
  const review = useQuery({
    ...trpc.courseAgent.getPendingReview.queryOptions(reviewInput),
    enabled: canReview && output === undefined,
    retry: false,
  });
  const current =
    review.data?.card.messageId === messageId && review.data.card.partId === partId
      ? review.data
      : null;
  const jobSequenceId = startedJob ?? current?.jobSequenceId ?? null;
  const job = useQuery({
    ...trpc.courseAgent.reviewJob.queryOptions({
      conversationId,
      jobSequenceId: jobSequenceId ?? '',
    }),
    enabled: jobSequenceId !== null && output === undefined,
    retry: false,
    refetchInterval: (query) => (query.state.data?.jobSequence.status === 'Running' ? 2000 : false),
  });
  const decision = useMutation({
    ...trpc.courseAgent.postReviewDecision.mutationOptions(),
    retry: false,
    onSuccess: async (result) => {
      setStartedJob(result.jobSequenceId);
      await queryClient.invalidateQueries({
        queryKey: trpc.courseAgent.getPendingReview.queryKey(reviewInput),
      });
    },
  });
  const resume = useMutation({
    ...trpc.courseAgent.resume.mutationOptions(),
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: trpc.courseAgent.getPendingReview.queryKey(reviewInput),
      });
    },
  });
  const result = output === undefined ? null : RequestChangesResultSchema.parse(output);
  const failure = result
    ? null
    : (getAppError<CourseAgentError['GetPendingReview']>(review.error) ??
      getAppError<CourseAgentError['PostReviewDecision']>(decision.error) ??
      getAppError<CourseAgentError['ReviewJob']>(job.error) ??
      getAppError<CourseAgentError['Resume']>(resume.error));
  const disabled = current?.status !== 'pending' || decision.isPending || jobSequenceId !== null;
  return (
    <div className="border rounded p-2">
      {result ? (
        <ReviewResult result={result} />
      ) : (
        <>
          <ReviewActions
            disabled={disabled}
            onViewChanges={() => setShowChanges(true)}
            onDecision={(value) => {
              if (current) {
                decision.mutate({ conversationId, callId: current.callId, decision: value });
              }
            }}
          />
          {current?.status === 'running' && jobSequenceId !== null && (
            <p className="small text-muted mt-2 mb-0" role="status">
              Saving and syncing…
            </p>
          )}
          {current?.error && (
            <p className="text-danger mt-2 mb-0" role="alert">
              {current.error}
            </p>
          )}
          {((job.data && job.data.jobSequence.status !== 'Running') ||
            (current?.status === 'running' && jobSequenceId === null)) && (
            <Button
              className="mt-2"
              variant="outline-secondary"
              size="sm"
              disabled={resume.isPending}
              onClick={() => resume.mutate({ conversationId })}
            >
              Resume
            </Button>
          )}
          {review.isError && (
            <Button
              className="mt-2"
              size="sm"
              variant="outline-secondary"
              onClick={() => void review.refetch()}
            >
              Reload review
            </Button>
          )}
          <ReviewChangesModal
            id={partId}
            show={showChanges}
            loading={review.isLoading}
            patch={current?.diff.patch ?? null}
            error={
              failure && (
                <AppErrorAlert error={failure} render={{ UNKNOWN: ({ message }) => message }} />
              )
            }
            onHide={() => setShowChanges(false)}
          />
        </>
      )}
      {failure && (
        <AppErrorAlert
          className="mt-2"
          error={failure}
          render={{ UNKNOWN: ({ message }) => message }}
        />
      )}
    </div>
  );
}

function ReviewActions({
  disabled,
  onViewChanges,
  onDecision,
}: {
  disabled: boolean;
  onViewChanges: () => void;
  onDecision: (decision: 'approved' | 'denied') => void;
}) {
  return (
    <div className="d-flex flex-wrap align-items-center gap-2">
      <div className="d-flex align-items-center gap-2">
        <i className="bi bi-exclamation-triangle text-warning" aria-hidden="true" />
        <span>Review course changes</span>
      </div>
      <Button variant="link" size="sm" className="p-0 text-nowrap" onClick={onViewChanges}>
        View changes
      </Button>
      <div className="d-flex align-items-center gap-2 flex-shrink-0 ms-auto">
        <Button size="sm" disabled={disabled} onClick={() => onDecision('approved')}>
          Approve
        </Button>
        <Button
          variant="outline-secondary"
          size="sm"
          disabled={disabled}
          onClick={() => onDecision('denied')}
        >
          Deny
        </Button>
      </div>
    </div>
  );
}

function ReviewChangesModal({
  id,
  show,
  onHide,
  loading,
  patch,
  error,
}: {
  id: string;
  show: boolean;
  onHide: () => void;
  loading: boolean;
  patch: string | null;
  error: ReactNode;
}) {
  return (
    <Modal show={show} size="lg" aria-labelledby={`review-title-${id}`} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title id={`review-title-${id}`}>Review course changes</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading && (
          <Spinner animation="border" size="sm" role="status">
            <span className="visually-hidden">Loading changes</span>
          </Spinner>
        )}
        {patch !== null && (
          <pre
            className="small mb-0 overflow-auto"
            style={{ maxHeight: '60vh' }}
            aria-label="Reviewed course changes"
          >
            {patch || 'No file changes'}
          </pre>
        )}
        {patch === null && !loading && !error && (
          <p className="mb-0">This review is no longer pending.</p>
        )}
        {error}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function ReviewResult({ result }: { result: RequestChangesResult }) {
  let message = 'Changes could not be saved.';
  if (result.decision === 'denied') {
    message = 'Changes denied.';
  } else if (result.publication.status === 'saved_locally') {
    if (result.sync.status === 'succeeded') {
      message = 'Changes saved locally and course synced.';
    } else {
      message = 'Changes saved locally. Course Sync failed.';
    }
  } else if (result.publication.status === 'published') {
    if (result.sync.status === 'succeeded') {
      message = 'Changes published and course synced.';
    } else {
      message = 'Changes published. Course Sync failed.';
    }
  }
  return (
    <div role="status">
      <p className="mb-0">{message}</p>
      {result.publication.status === 'failed' && (
        <pre className="small text-wrap mt-2 mb-0">{result.publication.error}</pre>
      )}
      {result.sync.status === 'failed' && (
        <details className="mt-2">
          <summary>Error</summary>
          <pre className="small text-wrap mt-2 mb-0">{result.sync.error}</pre>
        </details>
      )}
    </div>
  );
}
