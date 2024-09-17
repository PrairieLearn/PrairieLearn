import { z } from 'zod';

import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';

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

          <h1>${resLocals.assessment_set.name} ${resLocals.assessment.number}: Access control</h1>

          <form>
            <!-- Published Switch -->
            <div class="form-check form-switch mb-4">
              <input class="form-check-input" type="checkbox" id="publishedSwitch" checked />
              <label class="form-check-label" for="publishedSwitch"
                >Published (Make the assessment available to students)</label
              >
            </div>

            <!-- Control Access by Dates Section -->
            <div class="container border p-2 mb-2 mx-0">
              <div class="row">
                <div class="col">
                  <div class="form-check form-switch mb-3">
                    <input
                      class="form-check-input"
                      type="checkbox"
                      id="controlAccessByDatesSwitch"
                      checked
                    />
                    <label class="form-check-label h5" for="controlAccessByDatesSwitch"
                      >Control access by dates</label
                    >
                  </div>
                </div>
              </div>

              <div id="accessByDatesSection">
                <div class="row">
                  <!-- Availability -->
                  <div class="col-6">
                    <div class="mb-3">
                      <div class="form-check d-inline-block">
                        <input
                          class="form-check-input"
                          type="checkbox"
                          id="availableSpecificDate"
                          checked
                        />
                        <label class="form-check-label" for="availableSpecificDate"
                          >Release on</label
                        >
                        <input
                          type="datetime-local"
                          id="availableDate"
                          class="form-control form-control-sm"
                          value="2024-09-20T00:01"
                        />
                      </div>
                    </div>
                  </div>

                  <!-- Due Date or No Due Date -->
                  <div class="col-6">
                    <div class="mb-3">
                      <div class="form-check d-inline-block">
                        <input
                          class="form-check-input"
                          type="checkbox"
                          id="dueDateCheckbox"
                          checked
                        />
                        <label class="form-check-label" for="dueDateCheckbox">Due date</label>
                        <input
                          type="datetime-local"
                          id="dueDateInput"
                          class="form-control form-control-sm"
                          value="2024-09-26T23:59"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div class="row">
                  <div class="col-6">
                    <!-- Early Deadlines -->
                    <div class="mb-3">
                      <div class="form-check d-inline-block">
                        <input
                          class="form-check-input"
                          type="checkbox"
                          id="dueDateCheckbox"
                          checked
                        />
                        <label class="form-check-label" for="dueDateCheckbox"
                          >Early deadlines</label
                        >

                        <ul class="list-group">
                          <li
                            class="list-group-item d-flex justify-content-between align-items-center"
                          >
                            <div class="me-3">
                              <input
                                type="datetime-local"
                                class="form-control form-control-sm"
                                placeholder="Early deadline"
                                value="2024-09-22T23:59"
                              />
                            </div>
                            <div class="me-3">
                              <input
                                type="number"
                                class="form-control form-control-sm"
                                placeholder="Credit (%)"
                                value="120"
                              />
                            </div>
                            <button class="btn btn-outline-secondary btn-sm">
                              <i class="bi bi-trash"></i>
                            </button>
                          </li>
                          <li
                            class="list-group-item d-flex justify-content-between align-items-center"
                          >
                            <button class="btn btn-outline-secondary btn-sm">
                              Add an early deadline
                            </button>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div class="col-6">
                    <!-- Late Deadlines -->
                    <div class="mb-3">
                      <div class="form-check d-inline-block">
                        <input
                          class="form-check-input"
                          type="checkbox"
                          id="dueDateCheckbox"
                          checked
                        />
                        <label class="form-check-label" for="dueDateCheckbox">Late deadlines</label>

                        <ul class="list-group">
                          <li
                            class="list-group-item d-flex justify-content-between align-items-center"
                          >
                            <div class="me-3">
                              <input
                                type="datetime-local"
                                class="form-control form-control-sm"
                                placeholder="Early deadline"
                                value="2024-09-28T23:59"
                              />
                            </div>
                            <div class="me-3">
                              <input
                                type="number"
                                class="form-control form-control-sm"
                                placeholder="Credit (%)"
                                value="50"
                              />
                            </div>
                            <button class="btn btn-outline-secondary btn-sm">
                              <i class="bi bi-trash"></i>
                            </button>
                          </li>
                          <li
                            class="list-group-item d-flex justify-content-between align-items-center"
                          >
                            <button class="btn btn-outline-secondary btn-sm">
                              Add a late deadline
                            </button>
                          </li>
                        </ul>
                      </div>
                    </div>

                    <!-- Late Credit -->
                    <div class="mb-3">
                      <div class="form-check d-inline-block">
                        <input
                          class="form-check-input"
                          type="checkbox"
                          id="dueDateCheckbox"
                          checked
                        />
                        <label class="form-check-label" for="dueDateCheckbox"
                          >Late credit after last deadline</label
                        >
                        <input type="number" class="form-control" id="lateCredit" value="30" />
                      </div>
                    </div>

                    <!-- Zero Credit Practice -->
                    <div>
                      <div class="form-check d-inline-block">
                        <input class="form-check-input" type="checkbox" id="dueDateCheckbox" />
                        <label class="form-check-label" for="dueDateCheckbox"
                          >Allow practice for zero credit after last deadline</label
                        >
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Link to PrairieTest Section -->
            <div class="container border p-2 mb-2 mx-0">
              <div class="form-check form-switch mb-3">
                <input
                  class="form-check-input"
                  type="checkbox"
                  id="linkPrairieTestSwitch"
                  checked
                />
                <label class="form-check-label h5" for="linkPrairieTestSwitch"
                  >Link to PrairieTest</label
                >
              </div>

              <ul class="list-group">
                <!-- First Exam Item -->
                <li class="list-group-item p-1">
                  <div class="d-flex justify-content-between align-items-center">
                    <select class="form-select form-select-sm w-75">
                      <option selected>Select Exam 1</option>
                      <option value="1">Exam 1</option>
                      <option value="2">Exam 2</option>
                    </select>
                    <div class="form-check ms-3">
                      <input class="form-check-input" type="checkbox" id="examReadOnly1" />
                      <label class="form-check-label" for="examReadOnly1">Read Only</label>
                    </div>
                    <div class="form-check ms-3">
                      <button class="btn btn-outline-secondary btn-sm">
                        <i class="bi bi-trash"></i>
                      </button>
                    </div>
                  </div>
                </li>

                <!-- Second Exam Item -->
                <li class="list-group-item p-1">
                  <div class="d-flex justify-content-between align-items-center">
                    <select class="form-select form-select-sm w-75">
                      <option selected>Select Exam 2</option>
                      <option value="1">Exam 1</option>
                      <option value="2">Exam 2</option>
                    </select>
                    <div class="form-check ms-3">
                      <input class="form-check-input" type="checkbox" id="examReadOnly2" checked />
                      <label class="form-check-label" for="examReadOnly2">Read Only</label>
                    </div>
                    <div class="form-check ms-3">
                      <button class="btn btn-outline-secondary btn-sm">
                        <i class="bi bi-trash"></i>
                      </button>
                    </div>
                  </div>
                </li>

                <!-- Third Exam Item -->
                <li class="list-group-item p-1">
                  <button class="btn btn-outline-secondary btn-sm">Link another exam</button>
                </li>
              </ul>
            </div>

            <!-- Other Settings Section -->
            <div class="container border p-2 mb-3 mx-0">
              <h5>Other Settings</h5>

              <div class="row">
                <div class="col-6">
                  <!-- Time limit -->
                  <div class="mb-3">
                    <div class="form-check d-inline-block">
                      <input
                        class="form-check-input"
                        type="checkbox"
                        id="dueDateCheckbox"
                        checked
                      />
                      <label class="form-check-label" for="dueDateCheckbox"
                        >Time limit (minutes)</label
                      >
                      <input type="number" class="form-control" id="lateCredit" value="90" />
                    </div>
                  </div>
                </div>

                <div class="col-6">
                  <!-- Password -->
                  <div class="mb-3">
                    <div class="form-check d-inline-block">
                      <input
                        class="form-check-input"
                        type="checkbox"
                        id="dueDateCheckbox"
                        checked
                      />
                      <label class="form-check-label" for="dueDateCheckbox"
                        >Password required for access</label
                      >
                      <input type="text" class="form-control" id="lateCredit" value="s3cr3t" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="row">
                <div class="col-6">
                  <!-- Hide questions -->
                  <div class="mb-3">
                    <div class="form-check d-inline-block">
                      <input
                        class="form-check-input"
                        type="checkbox"
                        id="dueDateCheckbox"
                        checked
                      />
                      <label class="form-check-label" for="dueDateCheckbox"
                        >Hide questions after completion</label
                      >
                    </div>
                  </div>

                  <div class="mb-3">
                    <div class="form-check d-inline-block">
                      <input
                        class="form-check-input"
                        type="checkbox"
                        id="dueDateCheckbox"
                        checked
                      />
                      <label class="form-check-label" for="dueDateCheckbox"
                        >Reveal questions after date</label
                      >
                      <input
                        type="datetime-local"
                        id="dueDateInput"
                        class="form-control form-control-sm"
                        value="2024-09-30T00:01"
                      />
                    </div>
                  </div>
                </div>

                <div class="col-6">
                  <!-- Hide score -->
                  <div class="mb-3">
                    <div class="form-check d-inline-block">
                      <input
                        class="form-check-input"
                        type="checkbox"
                        id="dueDateCheckbox"
                        checked
                      />
                      <label class="form-check-label" for="dueDateCheckbox"
                        >Hide score after completion</label
                      >
                    </div>
                  </div>

                  <div class="mb-3">
                    <div class="form-check d-inline-block">
                      <input
                        class="form-check-input"
                        type="checkbox"
                        id="dueDateCheckbox"
                        checked
                      />
                      <label class="form-check-label" for="dueDateCheckbox"
                        >Reveal score after date</label
                      >
                      <input
                        type="datetime-local"
                        id="dueDateInput"
                        class="form-control form-control-sm"
                        value="2024-09-29T00:01"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Per-student Access Rules Section -->
            <h2>Per-student overrides</h2>

            <ul class="list-group mb-3">
              <!-- First Access Rule -->
              <li class="list-group-item">
                <div class="row">
                  <!-- Applies to Column -->
                  <div class="col-5">
                    <label class="fw-bold">Students</label>
                    <ul class="list-group">
                      <li class="list-group-item p-1">John Doe</li>
                    </ul>
                  </div>
                  <!-- Access Rules Column -->
                  <div class="col-5">
                    <label class="fw-bold">Overridden values</label>
                    <ul class="list-group">
                      <li class="list-group-item p-1">Due date: 2024-10-15 23:59</li>
                      <li class="list-group-item p-1">Password: SuperS3cr3t</li>
                    </ul>
                  </div>
                  <!-- Edit/delete column -->
                  <div class="col-2 text-end">
                    <button class="btn btn-outline-secondary btn-sm">
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-secondary btn-sm">
                      <i class="bi bi-trash"></i>
                    </button>
                  </div>
                </div>
              </li>

              <!-- Second Access Rule -->
              <li class="list-group-item">
                <div class="row">
                  <!-- Applies to Column -->
                  <div class="col-5">
                    <label class="fw-bold">Students</label>
                    <ul class="list-group">
                      <li class="list-group-item p-1">Jane Smith</li>
                      <li class="list-group-item p-1">Chris Johnson</li>
                    </ul>
                  </div>
                  <!-- Access Rules Column -->
                  <div class="col-5">
                    <label class="fw-bold">Overridden values</label>
                    <ul class="list-group">
                      <li class="list-group-item p-1">Due date: 2024-10-18 23:59</li>
                    </ul>
                  </div>
                  <!-- Edit/delete column -->
                  <div class="col-2 text-end">
                    <button class="btn btn-outline-secondary btn-sm">
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-secondary btn-sm">
                      <i class="bi bi-trash"></i>
                    </button>
                  </div>
                </div>
              </li>

              <!-- Third Access Rule -->
              <li class="list-group-item">
                <button class="btn btn-outline-secondary btn-sm">
                  Add another per-student override
                </button>
              </li>
            </ul>

            <h2>Per-section overrides</h2>

            <ul class="list-group mb-3">
              <!-- First Access Rule -->
              <li class="list-group-item">
                <div class="row">
                  <!-- Applies to Column -->
                  <div class="col-5">
                    <label class="fw-bold">Sections</label>
                    <ul class="list-group">
                      <li class="list-group-item p-1">150% extended time students</li>
                    </ul>
                  </div>
                  <!-- Access Rules Column -->
                  <div class="col-5">
                    <label class="fw-bold">Overridden values</label>
                    <ul class="list-group">
                      <li class="list-group-item p-1">Time limit: 135 minutes</li>
                    </ul>
                  </div>
                  <!-- Edit/delete column -->
                  <div class="col-2 text-end">
                    <button class="btn btn-outline-secondary btn-sm">
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-outline-secondary btn-sm">
                      <i class="bi bi-trash"></i>
                    </button>
                  </div>
                </div>
              </li>

              <!-- Third Access Rule -->
              <li class="list-group-item">
                <button class="btn btn-outline-secondary btn-sm">
                  Add another per-section override
                </button>
              </li>
            </ul>
          </form>

          <h1>Legacy access rules</h1>

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
                                <a
                                  role="button"
                                  class="btn btn-xs btn-warning"
                                  tabindex="0"
                                  data-toggle="popover"
                                  data-trigger="focus"
                                  data-container="body"
                                  data-placement="auto"
                                  title="Hidden UIDs"
                                  data-content="This access rule is specific to individual students. You need permission to view student data in order to see which ones."
                                >
                                  Hidden
                                </a>
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
                                  href="${resLocals.config
                                    .ptHost}/pt/course/${access_rule.pt_course_id}/staff/exam/${access_rule.pt_exam_id}"
                                >
                                  ${access_rule.pt_course_name}: ${access_rule.pt_exam_name}
                                </a>
                              `
                            : access_rule.exam_uuid
                              ? resLocals.devMode
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
