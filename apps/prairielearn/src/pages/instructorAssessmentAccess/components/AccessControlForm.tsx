import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { FormProvider, useFieldArray, useForm } from 'react-hook-form';

import { SplitPane, StickySaveBar, type StickySaveBarAlert, useModalState } from '@prairielearn/ui';

import type { PageContext } from '../../../lib/client/page-context.js';
import type {
  AccessControlJsonWithId,
  PrairieTestExamMetadata,
} from '../../../models/assessment-access-control-rules.js';

import { AccessControlEditabilityProvider } from './AccessControlEditabilityContext.js';
import { AccessControlSummary } from './AccessControlSummary.js';
import { DefaultRuleForm } from './DefaultRuleForm.js';
import { OverrideRuleContent } from './OverrideRuleContent.js';
import { AppliesToField } from './fields/AppliesToField.js';
import {
  type AccessControlFormData,
  type TargetType,
  createDefaultOverrideFormData,
  formDataToJson,
  isOverrideEditable,
  jsonToDefaultRuleFormData,
  jsonToOverrideFormData,
} from './types.js';
import { type AccessControlFormFieldPath, getGlobalDateValidationErrors } from './validation.js';

const defaultInitialData: AccessControlJsonWithId[] = [];

/**
 * Use an initial width of 560px for the right panel, to accomodate fitting
 * deadline override inputs onto a single line.
 */
const accessControlFormInitialRightWidth = 560;

type SelectedRule = { type: 'default' } | { type: 'override'; index: number } | null;

