import type { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';

import type { SprocAuthzAssessmentSchema } from '../db-types.js';

import type {
  AccessAvailabilityState,
  RuntimeAfterComplete,
  RuntimeDateControl,
  TimelineEntry,
} from './resolver.js';

export type { AccessAvailabilityState } from './resolver.js';

export interface AccessDisplayRow {
  key: string;
  label: string | null;
  dateText: string;
  dateIso: string | null;
  creditText: string | null;
  detailsText: string;
}

export interface AccessDisplayBadge {
  key: string;
  icon: string | null;
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'secondary';
}

export interface AccessDisplayModel {
  availability: {
    state: AccessAvailabilityState;
    listed: boolean;
    label: string;
    message: string;
    opensAtText: string | null;
    opensAtIso: string | null;
  };
  rows: AccessDisplayRow[];
  badges: AccessDisplayBadge[];
}

export interface AccessDisplaySource {
  displayTimezone: string;
  availability: {
    state: AccessAvailabilityState;
    listed?: boolean;
    opensAt?: Date | null;
    opensAtText?: string | null;
  };
  includeAvailabilityBadge?: boolean;
  rows: {
    key: string;
    label: string | null;
    date?: Date | null;
    dateText?: string;
    creditText: string | null;
    detailsText: string;
  }[];
  settings?: {
    durationMinutes?: number | null;
    passwordRequired?: boolean;
    prairieTestExamCount?: number;
    questionVisibility?: {
      hideQuestions?: boolean;
      showAgainDate?: Date | null;
      hideAgainDate?: Date | null;
    };
    scoreVisibility?: {
      hideScore?: boolean;
      showAgainDate?: Date | null;
    };
  };
}

type LegacyAccessRule = z.infer<typeof SprocAuthzAssessmentSchema>['access_rules'][number];

function formatDisplayDate(date: Date, timezone: string) {
  return formatDate(date, timezone, { includeTz: false });
}

function formatAvailability(
  { state, listed, opensAt, opensAtText }: AccessDisplaySource['availability'],
  timezone: string,
): AccessDisplayModel['availability'] {
  const formattedOpensAt = opensAt ? formatDisplayDate(opensAt, timezone) : null;
  const resolvedOpensAtText = opensAtText ?? formattedOpensAt;
  const resolvedOpensAtIso = opensAt?.toISOString() ?? null;

  switch (state) {
    case 'open':
      return {
        state,
        listed: listed ?? true,
        label: 'Open now',
        message: 'Assessment is open.',
        opensAtText: null,
        opensAtIso: null,
      };
    case 'future_open':
      return {
        state,
        listed: listed ?? false,
        label: 'Not yet open',
        message: resolvedOpensAtText
          ? `Assessment is not yet open. It will become available on ${resolvedOpensAtText}.`
          : 'Assessment is not yet open.',
        opensAtText: resolvedOpensAtText,
        opensAtIso: resolvedOpensAtIso,
      };
    case 'before_release':
      return {
        state,
        listed: listed ?? false,
        label: 'Not yet available',
        message: 'Assessment is not yet available.',
        opensAtText: null,
        opensAtIso: null,
      };
    case 'prairietest_gated_unavailable':
      return {
        state,
        listed: listed ?? false,
        label: 'PrairieTest required',
        message: 'Assessment is currently only available through PrairieTest.',
        opensAtText: null,
        opensAtIso: null,
      };
    case 'closed':
      return {
        state,
        listed: listed ?? true,
        label: 'Closed',
        message: 'Assessment is no longer available.',
        opensAtText: null,
        opensAtIso: null,
      };
  }
}

function buildAvailabilityBadge(
  availability: AccessDisplayModel['availability'],
): AccessDisplayBadge | null {
  switch (availability.state) {
    case 'open':
      return { key: 'availability', icon: 'calendar-check', label: 'Open now', tone: 'success' };
    case 'future_open':
      return { key: 'availability', icon: 'calendar3', label: 'Not yet open', tone: 'warning' };
    case 'before_release':
      return {
        key: 'availability',
        icon: 'calendar3',
        label: 'Not yet available',
        tone: 'secondary',
      };
    case 'prairietest_gated_unavailable':
      return {
        key: 'availability',
        icon: 'pc-display',
        label: 'PrairieTest required',
        tone: 'warning',
      };
    case 'closed':
      return { key: 'availability', icon: 'calendar-x', label: 'Closed', tone: 'danger' };
  }
}

function buildVisibilityBadges(
  settings: AccessDisplaySource['settings'],
  timezone: string,
): AccessDisplayBadge[] {
  if (!settings) return [];

  const badges: AccessDisplayBadge[] = [];

  if (settings.durationMinutes != null) {
    badges.push({
      key: 'duration',
      icon: 'clock',
      label: `${settings.durationMinutes} minute${settings.durationMinutes === 1 ? '' : 's'} time limit`,
      tone: 'info',
    });
  }

  if (settings.passwordRequired) {
    badges.push({
      key: 'password',
      icon: 'lock',
      label: 'Password protected',
      tone: 'secondary',
    });
  }

  if ((settings.prairieTestExamCount ?? 0) > 0) {
    badges.push({
      key: 'prairietest',
      icon: 'pc-display',
      label: `${settings.prairieTestExamCount} PrairieTest ${settings.prairieTestExamCount === 1 ? 'exam' : 'exams'}`,
      tone: 'warning',
    });
  }

  const questionVisibility = settings.questionVisibility;
  if (questionVisibility) {
    if (!questionVisibility.hideQuestions) {
      badges.push({
        key: 'question-visibility',
        icon: 'eye',
        label: 'Questions visible after completion',
        tone: 'success',
      });
    } else if (questionVisibility.showAgainDate && questionVisibility.hideAgainDate) {
      badges.push({
        key: 'question-visibility',
        icon: 'eye-slash',
        label: `Questions hidden after completion, shown ${formatDisplayDate(questionVisibility.showAgainDate, timezone)} - ${formatDisplayDate(questionVisibility.hideAgainDate, timezone)}`,
        tone: 'secondary',
      });
    } else if (questionVisibility.showAgainDate) {
      badges.push({
        key: 'question-visibility',
        icon: 'eye-slash',
        label: `Questions hidden after completion until ${formatDisplayDate(questionVisibility.showAgainDate, timezone)}`,
        tone: 'secondary',
      });
    }
  }

  const scoreVisibility = settings.scoreVisibility;
  if (scoreVisibility?.hideScore && scoreVisibility.showAgainDate) {
    badges.push({
      key: 'score-visibility',
      icon: 'eye-slash',
      label: `Score hidden after completion until ${formatDisplayDate(scoreVisibility.showAgainDate, timezone)}`,
      tone: 'secondary',
    });
  } else if (scoreVisibility?.hideScore) {
    badges.push({
      key: 'score-visibility',
      icon: 'eye-slash',
      label: 'Score hidden after completion',
      tone: 'secondary',
    });
  }

  return badges;
}

export function formatAccessDisplayModel(source: AccessDisplaySource): AccessDisplayModel {
  const availability = formatAvailability(source.availability, source.displayTimezone);
  const rows = source.rows.map((row) => ({
    key: row.key,
    label: row.label,
    dateText: row.dateText ?? (row.date ? formatDisplayDate(row.date, source.displayTimezone) : ''),
    dateIso: row.date?.toISOString() ?? null,
    creditText: row.creditText,
    detailsText: row.detailsText,
  }));

  const badges = buildVisibilityBadges(source.settings, source.displayTimezone);
  if (source.includeAvailabilityBadge !== false) {
    const availabilityBadge = buildAvailabilityBadge(availability);
    if (availabilityBadge) badges.unshift(availabilityBadge);
  }

  return { availability, rows, badges };
}

function buildAfterLastDeadlineDetails({
  allowSubmissions,
  hideQuestions,
  hideScore,
}: {
  allowSubmissions: boolean;
  hideQuestions: boolean;
  hideScore: boolean;
}) {
  const details = [allowSubmissions ? 'Submissions allowed' : 'Closed'];
  if (hideQuestions) details.push('Questions hidden');
  if (hideScore) details.push('Score hidden');
  return details.join(', ');
}

export function buildModernAccessDisplayModel({
  listBeforeRelease,
  dateControl,
  afterComplete,
  timeline,
  availabilityState,
  availabilityListed,
  opensAt,
  displayTimezone,
  prairieTestExamCount,
}: {
  listBeforeRelease?: boolean;
  dateControl?: RuntimeDateControl;
  afterComplete?: RuntimeAfterComplete;
  timeline: TimelineEntry[];
  availabilityState: AccessAvailabilityState;
  availabilityListed: boolean;
  opensAt: Date | null;
  displayTimezone: string;
  prairieTestExamCount: number;
}): AccessDisplayModel {
  const rows: AccessDisplaySource['rows'] = [];

  // Release row comes from dateControl (not in timeline).
  if (dateControl?.releaseDate !== undefined) {
    if (dateControl.releaseDate) {
      const releaseDetails = ['Assessment opens'];
      if (listBeforeRelease) {
        releaseDetails.push('Listed before release');
      }
      rows.push({
        key: 'release',
        label: 'Release',
        date: dateControl.releaseDate,
        creditText: '100%',
        detailsText: releaseDetails.join(', '),
      });
    } else {
      rows.push({
        key: 'release',
        label: 'Release',
        dateText: 'Not yet available',
        creditText: '100%',
        detailsText: 'No opening time configured',
      });
    }
  }

  // Early entries from the resolver's timeline.
  for (const entry of timeline) {
    if (entry.type === 'early') {
      rows.push({
        key: `early-${entry.index}`,
        label: `Early ${entry.index + 1}`,
        date: entry.date,
        creditText: `${entry.credit}%`,
        detailsText: 'Open',
      });
    }
  }

  // Due date: from the timeline when present, or from dateControl for the
  // explicit "no due date" case (dueDate === null).
  const dueEntry = timeline.find((e) => e.type === 'due');
  if (dueEntry) {
    rows.push({
      key: 'due',
      label: 'Due',
      date: dueEntry.date,
      creditText: '100%',
      detailsText: 'Due',
    });
  } else if (dateControl?.dueDate === null) {
    rows.push({
      key: 'due',
      label: 'Due',
      dateText: 'No due date',
      creditText: '100%',
      detailsText: 'Open',
    });
  }

  // Late entries from the resolver's timeline.
  for (const entry of timeline) {
    if (entry.type === 'late') {
      rows.push({
        key: `late-${entry.index}`,
        label: `Late ${entry.index + 1}`,
        date: entry.date,
        creditText: `${entry.credit}%`,
        detailsText: 'Open',
      });
    }
  }

  if (timeline.length > 0 || dateControl?.dueDate === null) {
    const afterLastDeadline = dateControl?.afterLastDeadline;
    rows.push({
      key: 'after-last-deadline',
      label: null,
      dateText: 'After last deadline',
      creditText: afterLastDeadline?.credit !== undefined ? `${afterLastDeadline.credit}%` : '0%',
      detailsText: buildAfterLastDeadlineDetails({
        allowSubmissions: afterLastDeadline?.allowSubmissions ?? false,
        hideQuestions: afterComplete?.hideQuestions ?? false,
        hideScore: afterComplete?.hideScore ?? false,
      }),
    });
  }

  const showCompletionBadges = dateControl?.afterLastDeadline == null;

  return formatAccessDisplayModel({
    displayTimezone,
    availability: {
      state: availabilityState,
      listed: availabilityListed,
      opensAt,
    },
    rows,
    settings: {
      durationMinutes: dateControl?.durationMinutes ?? null,
      passwordRequired: !!dateControl?.password,
      prairieTestExamCount,
      questionVisibility: showCompletionBadges
        ? {
            hideQuestions: afterComplete?.hideQuestions,
            showAgainDate: afterComplete?.showQuestionsAgainDate,
            hideAgainDate: afterComplete?.hideQuestionsAgainDate,
          }
        : undefined,
      scoreVisibility: showCompletionBadges
        ? {
            hideScore: afterComplete?.hideScore,
            showAgainDate: afterComplete?.showScoreAgainDate,
          }
        : undefined,
    },
  });
}

function formatLegacyWindow(rule: LegacyAccessRule) {
  if (rule.start_date === '—' && rule.end_date === '—') {
    return 'Always available';
  }
  if (rule.start_date === '—') {
    return `Until ${rule.end_date}`;
  }
  if (rule.end_date === '—') {
    return `From ${rule.start_date}`;
  }
  return `${rule.start_date} to ${rule.end_date}`;
}

export function buildLegacyAccessDisplayModel({
  accessRules,
  active,
  nextActiveTime,
  listed,
}: {
  accessRules: LegacyAccessRule[];
  active: boolean;
  nextActiveTime: string | null;
  listed: boolean;
}): AccessDisplayModel {
  const timeLimits = new Set(
    accessRules.map((rule) => rule.time_limit_min).filter((value) => value !== '—'),
  );

  return formatAccessDisplayModel({
    displayTimezone: 'UTC',
    availability: {
      state: active ? 'open' : nextActiveTime ? 'future_open' : 'closed',
      listed,
      opensAtText: nextActiveTime,
    },
    rows: accessRules.map((rule, index) => ({
      key: `legacy-${index}`,
      label: accessRules.length > 1 ? `Window ${index + 1}` : null,
      dateText: formatLegacyWindow(rule),
      creditText: rule.credit,
      detailsText: rule.active ? 'Open now' : 'Access window',
    })),
    settings:
      timeLimits.size === 1
        ? {
            durationMinutes: Number([...timeLimits][0]),
          }
        : undefined,
  });
}

export function buildEmptyAccessDisplayModel(): AccessDisplayModel {
  return formatAccessDisplayModel({
    displayTimezone: 'UTC',
    availability: { state: 'closed', listed: false },
    rows: [],
    settings: undefined,
  });
}
