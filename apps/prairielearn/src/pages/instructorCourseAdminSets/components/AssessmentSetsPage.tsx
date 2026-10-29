import { useState } from 'react';
import { Form } from 'react-bootstrap';
import { useForm } from 'react-hook-form';

import { StickySaveBar, useModalState } from '@prairielearn/ui';

import { AssessmentSetHeading } from '../../../components/AssessmentSetHeading.js';
import { AssessmentUsageModal } from '../../../components/AssessmentUsageModal.js';
import {
  ReorderableRowActionsCell,
  ReorderableRowsContext,
  getDuplicateNames,
  useReorderableRow,
} from '../../../components/ReorderableTable.js';
import { ColorJsonSchema } from '../../../schemas/index.js';
import type { InstructorCourseAdminSetFormRow } from '../instructorCourseAdminSets.types.js';

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
  allowEdit,
  onEdit,
  onDelete,
  onShowUsage,
}: {
  assessmentSet: InstructorCourseAdminSetFormRow;
  allowEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onShowUsage: () => void;
}) {
  const { ref, style, dragHandleProps } = useReorderableRow(assessmentSet.trackingId);

  return (
    <tr ref={ref} style={style}>
      {allowEdit && (
        <ReorderableRowActionsCell
          trackingId={assessmentSet.trackingId}
          dragHandleProps={dragHandleProps}
          editLabel={`Edit assessment set ${assessmentSet.name}`}
          deleteLabel={`Delete assessment set ${assessmentSet.name}`}
          deleteDisabledReason={
            assessmentSet.assessments.length > 0
              ? `This assessment set cannot be deleted because it is referenced by ${assessmentSet.assessments.length} assessment${assessmentSet.assessments.length === 1 ? '' : 's'}.`
              : null
          }
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
      <td className="align-middle pe-4">
        <span className={`badge color-${assessmentSet.color}`}>{assessmentSet.abbreviation}</span>
      </td>
      <td className="align-middle pe-4">{assessmentSet.name}</td>
      <td className="align-middle pe-4">
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
  rows,
  onReorder,
  allowEdit,
  handleEdit,
  handleDelete,
  handleCreate,
  handleShowUsage,
}: {
  rows: InstructorCourseAdminSetFormRow[];
  onReorder: (rows: InstructorCourseAdminSetFormRow[]) => void;
  allowEdit: boolean;
  handleEdit: (index: number) => void;
  handleDelete: (id: string) => void;
  handleCreate: () => void;
  handleShowUsage: (assessmentSet: InstructorCourseAdminSetFormRow) => void;
}) {
  return (
    <ReorderableRowsContext rows={rows} onReorder={onReorder}>
      <table className="table table-sm table-hover table-striped" aria-label="Assessment sets">
        <thead>
          <tr>
            {allowEdit && (
              <th style={{ width: '1%' }}>
                <span className="visually-hidden">Drag, Edit and Delete</span>
              </th>
            )}
            <th className="pe-4" style={{ width: '1%' }}>
              Abbreviation
            </th>
            <th className="col-3 pe-4">Name</th>
            <th className="pe-4">Heading</th>
            <th style={{ width: '1%' }}>Action</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((assessmentSet, index) => (
            <AssessmentSetRow
              key={assessmentSet.trackingId}
              assessmentSet={assessmentSet}
              allowEdit={allowEdit}
              onEdit={() => handleEdit(index)}
              onDelete={() => handleDelete(assessmentSet.trackingId)}
              onShowUsage={() => handleShowUsage(assessmentSet)}
            />
          ))}

          {allowEdit && (
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
    </ReorderableRowsContext>
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
  const canEdit = allowEdit && origHash !== null;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const form = useForm({ defaultValues: { sets: assessmentSets } });
  const assessmentSetsState = form.watch('sets');
  const setAssessmentSetsState = (sets: InstructorCourseAdminSetFormRow[]) => {
    form.setValue('sets', sets, { shouldDirty: true });
  };
  const editModalState = useModalState<EditAssessmentSetModalData>();
  const usageModalState = useModalState<InstructorCourseAdminSetFormRow>();

  const duplicateNames = getDuplicateNames(assessmentSetsState.map((set) => set.name));

  // Names of other assessment sets (excluding the one currently being edited)
  const editingId = editModalState.data?.assessmentSet.trackingId ?? null;
  const existingNames = new Set(
    assessmentSetsState.filter((set) => set.trackingId !== editingId).map((set) => set.name),
  );

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
      setAssessmentSetsState([...assessmentSetsState, assessmentSet]);
    } else if (editModalState.data?.mode === 'edit') {
      setAssessmentSetsState(
        assessmentSetsState.map((d) =>
          d.trackingId === assessmentSet.trackingId ? assessmentSet : d,
        ),
      );
    }
    editModalState.hide();
  };

  const handleDelete = (deleteId: string) => {
    setAssessmentSetsState(assessmentSetsState.filter((d) => d.trackingId !== deleteId));
  };

  return (
    <>
      <Form
        as={canEdit ? 'form' : 'div'}
        method={canEdit ? 'POST' : undefined}
        onSubmit={() => setIsSubmitting(true)}
      >
        <input type="hidden" name="__action" value="save_assessment_sets" />
        <input type="hidden" name="__csrf_token" value={csrfToken} />
        <input type="hidden" name="orig_hash" value={origHash ?? ''} />
        <input type="hidden" name="assessment_sets" value={JSON.stringify(assessmentSetsState)} />
        <div className="card mb-4">
          <div className="card-header bg-primary text-white d-flex align-items-center">
            <h1>Assessment sets</h1>
          </div>

          {canEdit && duplicateNames.length > 0 && (
            <div className="alert alert-warning m-3" role="alert">
              <i className="fa fa-exclamation-triangle" aria-hidden="true" />{' '}
              <strong>Duplicate names detected:</strong> {duplicateNames.join(', ')}. Only the last
              assessment set with each name will be synced.
            </div>
          )}

          <div className="table-responsive">
            <AssessmentSetsTable
              rows={assessmentSetsState}
              allowEdit={canEdit}
              handleEdit={handleEdit}
              handleDelete={handleDelete}
              handleCreate={handleCreate}
              handleShowUsage={usageModalState.showWithData}
              onReorder={setAssessmentSetsState}
            />
          </div>
        </div>

        {canEdit && (
          <StickySaveBar
            isSaving={isSubmitting}
            visible={form.formState.isDirty}
            fullWidth
            onCancel={() => form.reset()}
          />
        )}
      </Form>

      <EditAssessmentSetsModal
        {...editModalState}
        existingNames={existingNames}
        onSave={handleSave}
      />

      <AssessmentUsageModal {...usageModalState} entityLabel="assessment set" />
    </>
  );
}

AssessmentSetsPage.displayName = 'AssessmentSetsPage';
