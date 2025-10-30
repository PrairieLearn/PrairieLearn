import clsx from 'clsx';
import { useState } from 'react';
import { Modal } from 'react-bootstrap';

import { TagBadge } from '../../../components/TagBadge.js';
import { type Tag } from '../../../lib/db-types.js';
import { ColorJsonSchema } from '../../../schemas/infoCourse.js';

export function EditTagsModal({
  show,
  selectedTag,
  setSelectedTag,
  setShowModal,
  handleModalUpdate,
  addTag,
}: {
  show: boolean;
  selectedTag: Tag | null;
  setSelectedTag: (tag: Tag | null) => void;
  setShowModal: (show: boolean) => void;
  handleModalUpdate: () => void;
  addTag: boolean;
}) {
  const [invalidName, setInvalidName] = useState(false);
  const [invalidColor, setInvalidColor] = useState(false);

  function handleSubmit() {
    setInvalidName(!selectedTag?.name);
    setInvalidColor(!selectedTag?.color);
    if (!selectedTag?.name || !selectedTag.color) {
      return;
    } else {
      handleModalUpdate();
    }
  }
  return (
    <Modal show={show} onHide={() => setShowModal(false)}>
      <Modal.Header closeButton>
        <Modal.Title>{addTag ? 'Add tag' : 'Edit tag'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {selectedTag ? (
          <>
            <div class="d-flex flex-column align-items-center mb-4">
              <TagBadge
                tag={{
                  name: selectedTag.name || 'Tag preview',
                  color: selectedTag.color,
                }}
              />
            </div>
            <div class="mb-3">
              <label class="form-label" for="tagName">
                Name
              </label>
              <input
                type="text"
                class={clsx('form-control', invalidName && 'is-invalid')}
                id="tagName"
                value={selectedTag.name}
                onChange={(e) =>
                  setSelectedTag({
                    ...selectedTag,
                    name: (e.target as HTMLInputElement).value,
                  })
                }
              />
              {invalidName && <div class="invalid-feedback">Tag name is required</div>}
            </div>
            <div class="mb-3">
              <label class="form-label" for="tagColor">
                Color
              </label>
              <div class="d-flex gap-2 align-items-center">
                <select
                  class={clsx('form-select', invalidColor && 'is-invalid')}
                  id="tagColor"
                  value={selectedTag.color}
                  onChange={(e) =>
                    setSelectedTag({
                      ...selectedTag,
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
                      fill: `var(--color-${selectedTag.color})`,
                      rx: 'var(--bs-border-radius)',
                      ry: 'var(--bs-border-radius)',
                    }}
                  />
                </svg>
              </div>
              {invalidColor && <div class="invalid-feedback">Tag color is required</div>}
            </div>
            <div class="mb-3">
              <label class="form-label" for="tagDescription">
                Description
              </label>
              <input
                type="text"
                class="form-control"
                id="tagDescription"
                value={selectedTag.description}
                onChange={(e) =>
                  setSelectedTag({
                    ...selectedTag,
                    description: (e.target as HTMLTextAreaElement).value,
                  })
                }
              />
            </div>
          </>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <button type="button" class="btn btn-primary me-2" onClick={handleSubmit}>
          {addTag ? 'Add tag' : 'Update tag'}
        </button>
        <button type="button" class="btn btn-secondary" onClick={() => setShowModal(false)}>
          Close
        </button>
      </Modal.Footer>
    </Modal>
  );
}
