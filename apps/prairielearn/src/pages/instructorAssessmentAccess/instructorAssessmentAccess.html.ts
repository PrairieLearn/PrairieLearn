import { z } from 'zod';

import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { config } from '../../lib/config.js';

export const AssessmentAccessRulesSchema = z.object({
  mode: z.string(),
  uids: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  credit: z.string(),
  time_limit: z.string(),
  password: z.string(),
  exam_uuid: z.string().nullable(),
  pt_course_id: z.string().nullable(),
  pt_course_name: z.string().nullable(),
  pt_exam_id: z.string().nullable(),
  pt_exam_name: z.string().nullable(),
  active: z.string(),
});
type AssessmentAccessRules = z.infer<typeof AssessmentAccessRulesSchema>;

export function InstructorAssessmentAccess({
  resLocals,
  accessRules,
}: {
  resLocals: Record<string, any>;
  accessRules: AssessmentAccessRules[];
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          ${AssessmentSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            assessment: resLocals.assessment,
            courseInstance: resLocals.course_instance,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          })}

          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              <h1>${resLocals.assessment_set.name} ${resLocals.assessment.number}: Access</h1>
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover" aria-label="Access rules">
                <thead>
                  <tr>
                    <th>Mode</th>
                    <th>UIDs</th>
                    <th>Start date</th>
                    <th>End date</th>
                    <th>Active</th>
                    <th>Credit</th>
                    <th>Time limit</th>
                    <th>Password</th>
                    <th>PrairieTest</th>
                  </tr>
                </thead>
                <tbody>
                  ${accessRules.map((access_rule) => {
                    // Only users with permission to view student data are allowed
                    // to see the list of uids associated with an access rule. Note,
                    // however, that any user with permission to view course code
                    // (or with access to the course git repository) will be able to
                    // see the list of uids, because these access rules are defined
                    // in course code. This should be changed in future, to protect
                    // student data. See https://github.com/PrairieLearn/PrairieLearn/issues/3342
                    return html`
                      <tr>
                        <td>${access_rule.mode}</td>
                        <td>
                          ${access_rule.uids === '—' ||
                          resLocals.authz_data.has_course_instance_permission_view
                            ? access_rule.uids
                            : html`
                                <button
                                  type="button"
                                  class="btn btn-xs btn-warning"
                                  data-toggle="popover"
                                  data-container="body"
                                  data-placement="auto"
                                  title="Hidden UIDs"
                                  data-content="This access rule is specific to individual students. You need permission to view student data in order to see which ones."
                                >
                                  Hidden
                                </button>
                              `}
                        </td>
                        <td>${access_rule.start_date}</td>
                        <td>${access_rule.end_date}</td>
                        <td>${access_rule.active}</td>
                        <td>${access_rule.credit}</td>
                        <td>${access_rule.time_limit}</td>
                        <td>${access_rule.password}</td>
                        <td>
                          ${access_rule.pt_exam_name
                            ? html`
                                <a
                                  href="${config.ptHost}/pt/course/${access_rule.pt_course_id}/staff/exam/${access_rule.pt_exam_id}"
                                >
                                  ${access_rule.pt_course_name}: ${access_rule.pt_exam_name}
                                </a>
                              `
                            : access_rule.exam_uuid
                              ? config.devMode
                                ? access_rule.exam_uuid
                                : html`
                                    <span class="text-danger">
                                      Exam not found: ${access_rule.exam_uuid}
                                    </span>
                                  `
                              : html`&mdash;`}
                        </td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            </div>
            <div class="card-footer">
              <small>
                Instructions on how to change the access rules can be found in the
                <a
                  href="https://prairielearn.readthedocs.io/en/latest/accessControl/"
                  target="_blank"
                  >PrairieLearn documentation</a
                >. Note that changing time limit rules does not affect assessments in progress; to
                change the time limit for these exams please visit the
                <a href="${resLocals.urlPrefix}/assessment/${resLocals.assessment.id}/instances"
                  >Students tab</a
                >.</small
              >
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
