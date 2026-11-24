import { useCallback, useEffect, useState } from 'react';
import { Alert, Form } from 'react-bootstrap';
import { FormProvider, useFieldArray, useForm, useFormState, useWatch } from 'react-hook-form';

import { SplitPane, StickySaveBar, type StickySaveBarAlert } from '@prairielearn/ui';

import type { PageContext } from '../../../lib/client/page-context.js';
import type {
  AccessControlJsonWithId,
  PrairieTestExamMetadata,
} from '../../../models/assessment-access-control-rules.js';
import {
  MAX_ENROLLMENT_ACCESS_CONTROL_RULES,
  MAX_STUDENT_LABEL_ACCESS_CONTROL_RULES,
} from '../../../schemas/accessControl.js';

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
  getOverrideName,
  isOverrideEditable,
  jsonToDefaultRuleFormData,
  jsonToOverrideFormData,
} from './types.js';
import { type AccessControlFormResolverContext, accessControlFormResolver } from './validation.js';

const defaultInitialData: AccessControlJsonWithId[] = [];

/**
 * Use an initial width of 560px for the right panel, to accomodate fitting
 * deadline override inputs onto a single line.
 */
const accessControlFormInitialRightWidth = 560;

type SelectedRule = { type: 'default' } | { type: 'override'; index: number } | null;

function getOverrideLimitPolicy(
  targetTypes: TargetType[],
  canEditEnrollmentRules: boolean,
): {
  nextTargetType: TargetType;
  addDisabledReason: string | null;
  getTargetTypeDisabledReasons: (
    currentTargetType: TargetType,
  ) => Partial<Record<TargetType, string | null>>;
} {
  const enrollmentOverrideCount = targetTypes.filter(
    (targetType) => targetType === 'enrollment',
  ).length;
  const studentLabelOverrideCount = targetTypes.length - enrollmentOverrideCount;
  const enrollmentLimitReached = enrollmentOverrideCount >= MAX_ENROLLMENT_ACCESS_CONTROL_RULES;
  const studentLabelLimitReached =
    studentLabelOverrideCount >= MAX_STUDENT_LABEL_ACCESS_CONTROL_RULES;

  const enrollmentLimitReason = `An assessment can have at most ${MAX_ENROLLMENT_ACCESS_CONTROL_RULES} student-specific overrides.`;
  const studentLabelLimitReason = `An assessment can have at most ${MAX_STUDENT_LABEL_ACCESS_CONTROL_RULES} student-label overrides.`;

  return {
    nextTargetType:
      !canEditEnrollmentRules || enrollmentLimitReached ? 'student_label' : 'enrollment',
    addDisabledReason: !canEditEnrollmentRules
      ? studentLabelLimitReached
        ? studentLabelLimitReason
        : null
      : enrollmentLimitReached && studentLabelLimitReached
        ? `An assessment can have at most ${MAX_ENROLLMENT_ACCESS_CONTROL_RULES} student-specific overrides and ${MAX_STUDENT_LABEL_ACCESS_CONTROL_RULES} student-label overrides.`
        : null,
    getTargetTypeDisabledReasons: (currentTargetType) => ({
      enrollment:
        currentTargetType !== 'enrollment' && enrollmentLimitReached ? enrollmentLimitReason : null,
      student_label:
        currentTargetType !== 'student_label' && studentLabelLimitReached
          ? studentLabelLimitReason
          : null,
    }),
  };
}

function SelectedOverrideTitle({ index }: { index: number }) {
  const appliesTo = useWatch<AccessControlFormData, `overrides.${number}.appliesTo`>({
    name: `overrides.${index}.appliesTo`,
  });
  return getOverrideName(appliesTo, index);
}

/**
 * Subscribes to form state separately so that validation updates re-render
 * only the save bar, not the whole form.
 */
