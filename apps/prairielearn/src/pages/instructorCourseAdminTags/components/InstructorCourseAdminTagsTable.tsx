import { useState } from 'preact/compat';

import { EditTagsTopicsModal } from '../../../components/EditTagsTopicsModal.js';
import { TagBadge } from '../../../components/TagBadge.js';
import { TagDescription } from '../../../components/TagDescription.js';
import { type StaffTag } from '../../../lib/client/safe-db-types.js';
import { type Tag } from '../../../lib/db-types.js';
import { ColorJsonSchema } from '../../../schemas/infoCourse.js';

const emptyTag: Tag = {
  color: '',
  course_id: '',
  description: '',
  id: '',
  implicit: false,
  json_comment: '',
  name: '',
  number: null,
};

export function InstructorCourseAdminTagsTable({
  tags,
  allowEdit,
  origHash,
  csrfToken,
}: {
  tags: StaffTag[];
  allowEdit: boolean;
  origHash: string | null;
  csrfToken: string;
}) {
  const [editMode, setEditMode] = useState(false);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(emptyTag);
  const [tagsState, setTagsState] = useState<Tag[]>(tags);
  const [addTag, setAddTag] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleOpenEditModal = (tagIndex: number) => {
    setAddTag(false);
    setSelectedTag({ ...tagsState[tagIndex], implicit: false });
    setShowModal(true);
  };

  const handleModalUpdate = () => {
    if (addTag) {
      setTagsState((prevTags) => [...prevTags, selectedTag!]);
    } else {
      setTagsState((prevTags) =>
        prevTags.map((tag) => (tag.id === selectedTag?.id ? { ...tag, ...selectedTag } : tag)),
      );
    }
    setShowModal(false);
  };

  const handleDeleteTag = (deleteTagId: string) => {
    setTagsState((prevTags) => prevTags.filter((tag) => tag.id !== deleteTagId));
  };

  const handleNewTag = () => {
    setAddTag(true);
    setSelectedTag({
      ...emptyTag,
      id: crypto.randomUUID(),
      // Pick a random initial color.
      color: ColorJsonSchema.options[Math.floor(Math.random() * ColorJsonSchema.options.length)],
    });
    setShowModal(true);
  };

  return (
    <>
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>Tags</h1>
          <div class="ms-auto">
            {allowEdit && origHash ? (
              !editMode ? (
                <button
                  class="btn btn-sm btn-light"
                  type="button"
                  onClick={() => setEditMode(true)}
                >
                  <i class="fa fa-edit" aria-hidden="true" /> Edit tags
                </button>
              ) : (
                <form method="POST">
                  <input type="hidden" name="__action" value="save_tags" />
                  <input type="hidden" name="__csrf_token" value={csrfToken} />
                  <input type="hidden" name="orig_hash" value={origHash} />
                  <input type="hidden" name="tags" value={JSON.stringify(tagsState)} />
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
          <table class="table table-sm table-hover table-striped" aria-label="Tags">
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
              {tagsState.map((tag, index) => {
                return (
                  <tr key={tag.name}>
                    {editMode && allowEdit && (
                      <td class="align-middle">
                        <div class="d-flex align-items-center">
                          <button
                            class="btn btn-sm btn-ghost"
                            type="button"
                            aria-label={`Edit tag ${tag.name}`}
                            onClick={() => handleOpenEditModal(index)}
                          >
                            <i class="fa fa-edit" aria-hidden="true" />
                          </button>
                          <button
                            class="btn btn-sm btn-ghost"
                            type="button"
                            aria-label={`Delete tag ${tag.name}`}
                            onClick={() => handleDeleteTag(tag.id)}
                          >
                            <i class="fa fa-trash text-danger" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    )}
                    <td class="align-middle">{index + 1}</td>
                    <td class="align-middle">
                      <TagBadge tag={tag} />
                    </td>
                    <td class="align-middle">{tag.color}</td>
                    <td class="align-middle">
                      <TagDescription tag={tag} />
                    </td>
                  </tr>
                );
              })}
              {editMode ? (
                <tr>
                  <td colSpan={5}>
                    <button class="btn btn-sm btn-ghost" type="button" onClick={handleNewTag}>
                      <i class="fa fa-plus" aria-hidden="true" /> New Tag
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
        show={showModal}
        selectedData={selectedTag}
        setSelectedData={setSelectedTag}
        dataType="tag"
        setShowModal={setShowModal}
        handleModalUpdate={handleModalUpdate}
        add={addTag}
      />
    </>
  );
}

InstructorCourseAdminTagsTable.displayName = 'InstructorCourseAdminTagsTable';
