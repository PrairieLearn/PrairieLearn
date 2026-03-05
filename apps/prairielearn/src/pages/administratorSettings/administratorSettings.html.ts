import { html, unsafeHtml } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.js';
import { config } from '../../lib/config.js';
import { isEnterprise } from '../../lib/license.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export function AdministratorSettings({ resLocals }: { resLocals: ResLocalsForPage<'plain'> }) {
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
          ${(() => {
            // Original badge styles (before PR #14295): base color as
            // background, black/white text, no visible border.
            const originalColors: Record<string, { text: string; bg: string }> = {
              red1: { text: '#000', bg: '#ffccbc' },
              red2: { text: '#000', bg: '#ff6c5c' },
              red3: { text: '#fff', bg: '#c72c1c' },
              pink1: { text: '#000', bg: '#ffbcd8' },
              pink2: { text: '#000', bg: '#fa5c98' },
              pink3: { text: '#fff', bg: '#ba1c58' },
              purple1: { text: '#000', bg: '#dcc6e0' },
              purple2: { text: '#fff', bg: '#9b59b6' },
              purple3: { text: '#fff', bg: '#5e147d' },
              blue1: { text: '#000', bg: '#39d5ff' },
              blue2: { text: '#000', bg: '#1297e0' },
              blue3: { text: '#fff', bg: '#0057a0' },
              turquoise1: { text: '#000', bg: '#5efaf7' },
              turquoise2: { text: '#000', bg: '#27cbc0' },
              turquoise3: { text: '#fff', bg: '#008b80' },
              green1: { text: '#000', bg: '#8effc1' },
              green2: { text: '#000', bg: '#2ecc71' },
              green3: { text: '#fff', bg: '#008c31' },
              yellow1: { text: '#000', bg: '#fde3a7' },
              yellow2: { text: '#000', bg: '#f5ab35' },
              yellow3: { text: '#fff', bg: '#d87400' },
              orange1: { text: '#000', bg: '#ffdcb5' },
              orange2: { text: '#000', bg: '#ff926b' },
              orange3: { text: '#fff', bg: '#c3522b' },
              brown1: { text: '#000', bg: '#f6c4a3' },
              brown2: { text: '#000', bg: '#ce9c7b' },
              brown3: { text: '#fff', bg: '#8e5c3b' },
              gray1: { text: '#000', bg: '#e0e0e0' },
              gray2: { text: '#000', bg: '#909090' },
              gray3: { text: '#fff', bg: '#505050' },
            };
            const originalBadgeStyle = (c: { text: string; bg: string }) =>
              `padding:0.35em 0.65em;font-weight:700;font-size:0.75em;border-radius:0.375rem;line-height:1;display:inline-block;color:${c.text};background-color:${c.bg};border:1px solid transparent`;
            const originalBadge = (name: string, label: string) =>
              `<span style="${originalBadgeStyle(originalColors[name])}">${label}</span>`;
            // PR #14295 styles (current master): GitHub-style tinted
            // backgrounds with colored borders.
            const oldColors: Record<string, { text: string; bg: string; border: string }> = {
              red1: { text: '#c73000', bg: '#fff0eb', border: '#ffb9a4' },
              red2: { text: '#9c0f00', bg: '#ffd3ce', border: '#ff9387' },
              red3: { text: '#5a140d', bg: '#f5bbb5', border: '#ec8176' },
              pink1: { text: '#c70053', bg: '#ffebf3', border: '#ffa4ca' },
              pink2: { text: '#95053c', bg: '#fecee0', border: '#fb89b4' },
              pink3: { text: '#540d28', bg: '#f3b2cb', border: '#ea74a1' },
              purple1: { text: '#72437b', bg: '#f4eef6', border: '#d8c0dd' },
              purple2: { text: '#472555', bg: '#e1cde9', border: '#c39cd3' },
              purple3: { text: '#2a0938', bg: '#d8a1f0', border: '#bf63e6' },
              blue1: { text: '#006f8c', bg: '#c4f2ff', border: '#7ce3ff' },
              blue2: { text: '#084465', bg: '#b5e1f9', border: '#72c6f4' },
              blue3: { text: '#002748', bg: '#96cfff', border: '#4fafff' },
              turquoise1: { text: '#047573', bg: '#cffefd', border: '#89fbf9' },
              turquoise2: { text: '#125b56', bg: '#bcf2ee', border: '#80e7e0' },
              turquoise3: { text: '#003f3a', bg: '#90fff6', border: '#48fff1' },
              green1: { text: '#00632d', bg: '#ddffec', border: '#96ffc5' },
              green2: { text: '#155c33', bg: '#bff1d4', border: '#85e4ad' },
              green3: { text: '#003f16', bg: '#90ffb7', border: '#49ff88' },
              yellow1: { text: '#906503', bg: '#fef7e5', border: '#fde09f' },
              yellow2: { text: '#805106', bg: '#fce6c2', border: '#f9ca7e' },
              yellow3: { text: '#613400', bg: '#ffd6a7', border: '#ffb55f' },
              orange1: { text: '#995000', bg: '#fff5e9', border: '#ffd3a1' },
              orange2: { text: '#a32b00', bg: '#ffded3', border: '#ffaa8b' },
              orange3: { text: '#582513', bg: '#f0cabc', border: '#e39b82' },
              brown1: { text: '#a84d10', bg: '#fcede3', border: '#f6c4a2' },
              brown2: { text: '#6c4328', bg: '#f0e1d7', border: '#ddbaa3' },
              brown3: { text: '#40291b', bg: '#e4cdbe', border: '#cfa68b' },
              gray1: { text: '#656565', bg: '#f6f6f6', border: '#d2d2d2' },
              gray2: { text: '#414141', bg: '#dedede', border: '#bababa' },
              gray3: { text: '#242424', bg: '#cbcbcb', border: '#a7a7a7' },
            };
            const badgeStyle = (c: { text: string; bg: string; border: string }) =>
              `padding:0.35em 0.65em;font-weight:700;font-size:0.75em;border-radius:0.375rem;line-height:1;display:inline-block;color:${c.text};background-color:${c.bg};border:1px solid ${c.border}`;
            const oldBadge = (name: string, label: string) =>
              `<span style="${badgeStyle(oldColors[name])}">${label}</span>`;
            // Recreate the exact badge sequence from the student's screenshot
            // in GitHub issue #14317: A3, A4, PA3, PA4, L3, L4, Q2, PQ3, PQ4.
            // Colors from the actual course HTML (student assessments page).
            const issueAssessments: [string, string][] = [
              ['A3', 'blue2'],
              ['A4', 'blue2'],
              ['PA3', 'blue1'],
              ['PA4', 'blue1'],
              ['L3', 'yellow2'],
              ['L4', 'yellow2'],
              ['Q2', 'green2'],
              ['PQ3', 'green1'],
              ['PQ4', 'green1'],
            ];
            return html`
              <h3>Assessment list comparison</h3>
              <p class="text-body-secondary">
                Recreates the badge sequence from
                <a href="https://github.com/PrairieLearn/PrairieLearn/issues/14317">#14317</a>
                to show the improvement in badge distinguishability.
              </p>
              <div class="d-flex gap-4 mb-4">
                <div>
                  <div class="text-body-secondary fw-semibold mb-2">Original (before #14295)</div>
                  <table class="table table-sm table-bordered mb-0" style="width: auto">
                    <tbody>
                      ${issueAssessments.map(
                        ([label, color]) =>
                          html`<tr>
                            <td class="align-middle" style="padding: 0.4rem 0.75rem">
                              ${unsafeHtml(originalBadge(color, label))}
                            </td>
                          </tr>`,
                      )}
                    </tbody>
                  </table>
                </div>
                <div>
                  <div class="text-body-secondary fw-semibold mb-2">Current master (#14295)</div>
                  <table class="table table-sm table-bordered mb-0" style="width: auto">
                    <tbody>
                      ${issueAssessments.map(
                        ([label, color]) =>
                          html`<tr>
                            <td class="align-middle" style="padding: 0.4rem 0.75rem">
                              ${unsafeHtml(oldBadge(color, label))}
                            </td>
                          </tr>`,
                      )}
                    </tbody>
                  </table>
                </div>
                <div>
                  <div class="text-body-secondary fw-semibold mb-2">This PR</div>
                  <table class="table table-sm table-bordered mb-0" style="width: auto">
                    <tbody>
                      ${issueAssessments.map(
                        ([label, color]) =>
                          html`<tr>
                            <td class="align-middle" style="padding: 0.4rem 0.75rem">
                              <span class="badge color-${color}">${label}</span>
                            </td>
                          </tr>`,
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <h3>Badge color comparison</h3>
              <table class="table table-sm table-bordered mb-4" style="font-size: 0.85em">
                <thead>
                  <tr>
                    <th style="width: 100px">Color</th>
                    <th>Original</th>
                    <th>Current master</th>
                    <th>This PR</th>
                  </tr>
                </thead>
                <tbody>
                  ${[
                    ['Red', ['red1', 'red2', 'red3']],
                    ['Pink', ['pink1', 'pink2', 'pink3']],
                    ['Purple', ['purple1', 'purple2', 'purple3']],
                    ['Blue', ['blue1', 'blue2', 'blue3']],
                    ['Turquoise', ['turquoise1', 'turquoise2', 'turquoise3']],
                    ['Green', ['green1', 'green2', 'green3']],
                    ['Yellow', ['yellow1', 'yellow2', 'yellow3']],
                    ['Orange', ['orange1', 'orange2', 'orange3']],
                    ['Brown', ['brown1', 'brown2', 'brown3']],
                    ['Gray', ['gray1', 'gray2', 'gray3']],
                  ].map(([label, names]) => {
                    const prettyLabel = (n: string) =>
                      n.replace(/(\d)/, ' $1').replace(/^./, (s: string) => s.toUpperCase());
                    const origBadges = (names as string[])
                      .map((n) => originalBadge(n, prettyLabel(n)))
                      .join(' ');
                    const masterBadges = (names as string[])
                      .map((n) => oldBadge(n, prettyLabel(n)))
                      .join(' ');
                    const prBadges = (names as string[])
                      .map((n) => `<span class="badge color-${n}">${prettyLabel(n)}</span>`)
                      .join(' ');
                    return html`<tr>
                      <td class="align-middle fw-semibold">${label}</td>
                      <td>${unsafeHtml(origBadges)}</td>
                      <td>${unsafeHtml(masterBadges)}</td>
                      <td>${unsafeHtml(prBadges)}</td>
                    </tr>`;
                  })}
                </tbody>
              </table>
            `;
          })()}
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
