import clsx from 'clsx';

import type { EnumEnrollmentStatus } from '../lib/db-types.js';

interface EnrollmentStatusIconProps {
  status: EnumEnrollmentStatus;
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
      return 'Removed';
    case 'rejected':
      return 'Rejected';
    case 'blocked':
      return 'Blocked';
    case 'lti13_pending':
      return 'Invited via LTI';
    default:
      return 'Unknown';
  }
}

function capitalize(word: string): string {
  if (word.length === 0) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function EnrollmentStatusIcon({ status }: EnrollmentStatusIconProps) {
  const iconClass = getIconClass(status);
  return (
    <span class="d-inline-flex align-items-center gap-1">
      <i class={clsx('bi', iconClass)} aria-hidden="true" />
      <span class="text-nowrap">{capitalize(getFriendlyStatus(status))}</span>
    </span>
  );
}
