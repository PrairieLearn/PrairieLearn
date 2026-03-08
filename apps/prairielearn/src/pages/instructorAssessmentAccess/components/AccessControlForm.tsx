import { useState } from 'react';
import { Alert, Button, Form, Offcanvas, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { type FieldErrors, useFieldArray, useForm } from 'react-hook-form';

import type { PageContext } from '../../../lib/client/page-context.js';

import { AccessControlBreadcrumb } from './AccessControlBreadcrumb.js';
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
  jsonToFormData,
} from './types.js';

interface AccessControlFormProps {
  initialData?: AccessControlJsonWithId[];
  onSubmit: (data: AccessControlJsonWithId[]) => void;
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  assessmentType?: 'Exam' | 'Homework';
  isSaving?: boolean;
}

const defaultInitialData: AccessControlJsonWithId[] = [];

function collectErrorMessages(errors: FieldErrors<AccessControlFormData>, prefix = ''): string[] {
  const messages: string[] = [];
  for (const [key, value] of Object.entries(errors)) {
    if (!value) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value.message === 'string') {
      messages.push(`${path}: ${value.message}`);
    } else if (typeof value === 'object') {
      messages.push(...collectErrorMessages(value as FieldErrors<AccessControlFormData>, path));
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
    ? jsonToFormData(initialData[0], true)
    : jsonToFormData({ enabled: true, listBeforeRelease: true }, true);
  const overrides = initialData.slice(1).map((json) => jsonToFormData(json, false));

  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { isDirty, isValid, errors },
  } = useForm<AccessControlFormData>({
    mode: 'onChange',
    defaultValues: {
      mainRule,
      overrides,
    },
  });

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
    const override = watchedData.overrides[index] as
      | AccessControlFormData['overrides'][number]
      | undefined;
    const appliesTo = override?.appliesTo;
    if (!appliesTo) {
      return `Override ${index + 1}`;
    }

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

  const errorMessages = collectErrorMessages(errors);
  const saveDisabledReason = isSaving
    ? 'Saving...'
    : !isDirty
      ? 'No changes to save'
      : !isValid
        ? 'Fix validation errors before saving'
        : null;

  const saveButton = (
    <Button type="submit" variant="primary" disabled={saveDisabledReason !== null}>
      {isSaving ? 'Saving...' : 'Save changes'}
    </Button>
  );

  return (
    <div>
      <Form onSubmit={handleSubmit(handleFormSubmit)}>
        <AccessControlBreadcrumb />

        <div className="mb-4">
          <AccessControlSummary
            courseInstanceId={courseInstance.id}
            getOverrideName={getOverrideName}
            mainRule={watchedData.mainRule}
            overrides={watchedData.overrides}
            onAddOverride={addOverride}
            onRemoveOverride={handleDeleteClick}
            onMoveOverride={moveOverride}
            onEditMainRule={() => setShowMainRuleDrawer(true)}
            onEditOverride={(index) => setEditingOverrideIndex(index)}
          />
        </div>

        {errorMessages.length > 0 && (
          <Alert variant="danger">
            <Alert.Heading as="h6">Please fix the following errors:</Alert.Heading>
            <ul className="mb-0">
              {errorMessages.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </Alert>
        )}

        <div className="mt-4 d-flex gap-2">
          {saveDisabledReason ? (
            <OverlayTrigger overlay={<Tooltip id="save-tooltip">{saveDisabledReason}</Tooltip>}>
              <span className="d-inline-block">{saveButton}</span>
            </OverlayTrigger>
          ) : (
            saveButton
          )}
          <Button
            type="button"
            variant="outline-secondary"
            disabled={!isDirty || isSaving}
            onClick={() => reset()}
          >
            Reset
          </Button>
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
              onClick={() =>
                setValue('mainRule.enabled', !watchedData.mainRule.enabled, { shouldDirty: true })
              }
            >
              <i className={`bi bi-${watchedData.mainRule.enabled ? 'check-lg' : 'x-lg'} me-1`} />
              {watchedData.mainRule.enabled ? 'Enabled' : 'Disabled'}
            </Button>
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          <MainRuleForm control={control} courseInstance={courseInstance} setValue={setValue} />
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
                    onClick={() =>
                      setValue(`overrides.${editingOverrideIndex}.enabled`, !overrideEnabled, {
                        shouldDirty: true,
                      })
                    }
                  >
                    <i className={`bi bi-${overrideEnabled ? 'check-lg' : 'x-lg'} me-1`} />
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
                  <AppliesToField
                    control={control}
                    setValue={setValue}
                    namePrefix={`overrides.${editingOverrideIndex}`}
                  />
                  <OverrideRuleContent
                    control={control}
                    index={editingOverrideIndex}
                    setValue={setValue}
                  />
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
    </div>
  );
}
