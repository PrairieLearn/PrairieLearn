import { formatDate } from '@prairielearn/formatter';

import type { SprocAuthzAssessment, SprocAuthzAssessmentInstance } from '../db-types.js';

import type { AssessmentAuthzResult, AssessmentInstanceAuthzResult } from './authz-result.js';
import { formatDateShort } from './resolver.js';

export function formatLegacyAssessmentAccess(
  raw: SprocAuthzAssessment,
  displayTimezone: string,
): AssessmentAuthzResult {
  const creditDateString = (() => {
    if (raw.staff_override) return '100% (Staff override)';
    if (!raw.active && raw.next_active_date) {
      const credit =
        raw.next_active_credit != null && raw.next_active_credit > 0
          ? `${raw.next_active_credit}%`
          : 'None';
      return `${credit} starting from ${formatDateShort(raw.next_active_date, displayTimezone)}`;
    }
    if (raw.credit == null || raw.credit <= 0 || !raw.active) return 'None';
    return raw.credit_end_date
      ? `${raw.credit}% until ${formatDateShort(raw.credit_end_date, displayTimezone)}`
      : `${raw.credit}%`;
  })();

  return {
    access_rules: raw.access_rules.map((rule) => ({
      credit: rule.credit == null ? 'None' : `${rule.credit}%`,
      time_limit_min: rule.time_limit_min == null ? '—' : `${rule.time_limit_min} min`,
      start_date: rule.start_date ? formatDate(rule.start_date, displayTimezone) : '—',
      end_date: rule.end_date ? formatDate(rule.end_date, displayTimezone) : '—',
      mode: rule.mode,
      active: rule.active,
    })),
    access_timeline: raw.access_timeline,
    active: raw.active,
    authorized: raw.authorized,
    credit: raw.credit,
    credit_date_string: creditDateString,
    exam_access_end: raw.exam_access_end,
    mode: raw.mode,
    next_active_time: raw.next_active_date
      ? formatDate(raw.next_active_date, displayTimezone)
      : null,
    password: raw.password,
    show_before_release: raw.show_before_release,
    show_closed_assessment: raw.show_closed_assessment,
    show_closed_assessment_score: raw.show_closed_assessment_score,
    time_limit_min: raw.time_limit_min,
  };
}

export function formatLegacyAssessmentInstanceAccess(
  raw: SprocAuthzAssessmentInstance,
  displayTimezone: string,
): AssessmentInstanceAuthzResult {
  return {
    ...formatLegacyAssessmentAccess(raw, displayTimezone),
    authorized_edit: raw.authorized_edit,
    time_limit_expired: raw.time_limit_expired,
  };
}
