import { useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import type { UseFormRegisterReturn } from 'react-hook-form';

import { PublicLinkSharing } from './LinkSharing.js';

interface BlockingChild {
  id: string;
  href: string;
  label: string;
}

interface BulkShareOptions {
  /** Submit the bulk-share. The caller mutates state and refreshes the page. */
  onConfirm: () => Promise<void>;
  /** Whether the mutation is currently in flight, used to disable buttons. */
  isPending: boolean;
  /** Singular noun for the children: "question" or "assessment". */
  childNoun: string;
  /** Singular noun for the parent entity: "assessment" or "course instance". */
  parentNoun: string;
  /** Optional inline error displayed below the modal's body. */
  error?: { message: string } | null;
}

/**
 * Sharing card used on the assessment-settings and course-instance-settings
 * pages. Both surfaces have the same structure: a `share_source_publicly`
 * checkbox that locks once enabled, a description, a blocking warning that
 * lists non-publicly-shared children with links to their settings pages, and a
 * `PublicLinkSharing` block once shared.
 *
 * If `bulkShare` is provided, the warning also surfaces a "Share all N <kind>
 * publicly" button that opens a confirmation modal and, on confirm, invokes
 * `bulkShare.onConfirm`. The parent is responsible for the actual mutation
 * and for refreshing page state after success.
 *
 * The question-settings sharing card intentionally does not use this component
 * — it has additional fields (a separate `share_publicly` toggle and a
 * sharing-set selector) that don't fit this shape.
 */
export function ShareSourcePubliclyCard({
  alreadyShared,
  canEdit,
  registerProps,
  defaultChecked,
  description,
  alreadySharedSentence,
  blockingChildren,
  blockingPrefix,
  publicLink,
  sharingMessage,
  publicLinkMessage,
  bulkShare,
}: {
  /** Current persisted value of `share_source_publicly`. */
  alreadyShared: boolean;
  canEdit: boolean;
  /** Result of `register('share_source_publicly')` from react-hook-form. */
  registerProps: UseFormRegisterReturn;
  defaultChecked: boolean | undefined;
  /** Helper text describing what enabling the toggle does. */
  description: string;
  /** Appended to the helper text once the value is locked in. */
  alreadySharedSentence: string;
  /** Non-publicly-shared children that block the transition; empty when clear. */
  blockingChildren: BlockingChild[];
  /** Sentence introducing the blocking list (no trailing space). */
  blockingPrefix: string;
  publicLink: string;
  sharingMessage: string;
  publicLinkMessage: string;
  /** Optional bulk-share action; renders the "Share all N …" button. */
  bulkShare?: BulkShareOptions;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const blockedCount = blockingChildren.length;
  const canBulkShare = bulkShare !== undefined && canEdit && !alreadyShared && blockedCount > 0;

  return (
    <div className="card">
      <div className="card-body">
        <h2 className="h5 card-title mb-3">Sharing</h2>
        <Form.Check
          type="checkbox"
          id="share_source_publicly"
          label="Share source publicly"
          className="mb-1"
          disabled={!canEdit || alreadyShared || blockedCount > 0}
          defaultChecked={defaultChecked}
          {...registerProps}
        />
        <small className="form-text text-muted d-block mb-2">
          {description}
          {alreadyShared && ` ${alreadySharedSentence}`}
        </small>
        {blockedCount > 0 && !alreadyShared && (
          <Alert variant="warning" className="small mb-2">
            <div>
              {blockingPrefix}{' '}
              {blockingChildren.map((child, i) => (
                <span key={child.id}>
                  {i > 0 && ', '}
                  <a href={child.href}>{child.label}</a>
                </span>
              ))}
              .
            </div>
            {canBulkShare && (
              <div className="mt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="warning"
                  disabled={bulkShare.isPending}
                  onClick={() => setShowConfirm(true)}
                >
                  Share all {blockedCount} {bulkShare.childNoun}
                  {blockedCount === 1 ? '' : 's'} and this {bulkShare.parentNoun} publicly
                </Button>
              </div>
            )}
          </Alert>
        )}
        {alreadyShared && (
          <PublicLinkSharing
            publicLink={publicLink}
            sharingMessage={sharingMessage}
            publicLinkMessage={publicLinkMessage}
          />
        )}
      </div>
      {bulkShare && (
        <Modal
          show={showConfirm}
          backdrop={bulkShare.isPending ? 'static' : true}
          onHide={() => !bulkShare.isPending && setShowConfirm(false)}
        >
          <Modal.Header closeButton={!bulkShare.isPending}>
            <Modal.Title>Share all publicly</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>
              Confirming this action will permanently share the following {blockedCount}{' '}
              {bulkShare.childNoun}
              {blockedCount === 1 ? '' : 's'}, and then mark this {bulkShare.parentNoun} as publicly
              shared:
            </p>
            <ul className="mb-3">
              {blockingChildren.map((c) => (
                <li key={c.id}>
                  <code>{c.label}</code>
                </li>
              ))}
            </ul>
            <Alert variant="warning" className="small mb-0">
              <strong>This cannot be undone.</strong> Once shared, neither the {bulkShare.childNoun}
              s nor this {bulkShare.parentNoun} can be un-shared, and the {bulkShare.childNoun}s
              cannot be renamed or deleted. Any later content changes will be applied to every
              course that has imported them.
            </Alert>
            {bulkShare.error && (
              <Alert variant="danger" className="mt-3 mb-0 small">
                {bulkShare.error.message}
              </Alert>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              type="button"
              variant="secondary"
              disabled={bulkShare.isPending}
              onClick={() => setShowConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={bulkShare.isPending}
              onClick={async () => {
                await bulkShare.onConfirm();
                // The parent closes the modal on success by re-rendering with
                // `blockedCount === 0` (no warning, no button). On error, we
                // leave the modal open so the user can see the message.
              }}
            >
              {bulkShare.isPending ? 'Sharing...' : 'Share all publicly'}
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
}
