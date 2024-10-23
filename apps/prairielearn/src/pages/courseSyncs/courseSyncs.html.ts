import { filesize } from 'filesize';
import { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { escapeHtml, html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { JobStatus } from '../../components/JobStatus.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { config } from '../../lib/config.js';
import {
  type Course,
  IdSchema,
  JobSequenceSchema,
  QuestionSchema,
  UserSchema,
} from '../../lib/db-types.js';

export const ImageRowSchema = z.object({
  image: z.string(),
  questions: z.object({ id: IdSchema, qid: QuestionSchema.shape.qid }).array(),
  tag: z.string().optional(),
  imageSyncNeeded: z.boolean().optional(),
  invalid: z.boolean().optional(),
  digest: z.string().optional(),
  size: z.number().optional(),
  pushed_at: z.date().nullish(),
});
export type ImageRow = z.infer<typeof ImageRowSchema>;

export const JobSequenceRowSchema = JobSequenceSchema.extend({
  user_uid: UserSchema.shape.uid.nullable(),
});
type JobSequenceRow = z.infer<typeof JobSequenceRowSchema>;

export function CourseSyncs({
  resLocals,
  images,
  jobSequences,
}: {
  resLocals: Record<string, any>;
  images: ImageRow[];
  jobSequences: JobSequenceRow[];
}) {
  const { course, __csrf_token, urlPrefix } = resLocals;
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          <h1 class="sr-only">Course Sync</h1>
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h2>Repository status</h2>
            </div>
            <div class="table-responsive">
              <table class="table table-sm" aria-label="Repository status">
                <tbody>
                  <tr>
                    <th class="align-middle">Current commit hash</th>
                    <td colspan="2">${course.commit_hash}</td>
                  </tr>

                  <tr>
                    <th class="align-middle">Path on disk</th>
                    <td class="align-middle">${course.path}</td>
                    <td>
                      <form name="confirm-form" method="POST">
                        <input type="hidden" name="__action" value="status" />
                        <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                        <button type="submit" class="btn btn-sm btn-primary">
                          <i class="fa fa-info-circle" aria-hidden="true"></i>
                          Show server git status
                        </button>
                      </form>
                    </td>
                  </tr>
                  <tr>
                    <th class="align-middle">Remote repository</th>
                    <td class="align-middle">${course.repository}</td>
                    <td>
                      <form name="confirm-form" method="POST">
                        <input type="hidden" name="__action" value="pull" />
                        <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                        <button type="submit" class="btn btn-sm btn-primary">
                          <i class="fa fa-cloud-download-alt" aria-hidden="true"></i>
                          Pull from remote git repository
                        </button>
                      </form>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h2>Docker images</h2>
            </div>
            ${ImageTable({ images, course, urlPrefix, __csrf_token })}
          </div>

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h2>Sync job history</h2>
            </div>
            <div class="table-responsive">
              <table class="table table-sm table-hover" aria-label="Sync job history">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>User</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${jobSequences.map(
                    (jobSequence) => html`
                      <tr>
                        <td>${jobSequence.number}</td>
                        <td>
                          ${jobSequence.start_date == null
                            ? html`&mdash;`
                            : formatDate(jobSequence.start_date, course.display_timezone)}
                        </td>
                        <td>${jobSequence.description}</td>
                        <td>${jobSequence.user_uid ?? '(System)'}</td>
                        <td>${JobStatus({ status: jobSequence.status })}</td>
                        <td>
                          <a
                            href="${urlPrefix}/jobSequence/${jobSequence.id}"
                            class="btn btn-xs btn-info"
                          >
                            Details
                          </a>
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function ImageTable({
  images,
  course,
  urlPrefix,
  __csrf_token,
}: {
  images: ImageRow[];
  course: Course;
  urlPrefix: string;
  __csrf_token: string;
}) {
  if (images.length === 0) {
    return html`<div class="card-body"><em>No questions are using Docker images.</em></div>`;
  }

  return html`
    <div class="table-responsive">
      <table class="table table-sm" aria-label="Docker images">
        <thead>
          <tr>
            <th>Image name</th>
            <th>Tag</th>
            <th>Digest</th>
            <th>Image size</th>
            <th>Last sync</th>
            <th>Actions</th>
            <th>Used by</th>
          </tr>
        </thead>
        <tbody>
          ${images.map(
            (image) => html`
              <tr>
                <td>
                  <div class="d-flex flex-row align-items-center">
                    <span class="mr-2">${image.image}</span>
                    ${image.invalid
                      ? html`<span class="badge badge-danger">Invalid image name</span>`
                      : ''}
                  </div>
                </td>
                <td>${image.tag}</td>
                <td>
                  <code class="mb-0" title="${image.digest}">
                    ${(image.digest?.length ?? 0) <= 24
                      ? image.digest
                      : `${image.digest?.substring(0, 24)}...`}
                  </code>
                </td>
                <td>${image.size ? filesize(image.size) : ''}</td>
                <td>
                  ${image.imageSyncNeeded
                    ? html`<span class="text-warning">Not found in PL registry</span>`
                    : image.pushed_at
                      ? formatDate(image.pushed_at, course.display_timezone)
                      : html`&mdash;`}
                </td>
                <td>
                  ${config.cacheImageRegistry
                    ? html`
                        <form method="POST">
                          <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                          <input type="hidden" name="__action" value="syncImage" />
                          <input type="hidden" name="single_image" value="${image.image}" />
                          <button type="submit" class="btn btn-xs btn-primary">
                            <i class="fa fa-sync" aria-hidden="true"></i> Sync
                          </button>
                        </form>
                      `
                    : ''}
                </td>
                <td>
                  ${image.questions.length > 0
                    ? html`
                        ${image.questions.length} question${image.questions.length > 1 ? 's' : ''}

                        <button
                          class="btn btn-xs btn-secondary"
                          data-toggle="popover"
                          data-container="body"
                          data-html="true"
                          title="Questions using ${image.image}"
                          data-content="${escapeHtml(ListQuestionsPopover({ image, urlPrefix }))}"
                        >
                          Show
                        </button>
                      `
                    : 'No questions'}
                </td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    </div>
    ${config.cacheImageRegistry
      ? html`
          <div class="card-footer">
            <form name="confirm-form" method="POST">
              <input type="hidden" name="__action" value="syncImages" />
              <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
              <button type="submit" class="btn btn-sm btn-primary">
                <i class="fa fa-sync" aria-hidden="true"></i>
                Sync all images from Docker Hub to PrairieLearn
              </button>
            </form>
          </div>
        `
      : ''}
  `;
}

function ListQuestionsPopover({ image, urlPrefix }: { image: ImageRow; urlPrefix: string }) {
  return html`
    <div>
      <ul>
        ${image.questions
          .slice(0, 5)
          .map(
            (question) => html`
              <li><a href="${urlPrefix}/question/${question.id}">${question.qid}</a></li>
            `,
          )}
      </ul>
      ${image.questions.length > 5 ? html`and ${image.questions.length - 5} more&hellip;` : ''}
    </div>
  `;
}
