import {
  DndContext,
  type DragEndEvent,
  type DraggableAttributes,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { type AriaRole, useMemo, useState } from 'react';

import { OverlayTrigger, useModalState } from '@prairielearn/ui';

import { AssessmentSetHeading } from '../../../components/AssessmentSetHeading.js';
import { ColorJsonSchema } from '../../../schemas/index.js';
import type { InstructorCourseAdminSetFormRow } from '../instructorCourseAdminSets.types.js';

import {
  AssessmentSetUsageModal,
  type AssessmentSetUsageModalData,
} from './AssessmentSetUsageModal.js';
import {
  type EditAssessmentSetModalData,
  EditAssessmentSetsModal,
} from './EditAssessmentSetModal.js';

const emptyAssessmentSet = {
  abbreviation: '',
  assessments: [],
  color: '',
  course_id: null,
  heading: '',
  id: null,
  implicit: false,
  json_comment: null,
  name: '',
  number: 0,
};

function AssessmentSetRow({
  assessmentSet,
  editMode,
  allowEdit,
  onEdit,
  onDelete,
  onShowUsage,
}: {
  assessmentSet: InstructorCourseAdminSetFormRow;
  editMode: boolean;
  allowEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onShowUsage: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: assessmentSet.trackingId,
  });

  const style = {
    opacity: isDragging ? 0.6 : 1,
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? 'rgba(0,0,0,0.04)' : undefined,
  };

  return (
    <tr key={assessmentSet.trackingId} ref={setNodeRef} style={style}>
      {editMode && allowEdit && (
        <td className="align-middle">
          <div className="d-flex align-items-center">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ cursor: 'grab', touchAction: 'none' }}
              aria-label="Drag row"
              {...(attributes as DraggableAttributes & { role: AriaRole })}
              {...listeners}
            >
              <i className="fa fa-grip-vertical" aria-hidden="true" />
            </button>

            <button
              className="btn btn-sm btn-ghost"
              type="button"
              aria-label="Edit"
              onClick={onEdit}
            >
              <i className="fa fa-edit" aria-hidden="true" />
            </button>
            {assessmentSet.assessments.length > 0 ? (
              <OverlayTrigger
                trigger="click"
                tooltip={{
                  body: `This assessment set cannot be deleted because it is referenced by ${assessmentSet.assessments.length} assessment${assessmentSet.assessments.length === 1 ? '' : 's'}.`,
                  props: { id: `delete-tooltip-${assessmentSet.trackingId}` },
                }}
                rootClose
              >
                <button
                  className="btn btn-sm btn-ghost"
                  type="button"
                  aria-label={`Cannot delete: used by ${assessmentSet.assessments.length} assessment${assessmentSet.assessments.length === 1 ? '' : 's'}`}
                >
                  <i className="fa fa-trash text-muted" aria-hidden="true" />
                </button>
              </OverlayTrigger>
            ) : (
              <button
                className="btn btn-sm btn-ghost"
                type="button"
                aria-label="Delete"
                onClick={onDelete}
              >
                <i className="fa fa-trash text-danger" aria-hidden="true" />
              </button>
            )}
          </div>
        </td>
      )}
      <td className="align-middle">
        <span className={`badge color-${assessmentSet.color}`}>{assessmentSet.abbreviation}</span>
      </td>
      <td className="align-middle">{assessmentSet.name}</td>
      <td className="align-middle">
        <AssessmentSetHeading assessmentSet={assessmentSet} />
      </td>
      <td className="align-middle">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary text-nowrap"
          aria-label={`View ${assessmentSet.assessments.length} assessment${assessmentSet.assessments.length === 1 ? '' : 's'} using this set`}
          onClick={onShowUsage}
        >
          View assessments
        </button>
      </td>
    </tr>
  );
}

