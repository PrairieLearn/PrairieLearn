import { useState } from 'preact/compat';

import { type StaffTag, type StaffTopic } from '../lib/client/safe-db-types.js';
import { type Topic } from '../lib/db-types.js';
import { ColorJsonSchema } from '../schemas/infoCourse.js';

import { EditTagsTopicsModal, type EditTagsTopicsModalState } from './EditTagsTopicsModal.js';
import { TagBadge } from './TagBadge.js';
import { TagDescription } from './TagDescription.js';
import { TopicBadge } from './TopicBadge.js';
import { TopicDescription } from './TopicDescription.js';

const emptySet = {
  color: '',
  course_id: '',
  description: '',
  id: '',
  implicit: false,
  json_comment: '',
  name: '',
  number: null,
};

export function TagsTopicsTable({
  data,
  dataType,
  allowEdit,
  origHash,
  csrfToken,
}: {
  data: StaffTopic[] | StaffTag[];
  dataType: 'topic' | 'tag';
  allowEdit: boolean;
  origHash: string | null;
  csrfToken: string;
}) {
  const [editMode, setEditMode] = useState(false);
  const [dataState, setDataState] = useState<Topic[] | StaffTag[]>(data);
  const [modalState, setModalState] = useState<EditTagsTopicsModalState>({ type: 'closed' });

  const handleCreate = () => {
    setModalState({
      type: 'create',
      dataType: 'topic',
      data: {
        ...emptySet,
        // This ID won't be used on the server; it's just a temporary unique identifier.
        id: crypto.randomUUID(),
        // Pick a random initial color.
        color: ColorJsonSchema.options[Math.floor(Math.random() * ColorJsonSchema.options.length)],
      },
    });
  };

  const handleEdit = (index: number) => {
    setModalState({
      type: 'edit',
      dataType,
      data: {
        ...dataState[index],
        // Once a tag/topic is edited, it is no longer implicit.
        implicit: false,
      },
    });
  };

  const handleSave = (data: Topic | StaffTag) => {
    if (modalState.type === 'create') {
      setDataState((prevData) => [...prevData, data]);
    } else if (modalState.type === 'edit') {
      setDataState((prevData) => prevData.map((d) => (d.id === data.id ? data : d)));
    }
    setModalState({ type: 'closed' });
  };

  const handleDelete = (deleteId: string) => {
    setDataState((prevData) => prevData.filter((d) => d.id !== deleteId));
  };

  return (
    <>
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>{dataType === 'topic' ? 'Topics' : 'Tags'}</h1>
          <div class="ms-auto">
            {allowEdit && origHash ? (
              !editMode ? (
                <button
                  class="btn btn-sm btn-light"
                  type="button"
                  onClick={() => setEditMode(true)}
                >
                  <i class="fa fa-edit" aria-hidden="true" /> Edit {dataType}s
                </button>
              ) : (
                <form method="POST">
                  <input type="hidden" name="__action" value="save_data" />
                  <input type="hidden" name="__csrf_token" value={csrfToken} />
                  <input type="hidden" name="orig_hash" value={origHash} />
                  <input type="hidden" name="data" value={JSON.stringify(dataState)} />
                  <span class="js-edit-mode-buttons">
                    <button class="btn btn-sm btn-light mx-1" type="submit">
                      <i class="fa fa-save" aria-hidden="true" /> Save and sync
                    </button>
                    <button
                      class="btn btn-sm btn-light"
                      type="button"
                      onClick={() => window.location.reload()}
                    >
                      Cancel
                    </button>
                  </span>
                </form>
              )
            ) : (
              ''
            )}
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped" aria-label={dataType}>
            <thead>
              <tr>
                {editMode && allowEdit && (
                  <th style="width: 1%">
                    <span class="visually-hidden">Edit and Delete</span>
                  </th>
                )}
                <th>Number</th>
                <th>Name</th>
                <th>Color</th>
                <th class="col-9">Description</th>
              </tr>
            </thead>
            <tbody>
              {dataState.map((row, index) => {
                return (
                  <tr key={row.name}>
                    {editMode && allowEdit && (
                      <td class="align-middle">
                        <div class="d-flex align-items-center">
                          <button
                            class="btn btn-sm btn-ghost"
                            type="button"
                            aria-label={`Edit ${dataType} ${row.name}`}
                            onClick={() => handleEdit(index)}
                          >
                            <i class="fa fa-edit" aria-hidden="true" />
                          </button>
                          <button
                            class="btn btn-sm btn-ghost"
                            type="button"
                            aria-label={`Delete ${dataType} ${row.name}`}
                            onClick={() => handleDelete(row.id)}
                          >
                            <i class="fa fa-trash text-danger" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    )}
                    <td class="align-middle">{index + 1}</td>
                    <td class="align-middle">
                      {dataType === 'topic' ? <TopicBadge topic={row} /> : <TagBadge tag={row} />}
                    </td>
                    <td class="align-middle">{row.color}</td>
                    <td class="align-middle">
                      {dataType === 'topic' ? (
                        <TopicDescription topic={row} />
                      ) : (
                        <TagDescription tag={row} />
                      )}
                    </td>
                  </tr>
                );
              })}
              {editMode ? (
                <tr>
                  <td colSpan={5}>
                    <button class="btn btn-sm btn-ghost" type="button" onClick={handleCreate}>
                      <i class="fa fa-plus" aria-hidden="true" /> New {dataType}
                    </button>
                  </td>
                </tr>
              ) : (
                ''
              )}
            </tbody>
          </table>
        </div>
      </div>
      <EditTagsTopicsModal
        state={modalState}
        onClose={() => setModalState({ type: 'closed' })}
        onSave={handleSave}
      />
    </>
  );
}

TagsTopicsTable.displayName = 'TagsTopicsTable';
