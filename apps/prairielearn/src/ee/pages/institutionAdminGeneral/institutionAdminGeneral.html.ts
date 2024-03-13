import { z } from 'zod';
import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { html, type HtmlValue } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { type PlanGrant, type Institution } from '../../../lib/db-types';
import { PlanGrantsEditor } from '../../lib/billing/components/PlanGrantsEditor.html';
import { Timezone } from '../../../lib/timezones';

export const InstitutionStatisticsSchema = z.object({
  course_count: z.number(),
  course_instance_count: z.number(),
  enrollment_count: z.number(),
});
type InstitutionStatistics = z.infer<typeof InstitutionStatisticsSchema>;

export function InstitutionAdminGeneral({
  institution,
  availableTimezones,
  statistics,
  planGrants,
  resLocals,
}: {
  institution: Institution;
  availableTimezones: Timezone[];
  statistics: InstitutionStatistics;
  planGrants: PlanGrant[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          navPage: 'institution_admin',
          pageTitle: 'General',
        })}
        ${compiledScriptTag('institutionAdminGeneralClient.ts')}
        <style>
          .card-grid {
            display: grid;
            grid-template-columns: repeat(1, 1fr);
            gap: 1rem;
          }

          @media (min-width: 768px) {
            .card-grid {
              grid-template-columns: repeat(3, 1fr);
            }
          }
        </style>
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          institution,
          navbarType: 'institution',
          navPage: 'institution_admin',
          navSubPage: 'general',
        })}
        <main class="container mb-4">
          <h2 class="h4">Statistics</h2>
          <div class="card-grid mb-3">
            ${StatisticsCard({ title: 'Courses', value: statistics.course_count })}
            ${StatisticsCard({
              title: 'Course instances',
              value: statistics.course_instance_count,
            })}
            ${StatisticsCard({ title: 'Enrollments', value: statistics.enrollment_count })}
          </div>
          <h2 class="h4">General Information</h2>
          <form method="POST" class="mb-3">
            <div class="form-group">
              <label for="short_name">Short name</label>
              <input
                type="text"
                class="form-control"
                id="short_name"
                name="short_name"
                value="${institution.short_name}"
              />
              <small id="short_name_help" class="form-text text-muted">
                Use an abbreviation or short name. E.g., "UIUC" or "Berkeley".
              </small>
            </div>
            <div class="form-group">
              <label for="long_name">Long name</label>
              <input
                type="text"
                class="form-control"
                id="long_name"
                name="long_name"
                value="${institution.long_name}"
              />
              <small id="long_name_help" class="form-text text-muted">
                Use the full name of the university. E.g., "University of Illinois
                Urbana-Champaign".
              </small>
            </div>
            <div class="form-group">
              <label for="display_timezone">Timezone</label>
              <select
                class="form-control"
                id="display_timezone"
                name="display_timezone"
                value="${institution.display_timezone}"
              >
                ${availableTimezones.map(
                  (tz) => html`
                    <option
                      value="${tz.name}"
                      ${institution.display_timezone === tz.name ? 'selected' : ''}
                    >
                      ${`${tz.utc_offset.hours ? tz.utc_offset.hours : '00'}:${
                        tz.utc_offset.minutes
                          ? tz.utc_offset.minutes > 0
                            ? tz.utc_offset.minutes
                            : tz.utc_offset.minutes * -1
                          : '00'
                      } ${tz.name}`}
                    </option>
                  `,
                )}
              </select>
              <small id="display_timezone_help" class="form-text text-muted">
                The allowable timezones are from the
                <a
                  href="https://en.wikipedia.org/wiki/List_of_tz_database_time_zones"
                  target="_blank"
                  >tz database</a
                >. It's best to use a city-based timezone that has the same times as you. E.g.,
                "America/Chicago".
              </small>
            </div>
            <div class="form-group">
              <label for="uid_regexp">UID regexp</label>
              <input
                type="text"
                class="form-control"
                id="uid_regexp"
                name="uid_regexp"
                value="${institution.uid_regexp}"
              />
              <small id="uid_regexp_help" class="form-text text-muted">
                Should match the non-username part of students' UIDs. E.g., @example\\.com$.
              </small>
            </div>
            <h2 class="h4">Limits</h2>
            <div class="form-group">
              <label for="course_instance_enrollment_limit">Course instance enrollment limit</label>
              <input
                type="number"
                class="form-control"
                id="course_instance_enrollment_limit"
                name="course_instance_enrollment_limit"
                value="${institution.course_instance_enrollment_limit}"
                required
                aria-describedby="course_instance_enrollment_limit_help"
              />
              <small id="course_instance_enrollment_limit_help" class="form-text text-muted">
                The maximum number of enrollments allowed for a single course instance. This value
                can be overridden on individual courses and course instances.
              </small>
            </div>
            <div class="form-group">
              <label for="yearly_enrollment_limit">Yearly enrollment limit</label>
              <input
                type="number"
                class="form-control"
                id="yearly_enrollment_limit"
                name="yearly_enrollment_limit"
                value="${institution.yearly_enrollment_limit}"
                required
                aria-describedby="yearly_enrollment_limit_help"
              />
              <small id="yearly_enrollment_limit_help" class="form-text text-muted">
                The maximum number of enrollments allowed per year. The limit is applied on a
                rolling basis; that is, it applies to the previous 365 days from the instant a
                student attempts to enroll.
              </small>
            </div>
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <button
              type="submit"
              name="__action"
              value="update_enrollment_limits"
              class="btn btn-primary"
            >
              Save
            </button>
          </form>

          <h2 class="h4">Plans</h2>
          ${PlanGrantsEditor({
            planGrants,
            // The basic plan is never available at the institution level; it's only
            // used for student billing for enrollments.
            excludedPlanNames: ['basic'],
            csrfToken: resLocals.__csrf_token,
          })}
        </main>
      </body>
    </html>
  `.toString();
}

function StatisticsCard({ title, value }: { title: string; value: HtmlValue }) {
  return html`
    <div class="card d-flex flex-column p-3 align-items-center">
      <span class="h4">${value}</span>
      <span class="text-muted">${title}</span>
    </div>
  `;
}
