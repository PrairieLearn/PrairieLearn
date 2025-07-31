import { TopicBadge } from '../../../components/TopicBadge.js';
import { TopicDescription } from '../../../components/TopicDescription.js';
import { type Topic } from '../../../lib/db-types.js';

export function InstructorCourseAdminTopicsTable({ topics }: { topics: Topic[] }) {
  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h1>Topics</h1>
      </div>
      <div class="table-responsive">
        <table class="table table-sm table-hover table-striped" aria-label="Topics">
          <thead>
            <tr>
              <th>Number</th>
              <th>Name</th>
              <th>Color</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {topics.map(function (topic) {
              return (
                <tr key={topic.id}>
                  <td class="align-middle">{topic.number}</td>
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
          </tbody>
        </table>
      </div>
    </div>
  );
}

InstructorCourseAdminTopicsTable.displayName = 'InstructorCourseAdminTopicsTable';
