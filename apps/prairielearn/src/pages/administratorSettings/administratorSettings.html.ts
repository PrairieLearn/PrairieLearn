import { groupBy } from 'es-toolkit';

import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.js';
import {
  AI_GRADING_MODELS,
  AI_GRADING_PROVIDER_DISPLAY_NAMES,
  DEFAULT_AI_GRADING_MODEL,
} from '../../ee/lib/ai-grading/ai-grading-models.shared.js';
import { config } from '../../lib/config.js';
import { type NewsItem } from '../../lib/db-types.js';
import { isEnterprise } from '../../lib/license.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export function AdministratorSettings({
  resLocals,
  newsItems,
}: {
  resLocals: ResLocalsForPage<'plain'>;
  newsItems: NewsItem[];
}) {
  const showAiSettings =
    isEnterprise() &&
    config.aiQuestionGenerationOpenAiApiKey &&
    config.aiQuestionGenerationOpenAiOrganization;

  return PageLayout({
    resLocals,
    pageTitle: 'Administrator Settings',
    navContext: {
      type: 'administrator',
      page: 'admin',
      subPage: 'settings',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      <h1 class="visually-hidden">Administrator Settings</h1>
      <!-- Chunk generation -->
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h2>Chunk generation</h2>
        </div>
        <div class="card-body">
          <form name="generate_chunks_form" method="POST">
            <input type="hidden" name="__action" value="generate_chunks" />
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <div class="mb-3">
              <label class="form-label" for="generateChunksCourseIds">Course IDs:</label>
              <input
                type="text"
                class="form-control"
                id="generateChunksCourseIds"
                name="course_ids"
                placeholder="1,2,3"
              />
            </div>
            <button type="submit" class="btn btn-primary">Generate</button>
          </form>
        </div>
      </div>

      <!-- Actions -->
      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h2>Actions</h2>
        </div>
        <div class="card-body">
          <form name="invalidate-question-cache-form" method="POST">
            <input type="hidden" name="__action" value="invalidate_question_cache" />
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <button id="invalidate-render-cache" type="button" class="btn btn-danger">
              Invalidate question render cache
            </button>
            <div
              id="confirm-invalidate-cache-container"
              class="confirm-invalidate-cache"
              style="display: none;"
            >
              <button id="confirm-invalidate-render-cache" type="submit" class="btn btn-danger">
                Confirm invalidate cache
              </button>
              <button id="cancel-invalidate-render-cache" type="button" class="btn btn-secondary">
                Cancel
              </button>
            </div>
          </form>
          <script>
            $(function () {
              var invalidateButton = $('#invalidate-render-cache');
              var confirmInvalidateContainer = $('#confirm-invalidate-cache-container');
              var cancelInvalidateButton = $('#cancel-invalidate-render-cache');
              invalidateButton.click(function () {
                confirmInvalidateContainer.show();
                invalidateButton.hide();
              });
              cancelInvalidateButton.click(function () {
                invalidateButton.show();
                confirmInvalidateContainer.hide();
              });
            });
          </script>
          ${config.newsFeedUrl
            ? html`
                <hr />
                <form method="POST" class="d-inline">
                  <input type="hidden" name="__action" value="sync_news_feed" />
                  <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                  <button type="submit" class="btn btn-primary">Sync news feed</button>
                </form>
              `
            : ''}
        </div>
      </div>

      ${newsItems.length > 0
        ? html`
            <div class="card mb-4">
              <div class="card-header bg-primary text-white d-flex align-items-center">
                <h2>News items</h2>
              </div>
              <div class="table-responsive">
                <table class="table table-sm table-hover table-striped" aria-label="News items">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Published</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${newsItems.map(
                      (item) => html`
                        <tr>
                          <td class="align-middle">
                            <a href="${item.link}" target="_blank" rel="noopener noreferrer">
                              ${item.title}
                            </a>
                          </td>
                          <td class="align-middle">${formatDate(item.pub_date, 'UTC')}</td>
                          <td class="align-middle">
                            ${item.managed_by === 'admin' && item.hidden_at != null
                              ? html`<span class="badge bg-secondary">Hidden by admin</span>`
                              : item.managed_by === 'sync' && item.hidden_at != null
                                ? html`<span class="badge bg-secondary">Hidden by sync</span>`
                                : html`<span class="badge bg-success">Visible</span>`}
                          </td>
                          <td class="align-middle">
                            ${item.hidden_at == null
                              ? html`
                                  <form method="POST" class="d-inline">
                                    <input type="hidden" name="__action" value="hide_news_item" />
                                    <input
                                      type="hidden"
                                      name="__csrf_token"
                                      value="${resLocals.__csrf_token}"
                                    />
                                    <input type="hidden" name="news_item_id" value="${item.id}" />
                                    <button type="submit" class="btn btn-sm btn-outline-danger">
                                      Hide
                                    </button>
                                  </form>
                                `
                              : html`
                                  <form method="POST" class="d-inline">
                                    <input type="hidden" name="__action" value="unhide_news_item" />
                                    <input
                                      type="hidden"
                                      name="__csrf_token"
                                      value="${resLocals.__csrf_token}"
                                    />
                                    <input type="hidden" name="news_item_id" value="${item.id}" />
                                    <button type="submit" class="btn btn-sm btn-outline-secondary">
                                      Unhide
                                    </button>
                                  </form>
                                `}
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          `
        : ''}
      ${showAiSettings
        ? html`
            <div class="card mb-4">
              <div class="card-header bg-primary text-white">LLM</div>
              <div class="card-body">
                <form method="POST">
                  <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                  <button class="btn btn-primary" name="__action" value="sync_context_documents">
                    Resync context documents
                  </button>

                  ${config.devMode
                    ? html`
                        <hr />
                        <p>
                          Benchmarking the AI will generate questions from a set of sample prompts
                          and ask an LLM to evaluate their quality, including comparing them to gold
                          standard implementations.
                        </p>
                        <button
                          class="btn btn-primary"
                          name="__action"
                          value="benchmark_question_generation"
                        >
                          Benchmark question generation
                        </button>
                      `
                    : ''}
                </form>
              </div>
            </div>
          `
        : ''}
      ${config.devMode
        ? html`
            <div class="card mb-4">
              <div class="card-header bg-primary text-white">
                <h2>AI grading evals</h2>
              </div>
              <div class="card-body">
                <p class="mb-3">
                  Measures, for each selected model, the
                  <strong>percentage of submission gradings a human said were correct</strong>.
                  Unsure cases count as incorrect until a reviewer resolves them.
                </p>
                <div class="accordion mb-3" id="ai-grading-eval-explanation">
                  <div class="accordion-item">
                    <h3 class="accordion-header">
                      <button
                        class="accordion-button collapsed"
                        type="button"
                        data-bs-toggle="collapse"
                        data-bs-target="#ai-grading-eval-explanation-body"
                        aria-expanded="false"
                        aria-controls="ai-grading-eval-explanation-body"
                      >
                        More details
                      </button>
                    </h3>
                    <div id="ai-grading-eval-explanation-body" class="accordion-collapse collapse">
                      <div class="accordion-body">
                        <p class="mb-1"><strong>Per-submission grading sets</strong></p>
                        <ul class="mb-3">
                          <li>
                            Each submission has a <em>correct set</em> of rubric-item selections
                            that are known to be valid gradings for it, and an
                            <em>incorrect set</em> of selections known to be invalid.
                          </li>
                          <li>
                            These sets are properties of the submission itself rather than of any
                            particular grader, so all evaluated models are scored against the same
                            sets.
                          </li>
                          <li>
                            The sets are reconstructed at the start of every run by seeding from the
                            TA grading in <code>submissions.csv</code> and replaying every CSV in
                            <code>verdicts/</code>.
                          </li>
                        </ul>
                        <p class="mb-1"><strong>Evaluation loop</strong></p>
                        <ol class="mb-3">
                          <li>Each selected model grades every submission.</li>
                          <li>
                            Each AI grading is compared to the submission's sets: a match in the
                            correct set is labeled <em>correct</em>, a match in the incorrect set is
                            labeled <em>incorrect</em>, and an unmatched grading is labeled
                            <em>unsure</em>.
                          </li>
                          <li>
                            Unsure gradings are written to an HTML form in your system temp
                            directory. The form displays each question, submission, and AI grading,
                            and asks the reviewer whether the grading is correct. Upon completing
                            the form, the reviewer exports a CSV file with all their verdicts.
                          </li>
                          <li>
                            Upload the verdicts CSV under <strong>Upload verdicts CSVs</strong>
                            below. Statistics are recomputed immediately, and the new verdicts are
                            folded into the correct and incorrect sets for every subsequent run.
                          </li>
                        </ol>
                        <p class="mb-1"><strong>Repeating runs</strong></p>
                        <ul class="mb-3">
                          <li>
                            Each additional run grows the shared sets, reducing the human annotation
                            needed by future runs (regardless of which model produced the run).
                          </li>
                          <li>
                            Re-running the same model also reveals its variability. A model whose
                            unsure count shrinks across runs is producing the same rubric-item
                            selections each time and is comparatively stable; one whose unsure count
                            persists is producing new selections each time and is comparatively
                            variable.
                          </li>
                        </ul>
                        <div class="alert alert-warning mb-0" role="alert">
                          <strong>Do not run concurrently:</strong> grading runs and verdict uploads
                          share a single local checkout of the eval repository and a single eval
                          course, so overlapping operations will fail or produce stale results.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <p class="mb-1">
                  <strong>Required in <code>config.json</code>:</strong>
                </p>
                <ul class="mb-3">
                  <li>
                    <code>aiGradingEvalRepository</code> —
                    ${config.aiGradingEvalRepository
                      ? html`<code>${config.aiGradingEvalRepository}</code>
                          <span class="text-success small ms-1">Provided</span>`
                      : html`<span class="text-danger fw-bold">Missing</span>`}
                  </li>
                  <li>
                    <code>aiGradingEvalBranch</code> —
                    ${config.aiGradingEvalBranch
                      ? html`<code>${config.aiGradingEvalBranch}</code>
                          <span class="text-success small ms-1">Provided</span>`
                      : html`<span class="text-danger fw-bold">Missing</span>`}
                  </li>
                  <li>
                    <code>serverCanonicalHost</code> (required) —
                    ${config.serverCanonicalHost
                      ? html`<code>${config.serverCanonicalHost}</code>
                          <span class="text-success small ms-1">Provided</span>`
                      : html`<span class="text-danger fw-bold">Missing</span>`}
                    <div class="text-muted small">
                      Must be reachable from the annotation packet HTML files, which are opened
                      directly off disk by reviewers — so a bare <code>localhost</code> won't work.
                      Follow
                      <a
                        href="https://docs.prairielearn.com/dev-guide/configJson/#setting-up-external-image-capture-locally"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        these instructions
                      </a>
                      to find your local IPv4 address and set
                      <code>serverCanonicalHost</code> to <code>http://&lt;your-ip&gt;:3000</code>.
                      The linked guide is written for external image capture, but the host setup it
                      walks through is the same one we need here.
                    </div>
                  </li>
                </ul>
                ${config.aiGradingEvalRepository && config.serverCanonicalHost
                  ? html`
                      <form method="POST" class="mb-3">
                        <input
                          type="hidden"
                          name="__csrf_token"
                          value="${resLocals.__csrf_token}"
                        />
                        <fieldset class="mb-3">
                          <legend class="h6">Models</legend>
                          <p class="form-text mt-0 mb-2">
                            Each selected model grades every eval. Stats are reported per model so
                            results can be compared side-by-side.
                          </p>
                          ${Object.entries(groupBy(AI_GRADING_MODELS, (m) => m.provider)).map(
                            ([provider, models]) => html`
                              <div class="mb-2">
                                <div class="text-muted small text-uppercase">
                                  ${AI_GRADING_PROVIDER_DISPLAY_NAMES[
                                    provider as keyof typeof AI_GRADING_PROVIDER_DISPLAY_NAMES
                                  ]}
                                </div>
                                ${models.map(
                                  (m) => html`
                                    <div class="form-check">
                                      <input
                                        class="form-check-input"
                                        type="checkbox"
                                        name="models"
                                        value="${m.modelId}"
                                        id="ai-grading-eval-model-${m.modelId}"
                                        ${m.modelId === DEFAULT_AI_GRADING_MODEL ? 'checked' : ''}
                                      />
                                      <label
                                        class="form-check-label"
                                        for="ai-grading-eval-model-${m.modelId}"
                                      >
                                        ${m.name}
                                        <span class="text-muted small">— ${m.sublabel}</span>
                                      </label>
                                    </div>
                                  `,
                                )}
                              </div>
                            `,
                          )}
                        </fieldset>
                        <div class="mb-3" style="max-width: 16rem;">
                          <label for="ai-grading-eval-credits" class="form-label">
                            Seed credit ($)
                          </label>
                          <input
                            type="number"
                            class="form-control"
                            id="ai-grading-eval-credits"
                            name="credit_dollars"
                            value="20"
                            min="0"
                            step="1"
                            required
                          />
                          <div class="form-text">
                            Non-transferable credit added to the eval course instance.
                          </div>
                        </div>
                        <button
                          type="submit"
                          class="btn btn-primary"
                          name="__action"
                          value="run_ai_grading_eval"
                        >
                          Run AI grading eval
                        </button>
                      </form>
                    `
                  : html`
                      <p class="text-muted">
                        Set <code>aiGradingEvalRepository</code> and
                        <code>serverCanonicalHost</code> in <code>config.json</code> to enable the
                        run action.
                      </p>
                    `}
                ${config.aiGradingEvalRepository && config.serverCanonicalHost
                  ? html`
                      <hr />
                      <h3 class="h6">Upload verdicts CSVs</h3>
                      <p class="form-text mt-0 mb-2">
                        Drop one or more exported verdicts CSV files. Each is routed to the right
                        eval directory by <code>eval_id</code>, deduplicated by content hash, then
                        committed and pushed upstream automatically.
                      </p>
                      <form method="POST" enctype="multipart/form-data" class="mb-3">
                        <input
                          type="hidden"
                          name="__csrf_token"
                          value="${resLocals.__csrf_token}"
                        />
                        <div class="mb-3">
                          <input
                            type="file"
                            class="form-control"
                            name="verdicts_files"
                            accept=".csv,text/csv"
                            multiple
                            required
                          />
                        </div>
                        <button
                          type="submit"
                          class="btn btn-primary"
                          name="__action"
                          value="upload_verdicts_csv"
                        >
                          Upload and commit
                        </button>
                      </form>
                    `
                  : ''}
                <hr />
                <form method="POST">
                  <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                  <button
                    type="submit"
                    class="btn btn-outline-danger"
                    name="__action"
                    value="delete_ai_grading_eval_courses"
                    onclick="return confirm('Delete every AI grading eval course?');"
                  >
                    Delete all eval courses
                  </button>
                </form>
              </div>
            </div>
          `
        : ''}

      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h2>Bootstrap playground</h2>
        </div>
        <div class="card-body">
          <p>
            This serves as a testing ground for custom focus styles that are meant to comply with
            stricter accessibility requirements.
          </p>
          <div class="mb-4" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <button type="button" class="btn btn-primary">Primary</button>
            <button type="button" class="btn btn-secondary">Secondary</button>
            <button type="button" class="btn btn-success">Success</button>
            <button type="button" class="btn btn-danger">Danger</button>
            <button type="button" class="btn btn-warning">Warning</button>
            <button type="button" class="btn btn-info">Info</button>
            <button type="button" class="btn btn-light">Light</button>
            <button type="button" class="btn btn-med-light">Medium Light</button>
            <button type="button" class="btn btn-dark">Dark</button>
            <button type="button" class="btn btn-link">Link</button>
          </div>
          <div class="mb-4" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <button type="button" class="btn btn-outline-primary">Primary</button>
            <button type="button" class="btn btn-outline-secondary">Secondary</button>
            <button type="button" class="btn btn-outline-success">Success</button>
            <button type="button" class="btn btn-outline-danger">Danger</button>
            <button type="button" class="btn btn-outline-warning">Warning</button>
            <button type="button" class="btn btn-outline-info">Info</button>
            <button type="button" class="btn btn-outline-dark">Dark</button>
          </div>
          <div class="mb-4 p-4 bg-dark">
            <button type="button" class="btn btn-outline-light">Light</button>
          </div>
          <h3>Custom color badges</h3>
          <div class="mb-4 d-flex flex-wrap gap-2">
            <span class="badge color-red1">Red 1</span>
            <span class="badge color-red2">Red 2</span>
            <span class="badge color-red3">Red 3</span>
            <span class="badge color-pink1">Pink 1</span>
            <span class="badge color-pink2">Pink 2</span>
            <span class="badge color-pink3">Pink 3</span>
            <span class="badge color-purple1">Purple 1</span>
            <span class="badge color-purple2">Purple 2</span>
            <span class="badge color-purple3">Purple 3</span>
            <span class="badge color-blue1">Blue 1</span>
            <span class="badge color-blue2">Blue 2</span>
            <span class="badge color-blue3">Blue 3</span>
            <span class="badge color-turquoise1">Turquoise 1</span>
            <span class="badge color-turquoise2">Turquoise 2</span>
            <span class="badge color-turquoise3">Turquoise 3</span>
            <span class="badge color-green1">Green 1</span>
            <span class="badge color-green2">Green 2</span>
            <span class="badge color-green3">Green 3</span>
            <span class="badge color-yellow1">Yellow 1</span>
            <span class="badge color-yellow2">Yellow 2</span>
            <span class="badge color-yellow3">Yellow 3</span>
            <span class="badge color-orange1">Orange 1</span>
            <span class="badge color-orange2">Orange 2</span>
            <span class="badge color-orange3">Orange 3</span>
            <span class="badge color-brown1">Brown 1</span>
            <span class="badge color-brown2">Brown 2</span>
            <span class="badge color-brown3">Brown 3</span>
            <span class="badge color-gray1">Gray 1</span>
            <span class="badge color-gray2">Gray 2</span>
            <span class="badge color-gray3">Gray 3</span>
          </div>
          <h3>Custom color badge pills</h3>
          <div class="mb-4 d-flex flex-wrap gap-2">
            <span class="badge rounded-pill color-red1">Red 1</span>
            <span class="badge rounded-pill color-red2">Red 2</span>
            <span class="badge rounded-pill color-red3">Red 3</span>
            <span class="badge rounded-pill color-pink1">Pink 1</span>
            <span class="badge rounded-pill color-pink2">Pink 2</span>
            <span class="badge rounded-pill color-pink3">Pink 3</span>
            <span class="badge rounded-pill color-purple1">Purple 1</span>
            <span class="badge rounded-pill color-purple2">Purple 2</span>
            <span class="badge rounded-pill color-purple3">Purple 3</span>
            <span class="badge rounded-pill color-blue1">Blue 1</span>
            <span class="badge rounded-pill color-blue2">Blue 2</span>
            <span class="badge rounded-pill color-blue3">Blue 3</span>
            <span class="badge rounded-pill color-turquoise1">Turquoise 1</span>
            <span class="badge rounded-pill color-turquoise2">Turquoise 2</span>
            <span class="badge rounded-pill color-turquoise3">Turquoise 3</span>
            <span class="badge rounded-pill color-green1">Green 1</span>
            <span class="badge rounded-pill color-green2">Green 2</span>
            <span class="badge rounded-pill color-green3">Green 3</span>
            <span class="badge rounded-pill color-yellow1">Yellow 1</span>
            <span class="badge rounded-pill color-yellow2">Yellow 2</span>
            <span class="badge rounded-pill color-yellow3">Yellow 3</span>
            <span class="badge rounded-pill color-orange1">Orange 1</span>
            <span class="badge rounded-pill color-orange2">Orange 2</span>
            <span class="badge rounded-pill color-orange3">Orange 3</span>
            <span class="badge rounded-pill color-brown1">Brown 1</span>
            <span class="badge rounded-pill color-brown2">Brown 2</span>
            <span class="badge rounded-pill color-brown3">Brown 3</span>
            <span class="badge rounded-pill color-gray1">Gray 1</span>
            <span class="badge rounded-pill color-gray2">Gray 2</span>
            <span class="badge rounded-pill color-gray3">Gray 3</span>
          </div>
          <h3>Clickable color badges</h3>
          <div class="mb-4 d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-badge color-red1">Red 1</button>
            <button type="button" class="btn btn-badge color-red2">Red 2</button>
            <button type="button" class="btn btn-badge color-red3">Red 3</button>
            <button type="button" class="btn btn-badge color-pink1">Pink 1</button>
            <button type="button" class="btn btn-badge color-pink2">Pink 2</button>
            <button type="button" class="btn btn-badge color-pink3">Pink 3</button>
            <button type="button" class="btn btn-badge color-purple1">Purple 1</button>
            <button type="button" class="btn btn-badge color-purple2">Purple 2</button>
            <button type="button" class="btn btn-badge color-purple3">Purple 3</button>
            <button type="button" class="btn btn-badge color-blue1">Blue 1</button>
            <button type="button" class="btn btn-badge color-blue2">Blue 2</button>
            <button type="button" class="btn btn-badge color-blue3">Blue 3</button>
            <button type="button" class="btn btn-badge color-turquoise1">Turquoise 1</button>
            <button type="button" class="btn btn-badge color-turquoise2">Turquoise 2</button>
            <button type="button" class="btn btn-badge color-turquoise3">Turquoise 3</button>
            <button type="button" class="btn btn-badge color-green1">Green 1</button>
            <button type="button" class="btn btn-badge color-green2">Green 2</button>
            <button type="button" class="btn btn-badge color-green3">Green 3</button>
            <button type="button" class="btn btn-badge color-yellow1">Yellow 1</button>
            <button type="button" class="btn btn-badge color-yellow2">Yellow 2</button>
            <button type="button" class="btn btn-badge color-yellow3">Yellow 3</button>
            <button type="button" class="btn btn-badge color-orange1">Orange 1</button>
            <button type="button" class="btn btn-badge color-orange2">Orange 2</button>
            <button type="button" class="btn btn-badge color-orange3">Orange 3</button>
            <button type="button" class="btn btn-badge color-brown1">Brown 1</button>
            <button type="button" class="btn btn-badge color-brown2">Brown 2</button>
            <button type="button" class="btn btn-badge color-brown3">Brown 3</button>
            <button type="button" class="btn btn-badge color-gray1">Gray 1</button>
            <button type="button" class="btn btn-badge color-gray2">Gray 2</button>
            <button type="button" class="btn btn-badge color-gray3">Gray 3</button>
          </div>
          <h3>Ghost button</h3>
          <p>
            This is a custom button style that's meant to be used when we don't want the full visual
            weight of a typical button. Useful for popover triggers.
          </p>
          <div>
            <button type="button" class="btn btn-xs btn-ghost">Extra small</button>
            <button type="button" class="btn btn-sm btn-ghost">Small</button>
            <button type="button" class="btn btn-ghost">Default</button>
            <button type="button" class="btn btn-lg btn-ghost">Large</button>
          </div>
        </div>
      </div>
    `,
  });
}
