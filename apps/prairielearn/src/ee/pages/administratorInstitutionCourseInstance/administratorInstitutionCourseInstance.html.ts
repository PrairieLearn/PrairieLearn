import { type HtmlSafeString, html } from '@prairielearn/html';

import { PageLayout } from '../../../components/PageLayout.js';
import { formatMilliDollars } from '../../../lib/ai-grading-credits.js';
import { compiledScriptTag } from '../../../lib/assets.js';
import {
  type Course,
  type CourseInstance,
  type Institution,
  type PlanGrant,
} from '../../../lib/db-types.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';
import { PlanGrantsEditor } from '../../lib/billing/components/PlanGrantsEditor.js';

interface CreditPoolChange {
  id: string;
  created_at: Date;
  delta_milli_dollars: number;
  credit_after_milli_dollars: number;
  reason: string;
  user_name: string | null;
  user_uid: string | null;
}

interface BalanceTimeSeriesPoint {
  date: Date;
  balance_milli_dollars: number;
}

export function AdministratorInstitutionCourseInstance({
  institution,
  course,
  course_instance,
  planGrants,
  aiGradingEnabled,
  creditPoolChanges,
  creditPoolTimeSeries,
  resLocals,
}: {
  institution: Institution;
  course: Course;
  course_instance: CourseInstance;
  planGrants: PlanGrant[];
  aiGradingEnabled: boolean;
  creditPoolChanges: CreditPoolChange[];
  creditPoolTimeSeries: BalanceTimeSeriesPoint[];
  resLocals: ResLocalsForPage<'plain'>;
}) {
  const isDeleted = course_instance.deleted_at !== null;

  return PageLayout({
    resLocals: { ...resLocals, institution },
    pageTitle: `${course.short_name}, ${course_instance.short_name} - Institution Admin`,
    headContent: compiledScriptTag('administratorInstitutionCourseInstanceClient.ts'),
    navContext: {
      type: 'administrator_institution',
      page: 'administrator_institution',
      subPage: 'courses',
    },
    content: html`
      <nav aria-label="Breadcrumbs">
        <ol class="breadcrumb">
          <li class="breadcrumb-item">
            <a href="/pl/administrator/institution/${institution.id}/courses">Courses</a>
          </li>
          <li class="breadcrumb-item">
            <a href="/pl/administrator/institution/${institution.id}/course/${course.id}">
              ${course.short_name}: ${course.title}
            </a>
          </li>
          <li class="breadcrumb-item active" aria-current="page">
            ${course_instance.short_name ?? '—'}: ${course_instance.long_name ?? '—'}
          </li>
        </ol>
      </nav>
      ${isDeleted
        ? html`<div class="alert alert-danger" role="alert">
            <strong>This course instance has been deleted.</strong> You cannot make changes to it.
          </div>`
        : html`<p>
            <a href="/pl/course_instance/${course_instance.id}/instructor">View as instructor</a>
          </p>`}

      <h2 class="h4">Limits</h2>
      <form method="POST" class="mb-3">
        <div class="mb-3">
          <label class="form-label" for="course_instance_enrollment_limit_from_institution">
            Enrollment limit from institution
          </label>
          <input
            type="number"
            disabled
            class="form-control"
            id="course_instance_enrollment_limit_from_institution"
            value="${institution.course_instance_enrollment_limit}"
          />
          <small class="form-text text-muted">
            This limit applies to all course instances without a specific enrollment limit set.
          </small>
        </div>

        <div class="mb-3">
          <label class="form-label" for="course_instance_enrollment_limit_from_course">
            Enrollment limit from course
          </label>
          <input
            type="number"
            disabled
            class="form-control"
            id="course_instance_enrollment_limit_from_course"
            value="${course.course_instance_enrollment_limit}"
          />
          <small class="form-text text-muted">
            This limit applies to all course instances without a specific enrollment limit set.
          </small>
        </div>

        <div class="mb-3">
          <label class="form-label" for="enrollment_limit">Enrollment limit override</label>
          <input
            type="number"
            class="form-control"
            id="enrollment_limit"
            name="enrollment_limit"
            value="${course_instance.enrollment_limit}"
            ${isDeleted ? 'disabled' : ''}
          />
          <small class="form-text text-muted">
            This limit overrides any course-wide or institution-wide limits. If no override is set,
            the enrollment limit from either the course or the institution (if any) will be used.
          </small>
        </div>
        ${isDeleted
          ? ''
          : html`
              <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
              <button
                type="submit"
                name="__action"
                value="update_enrollment_limit"
                class="btn btn-primary"
              >
                Save
              </button>
            `}
      </form>

      <h2 class="h4">Plans</h2>
      ${PlanGrantsEditor({
        planGrants,
        // The basic plan is never available at the course instance level; it's only
        // used for student billing for enrollments.
        excludedPlanNames: ['basic'],
        csrfToken: resLocals.__csrf_token,
        disabled: isDeleted,
      })}
      ${aiGradingEnabled
        ? html`
            <div class="card mt-4">
              <div class="card-header bg-primary text-white">
                <h2 class="h6 mb-0">AI grading credits</h2>
              </div>
              <div class="card-body">
                ${course_instance.ai_grading_use_custom_api_keys
                  ? html`<div class="alert alert-danger" role="alert">
                      This course instance is using custom API keys. Credits are not consumed when
                      custom keys are in use.
                    </div>`
                  : html`<div class="alert alert-info" role="alert">
                      This course instance is using platform API keys. Credits are consumed for each
                      AI grading request.
                    </div>`}

                <div class="row mb-3 g-3">
                  <div class="col-md-4">
                    <div class="border rounded p-3 text-center">
                      <div class="text-muted small">Total available</div>
                      <div class="h4 mb-0">
                        ${formatMilliDollars(
                          course_instance.credit_transferable_milli_dollars +
                            course_instance.credit_non_transferable_milli_dollars,
                        )}
                      </div>
                    </div>
                  </div>
                  <div class="col-md-4">
                    <div class="border rounded p-3 text-center">
                      <div class="text-muted small">Transferable</div>
                      <div class="h5 mb-0">
                        ${formatMilliDollars(course_instance.credit_transferable_milli_dollars)}
                      </div>
                    </div>
                  </div>
                  <div class="col-md-4">
                    <div class="border rounded p-3 text-center">
                      <div class="text-muted small">Non-transferable</div>
                      <div class="h5 mb-0">
                        ${formatMilliDollars(course_instance.credit_non_transferable_milli_dollars)}
                      </div>
                    </div>
                  </div>
                </div>

                <h3 class="h6">Adjust credits</h3>
                <form method="POST" class="mb-3">
                  <div class="row g-3 align-items-end">
                    <div class="col-auto">
                      <label class="form-label" for="adjustment_action">Action</label>
                      <select
                        class="form-select"
                        id="adjustment_action"
                        name="adjustment_action"
                        ${isDeleted ? 'disabled' : ''}
                      >
                        <option value="add">Add</option>
                        <option value="deduct">Deduct</option>
                      </select>
                    </div>
                    <div class="col-auto">
                      <label class="form-label" for="amount_dollars">Amount (USD)</label>
                      <div class="input-group">
                        <span class="input-group-text">$</span>
                        <input
                          type="number"
                          class="form-control"
                          id="amount_dollars"
                          name="amount_dollars"
                          min="0.01"
                          step="0.01"
                          placeholder="0.00"
                          required
                          ${isDeleted ? 'disabled' : ''}
                        />
                      </div>
                    </div>
                    <div class="col-auto">
                      <label class="form-label" for="credit_type">Credit type</label>
                      <select
                        class="form-select"
                        id="credit_type"
                        name="credit_type"
                        ${isDeleted ? 'disabled' : ''}
                      >
                        <option value="non_transferable">Non-transferable</option>
                        <option value="transferable">Transferable</option>
                      </select>
                    </div>
                    ${isDeleted
                      ? ''
                      : html`
                          <div class="col-auto">
                            <input
                              type="hidden"
                              name="__csrf_token"
                              value="${resLocals.__csrf_token}"
                            />
                            <button
                              type="submit"
                              name="__action"
                              value="adjust_credit_pool"
                              class="btn btn-primary"
                            >
                              Apply
                            </button>
                          </div>
                        `}
                  </div>
                </form>

                ${BalanceChartHtml(creditPoolTimeSeries)}
                ${TransactionHistoryHtml(creditPoolChanges)}
              </div>
            </div>
          `
        : ''}
    `,
  });
}

