import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.js';
import { config } from '../../lib/config.js';
import { isEnterprise } from '../../lib/license.js';
import type { UntypedResLocals } from '../../lib/res-locals.js';

export function AdministratorSettings({ resLocals }: { resLocals: UntypedResLocals }) {
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
        </div>
      </div>

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
          <h3>Custom colors</h3>
          <div class="mb-4" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
            <button type="button" class="btn color-red1">Red 1</button>
            <button type="button" class="btn color-red2">Red 2</button>
            <button type="button" class="btn color-red3">Red 3</button>
            <button type="button" class="btn color-pink1">Pink 1</button>
            <button type="button" class="btn color-pink2">Pink 2</button>
            <button type="button" class="btn color-pink3">Pink 3</button>
            <button type="button" class="btn color-purple1">Purple 1</button>
            <button type="button" class="btn color-purple2">Purple 2</button>
            <button type="button" class="btn color-purple3">Purple 3</button>
            <button type="button" class="btn color-blue1">Blue 1</button>
            <button type="button" class="btn color-blue2">Blue 2</button>
            <button type="button" class="btn color-blue3">Blue 3</button>
            <button type="button" class="btn color-turquoise1">Turquoise 1</button>
            <button type="button" class="btn color-turquoise2">Turquoise 2</button>
            <button type="button" class="btn color-turquoise3">Turquoise 3</button>
            <button type="button" class="btn color-green1">Green 1</button>
            <button type="button" class="btn color-green2">Green 2</button>
            <button type="button" class="btn color-green3">Green 3</button>
            <button type="button" class="btn color-yellow1">Yellow 1</button>
            <button type="button" class="btn color-yellow2">Yellow 2</button>
            <button type="button" class="btn color-yellow3">Yellow 3</button>
            <button type="button" class="btn color-orange1">Orange 1</button>
            <button type="button" class="btn color-orange2">Orange 2</button>
            <button type="button" class="btn color-orange3">Orange 3</button>
            <button type="button" class="btn color-brown1">Brown 1</button>
            <button type="button" class="btn color-brown2">Brown 2</button>
            <button type="button" class="btn color-brown3">Brown 3</button>
            <button type="button" class="btn color-gray1">Gray 1</button>
            <button type="button" class="btn color-gray2">Gray 2</button>
            <button type="button" class="btn color-gray3">Gray 3</button>
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
