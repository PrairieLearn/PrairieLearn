import { html } from '@prairielearn/html';

import type { CopyQuestionDialogData } from '../lib/question-dialogs.types.js';

import { Modal } from './Modal.js';

export function CopyQuestionModal({
  questionId,
  courseId,
  targets: questionCopyTargets,
}: CopyQuestionDialogData) {
  return Modal({
    id: 'copyQuestionModal',
    title: 'Copy question',
    formAction: questionCopyTargets.at(0)?.copy_url ?? '',
    formClass: 'js-copy-question-form',
    body:
      questionCopyTargets.length === 0
        ? html`
            <p>
              You can't copy this question because you don't have editor permissions in any courses.
              <a href="/pl/request_course">Request a course</a> if you don't have one already.
              Otherwise, contact the owner of the course you expected to have access to.
            </p>
          `
        : html`
            <p>
              This question can be copied to any course for which you have editor permissions.
              Select one of your courses to copy this question.
            </p>
            <select
              class="form-select"
              name="to_course_id"
              required
              aria-label="Destination course"
            >
              ${questionCopyTargets.map(
                (course, index) => html`
                  <option
                    value="${course.id}"
                    data-csrf-token="${course.__csrf_token}"
                    data-copy-url="${course.copy_url}"
                    ${index === 0 ? 'selected' : ''}
                  >
                    ${course.short_name}
                  </option>
                `,
              )}
            </select>
          `,
    footer: html`
      <input
        type="hidden"
        name="__csrf_token"
        value="${questionCopyTargets.at(0)?.__csrf_token ?? ''}"
      />
      <input type="hidden" name="question_id" value="${questionId}" />
      <input type="hidden" name="course_id" value="${courseId}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
      ${
        questionCopyTargets.length > 0
          ? html`
              <button type="submit" name="__action" value="copy_question" class="btn btn-primary">
                Copy question
              </button>
            `
          : ''
      }
    `,
  });
}
