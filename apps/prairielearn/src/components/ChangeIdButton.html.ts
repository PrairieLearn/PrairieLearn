import { v4 as uuidv4 } from 'uuid';

import { type HtmlValue, escapeHtml, html } from '@prairielearn/html';

export function ChangeIdButton({
  label,
  currentValue,
  otherValues,
  extraHelpText,
  csrfToken,
  action,
}: {
  label: string;
  currentValue: string;
  otherValues: string[];
  extraHelpText?: HtmlValue;
  csrfToken: string;
  action?: string;
}) {
  const id = `change-id-${uuidv4()}`;
  return html`
    <button
      id="${id}"
      class="btn btn-xs btn-secondary js-change-id-button"
      type="button"
      data-previous-value="${currentValue}"
      data-other-values="${JSON.stringify(otherValues)}"
      title="Change ${label}"
      data-content="${escapeHtml(
        ChangeIdForm({ id, label, currentValue, extraHelpText, csrfToken, action }),
      )}"
    >
      <i class="fa fa-i-cursor"></i>
      <span>Change ${label}</span>
    </button>
  `;
}

function ChangeIdForm({
  id,
  label,
  currentValue,
  extraHelpText,
  csrfToken,
  action,
}: {
  id: string;
  label: string;
  currentValue: string;
  extraHelpText?: HtmlValue;
  csrfToken: string;
  action?: string;
}) {
  return html`
    <form name="change-id-form" class="needs-validation" method="POST" novalidate>
      <input type="hidden" name="__action" value="${action ?? 'change_id'}" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <div class="container p-0 mb-4">
        Use only letters, numbers, dashes, and underscores, with no spaces. You may use forward
        slashes to separate directories. ${extraHelpText ?? ''}
      </div>
      <div class="form-group">
        <label for="input-${id}">${label}:</label>
        <input
          type="text"
          class="form-control"
          id="input-${id}"
          name="id"
          value="${currentValue}"
          pattern="[\\-A-Za-z0-9_\\/]+"
          required
        />
      </div>
      <div class="text-right">
        <button type="button" class="btn btn-secondary" data-dismiss="popover">Cancel</button>
        <button type="submit" class="btn btn-primary">Change</button>
      </div>
    </form>
  `;
}
