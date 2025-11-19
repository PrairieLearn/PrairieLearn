import clsx from 'clsx';
import { useState } from 'react';
import { Modal } from 'react-bootstrap';

import { type Tag, type Topic } from '../lib/db-types.js';
import { ColorJsonSchema } from '../schemas/infoCourse.js';

<<<<<<<< HEAD:apps/prairielearn/src/components/EditTagsTopicsModal.tsx
import { TagBadge } from './TagBadge.js';
import { TopicBadge } from './TopicBadge.js';

export function EditTagsTopicsModal({
  show,
  selectedData,
  setSelectedData,
  dataType,
  setShowModal,
  handleModalUpdate,
  add,
}: {
  show: boolean;
  selectedData: Tag | Topic | null;
  setSelectedData: (data: Tag | Topic | null) => void;
  dataType: 'tag' | 'topic';
  setShowModal: (show: boolean) => void;
  handleModalUpdate: () => void;
  add: boolean;
}) {
========
export type EditTopicModalState =
  | { type: 'closed' }
  | { type: 'create'; topic: Topic }
  | { type: 'edit'; topic: Topic };

interface EditTopicModalProps {
  state: EditTopicModalState;
  onClose: () => void;
  onSave: (topic: Topic) => void;
}

export function EditTopicsModal({ state, onClose, onSave }: EditTopicModalProps) {
  // Extract the topic to edit/create, or null if closed
  const topicToEdit =
    state.type === 'create' ? state.topic : state.type === 'edit' ? state.topic : null;

  const [formData, setFormData] = useState<Topic | null>(topicToEdit);
>>>>>>>> master:apps/prairielearn/src/pages/instructorCourseAdminTopics/components/EditTopicModal.tsx
  const [invalidName, setInvalidName] = useState(false);
  const [invalidColor, setInvalidColor] = useState(false);

  function handleModalEntering() {
    if (!topicToEdit) return;
    setFormData(topicToEdit);
    setInvalidName(false);
    setInvalidColor(false);
  }

  function handleModalExited() {
    setFormData(null);
    setInvalidName(false);
    setInvalidColor(false);
  }

  function handleSubmit() {
<<<<<<<< HEAD:apps/prairielearn/src/components/EditTagsTopicsModal.tsx
    setInvalidName(!selectedData?.name);
    setInvalidColor(!selectedData?.color);
    if (!selectedData?.name || !selectedData.color) {
      return;
    } else {
      handleModalUpdate();
    }
  }

  const dataTypeLabel = dataType === 'tag' ? 'Tag' : 'Topic';
========
    if (!formData) return;

    const isNameValid = !!formData.name;
    const isColorValid = !!formData.color;

    setInvalidName(!isNameValid);
    setInvalidColor(!isColorValid);

    if (isNameValid && isColorValid) {
      onSave(formData);
    }
  }

  const isOpen = state.type !== 'closed';
  const isCreateMode = state.type === 'create';
>>>>>>>> master:apps/prairielearn/src/pages/instructorCourseAdminTopics/components/EditTopicModal.tsx

  return (
    <Modal
      show={isOpen}
      onHide={onClose}
      onEntering={handleModalEntering}
      onExited={handleModalExited}
    >
      <Modal.Header closeButton>
<<<<<<<< HEAD:apps/prairielearn/src/components/EditTagsTopicsModal.tsx
        <Modal.Title>{add ? `Add ${dataType}` : `Edit ${dataType}`}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {selectedData ? (
          <>
            <div class="d-flex flex-column align-items-center mb-4">
              {dataType === 'tag' ? (
                <TagBadge
                  tag={{
                    name: selectedData.name || 'Tag preview',
                    color: selectedData.color,
                  }}
                />
              ) : (
                <TopicBadge
                  topic={{
                    name: selectedData.name || 'Topic preview',
                    color: selectedData.color,
                  }}
                />
              )}
========
        <Modal.Title>{isCreateMode ? 'Add topic' : 'Edit topic'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {formData ? (
          <>
            <div class="d-flex flex-column align-items-center mb-4">
              <TopicBadge
                topic={{
                  name: formData.name || 'Topic preview',
                  color: formData.color,
                }}
              />
>>>>>>>> master:apps/prairielearn/src/pages/instructorCourseAdminTopics/components/EditTopicModal.tsx
            </div>
            <div class="mb-3">
              <label class="form-label" for="name">
                Name
              </label>
              <input
                type="text"
                class={clsx('form-control', invalidName && 'is-invalid')}
<<<<<<<< HEAD:apps/prairielearn/src/components/EditTagsTopicsModal.tsx
                id="name"
                value={selectedData.name}
                onChange={(e) =>
                  setSelectedData({
                    ...selectedData,
========
                id="topicName"
                value={formData.name}
                onChange={(e) =>
                  setFormData({
                    ...formData,
>>>>>>>> master:apps/prairielearn/src/pages/instructorCourseAdminTopics/components/EditTopicModal.tsx
                    name: (e.target as HTMLInputElement).value,
                  })
                }
              />
              {invalidName && <div class="invalid-feedback">{dataTypeLabel} name is required</div>}
            </div>
            <div class="mb-3">
              <label class="form-label" for="color">
                Color
              </label>
              <div class="d-flex gap-2 align-items-center">
                <select
                  class={clsx('form-select', invalidColor && 'is-invalid')}
<<<<<<<< HEAD:apps/prairielearn/src/components/EditTagsTopicsModal.tsx
                  id="color"
                  value={selectedData.color}
                  onChange={(e) =>
                    setSelectedData({
                      ...selectedData,
========
                  id="topicColor"
                  value={formData.color}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
>>>>>>>> master:apps/prairielearn/src/pages/instructorCourseAdminTopics/components/EditTopicModal.tsx
                      color: (e.target as HTMLSelectElement).value,
                    })
                  }
                >
                  {ColorJsonSchema.options.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
                <svg
                  viewBox="0 0 32 32"
                  // `form-control-color` provides the correct sizing. We override the
                  // cursor and padding to make it appear just as a plain, non-interactive
                  // color swatch.
                  class="form-control-color p-0"
                  style={{ cursor: 'default' }}
                  aria-hidden="true"
                >
                  <rect
                    width="32"
                    height="32"
                    style={{
<<<<<<<< HEAD:apps/prairielearn/src/components/EditTagsTopicsModal.tsx
                      fill: `var(--color-${selectedData.color})`,
========
                      fill: `var(--color-${formData.color})`,
>>>>>>>> master:apps/prairielearn/src/pages/instructorCourseAdminTopics/components/EditTopicModal.tsx
                      rx: 'var(--bs-border-radius)',
                      ry: 'var(--bs-border-radius)',
                    }}
                  />
                </svg>
              </div>
              {invalidColor && (
                <div class="invalid-feedback">{dataTypeLabel} color is required</div>
              )}
            </div>
            <div class="mb-3">
              <label class="form-label" for="description">
                Description
              </label>
              <input
                type="text"
                class="form-control"
<<<<<<<< HEAD:apps/prairielearn/src/components/EditTagsTopicsModal.tsx
                id="description"
                value={selectedData.description}
                onChange={(e) =>
                  setSelectedData({
                    ...selectedData,
                    description: (e.target as HTMLTextAreaElement).value,
========
                id="topicDescription"
                value={formData.description}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    description: (e.target as HTMLInputElement).value,
>>>>>>>> master:apps/prairielearn/src/pages/instructorCourseAdminTopics/components/EditTopicModal.tsx
                  })
                }
              />
            </div>
          </>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" class="btn btn-primary me-2" onClick={handleSubmit}>
<<<<<<<< HEAD:apps/prairielearn/src/components/EditTagsTopicsModal.tsx
          {add ? `Add ${dataType}` : `Update ${dataType}`}
========
          {isCreateMode ? 'Add topic' : 'Update topic'}
>>>>>>>> master:apps/prairielearn/src/pages/instructorCourseAdminTopics/components/EditTopicModal.tsx
        </button>
        <button type="button" class="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </Modal.Footer>
    </Modal>
  );
}
