import { useEffect, useRef } from 'preact/compat';

import { type Topic } from '../../../lib/db-types.js';
const colorOptions = [
  'red1',
  'red2',
  'red3',
  'pink1',
  'pink2',
  'pink3',
  'purple1',
  'purple2',
  'purple3',
  'blue1',
  'blue2',
  'blue3',
  'turquoise1',
  'turquoise2',
  'turquoise3',
  'green1',
  'green2',
  'green3',
  'yellow1',
  'yellow2',
  'yellow3',
  'orange1',
  'orange2',
  'orange3',
  'brown1',
  'brown2',
  'brown3',
  'gray1',
  'gray2',
  'gray3',
];

export function EditTopicsModal({
  selectedTopic,
  setSelectedTopic,
  handleModalUpdate,
  handleCloseModal,
  addTopic,
}: {
  selectedTopic: Topic | null;
  setSelectedTopic: (topic: Topic | null) => void;
  handleModalUpdate: () => void;
  handleCloseModal: () => void;
  addTopic: boolean;
}) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const modalEl = modalRef.current;
    let modalInstance: any = null;
    if (window.bootstrap && modalEl) {
      modalInstance = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    }
    if (!selectedTopic && modalInstance) {
      modalInstance.hide();
    }
    return () => {
      if (modalInstance) {
        modalInstance.hide();
      }
    };
  }, [selectedTopic]);

  return (
    <div
      ref={modalRef}
      class="modal fade"
      tabindex={-1}
      data-bs-backdrop="static"
      role="dialog"
      id="editTopicModal"
      aria-labelledby="editTopicModalTitle"
    >
      <div class="modal-dialog" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title" id="editTopicModalTitle">
              Edit Topic
            </h2>
            <button type="button" class="btn-close" aria-label="close" onClick={handleCloseModal} />
          </div>
          <div class="modal-body">
            {selectedTopic ? (
              <>
                <div class="mb-3">
                  <label class="form-label" for="topicName">
                    Name
                  </label>
                  <input
                    type="text"
                    class="form-control"
                    id="topicName"
                    value={selectedTopic.name}
                    onChange={(e) =>
                      setSelectedTopic({
                        ...selectedTopic,
                        name: (e.target as HTMLInputElement)?.value,
                      })
                    }
                  />
                </div>
                <div class="mb-3">
                  <label class="form-label" for="topicColor">
                    Color
                  </label>
                  <select
                    class="form-select"
                    id="topicColor"
                    value={selectedTopic.color ?? 'Select a color'}
                    onChange={(e) =>
                      setSelectedTopic({
                        ...selectedTopic,
                        color: (e.target as HTMLSelectElement)?.value,
                      })
                    }
                  >
                    {colorOptions.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
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
                        description: (e.target as HTMLTextAreaElement)?.value,
                      })
                    }
                  />
                </div>
              </>
            ) : null}
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-primary" onClick={handleModalUpdate}>
              {addTopic ? 'Add topic' : 'Update topic'}
            </button>
            <button type="button" class="btn btn-secondary" onClick={handleCloseModal}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
