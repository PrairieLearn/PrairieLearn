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
import { type ReactNode, useCallback, useId, useRef, useState } from 'react';
import { Button } from 'react-bootstrap';
import {
  type Control,
  type FieldArray,
  type FieldArrayPath,
  type FieldValues,
  type Path,
  type UseFormClearErrors,
  type UseFormRegister,
  type UseFormSetValue,
  type UseFormWatch,
  useFieldArray,
} from 'react-hook-form';

import { DragHandle } from '../pages/instructorAssessmentQuestions/components/tree/DragHandle.js';

/** The row shape this editor manages: a named, typed value with a default and optional allowed values. */
export interface TypedPropertyField {
  name: string;
  type: 'string' | 'number' | 'boolean';
  default: string | number | boolean;
  enum: string[];
}

export interface TypedPropertyFieldErrors {
  name?: { message?: string };
  default?: { message?: string };
}

/**
 * A drag-reorderable grid for editing an array of named/typed/defaulted values
 * (question preferences, shared-state object properties, etc). Generic over
 * the parent form so it can be embedded in any react-hook-form-backed form
 * whose field array at `name` holds `TypedPropertyField`-shaped rows.
 *
 * react-hook-form's generics can't express "the array at this path has shape
 * TypedPropertyField" as a constraint, so a few narrow, targeted casts to that
 * concrete shape are needed internally; every call site is still fully typed.
 */
export function TypedPropertiesEditor<
  TFieldValues extends FieldValues,
  TName extends FieldArrayPath<TFieldValues>,
