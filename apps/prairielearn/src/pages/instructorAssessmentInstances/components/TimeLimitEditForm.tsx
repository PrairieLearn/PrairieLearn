import { Temporal } from '@js-temporal/polyfill';
import { useState } from 'preact/hooks';

import { formatDate } from '@prairielearn/formatter';

import { assertNever } from '../../../lib/types.js';

type TimeLimitAction =
  | 'set_total'
  | 'set_rem'
  | 'set_exact'
  | 'add'
  | 'subtract'
  | 'remove'
  | 'expire';

function TimeLimitExplanation({ action }: { action: TimeLimitAction }) {
  let explanation = '';
  switch (action) {
    case 'set_total':
      explanation =
        'Updating the total time limit will set the given amount of time for the assessment based on when the assessment was started.';
      break;
    case 'set_rem':
      explanation =
        'Updating the time remaining will set the given amount of time for the assessment based on the current time.';
      break;
    case 'set_exact':
      explanation = 'This will set the exact closing time for the assessment.';
      break;
    case 'add':
      explanation = 'This will add the given amount of time to the remaining time limit.';
      break;
    case 'subtract':
      explanation = 'This will subtract the given amount of time from the remaining time limit.';
      break;
    case 'remove':
      explanation = 'This will remove the time limit and the assessment will remain open.';
      break;
    case 'expire':
      explanation =
        'This will expire the time limit and students will be unable to submit any further answers.';
      break;
    default:
      assertNever(action);
  }
  return <small class="form-text text-muted">{explanation}</small>;
}

