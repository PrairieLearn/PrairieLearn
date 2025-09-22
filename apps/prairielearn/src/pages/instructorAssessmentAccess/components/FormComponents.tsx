import { Form, InputGroup } from 'react-bootstrap';
import { type Control, type UseFormSetValue, useWatch } from 'react-hook-form';

import type { AccessControlFormData } from './types.js';
import { CollapsibleCard } from './CollapsibleCard.js';
import {
  SkeletonField,
  SkeletonDeadlineList,
  SkeletonAfterLastDeadline,
} from './SkeletonComponents.js';

interface BaseFormComponentProps {
  control: Control<AccessControlFormData>;
  namePrefix: string;
  setValue: UseFormSetValue<AccessControlFormData>;
  disabled?: boolean;
  collapsible?: boolean;
  showSkeleton?: boolean;
}

// Date Control Enabled Component
export function DateControlEnabledEffect({
  control,
  namePrefix,
  disabled,
  collapsible = true,
  showSkeleton = false,
}: BaseFormComponentProps) {
  const dateControlEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.enabled` as any,
    defaultValue: false,
  });

  const content = (
    <Form.Group class="mb-3">
      <Form.Check
        type="checkbox"
        label="Date Control Enabled"
        disabled={disabled}
        {...control.register(`${namePrefix}.dateControl.enabled` as any)}
      />
      <Form.Text class="text-muted">
        Enable or disable date-based access control for this override rule
      </Form.Text>
    </Form.Group>
  );

  const skeletonContent = (
    <SkeletonField
      label="Date Control Enabled"
      type="checkbox"
      placeholder="Not configured"
      description="Enable or disable date-based access control for this override rule"
    />
  );

  return (
    <CollapsibleCard
      title="Date Control"
      description="Control access and credit to your exam based on a schedule"
      collapsible={collapsible}
      defaultExpanded={dateControlEnabled}
      showSkeleton={showSkeleton}
      skeletonContent={skeletonContent}
    >
      {content}
    </CollapsibleCard>
  );
}

// Release Date Setting Component
export function ReleaseDateEffect({
  control,
  namePrefix,
  setValue,
  disabled,
  collapsible = true,
  showSkeleton = false,
}: BaseFormComponentProps) {
  const releaseDateEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.releaseDateEnabled` as any,
    defaultValue: false,
  });

  const content = (
    <Form.Group class="mb-3">
      <div class="mb-2">
        <Form.Check
          type="radio"
          id={`${namePrefix}-release-immediately`}
          label="Released immediately"
          checked={!releaseDateEnabled}
          disabled={disabled}
          onChange={() => {
            setValue(`${namePrefix}.dateControl.releaseDateEnabled` as any, false);
            setValue(`${namePrefix}.dateControl.releaseDate` as any, '');
          }}
        />
        <Form.Check
          type="radio"
          id={`${namePrefix}-release-after-date`}
          label="Released after date"
          checked={releaseDateEnabled}
          disabled={disabled}
          onChange={() => {
            setValue(`${namePrefix}.dateControl.releaseDateEnabled` as any, true);
          }}
        />
      </div>
      {releaseDateEnabled && (
        <Form.Control
          type="datetime-local"
          disabled={disabled}
          {...control.register(`${namePrefix}.dateControl.releaseDate` as any)}
        />
      )}
    </Form.Group>
  );

  const skeletonContent = (
    <SkeletonField
      label="Release Date"
      type="datetime"
      placeholder="No release date set"
      description="Configure when the assessment becomes available to students"
    />
  );

  return (
    <CollapsibleCard
      title="Release Date"
      collapsible={collapsible}
      defaultExpanded={releaseDateEnabled}
      showSkeleton={showSkeleton}
      skeletonContent={skeletonContent}
    >
      {content}
    </CollapsibleCard>
  );
}

