import { useRef, useState } from 'react';
import { Form } from 'react-bootstrap';
import { FormProvider, useFieldArray, useForm, useFormContext } from 'react-hook-form';

import { useModalState } from '@prairielearn/ui';

import { AssessmentSetHeading } from '../../../components/AssessmentSetHeading.js';
import { AssessmentUsageModal } from '../../../components/AssessmentUsageModal.js';
import {
  AddRowButton,
  InlineTableTextInput,
  ReorderableRowActionsCell,
  ReorderableRowsContext,
  getDuplicateNames,
  useReorderableRow,
} from '../../../components/ReorderableTable.js';
import { ColorJsonSchema } from '../../../schemas/index.js';
import type { InstructorCourseAdminSetFormRow } from '../instructorCourseAdminSets.types.js';

interface SetsFormValues {
  sets: InstructorCourseAdminSetFormRow[];
}

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
  index,
  onDelete,
  onShowUsage,
}: {
  assessmentSet: InstructorCourseAdminSetFormRow;
  editMode: boolean;
  allowEdit: boolean;
  index: number;
  onDelete: () => void;
  onShowUsage: () => void;
}) {
  const { ref, style, dragHandleProps } = useReorderableRow(assessmentSet.trackingId);
  const {
    register,
    setValue,
    getValues,
    formState: { errors },
  } = useFormContext<SetsFormValues>();
  const rowErrors = errors.sets?.[index];
  const onChange = () => setValue(`sets.${index}.implicit`, false, { shouldDirty: true });

  return (
    <tr ref={ref} style={style}>
      {editMode && allowEdit && (
        <ReorderableRowActionsCell
          trackingId={assessmentSet.trackingId}
          dragHandleProps={dragHandleProps}
          deleteLabel={`Delete assessment set ${assessmentSet.name}`}
          deleteDisabledReason={
            assessmentSet.assessments.length > 0
              ? `This assessment set cannot be deleted because it is referenced by ${assessmentSet.assessments.length} assessment${assessmentSet.assessments.length === 1 ? '' : 's'}.`
              : null
          }
          onDelete={onDelete}
        />
      )}
      <td
        className={editMode && allowEdit ? 'align-top' : 'align-middle'}
        style={{ minWidth: '9rem' }}
      >
        {editMode && allowEdit && (
          <div className="mb-1">
            <InlineTableTextInput
              label={`Abbreviation for assessment set ${index + 1}`}
              defaultValue={assessmentSet.abbreviation}
              error={rowErrors?.abbreviation}
              registration={register(`sets.${index}.abbreviation`, {
                onChange,
                validate: (value) => !!value.trim() || 'Abbreviation is required',
              })}
            />
          </div>
        )}
        <span className={`badge color-${assessmentSet.color}`}>
          {assessmentSet.abbreviation || 'Preview'}
        </span>
      </td>
      <td
        className={editMode && allowEdit ? 'align-top' : 'align-middle'}
        style={{ minWidth: '12rem' }}
      >
        {editMode && allowEdit ? (
          <InlineTableTextInput
            label={`Name for assessment set ${index + 1}`}
            defaultValue={assessmentSet.name}
            error={rowErrors?.name}
            registration={register(`sets.${index}.name`, {
              onChange,
              validate: {
                required: (value) => !!value.trim() || 'Name is required',
                unique: (value) =>
                  getValues('sets').every((row, i) => i === index || row.name !== value) ||
                  'Name must be unique',
              },
            })}
          />
        ) : (
          assessmentSet.name
        )}
      </td>
      <td
        className={editMode && allowEdit ? 'align-top' : 'align-middle'}
        style={{ minWidth: '16rem' }}
      >
        {editMode && allowEdit ? (
          <InlineTableTextInput
            label={`Heading for assessment set ${index + 1}`}
            defaultValue={assessmentSet.heading}
            registration={register(`sets.${index}.heading`, { onChange })}
          />
        ) : (
          <AssessmentSetHeading assessmentSet={assessmentSet} />
        )}
      </td>
      {editMode && allowEdit && (
        <td className="align-top" style={{ minWidth: '10rem' }}>
          <Form.Select
            size="sm"
            aria-label={`Color for assessment set ${index + 1}`}
            defaultValue={assessmentSet.color}
            {...register(`sets.${index}.color`, { onChange })}
          >
            {ColorJsonSchema.options.map((color) => (
              <option key={color} value={color}>
                {color}
              </option>
            ))}
          </Form.Select>
        </td>
      )}
      <td className={editMode && allowEdit ? 'align-top' : 'align-middle'}>
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
  onMove,
  editMode,
  allowEdit,
  handleDelete,
  handleCreate,
  handleShowUsage,
}: {
  rows: InstructorCourseAdminSetFormRow[];
  onMove: (from: number, to: number) => void;
  editMode: boolean;
  allowEdit: boolean;
  handleDelete: (id: string) => void;
  handleCreate: () => void;
  handleShowUsage: (assessmentSet: InstructorCourseAdminSetFormRow) => void;
}) {
  const rowsRef = useRef<HTMLTableSectionElement>(null);

  return (
    <ReorderableRowsContext rows={rows} rowsRef={rowsRef} onMove={onMove}>
      <table className="table table-sm table-hover table-striped" aria-label="Assessment sets">
        <thead>
          <tr>
            {editMode && allowEdit && (
              <th style={{ width: '1%' }}>
                <span className="visually-hidden">Drag and Delete</span>
              </th>
            )}
            <th>Abbreviation</th>
            <th>Name</th>
            <th className="col-4">Heading</th>
            {editMode && allowEdit && <th>Color</th>}
            <th>Action</th>
          </tr>
        </thead>

        {/* Table row groups don't support overflow clipping; clip the dragged row here. */}
        <tbody ref={rowsRef} style={{ clipPath: 'inset(0)' }}>
          {rows.map((assessmentSet, index) => (
            <AssessmentSetRow
              key={assessmentSet.trackingId}
              assessmentSet={assessmentSet}
              editMode={editMode}
              allowEdit={allowEdit}
              index={index}
              onDelete={() => handleDelete(assessmentSet.trackingId)}
              onShowUsage={() => handleShowUsage(assessmentSet)}
            />
          ))}
        </tbody>
        <tfoot>
          {editMode && allowEdit && (
            <tr>
              <td colSpan={6}>
                <AddRowButton onClick={handleCreate}>Add assessment set</AddRowButton>
              </td>
            </tr>
          )}
        </tfoot>
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
  const [editMode, setEditMode] = useState(false);
  const form = useForm<SetsFormValues>({ defaultValues: { sets: assessmentSets } });
  const { append, remove, move } = useFieldArray({ control: form.control, name: 'sets' });
  const assessmentSetsState = form.watch('sets');
  const usageModalState = useModalState<InstructorCourseAdminSetFormRow>();

  const duplicateNames = getDuplicateNames(assessmentSetsState.map((set) => set.name));

  const handleCreate = () => {
    append(
      {
        ...emptyAssessmentSet,
        trackingId: crypto.randomUUID(),
        color: ColorJsonSchema.options[Math.floor(Math.random() * ColorJsonSchema.options.length)],
      },
      { focusName: `sets.${assessmentSetsState.length}.abbreviation` },
    );
  };

  const handleDelete = (trackingId: string) => {
    remove(assessmentSetsState.findIndex((set) => set.trackingId === trackingId));
  };

  return (
    <>
      <FormProvider {...form}>
        <Form
          as={editMode ? 'form' : 'div'}
          method={editMode ? 'POST' : undefined}
          onSubmit={(event) => {
            const element = event.currentTarget;
            void form.handleSubmit(() => element.submit())(event);
          }}
        >
          <input type="hidden" name="__action" value="save_assessment_sets" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <input type="hidden" name="orig_hash" value={origHash ?? ''} />
          <input type="hidden" name="assessment_sets" value={JSON.stringify(assessmentSetsState)} />
          <div className="card mb-4">
            <div className="card-header bg-primary text-white d-flex align-items-center">
              <h1>Assessment sets</h1>
              <div className="ms-auto">
                {allowEdit && origHash ? (
                  !editMode ? (
                    <button
                      key="edit"
                      className="btn btn-sm btn-light mx-1"
                      type="button"
                      onClick={() => setEditMode(true)}
                    >
                      <i className="fa fa-edit" aria-hidden="true" /> Edit assessment sets
                    </button>
                  ) : (
                    <>
                      <button
                        className="btn btn-sm btn-light mx-1"
                        type="submit"
                        disabled={!form.formState.isDirty}
                      >
                        <i className="fa fa-save" aria-hidden="true" />
                        Save
                      </button>
                      <button
                        className="btn btn-sm btn-light"
                        type="button"
                        onClick={() => {
                          form.reset();
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

            {editMode && duplicateNames.length > 0 && (
              <div className="alert alert-warning m-3" role="alert">
                <i className="fa fa-exclamation-triangle" aria-hidden="true" />{' '}
                <strong>Duplicate names detected:</strong> {duplicateNames.join(', ')}. Assessment
                set names must be unique; rename or remove the duplicates before saving.
              </div>
            )}

            <div className="table-responsive">
              <AssessmentSetsTable
                rows={assessmentSetsState}
                editMode={editMode}
                allowEdit={allowEdit}
                handleDelete={handleDelete}
                handleCreate={handleCreate}
                handleShowUsage={usageModalState.showWithData}
                onMove={move}
              />
            </div>
          </div>
        </Form>
      </FormProvider>

      <AssessmentUsageModal {...usageModalState} entityLabel="assessment set" />
    </>
  );
}

AssessmentSetsPage.displayName = 'AssessmentSetsPage';
