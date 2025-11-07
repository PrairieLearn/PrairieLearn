import clsx from 'clsx';

import type { EnumEnrollmentStatus } from '../lib/db-types.js';
import { assertNever } from '../lib/types.js';

interface EnrollmentStatusIconProps {
  status: EnumEnrollmentStatus;
  type: 'badge' | 'text';
  class?: string;
}

function getIconClass(status: EnumEnrollmentStatus): string {
  switch (status) {
    case 'invited':
      return 'bi-envelope';
    case 'joined':
      return 'bi-person-check';
    case 'removed':
      return 'bi-person-dash';
    case 'rejected':
      return 'bi-x-circle';
    case 'blocked':
      return 'bi-slash-circle';
    default:
      return 'bi-question-circle';
  }
}

function getFriendlyStatus(status: EnumEnrollmentStatus): string {
  switch (status) {
    case 'invited':
      return 'Invited';
    case 'joined':
      return 'Joined';
    case 'removed':
      // TODO: See https://github.com/PrairieLearn/PrairieLearn/issues/13205 for a DB-level fix.
      return 'Left';
    case 'rejected':
      return 'Rejected';
    case 'blocked':
      return 'Blocked';
    case 'lti13_pending':
      return 'Invited via LTI';
    default:
      assertNever(status);
  }
}

function getBadgeClass(status: EnumEnrollmentStatus): string {
  switch (status) {
    case 'joined':
      return 'badge bg-success';
    case 'removed':
      return 'badge bg-danger';
    case 'rejected':
      return 'badge bg-danger';
    case 'blocked':
      return 'badge bg-danger';
    case 'lti13_pending':
      return 'badge bg-secondary';
    case 'invited':
      return 'badge bg-secondary';
    default:
      assertNever(status);
  }
}

function capitalize(word: string): string {
  if (word.length === 0) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function EnrollmentStatusIcon({
  status,
  type = 'text',
  class: className,
}: EnrollmentStatusIconProps) {
  const iconClass = getIconClass(status);
  return (
    <span
      class={clsx(
        'd-inline-flex align-items-center gap-1',
        type === 'badge' && getBadgeClass(status),
        className,
      )}
    >
      <i class={clsx('bi', iconClass)} aria-hidden="true" />
      <span class="text-nowrap">{capitalize(getFriendlyStatus(status))}</span>
    </span>
  );
}
