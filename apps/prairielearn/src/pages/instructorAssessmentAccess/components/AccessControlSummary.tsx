import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Fragment, type ReactNode, useId, useMemo } from 'react';
import { Badge, Button } from 'react-bootstrap';
import { useFormState } from 'react-hook-form';

import type { PrairieTestExamMetadata } from '../../../models/assessment-access-control-rules.js';

import {
  DateTableView,
  DefaultRuleCurrentIndicator,
  OverrideRuleSummaryCard,
  PrairieTestExamsTable,
  type RuleFormErrors,
  generateDefaultRuleDateTableRows,
  generateRuleSummary,
} from './RuleSummary.js';
import type { AccessControlFormData, DefaultRuleData, OverrideData } from './types.js';

/**
 * Count leaf errors in a react-hook-form errors object. Leaf nodes have a
 * `message` property; everything else is a container.
 */
function countErrors(obj: unknown): number {
  if (!obj || typeof obj !== 'object') return 0;
  if ('message' in obj && typeof (obj as Record<string, unknown>).message === 'string') return 1;
  return Object.values(obj).reduce((sum: number, val) => sum + countErrors(val), 0);
}

function SortableOverrideCard({
  id,
  override,
  formErrors,
  title,
  displayTimezone,
  onEdit,
  onRemove,
}: {
  id: string;
  override: OverrideData;
  formErrors: RuleFormErrors | undefined;
  title: string;
  displayTimezone: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    opacity: isDragging ? 0.6 : 1,
    transform: CSS.Transform.toString(transform ? { ...transform, scaleX: 1, scaleY: 1 } : null),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <OverrideRuleSummaryCard
        rule={override}
        title={title}
        displayTimezone={displayTimezone}
        formErrors={formErrors}
        dragHandleProps={{ ...attributes, ...listeners }}
        onEdit={onEdit}
        onRemove={onRemove}
      />
    </div>
  );
}

function SummaryItemChips({
  items,
}: {
  items: { key: string; icon: string; text: ReactNode; error?: string }[];
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="d-flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item.key}
            className={`d-inline-flex align-items-center gap-1 rounded-pill px-3 py-1 ${
              item.error ? 'border-danger text-danger border' : 'border'
            }`}
            style={{ fontSize: '0.875rem' }}
          >
            {item.error ? (
              <i className="bi bi-exclamation-circle" aria-hidden="true" />
            ) : (
              <i className={`bi ${item.icon}`} aria-hidden="true" />
            )}
            {item.text}
          </span>
        ))}
      </div>
    </div>
  );
}

function DefaultRuleSummaryContent({
  rule,
  formErrors,
  displayTimezone,
  prairieTestExamMetadata,
  ptHost,
}: {
  rule: DefaultRuleData;
  formErrors: RuleFormErrors | undefined;
  displayTimezone: string;
  prairieTestExamMetadata: PrairieTestExamMetadata[];
  ptHost: string;
}) {
  const summaryItems = generateRuleSummary(rule, displayTimezone, formErrors);
  const dateTableRows = generateDefaultRuleDateTableRows(rule, displayTimezone, formErrors);
  const hasPrairieTestExams = rule.prairieTestExams.length > 0;

  return (
    <div>
      <DefaultRuleCurrentIndicator rule={rule} displayTimezone={displayTimezone} />

      {dateTableRows.length > 0 && (
        <div className="mb-2">
          <DateTableView rows={dateTableRows} />
        </div>
      )}

      {hasPrairieTestExams && (
        <div className="mb-2">
          <PrairieTestExamsTable
            exams={rule.prairieTestExams}
            initialMetadata={prairieTestExamMetadata}
            ptHost={ptHost}
            formErrors={formErrors}
          />
        </div>
      )}

      {summaryItems.length > 0 && <SummaryItemChips items={summaryItems} />}

      {dateTableRows.length === 0 && !hasPrairieTestExams && summaryItems.length === 0 && (
        <div
          className="rounded text-center py-3 text-body-secondary"
          style={{ border: '2px dashed var(--bs-border-color)' }}
        >
          No access settings configured.
        </div>
      )}
    </div>
  );
}

