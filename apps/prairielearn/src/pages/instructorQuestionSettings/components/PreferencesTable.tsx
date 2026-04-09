import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  type Modifier,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { useCallback, useId, useRef, useState } from 'react';
import { Button } from 'react-bootstrap';
import {
  type Control,
  type FieldArrayWithId,
  type FieldErrors,
  type UseFormClearErrors,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormWatch,
  useFieldArray,
} from 'react-hook-form';

import { DragHandle } from '../../instructorAssessmentQuestions/components/tree/DragHandle.js';
import type {
  PreferenceField,
  QuestionSettingsFormValues,
} from '../instructorQuestionSettings.types.js';

export function PreferencesTable({
  control,
  canEdit,
  register,
  watch,
  setValue,
  clearErrors,
  errors,
}: {
  control: Control<QuestionSettingsFormValues>;
  canEdit: boolean;
  register: UseFormRegister<QuestionSettingsFormValues>;
  watch: UseFormWatch<QuestionSettingsFormValues>;
  setValue: UseFormSetValue<QuestionSettingsFormValues>;
  clearErrors: UseFormClearErrors<QuestionSettingsFormValues>;
  errors?: FieldErrors<QuestionSettingsFormValues>['preferences'];
}) {
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'preferences',
  });

  const dndId = useId();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Clamp the dragged item's center (not edges) to the container so that
  // closestCenter collision detection can always reach every target, even
  // when rows have very different heights.
  const restrictToGridVertical: Modifier = ({ draggingNodeRect, transform }) => {
    if (!draggingNodeRect || !gridRef.current) {
      return { ...transform, x: 0 };
    }
    const containerRect = gridRef.current.getBoundingClientRect();
    const draggingCenterY = draggingNodeRect.top + draggingNodeRect.height / 2;
    return {
      ...transform,
      x: 0,
      y: Math.min(
        Math.max(transform.y, containerRect.top - draggingCenterY),
        containerRect.bottom - draggingCenterY,
      ),
    };
  };

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((f) => f.id === active.id);
      const newIndex = fields.findIndex((f) => f.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        move(oldIndex, newIndex);
      }
    }
  }

  return (
    <div className="mb-3">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h2 className="h4 mb-0">Preferences</h2>
        <Button
          variant="outline-primary"
          size="sm"
          disabled={!canEdit}
          onClick={() => append({ name: '', type: 'string', default: '', enum: [] })}
        >
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          Add preference
        </Button>
      </div>
      <small className="text-muted d-block mb-3">
        Configure{' '}
        <a
          href="https://docs.prairielearn.com/question/preferences/"
          target="_blank"
          rel="noreferrer"
        >
          preferences
        </a>{' '}
        that can be specified when a question is used on an assessment. Values are available in{' '}
        <code>server.py</code> and <code>question.html</code>.
      </small>

      {fields.length === 0 && (
        <div className="border rounded p-4 text-center text-muted mb-3">
          <i className="bi bi-sliders fs-3 d-block mb-2" aria-hidden="true" />
          No preferences configured
        </div>
      )}

      {fields.length > 0 && (
        <DndContext
          // The card has overflow-x: auto for horizontal scrolling on narrow
          // viewports, which makes dnd-kit treat it as scrollable on ALL axes
          // (it checks /(auto|scroll|overlay)/ without distinguishing axes).
          // Exclude it so dragging doesn't vertically scroll the card contents.
          autoScroll={{
            canScroll: (element) => element !== scrollContainerRef.current,
          }}
          collisionDetection={closestCenter}
          id={dndId}
          modifiers={[restrictToGridVertical]}
          sensors={sensors}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div
              ref={scrollContainerRef}
              className={clsx(
                'card mb-3',
                canEdit ? 'preferences-grid-editable' : 'preferences-grid-readonly',
              )}
            >
              <div className="preferences-grid-header">
                {canEdit && <div />}
                <div>Name</div>
                <div>Type</div>
                <div>Default</div>
                <div>Values</div>
                {canEdit && <div />}
              </div>
              <div ref={gridRef} className="preferences-grid-rows">
                {fields.map((field, index) => (
                  <PreferenceRow
                    key={field.id}
                    field={field}
                    index={index}
                    canEdit={canEdit}
                    register={register}
                    watch={watch}
                    setValue={setValue}
                    errors={errors?.[index]}
                    remove={remove}
                    clearErrors={clearErrors}
                  />
                ))}
              </div>
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function PreferenceRow({
  field,
  index,
  canEdit,
  register,
  watch,
  setValue,
  errors,
  remove,
  clearErrors,
}: {
  field: FieldArrayWithId<QuestionSettingsFormValues, 'preferences', 'id'>;
  index: number;
  canEdit: boolean;
  register: UseFormRegister<QuestionSettingsFormValues>;
  watch: UseFormWatch<QuestionSettingsFormValues>;
  setValue: UseFormSetValue<QuestionSettingsFormValues>;
  errors?: FieldErrors<PreferenceField>;
  remove: (index: number) => void;
  clearErrors: UseFormClearErrors<QuestionSettingsFormValues>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    disabled: !canEdit,
  });

  const prefType = watch(`preferences.${index}.type`);
  const preferenceDefaultValue = watch(`preferences.${index}.default`);
  const enumValues = watch(`preferences.${index}.enum`);
  const allPreferences = watch('preferences');

  const nameColIndex = canEdit ? 2 : 1;
  const defaultColIndex = canEdit ? 4 : 3;

  return (
    <div
      ref={setNodeRef}
      style={{
        // Force scaleX/scaleY to 1: dnd-kit's `useDerivedTransform` animates
        // index changes by computing scaleX/Y from old-rect/new-rect ratios,
        // which warps tall rows when they land in shorter rows' slots.
        transform: CSS.Transform.toString(
          transform ? { ...transform, scaleX: 1, scaleY: 1 } : null,
        ),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="preferences-grid-row"
    >
      {/* Row 1: controls */}
      {canEdit && (
        <div>
          <DragHandle attributes={attributes} listeners={listeners} disabled={!canEdit} />
        </div>
      )}
      <div>
        <input
          type="text"
          className={clsx(
            'form-control form-control-sm font-monospace',
            errors?.name && 'is-invalid',
          )}
          id={`pref-${index}-name`}
          disabled={!canEdit}
          placeholder="e.g. show_hints"
          defaultValue={field.name}
          aria-invalid={!!errors?.name || undefined}
          aria-errormessage={errors?.name ? `pref-${index}-name-error` : undefined}
          {...register(`preferences.${index}.name`, {
            required: 'Name is required',
            validate: {
              unique: (value) => {
                const duplicates = allPreferences.filter((p, i) => i !== index && p.name === value);
                return duplicates.length === 0 || 'Name must be unique';
              },
            },
          })}
        />
      </div>
      <div>
        <select
          className="form-select form-select-sm"
          id={`pref-${index}-type`}
          disabled={!canEdit}
          defaultValue={field.type}
          {...register(`preferences.${index}.type`, {
            onChange: (e) => {
              setValue(`preferences.${index}.enum`, [], { shouldDirty: true });
              // Sync react-hook-form's value when switching to boolean: the <select>
              // shows "true" visually, but the internal value is still the old one.
              if (e.target.value === 'boolean') {
                if (preferenceDefaultValue !== 'true' && preferenceDefaultValue !== 'false') {
                  setValue(`preferences.${index}.default`, 'true');
                }
                clearErrors(`preferences.${index}.default`);
                return;
              }

              setValue(`preferences.${index}.default`, '', { shouldValidate: false });
            },
          })}
        >
          <option value="string">String</option>
          <option value="number">Number</option>
          <option value="boolean">Boolean</option>
        </select>
      </div>
      <div>
        {prefType === 'boolean' ? (
          <select
            className={clsx('form-select form-select-sm', errors?.default && 'is-invalid')}
            id={`pref-${index}-default`}
            disabled={!canEdit}
            value={String(preferenceDefaultValue)}
            aria-invalid={!!errors?.default || undefined}
            aria-errormessage={errors?.default ? `pref-${index}-default-error` : undefined}
            {...register(`preferences.${index}.default`, {
              required: 'A default value is required',
            })}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : enumValues.length > 0 ? (
          <select
            className={clsx('form-select form-select-sm', errors?.default && 'is-invalid')}
            id={`pref-${index}-default`}
            disabled={!canEdit}
            defaultValue={String(field.default)}
            aria-invalid={!!errors?.default || undefined}
            aria-errormessage={errors?.default ? `pref-${index}-default-error` : undefined}
            {...register(`preferences.${index}.default`, {
              required: 'A default value is required',
            })}
          >
            <option value="" disabled>
              Select a default
            </option>
            {enumValues.map((val) => (
              <option key={val} value={val}>
                {val}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={prefType === 'number' ? 'number' : 'text'}
            step={prefType === 'number' ? 'any' : undefined}
            className={clsx('form-control form-control-sm', errors?.default && 'is-invalid')}
            id={`pref-${index}-default`}
            disabled={!canEdit}
            defaultValue={String(field.default)}
            aria-invalid={!!errors?.default || undefined}
            aria-errormessage={errors?.default ? `pref-${index}-default-error` : undefined}
            {...register(`preferences.${index}.default`, {
              required: 'A default value is required',
              validate: {
                matchesType: (value) => {
                  const currentType = watch(`preferences.${index}.type`);
                  if (currentType === 'number' && Number.isNaN(Number(value))) {
                    return 'Must be a number';
                  }
                  return true;
                },
              },
            })}
          />
        )}
      </div>
      <div>
        {prefType === 'boolean' ? (
          <span className="text-muted small">N/A</span>
        ) : (
          <EnumInput
            index={index}
            canEdit={canEdit}
            prefType={prefType}
            watch={watch}
            setValue={setValue}
            clearErrors={clearErrors}
          />
        )}
      </div>
      {canEdit && (
        <div>
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            aria-label={`Remove preference ${index + 1}`}
            onClick={() => remove(index)}
          >
            <i className="bi bi-trash" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Row 2: error messages (explicitly placed on grid row 2) */}
      {errors?.name && (
        <div
          id={`pref-${index}-name-error`}
          className="invalid-feedback d-block"
          style={{ gridColumn: nameColIndex, gridRow: 2 }}
        >
          {errors.name.message}
        </div>
      )}
      {errors?.default && (
        <div
          id={`pref-${index}-default-error`}
          className="invalid-feedback d-block"
          style={{ gridColumn: defaultColIndex, gridRow: 2 }}
        >
          {errors.default.message}
        </div>
      )}
    </div>
  );
}

function EnumInput({
  index,
  canEdit,
  prefType,
  watch,
  setValue,
  clearErrors,
}: {
  index: number;
  canEdit: boolean;
  prefType: string;
  watch: UseFormWatch<QuestionSettingsFormValues>;
  setValue: UseFormSetValue<QuestionSettingsFormValues>;
  clearErrors: UseFormClearErrors<QuestionSettingsFormValues>;
}) {
  const [inputValue, setInputValue] = useState('');
  const [adding, setAdding] = useState(false);
  const enumValues = watch(`preferences.${index}.enum`);

  const currentDefault = watch(`preferences.${index}.default`);

  function addValue() {
    const trimmed = inputValue.trim();
    if (!trimmed || enumValues.includes(trimmed)) return;
    if (enumValues.length === 0) {
      setValue(`preferences.${index}.default`, trimmed, { shouldDirty: true });
      clearErrors(`preferences.${index}.default`);
    }
    setValue(`preferences.${index}.enum`, [...enumValues, trimmed], { shouldDirty: true });
    setInputValue('');
  }

  function removeValue(val: string) {
    const remaining = enumValues.filter((v) => v !== val);
    setValue(`preferences.${index}.enum`, remaining, { shouldDirty: true });
    if (remaining.length === 0) {
      setValue(`preferences.${index}.default`, '', { shouldDirty: true });
    } else if (String(currentDefault) === val) {
      setValue(`preferences.${index}.default`, remaining[0], { shouldDirty: true });
    }
  }

  function startAdding() {
    setAdding(true);
  }

  function stopAdding() {
    addValue();
    setAdding(false);
    setInputValue('');
  }

  const focusOnMount = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  return (
    <div>
      <input type="hidden" name={`preferences.${index}.enum`} value={JSON.stringify(enumValues)} />
      <div className="d-flex flex-wrap gap-1 align-items-center">
        {enumValues.map((val) => (
          <span
            key={val}
            className="badge bg-light text-dark border d-inline-flex align-items-center gap-1 preferences-enum-badge"
            title={val}
          >
            <span className="text-truncate">{val}</span>
            {canEdit && (
              <button
                type="button"
                className="btn-close preferences-enum-remove"
                aria-label={`Remove ${val}`}
                onClick={() => removeValue(val)}
              />
            )}
          </span>
        ))}
        {enumValues.length === 0 && !adding && (
          <span className="badge bg-light text-muted border border-transparent">Any</span>
        )}
        {canEdit &&
          (adding ? (
            <input
              ref={focusOnMount}
              type={prefType === 'number' ? 'number' : 'text'}
              step={prefType === 'number' ? 'any' : undefined}
              className="form-control form-control-sm preferences-enum-input"
              placeholder="Add value"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addValue();
                } else if (e.key === 'Escape') {
                  setInputValue('');
                  setAdding(false);
                }
              }}
              onBlur={stopAdding}
            />
          ) : (
            <button
              type="button"
              className="btn btn-xs btn-outline-primary d-inline-flex align-items-center gap-1 preferences-enum-add-btn"
              onClick={startAdding}
            >
              <i className="bi bi-plus" aria-hidden="true" />
              {enumValues.length === 0 ? 'Restrict' : ''}
            </button>
          ))}
      </div>
    </div>
  );
}
