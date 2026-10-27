import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Modal, Spinner } from 'react-bootstrap';

import { type PushSyncResult, PushSyncResultSchema } from '@prairielearn/course-agent-types';
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
  const result = output === undefined ? null : PushSyncResultSchema.parse(output);
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
          <div className="d-flex flex-wrap align-items-center gap-2">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-exclamation-triangle text-warning" aria-hidden="true" />
              <span className="text-nowrap">Review course changes</span>
              <Button
                variant="link"
                size="sm"
                className="p-0 text-nowrap"
                onClick={() => setShowChanges(true)}
              >
                View changes
              </Button>
            </div>
            <div className="d-flex align-items-center gap-2 flex-shrink-0">
              <span aria-hidden="true">·</span>
              <Button
                size="sm"
                disabled={disabled}
                onClick={() =>
                  current &&
                  decision.mutate({
                    conversationId,
                    reviewToken: current.reviewToken,
                    decision: 'approved',
                  })
                }
              >
                Approve
              </Button>
              <Button
                variant="outline-secondary"
                size="sm"
                disabled={disabled}
                onClick={() =>
                  current &&
                  decision.mutate({
                    conversationId,
                    reviewToken: current.reviewToken,
                    decision: 'denied',
                  })
                }
              >
                Deny
              </Button>
            </div>
          </div>
          {current?.status === 'running' && jobSequenceId !== null && (
            <p className="small text-muted mt-2 mb-0" role="status">
              Publishing and syncing…
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
          <Modal
            show={showChanges}
            size="lg"
            aria-labelledby={`review-title-${partId}`}
            onHide={() => setShowChanges(false)}
          >
            <Modal.Header closeButton>
              <Modal.Title id={`review-title-${partId}`}>Review course changes</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {review.isLoading && (
                <Spinner animation="border" size="sm" role="status">
                  <span className="visually-hidden">Loading changes</span>
                </Spinner>
              )}
              {current && (
                <pre
                  className="small mb-0 overflow-auto"
                  style={{ maxHeight: '60vh' }}
                  aria-label="Reviewed course changes"
                >
                  {current.diff.patch || 'No file changes'}
                </pre>
              )}
              {!current && !review.isLoading && !failure && (
                <p className="mb-0">This review is no longer pending.</p>
              )}
              {failure && (
                <AppErrorAlert error={failure} render={{ UNKNOWN: ({ message }) => message }} />
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onClick={() => setShowChanges(false)}>
                Close
              </Button>
            </Modal.Footer>
          </Modal>
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

function ReviewResult({ result }: { result: PushSyncResult }) {
  return (
    <div role="status">
      <p className="mb-0">
        {result.decision === 'denied'
          ? 'Changes kept in your workspace.'
          : result.publication.status === 'published'
            ? result.sync.status === 'succeeded'
              ? 'Changes published and course synced.'
              : 'Changes published. Course Sync failed.'
            : 'Changes could not be published.'}
      </p>
      {result.publication.status === 'failed' && (
        <pre className="small text-wrap mt-2 mb-0">{result.publication.error}</pre>
      )}
      {result.sync.status === 'failed' && (
        <pre className="small text-wrap mt-2 mb-0">{result.sync.error}</pre>
      )}
    </div>
  );
}
