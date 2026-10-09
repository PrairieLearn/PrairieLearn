/* eslint-disable @eslint-react/no-array-index-key -- Text segments and immutable diff lines keep their order within a message. */

import clsx from 'clsx';
import { useState } from 'react';
import { Button, Modal, Spinner } from 'react-bootstrap';

import { type ApprovalDisplay, type ChatSnapshot } from '@prairielearn/course-agent-contract';
import { assertNever } from '@prairielearn/utils';

function approvalPresentation(status: ApprovalDisplay['status']) {
  switch (status) {
    case 'pending':
      return { text: 'Review requested', color: '', icon: 'bi-exclamation-circle-fill' };
    case 'approved':
      return { text: 'Approved', color: 'text-success', icon: 'bi-check-lg' };
    case 'denied':
      return { text: 'Denied', color: 'text-danger', icon: 'bi-x-lg' };
    default:
      assertNever(status);
  }
}

export function CodeChange({
  approval,
  snapshot,
  decisionPending,
  decisionChoice,
  deciding,
  decisionError,
  onDecide,
}: {
  approval: ApprovalDisplay;
  snapshot: ChatSnapshot;
  decisionPending: boolean;
  decisionChoice?: 'approve' | 'deny';
  deciding: boolean;
  decisionError: boolean;
  onDecide: (approval: ApprovalDisplay, choice: 'approve' | 'deny') => void;
}) {
  const presentation = approvalPresentation(approval.status);
  // Server progress takes precedence over an earlier failed request while its
  // saved decision resumes publication or restores a cold sandbox.
  const completing = ['publishing', 'syncing'].includes(snapshot.publication?.status ?? '');
  return (
    <section
      className="d-flex align-items-center flex-wrap gap-3 my-2 p-2 border rounded bg-body w-100"
      aria-label="Code change"
    >
      <span className={clsx('d-inline-flex align-items-center gap-1', presentation.color)}>
        <i
          className={clsx('bi', approval.status === 'pending' && 'text-warning', presentation.icon)}
          aria-hidden="true"
        />
        {presentation.text}
      </span>
      <div className="ms-auto d-flex align-items-center flex-wrap gap-2">
        <ChangeDiff diff={approval.diff} />
        {(snapshot.approval?.id === approval.id || deciding) && (
          <>
            {approval.status === 'pending' || deciding ? (
              <>
                <span className="text-muted mx-1" aria-hidden="true">
                  ·
                </span>
                <Button
                  size="sm"
                  disabled={decisionPending || snapshot.publication?.status === 'invalid'}
                  onClick={() => onDecide(approval, 'approve')}
                >
                  {deciding && decisionChoice === 'approve' ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-1" aria-hidden="true" />
                      Approving…
                    </>
                  ) : (
                    'Approve'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="link"
                  className="text-body text-decoration-none"
                  disabled={decisionPending}
                  onClick={() => onDecide(approval, 'deny')}
                >
                  {deciding && decisionChoice === 'deny' ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-1" aria-hidden="true" />
                      Denying…
                    </>
                  ) : (
                    'Deny'
                  )}
                </Button>
              </>
            ) : (
              (snapshot.publication?.status === 'retry' ||
                (decisionError && !snapshot.publication?.delivered)) &&
              !decisionPending &&
              !completing && (
                <Button
                  onClick={() =>
                    onDecide(approval, approval.status === 'approved' ? 'approve' : 'deny')
                  }
                >
                  Retry completion
                </Button>
              )
            )}
            {!decisionPending &&
              ['publishing', 'syncing'].includes(snapshot.publication?.status ?? '') && (
                <span role="status" className="text-muted d-inline-flex align-items-center gap-2">
                  <Spinner animation="border" size="sm" aria-hidden="true" />
                  {snapshot.publication?.status === 'syncing' ? 'Syncing course…' : 'Publishing…'}
                </span>
              )}
          </>
        )}
      </div>
      {snapshot.approval?.id === approval.id && snapshot.publication?.error && (
        <span className="text-danger w-100 small">{snapshot.publication.error}</span>
      )}
    </section>
  );
}

function ChangeDiff({ diff }: { diff: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="link"
        className="p-0 text-decoration-none align-baseline"
        onClick={() => setOpen(true)}
      >
        View changes
      </Button>
      <Modal
        show={open}
        size="xl"
        aria-labelledby="course-agent-diff-title"
        scrollable
        onHide={() => setOpen(false)}
      >
        <Modal.Header closeButton>
          <Modal.Title id="course-agent-diff-title">Code changes</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <pre className="course-agent-diff">
            {diff.split('\n').map((line, index) => (
              <span
                key={index}
                className={
                  line.startsWith('+') && !line.startsWith('+++')
                    ? 'bg-success-subtle'
                    : line.startsWith('-') && !line.startsWith('---')
                      ? 'bg-danger-subtle'
                      : ''
                }
              >
                {line}
                {'\n'}
              </span>
            ))}
          </pre>
        </Modal.Body>
      </Modal>
    </>
  );
}
