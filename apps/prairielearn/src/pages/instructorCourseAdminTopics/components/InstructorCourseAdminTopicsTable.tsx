import { useState } from 'preact/compat';

import { TopicBadge } from '../../../components/TopicBadge.js';
import { TopicDescription } from '../../../components/TopicDescription.js';
import { type StaffTopic } from '../../../lib/client/safe-db-types.js';
import { type Topic } from '../../../lib/db-types.js';
import { ColorJsonSchema } from '../../../schemas/infoCourse.js';

import { type EditTopicModalState, EditTopicsModal } from './EditTopicModal.js';

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
  const [topicsState, setTopicsState] = useState<Topic[]>(topics);
  const [modalState, setModalState] = useState<EditTopicModalState>({ type: 'closed' });

  const handleCreateTopic = () => {
    setModalState({
      type: 'create',
      topic: {
        ...emptyTopic,
        // This ID won't be used on the server; it's just a temporary unique identifier.
        id: crypto.randomUUID(),
        // Pick a random initial color.
        color: ColorJsonSchema.options[Math.floor(Math.random() * ColorJsonSchema.options.length)],
      },
    });
  };

  const handleEditTopic = (topicIndex: number) => {
    setModalState({
      type: 'edit',
      topic: {
        ...topicsState[topicIndex],
        // Once a topic is edited, it is no longer implicit.
        implicit: false,
      },
    });
  };

  const handleSaveTopic = (topic: Topic) => {
    if (modalState.type === 'create') {
      setTopicsState((prevTopics) => [...prevTopics, topic]);
    } else if (modalState.type === 'edit') {
      setTopicsState((prevTopics) => prevTopics.map((t) => (t.id === topic.id ? topic : t)));
    }
    setModalState({ type: 'closed' });
  };

  const handleDeleteTopic = (deleteTopicId: string) => {
    setTopicsState((prevTopics) => prevTopics.filter((topic) => topic.id !== deleteTopicId));
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
                            onClick={() => handleEditTopic(index)}
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
                    <button class="btn btn-sm btn-ghost" type="button" onClick={handleCreateTopic}>
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
      <EditTopicsModal
        state={modalState}
        onClose={() => setModalState({ type: 'closed' })}
        onSave={handleSaveTopic}
      />
    </>
  );
}

InstructorCourseAdminTopicsTable.displayName = 'InstructorCourseAdminTopicsTable';
