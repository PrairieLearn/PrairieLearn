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
import { Alert, Button, Table } from 'react-bootstrap';

import { RuleSummaryCard, generateDateTableRows, generateRuleSummary } from './RuleSummary.js';
import type { MainRuleData, OverrideData } from './types.js';

interface SortableOverrideCardProps {
  id: string;
  override: OverrideData;
  title: string;
  courseInstanceId: string;
  errors?: string[];
  onEdit: () => void;
  onRemove: () => void;
}

function SortableOverrideCard({
  id,
  override,
  title,
  courseInstanceId,
  errors,
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
        errors={errors}
        dragHandleProps={{ ...attributes, ...listeners }}
        onEdit={onEdit}
        onRemove={onRemove}
      />
    </div>
  );
}

function MainRuleSummaryContent({ rule }: { rule: MainRuleData }) {
  const summaryLines = generateRuleSummary(rule, 'compact');
  const dateTableRows = generateDateTableRows(rule, 'compact');

  return (
    <div>
      {dateTableRows.length > 0 && (
        <div className="mb-3">
          <Table size="sm" className="mb-0" bordered>
            <thead className="table-light">
              <tr>
                <th>Date</th>
                <th>Credit</th>
                <th>Visibility</th>
              </tr>
            </thead>
            <tbody>
              {dateTableRows.map((row) => (
                <tr key={`${row.date}-${row.label}-${row.credit}-${row.visibility}`}>
                  <td>
                    {row.label && <span className="text-muted me-1">{row.label}:</span>}
                    {row.date}
                  </td>
                  <td>{row.credit}</td>
                  <td>{row.visibility}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {summaryLines.length > 0 && (
        <ul className="mb-0 ps-3">
          {summaryLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {dateTableRows.length === 0 && summaryLines.length === 0 && (
        <p className="text-muted mb-0">No specific settings configured</p>
      )}
    </div>
  );
}

interface AccessControlSummaryProps {
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
}: AccessControlSummaryProps) {
  const dndId = useId();
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
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="mb-0">Main rule</h5>
          <Button variant="outline-primary" size="sm" onClick={onEditMainRule}>
            <i className="bi bi-pencil me-1" /> Edit
          </Button>
        </div>

        {mainRuleErrors && mainRuleErrors.length > 0 && (
          <Alert variant="danger" className="mb-3">
            <ul className="mb-0">
              {mainRuleErrors.map((msg) => (
                <li key={msg}>{msg}</li>
              ))}
            </ul>
          </Alert>
        )}

        <MainRuleSummaryContent rule={mainRule} />
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
            id={dndId}
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
      </section>
    </div>
  );
}
