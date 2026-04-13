import { Badge } from 'react-bootstrap';

import { OverlayTrigger } from '@prairielearn/ui';

import { getInstanceQuestionUrl } from '../../../lib/client/url.js';

import type { ClientQuestionRow } from './types.js';

export function RowLabel({
  row,
  userGroupRoles,
  rowLabelText,
  urlPrefix,
  hasStatusColumn,
}: {
  row: ClientQuestionRow;
  userGroupRoles: string | null;
  rowLabelText: string;
  urlPrefix: string;
  hasStatusColumn: boolean;
}) {
  let lockMessage: string | null = null;
  let showLink = true;

  if (row.questionAccessMode === 'blocked_sequence') {
    showLink = false;
    lockMessage =
      row.prevQuestionAccessMode === 'blocked_sequence'
        ? 'A previous question must be completed before you can access this one.'
        : `You must score at least ${row.prevAdvanceScorePerc}% on ${row.prevTitle} to unlock this question.`;
  } else if (row.questionAccessMode === 'blocked_lockpoint') {
    showLink = false;
  } else if (!(row.groupRolePermissions?.canView ?? true)) {
    showLink = false;
    lockMessage = `Your current group role (${userGroupRoles}) restricts access to this question.`;
  } else if (row.questionAccessMode === 'read_only_lockpoint') {
    lockMessage =
      'You can no longer submit answers to this question because you have advanced past a lockpoint.';
  }

  return (
    <>
      {showLink ? (
        <a href={getInstanceQuestionUrl({ urlPrefix, instanceQuestionId: row.id })}>
          {rowLabelText}
        </a>
      ) : (
        <span className="text-muted">{rowLabelText}</span>
      )}
      {row.questionAccessMode === 'blocked_lockpoint' && !hasStatusColumn ? (
        <Badge bg="secondary" className="ms-1" data-testid="locked-instance-question-row">
          Locked
        </Badge>
      ) : lockMessage != null ? (
        <OverlayTrigger trigger="click" popover={{ body: lockMessage }} rootClose>
          <button
            type="button"
            className="btn btn-xs border text-secondary ms-1"
            data-testid="locked-instance-question-row"
            data-bs-content={lockMessage}
            aria-label="Locked"
          >
            <i className="fas fa-lock" aria-hidden="true" />
          </button>
        </OverlayTrigger>
      ) : null}
      {row.fileCount > 0 && (
        <OverlayTrigger
          trigger="click"
          popover={{ body: `Personal notes: ${row.fileCount}` }}
          rootClose
        >
          <button
            type="button"
            className="btn btn-xs border text-secondary ms-1"
            aria-label="Has personal note attachments"
          >
            <i className="fas fa-paperclip" />
          </button>
        </OverlayTrigger>
      )}
    </>
  );
}
