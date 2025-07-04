import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { html } from '@prairielearn/html';

import { AssessmentModuleHeading } from '../../components/AssessmentModuleHeading.html.js';
import { AssessmentSetHeading } from '../../components/AssessmentSetHeading.html.js';
import { Modal } from '../../components/Modal.html.js';
import { PageLayout } from '../../components/PageLayout.html.js';
import type { CopyTarget } from '../../lib/copy-content.js';
import type { Course, CourseInstance } from '../../lib/db-types.js';
import { type AssessmentRow } from '../../models/assessment.js';
import type { QuestionForCopy } from '../../models/question.js';

function CopyCourseInstanceModal({
  course,
  courseInstance,
  courseInstanceCopyTargets,
  questionsForCopy,
}: {
  course: Course;
  courseInstance: CourseInstance;
  courseInstanceCopyTargets: CopyTarget[] | null;
  questionsForCopy: QuestionForCopy[];
}) {
  if (courseInstanceCopyTargets == null) return '';
  const questionsToCopy = questionsForCopy.filter((q) => q.should_copy).length;
  const questionsToLink = questionsForCopy.filter((q) => !q.should_copy).length;
  return Modal({
    id: 'copyCourseInstanceModal',
    title: 'Copy course instance',
    formAction: courseInstanceCopyTargets[0]?.copy_url ?? '',
    formClass: 'js-copy-course-instance-form',
    form: courseInstanceCopyTargets?.length > 0,
    body:
      courseInstanceCopyTargets.length === 0
        ? html`
            <p>
              You can't copy this course instance because you don't have editor permissions in any
              courses.
              <a href="/pl/request_course">Request a course</a> if you don't have one already.
              Otherwise, contact the owner of the course you expected to have access to.
            </p>
          `
        : html`
            <p>
              This course instance can be copied to course for which you have editor permissions.
              Select one of your courses to copy this course instance to.
            </p>
            <select class="form-select" name="to_course_id" required>
              ${courseInstanceCopyTargets.map(
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
            <hr />
            If you choose to copy this course instance to your course:
            <ul>
              <li>
                <strong>${questionsToCopy}</strong> ${questionsToCopy === 1
                  ? 'question'
                  : 'questions'}
                will be copied to your course.
              </li>
              <li>
                <strong>${questionsToLink}</strong> ${questionsToLink === 1
                  ? 'question'
                  : 'questions'}
                will be linked from ${course.short_name} for use in your course
              </li>
            </ul>
          `,
    footer: html`
      <input
        type="hidden"
        name="__csrf_token"
        value="${courseInstanceCopyTargets[0]?.__csrf_token ?? ''}"
      />
      <input type="hidden" name="course_instance_id" value="${courseInstance.id}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
      ${courseInstanceCopyTargets?.length > 0
        ? html`
            <button
              type="submit"
              name="__action"
              value="copy_course_instance"
              class="btn btn-primary"
            >
              Copy course instance
            </button>
          `
        : ''}
    `,
  });
}

export function PublicAssessments({
  resLocals,
  rows,
  course,
  courseInstance,
  courseInstanceCopyTargets,
  questionsForCopy,
}: {
  resLocals: Record<string, any>;
  rows: AssessmentRow[];
  course: Course;
  courseInstance: CourseInstance;
  courseInstanceCopyTargets: CopyTarget[] | null;
  questionsForCopy: QuestionForCopy[];
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Assessments',
    navContext: {
      type: 'public',
      page: 'assessments',
    },
    options: {
      fullWidth: false,
    },
    headContent: html`${compiledScriptTag('publicAssessmentsClient.ts')}`,
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>Assessments</h1>
          <div class="ms-auto d-flex flex-row gap-1">
            <div class="btn-group">
              <button
                class="btn btn-sm btn-outline-light"
                type="button"
                aria-label="Copy course instance"
                data-bs-toggle="modal"
                data-bs-target="#copyCourseInstanceModal"
              >
                <i class="fa fa-fw fa-clone"></i>
                <span class="d-none d-sm-inline">Copy course instance</span>
              </button>
            </div>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table table-sm table-hover">
            <thead>
              <tr>
                <th style="width: 1%"><span class="visually-hidden">Label</span></th>
                <th><span class="visually-hidden">Title</span></th>
                <th>AID</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(
                (row) => html`
                  ${row.start_new_assessment_group
                    ? html`
                        <tr>
                          <th colspan="3" scope="row">
                            ${courseInstance.assessments_group_by === 'Set'
                              ? AssessmentSetHeading({ assessment_set: row.assessment_set })
                              : AssessmentModuleHeading({
                                  assessment_module: row.assessment_module,
                                })}
                          </th>
                        </tr>
                      `
                    : ''}
                  <tr id="row-${row.id}">
                    <td class="align-middle" style="width: 1%">
                      <span class="badge color-${row.assessment_set.color}"> ${row.label} </span>
                    </td>
                    <td class="align-middle">
                      <a
                        href="/pl/public/course_instance/${courseInstance.id}/assessment/${row.id}/questions"
                        >${row.title}
                      </a>
                    </td>

                    <td class="align-middle">${row.tid}</td>
                  </tr>
                `,
              )}
            </tbody>
          </table>
        </div>
      </div>
      ${CopyCourseInstanceModal({
        course,
        courseInstance,
        courseInstanceCopyTargets,
        questionsForCopy,
      })}
    `,
  });
}
