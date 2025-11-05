import clsx from 'clsx';
import { useState } from 'react';
import { Modal } from 'react-bootstrap';

import { type Tag, type Topic } from '../lib/db-types.js';
import { ColorJsonSchema } from '../schemas/infoCourse.js';

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
  const [invalidName, setInvalidName] = useState(false);
  const [invalidColor, setInvalidColor] = useState(false);

  function handleSubmit() {
    setInvalidName(!selectedData?.name);
    setInvalidColor(!selectedData?.color);
    if (!selectedData?.name || !selectedData.color) {
      return;
    } else {
      handleModalUpdate();
    }
  }

  const dataTypeLabel = dataType === 'tag' ? 'Tag' : 'Topic';

  return (
    <Modal show={show} onHide={() => setShowModal(false)}>
      <Modal.Header closeButton>
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
            </div>
            <div class="mb-3">
              <label class="form-label" for="name">
                Name
              </label>
              <input
                type="text"
                class={clsx('form-control', invalidName && 'is-invalid')}
                id="name"
                value={selectedData.name}
                onChange={(e) =>
                  setSelectedData({
                    ...selectedData,
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
                  id="color"
                  value={selectedData.color}
                  onChange={(e) =>
                    setSelectedData({
                      ...selectedData,
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
                      fill: `var(--color-${selectedData.color})`,
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
                id="description"
                value={selectedData.description}
                onChange={(e) =>
                  setSelectedData({
                    ...selectedData,
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
          {add ? `Add ${dataType}` : `Update ${dataType}`}
        </button>
        <button type="button" class="btn btn-secondary" onClick={() => setShowModal(false)}>
          Close
        </button>
      </Modal.Footer>
    </Modal>
  );
}
