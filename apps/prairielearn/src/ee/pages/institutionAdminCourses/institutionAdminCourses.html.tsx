import { useState } from 'react';
import { Button, Modal } from 'react-bootstrap';

import type { AdminCourse } from '../../../lib/client/safe-db-types.js';

export function InstitutionAdminCourses({
  courses,
  csrfToken,
}: {
  courses: AdminCourse[];
  csrfToken: string;
}) {
  const [show, setShow] = useState(false);
  const [shortName, setShortName] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submitForm = async () => {
    const requestBody = {
      __csrf_token: csrfToken,
      __action: 'add_course',
      short_name: shortName,
      title,
    };
    const resp = await fetch(window.location.pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(requestBody),
    });
    if (!resp.ok) {
      const body = await resp.json();
      setError(body.error);
      return;
    }

    // otherwise, refresh the page
    window.location.reload();
  };

  return (
    <div class="card mb-4">
      <div class="card-header bg-primary text-white d-flex align-items-center">
        Courses
        <button type="button" class="btn btn-sm btn-light ms-auto" onClick={() => setShow(true)}>
          <i class="fa fa-plus" aria-hidden="true" />
          Add course
        </button>
      </div>
      {courses.length === 0 ? (
        <div class="card-body">
          <div class="text-center text-muted">No courses</div>
        </div>
      ) : (
        <ul class="list-group list-group-flush">
          {courses.map((course) => (
            <li key={course.id} class="list-group-item">
              <a href={`/pl/course/${course.id}/course_admin`}>
                {course.short_name}: {course.title}
              </a>
            </li>
          ))}
        </ul>
      )}
      {show && (
        <Modal show={show} onHide={() => setShow(false)}>
          <Modal.Header closeButton>
            <Modal.Title>Add course</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {error && <div class="alert alert-danger">{error}</div>}
            <div class="mb-3">
              <label class="form-label" for="short_name">
                Short name
              </label>
              <input
                type="text"
                class="form-control"
                id="short_name"
                name="short_name"
                value={shortName}
                onChange={(e) => setShortName((e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="mb-3">
              <label class="form-label" for="title">
                Title
              </label>
              <input
                type="text"
                class="form-control"
                id="title"
                name="title"
                value={title}
                onChange={(e) => setTitle((e.target as HTMLInputElement).value)}
              />
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShow(false)}>
              Close
            </Button>
            <Button variant="primary" onClick={submitForm}>
              Save Changes
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </div>
  );
}

InstitutionAdminCourses.displayName = 'InstitutionAdminCourses';