// Due Date Setting Component
export function DueDateEffect({
  control,
  namePrefix,
  setValue,
  disabled,
  collapsible = true,
  showSkeleton = false,
}: BaseFormComponentProps) {
  const dueDateEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.dueDateEnabled` as any,
    defaultValue: false,
  });

  const content = (
    <Form.Group class="mb-3">
      <div class="mb-2">
        <Form.Check
          type="radio"
          id={`${namePrefix}-due-never`}
          label="No due date"
          checked={!dueDateEnabled}
          disabled={disabled}
          onChange={() => {
            setValue(`${namePrefix}.dateControl.dueDateEnabled` as any, false);
            setValue(`${namePrefix}.dateControl.dueDate` as any, '');
          }}
        />
        <Form.Check
          type="radio"
          id={`${namePrefix}-due-on-date`}
          label="Due on date"
          checked={dueDateEnabled}
          disabled={disabled}
          onChange={() => {
            setValue(`${namePrefix}.dateControl.dueDateEnabled` as any, true);
          }}
        />
      </div>
      {dueDateEnabled && (
        <Form.Control
          type="datetime-local"
          disabled={disabled}
          {...control.register(`${namePrefix}.dateControl.dueDate` as any)}
        />
      )}
    </Form.Group>
  );

  const skeletonContent = (
    <SkeletonField
      label="Due Date"
      type="datetime"
      placeholder="No due date set"
      description="Configure when the assessment is due"
    />
  );

  return (
    <CollapsibleCard
      title="Due Date"
      collapsible={collapsible}
      defaultExpanded={dueDateEnabled}
      showSkeleton={showSkeleton}
      skeletonContent={skeletonContent}
    >
      {content}
    </CollapsibleCard>
  );
}

// Early Deadline Setting Component (simplified)
export function EarlyDeadlineEffect({
  control,
  namePrefix,
  disabled,
  collapsible = true,
  showSkeleton = false,
}: BaseFormComponentProps) {
  const earlyDeadlinesEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.earlyDeadlinesEnabled` as any,
    defaultValue: false,
  });

  const content = (
    <Form.Group class="mb-3">
      <Form.Check
        type="checkbox"
        label="Early Deadlines Enabled"
        disabled={disabled}
        {...control.register(`${namePrefix}.dateControl.earlyDeadlinesEnabled` as any)}
      />
      <Form.Text class="text-muted">
        Enable early deadline management for this rule (full configuration available in main rule)
      </Form.Text>
    </Form.Group>
  );

  const skeletonContent = <SkeletonDeadlineList />;

  return (
    <CollapsibleCard
      title="Early Deadlines"
      collapsible={collapsible}
      defaultExpanded={earlyDeadlinesEnabled}
      showSkeleton={showSkeleton}
      skeletonContent={skeletonContent}
    >
      {content}
    </CollapsibleCard>
  );
}

