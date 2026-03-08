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
import { Fragment, useMemo } from 'react';
import { Button } from 'react-bootstrap';

import { RuleSummaryCard } from './RuleSummary.js';
import type { AccessControlRuleFormData } from './types.js';

interface SortableOverrideCardProps {
  id: string;
  override: AccessControlRuleFormData;
  title: string;
  courseInstanceId: string;
  onEdit: () => void;
  onRemove: () => void;
}

function SortableOverrideCard({
  id,
  override,
  title,
  courseInstanceId,
  onEdit,
  onRemove,
}: SortableOverrideCardProps) {
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
        dragHandleProps={{ ...attributes, ...listeners }}
        onEdit={onEdit}
        onRemove={onRemove}
      />
    </div>
  );
}

interface AccessControlSummaryProps {
  mainRule: AccessControlRuleFormData;
  overrides: AccessControlRuleFormData[];
  /** Get the display name for an override by index */
  getOverrideName: (index: number) => string;
  onAddOverride: () => void;
  onRemoveOverride: (index: number) => void;
  onMoveOverride: (fromIndex: number, toIndex: number) => void;
  /** Callback when main rule edit is requested */
  onEditMainRule: () => void;
  /** Callback when an override edit is requested */
  onEditOverride: (index: number) => void;
  /** Course instance ID for building URLs */
  courseInstanceId: string;
}

export function AccessControlSummary({
  mainRule,
  overrides,
  getOverrideName,
  onAddOverride,
  onRemoveOverride,
  onMoveOverride,
  onEditMainRule,
  onEditOverride,
  courseInstanceId,
}: AccessControlSummaryProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const sortableIds = useMemo(() => overrides.map((o) => o.trackingId), [overrides]);

  const hasIndividualOverrides = overrides.some((o) => o.appliesTo.targetType === 'individual');
  const hasLabelOverrides = overrides.some((o) => o.appliesTo.targetType === 'student_label');
  const hasBothTypes = hasIndividualOverrides && hasLabelOverrides;

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
      <section className="mb-4">
        <h5 className="mb-3">Main rule</h5>
        <RuleSummaryCard
          rule={mainRule}
          isMainRule={true}
          title="Main access control rule"
          courseInstanceId={courseInstanceId}
          onEdit={onEditMainRule}
        />
      </section>

      <section>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="mb-0">Overrides</h5>
          <Button variant="success" size="sm" onClick={onAddOverride}>
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
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              {overrides.map((override, index) => {
                const isFirstIndividual =
                  hasBothTypes && index === 0 && override.appliesTo.targetType === 'individual';
                const isFirstLabel =
                  hasBothTypes &&
                  override.appliesTo.targetType === 'student_label' &&
                  (index === 0 || overrides[index - 1].appliesTo.targetType !== 'student_label');

                return (
                  <Fragment key={sortableIds[index]}>
                    {isFirstIndividual && (
                      <small className="text-muted fw-semibold d-block mb-2">
                        Individual overrides
                      </small>
                    )}
                    {isFirstLabel && (
                      <small className="text-muted fw-semibold d-block mb-2 mt-3">
                        Student label overrides
                      </small>
                    )}
                    <SortableOverrideCard
                      id={sortableIds[index]}
                      override={override}
                      title={getOverrideName(index)}
                      courseInstanceId={courseInstanceId}
                      onEdit={() => onEditOverride(index)}
                      onRemove={() => onRemoveOverride(index)}
                    />
                  </Fragment>
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </section>
    </div>
  );
}
