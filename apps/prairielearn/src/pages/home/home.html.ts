import { html } from '@prairielearn/html';
import { config } from '../../lib/config.js';
import { renderEjs } from '@prairielearn/html-ejs';
import { z } from 'zod';
import { CourseInstanceSchema, CourseSchema } from '../../lib/db-types.js';

export const InstructorCourseSchema = z.object({
  id: CourseSchema.shape.id,
  label: z.string(),
  do_link: z.boolean(),
  course_instances: z.array(
    z.object({
      id: CourseInstanceSchema.shape.id,
      label: CourseInstanceSchema.shape.long_name,
    }),
  ),
});
export type InstructorCourse = z.infer<typeof InstructorCourseSchema>;

export const StudentCourseSchema = z.object({
  id: CourseInstanceSchema.shape.id,
  label: z.string(),
});
export type StudentCourse = z.infer<typeof StudentCourseSchema>;

export function Home({
  resLocals,
  instructorCourses,
  studentCourses,
}: {
  resLocals: Record<string, any>;
  instructorCourses: InstructorCourse[];
  studentCourses: StudentCourse[];
}) {
  const { authn_provider_name } = resLocals;
  return html`
    <!doctype html>
    <html lang="en" class="h-100">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", resLocals)}
      </head>

      <body class="d-flex flex-column h-100">
        <header>
          ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", {
            ...resLocals,
            navPage: 'home',
          })}
        </header>

        <main class="flex-grow-1">
          <div class="bg-white my-0">
            <div class="container">
              <div class="row">
                <div class="col-md-6">
                  <div class="card rounded-pill my-1">
                    <div class="card-body d-flex align-items-center p-2">
                      <span class="fa-stack fa-1x mr-1" aria-hidden="true">
                        <i class="fas fa-circle fa-stack-2x text-secondary"></i>
                        <i class="fas fa-user-graduate fa-stack-1x text-light"></i>
                      </span>
                      <span class="small p-2 font-weight-bold text-uppercase text-secondary">
                        Students
                      </span>
                      <a href="${config.urlPrefix}/enroll" class="btn btn-xs btn-outline-primary">
                        Enroll course
                      </a>
                    </div>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="card rounded-pill my-1">
                    <div class="card-body d-flex align-items-center p-2">
                      <span class="fa-stack fa-1x mr-1" aria-hidden="true">
                        <i class="fas fa-circle fa-stack-2x text-secondary"></i>
                        <i class="fas fa-user-tie fa-stack-1x text-light"></i>
                      </span>
                      <span class="small p-2 font-weight-bold text-uppercase text-secondary">
                        Instructors
                      </span>
                      <a
                        href="${config.urlPrefix}/request_course"
                        class="btn btn-xs btn-outline-primary"
                      >
                        Request course
                      </a>
                      <a
                        href="https://prairielearn.readthedocs.io/en/latest"
                        class="btn btn-xs btn-outline-primary ml-2"
                      >
                        View docs
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div id="content" class="container py-5">
            ${config.devMode ? DevModeCard() : ''}
            ${instructorCourses.length > 0
              ? html`
                  <div class="card mb-4">
                    <div class="card-header bg-primary text-white">
                      Courses with instructor access
                    </div>

                    <table class="table table-sm table-hover table-striped">
                      <tbody>
                        ${instructorCourses.map(
                          (course) => html`
                            <tr>
                              <td class="w-50 align-middle">
                                ${course.do_link
                                  ? html`
                                      <a href="${config.urlPrefix}/course/${course.id}">
                                        ${course.label}
                                      </a>
                                    `
                                  : course.label}
                              </td>
                              <td>
                                ${course.course_instances.map(
                                  (course_instance) => html`
                                    <a
                                      class="btn btn-outline-primary btn-sm my-1"
                                      href="${config.urlPrefix}/course_instance/${course_instance.id}/instructor"
                                    >
                                      ${course_instance.label}
                                    </a>
                                  `,
                                )}
                              </td>
                            </tr>
                          `,
                        )}
                      </tbody>
                    </table>
                  </div>
                `
              : ''}

            <div class="card mb-4">
              <div class="card-header bg-primary text-white d-flex align-items-center">
                ${instructorCourses.length > 0 ? 'Courses with student access' : 'Courses'}
                ${authn_provider_name !== 'LTI'
                  ? html`
                      <a href="${config.urlPrefix}/enroll" class="btn btn-light btn-sm ml-auto">
                        <i class="fa fa-edit" aria-hidden="true"></i>
                        <span class="d-none d-sm-inline">Add or remove courses</span>
                      </a>
                    `
                  : ''}
              </div>

              ${studentCourses.length === 0
                ? instructorCourses.length > 0
                  ? html`
                      <div class="card-body">
                        No courses found with student access. Courses with instructor access are
                        found in the list above.
                        ${authn_provider_name !== 'LTI'
                          ? 'Use the "Add or remove courses" button to add a course as a student.'
                          : ''}
                      </div>
                    `
                  : config.devMode
                    ? html`
                        <div class="card-body">
                          No courses loaded. Click <strong>"Load from disk"</strong> above and then
                          click <strong>"PrairieLearn"</strong> in the top left corner to come back
                          to this page.
                        </div>
                      `
                    : html`
                        <div class="card-body">
                          No courses found.
                          ${authn_provider_name !== 'LTI'
                            ? 'Use the "Add or remove courses" button to add one.'
                            : ''}
                        </div>
                      `
                : html`
                    <table class="table table-sm table-hover table-striped">
                      <tbody>
                        ${studentCourses.map(
                          (course_instance) => html`
                            <tr>
                              <td>
                                <a href="${config.urlPrefix}/course_instance/${course_instance.id}">
                                  ${course_instance.label}
                                </a>
                              </td>
                            </tr>
                          `,
                        )}
                      </tbody>
                    </table>
                  `}
            </div>
          </div>
        </main>

        ${config.homepageFooterText && config.homepageFooterTextHref
          ? html`
              <footer class="footer font-weight-light text-light text-center small">
                <div class="bg-secondary p-1">
                  <a class="text-light" href="${config.homepageFooterTextHref}"
                    >${config.homepageFooterText}</a
                  >
                </div>
              </footer>
            `
          : ''}
      </body>
    </html>
  `.toString();
}

function DevModeCard() {
  return html`
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">Development Mode</div>
      <div class="card-body">
        <p>
          PrairieLearn is running in Development Mode. Click the
          <strong>"Load from disk"</strong> button above to load question and assessment definitions
          from JSON files on disk.
        </p>
        <p>
          You need to click "Load from disk" every time that a JSON file is changed on disk. Changes
          to other files (JS, HTML, etc) will be automatically loaded every time you navigate to a
          different page or if you reload the current page in your web browser.
        </p>
        <p class="mb-0">
          See the
          <a href="https://prairielearn.readthedocs.io">PrairieLearn documentation</a>
          for information on creating questions and assessments.
        </p>
      </div>
    </div>
  `;
}
