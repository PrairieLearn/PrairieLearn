import { z } from 'zod';

import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { config } from '../../lib/config.js';
import { CourseInstanceSchema, CourseSchema, type Institution } from '../../lib/db-types.js';

export const InstructorCourseSchema = z.object({
  id: CourseSchema.shape.id,
  short_name: CourseSchema.shape.short_name,
  title: CourseSchema.shape.title,
  can_open_course: z.boolean(),
  course_instances: z.array(
    z.object({
      id: CourseInstanceSchema.shape.id,
      long_name: CourseInstanceSchema.shape.long_name,
    }),
  ),
});
export type InstructorCourse = z.infer<typeof InstructorCourseSchema>;

export const StudentCourseSchema = z.object({
  id: CourseInstanceSchema.shape.id,
  course_short_name: CourseSchema.shape.short_name,
  course_title: CourseSchema.shape.title,
  long_name: CourseInstanceSchema.shape.long_name,
});
export type StudentCourse = z.infer<typeof StudentCourseSchema>;

export function Home({
  resLocals,
  instructorCourses,
  studentCourses,
  adminInstitutions,
}: {
  resLocals: Record<string, any>;
  instructorCourses: InstructorCourse[];
  studentCourses: StudentCourse[];
  adminInstitutions: Institution[];
}) {
  const { authn_provider_name } = resLocals;
  return html`
    <!doctype html>
    <html lang="en" class="h-100">
      <head>
        ${HeadContents({ resLocals })}
      </head>

      <body class="d-flex flex-column h-100">
        <header>${Navbar({ resLocals, navPage: 'home' })}</header>

        <main id="content" class="flex-grow-1">
          <h1 class="sr-only">PrairieLearn Homepage</h1>
          ${ActionsHeader()}

          <div id="content" class="container py-5">
            ${DevModeCard()} ${AdminInstitutionsCard({ adminInstitutions })}
            ${InstructorCoursesCard({ instructorCourses })}
            ${StudentCoursesCard({
              studentCourses,
              hasInstructorCourses: instructorCourses.length > 0,
              canAddCourses: authn_provider_name !== 'LTI',
            })}
          </div>
        </main>

        ${config.homepageFooterText && config.homepageFooterTextHref
          ? html`
              <footer class="footer font-weight-light text-light text-center small">
                <div class="bg-secondary p-1">
                  <a class="text-light" href="${config.homepageFooterTextHref}">
                    ${config.homepageFooterText}
                  </a>
                </div>
              </footer>
            `
          : ''}
      </body>
    </html>
  `.toString();
}

function ActionsHeader() {
  return html`
    <div class="container">
      <div class="row">
        <div class="col-md-6">
          <div class="card rounded-pill my-1">
            <div class="card-body d-flex align-items-center p-2">
              <span class="fa-stack fa-1x mr-1" aria-hidden="true">
                <i class="fas fa-circle fa-stack-2x text-secondary"></i>
                <i class="fas fa-user-graduate fa-stack-1x text-light"></i>
              </span>
              <h2 class="small p-2 font-weight-bold text-uppercase text-secondary mb-0">
                Students
              </h2>
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
              <h2 class="small p-2 font-weight-bold text-uppercase text-secondary mb-0">
                Instructors
              </h2>
              <a href="${config.urlPrefix}/request_course" class="btn btn-xs btn-outline-primary">
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
  `;
}

function DevModeCard() {
  if (!config.devMode) return '';
  return html`
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h2>Development Mode</h2>
      </div>
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

function AdminInstitutionsCard({ adminInstitutions }: { adminInstitutions: Institution[] }) {
  if (adminInstitutions.length === 0) return '';

  return html`
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h2>Institutions with admin access</h2>
      </div>
      <ul class="list-group list-group-flush">
        ${adminInstitutions.map(
          (institution) => html`
            <li class="list-group-item">
              <a href="/pl/institution/${institution.id}/admin/courses">
                ${institution.short_name}: ${institution.long_name}
              </a>
            </li>
          `,
        )}
      </ul>
    </div>
  `;
}

function InstructorCoursesCard({ instructorCourses }: { instructorCourses: InstructorCourse[] }) {
  if (instructorCourses.length === 0) return '';
  return html`
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h2>Courses with instructor access</h2>
      </div>

      <table
        class="table table-sm table-hover table-striped"
        aria-label="Courses with instructor access"
      >
        <tbody>
          ${instructorCourses.map(
            (course) => html`
              <tr>
                <td class="w-50 align-middle">
                  ${course.can_open_course
                    ? html`<a href="${config.urlPrefix}/course/${course.id}">
                        ${course.short_name}: ${course.title}
                      </a>`
                    : `${course.short_name}: ${course.title}`}
                </td>
                <td>
                  ${course.course_instances.map(
                    (course_instance) => html`
                      <a
                        class="btn btn-outline-primary btn-sm my-1"
                        href="${config.urlPrefix}/course_instance/${course_instance.id}/instructor"
                      >
                        ${course_instance.long_name}
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
  `;
}

function StudentCoursesCard({
  studentCourses,
  hasInstructorCourses,
  canAddCourses,
}: {
  studentCourses: StudentCourse[];
  hasInstructorCourses: boolean;
  canAddCourses: boolean;
}) {
  const heading = hasInstructorCourses ? 'Courses with student access' : 'Courses';
  return html`
    <div class="card mb-4">
      <div class="card-header bg-primary text-white d-flex align-items-center">
        <h2>${heading}</h2>
        ${canAddCourses
          ? html`
              <a href="${config.urlPrefix}/enroll" class="btn btn-light btn-sm ml-auto">
                <i class="fa fa-edit" aria-hidden="true"></i>
                <span class="d-none d-sm-inline">Add or remove courses</span>
              </a>
            `
          : ''}
      </div>

      ${studentCourses.length === 0
        ? hasInstructorCourses
          ? html`
              <div class="card-body">
                No courses found with student access. Courses with instructor access are found in
                the list above.
                ${canAddCourses
                  ? 'Use the "Add or remove courses" button to add a course as a student.'
                  : ''}
              </div>
            `
          : config.devMode
            ? html`
                <div class="card-body">
                  No courses loaded. Click <strong>"Load from disk"</strong> above and then click
                  <strong>"PrairieLearn"</strong> in the top left corner to come back to this page.
                </div>
              `
            : html`
                <div class="card-body">
                  No courses found.
                  ${canAddCourses ? 'Use the "Add or remove courses" button to add one.' : ''}
                </div>
              `
        : html`
            <table class="table table-sm table-hover table-striped" aria-label="${heading}">
              <tbody>
                ${studentCourses.map(
                  (courseInstance) => html`
                    <tr>
                      <td>
                        <a href="${config.urlPrefix}/course_instance/${courseInstance.id}">
                          ${courseInstance.course_short_name}: ${courseInstance.course_title},
                          ${courseInstance.long_name}
                        </a>
                      </td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          `}
    </div>
  `;
}