>({
  control,
  name,
  canEdit,
  register,
  watch,
  setValue,
  clearErrors,
  errors,
  title,
  description,
  addLabel = 'Add property',
  emptyLabel = 'No properties configured',
}: {
  control: Control<TFieldValues>;
  name: TName;
  canEdit: boolean;
  register: UseFormRegister<TFieldValues>;
  watch: UseFormWatch<TFieldValues>;
  setValue: UseFormSetValue<TFieldValues>;
  clearErrors: UseFormClearErrors<TFieldValues>;
  errors?: (TypedPropertyFieldErrors | undefined)[];
  /** Rendered as an `h2` alongside the "Add" button. Omit to render just the button. */
  title?: ReactNode;
  description?: ReactNode;
  addLabel?: ReactNode;
  emptyLabel?: ReactNode;
}) {
  const { fields, append, remove, move } = useFieldArray({ control, name });

  const dndId = useId();
  const rowIdPrefix = useId();
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

  const emptyProperty: TypedPropertyField = { name: '', type: 'string', default: '', enum: [] };

  return (
    <div>
      <div
        className={clsx(
          'd-flex align-items-center flex-wrap gap-2 mb-3',
          title ? 'justify-content-between' : 'justify-content-end',
        )}
      >
        {title && <h2 className="h5 card-title mb-0">{title}</h2>}
        <Button
          variant="outline-primary"
          size="sm"
          disabled={!canEdit}
          onClick={() => append(emptyProperty as unknown as FieldArray<TFieldValues, TName>)}
        >
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          {addLabel}
        </Button>
      </div>
      {description && <small className="text-muted d-block mb-3">{description}</small>}

      {fields.length === 0 && (
        <div className="border rounded p-4 text-center text-muted">
          <i className="bi bi-sliders fs-3 d-block mb-2" aria-hidden="true" />
          {emptyLabel}
        </div>
      )}

      {fields.length > 0 && (
        <DndContext
          // The grid wrapper has overflow-x: auto for horizontal scrolling on narrow
          // viewports, which makes dnd-kit treat it as scrollable on ALL axes
          // (it checks /(auto|scroll|overlay)/ without distinguishing axes).
          // Exclude it so dragging doesn't vertically scroll the contents.
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
                'border rounded',
                canEdit ? 'typed-properties-grid-editable' : 'typed-properties-grid-readonly',
              )}
            >
              <div className="typed-properties-grid-header">
                {canEdit && <div />}
                <div>Name</div>
                <div>Type</div>
                <div>Default</div>
                <div>Values</div>
                {canEdit && <div />}
              </div>
              <div ref={gridRef} className="typed-properties-grid-rows">
                {fields.map((field, index) => (
                  <PropertyRow
                    key={field.id}
                    idPrefix={rowIdPrefix}
                    field={field as unknown as TypedPropertyField & { id: string }}
                    index={index}
                    name={name}
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

function fieldPath<TFieldValues extends FieldValues, TName extends FieldArrayPath<TFieldValues>>(
  name: TName,
  index: number,
  key: keyof TypedPropertyField,
): Path<TFieldValues> {
  return `${name}.${index}.${key}` as Path<TFieldValues>;
}

function PropertyRow<TFieldValues extends FieldValues, TName extends FieldArrayPath<TFieldValues>>({
  idPrefix,
  field,
  index,
  name,
  canEdit,
  register,
  watch,
  setValue,
  errors,
  remove,
  clearErrors,
}: {
  idPrefix: string;
  field: TypedPropertyField & { id: string };
  index: number;
  name: TName;
  canEdit: boolean;
  register: UseFormRegister<TFieldValues>;
  watch: UseFormWatch<TFieldValues>;
  setValue: UseFormSetValue<TFieldValues>;
  errors?: TypedPropertyFieldErrors;
  remove: (index: number) => void;
  clearErrors: UseFormClearErrors<TFieldValues>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    disabled: !canEdit,
  });

  const propType = watch(fieldPath(name, index, 'type')) as unknown as TypedPropertyField['type'];
  const propertyDefaultValue = watch(
    fieldPath(name, index, 'default'),
  ) as unknown as TypedPropertyField['default'];
  const enumValues = watch(fieldPath(name, index, 'enum')) as unknown as TypedPropertyField['enum'];
  const allProperties = watch(name) as unknown as TypedPropertyField[];

  const nameColIndex = canEdit ? 2 : 1;
  const defaultColIndex = canEdit ? 4 : 3;

  return (
    <div
      ref={setNodeRef}
      style={{
        // Use Translate, not Transform: dnd-kit's full transform includes scaleX/scaleY,
        // which visually warps variable-height rows. See https://github.com/clauderic/dnd-kit/issues/44.
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="typed-properties-grid-row"
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
          id={`${idPrefix}-${index}-name`}
          disabled={!canEdit}
          placeholder="e.g. show_hints"
          defaultValue={field.name}
          aria-invalid={!!errors?.name || undefined}
          aria-errormessage={errors?.name ? `${idPrefix}-${index}-name-error` : undefined}
          {...register(fieldPath(name, index, 'name'), {
            required: 'Name is required',
            validate: {
              unique: (value) => {
                const duplicates = allProperties.filter((p, i) => i !== index && p.name === value);
                return duplicates.length === 0 || 'Name must be unique';
              },
            },
          })}
        />
      </div>
      <div>
        <select
          className="form-select form-select-sm"
          id={`${idPrefix}-${index}-type`}
          disabled={!canEdit}
          defaultValue={field.type}
          {...register(fieldPath(name, index, 'type'), {
            onChange: (e) => {
              setValue(fieldPath(name, index, 'enum'), [] as never, { shouldDirty: true });
              // Sync react-hook-form's value when switching to boolean: the <select>
              // shows "true" visually, but the internal value is still the old one.
              if (e.target.value === 'boolean') {
                if (propertyDefaultValue !== 'true' && propertyDefaultValue !== 'false') {
                  setValue(fieldPath(name, index, 'default'), 'true' as never);
                }
                clearErrors(fieldPath(name, index, 'default'));
                return;
              }

              setValue(fieldPath(name, index, 'default'), '' as never, { shouldValidate: false });
            },
          })}
        >
          <option value="string">String</option>
          <option value="number">Number</option>
          <option value="boolean">Boolean</option>
        </select>
      </div>
      <div>
        {propType === 'boolean' ? (
          <select
            className={clsx('form-select form-select-sm', errors?.default && 'is-invalid')}
            id={`${idPrefix}-${index}-default`}
            disabled={!canEdit}
            value={String(propertyDefaultValue)}
            aria-invalid={!!errors?.default || undefined}
            aria-errormessage={errors?.default ? `${idPrefix}-${index}-default-error` : undefined}
            {...register(fieldPath(name, index, 'default'), {
              required: 'A default value is required',
            })}
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : enumValues.length > 0 ? (
          <select
            className={clsx('form-select form-select-sm', errors?.default && 'is-invalid')}
            id={`${idPrefix}-${index}-default`}
            disabled={!canEdit}
            defaultValue={String(field.default)}
            aria-invalid={!!errors?.default || undefined}
            aria-errormessage={errors?.default ? `${idPrefix}-${index}-default-error` : undefined}
            {...register(fieldPath(name, index, 'default'), {
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
            type={propType === 'number' ? 'number' : 'text'}
            step={propType === 'number' ? 'any' : undefined}
            className={clsx('form-control form-control-sm', errors?.default && 'is-invalid')}
            id={`${idPrefix}-${index}-default`}
            disabled={!canEdit}
            defaultValue={String(field.default)}
            aria-invalid={!!errors?.default || undefined}
            aria-errormessage={errors?.default ? `${idPrefix}-${index}-default-error` : undefined}
            {...register(fieldPath(name, index, 'default'), {
              required: 'A default value is required',
              validate: {
                matchesType: (value) => {
                  const currentType = watch(
                    fieldPath(name, index, 'type'),
                  ) as unknown as TypedPropertyField['type'];
                  if (currentType === 'number' && !Number.isFinite(Number(value))) {
                    return 'Must be a finite number';
                  }
                  return true;
                },
              },
            })}
          />
        )}
      </div>
      <div>
        {propType === 'boolean' ? (
          <span className="text-muted small">N/A</span>
        ) : (
          <EnumInput
            name={name}
            index={index}
            canEdit={canEdit}
            propType={propType}
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
            aria-label={`Remove property ${index + 1}`}
            onClick={() => remove(index)}
          >
            <i className="bi bi-trash" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Row 2: error messages (explicitly placed on grid row 2) */}
      {errors?.name && (
        <div
          id={`${idPrefix}-${index}-name-error`}
          className="invalid-feedback d-block"
          style={{ gridColumn: nameColIndex, gridRow: 2 }}
        >
          {errors.name.message}
        </div>
      )}
      {errors?.default && (
        <div
          id={`${idPrefix}-${index}-default-error`}
          className="invalid-feedback d-block"
          style={{ gridColumn: defaultColIndex, gridRow: 2 }}
        >
          {errors.default.message}
        </div>
      )}
    </div>
  );
}

function EnumInput<TFieldValues extends FieldValues, TName extends FieldArrayPath<TFieldValues>>({
  name,
  index,
  canEdit,
  propType,
  watch,
  setValue,
  clearErrors,
}: {
  name: TName;
  index: number;
  canEdit: boolean;
  propType: string;
  watch: UseFormWatch<TFieldValues>;
  setValue: UseFormSetValue<TFieldValues>;
  clearErrors: UseFormClearErrors<TFieldValues>;
}) {
  const [inputValue, setInputValue] = useState('');
  const [adding, setAdding] = useState(false);
  const enumValues = watch(fieldPath(name, index, 'enum')) as unknown as TypedPropertyField['enum'];

  const currentDefault = watch(
    fieldPath(name, index, 'default'),
  ) as unknown as TypedPropertyField['default'];

  function addValue() {
    const trimmed = inputValue.trim();
    if (!trimmed || enumValues.includes(trimmed)) return;
    if (enumValues.length === 0) {
      setValue(fieldPath(name, index, 'default'), trimmed as never, { shouldDirty: true });
      clearErrors(fieldPath(name, index, 'default'));
    }
    setValue(fieldPath(name, index, 'enum'), [...enumValues, trimmed] as never, {
      shouldDirty: true,
    });
    setInputValue('');
  }

  function removeValue(val: string) {
    const remaining = enumValues.filter((v) => v !== val);
    setValue(fieldPath(name, index, 'enum'), remaining as never, { shouldDirty: true });
    if (remaining.length === 0) {
      setValue(fieldPath(name, index, 'default'), '' as never, { shouldDirty: true });
    } else if (String(currentDefault) === val) {
      setValue(fieldPath(name, index, 'default'), remaining[0] as never, { shouldDirty: true });
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
      {/* Serialized for pages that submit this form as a native POST (e.g. question settings),
          which reconstructs nested arrays from flat `name.index.field` keys server-side. */}
      <input type="hidden" name={fieldPath(name, index, 'enum')} value={JSON.stringify(enumValues)} />
      <div className="d-flex flex-wrap gap-1 align-items-center">
        {enumValues.map((val) => (
          <span
            key={val}
            className="badge bg-light text-dark border d-inline-flex align-items-center gap-1 typed-properties-enum-badge"
            title={val}
          >
            <span className="text-truncate">{val}</span>
            {canEdit && (
              <button
                type="button"
                className="btn-close typed-properties-enum-remove"
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
              type={propType === 'number' ? 'number' : 'text'}
              step={propType === 'number' ? 'any' : undefined}
              className="form-control form-control-sm typed-properties-enum-input"
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
              className="btn btn-xs btn-outline-primary d-inline-flex align-items-center gap-1 typed-properties-enum-add-btn"
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
