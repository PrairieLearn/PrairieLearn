import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  type EnumAssessmentTool,
  EnumAssessmentToolSchema,
} from '../../../../schemas/infoAssessment.js';
import type { DetailState, ZoneAssessmentForm } from '../../types.js';
import {
  coerceToBoolean,
  coerceToNumber,
  coerceToOptionalString,
  commentToString,
  makeResetAndSave,
  parseCommentValue,
} from '../../utils/formHelpers.js';
import {
  computeZoneQuestionCount,
  getZoneMixedToolsWarning,
  getZonePointsMismatch,
  hasZoneChooseExceedsCount,
  validatePositiveInteger,
} from '../../utils/questions.js';
import { useAutoSave } from '../../utils/useAutoSave.js';

import { AdvancedFields, type AdvancedFieldsInheritance } from './AdvancedFields.js';
import { DetailSectionHeader } from './DetailSectionHeader.js';
import { FormField } from './FormField.js';
import { InheritableCheckboxField } from './InheritableCheckboxField.js';

type ToolFormFields = Record<`tool_${EnumAssessmentTool}`, boolean | undefined>;

interface ZoneFormData extends ToolFormFields {
  title: string;
  maxPoints?: number;
  numberChoose?: number;
  bestQuestions?: number;
  lockpoint?: boolean;
  comment?: string;
  advanceScorePerc?: number;
  gradeRateMinutes?: number;
  allowRealTimeGrading?: boolean;
}

