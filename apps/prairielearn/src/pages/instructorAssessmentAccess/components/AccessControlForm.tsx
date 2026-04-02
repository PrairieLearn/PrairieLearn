import clsx from 'clsx';
import { type ReactNode, useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { FormProvider, useFieldArray, useForm } from 'react-hook-form';

import { OverlayTrigger, SplitPane, useModalState } from '@prairielearn/ui';

import type { PageContext } from '../../../lib/client/page-context.js';
import type { AccessControlJsonWithId } from '../../../models/assessment-access-control-rules.js';

import { AccessControlSummary } from './AccessControlSummary.js';
import { MainRuleForm } from './MainRuleForm.js';
import { OverrideRuleContent } from './OverrideRuleContent.js';
import { AppliesToField } from './fields/AppliesToField.js';
import {
  type AccessControlFormData,
  createDefaultOverrideFormData,
  formDataToJson,
  jsonToMainRuleFormData,
  jsonToOverrideFormData,
} from './types.js';

const defaultInitialData: AccessControlJsonWithId[] = [];

/**
 * Use an initial width of 560px for the right panel, to accomodate fitting
 * deadline override inputs onto a single line.
 */
const accessControlFormInitialRightWidth = 560;

/**
 * Maps react-hook-form error field keys to human-friendly labels.
 * Keys at any depth in the error object are matched.
 */
const FIELD_LABELS: Record<string, string> = {
  examUuid: 'Exam UUID',
  releaseDate: 'Release date',
  dueDate: 'Due date',
  durationMinutes: 'Time limit',
  password: 'Password',
};

/**
 * Array field keys that should produce indexed labels like "Early deadline 1".
 * When a numeric index is encountered under one of these keys, the label is
 * built from the array name + 1-based index and used as context for child errors.
 */
const ARRAY_LABELS: Record<string, string> = {
  earlyDeadlines: 'Early deadline',
  lateDeadlines: 'Late deadline',
  prairieTestExams: 'Exam',
};

function collectErrorMessages(
  errors: Record<string, unknown> | undefined,
  parentKey?: string,
  parentArrayLabel?: string,
): string[] {
  if (!errors) return [];
  const messages: string[] = [];
  for (const [key, value] of Object.entries(errors)) {
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (typeof obj.message === 'string') {
        const label = FIELD_LABELS[key] ?? parentKey;
        messages.push(label ? `${label}: ${obj.message}` : obj.message);
      } else if (ARRAY_LABELS[key]) {
        messages.push(...collectErrorMessages(obj, parentKey, ARRAY_LABELS[key]));
      } else if (parentArrayLabel && /^\d+$/.test(key)) {
        const indexedLabel = `${parentArrayLabel} ${Number(key) + 1}`;
        messages.push(...collectErrorMessages(obj, indexedLabel));
      } else {
        messages.push(
          ...collectErrorMessages(obj, FIELD_LABELS[key] ?? parentKey, parentArrayLabel),
        );
      }
    }
  }
  return messages;
}

type SelectedRule = { type: 'main' } | { type: 'override'; index: number } | null;