export function TimeLimitEditForm({
  row,
  csrfToken,
  timezone,
}: {
  row: {
    action: string | null;
    assessment_instance_id: number;
    date: string;
    has_closed_instance: boolean;
    has_open_instance: boolean;
    total_time: string;
    total_time_sec: number;
    time_remaining: string;
    time_remaining_sec: number | null;
    open: boolean;
  };
  csrfToken: string;
  timezone: string;
}) {
  const [form, setForm] = useState<{
    action: TimeLimitAction;
    time_add: number;
    date: string;
    reopen_closed: boolean;
    reopen_without_limit: boolean;
  }>(() => ({
    action: row.time_remaining_sec !== null ? 'add' : 'set_total',
    time_add: 5,
    date: Temporal.Now.zonedDateTimeISO(timezone).toPlainDateTime().toString().slice(0, 16),
    reopen_closed: false,
    reopen_without_limit: true,
  }));
  const showTimeLimitOptions =
    row.action === 'set_time_limit_all' || row.open || !form.reopen_without_limit;

  function updateFormState<T extends keyof typeof form>(key: T, value: (typeof form)[T]) {
    setForm({
      ...form,
      [key]: value,
    });
  }

  function proposedClosingTime() {
    const totalTime = Math.round(row.total_time_sec);

    let startDate = Temporal.Instant.from(row.date).toZonedDateTimeISO(timezone);
    if (form.action === 'set_total') {
      startDate = startDate.add({ minutes: form.time_add });
    } else if (form.action === 'set_rem') {
      startDate = Temporal.Now.zonedDateTimeISO(timezone).add({ minutes: form.time_add });
    } else if (form.action === 'add') {
      startDate = startDate.add({ seconds: totalTime }).add({ minutes: form.time_add });
    } else if (form.action === 'subtract') {
      startDate = startDate.add({ seconds: totalTime }).subtract({ minutes: form.time_add });
    }

    return formatDate(new Date(startDate.epochMilliseconds), timezone);
  }

  return (
    <form name="set-time-limit-form" class="js-popover-form" method="POST">
      <input type="hidden" name="__action" value={row.action ?? 'set_time_limit'} />
      <input type="hidden" name="__csrf_token" value={csrfToken} />
      {row.assessment_instance_id ? (
        <input type="hidden" name="assessment_instance_id" value={row.assessment_instance_id} />
      ) : null}
      {row.action !== 'set_time_limit_all' && !row.open ? (
        <div>
          <div class="form-check">
            <input
              class="form-check-input"
              type="radio"
              name="reopen_without_limit"
              id="reopen_without_limit"
              value="true"
              checked={form.reopen_without_limit}
              onClick={() => updateFormState('reopen_without_limit', true)}
            />
            <label class="form-check-label" for="reopen_without_limit">
              Re-open without time limit
            </label>
          </div>
          <div class="form-check">
            <input
              class="form-check-input"
              type="radio"
              name="reopen_without_limit"
              id="reopen_with_limit"
              value="false"
              checked={!form.reopen_without_limit}
              onClick={() => updateFormState('reopen_without_limit', false)}
            />
            <label class="form-check-label" for="reopen_with_limit">
              Re-open with time limit
            </label>
          </div>
        </div>
      ) : null}
      <p>
        Total time limit: {row.total_time}
        <br />
        Remaining time: {row.time_remaining}
      </p>
      {showTimeLimitOptions ? (
        <p>
          <select
            class="form-select select-time-limit"
            name="action"
            aria-label="Time limit options"
            value={form.action}
            onChange={(e) => updateFormState('action', e.currentTarget.value as TimeLimitAction)}
          >
            {row.time_remaining_sec !== null ? (
              row.has_open_instance ? (
                <>
                  <option value="add">Add to instances with time limit</option>
                  <option value="subtract">Subtract from instances with time limit</option>
                </>
              ) : (
                <>
                  <option value="add">Add</option>
                  <option value="subtract">Subtract</option>
                </>
              )
            ) : null}
            <option value="set_total">Set total time limit</option>
            <option value="set_rem">Set remaining time</option>
            <option value="set_exact">Set exact closing time</option>
            {row.action === 'set_time_limit_all' ||
            (row.open && row.time_remaining) !== 'Open (no time limit)' ? (
              <option value="remove">Remove time limit</option>
            ) : null}
            {row.open && row.time_remaining !== 'Expired' ? (
              <option value="expire">Expire time limit</option>
            ) : null}
          </select>
          <TimeLimitExplanation action={form.action} />
        </p>
      ) : null}
      {showTimeLimitOptions &&
      form.action !== 'set_exact' &&
      form.action !== 'remove' &&
      form.action !== 'expire' ? (
        <div class="input-group mb-2">
          <input
            class="form-control time-limit-field"
            type="number"
            name="time_add"
            aria-label="Time value"
            value={form.time_add}
            onChange={(e) => updateFormState('time_add', Number.parseFloat(e.currentTarget.value))}
          />
          <span class="input-group-text time-limit-field">minutes</span>
        </div>
      ) : null}
      {showTimeLimitOptions && form.action === 'set_exact' ? (
        <div class="input-group date-picker mb-2">
          <input
            class="form-control date-picker"
            type="datetime-local"
            name="date"
            value={form.date}
            onChange={(e) => updateFormState('date', e.currentTarget.value)}
          />
          <span class="input-group-text date-picker">{timezone}</span>
        </div>
      ) : null}
      {(row.open || !form.reopen_without_limit) &&
      (form.action === 'set_total' ||
        form.action === 'set_rem' ||
        form.action === 'add' ||
        form.action === 'subtract') ? (
        <p>Proposed closing time: {proposedClosingTime()}</p>
      ) : null}
      <p>
        {row.has_closed_instance ? (
          <div class="form-check">
            <input
              class="form-check-input"
              type="checkbox"
              name="reopen_closed"
              value="true"
              checked={form.reopen_closed}
              id="reopen_closed"
              onChange={(e) => updateFormState('reopen_closed', e.currentTarget.checked)}
            />
            <label class="form-check-label" for="reopen_closed">
              Also re-open closed instances
            </label>
          </div>
        ) : null}
      </p>
      <div class="btn-toolbar justify-content-end">
        <button type="button" class="btn btn-secondary me-2" data-bs-dismiss="popover">
          Cancel
        </button>
        <button type="submit" class="btn btn-primary">
          Set
        </button>
      </div>
    </form>
  );
}