function AccessControlSaveBar({ isSaving, onCancel }: { isSaving: boolean; onCancel: () => void }) {
  const { isDirty, isValid } = useFormState<AccessControlFormData>();
  const saveDisabledReason = !isDirty
    ? 'No changes to save'
    : !isValid
      ? 'Fix validation errors before saving'
      : null;

  return (
    <StickySaveBar
      visible={isDirty}
      isSaving={isSaving}
      saveDisabledReason={saveDisabledReason}
      onCancel={onCancel}
    />
  );
}

export function AccessControlForm({
  initialData = defaultInitialData,
  prairieTestExamMetadata,
  ptHost,
  onSubmit,
  courseInstance,
  isExam,
  hasExamAutoClose,
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
  hasExamAutoClose: boolean;
  isSaving?: boolean;
  alert?: StickySaveBarAlert | null;
  canEditAccessSettings: boolean;
  canEditEnrollmentRules: boolean;
  canFetchPrairieTestMetadata: boolean;
  readOnlyMessage: string | null;
  hiddenEnrollmentRuleCount: number;
}) {
  const [selectedRule, setSelectedRule] = useState<SelectedRule>(null);

  const displayTimezone = courseInstance.display_timezone;
  // Converting every rule is expensive with many overrides, and the result is
  // only used for the form's initial values.
  const [defaultValues] = useState<AccessControlFormData>(() => ({
    defaultRule: jsonToDefaultRuleFormData(initialData[0] ?? {}, displayTimezone),
    overrides: initialData.slice(1).map((o) => jsonToOverrideFormData(o, displayTimezone)),
  }));

  const methods = useForm<AccessControlFormData, AccessControlFormResolverContext>({
    mode: 'onChange',
    resolver: accessControlFormResolver,
    context: { displayTimezone },
    defaultValues,
  });

  const { control, handleSubmit, setValue, getValues, reset, subscribe, trigger } = methods;

  // Re-validate the whole form after every value change. With a resolver,
  // react-hook-form only updates the displayed error for the field that
  // changed, while `isValid` reflects the whole form. Cross-field errors and
  // errors nested under object-valued controllers (e.g. question visibility
  // dates) would otherwise disable Save without being shown anywhere. The
  // trigger is deferred because react-hook-form finishes processing the
  // change after notifying subscribers, and would overwrite the errors from a
  // synchronous trigger.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribe({
      formState: { values: true },
      callback: () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => void trigger(), 0);
      },
    });
    void trigger();
    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, [subscribe, trigger]);

  const {
    append: appendOverride,
    insert: insertOverride,
    remove: removeOverride,
    move: moveOverride,
  } = useFieldArray({
    control,
    name: 'overrides',
  });

  // Re-render only when override target types change; watching the whole form
  // here would re-render every rule summary on each keystroke. The values are
  // read with `getValues` because react-hook-form reports add/remove/move to
  // watchers one render late, while `useFieldArray` re-renders this component
  // immediately.
  useWatch({
    control,
    name: 'overrides',
    compute: (overrides) => overrides.map((override) => override.appliesTo.targetType),
  });
  const overrideTargetTypes = getValues('overrides').map(
    (override) => override.appliesTo.targetType,
  );
  const overrideLimitPolicy = getOverrideLimitPolicy(overrideTargetTypes, canEditEnrollmentRules);

  const handleFormSubmit = async (data: AccessControlFormData) => {
    if (!canEditAccessSettings) return;

    await onSubmit(formDataToJson(data));
    reset(data);
  };

  const addOverride = () => {
    const newOverride = createDefaultOverrideFormData(getValues('defaultRule'));
    newOverride.appliesTo.targetType = overrideLimitPolicy.nextTargetType;
    if (newOverride.appliesTo.targetType === 'student_label') {
      const firstEnrollmentIndex = overrideTargetTypes.indexOf('enrollment');
      const insertIndex =
        firstEnrollmentIndex === -1 ? overrideTargetTypes.length : firstEnrollmentIndex;
      insertOverride(insertIndex, newOverride);
      setSelectedRule({ type: 'override', index: insertIndex });
    } else {
      appendOverride(newOverride);
      setSelectedRule({ type: 'override', index: overrideTargetTypes.length });
    }
  };

  const handleOverrideTargetTypeChange = (index: number, targetType: TargetType) => {
    if (overrideTargetTypes[index] === targetType) return;

    const labelCount = overrideTargetTypes.filter(
      (t, i) => i !== index && t === 'student_label',
    ).length;
    const newIndex = targetType === 'student_label' ? labelCount : overrideTargetTypes.length - 1;

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

  // The summary memoizes its override cards, so the callbacks passed to them
  // must stay stable across renders.
  const handleDeleteOverride = useCallback(
    (deletedIndex: number) => {
      setSelectedRule((selectedRule) => {
        if (selectedRule?.type !== 'override') return selectedRule;
        if (selectedRule.index === deletedIndex) return null;
        if (selectedRule.index > deletedIndex) {
          return { type: 'override', index: selectedRule.index - 1 };
        }
        return selectedRule;
      });
      removeOverride(deletedIndex);
    },
    [removeOverride],
  );

  const handleMoveOverride = (fromIndex: number, toIndex: number) => {
    const permissions = { canEditAccessSettings, canEditEnrollmentRules };
    const fromEditable = isOverrideEditable(getValues(`overrides.${fromIndex}`), permissions);
    const toEditable = isOverrideEditable(getValues(`overrides.${toIndex}`), permissions);
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

  const handleEditOverride = useCallback(
    (index: number) => setSelectedRule({ type: 'override', index }),
    [],
  );

  const rightTitle =
    selectedRule?.type === 'default' ? (
      'Defaults'
    ) : selectedRule?.type === 'override' ? (
      // The selected index can point past the end of the list, e.g. after
      // discarding changes that added the selected override.
      selectedRule.index < overrideTargetTypes.length ? (
        <SelectedOverrideTitle index={selectedRule.index} />
      ) : (
        `Override ${selectedRule.index + 1}`
      )
    ) : undefined;

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
      ? isOverrideEditable(getValues(`overrides.${selectedRule.index}`), {
          canEditAccessSettings,
          canEditEnrollmentRules,
        })
      : canEditAccessSettings;

  const rightPanel =
    selectedRule?.type === 'default' ? (
      <AccessControlEditabilityProvider ruleEditable={selectedRuleCanEdit}>
        <div className="px-3 pb-3">
          <DefaultRuleForm
            displayTimezone={displayTimezone}
            isExam={isExam}
            hasExamAutoClose={hasExamAutoClose}
          />
        </div>
      </AccessControlEditabilityProvider>
    ) : selectedRule?.type === 'override' ? (
      (() => {
        if (selectedRule.index >= overrideTargetTypes.length) {
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
                targetTypeDisabledReasons={overrideLimitPolicy.getTargetTypeDisabledReasons(
                  overrideTargetTypes[selectedRule.index],
                )}
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
                    addOverrideDisabledReason={overrideLimitPolicy.addDisabledReason}
                    onAddOverride={addOverride}
                    onRemoveOverride={handleDeleteOverride}
                    onMoveOverride={handleMoveOverride}
                    onEditDefaultRule={() => setSelectedRule({ type: 'default' })}
                    onClearDefaultRule={() =>
                      reset(
                        {
                          defaultRule: jsonToDefaultRuleFormData({}, displayTimezone),
                          overrides: getValues('overrides'),
                        },
                        {
                          // Keep original defaults so the form stays dirty and the save button enables.
                          keepDefaultValues: true,
                        },
                      )
                    }
                    onEditOverride={handleEditOverride}
                  />
                </div>
                {canEditAccessSettings && (
                  <AccessControlSaveBar isSaving={isSaving} onCancel={() => reset()} />
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
    </FormProvider>
  );
}
