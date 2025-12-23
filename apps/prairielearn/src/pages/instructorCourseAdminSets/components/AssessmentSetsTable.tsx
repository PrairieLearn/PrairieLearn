import { useState } from 'preact/compat';

import { AssessmentSetHeading } from '../../../components/AssessmentSetHeading.js';
import type { StaffAssessmentSet } from '../../../lib/client/safe-db-types.js';

import {
  EditAssessmentSetsModal,
  type EditAssessmentSetsModalState,
} from './EditAssessmentSetModal.js';
import { ColorJsonSchema } from '../../../schemas/index.js';

const emptyAssessmentSet = {
  abbreviation: '',
  color: '',
  heading: '',
  implicit: false,
  json_comment: '',
  name: '',
};

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
          <table class="table table-sm table-hover table-striped" aria-label="Assessment sets">
            <thead>
              <tr>
                {editMode && allowEdit && (
                  <th style="width: 1%">
                    <span class="visually-hidden">Edit and Delete</span>
                  </th>
                )}
                <th>Number</th>
                <th>Abbreviation</th>
                <th>Name</th>
                <th>Heading</th>
                <th>Color</th>
              </tr>
            </thead>
            <tbody>
              {assessmentSetsState.map((assessmentSet, index) => {
                return (
                  <tr key={assessmentSet.id}>
                    {editMode && allowEdit && (
                      <td class="align-middle">
                        <div class="d-flex align-items-center">
                          <button
                            class="btn btn-sm btn-ghost"
                            type="button"
                            onClick={() => handleEdit(index)}
                          >
                            <i class="fa fa-edit" aria-hidden="true" />
                          </button>
                          <button
                            class="btn btn-sm btn-ghost"
                            type="button"
                            onClick={() => handleDelete(assessmentSet.id)}
                          >
                            <i class="fa fa-trash text-danger" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    )}
                    <td class="align-middle">{index + 1}</td>
                    <td class="align-middle">
                      <span class={`badge color-${assessmentSet.color}`}>
                        {assessmentSet.abbreviation}
                      </span>
                    </td>
                    <td class="align-middle">{assessmentSet.name}</td>
                    <td class="align-middle">
                      <AssessmentSetHeading assessmentSet={assessmentSet} />
                    </td>
                    <td class="align-middle">{assessmentSet.color}</td>
                  </tr>
                );
              })}
              {editMode && allowEdit && (
                <tr>
                  <td colSpan={6}>
                    <button class="btn btn-sm btn-ghost" type="button" onClick={handleCreate}>
                      <i class="fa fa-plus" aria-hidden="true" /> New assessment set
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
