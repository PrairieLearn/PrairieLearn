import type { z } from 'zod';

import { OverlayTrigger } from '@prairielearn/ui';

import type { AccessTimelineEntry } from '../lib/assessment-access-control/resolver.js';
import type { SprocAuthzAssessmentSchema } from '../lib/db-types.js';

import { FriendlyDate } from './FriendlyDate.js';

type AccessRule = z.infer<typeof SprocAuthzAssessmentSchema>['access_rules'][number];

/** Popover showing legacy pre-formatted access rules. */
export function StudentLegacyAccessRulesPopover({ accessRules }: { accessRules: AccessRule[] }) {
  if (accessRules.length === 0) return null;

  return (
    <OverlayTrigger
      trigger="click"
      popover={{
        header: 'Access details',
        body: (
          <table className="table" aria-label="Access details">
            <thead>
              <tr>
                <th>Credit</th>
                <th>Start</th>
                <th>End</th>
              </tr>
            </thead>
            <tbody>
              {accessRules.map((rule) => (
                <tr key={`${rule.credit}-${rule.start_date}-${rule.end_date}`}>
                  <td>{rule.credit}</td>
                  <td>{rule.start_date}</td>
                  <td>{rule.end_date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ),
      }}
      rootClose
    >
      <button type="button" className="btn btn-xs btn-ghost" aria-label="Access details">
        <i className="fa fa-question-circle" aria-hidden="true" />
      </button>
    </OverlayTrigger>
  );
}

/** Popover showing modern access timeline. */
export function StudentAccessTimelinePopover({
  accessTimeline,
}: {
  accessTimeline: AccessTimelineEntry[];
}) {
  if (accessTimeline.length === 0) return null;

  return (
    <OverlayTrigger
      trigger="click"
      popover={{
        header: 'Access details',
        body: (
          <table className="table" aria-label="Access details">
            <thead>
              <tr>
                <th>Credit</th>
                <th>Start</th>
                <th>End</th>
              </tr>
            </thead>
            <tbody>
              {accessTimeline.map((entry) => (
                <tr key={`${entry.credit}-${entry.startDate?.getTime()}-${entry.endDate?.getTime()}`}>
                  <td>{entry.credit}%</td>
                  <td>
                    {entry.startDate ? <FriendlyDate date={entry.startDate} live /> : '—'}
                  </td>
                  <td>
                    {entry.endDate ? <FriendlyDate date={entry.endDate} live /> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ),
      }}
      rootClose
    >
      <button type="button" className="btn btn-xs btn-ghost" aria-label="Access details">
        <i className="fa fa-question-circle" aria-hidden="true" />
      </button>
    </OverlayTrigger>
  );
}
