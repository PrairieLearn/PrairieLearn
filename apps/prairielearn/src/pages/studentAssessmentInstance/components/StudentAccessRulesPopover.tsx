import { OverlayTrigger } from '@prairielearn/ui';

import type { ClientAccessRule } from './types.js';

export function StudentAccessRulesPopover({ accessRules }: { accessRules: ClientAccessRule[] }) {
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
                <tr key={`${rule.credit}-${rule.startDate}-${rule.endDate}`}>
                  <td>{rule.credit}</td>
                  <td>{rule.startDate}</td>
                  <td>{rule.endDate}</td>
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