export function AccessControlForm({
  initialData = defaultInitialData,
  onSubmit,
  courseInstance,
  isSaving = false,
  alert,
}: {
  initialData?: AccessControlJsonWithId[];
  onSubmit: (data: AccessControlJsonWithId[]) => void;
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  isSaving?: boolean;
  alert?: ReactNode;
}) {
  const [selectedRule, setSelectedRule] = useState<SelectedRule>(null);
  const deleteModal = useModalState<{ index: number; name: string }>();

  const displayTimezone = courseInstance.display_timezone;
  const mainRule = initialData[0]
    ? jsonToMainRuleFormData(initialData[0], displayTimezone)
    : jsonToMainRuleFormData({ listBeforeRelease: false }, displayTimezone);
  const overrides = initialData.slice(1).map((o) => jsonToOverrideFormData(o, displayTimezone));

  const methods = useForm<AccessControlFormData>({
    mode: 'onChange',
    defaultValues: {
      mainRule,
      overrides,
    },
  });

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isDirty, isValid, errors },
  } = methods;

  const {
    append: appendOverride,
    remove: removeOverride,
    move: moveOverride,
    insert: insertOverride,
  } = useFieldArray({
    control,
    name: 'overrides',
  });

  const watchedData = watch();

  const handleFormSubmit = (data: AccessControlFormData) => {
    const jsonOutput = formDataToJson(data, displayTimezone);
    onSubmit(jsonOutput);
  };

  const addOverride = () => {
    const newOverride = createDefaultOverrideFormData();
    // Enrollment overrides are inserted before student-label overrides
    const firstLabelIndex = watchedData.overrides.findIndex(
      (o) => o.appliesTo.targetType === 'student_label',
    );
    if (firstLabelIndex === -1) {
      appendOverride(newOverride);
      setSelectedRule({ type: 'override', index: watchedData.overrides.length });
    } else {
      insertOverride(firstLabelIndex, newOverride);
      setSelectedRule({ type: 'override', index: firstLabelIndex });
    }
  };

  const handleDeleteClick = (index: number) => {
    deleteModal.showWithData({ index, name: getOverrideName(index) });
  };

  const handleDeleteConfirm = () => {
    if (deleteModal.data !== null) {
      const deletedIndex = deleteModal.data.index;
      if (selectedRule?.type === 'override') {
        if (selectedRule.index === deletedIndex) {
          setSelectedRule(null);
        } else if (selectedRule.index > deletedIndex) {
          setSelectedRule({ type: 'override', index: selectedRule.index - 1 });
        }
      }
      removeOverride(deletedIndex);
    }
    deleteModal.hide();
  };

  const getOverrideName = (index: number): string => {
    if (index >= watchedData.overrides.length) return `Override ${index + 1}`;
    const override = watchedData.overrides[index];
    const appliesTo = override.appliesTo;

    if (appliesTo.targetType === 'student_label') {
      const studentLabels = appliesTo.studentLabels;
      if (studentLabels.length === 0) return `Override ${index + 1}`;
      if (studentLabels.length === 1) return `Overrides for ${studentLabels[0].name}`;
      if (studentLabels.length === 2) {
        return `Overrides for ${studentLabels[0].name} and ${studentLabels[1].name}`;
      }
      return `Overrides for ${studentLabels[0].name}, ${studentLabels[1].name}, and ${studentLabels.length - 2} others`;
    } else {
      const enrollments = appliesTo.enrollments;
      if (enrollments.length === 0) return `Override ${index + 1}`;
      const getName = (e: (typeof enrollments)[0]) => e.name || e.uid;
      if (enrollments.length === 1) return `Overrides for ${getName(enrollments[0])}`;
      if (enrollments.length === 2) {
        return `Overrides for ${getName(enrollments[0])} and ${getName(enrollments[1])}`;
      }
      return `Overrides for ${getName(enrollments[0])}, ${getName(enrollments[1])}, and ${enrollments.length - 2} others`;
    }
  };

  const mainRuleErrors = collectErrorMessages(
    errors.mainRule as Record<string, unknown> | undefined,
  );
  const getOverrideErrors = (index: number): string[] =>
    collectErrorMessages(errors.overrides?.[index] as Record<string, unknown> | undefined);

  const saveDisabledReason = isSaving
    ? 'Saving...'
    : !isDirty
      ? 'No changes to save'
      : !isValid
        ? 'Fix validation errors before saving'
        : null;

  const saveButton = (
    <button
      className={clsx('btn btn-sm', saveDisabledReason ? 'btn-outline-secondary' : 'btn-primary')}
      type="submit"
      disabled={saveDisabledReason !== null}
    >
      <i className="bi bi-floppy" aria-hidden="true" /> Save and sync
    </button>
  );

  const rightTitle =
    selectedRule?.type === 'main'
      ? 'Defaults'
      : selectedRule?.type === 'override'
        ? getOverrideName(selectedRule.index)
        : undefined;

  const rightHeaderAction = selectedRule ? (
    <button
      type="button"
      className="btn btn-sm btn-outline-secondary"
      aria-label="Close detail panel"
      onClick={() => setSelectedRule(null)}
    >
      <i className="bi bi-x-lg" aria-hidden="true" />
    </button>
  ) : undefined;

  const rightPanel =
    selectedRule?.type === 'main' ? (
      <div className="p-3">
        <MainRuleForm />
      </div>
    ) : selectedRule?.type === 'override' ? (
      (() => {
        if (selectedRule.index >= watchedData.overrides.length) {
          return null;
        }
        const override = watchedData.overrides[selectedRule.index];
        const hasNoTargets =
          (override.appliesTo.targetType === 'enrollment' &&
            override.appliesTo.enrollments.length === 0) ||
          (override.appliesTo.targetType === 'student_label' &&
            override.appliesTo.studentLabels.length === 0);
        return (
          <div className="p-3">
            {hasNoTargets && (
              <Alert variant="warning">
                This override has no targets. Add at least one student or student label for this
                rule to take effect.
              </Alert>
            )}
            <p className="text-muted">
              Fields that are not overridden inherit their values from the defaults and any earlier
              overrides. Click "Override" on a field to set a custom value for this group.
            </p>
            <AppliesToField namePrefix={`overrides.${selectedRule.index}`} />
            <OverrideRuleContent index={selectedRule.index} />
          </div>
        );
      })()
    ) : null;

  return (
    <FormProvider {...methods}>
      <Form style={{ height: '100%' }} onSubmit={handleSubmit(handleFormSubmit)}>
        <SplitPane
          forceOpen={selectedRule}
          left={{
            content: (
              <div className="p-3">
                {alert}
                <AccessControlSummary
                  courseInstanceId={courseInstance.id}
                  displayTimezone={courseInstance.display_timezone}
                  getOverrideName={getOverrideName}
                  mainRule={watchedData.mainRule}
                  overrides={watchedData.overrides}
                  mainRuleErrors={mainRuleErrors}
                  getOverrideErrors={getOverrideErrors}
                  onAddOverride={addOverride}
                  onRemoveOverride={handleDeleteClick}
                  onMoveOverride={moveOverride}
                  onEditMainRule={() => setSelectedRule({ type: 'main' })}
                  onEditOverride={(index) => setSelectedRule({ type: 'override', index })}
                />
                <div className="d-flex gap-2 mt-3">
                  {saveDisabledReason ? (
                    <OverlayTrigger
                      tooltip={{ props: { id: 'save-tooltip' }, body: saveDisabledReason }}
                    >
                      <span className="d-inline-block">{saveButton}</span>
                    </OverlayTrigger>
                  ) : (
                    saveButton
                  )}
                  {isDirty && (
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      type="button"
                      disabled={isSaving}
                      onClick={() => reset()}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ),
          }}
          right={{
            content: rightPanel,
            title: rightTitle,
            headerAction: rightHeaderAction,
            collapsed: selectedRule == null ? true : undefined,
            initialWidth: accessControlFormInitialRightWidth,
          }}
          onClose={() => setSelectedRule(null)}
        />
      </Form>

      <Modal show={deleteModal.show} onHide={deleteModal.hide}>
        <Modal.Header closeButton>
          <Modal.Title>Delete override</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to delete &quot;{deleteModal.data?.name ?? ''}&quot;? This action
          cannot be undone.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={deleteModal.hide}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteConfirm}>
            Delete
          </Button>
        </Modal.Footer>
      </Modal>
    </FormProvider>
  );
}