export function AccessControlForm({
  initialData = defaultInitialData,
  prairieTestExamMetadata,
  ptHost,
  onSubmit,
  courseInstance,
  isExam,
  isSaving = false,
  alert,
  canEditAccessSettings,
  canEditEnrollmentRules,
  canFetchPrairieTestMetadata,
  readOnlyMessage,
  hiddenEnrollmentRuleCount,
}: {
  initialData?: AccessControlJsonWithId[];
  prairieTestExamMetadata: PrairieTestExamMetadata[];
  ptHost: string;
  onSubmit: (data: AccessControlJsonWithId[]) => Promise<void>;
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  isExam: boolean;
  isSaving?: boolean;
  alert?: StickySaveBarAlert | null;
  canEditAccessSettings: boolean;
  canEditEnrollmentRules: boolean;
  canFetchPrairieTestMetadata: boolean;
  readOnlyMessage: string | null;
  hiddenEnrollmentRuleCount: number;
}) {
  const [selectedRule, setSelectedRule] = useState<SelectedRule>(null);
  const deleteModal = useModalState<{ index: number; name: string }>();

  const displayTimezone = courseInstance.display_timezone;
  const defaultRule = initialData[0]
    ? jsonToDefaultRuleFormData(initialData[0], displayTimezone)
    : jsonToDefaultRuleFormData({}, displayTimezone);
  const overrides = initialData.slice(1).map((o) => jsonToOverrideFormData(o, displayTimezone));

  const methods = useForm<AccessControlFormData>({
    mode: 'onChange',
    defaultValues: {
      defaultRule,
      overrides,
    },
  });

  const {
    clearErrors,
    control,
    getFieldState,
    handleSubmit,
    setError,
    setValue,
    watch,
    reset,
    formState: { isDirty, isValid, errors },
  } = methods;

  const {
    append: appendOverride,
    insert: insertOverride,
    remove: removeOverride,
    move: moveOverride,
  } = useFieldArray({
    control,
    name: 'overrides',
  });

  const watchedData = watch();
  const manualErrorPathsRef = useRef<Set<AccessControlFormFieldPath>>(new Set());

  // Sync cross-field validation errors into react-hook-form as manual errors,
  // and clear them when the underlying issues are resolved. Depends on `errors`
  // so we re-sync when child `trigger()` calls clear a manual error we set.
  useEffect(() => {
    const nextManualErrors = new Map<AccessControlFormFieldPath, string>();
    for (const error of getGlobalDateValidationErrors(watchedData, displayTimezone)) {
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
        if (!fieldState.error) {
          setError(path, { type: 'manual', message: nextMessage });
        } else if (fieldState.error.type === 'manual' && fieldState.error.message !== nextMessage) {
          setError(path, { type: 'manual', message: nextMessage });
        }
      } else if (fieldState.error?.type === 'manual') {
        clearErrors(path);
      }
    }

    manualErrorPathsRef.current = new Set(nextManualErrors.keys());
  }, [clearErrors, getFieldState, setError, watchedData, errors, displayTimezone]);

  const handleFormSubmit = async (data: AccessControlFormData) => {
    if (!canEditAccessSettings) return;

    await onSubmit(formDataToJson(data));
    reset(data);
  };

  const addOverride = () => {
    const newOverride = createDefaultOverrideFormData(watchedData.defaultRule);
    if (!canEditEnrollmentRules) {
      newOverride.appliesTo.targetType = 'student_label';
    }
    if (newOverride.appliesTo.targetType === 'student_label') {
      const firstEnrollmentIndex = watchedData.overrides.findIndex(
        (override) => override.appliesTo.targetType === 'enrollment',
      );
      const insertIndex =
        firstEnrollmentIndex === -1 ? watchedData.overrides.length : firstEnrollmentIndex;
      insertOverride(insertIndex, newOverride);
      setSelectedRule({ type: 'override', index: insertIndex });
    } else {
      appendOverride(newOverride);
      setSelectedRule({ type: 'override', index: watchedData.overrides.length });
    }
  };

  const handleOverrideTargetTypeChange = (index: number, targetType: TargetType) => {
    if (watchedData.overrides[index].appliesTo.targetType === targetType) return;

    const labelCount = watchedData.overrides.filter(
      (o, i) => i !== index && o.appliesTo.targetType === 'student_label',
    ).length;
    const newIndex = targetType === 'student_label' ? labelCount : watchedData.overrides.length - 1;

    if (newIndex !== index) {
      moveOverride(index, newIndex);
    }

    setValue(
      `overrides.${newIndex}.appliesTo`,
      {
        targetType,
        enrollments: [],
        studentLabels: [],
      },
      { shouldDirty: true, shouldValidate: true },
    );
    setSelectedRule({ type: 'override', index: newIndex });
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

  const handleMoveOverride = (fromIndex: number, toIndex: number) => {
    const permissions = { canEditAccessSettings, canEditEnrollmentRules };
    const fromEditable = isOverrideEditable(watchedData.overrides[fromIndex], permissions);
    const toEditable = isOverrideEditable(watchedData.overrides[toIndex], permissions);
    if (!fromEditable || !toEditable) return;

    moveOverride(fromIndex, toIndex);

    if (selectedRule?.type !== 'override') return;

    if (selectedRule.index === fromIndex) {
      setSelectedRule({ type: 'override', index: toIndex });
    } else if (fromIndex < selectedRule.index && selectedRule.index <= toIndex) {
      setSelectedRule({ type: 'override', index: selectedRule.index - 1 });
    } else if (toIndex <= selectedRule.index && selectedRule.index < fromIndex) {
      setSelectedRule({ type: 'override', index: selectedRule.index + 1 });
    }
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

  const hasManualErrors = getGlobalDateValidationErrors(watchedData, displayTimezone).length > 0;

  const saveDisabledReason = !isDirty
    ? 'No changes to save'
    : !isValid || hasManualErrors
      ? 'Fix validation errors before saving'
      : null;

  const rightTitle =
    selectedRule?.type === 'default'
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

  const selectedRuleCanEdit =
    selectedRule?.type === 'override'
      ? isOverrideEditable(watchedData.overrides[selectedRule.index], {
          canEditAccessSettings,
          canEditEnrollmentRules,
        })
      : canEditAccessSettings;

  const rightPanel =
    selectedRule?.type === 'default' ? (
      <AccessControlEditabilityProvider ruleEditable={selectedRuleCanEdit}>
        <div className="px-3 pb-3">
          <DefaultRuleForm displayTimezone={displayTimezone} isExam={isExam} />
        </div>
      </AccessControlEditabilityProvider>
    ) : selectedRule?.type === 'override' ? (
      (() => {
        if (selectedRule.index >= watchedData.overrides.length) {
          return null;
        }
        return (
          <AccessControlEditabilityProvider ruleEditable={selectedRuleCanEdit}>
            <div className="px-3 pb-3">
              <AppliesToField
                namePrefix={`overrides.${selectedRule.index}`}
                courseInstanceId={courseInstance.id}
                canEditAccessSettings={canEditAccessSettings}
                canEditEnrollmentRules={canEditEnrollmentRules}
                onTargetTypeChange={(targetType) =>
                  handleOverrideTargetTypeChange(selectedRule.index, targetType)
                }
              />
              <OverrideRuleContent
                index={selectedRule.index}
                displayTimezone={displayTimezone}
                isExam={isExam}
              />
            </div>
          </AccessControlEditabilityProvider>
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
                {alert && (
                  <Alert
                    className="mb-0 rounded-0 border-start-0 border-end-0 border-top-0"
                    variant={alert.variant}
                    dismissible={Boolean(alert.onDismiss)}
                    onClose={alert.onDismiss}
                  >
                    {alert.message}
                  </Alert>
                )}
                <div className="container py-3">
                  <AccessControlSummary
                    displayTimezone={courseInstance.display_timezone}
                    getOverrideName={getOverrideName}
                    defaultRule={watchedData.defaultRule}
                    overrides={watchedData.overrides}
                    selectedOverrideIndex={
                      selectedRule?.type === 'override' ? selectedRule.index : null
                    }
                    prairieTestExamMetadata={prairieTestExamMetadata}
                    ptHost={ptHost}
                    canEditAccessSettings={canEditAccessSettings}
                    canEditEnrollmentRules={canEditEnrollmentRules}
                    canFetchPrairieTestMetadata={canFetchPrairieTestMetadata}
                    readOnlyMessage={readOnlyMessage}
                    hiddenEnrollmentRuleCount={hiddenEnrollmentRuleCount}
                    onAddOverride={addOverride}
                    onRemoveOverride={handleDeleteClick}
                    onMoveOverride={handleMoveOverride}
                    onEditDefaultRule={() => setSelectedRule({ type: 'default' })}
                    onClearDefaultRule={() =>
                      reset(
                        {
                          defaultRule: jsonToDefaultRuleFormData({}, displayTimezone),
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
                {canEditAccessSettings && (
                  <StickySaveBar
                    visible={isDirty}
                    isSaving={isSaving}
                    saveDisabledReason={saveDisabledReason}
                    onCancel={() => reset()}
                  />
                )}
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
