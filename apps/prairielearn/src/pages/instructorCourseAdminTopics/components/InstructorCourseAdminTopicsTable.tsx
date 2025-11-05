import { useState } from 'preact/compat';

import { EditTagsTopicsModal } from '../../../components/EditTagsTopicsModal.js';
import { TopicBadge } from '../../../components/TopicBadge.js';
import { TopicDescription } from '../../../components/TopicDescription.js';
import { type StaffTopic } from '../../../lib/client/safe-db-types.js';
import { type Topic } from '../../../lib/db-types.js';
import { ColorJsonSchema } from '../../../schemas/infoCourse.js';

const emptyTopic: Topic = {
  color: '',
  course_id: '',
  description: '',
  id: '',
  implicit: false,
  json_comment: '',
  name: '',
  number: null,
};

export function InstructorCourseAdminTopicsTable({
  topics,
  allowEdit,
  origHash,
  csrfToken,
}: {
  topics: StaffTopic[];
  allowEdit: boolean;
  origHash: string | null;
  csrfToken: string;
}) {
  const [editMode, setEditMode] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(emptyTopic);
  const [topicsState, setTopicsState] = useState<Topic[]>(topics);
  const [addTopic, setAddTopic] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleOpenEditModal = (topicIndex: number) => {
    setAddTopic(false);
    setSelectedTopic({ ...topicsState[topicIndex], implicit: false });
    setShowModal(true);
  };

  const handleModalUpdate = () => {
    if (addTopic) {
      setTopicsState((prevTopics) => [...prevTopics, selectedTopic!]);
    } else {
      setTopicsState((prevTopics) =>
        prevTopics.map((topic) =>
          topic.id === selectedTopic?.id ? { ...topic, ...selectedTopic } : topic,
        ),
      );
    }
    setShowModal(false);
  };

  const handleDeleteTopic = (deleteTopicId: string) => {
    setTopicsState((prevTopics) => prevTopics.filter((topic) => topic.id !== deleteTopicId));
  };

  const handleNewTopic = () => {
    setAddTopic(true);
    setSelectedTopic({
      ...emptyTopic,
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
          <h1>Topics</h1>
          <div class="ms-auto">
            {allowEdit && origHash ? (
              !editMode ? (
                <button
                  class="btn btn-sm btn-light"
                  type="button"
                  onClick={() => setEditMode(true)}
                >
                  <i class="fa fa-edit" aria-hidden="true" /> Edit topics
                </button>
              ) : (
                <form method="POST">
                  <input type="hidden" name="__action" value="save_topics" />
                  <input type="hidden" name="__csrf_token" value={csrfToken} />
                  <input type="hidden" name="orig_hash" value={origHash} />
                  <input type="hidden" name="topics" value={JSON.stringify(topicsState)} />
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
          <table class="table table-sm table-hover table-striped" aria-label="Topics">
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
              {topicsState.map((topic, index) => {
                return (
                  <tr key={topic.name}>
                    {editMode && allowEdit && (
                      <td class="align-middle">
                        <div class="d-flex align-items-center">
                          <button
                            class="btn btn-sm btn-ghost"
                            type="button"
                            aria-label={`Edit topic ${topic.name}`}
                            onClick={() => handleOpenEditModal(index)}
                          >
                            <i class="fa fa-edit" aria-hidden="true" />
                          </button>
                          <button
                            class="btn btn-sm btn-ghost"
                            type="button"
                            aria-label={`Delete topic ${topic.name}`}
                            onClick={() => handleDeleteTopic(topic.id)}
                          >
                            <i class="fa fa-trash text-danger" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    )}
                    <td class="align-middle">{index + 1}</td>
                    <td class="align-middle">
                      <TopicBadge topic={topic} />
                    </td>
                    <td class="align-middle">{topic.color}</td>
                    <td class="align-middle">
                      <TopicDescription topic={topic} />
                    </td>
                  </tr>
                );
              })}
              {editMode ? (
                <tr>
                  <td colSpan={5}>
                    <button class="btn btn-sm btn-ghost" type="button" onClick={handleNewTopic}>
                      <i class="fa fa-plus" aria-hidden="true" /> New Topic
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
        selectedData={selectedTopic}
        setSelectedData={setSelectedTopic}
        dataType="topic"
        setShowModal={setShowModal}
        handleModalUpdate={handleModalUpdate}
        add={addTopic}
      />
    </>
  );
}

InstructorCourseAdminTopicsTable.displayName = 'InstructorCourseAdminTopicsTable';
