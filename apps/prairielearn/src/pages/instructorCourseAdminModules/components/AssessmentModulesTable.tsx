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
import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Alert } from 'react-bootstrap';

import { OverlayTrigger, useModalState } from '@prairielearn/ui';

import { AssessmentModuleHeading } from '../../../components/AssessmentModuleHeading.js';
import { DEFAULT_ASSESSMENT_MODULE_NAME } from '../../../lib/assessment-module.shared.js';
import { AppErrorAlert, getAppError } from '../../../lib/client/errors.js';
import { QueryClientProviderDebug } from '../../../lib/client/tanstackQuery.js';
import { getCourseEditErrorUrl } from '../../../lib/client/url.js';
import type { AssessmentModulesError } from '../../../trpc/course/assessment-modules.js';
import { createCourseTrpcClient } from '../../../trpc/course/client.js';
import { TRPCProvider, useTRPC } from '../../../trpc/course/context.js';
import type {
  AssessmentModuleFormRow,
  StaffAssessmentModuleWithAssessments,
} from '../instructorCourseAdminModules.types.js';

import {
  AssessmentModuleUsageModal,
  type AssessmentModuleUsageModalData,
} from './AssessmentModuleUsageModal.js';
import {
  DeleteAssessmentModuleModal,
  type DeleteAssessmentModuleModalData,
} from './DeleteAssessmentModuleModal.js';
import {
  EditAssessmentModuleModal,
  type EditAssessmentModuleModalData,
} from './EditAssessmentModuleModal.js';

interface AssessmentModulesPageProps {
  trpcCsrfToken: string;
  courseId: string;
  initialModules: StaffAssessmentModuleWithAssessments[];
  allowEdit: boolean;
  isExampleCourse: boolean;
  isDevMode: boolean;
  origHash: string | null;
}

const emptyModule = {
  assessments: [],
  course_id: null,
  heading: '',
  id: null,
  implicit: false,
  name: '',
  number: 0,
};

function toFormRow(module: StaffAssessmentModuleWithAssessments): AssessmentModuleFormRow {
  return { ...module, trackingId: module.id };
}

function AssessmentModuleRow({
  module,
  editMode,
  allowEdit,
  onEdit,
  onDelete,
  onShowUsage,
}: {
  module: AssessmentModuleFormRow;
  editMode: boolean;
  allowEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onShowUsage: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: module.trackingId,
  });

  const style = {
    opacity: isDragging ? 0.6 : 1,
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? 'rgba(0,0,0,0.04)' : undefined,
  };

  const isDefault = module.name === DEFAULT_ASSESSMENT_MODULE_NAME;

  return (
    <tr ref={setNodeRef} style={style}>
      {editMode && allowEdit && (
        <td className="align-middle">
          <div className="d-flex align-items-center">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ cursor: 'grab', touchAction: 'none' }}
              aria-label="Drag row"
              {...attributes}
              {...listeners}
            >
              <i className="fa fa-grip-vertical" aria-hidden="true" />
            </button>
            <button
              className="btn btn-sm btn-ghost"
              type="button"
              aria-label={`Edit module ${module.name}`}
              onClick={onEdit}
            >
              <i className="fa fa-edit" aria-hidden="true" />
            </button>
            {isDefault ? (
              <OverlayTrigger
                trigger="click"
                tooltip={{
                  body: 'The Default module is required and cannot be deleted.',
                  props: { id: `delete-tooltip-${module.trackingId}` },
                }}
                rootClose
              >
                <button
                  className="btn btn-sm btn-ghost"
                  type="button"
                  aria-label="The Default module cannot be deleted"
                >
                  <i className="fa fa-trash text-muted" aria-hidden="true" />
                </button>
              </OverlayTrigger>
            ) : (
              <button
                className="btn btn-sm btn-ghost"
                type="button"
                aria-label={`Delete module ${module.name}`}
                onClick={onDelete}
              >
                <i className="fa fa-trash text-danger" aria-hidden="true" />
              </button>
            )}
          </div>
        </td>
      )}
      <td className="align-middle">{module.name}</td>
      <td className="align-middle">
        <AssessmentModuleHeading assessmentModule={module} />
      </td>
      <td className="align-middle">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary text-nowrap"
          aria-label={`View ${module.assessments.length} assessment${module.assessments.length === 1 ? '' : 's'} in this module`}
          onClick={onShowUsage}
        >
          View assessments
        </button>
      </td>
    </tr>
  );
}

