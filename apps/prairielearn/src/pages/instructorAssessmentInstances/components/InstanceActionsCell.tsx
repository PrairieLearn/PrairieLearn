import { useMutation } from '@tanstack/react-query';
import { useState } from 'preact/compat';
import { Button, Dropdown, Modal } from 'react-bootstrap';

import { OverlayTrigger } from '@prairielearn/ui';

import type { AssessmentInstanceRow } from '../instructorAssessmentInstances.types.js';

import { TimeLimitPopover } from './TimeLimitPopover.js';

interface InstanceActionsCellProps {
  row: AssessmentInstanceRow;
  csrfToken: string;
  timezone: string;
  hasCourseInstancePermissionEdit: boolean;
  assessmentGroupWork: boolean;
  onActionComplete: () => void;
}

export function InstanceActionsCell({
  row,
  csrfToken,
  timezone,
  hasCourseInstancePermissionEdit,
  assessmentGroupWork,
  onActionComplete,
}: InstanceActionsCellProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const closeMutation = useMutation({
    mutationFn: async () => {
      const formData = new URLSearchParams({
        __action: 'close',
        __csrf_token: csrfToken,
        assessment_instance_id: row.assessment_instance_id,
      });
      const res = await fetch(window.location.pathname, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!res.ok) throw new Error('Failed to close assessment instance');
      return res.json();
    },
    onSuccess: () => {
      setShowCloseConfirm(false);
      onActionComplete();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const formData = new URLSearchParams({
        __action: 'delete',
        __csrf_token: csrfToken,
        assessment_instance_id: row.assessment_instance_id,
      });
      const res = await fetch(window.location.pathname, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!res.ok) throw new Error('Failed to delete assessment instance');
      return res.json();
    },
    onSuccess: () => {
      setShowDeleteModal(false);
      onActionComplete();
    },
  });

  const closeConfirmPopoverBody = (
    <>
      <div class="d-flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => setShowCloseConfirm(false)}>
          Cancel
        </Button>
        <Button
          disabled={closeMutation.isPending}
          size="sm"
          variant="danger"
          onClick={() => closeMutation.mutate()}
        >
          {closeMutation.isPending ? 'Closing...' : 'Grade and close'}
        </Button>
      </div>
      {closeMutation.isError && (
        <div class="alert alert-danger mt-2 mb-0 p-2" role="alert">
          {closeMutation.error.message}
        </div>
      )}
    </>
  );

  const timeLimitRowData = {
    assessment_instance_id: row.assessment_instance_id,
    date: row.date?.toISOString() ?? new Date().toISOString(),
    total_time: row.total_time,
    total_time_sec: row.total_time_sec,
    time_remaining: row.time_remaining,
    time_remaining_sec: row.time_remaining_sec,
    open: row.open,
  };

  return (
    <>
      <Dropdown>
        <Dropdown.Toggle as="button" bsPrefix="btn btn-xs btn-secondary">
          Action
        </Dropdown.Toggle>
        <Dropdown.Menu
          popperConfig={{
            strategy: 'fixed',
            modifiers: [
              {
                name: 'computeStyles',
                options: {
                  // Disable GPU acceleration to avoid transform issues
                  gpuAcceleration: false,
                },
              },
            ],
          }}
          renderOnMount
        >
          {hasCourseInstancePermissionEdit ? (
            <>
              <Dropdown.Item onClick={() => setShowDeleteModal(true)}>
                <i aria-hidden="true" class="fas fa-times me-2" />
                Delete
              </Dropdown.Item>

              <OverlayTrigger
                placement="auto"
                popover={{
                  header: 'Confirm close',
                  body: closeConfirmPopoverBody,
                  props: { id: `close-confirm-${row.assessment_instance_id}` },
                }}
                show={showCloseConfirm}
                trigger="click"
                rootClose
                onToggle={(nextShow) => setShowCloseConfirm(nextShow)}
              >
                <Dropdown.Item
                  as="button"
                  disabled={!row.open}
                  onClick={(e) => {
                    e.preventDefault();
                    if (row.open) {
                      setShowCloseConfirm(true);
                    }
                  }}
                >
                  <i aria-hidden="true" class="fas fa-ban me-2" />
                  Grade &amp; Close
                </Dropdown.Item>
              </OverlayTrigger>

              <TimeLimitPopover
                csrfToken={csrfToken}
                placement="auto"
                row={timeLimitRowData}
                timezone={timezone}
                onSuccess={onActionComplete}
              >
                <Dropdown.Item as="button" disabled={row.open ?? false}>
                  <i aria-hidden="true" class="fas fa-clock me-2" />
                  Re-open
                </Dropdown.Item>
              </TimeLimitPopover>

              <form method="POST" style={{ display: 'contents' }}>
                <input name="__action" type="hidden" value="regrade" />
                <input name="__csrf_token" type="hidden" value={csrfToken} />
                <input
                  name="assessment_instance_id"
                  type="hidden"
                  value={row.assessment_instance_id}
                />
                <Dropdown.Item as="button" type="submit">
                  <i aria-hidden="true" class="fas fa-sync me-2" />
                  Regrade
                </Dropdown.Item>
              </form>
            </>
          ) : (
            <Dropdown.Item disabled>Must have editor permission</Dropdown.Item>
          )}
        </Dropdown.Menu>
      </Dropdown>

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Delete assessment instance</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete assessment instance #{row.number} for{' '}
          {assessmentGroupWork ? (
            <>
              <strong>{row.group_name}</strong> ({row.uid_list?.join(', ') || 'empty'})
            </>
          ) : (
            <>
              <strong>{row.name}</strong> ({row.uid})
            </>
          )}{' '}
          started at <strong>{row.date_formatted}</strong> with a score of{' '}
          <strong>{Math.floor(row.score_perc ?? 0)}%</strong>?
          {deleteMutation.isError && (
            <div class="alert alert-danger mt-3" role="alert">
              {deleteMutation.error.message}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button
            disabled={deleteMutation.isPending}
            variant="danger"
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