// Late Deadline Setting Component (simplified)
export function LateDeadlineEffect({
  control,
  namePrefix,
  disabled,
  collapsible = true,
  showSkeleton = false,
}: BaseFormComponentProps) {
  const lateDeadlinesEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.lateDeadlinesEnabled` as any,
    defaultValue: false,
  });

  const content = (
    <Form.Group class="mb-3">
      <Form.Check
        type="checkbox"
        label="Late Deadlines Enabled"
        disabled={disabled}
        {...control.register(`${namePrefix}.dateControl.lateDeadlinesEnabled` as any)}
      />
      <Form.Text class="text-muted">
        Enable late deadline management for this rule (full configuration available in main rule)
      </Form.Text>
    </Form.Group>
  );

  const skeletonContent = <SkeletonDeadlineList />;

  return (
    <CollapsibleCard
      title="Late Deadlines"
      collapsible={collapsible}
      defaultExpanded={lateDeadlinesEnabled}
      showSkeleton={showSkeleton}
      skeletonContent={skeletonContent}
    >
      {content}
    </CollapsibleCard>
  );
}

// After Last Deadline Setting Component
export function AfterLastDeadlineEffect({
  control,
  namePrefix,
  setValue,
  disabled,
  collapsible = true,
  showSkeleton = false,
}: BaseFormComponentProps) {
  const allowSubmissions = useWatch({
    control,
    name: `${namePrefix}.dateControl.afterLastDeadline.allowSubmissions` as any,
    defaultValue: false,
  });

  const creditEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.afterLastDeadline.creditEnabled` as any,
    defaultValue: false,
  });

  // Determine the current radio selection based on existing fields
  const getAfterLastDeadlineMode = () => {
    if (!allowSubmissions) return 'no_submissions';
    if (allowSubmissions && !creditEnabled) return 'practice_submissions';
    if (allowSubmissions && creditEnabled) return 'partial_credit';
    return 'no_submissions';
  };

  const afterLastDeadlineMode = getAfterLastDeadlineMode();
  const isConfigured = allowSubmissions || creditEnabled;

  const content = (
    <Form.Group class="mb-3">
      <div class="mb-2">
        <Form.Check
          type="radio"
          id={`${namePrefix}-after-deadline-no-submissions`}
          label="No submissions allowed"
          checked={afterLastDeadlineMode === 'no_submissions'}
          disabled={disabled}
          onChange={() => {
            setValue(`${namePrefix}.dateControl.afterLastDeadline.allowSubmissions` as any, false);
            setValue(`${namePrefix}.dateControl.afterLastDeadline.creditEnabled` as any, false);
            setValue(`${namePrefix}.dateControl.afterLastDeadline.credit` as any, 0);
          }}
        />
        <Form.Check
          type="radio"
          id={`${namePrefix}-after-deadline-practice-submissions`}
          label="Allow practice submissions"
          checked={afterLastDeadlineMode === 'practice_submissions'}
          disabled={disabled}
          onChange={() => {
            setValue(`${namePrefix}.dateControl.afterLastDeadline.allowSubmissions` as any, true);
            setValue(`${namePrefix}.dateControl.afterLastDeadline.creditEnabled` as any, false);
            setValue(`${namePrefix}.dateControl.afterLastDeadline.credit` as any, 0);
          }}
        />
        <Form.Text class="text-muted ms-4">No credit is given for practice submissions</Form.Text>
        <Form.Check
          type="radio"
          id={`${namePrefix}-after-deadline-partial-credit`}
          label="Allow submissions for partial credit"
          checked={afterLastDeadlineMode === 'partial_credit'}
          disabled={disabled}
          onChange={() => {
            setValue(`${namePrefix}.dateControl.afterLastDeadline.allowSubmissions` as any, true);
            setValue(`${namePrefix}.dateControl.afterLastDeadline.creditEnabled` as any, true);
          }}
        />
      </div>

      {afterLastDeadlineMode === 'partial_credit' && (
        <div class="ms-4">
          <InputGroup>
            <Form.Control
              type="number"
              min="0"
              max="200"
              placeholder="Credit percentage"
              disabled={disabled}
              {...control.register(`${namePrefix}.dateControl.afterLastDeadline.credit` as any, {
                valueAsNumber: true,
              })}
            />
            <InputGroup.Text>%</InputGroup.Text>
          </InputGroup>
          <Form.Text class="text-muted">
            Students will receive this percentage of credit for submissions after the deadline
          </Form.Text>
        </div>
      )}
    </Form.Group>
  );

  const skeletonContent = <SkeletonAfterLastDeadline />;

  return (
    <CollapsibleCard
      title="After Last Deadline"
      collapsible={collapsible}
      defaultExpanded={isConfigured}
      showSkeleton={showSkeleton}
      skeletonContent={skeletonContent}
    >
      {content}
    </CollapsibleCard>
  );
}

