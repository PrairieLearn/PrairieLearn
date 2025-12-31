import { Temporal } from '@js-temporal/polyfill';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'preact/compat';
import { Button, Form, InputGroup } from 'react-bootstrap';

import { formatDate } from '@prairielearn/formatter';
import { OverlayTrigger } from '@prairielearn/ui';

import { assertNever } from '../../../lib/types.js';

type TimeLimitAction =
  | 'set_total'
  | 'set_rem'
  | 'set_exact'
  | 'add'
  | 'subtract'
  | 'remove'
  | 'expire';

export interface TimeLimitRowData {
  action?: string | null;
  assessment_instance_id?: string;
  date?: string;
  has_closed_instance?: boolean;
  has_open_instance?: boolean;
  total_time: string;
  total_time_sec: number | null;
  time_remaining: string;
  time_remaining_sec: number | null;
  open?: boolean | null;
}

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
  return <Form.Text class="text-muted">{explanation}</Form.Text>;
}

export interface TimeLimitEditFormProps {
  row: TimeLimitRowData;
  csrfToken: string;
  timezone: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function TimeLimitEditForm({
  row,
  csrfToken,
  timezone,
  onSuccess,
  onCancel,
}: TimeLimitEditFormProps) {
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

  const mutation = useMutation({
    mutationFn: async (formData: URLSearchParams) => {
      const res = await fetch(window.location.pathname, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      if (!res.ok) throw new Error('Failed to update time limit');
      return res.json();
    },
    onSuccess,
  });

  const showTimeLimitOptions =
    row.action === 'set_time_limit_all' || row.open || !form.reopen_without_limit;

  function updateFormState<T extends keyof typeof form>(key: T, value: (typeof form)[T]) {
    setForm({
      ...form,
      [key]: value,
    });
  }

  function proposedClosingTime() {
    const totalTime = Math.round(row.total_time_sec ?? 0);

    let startDate = Temporal.Instant.from(row.date ?? new Date().toISOString()).toZonedDateTimeISO(
      timezone,
    );
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const formData = new URLSearchParams();
    formData.set('__action', row.action ?? 'set_time_limit');
    formData.set('__csrf_token', csrfToken);

    if (row.assessment_instance_id) {
      formData.set('assessment_instance_id', row.assessment_instance_id);
    }

    if (row.action !== 'set_time_limit_all' && !row.open && form.reopen_without_limit) {
      formData.set('reopen_without_limit', 'true');
    } else if (showTimeLimitOptions) {
      formData.set('action', form.action);
      if (form.action === 'set_exact') {
        formData.set('date', form.date);
      } else if (form.action !== 'remove' && form.action !== 'expire') {
        formData.set('time_add', form.time_add.toString());
      }
    }

    if (form.reopen_closed) {
      formData.set('reopen_closed', 'true');
    }

    mutation.mutate(formData);
  }

  return (
    <Form onSubmit={handleSubmit}>
      {row.action !== 'set_time_limit_all' && !row.open ? (
        <div class="mb-3">
          <Form.Check
            checked={form.reopen_without_limit}
            id="reopen_without_limit"
            label="Re-open without time limit"
            name="reopen_without_limit"
            type="radio"
            onChange={() => updateFormState('reopen_without_limit', true)}
          />
          <Form.Check
            checked={!form.reopen_without_limit}
            id="reopen_with_limit"
            label="Re-open with time limit"
            name="reopen_without_limit"
            type="radio"
            onChange={() => updateFormState('reopen_without_limit', false)}
          />
        </div>
      ) : null}

      <p class="mb-2">
        Total time limit: {row.total_time}
        <br />
        Remaining time: {row.time_remaining}
      </p>

      {showTimeLimitOptions ? (
        <Form.Group class="mb-3">
          <Form.Select
            aria-label="Time limit options"
            name="action"
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
            (row.open && row.time_remaining !== 'Open (no time limit)') ? (
              <option value="remove">Remove time limit</option>
            ) : null}
            {row.open && row.time_remaining !== 'Expired' ? (
              <option value="expire">Expire time limit</option>
            ) : null}
          </Form.Select>
          <TimeLimitExplanation action={form.action} />
        </Form.Group>
      ) : null}

      {showTimeLimitOptions &&
      form.action !== 'set_exact' &&
      form.action !== 'remove' &&
      form.action !== 'expire' ? (
        <InputGroup class="mb-3">
          <Form.Control
            aria-label="Time value"
            name="time_add"
            type="number"
            value={form.time_add}
            onChange={(e) => updateFormState('time_add', Number.parseFloat(e.currentTarget.value))}
          />
          <InputGroup.Text>minutes</InputGroup.Text>
        </InputGroup>
      ) : null}

      {showTimeLimitOptions && form.action === 'set_exact' ? (
        <InputGroup class="mb-3">
          <Form.Control
            name="date"
            type="datetime-local"
            value={form.date}
            onChange={(e) => updateFormState('date', e.currentTarget.value)}
          />
          <InputGroup.Text>{timezone}</InputGroup.Text>
        </InputGroup>
      ) : null}

      {(row.open || !form.reopen_without_limit) &&
      (form.action === 'set_total' ||
        form.action === 'set_rem' ||
        form.action === 'add' ||
        form.action === 'subtract') ? (
        <p class="mb-2">Proposed closing time: {proposedClosingTime()}</p>
      ) : null}

      {row.has_closed_instance ? (
        <Form.Check
          checked={form.reopen_closed}
          class="mb-3"
          id="reopen_closed"
          label="Also re-open closed instances"
          name="reopen_closed"
          type="checkbox"
          onChange={(e) => updateFormState('reopen_closed', e.currentTarget.checked)}
        />
      ) : null}

      {mutation.isError && (
        <div class="alert alert-danger mb-3" role="alert">
          {mutation.error.message}
        </div>
      )}

      <div class="d-flex justify-content-end gap-2">
        <Button disabled={mutation.isPending} variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={mutation.isPending} type="submit" variant="primary">
          {mutation.isPending ? 'Saving...' : 'Set'}
        </Button>
      </div>
    </Form>
  );
}

interface TimeLimitPopoverProps {
  row: TimeLimitRowData;
  csrfToken: string;
  timezone: string;
  onSuccess: () => void;
  children: React.ReactNode;
  placement?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
}

export function TimeLimitPopover({
  row,
  csrfToken,
  timezone,
  onSuccess,
  children,
  placement = 'auto',
}: TimeLimitPopoverProps) {
  const [show, setShow] = useState(false);

  const title =
    row.action === 'set_time_limit_all'
      ? 'Change Time Limits'
      : row.open
        ? 'Change Time Limit'
        : 'Re-Open Instance';

  return (
    <OverlayTrigger
      placement={placement}
      popover={{
        header: title,
        body: (
          <TimeLimitEditForm
            csrfToken={csrfToken}
            row={row}
            timezone={timezone}
            onCancel={() => setShow(false)}
            onSuccess={() => {
              onSuccess();
              setShow(false);
            }}
          />
        ),
        props: {
          id: `time-limit-popover-${row.assessment_instance_id ?? 'all'}`,
          class: 'popover-narrow-fixed',
        },
      }}
      popperConfig={{
        strategy: 'fixed',
        modifiers: [
          {
            name: 'computeStyles',
            options: {
              gpuAcceleration: false,
            },
          },
        ],
      }}
      show={show}
      trigger="click"
      rootClose
      onToggle={(nextShow) => setShow(nextShow)}
    >
      {children as React.ReactElement}
    </OverlayTrigger>
  );
}
