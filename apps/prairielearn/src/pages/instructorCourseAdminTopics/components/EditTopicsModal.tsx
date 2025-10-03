import clsx from 'clsx';
import { useState } from 'react';
import { Modal } from 'react-bootstrap';

import { type Topic } from '../../../lib/db-types.js';
import { ColorJsonSchema } from '../../../schemas/infoCourse.js';

export function EditTopicsModal({
  show,
  selectedTopic,
  setSelectedTopic,
  setShowModal,
  handleModalUpdate,
  addTopic,
}: {
  show: boolean;
  selectedTopic: Topic | null;
  setSelectedTopic: (topic: Topic | null) => void;
  setShowModal: (show: boolean) => void;
  handleModalUpdate: () => void;
  addTopic: boolean;
}) {
  const [invalidName, setInvalidName] = useState(false);
  const [invalidColor, setInvalidColor] = useState(false);
  function handleSubmit() {
    setInvalidName(!selectedTopic?.name);
    setInvalidColor(!selectedTopic?.color);
    if (!selectedTopic?.name || !selectedTopic.color) {
      return;
    } else {
      handleModalUpdate();
    }
  }
  return (
    <Modal show={show} onHide={() => setShowModal(false)}>
      <Modal.Header closeButton>
        <Modal.Title>{addTopic ? 'Add Topic' : 'Edit Topic'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {selectedTopic ? (
          <>
            <div class="mb-3">
              <label class="form-label" for="topicName">
                Name
              </label>
              <input
                type="text"
                class={clsx('form-control', invalidName && 'is-invalid')}
                id="topicName"
                value={selectedTopic.name}
                onChange={(e) =>
                  setSelectedTopic({
                    ...selectedTopic,
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
              <select
                class={clsx('form-select', invalidColor && 'is-invalid')}
                id="topicColor"
                value={selectedTopic.color}
                onChange={(e) =>
                  setSelectedTopic({
                    ...selectedTopic,
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
              {invalidColor && <div class="invalid-feedback">Topic color is required</div>}
            </div>
            <div class="mb-3">
              <label class="form-label" for="topicDescription">
                Description
              </label>
              <textarea
                class="form-control"
                id="topicDescription"
                value={selectedTopic.description}
                onChange={(e) =>
                  setSelectedTopic({
                    ...selectedTopic,
                    description: (e.target as HTMLTextAreaElement).value,
                  })
                }
              />
            </div>
          </>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" class="btn btn-primary mr-2" onClick={handleSubmit}>
          {addTopic ? 'Add topic' : 'Update topic'}
        </button>
        <button type="button" class="btn btn-secondary" onClick={() => setShowModal(false)}>
          Close
        </button>
      </Modal.Footer>
    </Modal>
  );
}