function AssessmentModulesTable({
  rows,
  setModulesState,
  editMode,
  allowEdit,
  handleEdit,
  handleDelete,
  handleCreate,
  handleShowUsage,
}: {
  rows: AssessmentModuleFormRow[];
  setModulesState: (
    setter: (items: AssessmentModuleFormRow[]) => AssessmentModuleFormRow[],
  ) => void;
  editMode: boolean;
  allowEdit: boolean;
  handleEdit: (trackingId: string) => void;
  handleDelete: (module: AssessmentModuleFormRow) => void;
  handleCreate: () => void;
  handleShowUsage: (module: AssessmentModuleFormRow) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => rows.map((module) => module.trackingId), [rows]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      autoScroll={false}
      onDragEnd={({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;

        setModulesState((items) => {
          const oldIndex = items.findIndex((item) => item.trackingId === active.id);
          const newIndex = items.findIndex((item) => item.trackingId === over.id);
          if (oldIndex === -1 || newIndex === -1) return items;
          return arrayMove(items, oldIndex, newIndex);
        });
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <table className="table table-sm table-hover table-striped" aria-label="Assessment modules">
          <thead>
            <tr>
              {editMode && allowEdit && (
                <th style={{ width: '1%' }}>
                  <span className="visually-hidden">Drag, Edit and Delete</span>
                </th>
              )}
              <th>Name</th>
              <th className="col-8">Heading</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((module) => (
              <AssessmentModuleRow
                key={module.trackingId}
                module={module}
                editMode={editMode}
                allowEdit={allowEdit}
                onEdit={() => handleEdit(module.trackingId)}
                onDelete={() => handleDelete(module)}
                onShowUsage={() => handleShowUsage(module)}
              />
            ))}
            {editMode && allowEdit && (
              <tr>
                <td colSpan={4}>
                  <button className="btn btn-sm btn-ghost" type="button" onClick={handleCreate}>
                    <i className="fa fa-plus" aria-hidden="true" /> New module
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

function AssessmentModulesCard({
  courseId,
  initialModules,
  allowEdit,
  isExampleCourse,
  origHash: initialOrigHash,
}: {
  courseId: string;
  initialModules: StaffAssessmentModuleWithAssessments[];
  allowEdit: boolean;
  isExampleCourse: boolean;
  origHash: string | null;
}) {
  const trpc = useTRPC();
  const editModal = useModalState<EditAssessmentModuleModalData>();
  const usageModal = useModalState<AssessmentModuleUsageModalData>();
  const deleteModal = useModalState<DeleteAssessmentModuleModalData>();

  const { data, refetch } = useQuery({
    ...trpc.assessmentModules.list.queryOptions(),
    staleTime: Infinity,
    initialData: { modules: initialModules, origHash: initialOrigHash },
  });

  const [editMode, setEditMode] = useState(false);
  const [modulesState, setModulesState] = useState<AssessmentModuleFormRow[]>([]);
  const [origHashOverride, setOrigHashOverride] = useState<string | null>(null);
  const origHash = origHashOverride ?? data.origHash ?? initialOrigHash;

  const saveMutation = useMutation({
    ...trpc.assessmentModules.save.mutationOptions(),
    onSuccess: async (result) => {
      setOrigHashOverride(result.origHash);
      try {
        await refetch();
      } finally {
        setEditMode(false);
      }
    },
  });

  const rows = editMode ? modulesState : data.modules.map(toFormRow);

  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const module of rows) {
      counts.set(module.name, (counts.get(module.name) ?? 0) + 1);
    }
    return [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
  }, [rows]);

  const existingNames = useMemo(() => {
    const editingId = editModal.data?.assessmentModule.trackingId ?? null;
    return new Set(
      modulesState.filter((module) => module.trackingId !== editingId).map((module) => module.name),
    );
  }, [modulesState, editModal.data]);

  const enterEditMode = () => {
    setModulesState(data.modules.map(toFormRow));
    saveMutation.reset();
    setEditMode(true);
  };

  const handleCreate = () => {
    editModal.showWithData({
      mode: 'create',
      assessmentModule: { ...emptyModule, trackingId: crypto.randomUUID() },
    });
  };

  const handleEdit = (trackingId: string) => {
    const module = modulesState.find((m) => m.trackingId === trackingId);
    if (!module) return;
    // Once a module is edited, it is no longer implicit.
    editModal.showWithData({ mode: 'edit', assessmentModule: { ...module, implicit: false } });
  };

  const handleSave = (assessmentModule: AssessmentModuleFormRow) => {
    if (editModal.data?.mode === 'create') {
      setModulesState((prev) => [...prev, assessmentModule]);
    } else {
      setModulesState((prev) =>
        prev.map((m) => (m.trackingId === assessmentModule.trackingId ? assessmentModule : m)),
      );
    }
    editModal.hide();
  };

  const removeModule = (trackingId: string) => {
    setModulesState((prev) => prev.filter((m) => m.trackingId !== trackingId));
  };

  const handleDelete = (module: AssessmentModuleFormRow) => {
    if (module.name === DEFAULT_ASSESSMENT_MODULE_NAME) return;
    if (module.assessments.length > 0) {
      deleteModal.showWithData(module);
    } else {
      removeModule(module.trackingId);
    }
  };

  const handleSubmit = () => {
    saveMutation.mutate({
      modules: modulesState.map((module) => ({
        id: module.id,
        name: module.name,
        heading: module.heading,
        implicit: module.implicit,
      })),
      origHash,
    });
  };

  const saveError = getAppError<AssessmentModulesError['Save']>(saveMutation.error);

  const lockName =
    editModal.data?.mode === 'edit' &&
    editModal.data.assessmentModule.name === DEFAULT_ASSESSMENT_MODULE_NAME;

  return (
    <>
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center">
          <h1>Modules</h1>
          <div className="ms-auto">
            {allowEdit && origHash ? (
              !editMode ? (
                <button className="btn btn-sm btn-light" type="button" onClick={enterEditMode}>
                  <i className="fa fa-edit" aria-hidden="true" /> Edit modules
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-sm btn-light mx-1"
                    type="button"
                    disabled={saveMutation.isPending}
                    onClick={handleSubmit}
                  >
                    {saveMutation.isPending ? (
                      <span
                        className="spinner-border spinner-border-sm me-1"
                        role="status"
                        aria-hidden="true"
                      />
                    ) : (
                      <i className="fa fa-save" aria-hidden="true" />
                    )}{' '}
                    Save
                  </button>
                  <button
                    className="btn btn-sm btn-light"
                    type="button"
                    disabled={saveMutation.isPending}
                    onClick={() => {
                      saveMutation.reset();
                      setEditMode(false);
                    }}
                  >
                    Cancel
                  </button>
                </>
              )
            ) : null}
          </div>
        </div>

        {saveError && (
          <AppErrorAlert
            error={saveError}
            className="m-3"
            render={{
              SYNC_JOB_FAILED: ({ message, jobSequenceId }) => (
                <>
                  {message}{' '}
                  <a href={getCourseEditErrorUrl(courseId, jobSequenceId)}>View job logs</a>
                </>
              ),
              UNKNOWN: ({ message }) => message,
            }}
            onDismiss={() => saveMutation.reset()}
          />
        )}

        {editMode && duplicateNames.length > 0 && (
          <div className="alert alert-warning m-3" role="alert">
            <i className="fa fa-exclamation-triangle" aria-hidden="true" />{' '}
            <strong>Duplicate names detected:</strong> {duplicateNames.join(', ')}. Only the last
            module with each name will be synced.
          </div>
        )}

        <div className="table-responsive">
          <AssessmentModulesTable
            rows={rows}
            setModulesState={setModulesState}
            editMode={editMode}
            allowEdit={allowEdit}
            handleEdit={handleEdit}
            handleDelete={handleDelete}
            handleCreate={handleCreate}
            handleShowUsage={usageModal.showWithData}
          />
        </div>

        <div className="card-footer">
          <small>
            Modules can be used to group assessments by topic, chapter, section, or other category.
            More information on modules can be found in the{' '}
            <a
              href="https://docs.prairielearn.com/course/#assessment-modules"
              target="_blank"
              rel="noreferrer"
            >
              PrairieLearn documentation
            </a>
            .
          </small>
        </div>
      </div>

      {allowEdit && origHash === null && (
        <Alert variant="info">
          You cannot edit assessment modules because the <code>infoCourse.json</code> file does not
          exist.
        </Alert>
      )}

      {!allowEdit && isExampleCourse && (
        <Alert variant="info">You can't edit assessment modules in the example course.</Alert>
      )}

      <EditAssessmentModuleModal
        {...editModal}
        existingNames={existingNames}
        lockName={lockName}
        onSave={handleSave}
      />

      <DeleteAssessmentModuleModal
        {...deleteModal}
        onConfirm={(module) => {
          removeModule(module.trackingId);
          deleteModal.hide();
        }}
      />

      <AssessmentModuleUsageModal {...usageModal} />
    </>
  );
}

export function AssessmentModulesPage({
  isDevMode,
  trpcCsrfToken,
  courseId,
  ...innerProps
}: AssessmentModulesPageProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ csrfToken: trpcCsrfToken, courseId }),
  );

  return (
    <QueryClientProviderDebug client={queryClient} isDevMode={isDevMode}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <AssessmentModulesCard courseId={courseId} {...innerProps} />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

AssessmentModulesPage.displayName = 'AssessmentModulesPage';
