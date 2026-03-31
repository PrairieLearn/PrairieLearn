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
import { Fragment, useId, useMemo } from 'react';
import { Button } from 'react-bootstrap';

import {
  DateTableView,
  RuleSummaryCard,
  generateDateTableRows,
  generateRuleSummary,
} from './RuleSummary.js';
import type { MainRuleData, OverrideData } from './types.js';

function SortableOverrideCard({
  id,
  override,
  title,
  courseInstanceId,
  displayTimezone,
  errors,
  onEdit,
  onRemove,
}: {
  id: string;
  override: OverrideData;
  title: string;
  courseInstanceId: string;
  displayTimezone: string;
  errors?: string[];
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    opacity: isDragging ? 0.6 : 1,
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <RuleSummaryCard
        rule={override}
        isMainRule={false}
        title={title}
        courseInstanceId={courseInstanceId}
        displayTimezone={displayTimezone}
        errors={errors}
        dragHandleProps={{ ...attributes, ...listeners }}
        onEdit={onEdit}
        onRemove={onRemove}
      />
    </div>
  );
}

function MainRuleSummaryContent({
  rule,
  displayTimezone,
}: {
  rule: MainRuleData;
  displayTimezone: string;
}) {
  const summaryItems = generateRuleSummary(rule, 'compact');
  const dateTableRows = generateDateTableRows(rule, displayTimezone, 'compact');

  return (
    <div>
      {dateTableRows.length > 0 && (
        <div className="mb-2">
          <DateTableView rows={dateTableRows} />
        </div>
      )}

      {summaryItems.length > 0 && (
        <div className="d-flex flex-wrap gap-2">
          {summaryItems.map((item) => (
            <span
              key={item.text}
              className="d-inline-flex align-items-center gap-1 border rounded-pill px-3 py-1"
              style={{ fontSize: '0.875rem' }}
            >
              <i className={`bi ${item.icon}`} aria-hidden="true" />
              {item.text}
            </span>
          ))}
        </div>
      )}

      {dateTableRows.length === 0 && summaryItems.length === 0 && (
        <p className="text-body-secondary mb-0">No specific settings configured</p>
      )}
    </div>
  );
}

export function AccessControlSummary({
  mainRule,
  overrides,
  getOverrideName,
  mainRuleErrors,
  getOverrideErrors,
  onAddOverride,
  onRemoveOverride,
  onMoveOverride,
  onEditMainRule,
  onEditOverride,
  courseInstanceId,
  displayTimezone,
}: {
  mainRule: MainRuleData;
  overrides: OverrideData[];
  /** Get the display name for an override by index */
  getOverrideName: (index: number) => string;
  mainRuleErrors?: string[];
  getOverrideErrors?: (index: number) => string[];
  onAddOverride: () => void;
  onRemoveOverride: (index: number) => void;
  onMoveOverride: (fromIndex: number, toIndex: number) => void;
  /** Callback when main rule edit is requested */
  onEditMainRule: () => void;
  /** Callback when an override edit is requested */
  onEditOverride: (index: number) => void;
  /** Course instance ID for building URLs */
  courseInstanceId: string;
  displayTimezone: string;
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

    // Prevent reordering across override types (individual must stay before student_label)
    if (overrides[oldIndex].appliesTo.targetType !== overrides[newIndex].appliesTo.targetType) {
      return;
    }

    onMoveOverride(oldIndex, newIndex);
  };

  return (
    <div>
      <p className="text-muted">
        The <strong>main rule</strong> defines default access settings for all students. Add{' '}
        <strong>overrides</strong> below to customize settings for specific students or groups.
        Overrides cascade: each override layers on top of previous ones, and only the settings you
        explicitly configure are changed.
      </p>

      <section className="mb-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="mb-0">Main rule</h5>
          <Button variant="outline-primary" size="sm" onClick={onEditMainRule}>
            <i className="bi bi-pencil me-1" /> Edit
          </Button>
        </div>

        {mainRuleErrors && mainRuleErrors.length > 0 && (
          <div className="alert alert-danger mb-3">
            <ul className="mb-0">
              {mainRuleErrors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        <MainRuleSummaryContent rule={mainRule} displayTimezone={displayTimezone} />
      </section>

      <section>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="mb-0">Overrides</h5>
          <Button variant="primary" size="sm" onClick={onAddOverride}>
            <i className="bi bi-plus-lg me-1" /> Add override
          </Button>
        </div>

        {overrides.length === 0 ? (
          <p className="text-muted">
            No overrides configured. Overrides allow you to customize access rules for specific
            groups of students.
          </p>
        ) : (
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {overrides.map((override, index) => {
                const isFirstIndividual =
                  index === 0 && override.appliesTo.targetType === 'individual';
                const isFirstLabel =
                  override.appliesTo.targetType === 'student_label' &&
                  (index === 0 || overrides[index - 1].appliesTo.targetType !== 'student_label');

                return (
                  <Fragment key={sortableIds[index]}>
                    {isFirstIndividual && (
                      <small className="text-muted fw-semibold d-block mb-2">
                        Overrides for individual students
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
                      title={getOverrideName(index)}
                      courseInstanceId={courseInstanceId}
                      displayTimezone={displayTimezone}
                      errors={getOverrideErrors?.(index)}
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
            Overrides are applied in order from top to bottom. Student label overrides are evaluated
            first, then individual overrides (which take priority). Each override inherits all
            settings from the ones above it — only explicitly overridden fields are changed.
          </p>
        </div>
      </section>
    </div>
  );
}
