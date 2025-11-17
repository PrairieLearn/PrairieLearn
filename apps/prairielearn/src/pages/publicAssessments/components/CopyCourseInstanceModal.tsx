import { useState } from 'preact/hooks';
import { Modal } from 'react-bootstrap';

import type { StaffCourse, StaffCourseInstance } from '../../../lib/client/safe-db-types.js';

export interface CopyTarget {
  id: string;
  short_name: string | null;
  copy_url: string;
  __csrf_token: string;
}

export function CopyCourseInstanceModal({
  course,
  courseInstance,
  courseInstanceCopyTargets,
  questionsForCopy,
  canEdit,
}: {
  course: StaffCourse;
  courseInstance: StaffCourseInstance;
  courseInstanceCopyTargets: CopyTarget[];
  questionsForCopy: { should_copy: boolean }[];
  canEdit: boolean;
}) {
  const [show, setShow] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState(courseInstanceCopyTargets[0]?.id ?? '');

  // Calculate question stats
  const questionsToCopy = questionsForCopy.filter((q) => q.should_copy).length;
  const questionsToLink = questionsForCopy.filter((q) => !q.should_copy).length;

  // Find the selected course data
  const selectedCourse = courseInstanceCopyTargets.find((c) => c.id === selectedCourseId);

  // Don't render anything if copy targets is null
  const canCopy = courseInstanceCopyTargets.length > 0;

  if (!canCopy) {
    return null;
  }

  return (
    <>
      <button
        class="btn btn-sm btn-outline-light"
        type="button"
        aria-label="Copy course instance"
        onClick={() => setShow(true)}
      >
        <i class="fa fa-clone" />
        <span class="d-none d-sm-inline">Copy course instance</span>
      </button>

      <Modal show={show} onHide={() => setShow(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Copy course instance</Modal.Title>
        </Modal.Header>
        {canEdit ? (
          <form
            method="POST"
            action={selectedCourse?.copy_url}
            id="copy-course-instance-form"
            onSubmit={() => setShow(false)}
          >
            <input type="hidden" name="__csrf_token" value={selectedCourse?.__csrf_token ?? ''} />
            <input type="hidden" name="course_instance_id" value={courseInstance.id} />

            <Modal.Body>
              <p>
                This course instance can be copied to course for which you have editor permissions.
                Select one of your courses to copy this course instance to.
              </p>
              <select
                class="form-select"
                name="to_course_id"
                aria-label="Destination course"
                value={selectedCourseId}
                required
                onChange={(e) => setSelectedCourseId((e.target as HTMLSelectElement).value)}
              >
                {courseInstanceCopyTargets.map((copyTarget) => (
                  <option key={copyTarget.id} value={copyTarget.id}>
                    {copyTarget.short_name}
                  </option>
                ))}
              </select>
              <hr />
              If you choose to copy this course instance to your course:
              <ul>
                <li>
                  <strong>{questionsToCopy}</strong>{' '}
                  {questionsToCopy === 1 ? 'question' : 'questions'} will be copied to your course.
                </li>
                <li>
                  <strong>{questionsToLink}</strong>{' '}
                  {questionsToLink === 1 ? 'question' : 'questions'} will be linked from{' '}
                  {course.short_name} for use in your course
                </li>
              </ul>
            </Modal.Body>

            <Modal.Footer>
              <button type="button" class="btn btn-secondary" onClick={() => setShow(false)}>
                Close
              </button>
              <button
                type="submit"
                name="__action"
                value="copy_course_instance"
                class="btn btn-primary"
              >
                Copy course instance
              </button>
            </Modal.Footer>
          </form>
        ) : (
          <>
            <Modal.Body>
              <p>
                You can't copy this course instance because you don't have editor permissions in any
                courses. <a href="/pl/request_course">Request a course</a> if you don't have one
                already. Otherwise, contact the owner of the course you expected to have access to.
              </p>
            </Modal.Body>
            <Modal.Footer>
              <button type="button" class="btn btn-secondary" onClick={() => setShow(false)}>
                Close
              </button>
            </Modal.Footer>
          </>
        )}
      </Modal>
    </>
  );
}

CopyCourseInstanceModal.displayName = 'CopyCourseInstanceModal';
