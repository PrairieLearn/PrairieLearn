import { type Topic } from '../../../lib/db-types.js';

export function EditTopicsModal({
  selectedTopic,
  setSelectedTopic,
  handleModalSave,
  handleModalClose,
}: {
  selectedTopic: Topic | null;
  setSelectedTopic: (topic: Topic | null) => void;
  handleModalSave: () => void;
  handleModalClose: (e) => void;
}) {
  if (!selectedTopic) return null;

  return (
    <div
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
            <h5 class="modal-title" id="editTopicModalTitle">
              Edit Topic
            </h5>
            <button type="button" class="btn-close" onClick={handleModalClose}></button>
          </div>
          <div class="modal-body">
            <form>
              <div class="mb-3">
                <label class="form-label" htmlFor="topicName">
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
                <label class="form-label" htmlFor="topicColor">
                  Color
                </label>
                <input
                  type="text"
                  class="form-control"
                  id="topicColor"
                  value={selectedTopic.color}
                  onChange={(e) =>
                    setSelectedTopic({
                      ...selectedTopic,
                      color: (e.target as HTMLInputElement)?.value,
                    })
                  }
                />
              </div>
              <div class="mb-3">
                <label class="form-label" htmlFor="topicDescription">
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
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-primary" onClick={handleModalSave}>
              Save changes
            </button>
            <button type="button" class="btn btn-secondary" onClick={handleModalClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