function BalanceChartHtml(data: BalanceTimeSeriesPoint[]): HtmlSafeString | string {
  if (data.length < 2) return '';

  const maxBalance = Math.max(...data.map((d) => d.balance_milli_dollars));
  const chartHeight = 120;
  const chartWidth = 600;
  const padding = { top: 10, right: 10, bottom: 20, left: 50 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const yMax = maxBalance > 0 ? maxBalance : 1000;

  const points = data.map((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * innerWidth;
    const y = padding.top + innerHeight - (d.balance_milli_dollars / yMax) * innerHeight;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  const formatTimestamp = (d: Date) => `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;

  return html`
    <div class="mb-3">
      <h3 class="h6">Balance over time</h3>
      <svg
        viewBox="0 0 ${chartWidth} ${chartHeight}"
        class="w-100"
        style="max-height: 150px"
        role="img"
        aria-label="Credit balance chart"
      >
        <text
          x="${padding.left - 5}"
          y="${padding.top + 4}"
          text-anchor="end"
          font-size="9"
          fill="#6c757d"
        >
          ${formatMilliDollars(yMax)}
        </text>
        <text
          x="${padding.left - 5}"
          y="${padding.top + innerHeight + 4}"
          text-anchor="end"
          font-size="9"
          fill="#6c757d"
        >
          $0.00
        </text>
        <path d="${linePath}" fill="none" stroke="#0d6efd" stroke-width="2"></path>
        ${points.map((p) => html`<circle cx="${p.x}" cy="${p.y}" r="3" fill="#0d6efd"></circle>`)}
        <text
          x="${points[0].x}"
          y="${chartHeight - 2}"
          text-anchor="start"
          font-size="9"
          fill="#6c757d"
        >
          ${formatTimestamp(points[0].date)}
        </text>
        <text
          x="${points[points.length - 1].x}"
          y="${chartHeight - 2}"
          text-anchor="end"
          font-size="9"
          fill="#6c757d"
        >
          ${formatTimestamp(points[points.length - 1].date)}
        </text>
      </svg>
    </div>
  `;
}

function TransactionHistoryHtml(changes: CreditPoolChange[]): HtmlSafeString {
  if (changes.length === 0) return html``;

  return html`
    <h3 class="h6">Transaction history</h3>
    <div class="table-responsive border rounded overflow-hidden">
      <table class="table table-sm table-hover mb-0" aria-label="Transaction history">
        <thead>
          <tr>
            <th class="px-3 py-2">Date</th>
            <th class="px-3 py-2">Change</th>
            <th class="px-3 py-2">Balance after</th>
            <th class="px-3 py-2">Reason</th>
            <th class="px-3 py-2">User</th>
          </tr>
        </thead>
        <tbody>
          ${changes.map(
            (change) => html`
              <tr>
                <td class="align-middle px-3 py-2">${change.created_at.toLocaleString()}</td>
                <td
                  class="align-middle px-3 py-2 fw-bold ${change.delta_milli_dollars > 0
                    ? 'text-success'
                    : 'text-danger'}"
                >
                  ${change.delta_milli_dollars > 0 ? '+' : '-'}${formatMilliDollars(
                    Math.abs(change.delta_milli_dollars),
                  )}
                </td>
                <td class="align-middle px-3 py-2">
                  ${formatMilliDollars(change.credit_after_milli_dollars)}
                </td>
                <td class="align-middle px-3 py-2">${change.reason}</td>
                <td class="align-middle px-3 py-2">
                  ${change.user_name ?? change.user_uid ?? '—'}
                </td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    </div>
  `;
}
