import { useState } from 'preact/compat';

import { TopicBadgeJsx } from '../../../components/TopicBadge.html.js';
import { TopicDescriptionJsx } from '../../../components/TopicDescription.html.js';
import { type Topic } from '../../../lib/db-types.js';

import { EditTopicsModal } from './EditTopicsModal.js';

export function InstructorCourseAdminTopicsTable({
  topics,
  hasCoursePermissionEdit,
}: {
  topics: Topic[];
  hasCoursePermissionEdit: boolean;
}) {
  const [editMode, setEditMode] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>({
    color: '',
    course_id: '',
    description: '',
    id: '',
    implicit: false,
    json_comment: '',
    name: '',
    number: null,
  });
  const [topicsState, setTopicsState] = useState<Topic[]>(topics);

  const handleModalOpen = (topicIndex: number) => {
    setSelectedTopic(topicsState[topicIndex]);
    window.bootstrap.Modal.getOrCreateInstance(
      document.querySelector('#editTopicModal') as HTMLElement,
    ).show();
  };

  const handleModalClose = () => {
    window.bootstrap.Modal.getOrCreateInstance(
      document.querySelector('#editTopicModal') as HTMLElement,
    ).hide();
    setSelectedTopic(null);
  };

  const handleModalSave = () => {
    // Ensure the button loses focus to prevent Bootstrap modal issues
    const buttonElement = document.activeElement as HTMLElement;
    buttonElement.blur();
    setTopicsState((prevTopics) =>
      prevTopics.map((topic) =>
        topic.id === selectedTopic?.id ? { ...topic, ...selectedTopic } : topic,
      ),
    );
    handleModalClose();
  };

  const handleSave = () => {
    console.log('Saving topic:', selectedTopic);
  };

  return (
    <>
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>Topics</h1>
          <div class="ms-auto">
            {hasCoursePermissionEdit ? (
              !editMode ? (
                <button
                  class="btn btn-sm btn-light"
                  type="button"
                  onClick={() => setEditMode(true)}
                >
                  <i class="fa fa-edit" aria-hidden="true"></i> Edit topics
                </button>
              ) : (
                <span class="js-edit-mode-buttons">
                  <button
                    class="btn btn-sm btn-light mx-1"
                    type="button"
                    onClick={() => handleSave()}
                  >
                    <i class="fa fa-save" aria-hidden="true"></i> Save and sync
                  </button>
                  <button
                    class="btn btn-sm btn-light"
                    type="button"
                    onClick={() => window.location.reload()}
                  >
                    Cancel
                  </button>
                </span>
              )
            ) : (
              ''
            )}
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped" aria-label="Topics">
            <thead>
              <tr>
                {editMode && hasCoursePermissionEdit ? (
                  <>
                    <th></th>
                    <th></th>
                  </>
                ) : (
                  ''
                )}
                <th>Number</th>
                <th>Name</th>
                <th>Color</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {topicsState.map(function (topic, index) {
                return (
                  <tr key={topic.id}>
                    {editMode && hasCoursePermissionEdit ? (
                      <>
                        <td class="align-middle">
                          <button
                            class="btn btn-sm btn-ghost"
                            type="button"
                            onClick={() => handleModalOpen(index)}
                          >
                            <i class="fa fa-edit" aria-hidden="true"></i>
                          </button>
                        </td>
                        <td class="align-middle">
                          <button class="btn btn-sm" type="button">
                            <i class="fa fa-trash text-danger" aria-hidden="true"></i>
                          </button>
                        </td>
                      </>
                    ) : (
                      ''
                    )}
                    <td class="align-middle">{topic.number}</td>
                    <td class="align-middle">
                      <TopicBadgeJsx topic={topic} />
                    </td>
                    <td class="align-middle">{topic.color}</td>
                    <td class="align-middle">
                      <TopicDescriptionJsx topic={topic} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <EditTopicsModal
        selectedTopic={selectedTopic}
        setSelectedTopic={setSelectedTopic}
        handleModalSave={handleModalSave}
        handleModalClose={handleModalClose}
      />
    </>
  );
}

InstructorCourseAdminTopicsTable.displayName = 'InstructorCourseAdminTopicsTable';
