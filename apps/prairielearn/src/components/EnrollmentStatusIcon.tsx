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

function capitalize(word: string): string {
  if (word.length === 0) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function EnrollmentStatusIcon({ status }: EnrollmentStatusIconProps) {
  const iconClass = getIconClass(status);
  return (
    <span class="d-inline-flex align-items-center gap-1">
      <i class={clsx('bi', iconClass)} aria-hidden="true" />
      <span>{capitalize(status)}</span>
    </span>
  );
}
