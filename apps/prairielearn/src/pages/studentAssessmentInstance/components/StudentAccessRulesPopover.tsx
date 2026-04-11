import type { ClientAccessRule } from './types.js';

export function StudentAccessRulesPopover({ accessRules }: { accessRules: ClientAccessRule[] }) {
  const popoverContent = [
    '<table class="table" aria-label="Access details">',
    '<tr><th>Credit</th><th>Start</th><th>End</th></tr>',
    ...accessRules.map(
      (rule) =>
        `<tr><td>${rule.credit}</td><td>${rule.startDate}</td><td>${rule.endDate}</td></tr>`,
    ),
    '</table>',
  ].join('');

  return (
    <button
      type="button"
      className="btn btn-xs btn-ghost"
      data-bs-toggle="popover"
      data-bs-container="body"
      data-bs-html="true"
      data-bs-title="Access details"
      data-bs-content={popoverContent}
    >
      <i className="fa fa-question-circle" />
    </button>
  );
}
