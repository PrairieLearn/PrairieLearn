import { Temporal } from '@js-temporal/polyfill';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Button } from 'react-bootstrap';

import { formatDate } from '@prairielearn/formatter';
import { assertNever } from '@prairielearn/utils';

import { getAppError } from '../../../lib/client/errors.js';
import { useTRPC } from '../../../trpc/assessment/context.js';

import { useInvalidateAssessmentInstancesList } from './useInvalidateAssessmentInstancesList.js';

type TimeLimitAction =
  'set_total' | 'set_rem' | 'set_exact' | 'add' | 'subtract' | 'remove' | 'expire';

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
  return <small className="form-text text-muted">{explanation}</small>;
}

/** Data for the single instance targeted by the inline ✎ pencil. */
interface TimeLimitSingleRow {
  open: boolean;
  total_time: string;
  total_time_sec: number | null;
  time_remaining: string;
  time_remaining_sec: number | null;
  date: string;
}

export function TimeLimitEditForm({
  mode,
  assessmentInstanceIds,
  targetDescription,
  hasOpenInstance,
  hasClosedInstance,
  hasTimeLimitInstance,
  singleRow,
  timezone,
  onSuccess,
  onCancel,
}: {
  mode: 'single' | 'bulk';
  assessmentInstanceIds: string[] | null;
  targetDescription?: string;
  /** Whether the targeted instances include at least one open instance. */
  hasOpenInstance: boolean;
  /** Whether the targeted instances include at least one closed instance. */
  hasClosedInstance: boolean;
  /** Whether the targeted instances include at least one instance with a time limit. */
  hasTimeLimitInstance: boolean;
  /** Present only in single mode; describes the row behind the ✎ pencil. */
  singleRow?: TimeLimitSingleRow;
  timezone: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const trpc = useTRPC();
  const invalidateList = useInvalidateAssessmentInstancesList();
  const mutation = useMutation({
    ...trpc.assessmentInstances.setTimeLimit.mutationOptions(),
    onSuccess: async () => {
      await invalidateList();
      onSuccess();
    },
  });
  const appError = getAppError<never>(mutation.error);

  const canAddSubtract =
    mode === 'single' ? singleRow?.time_remaining_sec != null : hasTimeLimitInstance;

  const [form, setForm] = useState<{
    action: TimeLimitAction;
    /**
     * Kept as the raw input string so in-progress edits (empty, trailing dot)
     * aren't collapsed to NaN; parsed to a number only when used.
     */
    time_add: string;
    date: string;
    reopen_closed: boolean;
    reopen_without_limit: boolean;
  }>(() => ({
    action: canAddSubtract ? 'add' : 'set_total',
    time_add: '5',
    date: Temporal.Now.zonedDateTimeISO(timezone).toPlainDateTime().toString().slice(0, 16),
    reopen_closed: false,
    reopen_without_limit: true,
  }));
  const timeAddValue = Number.parseFloat(form.time_add);

  // In single mode a closed instance shows the re-open radios; choosing
  // "re-open without time limit" hides the time-limit options entirely.
  const showReopenRadios = mode === 'single' && singleRow != null && !singleRow.open;
  const showTimeLimitOptions = mode === 'bulk' || singleRow?.open || !form.reopen_without_limit;
  const showTimeAddInput =
    showTimeLimitOptions &&
    form.action !== 'set_exact' &&
    form.action !== 'remove' &&
    form.action !== 'expire';

  const showRemove =
    mode === 'bulk' ||
    (singleRow != null && singleRow.open && singleRow.time_remaining !== 'Open (no time limit)');
  const showExpire =
    mode === 'bulk'
      ? hasOpenInstance
      : singleRow != null && singleRow.open && singleRow.time_remaining !== 'Expired';

  function updateFormState<T extends keyof typeof form>(key: T, value: (typeof form)[T]) {
    setForm({ ...form, [key]: value });
  }

  function proposedClosingTime() {
    if (singleRow == null || !Number.isFinite(timeAddValue)) return null;
    const totalTime = Math.round(singleRow.total_time_sec ?? 0);

    try {
      let startDate = Temporal.Instant.from(singleRow.date).toZonedDateTimeISO(timezone);
      if (form.action === 'set_total') {
        startDate = startDate.add({ minutes: timeAddValue });
      } else if (form.action === 'set_rem') {
        startDate = Temporal.Now.zonedDateTimeISO(timezone).add({ minutes: timeAddValue });
      } else if (form.action === 'add') {
        startDate = startDate.add({ seconds: totalTime }).add({ minutes: timeAddValue });
      } else if (form.action === 'subtract') {
        startDate = startDate.add({ seconds: totalTime }).subtract({ minutes: timeAddValue });
      }

      return formatDate(new Date(startDate.epochMilliseconds), timezone);
    } catch (err) {
      // Errors here may be due to large values or invalid inputs.
      console.error('Error calculating proposed closing time:', err);
      return null;
    }
  }

  function handleSubmit() {
    const reopenWithoutLimit = showReopenRadios && form.reopen_without_limit;
    const action = reopenWithoutLimit ? 'reopen_without_limit' : form.action;
    const actionUsesTimeAdd =
      action === 'set_total' || action === 'set_rem' || action === 'add' || action === 'subtract';
    mutation.mutate({
      assessmentInstanceIds,
      action,
      time_add: actionUsesTimeAdd ? timeAddValue : undefined,
      date: form.date,
      // In single mode we always re-open the targeted instance (matching the
      // legacy ✎ behavior). In bulk mode this is the explicit checkbox.
      reopen_closed: mode === 'single' ? true : form.reopen_closed,
    });
  }

  const showProposedClosingTime =
    mode === 'single' &&
    (singleRow?.open || !form.reopen_without_limit) &&
    (form.action === 'set_total' ||
      form.action === 'set_rem' ||
      form.action === 'add' ||
      form.action === 'subtract');

  return (
    <form
      name="set-time-limit-form"
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
    >
      {showReopenRadios ? (
        <div>
          <div className="form-check">
            <input
              className="form-check-input"
              type="radio"
              name="reopen_without_limit"
              id="reopen_without_limit"
              checked={form.reopen_without_limit}
              onChange={() => updateFormState('reopen_without_limit', true)}
            />
            <label className="form-check-label" htmlFor="reopen_without_limit">
              Re-open without time limit
            </label>
          </div>
          <div className="form-check">
            <input
              className="form-check-input"
              type="radio"
              name="reopen_without_limit"
              id="reopen_with_limit"
              checked={!form.reopen_without_limit}
              onChange={() => updateFormState('reopen_without_limit', false)}
            />
            <label className="form-check-label" htmlFor="reopen_with_limit">
              Re-open with time limit
            </label>
          </div>
        </div>
      ) : null}
      {mode === 'single' && singleRow ? (
        <p>
          Total time limit: {singleRow.total_time}
          <br />
          Remaining time: {singleRow.time_remaining}
        </p>
      ) : (
        <p>{targetDescription}</p>
      )}
      {showTimeLimitOptions ? (
        <p>
          <select
            className="form-select select-time-limit"
            name="action"
            aria-label="Time limit options"
            value={form.action}
            onChange={(e) => updateFormState('action', e.currentTarget.value as TimeLimitAction)}
          >
            {canAddSubtract ? (
              mode === 'bulk' && hasOpenInstance ? (
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
            {showRemove ? <option value="remove">Remove time limit</option> : null}
            {showExpire ? <option value="expire">Expire time limit</option> : null}
          </select>
          <TimeLimitExplanation action={form.action} />
        </p>
      ) : null}
      {showTimeAddInput ? (
        <div className="input-group mb-2">
          <input
            className="form-control time-limit-field"
            type="number"
            name="time_add"
            aria-label="Time value"
            value={form.time_add}
            required
            onChange={(e) => updateFormState('time_add', e.currentTarget.value)}
          />
          <span className="input-group-text time-limit-field">minutes</span>
        </div>
      ) : null}
      {showTimeLimitOptions && form.action === 'set_exact' ? (
        <div className="input-group date-picker mb-2">
          <input
            className="form-control date-picker"
            type="datetime-local"
            name="date"
            aria-label="Closing date and time"
            value={form.date}
            required
            onChange={(e) => updateFormState('date', e.currentTarget.value)}
          />
          <span className="input-group-text date-picker">{timezone}</span>
        </div>
      ) : null}
      {showProposedClosingTime ? <p>Proposed closing time: {proposedClosingTime()}</p> : null}
      {mode === 'bulk' && hasClosedInstance ? (
        <div className="form-check mb-2">
          <input
            className="form-check-input"
            type="checkbox"
            name="reopen_closed"
            checked={form.reopen_closed}
            id="reopen_closed"
            onChange={(e) => updateFormState('reopen_closed', e.currentTarget.checked)}
          />
          <label className="form-check-label" htmlFor="reopen_closed">
            Also re-open closed instances
          </label>
        </div>
      ) : null}
      {appError ? (
        <Alert variant="danger" className="mt-2 mb-2">
          {appError.message}
        </Alert>
      ) : null}
      <div className="btn-toolbar justify-content-end">
        <Button type="button" variant="secondary" className="me-2" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving...' : 'Set'}
        </Button>
      </div>
    </form>
  );
}