// Time Limit Setting Component
export function TimeLimitEffect({
  control,
  namePrefix,
  disabled,
  collapsible = true,
  showSkeleton = false,
}: BaseFormComponentProps) {
  const durationMinutesEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.durationMinutesEnabled` as any,
    defaultValue: false,
  });

  const durationMinutes = useWatch({
    control,
    name: `${namePrefix}.dateControl.durationMinutes` as any,
  });

  const content = (
    <Form.Group class="mb-3">
      <div class="d-flex align-items-center mb-2">
        <Form.Check
          type="checkbox"
          class="me-2"
          disabled={disabled}
          {...control.register(`${namePrefix}.dateControl.durationMinutesEnabled` as any)}
        />
        <span class="mb-0">Time Limit</span>
      </div>
      {durationMinutesEnabled && (
        <InputGroup>
          <Form.Control
            type="number"
            placeholder="Duration in minutes"
            min="1"
            disabled={disabled}
            {...control.register(`${namePrefix}.dateControl.durationMinutes` as any, {
              valueAsNumber: true,
            })}
          />
          <InputGroup.Text>minutes</InputGroup.Text>
        </InputGroup>
      )}
      <Form.Text class="text-muted">
        {durationMinutesEnabled
          ? `Students will have ${durationMinutes || '[time]'} minutes to complete the assessment.`
          : 'Add a time limit to the assessment.'}
      </Form.Text>
    </Form.Group>
  );

  const skeletonContent = (
    <SkeletonField
      label="Time Limit"
      type="number"
      placeholder="No time limit set"
      unit="minutes"
      description="Add a time limit to the assessment"
    />
  );

  return (
    <CollapsibleCard
      title="Time Limit"
      collapsible={collapsible}
      defaultExpanded={durationMinutesEnabled}
      showSkeleton={showSkeleton}
      skeletonContent={skeletonContent}
    >
      {content}
    </CollapsibleCard>
  );
}

// Password Setting Component
export function PasswordEffect({
  control,
  namePrefix,
  disabled,
  collapsible = true,
  showSkeleton = false,
}: BaseFormComponentProps) {
  const passwordEnabled = useWatch({
    control,
    name: `${namePrefix}.dateControl.passwordEnabled` as any,
    defaultValue: false,
  });

  const content = (
    <Form.Group class="mb-3">
      <div class="d-flex align-items-center mb-2">
        <Form.Check
          type="checkbox"
          class="me-2"
          disabled={disabled}
          {...control.register(`${namePrefix}.dateControl.passwordEnabled` as any)}
        />
        <span class="mb-0">Password</span>
      </div>
      {passwordEnabled && (
        <Form.Control
          type="text"
          placeholder="Password"
          disabled={disabled}
          {...control.register(`${namePrefix}.dateControl.password` as any)}
        />
      )}
      <Form.Text class="text-muted">
        Require a password for students to start the assessment
      </Form.Text>
    </Form.Group>
  );

  const skeletonContent = (
    <SkeletonField
      label="Password"
      type="password"
      placeholder="No password set"
      description="Require a password for students to start the assessment"
    />
  );

  return (
    <CollapsibleCard
      title="Password"
      collapsible={collapsible}
      defaultExpanded={passwordEnabled}
      showSkeleton={showSkeleton}
      skeletonContent={skeletonContent}
    >
      {content}
    </CollapsibleCard>
  );
}

// Effect Type definitions
export type EffectType =
  | 'dateControlEnabled'
  | 'releaseDateSetting'
  | 'dueDateSetting'
  | 'earlyDeadlineSetting'
  | 'lateDeadlineSetting'
  | 'afterLastDeadlineSetting'
  | 'timeLimitSetting'
  | 'passwordSetting';

export const EFFECT_OPTIONS = [
  { value: 'dateControlEnabled', label: 'Date Control Enabled' },
  { value: 'releaseDateSetting', label: 'Release Date' },
  { value: 'dueDateSetting', label: 'Due Date' },
  { value: 'earlyDeadlineSetting', label: 'Early Deadlines' },
  { value: 'lateDeadlineSetting', label: 'Late Deadlines' },
  { value: 'afterLastDeadlineSetting', label: 'After Last Deadline' },
  { value: 'timeLimitSetting', label: 'Time Limit' },
  { value: 'passwordSetting', label: 'Password' },
] as const;

// Component mapper
export function renderEffect(effectType: EffectType, props: BaseFormComponentProps) {
  switch (effectType) {
    case 'dateControlEnabled':
      return <DateControlEnabledEffect {...props} />;
    case 'releaseDateSetting':
      return <ReleaseDateEffect {...props} />;
    case 'dueDateSetting':
      return <DueDateEffect {...props} />;
    case 'earlyDeadlineSetting':
      return <EarlyDeadlineEffect {...props} />;
    case 'lateDeadlineSetting':
      return <LateDeadlineEffect {...props} />;
    case 'afterLastDeadlineSetting':
      return <AfterLastDeadlineEffect {...props} />;
    case 'timeLimitSetting':
      return <TimeLimitEffect {...props} />;
    case 'passwordSetting':
      return <PasswordEffect {...props} />;
    default:
      return null;
  }
}
