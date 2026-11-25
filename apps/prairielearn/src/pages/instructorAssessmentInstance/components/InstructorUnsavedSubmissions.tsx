import { QueryClient, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';

import { formatDate } from '@prairielearn/formatter';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert, QueryClientProviderDebug } from '@prairielearn/trpc/react';

import type { StaffUnsavedSubmissionMetadata } from '../../../lib/client/safe-db-types.js';
import {
  getAssessmentInstanceUrl,
  getInstructorUnsavedSubmissionPreviewUrl,
} from '../../../lib/client/url.js';
import { createAssessmentTrpcClient } from '../../../trpc/assessment/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/assessment/context.js';
import type { UnsavedSubmissionsError } from '../../../trpc/assessment/unsaved-submissions.js';

export function InstructorUnsavedSubmissions({
  drafts,
  courseInstanceId,
  assessmentId,
  assessmentInstanceId,
  trpcCsrfToken,
  timezone,
  canPromote,
}: {
  drafts: StaffUnsavedSubmissionMetadata[];
  courseInstanceId: string;
  assessmentId: string;
  assessmentInstanceId: string;
  trpcCsrfToken: string;
  timezone: string;
  canPromote: boolean;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createAssessmentTrpcClient({
      csrfToken: trpcCsrfToken,
      courseInstanceId,
      assessmentId,
    }),
  );

  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <DraftPreview
          drafts={drafts}
          courseInstanceId={courseInstanceId}
          assessmentInstanceId={assessmentInstanceId}
          timezone={timezone}
          canPromote={canPromote}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

InstructorUnsavedSubmissions.displayName = 'InstructorUnsavedSubmissions';

function DraftPreview({
  drafts,
  courseInstanceId,
  assessmentInstanceId,
  timezone,
  canPromote,
}: {
  drafts: StaffUnsavedSubmissionMetadata[];
  courseInstanceId: string;
  assessmentInstanceId: string;
  timezone: string;
  canPromote: boolean;
}) {
  const trpc = useTRPC();
  const [show, setShow] = useState(false);
  const [selectedId, setSelectedId] = useState(drafts[0].unsaved_submission.id);
  const selected = drafts.find((draft) => draft.unsaved_submission.id === selectedId)!;
  const hasMultipleDrafts = drafts.length > 1;
  const promotion = useMutation({
    ...trpc.unsavedSubmissions.promote.mutationOptions(),
    onSuccess: () => window.location.reload(),
  });
  const error = getAppError<UnsavedSubmissionsError['promote']>(promotion.error);
  const titleId = `unsaved-work-${drafts[0].unsaved_submission.id}`;

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          promotion.reset();
          setShow(true);
        }}
      >
        View
      </Button>
      <Modal
        show={show}
        size="xl"
        aria-labelledby={titleId}
        onHide={() => {
          if (!promotion.isPending) setShow(false);
        }}
      >
        <Modal.Header closeButton={!promotion.isPending}>
          <Modal.Title id={titleId}>Unsaved work</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {hasMultipleDrafts && (
            <Form.Group
              className="mb-3"
              controlId={`draft-author-${drafts[0].unsaved_submission.id}`}
            >
              <Form.Label>Draft author</Form.Label>
              <Form.Select
                value={selectedId}
                disabled={promotion.isPending}
                onChange={(event) => {
                  promotion.reset();
                  setSelectedId(event.target.value);
                }}
              >
                {drafts.map(({ unsaved_submission: draft, user }) => (
                  <option key={draft.id} value={draft.id}>
                    {user.name} ({user.uid}) — {formatDate(draft.updated_at, timezone)}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          )}
          <p>
            {!hasMultipleDrafts && (
              <>
                Captured for {selected.user.name} ({selected.user.uid}) at{' '}
                {formatDate(selected.unsaved_submission.updated_at, timezone)}.{' '}
              </>
            )}
            {selected.unsaved_submission.credit !== null &&
              `Applicable credit: ${selected.unsaved_submission.credit}%.`}
          </p>
          {selected.variant_invalidated && (
            <Alert variant="warning">
              This draft's question variant was reset or invalidated. You can inspect its captured
              answer, but it cannot be saved or graded.
            </Alert>
          )}
          <AppErrorAlert
            error={error}
            render={{
              UNKNOWN: ({ message }) => (
                <>
                  {message}{' '}
                  <a href={getAssessmentInstanceUrl({ courseInstanceId, assessmentInstanceId })}>
                    Reload drafts
                  </a>
                </>
              ),
            }}
            onDismiss={() => promotion.reset()}
          />
          <iframe
            key={selectedId}
            title="Unsaved work preview"
            className="w-100 border rounded"
            style={{ height: '60vh' }}
            sandbox="allow-scripts allow-downloads"
            src={getInstructorUnsavedSubmissionPreviewUrl({
              courseInstanceId,
              assessmentInstanceId,
              unsavedSubmissionId: selectedId,
              revision: selected.revision,
            })}
          />
          {canPromote && !selected.variant_invalidated && (
            <p className="mt-3 mb-0">
              Saving this draft creates a submission and grades it using the credit recorded with
              the draft.
            </p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" disabled={promotion.isPending} onClick={() => setShow(false)}>
            Close
          </Button>
          {canPromote && (
            <Button
              variant="primary"
              disabled={promotion.isPending || selected.variant_invalidated}
              onClick={() =>
                promotion.mutate({
                  unsaved_submission_id: selectedId,
                  revision: selected.revision,
                })
              }
            >
              {promotion.isPending ? 'Saving and grading…' : 'Save and grade'}
            </Button>
          )}
        </Modal.Footer>
      </Modal>
    </>
  );
}