function AssessmentSetsTable({
  assessmentSetsState,
  setAssessmentSetsState,
  editMode,
  allowEdit,
  handleEdit,
  handleDelete,
  handleCreate,
  handleShowUsage,
}: {
  assessmentSetsState: InstructorCourseAdminSetFormRow[];
  setAssessmentSetsState: (
    setter: (items: InstructorCourseAdminSetFormRow[]) => InstructorCourseAdminSetFormRow[],
  ) => void;
  editMode: boolean;
  allowEdit: boolean;
  handleEdit: (index: number) => void;
  handleDelete: (id: string) => void;
  handleCreate: () => void;
  handleShowUsage: (assessmentSet: InstructorCourseAdminSetFormRow) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => assessmentSetsState.map((s) => s.trackingId), [assessmentSetsState]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      autoScroll={false}
      onDragEnd={({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;

        setAssessmentSetsState((items) => {
          const oldIndex = items.findIndex((item) => item.trackingId === active.id);
          const newIndex = items.findIndex((item) => item.trackingId === over.id);
          if (oldIndex === -1 || newIndex === -1) return items;
          return arrayMove(items, oldIndex, newIndex);
        });
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <table className="table table-sm table-hover table-striped" aria-label="Assessment sets">
          <thead>
            <tr>
              {editMode && allowEdit && (
                <th style={{ width: '1%' }}>
                  <span className="visually-hidden">Drag, Edit and Delete</span>
                </th>
              )}
              <th>Abbreviation</th>
              <th>Name</th>
              <th className="col-8">Heading</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {assessmentSetsState.map((assessmentSet, index) => (
              <AssessmentSetRow
                key={assessmentSet.trackingId}
                assessmentSet={assessmentSet}
                editMode={editMode}
                allowEdit={allowEdit}
                onEdit={() => handleEdit(index)}
                onDelete={() => handleDelete(assessmentSet.trackingId)}
                onShowUsage={() => handleShowUsage(assessmentSet)}
              />
            ))}

            {editMode && allowEdit && (
              <tr>
                <td colSpan={5}>
                  <button className="btn btn-sm btn-ghost" type="button" onClick={handleCreate}>
                    <i className="fa fa-plus" aria-hidden="true" /> New assessment set
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </SortableContext>
    </DndContext>
  );
}

export function AssessmentSetsPage({
  assessmentSets,
  allowEdit,
  origHash,
  csrfToken,
}: {
  assessmentSets: InstructorCourseAdminSetFormRow[];
  allowEdit: boolean;
  origHash: string | null;
  csrfToken: string;
}) {
  const [editMode, setEditMode] = useState(false);
  const [assessmentSetsState, setAssessmentSetsState] =
    useState<InstructorCourseAdminSetFormRow[]>(assessmentSets);
  const editModalState = useModalState<EditAssessmentSetModalData>();
  const usageModalState = useModalState<AssessmentSetUsageModalData>();

  const duplicateNames = useMemo(() => {
    const nameCounts = new Map<string, number>();
    for (const set of assessmentSetsState) {
      nameCounts.set(set.name, (nameCounts.get(set.name) ?? 0) + 1);
    }
    return Array.from(nameCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([name]) => name);
  }, [assessmentSetsState]);

  // Names of other assessment sets (excluding the one currently being edited)
  const existingNames = useMemo(() => {
    const editingId = editModalState.data?.assessmentSet.trackingId ?? null;
    return new Set(
      assessmentSetsState.filter((set) => set.trackingId !== editingId).map((set) => set.name),
    );
  }, [assessmentSetsState, editModalState.data]);

  const handleCreate = () => {
    editModalState.showWithData({
      mode: 'create',
      assessmentSet: {
        ...emptyAssessmentSet,
        trackingId: crypto.randomUUID(),
        color: ColorJsonSchema.options[Math.floor(Math.random() * ColorJsonSchema.options.length)],
      },
    });
  };

  const handleEdit = (index: number) => {
    editModalState.showWithData({
      mode: 'edit',
      assessmentSet: {
        ...assessmentSetsState[index],
        implicit: false,
      },
    });
  };

  const handleSave = (assessmentSet: InstructorCourseAdminSetFormRow) => {
    if (editModalState.data?.mode === 'create') {
      setAssessmentSetsState((prevAssessmentSets) => [...prevAssessmentSets, assessmentSet]);
    } else if (editModalState.data?.mode === 'edit') {
      setAssessmentSetsState((prevAssessmentSets) =>
        prevAssessmentSets.map((d) =>
          d.trackingId === assessmentSet.trackingId ? assessmentSet : d,
        ),
      );
    }
    editModalState.hide();
  };

  const handleDelete = (deleteId: string) => {
    setAssessmentSetsState((prevAssessmentSets) =>
      prevAssessmentSets.filter((d) => d.trackingId !== deleteId),
    );
  };

  return (
    <>
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center">
          <h1>Assessment sets</h1>
          <div className="ms-auto">
            {allowEdit && origHash ? (
              !editMode ? (
                <button
                  className="btn btn-sm btn-light mx-1"
                  type="button"
                  onClick={() => setEditMode(true)}
                >
                  <i className="fa fa-edit" aria-hidden="true" /> Edit assessment sets
                </button>
              ) : (
                <form method="POST">
                  <input type="hidden" name="__action" value="save_assessment_sets" />
                  <input type="hidden" name="__csrf_token" value={csrfToken} />
                  <input type="hidden" name="orig_hash" value={origHash} />
                  <input
                    type="hidden"
                    name="assessment_sets"
                    value={JSON.stringify(assessmentSetsState)}
                  />
                  <button className="btn btn-sm btn-light mx-1" type="submit">
                    <i className="fa fa-save" aria-hidden="true" />
                    Save and sync
                  </button>
                  <button
                    className="btn btn-sm btn-light"
                    type="button"
                    onClick={() => window.location.reload()}
                  >
                    Cancel
                  </button>
                </form>
              )
            ) : null}
          </div>
        </div>

        {editMode && duplicateNames.length > 0 && (
          <div className="alert alert-warning m-3" role="alert">
            <i className="fa fa-exclamation-triangle" aria-hidden="true" />{' '}
            <strong>Duplicate names detected:</strong> {duplicateNames.join(', ')}. Only the last
            assessment set with each name will be synced.
          </div>
        )}

        <div className="table-responsive">
          <AssessmentSetsTable
            assessmentSetsState={assessmentSetsState}
            setAssessmentSetsState={setAssessmentSetsState}
            editMode={editMode}
            allowEdit={allowEdit}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
            handleCreate={handleCreate}
            handleShowUsage={usageModalState.showWithData}
          />
        </div>
      </div>

      <EditAssessmentSetsModal
        {...editModalState}
        existingNames={existingNames}
        onSave={handleSave}
      />

      <AssessmentSetUsageModal {...usageModalState} />
    </>
  );
}

AssessmentSetsPage.displayName = 'AssessmentSetsPage';
