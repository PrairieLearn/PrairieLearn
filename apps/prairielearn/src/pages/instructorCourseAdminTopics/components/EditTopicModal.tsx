import clsx from 'clsx';
import { useState } from 'react';
import { Modal } from 'react-bootstrap';

import { TopicBadge } from '../../../components/TopicBadge.js';
import { type Topic } from '../../../lib/db-types.js';
import { ColorJsonSchema } from '../../../schemas/infoCourse.js';

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

  return (
    <Modal
      show={isOpen}
      onHide={onClose}
      onEntering={handleModalEntering}
      onExited={handleModalExited}
    >
      <Modal.Header closeButton>
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
            </div>
            <div class="mb-3">
              <label class="form-label" for="topicName">
                Name
              </label>
              <input
                type="text"
                class={clsx('form-control', invalidName && 'is-invalid')}
                id="topicName"
                value={formData.name}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    name: (e.target as HTMLInputElement).value,
                  })
                }
              />
              {invalidName && <div class="invalid-feedback">Topic name is required</div>}
            </div>
            <div class="mb-3">
              <label class="form-label" for="topicColor">
                Color
              </label>
              <div class="d-flex gap-2 align-items-center">
                <select
                  class={clsx('form-select', invalidColor && 'is-invalid')}
                  id="topicColor"
                  value={formData.color}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
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
                      fill: `var(--color-${formData.color})`,
                      rx: 'var(--bs-border-radius)',
                      ry: 'var(--bs-border-radius)',
                    }}
                  />
                </svg>
              </div>
              {invalidColor && <div class="invalid-feedback">Topic color is required</div>}
            </div>
            <div class="mb-3">
              <label class="form-label" for="topicDescription">
                Description
              </label>
              <input
                type="text"
                class="form-control"
                id="topicDescription"
                value={formData.description}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    description: (e.target as HTMLInputElement).value,
                  })
                }
              />
            </div>
          </>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" class="btn btn-primary me-2" onClick={handleSubmit}>
          {isCreateMode ? 'Add topic' : 'Update topic'}
        </button>
        <button type="button" class="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </Modal.Footer>
    </Modal>
  );
}