export function ZoneDetailPanel({
  zone,
  zones,
  zoneIndex,
  idPrefix,
  state,
  onUpdate,
  onFormValidChange,
}: {
  zone: ZoneAssessmentForm;
  zones: ZoneAssessmentForm[];
  zoneIndex: number;
  idPrefix: string;
  state: DetailState;
  onUpdate: (zoneTrackingId: string, zone: Partial<ZoneAssessmentForm>) => void;
  onFormValidChange: (isValid: boolean) => void;
}) {
  const { editMode, assessmentType, assessmentDefaults, assessmentToolDefaults } = state;
  const formValues: ZoneFormData = {
    title: zone.title ?? '',
    maxPoints: zone.maxPoints ?? undefined,
    numberChoose: zone.numberChoose ?? undefined,
    bestQuestions: zone.bestQuestions ?? undefined,
    lockpoint: zone.lockpoint,
    comment: commentToString(zone.comment),
    advanceScorePerc: zone.advanceScorePerc ?? undefined,
    gradeRateMinutes: zone.gradeRateMinutes ?? undefined,
    // We do this so that `isDirty = false` when the value is inherited.
    allowRealTimeGrading: zone.allowRealTimeGrading ?? undefined,
    ...(Object.fromEntries(
      EnumAssessmentToolSchema.options.map((tool) => [
        `tool_${tool}` as const,
        zone.tools?.[tool] != null ? zone.tools[tool].enabled : undefined,
      ]),
    ) as ToolFormFields),
  };

  const {
    register,
    getValues,
    watch,
    setValue,
    trigger,
    formState: { errors, isDirty, isValid },
  } = useForm<ZoneFormData>({
    mode: 'onChange',
    values: formValues,
    // Prevent autosave from clobbering in-progress typing. Without this,
    // the autosave feedback loop (edit → save → parent state update →
    // values prop change → form reset) resets the input mid-keystroke.
    // This is safe because the only source of values changes while the
    // panel is open is autosave; switching entities remounts the component.
    resetOptions: { keepDirtyValues: true, keepErrors: true },
  });

  const zoneQuestionCount = computeZoneQuestionCount(zone.questions);

  // Revalidate fields that depend on external zone state (question count, etc.)
  // whenever those dependencies change. This also handles initial mount so that
  // pre-existing invalid values (e.g. from JSON) are flagged immediately.
  useEffect(() => {
    void trigger().then((valid) => {
      // TODO: you can easily click off the item and save the form to bypass this validation.
      onFormValidChange(valid);
    });
  }, [zoneQuestionCount, trigger, onFormValidChange]);

  const handleSave = useCallback(
    (data: ZoneFormData) => {
      const tools: Partial<Record<EnumAssessmentTool, { enabled: boolean }>> = {};
      let hasToolOverride = false;
      for (const tool of EnumAssessmentToolSchema.options) {
        const value = coerceToBoolean(data[`tool_${tool}`]);
        if (value != null) {
          tools[tool] = { enabled: value };
          hasToolOverride = true;
        }
      }

      onUpdate(zone.trackingId, {
        title: data.title || undefined,
        maxPoints: data.maxPoints,
        numberChoose: data.numberChoose,
        bestQuestions: data.bestQuestions,
        lockpoint: data.lockpoint,
        comment: parseCommentValue(data.comment),
        advanceScorePerc: data.advanceScorePerc,
        gradeRateMinutes: data.gradeRateMinutes,
        allowRealTimeGrading: data.allowRealTimeGrading,
        tools: hasToolOverride ? tools : undefined,
      });
    },
    [onUpdate, zone.trackingId],
  );

  const resetAndSave = useMemo(
    () => makeResetAndSave(handleSave, getValues),
    [handleSave, getValues],
  );

  useAutoSave({ isDirty, isValid, getValues, onSave: handleSave, watch, trigger });

  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent
    onFormValidChange(isValid);
  }, [isValid, onFormValidChange]);

  const advancedInheritance: AdvancedFieldsInheritance = {
    parentAdvanceScorePerc: assessmentDefaults.advanceScorePerc,
    parentGradeRateMinutes: assessmentDefaults.gradeRateMinutes,
    parentAllowRealTimeGrading: assessmentDefaults.allowRealTimeGrading,
    parentForceMaxPoints: undefined,
    advanceScorePercFromLabel: 'assessment',
    gradeRateMinutesFromLabel: 'assessment',
    allowRealTimeGradingFromLabel: 'assessment',
    forceMaxPointsFromLabel: 'assessment',
    watch,
    setValue,
    resetAndSave,
  };

  const Wrapper = editMode ? 'div' : 'dl';

  const [overriddenTools, setOverriddenTools] = useState(
    () => new Set(EnumAssessmentToolSchema.options.filter((tool) => zone.tools?.[tool] != null)),
  );

  const zonePointsMismatch = getZonePointsMismatch(zone, assessmentType);
  const zoneChooseExceeds = hasZoneChooseExceedsCount(zone);
  const mixedToolsWarning = getZoneMixedToolsWarning({ zone, zones, assessmentToolDefaults });

  return (
    <div className="p-3">
      {zonePointsMismatch && (
        <div className="alert alert-warning small mb-3" role="alert">
          <i className="bi bi-exclamation-triangle-fill me-1" aria-hidden="true" />
          {zonePointsMismatch.body}
        </div>
      )}
      {zoneChooseExceeds && (
        <div className="alert alert-warning small mb-3" role="alert">
          <i className="bi bi-exclamation-triangle-fill me-1" aria-hidden="true" />
          Number to choose or best questions exceeds the number of questions in this zone.
        </div>
      )}
      <div className="text-muted small">
        {zoneQuestionCount} choosable question{zoneQuestionCount !== 1 ? 's' : ''} in zone
      </div>

      <DetailSectionHeader>Settings</DetailSectionHeader>

      <Wrapper className={clsx(!editMode && 'mb-0')}>
        <FormField
          editMode={editMode}
          id={`${idPrefix}-title`}
          label="Title"
          viewValue={zone.title || <span className="text-muted">No title</span>}
          helpText="Display name shown to students (optional)."
        >
          {(aria) => (
            <input
              type="text"
              className="form-control form-control-sm"
              {...aria.inputProps}
              {...register('title')}
            />
          )}
        </FormField>

        <FormField
          editMode={editMode}
          id={`${idPrefix}-maxPoints`}
          label="Max points"
          viewValue={zone.maxPoints}
          error={errors.maxPoints}
          helpText="Maximum total points from this zone that count toward the assessment (leave empty for all)."
          hideWhenEmpty
        >
          {(aria) => (
            <input
              type="number"
              step="any"
              className={clsx('form-control form-control-sm', aria.errorClass)}
              {...aria.inputProps}
              {...register('maxPoints', {
                setValueAs: coerceToNumber,
                validate: (v) => {
                  if (v != null && v < 0) return 'Max points must be non-negative.';
                },
              })}
            />
          )}
        </FormField>

        <FormField
          editMode={editMode}
          id={`${idPrefix}-numberChoose`}
          label="Number to choose"
          viewValue={zone.numberChoose}
          error={errors.numberChoose}
          helpText="How many questions from this zone to present (leave empty for all)."
          hideWhenEmpty
        >
          {(aria) => (
            <input
              type="number"
              className={clsx('form-control form-control-sm', aria.errorClass)}
              {...aria.inputProps}
              {...register('numberChoose', {
                setValueAs: coerceToNumber,
                validate: (v) => validatePositiveInteger(v, 'Number to choose'),
              })}
            />
          )}
        </FormField>

        <FormField
          editMode={editMode}
          id={`${idPrefix}-bestQuestions`}
          label="Best questions"
          viewValue={zone.bestQuestions}
          error={errors.bestQuestions}
          helpText="Only the N highest-scoring questions in this zone count toward the total (leave empty for all)."
          hideWhenEmpty
        >
          {(aria) => (
            <input
              type="number"
              className={clsx('form-control form-control-sm', aria.errorClass)}
              {...aria.inputProps}
              {...register('bestQuestions', {
                setValueAs: coerceToNumber,
                validate: (v) => validatePositiveInteger(v, 'Best questions'),
              })}
            />
          )}
        </FormField>

        <FormField
          editMode={editMode}
          id={`${idPrefix}-comment`}
          label="Comment"
          viewValue={
            zone.comment != null ? (
              <span className="text-break">{commentToString(zone.comment)}</span>
            ) : undefined
          }
          helpText="Internal note, not shown to students."
          hideWhenEmpty
        >
          {(aria) => (
            <textarea
              className="form-control form-control-sm"
              {...aria.inputProps}
              rows={2}
              {...register('comment', { setValueAs: coerceToOptionalString })}
            />
          )}
        </FormField>
      </Wrapper>

      <DetailSectionHeader>Tools</DetailSectionHeader>
      <Wrapper className={clsx(!editMode && 'mb-0')}>
        {EnumAssessmentToolSchema.options.map((tool) => {
          const toolLabel = tool[0].toUpperCase() + tool.slice(1);
          const fieldName = `tool_${tool}` as const;
          const inheritedValue = assessmentToolDefaults[tool] ?? false;
          const isInherited = !overriddenTools.has(tool);
          const watchedValue = watch(fieldName);
          return (
            <InheritableCheckboxField
              key={tool}
              id={`${idPrefix}-tool-${tool}`}
              label={toolLabel}
              helpText={`Override the assessment-level ${toolLabel.toLowerCase()} setting for this zone.`}
              editMode={editMode}
              isInherited={isInherited}
              inheritedValue={inheritedValue}
              inheritedFromLabel="assessment"
              viewValue={!isInherited ? !!watchedValue : undefined}
              registerProps={register(fieldName, { setValueAs: coerceToBoolean })}
              showResetButton={!isInherited}
              onOverride={() => {
                setOverriddenTools((prev) => new Set(prev).add(tool));
                setValue(fieldName, inheritedValue, { shouldDirty: true });
              }}
              onReset={() => {
                setOverriddenTools((prev) => {
                  const next = new Set(prev);
                  next.delete(tool);
                  return next;
                });
                resetAndSave(fieldName);
              }}
            />
          );
        })}
      </Wrapper>
      {mixedToolsWarning && (
        <div className="alert alert-warning small mb-3" role="alert">
          <i className="bi bi-exclamation-triangle-fill me-1" aria-hidden="true" />
          {mixedToolsWarning}
        </div>
      )}

      <AdvancedFields
        register={register}
        errors={errors}
        idPrefix={idPrefix}
        variant="zone"
        editMode={editMode}
        inheritance={advancedInheritance}
        zoneIndex={zoneIndex}
      />
    </div>
  );
}
