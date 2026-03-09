import clsx from 'clsx';
import { useCallback, useState } from 'react';
import { Alert, Button, Form, Offcanvas } from 'react-bootstrap';
import { FormProvider, useFieldArray, useForm } from 'react-hook-form';

import { OverlayTrigger } from '@prairielearn/ui';

import type { PageContext } from '../../../lib/client/page-context.js';

import { AccessControlSummary } from './AccessControlSummary.js';
import { ConfirmationModal } from './ConfirmationModal.js';
import { MainRuleForm } from './MainRuleForm.js';
import { OverrideRuleContent } from './OverrideRuleContent.js';
import { AppliesToField } from './fields/AppliesToField.js';
import {
  type AccessControlFormData,
  type AccessControlJsonWithId,
  createDefaultOverrideFormData,
  formDataToJson,
  jsonToMainRuleFormData,
  jsonToOverrideFormData,
} from './types.js';

interface AccessControlFormProps {
  initialData?: AccessControlJsonWithId[];
  onSubmit: (data: AccessControlJsonWithId[]) => void;
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  assessmentType?: 'Exam' | 'Homework';
  isSaving?: boolean;
}

const defaultInitialData: AccessControlJsonWithId[] = [];

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

export function AccessControlForm({
  initialData = defaultInitialData,
  onSubmit,
  courseInstance,
  isSaving = false,
}: AccessControlFormProps) {
  const [showMainRuleDrawer, setShowMainRuleDrawer] = useState(false);
  const [editingOverrideIndex, setEditingOverrideIndex] = useState<number | null>(null);
  const [deleteModalState, setDeleteModalState] = useState<{
    show: boolean;
    overrideIndex: number | null;
  }>({
    show: false,
    overrideIndex: null,
  });

  const mainRule = initialData[0]
    ? jsonToMainRuleFormData(initialData[0])
    : jsonToMainRuleFormData({ enabled: true, listBeforeRelease: true });
  const overrides = initialData.slice(1).map(jsonToOverrideFormData);

  const methods = useForm<AccessControlFormData>({
    mode: 'onChange',
    defaultValues: {
      mainRule,
      overrides,
    },
  });

  const {
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { isDirty, isValid, errors },
  } = methods;

  const {
    append: appendOverride,
    remove: removeOverride,
    move: moveOverride,
    insert: insertOverride,
  } = useFieldArray({
    name: 'overrides',
  });

  const watchedData = watch();

  const handleFormSubmit = (data: AccessControlFormData) => {
    const jsonOutput = formDataToJson(data);
    onSubmit(jsonOutput);
  };

  const addOverride = () => {
    const newOverride = createDefaultOverrideFormData();
    // Individual overrides are inserted before student-label overrides
    const firstLabelIndex = watchedData.overrides.findIndex(
      (o) => o.appliesTo.targetType === 'student_label',
    );
    if (firstLabelIndex === -1) {
      appendOverride(newOverride);
      setEditingOverrideIndex(watchedData.overrides.length);
    } else {
      insertOverride(firstLabelIndex, newOverride);
      setEditingOverrideIndex(firstLabelIndex);
    }
  };

  const handleDeleteClick = (index: number) => {
    setDeleteModalState({ show: true, overrideIndex: index });
  };

  const handleDeleteConfirm = () => {
    if (deleteModalState.overrideIndex !== null) {
      removeOverride(deleteModalState.overrideIndex);
    }
    setDeleteModalState({ show: false, overrideIndex: null });
  };

  const handleDeleteCancel = () => {
    setDeleteModalState({ show: false, overrideIndex: null });
  };

  const getOverrideName = (index: number): string => {
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
      const individuals = appliesTo.individuals;
      if (individuals.length === 0) return `Override ${index + 1}`;
      const getName = (ind: (typeof individuals)[0]) => ind.name || ind.uid;
      if (individuals.length === 1) return `Overrides for ${getName(individuals[0])}`;
      if (individuals.length === 2) {
        return `Overrides for ${getName(individuals[0])} and ${getName(individuals[1])}`;
      }
      return `Overrides for ${getName(individuals[0])}, ${getName(individuals[1])}, and ${individuals.length - 2} others`;
    }
  };

  const mainRuleErrors = collectErrorMessages(
    errors.mainRule as Record<string, unknown> | undefined,
  );
  const getOverrideErrors = useCallback(
    (index: number): string[] =>
      collectErrorMessages(errors.overrides?.[index] as Record<string, unknown> | undefined),
    [errors.overrides],
  );

  const saveDisabledReason = isSaving
    ? 'Saving...'
    : !isDirty
      ? 'No changes to save'
      : !isValid
        ? 'Fix validation errors before saving'
        : null;

  const saveButtonDisabled = saveDisabledReason !== null;

  const saveButton = (
    <button
      className={clsx('btn btn-sm', saveButtonDisabled ? 'btn-outline-secondary' : 'btn-primary')}
      type="submit"
      disabled={saveButtonDisabled}
    >
      <i className="bi bi-floppy" aria-hidden="true" /> Save and sync
    </button>
  );

  return (
    <FormProvider {...methods}>
      <Form onSubmit={handleSubmit(handleFormSubmit)}>
        <AccessControlSummary
          courseInstanceId={courseInstance.id}
          getOverrideName={getOverrideName}
          mainRule={watchedData.mainRule}
          overrides={watchedData.overrides}
          mainRuleErrors={mainRuleErrors}
          getOverrideErrors={getOverrideErrors}
          onAddOverride={addOverride}
          onRemoveOverride={handleDeleteClick}
          onMoveOverride={moveOverride}
          onEditMainRule={() => setShowMainRuleDrawer(true)}
          onEditOverride={(index) => setEditingOverrideIndex(index)}
        />

        <div className="d-flex gap-2 mt-3">
          {saveDisabledReason ? (
            <OverlayTrigger tooltip={{ props: { id: 'save-tooltip' }, body: saveDisabledReason }}>
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
      </Form>

      <Offcanvas
        show={showMainRuleDrawer}
        placement="end"
        style={{ width: '75vw' }}
        onHide={() => setShowMainRuleDrawer(false)}
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title className="d-flex align-items-center gap-2">
            Main rule
            <Button
              variant={watchedData.mainRule.enabled ? 'success' : 'outline-secondary'}
              size="sm"
              aria-pressed={watchedData.mainRule.enabled}
              onClick={() =>
                setValue('mainRule.enabled', !watchedData.mainRule.enabled, { shouldDirty: true })
              }
            >
              <i
                className={`bi bi-${watchedData.mainRule.enabled ? 'check-lg' : 'x-lg'} me-1`}
                aria-hidden="true"
              />
              {watchedData.mainRule.enabled ? 'Enabled' : 'Disabled'}
            </Button>
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          <MainRuleForm courseInstance={courseInstance} />
          <div className="mt-3">
            <Button variant="primary" onClick={() => setShowMainRuleDrawer(false)}>
              Done
            </Button>
          </div>
        </Offcanvas.Body>
      </Offcanvas>

      <Offcanvas
        show={editingOverrideIndex !== null}
        placement="end"
        style={{ width: '75vw' }}
        onHide={() => setEditingOverrideIndex(null)}
      >
        <Offcanvas.Header closeButton>
          <Offcanvas.Title className="d-flex align-items-center gap-2">
            {editingOverrideIndex !== null ? getOverrideName(editingOverrideIndex) : ''}
            {editingOverrideIndex !== null &&
              (() => {
                const overrideEnabled = watchedData.overrides[editingOverrideIndex]?.enabled;
                return (
                  <Button
                    variant={overrideEnabled ? 'success' : 'outline-secondary'}
                    size="sm"
                    aria-pressed={overrideEnabled}
                    onClick={() =>
                      setValue(`overrides.${editingOverrideIndex}.enabled`, !overrideEnabled, {
                        shouldDirty: true,
                      })
                    }
                  >
                    <i
                      className={`bi bi-${overrideEnabled ? 'check-lg' : 'x-lg'} me-1`}
                      aria-hidden="true"
                    />
                    {overrideEnabled ? 'Enabled' : 'Disabled'}
                  </Button>
                );
              })()}
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          {editingOverrideIndex !== null &&
            (() => {
              const override = watchedData.overrides[editingOverrideIndex];
              const hasNoTargets =
                (override.appliesTo.targetType === 'individual' &&
                  override.appliesTo.individuals.length === 0) ||
                (override.appliesTo.targetType === 'student_label' &&
                  override.appliesTo.studentLabels.length === 0);
              return (
                <>
                  {hasNoTargets && (
                    <Alert variant="warning">
                      This override has no targets. Add at least one student or student label for
                      this rule to take effect.
                    </Alert>
                  )}
                  <AppliesToField namePrefix={`overrides.${editingOverrideIndex}`} />
                  <OverrideRuleContent index={editingOverrideIndex} />
                  <div className="mt-3">
                    <Button variant="primary" onClick={() => setEditingOverrideIndex(null)}>
                      Done
                    </Button>
                  </div>
                </>
              );
            })()}
        </Offcanvas.Body>
      </Offcanvas>

      <ConfirmationModal
        show={deleteModalState.show}
        title="Delete override rule"
        message={`Are you sure you want to delete "${deleteModalState.overrideIndex !== null ? getOverrideName(deleteModalState.overrideIndex) : ''}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </FormProvider>
  );
}
