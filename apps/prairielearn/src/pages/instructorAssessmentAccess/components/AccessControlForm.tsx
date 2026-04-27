import clsx from 'clsx';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import { FormProvider, useFieldArray, useForm } from 'react-hook-form';

import { OverlayTrigger, SplitPane, StickyActionBar, useModalState } from '@prairielearn/ui';

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
import { type AccessControlFormFieldPath, getGlobalDateValidationErrors } from './validation.js';

const defaultInitialData: AccessControlJsonWithId[] = [];

/**
 * Use an initial width of 560px for the right panel, to accomodate fitting
 * deadline override inputs onto a single line.
 */
const accessControlFormInitialRightWidth = 560;

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
    : jsonToMainRuleFormData({}, displayTimezone);
  const overrides = initialData.slice(1).map((o) => jsonToOverrideFormData(o, displayTimezone));

  const methods = useForm<AccessControlFormData>({
    mode: 'onChange',
    defaultValues: {
      mainRule,
      overrides,
    },
  });

  const {
    clearErrors,
    control,
    getFieldState,
    handleSubmit,
    setError,
    watch,
    reset,
    formState: { isDirty, isValid },
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
  const manualErrorPathsRef = useRef<Set<AccessControlFormFieldPath>>(new Set());

  // Sync cross-field date validation errors into react-hook-form as manual errors,
  // and clear them when the underlying issues are resolved.
  useEffect(() => {
    const nextManualErrors = new Map<AccessControlFormFieldPath, string>();
    for (const error of getGlobalDateValidationErrors(watchedData)) {
      nextManualErrors.set(error.path, error.message);
    }

    const candidatePaths = new Set<AccessControlFormFieldPath>([
      ...manualErrorPathsRef.current,
      ...nextManualErrors.keys(),
    ]);

    for (const path of candidatePaths) {
      const fieldState = getFieldState(path);
      const nextMessage = nextManualErrors.get(path);

      if (nextMessage) {
        if (fieldState.error?.type !== 'manual') {
          if (!fieldState.error) {
            setError(path, { type: 'manual', message: nextMessage });
          }
        } else if (fieldState.error.message !== nextMessage) {
          setError(path, { type: 'manual', message: nextMessage });
        }
      } else if (fieldState.error?.type === 'manual') {
        clearErrors(path);
      }
    }

    manualErrorPathsRef.current = new Set(nextManualErrors.keys());
  }, [clearErrors, getFieldState, setError, watchedData]);

  const handleFormSubmit = (data: AccessControlFormData) => {
    onSubmit(formDataToJson(data));
  };

  const addOverride = () => {
    const newOverride = createDefaultOverrideFormData(watchedData.mainRule);
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
      if (studentLabels.length === 1) return studentLabels[0].name;
      if (studentLabels.length === 2) {
        return `${studentLabels[0].name} and ${studentLabels[1].name}`;
      }
      const remaining = studentLabels.length - 2;
      return `${studentLabels[0].name}, ${studentLabels[1].name}, and ${remaining} ${remaining === 1 ? 'other' : 'others'}`;
    } else {
      const enrollments = appliesTo.enrollments;
      if (enrollments.length === 0) return `Override ${index + 1}`;
      const getName = (e: (typeof enrollments)[0]) => e.name || e.uid;
      if (enrollments.length === 1) return getName(enrollments[0]);
      if (enrollments.length === 2) {
        return `${getName(enrollments[0])} and ${getName(enrollments[1])}`;
      }
      const remaining = enrollments.length - 2;
      return `${getName(enrollments[0])}, ${getName(enrollments[1])}, and ${remaining} ${remaining === 1 ? 'other' : 'others'}`;
    }
  };

  const hasManualErrors = getGlobalDateValidationErrors(watchedData).length > 0;

  const saveDisabledReason = isSaving
    ? 'Saving...'
    : !isDirty
      ? 'No changes to save'
      : !isValid || hasManualErrors
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
      <div className="px-3 pb-3">
        <MainRuleForm displayTimezone={displayTimezone} />
      </div>
    ) : selectedRule?.type === 'override' ? (
      (() => {
        if (selectedRule.index >= watchedData.overrides.length) {
          return null;
        }
        return (
          <div className="px-3 pb-3">
            <AppliesToField
              namePrefix={`overrides.${selectedRule.index}`}
              courseInstanceId={courseInstance.id}
            />
            <OverrideRuleContent index={selectedRule.index} displayTimezone={displayTimezone} />
          </div>
        );
      })()
    ) : null;

  return (
    <FormProvider {...methods}>
      <Form
        style={{ height: '100%' }}
        onSubmit={handleSubmit(handleFormSubmit)}
        // Prevent Enter from submitting the form on inputs like date fields.
        onKeyDown={(e) => {
          if (
            e.key === 'Enter' &&
            e.target instanceof HTMLElement &&
            e.target.tagName !== 'BUTTON' &&
            e.target.tagName !== 'TEXTAREA'
          ) {
            e.preventDefault();
          }
        }}
      >
        <SplitPane
          forceOpen={selectedRule}
          left={{
            content: (
              <>
                <div className="p-3">
                  {alert}
                  <AccessControlSummary
                    displayTimezone={courseInstance.display_timezone}
                    getOverrideName={getOverrideName}
                    mainRule={watchedData.mainRule}
                    overrides={watchedData.overrides}
                    onAddOverride={addOverride}
                    onRemoveOverride={handleDeleteClick}
                    onMoveOverride={moveOverride}
                    onEditMainRule={() => setSelectedRule({ type: 'main' })}
                    onClearMainRule={() =>
                      reset(
                        {
                          mainRule: jsonToMainRuleFormData({}, displayTimezone),
                          overrides: watch('overrides'),
                        },
                        {
                          // Keep original defaults so the form stays dirty and the save button enables.
                          keepDefaultValues: true,
                        },
                      )
                    }
                    onEditOverride={(index) => setSelectedRule({ type: 'override', index })}
                  />
                </div>
                <StickyActionBar
                  message={isDirty ? 'You have unsaved changes' : 'No unsaved changes'}
                  actions={
                    <>
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        type="button"
                        disabled={isSaving || !isDirty}
                        onClick={() => reset()}
                      >
                        Cancel
                      </button>
                      {saveDisabledReason ? (
                        <OverlayTrigger
                          tooltip={{ props: { id: 'save-tooltip' }, body: saveDisabledReason }}
                        >
                          <span className="d-inline-block">{saveButton}</span>
                        </OverlayTrigger>
                      ) : (
                        saveButton
                      )}
                    </>
                  }
                />
              </>
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
