import {
  DndContext,
  type DragEndEvent,
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
import { useMemo, useState } from 'preact/compat';

import { AssessmentSetHeading } from '../../../components/AssessmentSetHeading.js';
import type { StaffAssessmentSet } from '../../../lib/client/safe-db-types.js';
import { ColorJsonSchema } from '../../../schemas/index.js';

import {
  EditAssessmentSetsModal,
  type EditAssessmentSetsModalState,
} from './EditAssessmentSetModal.js';

const emptyAssessmentSet = {
  abbreviation: '',
  color: '',
  heading: '',
  implicit: false,
  json_comment: '',
  name: '',
};

function AssessmentSetRow({
  assessmentSet,
  editMode,
  allowEdit,
  onEdit,
  onDelete,
}: {
  assessmentSet: StaffAssessmentSet;
  editMode: boolean;
  allowEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: assessmentSet.id,
  });

  const style = {
    opacity: isDragging ? 0.6 : 1,
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? 'rgba(0,0,0,0.04)' : undefined,
  };

  return (
    <tr key={assessmentSet.id} ref={setNodeRef} style={style}>
      {editMode && allowEdit && (
        <td class="align-middle">
          <div class="d-flex align-items-center">
            <button
              type="button"
              class="btn btn-sm btn-ghost"
              style={{ cursor: 'grab', touchAction: 'none' }}
              aria-label="Drag row"
              {...listeners}
            >
              <i class="fa fa-grip-vertical" aria-hidden="true" />
            </button>

            <button class="btn btn-sm btn-ghost" type="button" onClick={onEdit}>
              <i class="fa fa-edit" aria-hidden="true" />
            </button>
            <button class="btn btn-sm btn-ghost" type="button" onClick={onDelete}>
              <i class="fa fa-trash text-danger" aria-hidden="true" />
            </button>
          </div>
        </td>
      )}
      <td class="align-middle">
        <span class={`badge color-${assessmentSet.color}`}>{assessmentSet.abbreviation}</span>
      </td>
      <td class="align-middle">{assessmentSet.name}</td>
      <td class="align-middle">
        <AssessmentSetHeading assessmentSet={assessmentSet} />
      </td>
    </tr>
  );
}

function DraggableTable({
  assessmentSetsState,
  setAssessmentSetsState,
  editMode,
  allowEdit,
  handleEdit,
  handleDelete,
  handleCreate,
}: {
  assessmentSetsState: StaffAssessmentSet[];
  setAssessmentSetsState: (setter: (items: StaffAssessmentSet[]) => StaffAssessmentSet[]) => void;
  editMode: boolean;
  allowEdit: boolean;
  handleEdit: (index: number) => void;
  handleDelete: (id: string) => void;
  handleCreate: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => assessmentSetsState.map((s) => s.id), [assessmentSetsState]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      autoScroll={false}
      onDragEnd={({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;

        setAssessmentSetsState((items) => {
          const oldIndex = items.findIndex((item) => item.id === active.id);
          const newIndex = items.findIndex((item) => item.id === over.id);
          if (oldIndex === -1 || newIndex === -1) return items;
          return arrayMove(items, oldIndex, newIndex);
        });
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <table class="table table-sm table-hover table-striped" aria-label="Assessment sets">
          <thead>
            <tr>
              {editMode && allowEdit && (
                <th style="width: 1%">
                  <span class="visually-hidden">Drag, Edit and Delete</span>
                </th>
              )}
              <th>Abbreviation</th>
              <th>Name</th>
              <th class="col-8">Heading</th>
            </tr>
          </thead>

          <tbody>
            {assessmentSetsState.map((assessmentSet, index) => (
              <AssessmentSetRow
                key={assessmentSet.id}
                assessmentSet={assessmentSet}
                editMode={editMode}
                allowEdit={allowEdit}
                onEdit={() => handleEdit(index)}
                onDelete={() => handleDelete(assessmentSet.id)}
              />
            ))}

            {editMode && allowEdit && (
              <tr>
                <td colSpan={4}>
                  <button class="btn btn-sm btn-ghost" type="button" onClick={handleCreate}>
                    <i class="fa fa-plus" aria-hidden="true" /> New assessment set
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

export function AssessmentSetsTable({
  assessmentSets,
  allowEdit,
  origHash,
  csrfToken,
}: {
  assessmentSets: StaffAssessmentSet[];
  allowEdit: boolean;
  origHash: string | null;
  csrfToken: string;
}) {
  const [editMode, setEditMode] = useState(false);
  const [assessmentSetsState, setAssessmentSetsState] =
    useState<StaffAssessmentSet[]>(assessmentSets);
  const [modalState, setModalState] = useState<EditAssessmentSetsModalState>({ type: 'closed' });

  const handleCreate = () => {
    setModalState({
      type: 'create',
      assessmentSet: {
        ...(emptyAssessmentSet as StaffAssessmentSet),
        id: crypto.randomUUID(),
        color: ColorJsonSchema.options[Math.floor(Math.random() * ColorJsonSchema.options.length)],
      },
    });
  };

  const handleEdit = (index: number) => {
    setModalState({
      type: 'edit',
      assessmentSet: {
        ...assessmentSetsState[index],
        implicit: false,
      },
    });
  };

  const handleSave = (assessmentSet: StaffAssessmentSet) => {
    if (modalState.type === 'create') {
      setAssessmentSetsState((prevAssessmentSets) => [...prevAssessmentSets, assessmentSet]);
    } else if (modalState.type === 'edit') {
      setAssessmentSetsState((prevAssessmentSets) =>
        prevAssessmentSets.map((d) => (d.id === assessmentSet.id ? assessmentSet : d)),
      );
    }
    setModalState({ type: 'closed' });
  };

  const handleDelete = (deleteId: string) => {
    setAssessmentSetsState((prevAssessmentSets) =>
      prevAssessmentSets.filter((d) => d.id !== deleteId),
    );
  };

  return (
    <>
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>Assessment sets</h1>
          <div class="ms-auto">
            {allowEdit && origHash ? (
              !editMode ? (
                <button
                  class="btn btn-sm btn-light mx-1"
                  type="button"
                  onClick={() => setEditMode(true)}
                >
                  <i class="fa fa-edit" aria-hidden="true" /> Edit assessment sets
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
                  <button class="btn btn-sm btn-light mx-1" type="submit">
                    <i class="fa fa-save" aria-hidden="true" />
                    Save and sync
                  </button>
                  <button
                    class="btn btn-sm btn-light"
                    type="button"
                    onClick={() => window.location.reload()}
                  >
                    Cancel
                  </button>
                </form>
              )
            ) : (
              ''
            )}
          </div>
        </div>

        <div class="table-responsive">
          <DraggableTable
            assessmentSetsState={assessmentSetsState}
            setAssessmentSetsState={setAssessmentSetsState}
            editMode={editMode}
            allowEdit={allowEdit}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
            handleCreate={handleCreate}
          />
        </div>
      </div>

      <EditAssessmentSetsModal
        state={modalState}
        onClose={() => setModalState({ type: 'closed' })}
        onSave={handleSave}
      />
    </>
  );
}

AssessmentSetsTable.displayName = 'AssessmentSetsTable';