export function AccessControlSummary({
  defaultRule,
  overrides,
  getOverrideName,
  onAddOverride,
  onRemoveOverride,
  onMoveOverride,
  onEditDefaultRule,
  onClearDefaultRule,
  onEditOverride,
  displayTimezone,
  prairieTestExamMetadata,
  ptHost,
}: {
  defaultRule: DefaultRuleData;
  overrides: OverrideData[];
  /** Get the display name for an override by index */
  getOverrideName: (index: number) => string;
  onAddOverride: () => void;
  onRemoveOverride: (index: number) => void;
  onMoveOverride: (fromIndex: number, toIndex: number) => void;
  /** Callback when default rule edit is requested */
  onEditDefaultRule: () => void;
  /** Callback when default rule reset is requested */
  onClearDefaultRule: () => void;
  /** Callback when an override edit is requested */
  onEditOverride: (index: number) => void;
  displayTimezone: string;
  prairieTestExamMetadata: PrairieTestExamMetadata[];
  ptHost: string;
}) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const sortableIds = useMemo(() => overrides.map((o) => o.trackingId), [overrides]);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const oldIndex = sortableIds.indexOf(String(active.id));
    const newIndex = sortableIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    // Prevent reordering across override types (enrollment must stay before student_label)
    if (overrides[oldIndex].appliesTo.targetType !== overrides[newIndex].appliesTo.targetType) {
      return;
    }

    onMoveOverride(oldIndex, newIndex);
  };

  const { errors } = useFormState<AccessControlFormData>();
  const defaultRuleErrorCount = countErrors(errors.defaultRule);
  const overridesErrorCount = countErrors(errors.overrides);

  return (
    <div>
      <section className="mb-4">
        <div className="d-flex justify-content-between align-items-center gap-2 mb-1">
          <h5 className="mb-0 d-flex align-items-center">
            Defaults
            {defaultRuleErrorCount > 0 && (
              <Badge bg="danger" className="ms-2" style={{ fontSize: '0.7rem' }}>
                {defaultRuleErrorCount} {defaultRuleErrorCount === 1 ? 'error' : 'errors'}
              </Badge>
            )}
          </h5>
          <div className="d-flex gap-2">
            <Button
              variant="outline-primary"
              size="sm"
              aria-label="Edit"
              onClick={onEditDefaultRule}
            >
              <i className="bi bi-pencil" aria-hidden="true" />
              <span className="toolbar-btn-label ms-1">Edit</span>
            </Button>
            <Button
              variant="outline-danger"
              size="sm"
              aria-label="Clear"
              onClick={onClearDefaultRule}
            >
              <i className="bi bi-trash" aria-hidden="true" />
              <span className="toolbar-btn-label ms-1">Clear</span>
            </Button>
          </div>
        </div>
        <small className="text-body-secondary d-block mb-3">
          Access settings that apply to all students by default.
        </small>

        <DefaultRuleSummaryContent
          rule={defaultRule}
          formErrors={errors.defaultRule}
          displayTimezone={displayTimezone}
          prairieTestExamMetadata={prairieTestExamMetadata}
          ptHost={ptHost}
        />
      </section>

      <section>
        <div className="d-flex justify-content-between align-items-center gap-2 mb-1">
          <h5 className="mb-0 d-flex align-items-center">
            Overrides
            {overridesErrorCount > 0 && (
              <Badge bg="danger" className="ms-2" style={{ fontSize: '0.7rem' }}>
                {overridesErrorCount} {overridesErrorCount === 1 ? 'error' : 'errors'}
              </Badge>
            )}
          </h5>
          <Button variant="primary" size="sm" onClick={onAddOverride}>
            <i className="bi bi-plus-lg me-1" /> Add override
          </Button>
        </div>
        <small className="text-body-secondary d-block mb-3">
          Customize settings for specific students or groups. Fields not overridden are inherited
          from the defaults and any earlier overrides.
        </small>

        {overrides.length === 0 ? (
          <div
            className="rounded text-center py-3 text-body-secondary"
            style={{ border: '2px dashed var(--bs-border-color)' }}
          >
            No overrides configured.
          </div>
        ) : (
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {overrides.map((override, index) => {
                const isFirstEnrollment =
                  override.appliesTo.targetType === 'enrollment' &&
                  (index === 0 || overrides[index - 1].appliesTo.targetType !== 'enrollment');
                const isFirstLabel =
                  override.appliesTo.targetType === 'student_label' &&
                  (index === 0 || overrides[index - 1].appliesTo.targetType !== 'student_label');

                return (
                  <Fragment key={sortableIds[index]}>
                    {isFirstEnrollment && (
                      <small className="text-muted fw-semibold d-block mb-2">
                        Overrides for specific students
                      </small>
                    )}
                    {isFirstLabel && (
                      <small className="text-muted fw-semibold d-block mb-2 mt-3">
                        Overrides for student labels
                      </small>
                    )}
                    <SortableOverrideCard
                      id={sortableIds[index]}
                      override={override}
                      formErrors={errors.overrides?.[index]}
                      title={getOverrideName(index)}
                      displayTimezone={displayTimezone}
                      onEdit={() => onEditOverride(index)}
                      onRemove={() => onRemoveOverride(index)}
                    />
                  </Fragment>
                );
              })}
            </SortableContext>
          </DndContext>
        )}

        <div className="rounded p-3 mt-3" style={{ backgroundColor: 'var(--bs-tertiary-bg)' }}>
          <p className="text-body-secondary small mb-0">
            If a student matches multiple overrides, student-specific overrides take priority over
            student label overrides. Within each section, overrides lower in the list take priority
            over those higher up.
          </p>
        </div>
      </section>
    </div>
  );
}
